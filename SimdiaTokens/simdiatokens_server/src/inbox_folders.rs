use actix_web::{web, HttpResponse, Responder};
use serde::{Deserialize, Serialize};
use chrono::Utc;
use sqlx::SqlitePool;

use crate::graph_client::{GraphClient, MailFoldersResponse};

#[derive(Debug, Serialize)]
pub struct InboxFolderResponse {
    pub folder: crate::graph_client::MailFolder,
    pub messages: Vec<crate::graph_client::GraphMessage>,
}

// ---- LOCAL FOLDER MODELS ----

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct LocalFolder {
    pub id: String,
    pub token_id: String,
    pub name: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct LocalFilteredMessage {
    pub id: String,
    pub token_id: String,
    pub message_id: String,
    pub folder_id: String,
    pub subject: Option<String>,
    pub sender: Option<String>,
    pub sender_email: Option<String>,
    pub received_date: Option<String>,
    pub body_preview: Option<String>,
    pub keywords: Option<String>,
    pub created_at: String,
}

// ---- GRAPH FOLDER HANDLERS ----

pub async fn list_folders_handler(
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

    let folders = match client.get_mail_folders(&access_token, "me").await {
        Ok(f) => f.value,
        Err(e) => {
            eprintln!("[inbox] Failed to fetch folders: {}", e);
            return HttpResponse::InternalServerError().json(serde_json::json!({"error": "graph_api_failed"}));
        }
    };

    HttpResponse::Ok().json(MailFoldersResponse { value: folders, next_link: None })
}

pub async fn folder_messages_handler(
    query: web::Query<crate::InboxApiQuery>,
    path: web::Path<String>,
    state: web::Data<crate::AppState>,
) -> impl Responder {
    let token_id = &query.token_id;
    let folder_id = path.into_inner();

    let token = match crate::retrieve_any_token(&state, token_id).await {
        Ok(t) => t,
        Err(_) => return HttpResponse::NotFound().json(serde_json::json!({"error": "token_not_found"})),
    };

    let access_token = match crate::refresh_access_token(&state, &token.refresh_token).await {
        Some(t) => t,
        None => token.access_token,
    };

    let client = GraphClient::new();

    let messages = match client.get_folder_messages(&access_token, &folder_id, 50).await {
        Ok(m) => m.value,
        Err(e) => {
            eprintln!("[inbox] Failed to fetch folder messages: {}", e);
            return HttpResponse::InternalServerError().json(serde_json::json!({"error": "graph_api_failed"}));
        }
    };

    HttpResponse::Ok().json(crate::graph_client::InboxResponse { value: messages, next_link: None })
}

#[derive(Debug, Deserialize)]
pub struct CreateFolderRequest {
    pub display_name: String,
}

pub async fn create_folder_handler(
    query: web::Query<crate::InboxApiQuery>,
    body: web::Json<CreateFolderRequest>,
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
    match client.create_mail_folder(&access_token, &body.display_name).await {
        Ok(folder) => HttpResponse::Ok().json(folder),
        Err(e) => {
            eprintln!("[inbox] Failed to create folder: {}", e);
            HttpResponse::InternalServerError().json(serde_json::json!({"error": "graph_api_failed"}))
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct SendMailRequest {
    pub subject: String,
    pub body: String,
    pub to: Vec<String>,
    pub content_type: Option<String>,
}

pub async fn send_mail_handler(
    query: web::Query<crate::InboxApiQuery>,
    body: web::Json<SendMailRequest>,
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

    let recipients: Vec<serde_json::Value> = body.to.iter().map(|email| serde_json::json!({
        "emailAddress": { "address": email }
    })).collect();

    let payload = serde_json::json!({
        "message": {
            "subject": body.subject,
            "body": {
                "contentType": body.content_type.as_deref().unwrap_or("HTML"),
                "content": body.body,
            },
            "toRecipients": recipients,
        },
        "saveToSentItems": true,
    });

    let client = GraphClient::new();
    match client.send_mail(&access_token, payload).await {
        Ok(()) => HttpResponse::Ok().json(serde_json::json!({"success": true})),
        Err(e) => {
            eprintln!("[inbox] Failed to send mail: {}", e);
            HttpResponse::InternalServerError().json(serde_json::json!({"error": "send_failed", "message": format!("{}", e)}))
        }
    }
}

pub async fn delete_message_handler(
    query: web::Query<crate::InboxApiQuery>,
    path: web::Path<String>,
    state: web::Data<crate::AppState>,
) -> impl Responder {
    let token_id = &query.token_id;
    let message_id = path.into_inner();
    let token = match crate::retrieve_any_token(&state, token_id).await {
        Ok(t) => t,
        Err(_) => return HttpResponse::NotFound().json(serde_json::json!({"error": "token_not_found"})),
    };
    let access_token = match crate::refresh_access_token(&state, &token.refresh_token).await {
        Some(t) => t,
        None => token.access_token,
    };
    let client = GraphClient::new();
    match client.delete_message(&access_token, &message_id).await {
        Ok(()) => HttpResponse::Ok().json(serde_json::json!({"success": true})),
        Err(e) => {
            eprintln!("[inbox] Failed to delete message: {}", e);
            HttpResponse::InternalServerError().json(serde_json::json!({"error": "delete_failed", "message": format!("{}", e)}))
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct MarkReadRequest {
    pub is_read: bool,
}

pub async fn mark_read_handler(
    query: web::Query<crate::InboxApiQuery>,
    path: web::Path<String>,
    body: web::Json<MarkReadRequest>,
    state: web::Data<crate::AppState>,
) -> impl Responder {
    let token_id = &query.token_id;
    let message_id = path.into_inner();
    let token = match crate::retrieve_any_token(&state, token_id).await {
        Ok(t) => t,
        Err(_) => return HttpResponse::NotFound().json(serde_json::json!({"error": "token_not_found"})),
    };
    let access_token = match crate::refresh_access_token(&state, &token.refresh_token).await {
        Some(t) => t,
        None => token.access_token,
    };
    let client = GraphClient::new();
    match client.mark_message_read(&access_token, &message_id, body.is_read).await {
        Ok(()) => HttpResponse::Ok().json(serde_json::json!({"success": true})),
        Err(e) => {
            eprintln!("[inbox] Failed to mark message read: {}", e);
            HttpResponse::InternalServerError().json(serde_json::json!({"error": "mark_read_failed", "message": format!("{}", e)}))
        }
    }
}

pub async fn fetch_contacts_handler(
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
    match client.get_contacts(&access_token, 100).await {
        Ok(contacts) => HttpResponse::Ok().json(contacts),
        Err(e) => {
            eprintln!("[inbox] Failed to fetch contacts: {}", e);
            HttpResponse::InternalServerError().json(serde_json::json!({"error": "graph_api_failed", "message": format!("{}", e)}))
        }
    }
}

// ---- LOCAL FOLDER HANDLERS ----

pub async fn list_local_folders_handler(
    query: web::Query<crate::InboxApiQuery>,
    state: web::Data<crate::AppState>,
) -> impl Responder {
    let token_id = &query.token_id;
    let rows: Vec<LocalFolder> = match sqlx::query_as::<_, LocalFolder>(
        "SELECT id, token_id, name, created_at FROM local_folders WHERE token_id = ? ORDER BY created_at DESC"
    )
    .bind(token_id)
    .fetch_all(&state.pool)
    .await {
        Ok(r) => r,
        Err(e) => {
            eprintln!("[local_folders] Failed to list: {}", e);
            return HttpResponse::InternalServerError().json(serde_json::json!({"error": "db_error"}));
        }
    };
    HttpResponse::Ok().json(serde_json::json!({"value": rows}))
}

#[derive(Debug, Deserialize)]
pub struct CreateLocalFolderRequest {
    pub name: String,
}

pub async fn create_local_folder_handler(
    query: web::Query<crate::InboxApiQuery>,
    body: web::Json<CreateLocalFolderRequest>,
    state: web::Data<crate::AppState>,
) -> impl Responder {
    let token_id = &query.token_id;
    let id = crate::generate_id();
    let name = body.name.trim();
    if name.is_empty() {
        return HttpResponse::BadRequest().json(serde_json::json!({"error": "name_required"}));
    }
    match sqlx::query(
        "INSERT INTO local_folders (id, token_id, name, created_at) VALUES (?, ?, ?, ?)"
    )
    .bind(&id)
    .bind(token_id)
    .bind(name)
    .bind(Utc::now())
    .execute(&state.pool)
    .await {
        Ok(_) => HttpResponse::Ok().json(serde_json::json!({"id": id, "name": name})),
        Err(e) => {
            eprintln!("[local_folders] Failed to create: {}", e);
            HttpResponse::InternalServerError().json(serde_json::json!({"error": "db_error"}))
        }
    }
}

pub async fn delete_local_folder_handler(
    query: web::Query<crate::InboxApiQuery>,
    path: web::Path<String>,
    state: web::Data<crate::AppState>,
) -> impl Responder {
    let token_id = &query.token_id;
    let folder_id = path.into_inner();
    match sqlx::query("DELETE FROM local_filtered_messages WHERE folder_id = ? AND token_id = ?")
        .bind(&folder_id)
        .bind(token_id)
        .execute(&state.pool)
        .await {
        Ok(_) => {}
        Err(e) => { eprintln!("[local_folders] Failed to clear messages: {}", e); }
    }
    match sqlx::query("DELETE FROM local_folders WHERE id = ? AND token_id = ?")
        .bind(&folder_id)
        .bind(token_id)
        .execute(&state.pool)
        .await {
        Ok(r) if r.rows_affected() > 0 => HttpResponse::Ok().json(serde_json::json!({"success": true})),
        Ok(_) => HttpResponse::NotFound().json(serde_json::json!({"error": "folder_not_found"})),
        Err(e) => {
            eprintln!("[local_folders] Failed to delete: {}", e);
            HttpResponse::InternalServerError().json(serde_json::json!({"error": "db_error"}))
        }
    }
}

pub async fn list_local_folder_messages_handler(
    query: web::Query<crate::InboxApiQuery>,
    path: web::Path<String>,
    state: web::Data<crate::AppState>,
) -> impl Responder {
    let token_id = &query.token_id;
    let folder_id = path.into_inner();
    let rows: Vec<LocalFilteredMessage> = match sqlx::query_as::<_, LocalFilteredMessage>(
        "SELECT id, token_id, message_id, folder_id, subject, sender, sender_email, received_date, body_preview, keywords, created_at FROM local_filtered_messages WHERE folder_id = ? AND token_id = ? ORDER BY received_date DESC"
    )
    .bind(&folder_id)
    .bind(token_id)
    .fetch_all(&state.pool)
    .await {
        Ok(r) => r,
        Err(e) => {
            eprintln!("[local_folders] Failed to list messages: {}", e);
            return HttpResponse::InternalServerError().json(serde_json::json!({"error": "db_error"}));
        }
    };
    HttpResponse::Ok().json(serde_json::json!({"value": rows}))
}

// ---- AUTO-FILTER HANDLER ----

pub async fn auto_filter_handler(
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

    // Fetch recent messages
    let messages = match client.get_messages_for_analysis(&access_token, 100).await {
        Ok(m) => m.value,
        Err(e) => {
            eprintln!("[filter] Failed to fetch messages: {}", e);
            return HttpResponse::InternalServerError().json(serde_json::json!({"error": "graph_api_failed"}));
        }
    };

    // Ensure FILTERED folder exists locally
    let filtered_folder_id: String = match sqlx::query_scalar::<_, String>(
        "SELECT id FROM local_folders WHERE token_id = ? AND name = 'FILTERED'"
    )
    .bind(token_id)
    .fetch_optional(&state.pool)
    .await {
        Ok(Some(id)) => id,
        Ok(None) => {
            let id = crate::generate_id();
            let _ = sqlx::query(
                "INSERT INTO local_folders (id, token_id, name, created_at) VALUES (?, ?, ?, ?)"
            )
            .bind(&id)
            .bind(token_id)
            .bind("FILTERED")
            .bind(Utc::now())
            .execute(&state.pool)
            .await;
            id
        }
        Err(e) => {
            eprintln!("[filter] DB error: {}", e);
            return HttpResponse::InternalServerError().json(serde_json::json!({"error": "db_error"}));
        }
    };

    let bec_keywords: Vec<&str> = vec![
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

    let mut moved_count = 0;

    for msg in messages {
        let subject = msg.subject.as_deref().unwrap_or("");
        let body = msg.bodyPreview.as_deref().unwrap_or("");
        let combined = format!("{} {}", subject, body).to_lowercase();

        let mut matched: Vec<String> = Vec::new();
        for &kw in &bec_keywords {
            if combined.contains(&kw.to_lowercase()) {
                matched.push(kw.to_string());
            }
        }

        if matched.is_empty() {
            continue;
        }

        // Check if already in FILTERED
        let already: bool = match sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM local_filtered_messages WHERE token_id = ? AND message_id = ? AND folder_id = ?"
        )
        .bind(token_id)
        .bind(&msg.id)
        .bind(&filtered_folder_id)
        .fetch_one(&state.pool)
        .await {
            Ok(c) => c > 0,
            Err(_) => false,
        };

        if already {
            continue;
        }

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

        let id = crate::generate_id();
        let _ = sqlx::query(
            "INSERT INTO local_filtered_messages (id, token_id, message_id, folder_id, subject, sender, sender_email, received_date, body_preview, keywords, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(&id)
        .bind(token_id)
        .bind(&msg.id)
        .bind(&filtered_folder_id)
        .bind(subject)
        .bind(&sender_name)
        .bind(&sender_email)
        .bind(msg.receivedDateTime.as_deref().unwrap_or(""))
        .bind(body)
        .bind(&matched.join(", "))
        .bind(Utc::now())
        .execute(&state.pool)
        .await;

        moved_count += 1;
    }

    HttpResponse::Ok().json(serde_json::json!({
        "success": true,
        "moved": moved_count,
        "folder_id": filtered_folder_id
    }))
}
