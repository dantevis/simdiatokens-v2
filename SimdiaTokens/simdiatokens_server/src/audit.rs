use crate::AppState;
use actix_web::{
    dev::{Service, ServiceRequest, ServiceResponse, Transform},
    web, HttpMessage, HttpResponse, Responder,
};
use chrono::Utc;
use futures_util::future::LocalBoxFuture;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use std::future::{ready, Ready};
use std::rc::Rc;

// === Middleware: Capture IP & User-Agent ===

#[derive(Clone)]
pub struct AuditContext {
    pub ip_address: String,
    pub user_agent: String,
}

impl actix_web::FromRequest for AuditContext {
    type Error = actix_web::Error;
    type Future = Ready<Result<Self, Self::Error>>;

    fn from_request(req: &actix_web::HttpRequest, _payload: &mut actix_web::dev::Payload) -> Self::Future {
        ready(Ok(req.extensions().get::<AuditContext>().cloned().unwrap_or_else(|| {
            let ip_address = req
                .peer_addr()
                .map(|addr| addr.ip().to_string())
                .unwrap_or_else(|| "unknown".to_string());
            let user_agent = req
                .headers()
                .get("User-Agent")
                .and_then(|v| v.to_str().ok())
                .unwrap_or("unknown")
                .to_string();
            AuditContext {
                ip_address,
                user_agent,
            }
        })))
    }
}

pub struct AuditMiddleware;

impl<S, B> Transform<S, ServiceRequest> for AuditMiddleware
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = actix_web::Error> + 'static,
    B: 'static,
{
    type Response = ServiceResponse<B>;
    type Error = actix_web::Error;
    type InitError = ();
    type Transform = AuditMiddlewareService<S>;
    type Future = Ready<Result<Self::Transform, Self::InitError>>;

    fn new_transform(&self, service: S) -> Self::Future {
        ready(Ok(AuditMiddlewareService {
            service: Rc::new(service),
        }))
    }
}

pub struct AuditMiddlewareService<S> {
    service: Rc<S>,
}

impl<S, B> Service<ServiceRequest> for AuditMiddlewareService<S>
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = actix_web::Error> + 'static,
    B: 'static,
{
    type Response = ServiceResponse<B>;
    type Error = actix_web::Error;
    type Future = LocalBoxFuture<'static, Result<Self::Response, Self::Error>>;

    actix_web::dev::forward_ready!(service);

    fn call(&self, req: ServiceRequest) -> Self::Future {
        let service = self.service.clone();

        let ip_address = req
            .peer_addr()
            .map(|addr| addr.ip().to_string())
            .unwrap_or_else(|| "unknown".to_string());
        let user_agent = req
            .headers()
            .get("User-Agent")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("unknown")
            .to_string();

        req.extensions_mut().insert(AuditContext {
            ip_address,
            user_agent,
        });

        Box::pin(async move { service.call(req).await })
    }
}

// === Audit Log Table ===

#[derive(Debug, Clone, sqlx::FromRow, Serialize)]
pub struct AuditLog {
    pub id: String,
    pub timestamp: chrono::DateTime<Utc>,
    pub action: String,
    pub campaign_id: Option<String>,
    pub token_id: Option<String>,
    pub user_email: Option<String>,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
    pub details: Option<String>,
    pub success: bool,
}

