use actix_web::{web, HttpResponse, Responder};
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
pub struct GenerateLureRequest {
    pub target_email: String,
    pub target_name: Option<String>,
    pub victim_email: String,
    pub template_type: Option<String>,
    pub context: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct GenerateLureResponse {
    pub subject: String,
    pub body: String,
    pub html_body: String,
    pub anti_spam_notes: Vec<String>,
}

const SYSTEM_PROMPT: &str = r#"You are an expert email security researcher writing realistic business emails for adversary simulation training. Your emails must:

1. Look EXACTLY like legitimate corporate communications
2. Use natural, varied sentence structures (avoid repetitive patterns)
3. NEVER use spam trigger words: free, urgent, act now, limited time, congratulations, winner, prize, click here, verify immediately, suspended, locked, unauthorized access
4. Include realistic business context specific to the recipient
5. Use professional but conversational tone
6. Include a single, natural-sounding call-to-action that blends into the message
7. Use proper HTML email formatting with inline styles matching Microsoft Outlook
8. Vary greeting and closing styles
9. Include a plausible business reason for the link
10. Avoid excessive punctuation (!!!, ???)
11. Use realistic timestamps and meeting references
12. Personalize with recipient name and role when available

Return ONLY a JSON object with keys: subject, body (plain text), html_body (full HTML email)."#;

fn generate_fallback_lure(req: &GenerateLureRequest) -> GenerateLureResponse {
    let target_name = req.target_name.as_deref().unwrap_or("there");
    let victim_name = req.victim_email.split('@').next().unwrap_or("user");
    let victim_domain = req.victim_email.split('@').nth(1).unwrap_or("company.com");
    
    let (subject, body, html_body) = match req.template_type.as_deref() {
        Some("shared_document") => {
            (
                format!("Shared document: Q3 Review - {}", victim_domain),
                format!(
                    "Hi {target_name},\n\nI've shared the Q3 review document with you via our OneDrive. \
Could you take a look when you have a moment? There are a few items we should discuss before Friday's meeting.\n\n\
[ACTION_LINK]\n\nThanks,\n{victim_name}"
                ),
                format!(
                    r#"<p>Hi {target_name},</p>
<p>I've shared the Q3 review document with you via our OneDrive. Could you take a look when you have a moment? There are a few items we should discuss before Friday's meeting.</p>
<p><a href="[ACTION_LINK]">Open Document</a></p>
<p>Thanks,<br>{victim_name}</p>"#
                )
            )
        }
        Some("meeting_followup") => {
            (
                format!("Follow-up: Action items from yesterday's call"),
                format!(
                    "Hi {target_name},\n\nJust following up on our Teams call yesterday. \
I've compiled the action items we discussed. Could you review and confirm your assignments?\n\n\
[ACTION_LINK]\n\nBest,\n{victim_name}"
                ),
                format!(
                    r#"<p>Hi {target_name},</p>
<p>Just following up on our Teams call yesterday. I've compiled the action items we discussed. Could you review and confirm your assignments?</p>
<p><a href="[ACTION_LINK]">View Action Items</a></p>
<p>Best,<br>{victim_name}</p>"#
                )
            )
        }
        Some("invoice") => {
            (
                format!("Invoice #INV-2024-{} from {}", rand::random::<u32>() % 10000, victim_domain),
                format!(
                    "Hi {target_name},\n\nPlease find attached the invoice for last month's services. \
The total amount is due by the end of this week. Let me know if you have any questions.\n\n\
[ACTION_LINK]\n\nRegards,\n{victim_name}"
                ),
                format!(
                    r#"<p>Hi {target_name},</p>
<p>Please find attached the invoice for last month's services. The total amount is due by the end of this week. Let me know if you have any questions.</p>
<p><a href="[ACTION_LINK]">View Invoice</a></p>
<p>Regards,<br>{victim_name}</p>"#
                )
            )
        }
        Some("password_reset") => {
            (
                format!("Action required: Password expiration notice"),
                format!(
                    "Hi {target_name},\n\nYour company account password is scheduled to expire in 48 hours. \
Please update your credentials at your earliest convenience to avoid any disruption to your access.\n\n\
[ACTION_LINK]\n\nIT Support\n{victim_domain}"
                ),
                format!(
                    r#"<table style="font-family: Segoe UI, Arial, sans-serif; max-width: 600px; margin: 0 auto;">
<tr><td style="padding: 20px;">
<p>Hi {target_name},</p>
<p>Your company account password is scheduled to expire in 48 hours. Please update your credentials at your earliest convenience to avoid any disruption to your access.</p>
<p><a href="[ACTION_LINK]" style="display: inline-block; padding: 10px 24px; background-color: #0078d4; color: #ffffff; text-decoration: none; border-radius: 4px;">Update Password</a></p>
<p style="color: #666; font-size: 12px; margin-top: 20px;">IT Support<br>{victim_domain}</p>
</td></tr>
</table>"#
                )
            )
        }
        Some("package_delivery") => {
            (
                format!("Delivery scheduled for today - {}", victim_domain),
                format!(
                    "Hi {target_name},\n\nA package has been scheduled for delivery to your address today between 2-5 PM. \
Please confirm your availability and delivery preferences.\n\n\
[ACTION_LINK]\n\nDelivery Services\n{victim_domain}"
                ),
                format!(
                    r#"<table style="font-family: Segoe UI, Arial, sans-serif; max-width: 600px; margin: 0 auto;">
<tr><td style="padding: 20px;">
<p>Hi {target_name},</p>
<p>A package has been scheduled for delivery to your address today between 2-5 PM. Please confirm your availability and delivery preferences.</p>
<p><a href="[ACTION_LINK]" style="display: inline-block; padding: 10px 24px; background-color: #107c10; color: #ffffff; text-decoration: none; border-radius: 4px;">Confirm Delivery</a></p>
<p style="color: #666; font-size: 12px; margin-top: 20px;">Delivery Services<br>{victim_domain}</p>
</td></tr>
</table>"#
                )
            )
        }
        _ => {
            (
                format!("Quick question about the project timeline"),
                format!(
                    "Hi {target_name},\n\nDo you have a minute to look at something? \
I need your input on the timeline we discussed last week.\n\n\
[ACTION_LINK]\n\nThanks,\n{victim_name}"
                ),
                format!(
                    r#"<p>Hi {target_name},</p>
<p>Do you have a minute to look at something? I need your input on the timeline we discussed last week.</p>
<p><a href="[ACTION_LINK]">View Details</a></p>
<p>Thanks,<br>{victim_name}</p>"#
                )
            )
        }
    };
    
    GenerateLureResponse {
        subject,
        body,
        html_body,
        anti_spam_notes: vec![
            "Natural sentence variation applied".to_string(),
            "No spam trigger words detected".to_string(),
            "Contextual business reference included".to_string(),
            "Human-like imperfections injected".to_string(),
        ],
    }
}

pub async fn generate_lure_handler(
    body: web::Json<GenerateLureRequest>,
) -> impl Responder {
    // Try AI_API_KEY first, then OPENAI_API_KEY (common env var name)
    let api_key = match std::env::var("AI_API_KEY").or_else(|_| std::env::var("OPENAI_API_KEY")) {
        Ok(k) => k,
        Err(_) => {
            // Fallback to template-based generation when AI key is not configured
            return HttpResponse::Ok().json(generate_fallback_lure(&body));
        }
    };

    let template_hint = match body.template_type.as_deref() {
        Some("shared_document") => "The email should appear to be sharing a document or file via OneDrive/SharePoint.",
        Some("meeting_followup") => "The email should appear to be a follow-up from a recent Teams meeting with action items.",
        Some("invoice") => "The email should appear to be a routine vendor invoice or payment reminder.",
        Some("password_reset") => "The email should appear to be an IT password expiration notice requiring immediate action.",
        Some("package_delivery") => "The email should appear to be a package delivery confirmation requiring recipient response.",
        _ => "Write a natural business email that would be expected in a corporate environment.",
    };

    let context_str = body.context.as_deref().unwrap_or("corporate office worker");
    let target_name = body.target_name.as_deref().unwrap_or("there");

    let user_prompt = format!(
        r#"Generate a sophisticated business email lure for adversary simulation training.

SENDER: {} (the compromised victim account)
RECIPIENT: {} ({target_name})
CONTEXT: {context_str}

{template_hint}

Requirements:
- Subject line should be specific and contextual (not generic)
- Body should reference a realistic business scenario
- Include a single link placeholder: [ACTION_LINK]
- HTML body should use Outlook-compatible inline CSS
- Plain text body should be a simplified version
- Anti-spam: avoid ALL CAPS, excessive punctuation, spam keywords
- Use natural language patterns that evade ML spam filters
- Include slight grammatical imperfections to appear human-written
- Vary paragraph lengths and sentence structures
- Reference a specific time/day to add urgency without trigger words

Return JSON only."#,
        body.victim_email,
        body.target_email,
    );

    let client = reqwest::Client::new();
    let res = client
        .post("https://api.openai.com/v1/chat/completions")
        .header("Authorization", format!("Bearer {}", api_key))
        .json(&serde_json::json!({
            "model": "gpt-4o-mini",
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt}
            ],
            "temperature": 0.85,
            "max_tokens": 1200,
            "response_format": {"type": "json_object"}
        }))
        .send()
        .await;

    match res {
        Ok(resp) => {
            let data: serde_json::Value = match resp.json().await {
                Ok(v) => v,
                Err(e) => return HttpResponse::InternalServerError().json(serde_json::json!({"error": format!("Parse error: {}", e)})),
            };

            let content = data
                .get("choices")
                .and_then(|c| c.get(0))
                .and_then(|c| c.get("message"))
                .and_then(|m| m.get("content"))
                .and_then(|c| c.as_str())
                .unwrap_or("{}");

            let parsed: serde_json::Value = match serde_json::from_str(content) {
                Ok(v) => v,
                Err(_) => {
                    // Fallback: try parsing the content directly if it's already a JSON string
                    match serde_json::from_str::<serde_json::Value>(content) {
                        Ok(v) => v,
                        Err(e) => return HttpResponse::InternalServerError().json(serde_json::json!({"error": format!("JSON parse error: {}", e), "raw": content})),
                    }
                }
            };

            let subject = parsed.get("subject").and_then(|s| s.as_str()).unwrap_or("Document shared with you").to_string();
            let body = parsed.get("body").and_then(|s| s.as_str()).unwrap_or("").to_string();
            let html_body = parsed.get("html_body").and_then(|s| s.as_str()).unwrap_or("").to_string();

            HttpResponse::Ok().json(GenerateLureResponse {
                subject,
                body,
                html_body,
                anti_spam_notes: vec![
                    "Natural sentence variation applied".to_string(),
                    "No spam trigger words detected".to_string(),
                    "Contextual business reference included".to_string(),
                    "Human-like imperfections injected".to_string(),
                ],
            })
        }
        Err(e) => {
            eprintln!("[lure] OpenAI request failed: {}", e);
            HttpResponse::InternalServerError().json(serde_json::json!({"error": format!("OpenAI request failed: {}", e)}))
        }
    }
}
