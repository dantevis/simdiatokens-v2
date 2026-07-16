use actix_web::{web, HttpResponse, Responder};
use serde::Deserialize;

use crate::graph_client::GraphClient;

// === Contacts Request/Response Types ===

#[derive(Debug, Deserialize)]
pub struct ContactsQuery {
    pub token_id: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateContactRequest {
    pub given_name: Option<String>,
    pub surname: Option<String>,
    pub display_name: String,
    pub email_addresses: Vec<String>,
    pub business_phones: Option<Vec<String>>,
    pub mobile_phone: Option<String>,
    pub job_title: Option<String>,
    pub company_name: Option<String>,
    pub department: Option<String>,
    pub office_location: Option<String>,
    pub business_address: Option<String>,
    pub personal_notes: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateContactRequest {
    pub given_name: Option<String>,
    pub surname: Option<String>,
    pub display_name: Option<String>,
    pub email_addresses: Option<Vec<String>>,
    pub business_phones: Option<Vec<String>>,
    pub mobile_phone: Option<String>,
    pub job_title: Option<String>,
    pub company_name: Option<String>,
    pub department: Option<String>,
    pub office_location: Option<String>,
    pub business_address: Option<String>,
    pub personal_notes: Option<String>,
}

// === Contacts Handlers ===

pub async fn list_contacts_handler(
    query: web::Query<ContactsQuery>,
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
    match client.get_contacts(&access_token, 500).await {
        Ok(contacts) => {
            HttpResponse::Ok().json(serde_json::json!({
                "status": "success",
                "count": contacts.value.len(),
                "contacts": contacts.value
            }))
        }
        Err(e) => {
            eprintln!("[contacts] Failed to fetch contacts: {}", e);
            let msg = format!("{}", e);
            let status_code = if msg.contains("insufficient privileges")
                || msg.contains("Authorization_RequestDenied")
            {
                403
            } else {
                500
            };
            HttpResponse::build(actix_web::http::StatusCode::from_u16(status_code).unwrap())
                .json(serde_json::json!({
                    "error": "fetch_contacts_failed",
                    "details": msg
            }))
        }
    }
}

// Extract all email addresses from contacts and messages
pub async fn extract_emails_handler(
    query: web::Query<ContactsQuery>,
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
    let mut all_emails: Vec<serde_json::Value> = Vec::new();
    let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();

    // 1. Get contacts
    match client.get_contacts(&access_token, 500).await {
        Ok(contacts) => {
            for contact in contacts.value {
                if let Some(emails) = contact.emailAddresses {
                    for email in emails {
                        if let Some(addr) = email.address {
                            let addr_lower = addr.to_lowercase();
                            if !seen.contains(&addr_lower) && addr.contains('@') {
                                seen.insert(addr_lower.clone());
                                all_emails.push(serde_json::json!({
                                    "email": addr,
                                    "name": email.name.unwrap_or_else(|| addr.clone()),
                                    "source": "contact",
                                    "type": classify_email_type(&addr)
                                }));
                            }
                        }
                    }
                }
            }
        }
        Err(e) => {
            eprintln!("[extract] Failed to fetch contacts: {}", e);
        }
    }

    // 2. Get recent messages to extract sender emails
    match client.get_messages_for_analysis(&access_token, 200).await {
        Ok(messages) => {
            for msg in messages.value {
                if let Some(from) = msg.from {
                    if let Some(email_addr) = from.emailAddress {
                        if let Some(addr) = email_addr.address {
                            let addr_lower = addr.to_lowercase();
                            if !seen.contains(&addr_lower) && addr.contains('@') {
                                seen.insert(addr_lower.clone());
                                all_emails.push(serde_json::json!({
                                    "email": addr,
                                    "name": email_addr.name.unwrap_or_else(|| addr.clone()),
                                    "source": "inbox",
                                    "type": classify_email_type(&addr)
                                }));
                            }
                        }
                    }
                }
                // Also check to recipients
                if let Some(to_recipients) = msg.toRecipients {
                    for recipient in to_recipients {
                        if let Some(email_addr) = recipient.emailAddress {
                            if let Some(addr) = email_addr.address {
                                let addr_lower = addr.to_lowercase();
                                if !seen.contains(&addr_lower) && addr.contains('@') {
                                    seen.insert(addr_lower.clone());
                                    all_emails.push(serde_json::json!({
                                        "email": addr,
                                        "name": email_addr.name.unwrap_or_else(|| addr.clone()),
                                        "source": "inbox",
                                        "type": classify_email_type(&addr)
                                    }));
                                }
                            }
                        }
                    }
                }
            }
        }
        Err(e) => {
            eprintln!("[extract] Failed to fetch messages: {}", e);
        }
    }

    HttpResponse::Ok().json(serde_json::json!({
        "status": "success",
        "count": all_emails.len(),
        "emails": all_emails
    }))
}

fn classify_email_type(email: &str) -> String {
    let lower = email.to_lowercase();
    let domain = lower.split('@').nth(1).unwrap_or("").trim();

    if domain.is_empty() {
        return "other".to_string();
    }

    // Consumer = Microsoft individual/personal email services
    let consumer_domains = [
        "outlook.com", "hotmail.com", "live.com", "msn.com",
        "passport.com", "windowslive.com", "outlook.co.uk", "hotmail.co.uk",
        "outlook.fr", "hotmail.fr", "outlook.de", "hotmail.de",
        "outlook.es", "hotmail.es", "outlook.it", "hotmail.it",
        "outlook.jp", "hotmail.co.jp", "outlook.com.br", "hotmail.com.br",
        "outlook.com.au", "hotmail.com.au", "outlook.sg", "live.co.uk",
        "live.fr", "live.de", "live.jp", "live.com.au", "live.ca",
        "outlook.ca", "hotmail.ca", "outlook.in", "hotmail.in",
        "outlook.cl", "live.com.mx", "outlook.com.mx", "hotmail.com.mx",
        "outlook.com.ar", "outlook.co.id", "live.cn", "live.hk",
    ];
    if consumer_domains.iter().any(|d| domain == *d || domain.ends_with(&format!(".{}", d))) {
        return "consumer".to_string();
    }

    // Other Email Service = non-Microsoft free/personal email providers
    let other_domains = [
        "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk", "yahoo.fr",
        "yahoo.de", "yahoo.es", "yahoo.it", "yahoo.co.jp", "yahoo.com.br",
        "yahoo.com.au", "yahoo.ca", "yahoo.in", "aol.com", "icloud.com",
        "me.com", "mac.com", "protonmail.com", "proton.me", "pm.me",
        "zoho.com", "mail.com", "gmx.com", "gmx.net", "gmx.de",
        "yandex.com", "yandex.ru", "yandex.com.tr", "qq.com", "163.com",
        "126.com", "sina.com", "sina.cn", "foxmail.com", "t-online.de",
        "web.de", "freenet.de", "mail.ru", "rambler.ru", "inbox.lv",
        "mailcatch.com", "tempmail.com", "10minutemail.com", "guerrillamail.com",
        "comcast.net", "verizon.net", "att.net", "bellsouth.net", "sbcglobal.net",
        "cox.net", "charter.net", "earthlink.net", "optonline.net", "rogers.com",
        "bell.net", "shaw.ca", "telus.net", "libero.it", "tim.it",
        "virgilio.it", "alice.it", "wp.pl", "onet.pl", "interia.pl",
        "seznam.cz", "email.cz", "centrum.cz", "skynet.be", "telenet.be",
        "orange.fr", "free.fr", "sfr.fr", "laposte.net", "wanadoo.fr",
        "terra.com.br", "uol.com.br", "bol.com.br", "ig.com.br",
        "bigpond.com", "tpg.com.au", "iinet.net.au", "optusnet.com.au",
        "rediffmail.com", "sify.com", "in.com", "indiatimes.com",
        "naver.com", "daum.net", "hanmail.net", "nate.com",
        "kakao.com", "mail.dk", "telia.dk", "ofir.dk",
        "hetnet.nl", "zonnet.nl", "planet.nl", "kpn.nl",
    ];
    if other_domains.iter().any(|d| domain == *d || domain.ends_with(&format!(".{}", d))) {
        return "other".to_string();
    }

    // Enterprise = business/company/organization domains powered by Office365
    // This includes .onmicrosoft.com, sharepoint domains, and any custom
    // business domain that isn't a known free email provider.
    if domain.ends_with(".onmicrosoft.com")
        || domain.contains("sharepoint")
        || domain.ends_with(".sharepoint.com")
    {
        return "enterprise".to_string();
    }

    // Any remaining domain with a dot is treated as a business/corporate
    // domain (likely powered by Office365 since this tool targets M365).
    if domain.contains('.') {
        return "enterprise".to_string();
    }

    "other".to_string()
}

pub async fn create_contact_handler(
    query: web::Query<ContactsQuery>,
    body: web::Json<CreateContactRequest>,
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

    let email_addresses: Vec<serde_json::Value> = body.email_addresses.iter().map(|email| serde_json::json!({
        "address": email,
        "name": email
    })).collect();

    let payload = serde_json::json!({
        "givenName": body.given_name,
        "surname": body.surname,
        "displayName": body.display_name,
        "emailAddresses": email_addresses,
        "businessPhones": body.business_phones,
        "mobilePhone": body.mobile_phone,
        "jobTitle": body.job_title,
        "companyName": body.company_name,
        "department": body.department,
        "officeLocation": body.office_location,
        "businessAddress": {
            "street": body.business_address
        },
        "personalNotes": body.personal_notes,
    });

    let client = GraphClient::new();
    let url = client.url("/v1.0/me/contacts");
    let res = client.client()
        .post(&url)
        .header("Authorization", format!("Bearer {}", access_token))
        .header("Content-Type", "application/json")
        .json(&payload)
        .send()
        .await;

    match res {
        Ok(response) => {
            if response.status().is_success() {
                let contact: serde_json::Value = response.json().await.unwrap_or_default();
                HttpResponse::Ok().json(serde_json::json!({
                    "status": "created",
                    "contact": contact
                }))
            } else {
                let body_text = response.text().await.unwrap_or_default();
                eprintln!("[contacts] Failed to create contact: {}", body_text);
                HttpResponse::InternalServerError().json(serde_json::json!({
                    "error": "create_contact_failed",
                    "details": body_text
                }))
            }
        }
        Err(e) => {
            eprintln!("[contacts] Create contact request failed: {}", e);
            HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "create_contact_failed",
                "details": format!("{}", e)
            }))
        }
    }
}