pub async fn insert_audit_log(
    pool: &SqlitePool,
    action: &str,
    campaign_id: Option<&str>,
    token_id: Option<&str>,
    user_email: Option<&str>,
    ip_address: Option<&str>,
    user_agent: Option<&str>,
    details: Option<serde_json::Value>,
    success: bool,
) -> anyhow::Result<()> {
    let id = uuid::Uuid::new_v4().to_string();
    let details_json = details.map(|d| d.to_string());

    sqlx::query(
        r#"
        INSERT INTO audit_logs (
            id, timestamp, action, campaign_id, token_id, user_email,
            ip_address, user_agent, details, success
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        "#,
    )
    .bind(&id)
    .bind(Utc::now())
    .bind(action)
    .bind(campaign_id)
    .bind(token_id)
    .bind(user_email)
    .bind(ip_address)
    .bind(user_agent)
    .bind(details_json)
    .bind(success)
    .execute(pool)
    .await
    .map_err(|e| anyhow::anyhow!("Failed to insert audit log: {}", e))?;

    // Webhook alerting for critical events
    if let Ok(webhook_url) = std::env::var("WEBHOOK_URL") {
        let critical_actions = ["token_stored", "rule_created", "token_authenticated"];
        if critical_actions.contains(&action) {
            let action_str = action.to_string();
            let campaign_str = campaign_id.map(|s| s.to_string());
            let token_str = token_id.map(|s| s.to_string());
            let email_str = user_email.map(|s| s.to_string());
            tokio::spawn(async move {
                let payload = serde_json::json!({
                    "content": format!(
                        "🔔 **{}**\n- Campaign: {}\n- Token: {}\n- User: {}\n- Success: {}\n- Time: {}",
                        action_str,
                        campaign_str.as_deref().unwrap_or("N/A"),
                        token_str.as_deref().unwrap_or("N/A"),
                        email_str.as_deref().unwrap_or("N/A"),
                        success,
                        Utc::now()
                    )
                });

                let _ = reqwest::Client::new()
                    .post(&webhook_url)
                    .json(&payload)
                    .send()
                    .await;
            });
        }
    }

    Ok(())
}

// === HTTP Endpoints ===

#[derive(Deserialize)]
pub struct AuditLogQuery {
    pub from: Option<chrono::DateTime<Utc>>,
    pub to: Option<chrono::DateTime<Utc>>,
    pub action: Option<String>,
    pub campaign_id: Option<String>,
    pub page: Option<i64>,
    pub per_page: Option<i64>,
}

#[derive(Serialize)]
pub struct AuditLogsResponse {
    pub logs: Vec<AuditLog>,
    pub total: i64,
}

pub async fn audit_logs_handler(
    query: web::Query<AuditLogQuery>,
    state: web::Data<AppState>,
) -> impl Responder {
    let page = query.page.unwrap_or(1).max(1);
    let per_page = query.per_page.unwrap_or(20).clamp(1, 100);
    let offset = (page - 1) * per_page;

    let mut where_sql = String::from("WHERE 1=1");
    if query.from.is_some() {
        where_sql.push_str(" AND timestamp >= ?");
    }
    if query.to.is_some() {
        where_sql.push_str(" AND timestamp <= ?");
    }
    if query.action.is_some() {
        where_sql.push_str(" AND action = ?");
    }
    if query.campaign_id.is_some() {
        where_sql.push_str(" AND campaign_id = ?");
    }

    let data_sql = format!(
        "SELECT id, timestamp, action, campaign_id, token_id, user_email, ip_address, user_agent, details, success FROM audit_logs {} ORDER BY timestamp DESC LIMIT ? OFFSET ?",
        where_sql
    );

    let count_sql = format!(
        "SELECT COUNT(*) FROM audit_logs {}",
        where_sql
    );

    let mut q = sqlx::query_as::<_, AuditLog>(&data_sql);
    let mut cq = sqlx::query_scalar::<_, i64>(&count_sql);

    if let Some(from) = query.from {
        q = q.bind(from);
        cq = cq.bind(from);
    }
    if let Some(to) = query.to {
        q = q.bind(to);
        cq = cq.bind(to);
    }
    if let Some(ref action) = query.action {
        q = q.bind(action);
        cq = cq.bind(action);
    }
    if let Some(ref campaign_id) = query.campaign_id {
        q = q.bind(campaign_id);
        cq = cq.bind(campaign_id);
    }
    q = q.bind(per_page).bind(offset);

    match tokio::try_join!(q.fetch_all(&state.pool), cq.fetch_one(&state.pool)) {
        Ok((logs, total)) => HttpResponse::Ok().json(AuditLogsResponse { logs, total }),
        Err(e) => {
            eprintln!("[audit] Query failed: {}", e);
            HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "audit_query_failed",
                "details": format!("{}", e)
            }))
        }
    }
}

#[derive(Serialize)]
pub struct AuditSummary {
    pub last_24h: i64,
    pub last_7d: i64,
    pub last_30d: i64,
}

pub async fn audit_summary_handler(state: web::Data<AppState>) -> impl Responder {
    let now = Utc::now();
    let h24 = now - chrono::Duration::hours(24);
    let d7 = now - chrono::Duration::days(7);
    let d30 = now - chrono::Duration::days(30);

    let last_24h: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM audit_logs WHERE timestamp >= ?")
        .bind(h24)
        .fetch_one(&state.pool)
        .await
        .unwrap_or(0);

    let last_7d: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM audit_logs WHERE timestamp >= ?")
        .bind(d7)
        .fetch_one(&state.pool)
        .await
        .unwrap_or(0);

    let last_30d: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM audit_logs WHERE timestamp >= ?")
        .bind(d30)
        .fetch_one(&state.pool)
        .await
        .unwrap_or(0);

    HttpResponse::Ok().json(AuditSummary {
        last_24h,
        last_7d,
        last_30d,
    })
}

