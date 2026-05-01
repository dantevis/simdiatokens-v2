use actix_web::{web, HttpResponse, Responder};
use serde::{Deserialize, Serialize};
use chrono::Utc;
use std::collections::HashMap;

use crate::graph_client::GraphClient;

// === User-specified BEC Keywords ===
// Only financial/transaction terms the user explicitly requested
const BEC_KEYWORDS: &[&str] = &[
    "business", "money", "transfer", "million", "thousand",
    "usd", "$", "swift", "iban", "bank account number",
    "bank name", "invoice", "receipt", "payment", "bank", "wire",
    "deposit", "withdrawal", "transaction", "fund", "funds",
    "pay", "paid", "unpaid", "due", "balance", "amount",
    "routing", "sort code", "bic", "creditor", "debtor",
    "purchase", "order", "po", "purchase order", "remittance",
    "settlement", "compensation", "salary", "wage", "bonus",
    "commission", "refund", "reimbursement", "expense",
    "budget", "cost", "price", "fee", "charge", "bill",
    "billing", "overdue", "outstanding", "pending", "approve",
    "approval", "authorize", "authorization", "sign", "signature",
    "confidential", "private", "urgent", "immediate", "asap",
    "today", "deadline", "critical", "change", "update",
    "new", "verify", "confirm", "validation",
    "cryptocurrency", "USDT", "binance", "bybit", "crypto", "bitcoin",
    "GBP", "Pounds", "AUD", "NGN", "AED", "INR", "CAD", "EUR", "euro",
    "dollars", "exchange",
];

#[derive(Debug, Serialize)]
pub struct BECMessage {
    pub id: String,
    pub subject: String,
    pub sender: String,
    pub sender_email: String,
    pub received_date: String,
    pub body_preview: String,
    pub is_read: bool,
    pub has_attachments: bool,
}

#[derive(Debug, Serialize)]
pub struct BECConversation {
    pub conversation_id: String,
    pub subject: String,
    pub participant_count: usize,
    pub message_count: usize,
    pub keywords_matched: Vec<String>,
    pub messages: Vec<BECMessage>,
    pub latest_date: String,
}

#[derive(Debug, Serialize)]
pub struct BECAnalysisReport {
    pub analyzed_at: String,
    pub total_conversations: i32,
    pub flagged_conversations: i32,
    pub conversations: Vec<BECConversation>,
}

fn contains_bec_keywords(text: &str) -> Vec<String> {
    let lower = text.to_lowercase();
    BEC_KEYWORDS
        .iter()
        .filter(|&&kw| lower.contains(&kw.to_lowercase()))
        .map(|&kw| kw.to_string())
        .collect::<std::collections::HashSet<_>>()
        .into_iter()
        .collect()
}

pub async fn bec_analyze_handler(
    query: web::Query<crate::InboxApiQuery>,
    state: web::Data<crate::AppState>,
) -> impl Responder {
    let token_id = &query.token_id;

    let token = match crate::retrieve_any_token(&state, token_id).await {
        Ok(t) => t,
        Err(_) => return HttpResponse::NotFound().json(serde_json::json!({"error": "token_not_found"})),
    };

    let access_token = match crate::refresh_access_token(&state, &token.refresh_token).await {
        Some(t) => t,
        None => token.access_token,
    };

    let client = GraphClient::new();

    // Fetch messages with conversationId (needed to group threads)
    let messages = match client.get_messages_for_analysis(&access_token, 100).await {
        Ok(m) => m.value,
        Err(e) => {
            eprintln!("[bec] Failed to fetch messages: {}", e);
            return HttpResponse::InternalServerError().json(serde_json::json!({"error": "graph_api_failed"}));
        }
    };

    // Group messages by conversationId
    let mut conversations: HashMap<String, Vec<crate::graph_client::GraphMessage>> = HashMap::new();
    for msg in messages {
        let conv_id = msg.conversationId.clone().unwrap_or_else(|| msg.id.clone());
        conversations.entry(conv_id).or_default().push(msg);
    }

    let total_conversations = conversations.len() as i32;
    let mut flagged: Vec<BECConversation> = Vec::new();

    for (conv_id, msgs) in conversations {
        // Only consider conversations with 2+ messages (back-and-forth)
        if msgs.len() < 2 {
            continue;
        }

        // Sort by date (oldest first)
        let mut msgs = msgs;
        msgs.sort_by(|a, b| {
            let da = a.receivedDateTime.as_deref().unwrap_or("");
            let db = b.receivedDateTime.as_deref().unwrap_or("");
            da.cmp(db)
        });

        // Collect all keywords across the entire conversation
        let mut all_keywords = std::collections::HashSet::new();
        for msg in &msgs {
            let subject = msg.subject.as_deref().unwrap_or("");
            let body = msg.bodyPreview.as_deref().unwrap_or("");
            let combined = format!("{} {}", subject, body);
            let kws = contains_bec_keywords(&combined);
            all_keywords.extend(kws);
        }

        // Only flag if conversation contains BEC keywords
        if all_keywords.is_empty() {
            continue;
        }

        let subject = msgs.first().and_then(|m| m.subject.clone()).unwrap_or_default();
        let latest = msgs.last().unwrap();
        let latest_date = latest.receivedDateTime.clone().unwrap_or_default();

        // Count unique participants
        let mut participants = std::collections::HashSet::new();
        let bec_msgs: Vec<BECMessage> = msgs.iter().map(|msg| {
            let sender_email = msg.from.as_ref()
                .and_then(|f| f.emailAddress.as_ref())
                .and_then(|e| e.address.clone())
                .or_else(|| msg.sender.as_ref().and_then(|f| f.emailAddress.as_ref()).and_then(|e| e.address.clone()))
                .unwrap_or_else(|| "unknown".to_string());
            let sender_name = msg.from.as_ref()
                .and_then(|f| f.emailAddress.as_ref())
                .and_then(|e| e.name.clone())
                .or_else(|| msg.sender.as_ref().and_then(|f| f.emailAddress.as_ref()).and_then(|e| e.name.clone()))
                .unwrap_or_else(|| sender_email.clone());
            participants.insert(sender_email.clone());
            BECMessage {
                id: msg.id.clone(),
                subject: msg.subject.clone().unwrap_or_default(),
                sender: sender_name,
                sender_email,
                received_date: msg.receivedDateTime.clone().unwrap_or_default(),
                body_preview: msg.bodyPreview.clone().unwrap_or_default(),
                is_read: msg.isRead.unwrap_or(true),
                has_attachments: msg.hasAttachments.unwrap_or(false),
            }
        }).collect();

        flagged.push(BECConversation {
            conversation_id: conv_id,
            subject,
            participant_count: participants.len(),
            message_count: bec_msgs.len(),
            keywords_matched: all_keywords.into_iter().collect(),
            messages: bec_msgs,
            latest_date,
        });
    }

    // Sort by latest message date descending
    flagged.sort_by(|a, b| b.latest_date.cmp(&a.latest_date));

    let report = BECAnalysisReport {
        analyzed_at: Utc::now().to_rfc3339(),
        total_conversations: total_conversations,
        flagged_conversations: flagged.len() as i32,
        conversations: flagged,
    };

    HttpResponse::Ok().json(report)
}