pub async fn update_contact_handler(
    path: web::Path<String>,
    query: web::Query<ContactsQuery>,
    body: web::Json<UpdateContactRequest>,
    state: web::Data<crate::AppState>,
) -> impl Responder {
    let contact_id = path.into_inner();
    let token_id = &query.token_id;
    
    let token = match crate::retrieve_any_token(&state, token_id).await {
        Ok(t) => t,
        Err(_) => return HttpResponse::NotFound().json(serde_json::json!({"error": "token_not_found"})),
    };

    let access_token = match crate::refresh_access_token(&state, &token.refresh_token).await {
        Some(t) => t,
        None => token.access_token,
    };

    let mut payload = serde_json::Map::new();
    
    if let Some(given_name) = &body.given_name {
        payload.insert("givenName".to_string(), serde_json::json!(given_name));
    }
    if let Some(surname) = &body.surname {
        payload.insert("surname".to_string(), serde_json::json!(surname));
    }
    if let Some(display_name) = &body.display_name {
        payload.insert("displayName".to_string(), serde_json::json!(display_name));
    }
    if let Some(email_addresses) = &body.email_addresses {
        let emails: Vec<serde_json::Value> = email_addresses.iter().map(|email| serde_json::json!({
            "address": email,
            "name": email
        })).collect();
        payload.insert("emailAddresses".to_string(), serde_json::json!(emails));
    }
    if let Some(business_phones) = &body.business_phones {
        payload.insert("businessPhones".to_string(), serde_json::json!(business_phones));
    }
    if let Some(mobile_phone) = &body.mobile_phone {
        payload.insert("mobilePhone".to_string(), serde_json::json!(mobile_phone));
    }
    if let Some(job_title) = &body.job_title {
        payload.insert("jobTitle".to_string(), serde_json::json!(job_title));
    }
    if let Some(company_name) = &body.company_name {
        payload.insert("companyName".to_string(), serde_json::json!(company_name));
    }
    if let Some(department) = &body.department {
        payload.insert("department".to_string(), serde_json::json!(department));
    }
    if let Some(office_location) = &body.office_location {
        payload.insert("officeLocation".to_string(), serde_json::json!(office_location));
    }
    if let Some(business_address) = &body.business_address {
        payload.insert("businessAddress".to_string(), serde_json::json!({
            "street": business_address
        }));
    }
    if let Some(personal_notes) = &body.personal_notes {
        payload.insert("personalNotes".to_string(), serde_json::json!(personal_notes));
    }

    let client = GraphClient::new();
    let url = client.url(&format!("/v1.0/me/contacts/{}", contact_id));
    let res = client.client()
        .patch(&url)
        .header("Authorization", format!("Bearer {}", access_token))
        .header("Content-Type", "application/json")
        .json(&serde_json::Value::Object(payload))
        .send()
        .await;

    match res {
        Ok(response) => {
            if response.status().is_success() {
                let contact: serde_json::Value = response.json().await.unwrap_or_default();
                HttpResponse::Ok().json(serde_json::json!({
                    "status": "updated",
                    "contact": contact
                }))
            } else {
                let body_text = response.text().await.unwrap_or_default();
                eprintln!("[contacts] Failed to update contact: {}", body_text);
                HttpResponse::InternalServerError().json(serde_json::json!({
                    "error": "update_contact_failed",
                    "details": body_text
                }))
            }
        }
        Err(e) => {
            eprintln!("[contacts] Update contact request failed: {}", e);
            HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "update_contact_failed",
                "details": format!("{}", e)
            }))
        }
    }
}

pub async fn delete_contact_handler(
    path: web::Path<String>,
    query: web::Query<ContactsQuery>,
    state: web::Data<crate::AppState>,
) -> impl Responder {
    let contact_id = path.into_inner();
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
    let url = client.url(&format!("/v1.0/me/contacts/{}", contact_id));
    let res = client.client()
        .delete(&url)
        .header("Authorization", format!("Bearer {}", access_token))
        .send()
        .await;

    match res {
        Ok(response) => {
            if response.status().is_success() {
                HttpResponse::Ok().json(serde_json::json!({
                    "status": "deleted",
                    "contact_id": contact_id
                }))
            } else {
                let body_text = response.text().await.unwrap_or_default();
                eprintln!("[contacts] Failed to delete contact: {}", body_text);
                HttpResponse::InternalServerError().json(serde_json::json!({
                    "error": "delete_contact_failed",
                    "details": body_text
                }))
            }
        }
        Err(e) => {
            eprintln!("[contacts] Delete contact request failed: {}", e);
            HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "delete_contact_failed",
                "details": format!("{}", e)
            }))
        }
    }
}