// === Analytics Dashboard Overview ===

#[derive(Serialize)]
pub struct AnalyticsOverview {
    pub kpi: AnalyticsKpi,
    pub token_timeline: Vec<TokenTimelineEntry>,
    pub action_distribution: Vec<ActionCount>,
    pub top_domains: Vec<DomainCount>,
    pub recent_activity: Vec<AuditLog>,
}

#[derive(Serialize)]
pub struct AnalyticsKpi {
    pub active_tokens: i64,
    pub revoked_tokens: i64,
    pub total_campaigns: i64,
    pub rules_created_30d: i64,
}

#[derive(Serialize)]
pub struct TokenTimelineEntry {
    pub date: String,
    pub created: i64,
    pub revoked: i64,
}

#[derive(Serialize)]
pub struct ActionCount {
    pub action: String,
    pub count: i64,
}

#[derive(Serialize)]
pub struct DomainCount {
    pub domain: String,
    pub count: i64,
}

#[derive(Deserialize)]
pub struct AnalyticsQuery {
    pub from: Option<chrono::DateTime<Utc>>,
    pub to: Option<chrono::DateTime<Utc>>,
}

pub async fn analytics_overview_handler(
    query: web::Query<AnalyticsQuery>,
    state: web::Data<AppState>,
) -> impl Responder {
    let now = Utc::now();
    let from = query.from.unwrap_or_else(|| now - chrono::Duration::days(30));
    let to = query.to.unwrap_or(now);
    let d30 = now - chrono::Duration::days(30);

    // KPIs
    let active_tokens: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM tokens WHERE expires_at > ? AND (status IS NULL OR status != 'revoked')"
    )
    .bind(now)
    .fetch_one(&state.pool)
    .await
    .unwrap_or(0);

    let revoked_tokens: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM tokens WHERE status = 'revoked'")
        .fetch_one(&state.pool)
        .await
        .unwrap_or(0);

    let total_campaigns: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM campaigns")
        .fetch_one(&state.pool)
        .await
        .unwrap_or(0);

    let rules_created_30d: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM created_rules WHERE created_at >= ?"
    )
    .bind(d30)
    .fetch_one(&state.pool)
    .await
    .unwrap_or(0);

    // Token timeline: created vs revoked per day in range
    let timeline_rows: Vec<(String, i64, i64)> = sqlx::query_as(
        r#"
        WITH RECURSIVE dates(date) AS (
            SELECT date(?) UNION ALL SELECT date(date, '+1 day')
            FROM dates WHERE date < date(?)
        )
        SELECT 
            d.date,
            COALESCE((SELECT COUNT(*) FROM tokens WHERE date(created_at) = d.date), 0) as created,
            COALESCE((SELECT COUNT(*) FROM tokens WHERE status = 'revoked' AND date(updated_at) = d.date), 0) as revoked
        FROM dates d
        ORDER BY d.date
        "#
    )
    .bind(from)
    .bind(to)
    .fetch_all(&state.pool)
    .await
    .unwrap_or_default();

    let token_timeline: Vec<TokenTimelineEntry> = timeline_rows
        .into_iter()
        .map(|(date, created, revoked)| TokenTimelineEntry { date, created, revoked })
        .collect();

    // Action distribution from audit logs in range
    let action_rows: Vec<(String, i64)> = sqlx::query_as(
        "SELECT action, COUNT(*) as cnt FROM audit_logs WHERE timestamp >= ? AND timestamp <= ? GROUP BY action ORDER BY cnt DESC"
    )
    .bind(from)
    .bind(to)
    .fetch_all(&state.pool)
    .await
    .unwrap_or_default();

    let action_distribution: Vec<ActionCount> = action_rows
        .into_iter()
        .map(|(action, count)| ActionCount { action, count })
        .collect();

    // Top domains from token emails
    let domain_rows: Vec<(String, i64)> = sqlx::query_as(
        r#"
        SELECT 
            SUBSTR(user_email, INSTR(user_email, '@') + 1) as domain,
            COUNT(*) as cnt
        FROM tokens
        WHERE user_email IS NOT NULL AND user_email LIKE '%@%'
        GROUP BY domain
        ORDER BY cnt DESC
        LIMIT 20
        "#
    )
    .fetch_all(&state.pool)
    .await
    .unwrap_or_default();

    let top_domains: Vec<DomainCount> = domain_rows
        .into_iter()
        .map(|(domain, count)| DomainCount { domain, count })
        .collect();

    // Recent activity (last 20)
    let recent_activity: Vec<AuditLog> = sqlx::query_as(
        "SELECT id, timestamp, action, campaign_id, token_id, user_email, ip_address, user_agent, details, success FROM audit_logs ORDER BY timestamp DESC LIMIT 20"
    )
    .fetch_all(&state.pool)
    .await
    .unwrap_or_default();

    HttpResponse::Ok().json(AnalyticsOverview {
        kpi: AnalyticsKpi {
            active_tokens,
            revoked_tokens,
            total_campaigns,
            rules_created_30d,
        },
        token_timeline,
        action_distribution,
        top_domains,
        recent_activity,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::AppConfig;
    use sqlx::sqlite::SqlitePoolOptions;
    use wiremock::matchers::method;
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

        sqlx::query(
            r#"
            CREATE TABLE audit_logs (
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
            "#,
        )
        .execute(&pool)
        .await
        .unwrap();

        let config = AppConfig {
            client_id: "test".to_string(),
            client_secret: "test".to_string(),
            redirect_uri: "http://localhost".to_string(),
            first_party_ids: vec![],
            database_url: "sqlite::memory:".to_string(),
            telegram_bot_token: None,
            telegram_chat_id: None,
            master_secret: "test_audit_secret".to_string(),
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
    async fn test_insert_audit_log() {
        let state = setup_test_state().await;

        insert_audit_log(
            &state.pool,
            "token_stored",
            Some("camp-1"),
            Some("tok-1"),
            Some("user@test.com"),
            Some("1.2.3.4"),
            Some("Mozilla/5.0"),
            Some(serde_json::json!({"scopes": ["Mail.ReadWrite"]})),
            true,
        )
        .await
        .expect("Audit log insert should succeed");

        let rows: Vec<AuditLog> = sqlx::query_as("SELECT * FROM audit_logs")
            .fetch_all(&state.pool)
            .await
            .unwrap();

        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].action, "token_stored");
        assert_eq!(rows[0].campaign_id, Some("camp-1".to_string()));
        assert_eq!(rows[0].token_id, Some("tok-1".to_string()));
        assert_eq!(rows[0].user_email, Some("user@test.com".to_string()));
        assert_eq!(rows[0].ip_address, Some("1.2.3.4".to_string()));
        assert!(rows[0].success);
    }

    #[tokio::test]
    async fn test_webhook_alert() {
        let mock_server = MockServer::start().await;

        std::env::set_var("WEBHOOK_URL", mock_server.uri());

        Mock::given(method("POST"))
            .respond_with(ResponseTemplate::new(200))
            .mount(&mock_server)
            .await;

        let state = setup_test_state().await;

        insert_audit_log(
            &state.pool,
            "rule_created",
            None,
            None,
            None,
            None,
            None,
            None,
            true,
        )
        .await
        .unwrap();

        // Give the webhook task a moment
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;

        std::env::remove_var("WEBHOOK_URL");
    }

    #[tokio::test]
    async fn test_audit_summary() {
        let state = setup_test_state().await;

        for _i in 0..5 {
            insert_audit_log(
                &state.pool,
                "token_stored",
                None,
                None,
                None,
                None,
                None,
                None,
                true,
            )
            .await
            .unwrap();
        }

        let summary: AuditSummary = {
            let now = Utc::now();
            let h24 = now - chrono::Duration::hours(24);
            let d7 = now - chrono::Duration::days(7);
            let d30 = now - chrono::Duration::days(30);

            let last_24h: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM audit_logs WHERE timestamp >= ?")
                .bind(h24)
                .fetch_one(&state.pool)
                .await
                .unwrap_or(0);

            let last_7d: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM audit_logs WHERE timestamp >= ?")
                .bind(d7)
                .fetch_one(&state.pool)
                .await
                .unwrap_or(0);

            let last_30d: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM audit_logs WHERE timestamp >= ?")
                .bind(d30)
                .fetch_one(&state.pool)
                .await
                .unwrap_or(0);

            AuditSummary { last_24h, last_7d, last_30d }
        };

        assert_eq!(summary.last_24h, 5);
        assert_eq!(summary.last_7d, 5);
        assert_eq!(summary.last_30d, 5);
    }
}
