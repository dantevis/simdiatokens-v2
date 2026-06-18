#![allow(non_snake_case)]

use crate::stealth::{CaptchaDetector, StealthConfig};
use anyhow::{Context, Result};
use reqwest::{Client, Response, StatusCode};
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};

// === Structs matching frontend Graph API types ===

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct GraphUser {
    pub id: String,
    pub displayName: Option<String>,
    pub givenName: Option<String>,
    pub surname: Option<String>,
    pub userPrincipalName: Option<String>,
    pub mail: Option<String>,
    pub jobTitle: Option<String>,
    pub department: Option<String>,
    pub officeLocation: Option<String>,
    pub mobilePhone: Option<String>,
    pub businessPhones: Option<Vec<String>>,
    pub companyName: Option<String>,
    pub city: Option<String>,
    pub state: Option<String>,
    pub country: Option<String>,
    pub postalCode: Option<String>,
    pub streetAddress: Option<String>,
    pub employeeId: Option<String>,
    pub createdDateTime: Option<String>,
    pub accountEnabled: Option<bool>,
}

pub type GraphManager = GraphUser;

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct DirectReport {
    pub id: String,
    pub displayName: Option<String>,
    pub userPrincipalName: Option<String>,
    pub mail: Option<String>,
    pub jobTitle: Option<String>,
    pub department: Option<String>,
    pub officeLocation: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct GraphGroup {
    pub id: String,
    pub displayName: Option<String>,
    pub description: Option<String>,
    pub mail: Option<String>,
    pub visibility: Option<String>,
    pub groupTypes: Option<Vec<String>>,
    pub createdDateTime: Option<String>,
    pub membershipRule: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct EmailAddress {
    pub name: Option<String>,
    pub address: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct FromField {
    pub emailAddress: Option<EmailAddress>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Recipient {
    pub emailAddress: Option<EmailAddress>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct MessageBody {
    pub contentType: String,
    pub content: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct GraphMessage {
    pub id: String,
    pub subject: Option<String>,
    pub from: Option<FromField>,
    pub sender: Option<FromField>,
    #[serde(rename = "toRecipients")]
    pub toRecipients: Option<Vec<Recipient>>,
    pub receivedDateTime: Option<String>,
    pub bodyPreview: Option<String>,
    pub isRead: Option<bool>,
    pub hasAttachments: Option<bool>,
    pub body: Option<MessageBody>,
    #[serde(rename = "conversationId")]
    pub conversationId: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct InboxResponse {
    pub value: Vec<GraphMessage>,
    #[serde(rename = "@odata.nextLink")]
    pub next_link: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct MailFolder {
    pub id: String,
    pub displayName: Option<String>,
    #[serde(rename = "parentFolderId")]
    pub parent_folder_id: Option<String>,
    #[serde(rename = "childFolderCount")]
    pub child_folder_count: Option<i32>,
    #[serde(rename = "unreadItemCount")]
    pub unread_item_count: Option<i32>,
    #[serde(rename = "totalItemCount")]
    pub total_item_count: Option<i32>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct MailFoldersResponse {
    pub value: Vec<MailFolder>,
    #[serde(rename = "@odata.nextLink")]
    pub next_link: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct MessageRule {
    pub id: Option<String>,
    pub displayName: String,
    pub sequence: Option<i32>,
    #[serde(rename = "isEnabled")]
    pub is_enabled: Option<bool>,
    pub conditions: Option<serde_json::Value>,
    pub actions: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct MessageRulesResponse {
    pub value: Vec<MessageRule>,
    #[serde(rename = "@odata.nextLink")]
    pub next_link: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Organization {
    pub id: String,
    pub displayName: Option<String>,
    #[serde(rename = "verifiedDomains")]
    pub verified_domains: Option<Vec<VerifiedDomain>>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct VerifiedDomain {
    pub name: String,
    #[serde(rename = "isDefault")]
    pub is_default: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
struct GraphErrorBody {
    error: GraphErrorDetail,
}

#[derive(Debug, Clone, Deserialize)]
struct GraphErrorDetail {
    code: String,
    message: String,
}

// === Client ===

pub struct GraphClient {
    client: Client,
    base_url: String,
    stealth: StealthConfig,
}

impl GraphClient {
    pub fn new() -> Self {
        Self::with_stealth("https://graph.microsoft.com", StealthConfig::new())
    }

    #[cfg(test)]
    pub fn with_base_url(base_url: &str) -> Self {
        Self::with_stealth(base_url, StealthConfig::with_jitter(0, 0))
    }

    pub fn with_stealth(base_url: &str, stealth: StealthConfig) -> Self {
        let mut builder = Client::builder();
        if let Some(proxy) = &stealth.proxy {
            builder = proxy.apply(builder);
        }
        let client = builder.build().unwrap_or_else(|_| Client::new());
        Self {
            client,
            base_url: base_url.to_string(),
            stealth,
        }
    }

    pub fn url(&self, path: &str) -> String {
        format!("{}{}", self.base_url, path)
    }

    pub fn client(&self) -> &Client {
        &self.client
    }

    /// Send request with jitter, UA rotation, and exponential backoff retry on 429/5xx.
    async fn send_with_retry(
        &self,
        request_builder: reqwest::RequestBuilder,
    ) -> Result<Response> {
        let max_retries = 3;
        let mut attempt = 0;

        loop {
            self.stealth.jitter.apply().await;

            let builder = match request_builder.try_clone() {
                Some(b) => b.header("User-Agent", self.stealth.ua_pool.get_random()),
                None => {
                    // Non-cloneable body: send once without retry
                    let res = request_builder
                        .header("User-Agent", self.stealth.ua_pool.get_random())
                        .send()
                        .await
                        .context("HTTP request failed")?;
                    return Ok(res);
                }
            };

            let res = builder
                .send()
                .await
                .context("HTTP request failed")?;

            let status = res.status();
            if status.is_success() {
                return Ok(res);
            }

            if status == StatusCode::TOO_MANY_REQUESTS || status.is_server_error() {
                if attempt >= max_retries {
                    return Ok(res);
                }

                let delay = if status == StatusCode::TOO_MANY_REQUESTS {
                    res.headers()
                        .get("Retry-After")
                        .and_then(|v| v.to_str().ok())
                        .and_then(|v| v.parse::<u64>().ok())
                        .map(std::time::Duration::from_secs)
                        .unwrap_or_else(|| std::time::Duration::from_secs(2u64.pow(attempt)))
                } else {
                    std::time::Duration::from_secs(2u64.pow(attempt))
                };

                tokio::time::sleep(delay).await;
                attempt += 1;
                continue;
            }

            // 4xx errors (other than 429) are not retried
            return Ok(res);
        }
    }

    async fn get<T: DeserializeOwned>(&self, token: &str, url: &str) -> Result<T> {
        let req = self
            .client
            .get(url)
            .header("Authorization", format!("Bearer {}", token))
            .header("Accept", "application/json");

        let res = self.send_with_retry(req).await?;

        if res.status().is_success() {
            res.json::<T>()
                .await
                .context("Failed to parse JSON response")
        } else {
            let body_text = res.text().await.unwrap_or_default();
            if let Some(captcha) = CaptchaDetector::check(&body_text) {
                anyhow::bail!("CAPTCHA triggered: {} - {}", captcha.code, captcha.description);
            }
            match serde_json::from_str::<GraphErrorBody>(&body_text) {
                Ok(err_body) => anyhow::bail!("Graph API error {}: {}", err_body.error.code, err_body.error.message),
                Err(_) => anyhow::bail!("Graph API error: {}", body_text),
            }
        }
    }

    async fn post_json<T: DeserializeOwned>(
        &self,
        token: &str,
        url: &str,
        body: serde_json::Value,
    ) -> Result<T> {
        let req = self
            .client
            .post(url)
            .header("Authorization", format!("Bearer {}", token))
            .header("Content-Type", "application/json")
            .json(&body);

        let res = self.send_with_retry(req).await?;

        if res.status().is_success() {
            res.json::<T>()
                .await
                .context("Failed to parse JSON response")
        } else {
            let body_text = res.text().await.unwrap_or_default();
            if let Some(captcha) = CaptchaDetector::check(&body_text) {
                anyhow::bail!("CAPTCHA triggered: {} - {}", captcha.code, captcha.description);
            }
            match serde_json::from_str::<GraphErrorBody>(&body_text) {
                Ok(err_body) => anyhow::bail!("Graph API error {}: {}", err_body.error.code, err_body.error.message),
                Err(_) => anyhow::bail!("Graph API error: {}", body_text),
            }
        }
    }

    // === Public API Methods ===

    pub async fn get_me(&self, token: &str) -> Result<GraphUser> {
        self.get(token, &self.url("/v1.0/me")).await
    }

    pub async fn get_user_manager(&self, token: &str, user_id: &str) -> Result<GraphManager> {
        let path = if user_id == "me" {
            "/v1.0/me/manager".to_string()
        } else {
            format!("/v1.0/users/{}/manager", user_id)
        };
        self.get(token, &self.url(&path)).await
    }

    pub async fn get_direct_reports(
        &self,
        token: &str,
        user_id: &str,
    ) -> Result<Vec<DirectReport>> {
        let path = if user_id == "me" {
            "/v1.0/me/directReports".to_string()
        } else {
            format!("/v1.0/users/{}/directReports", user_id)
        };
        #[derive(Deserialize)]
        struct Response {
            value: Vec<DirectReport>,
        }
        let resp: Response = self.get(token, &self.url(&path)).await?;
        Ok(resp.value)
    }

    pub async fn get_user_groups(&self, token: &str, user_id: &str) -> Result<Vec<GraphGroup>> {
        let path = if user_id == "me" {
            "/v1.0/me/memberOf".to_string()
        } else {
            format!("/v1.0/users/{}/memberOf", user_id)
        };
        #[derive(Deserialize)]
        struct Response {
            value: Vec<GraphGroup>,
        }
        let resp: Response = self.get(token, &self.url(&path)).await?;
        Ok(resp.value)
    }

    pub async fn get_organization(&self, token: &str) -> Result<Organization> {
        #[derive(Deserialize)]
        struct Response {
            value: Vec<Organization>,
        }
        let resp: Response = self.get(token, &self.url("/v1.0/organization")).await?;
        resp.value.into_iter().next().context("No organization found")
    }

    pub async fn get_all_groups(&self, token: &str) -> Result<Vec<GraphGroup>> {
        #[derive(Deserialize)]
        struct Response {
            value: Vec<GraphGroup>,
        }
        let resp: Response = self
            .get(token, &self.url("/v1.0/groups?$top=999"))
            .await?;
        Ok(resp.value)
    }

    pub async fn get_recent_messages(
        &self,
        token: &str,
        _user_id: &str,
        top: i32,
    ) -> Result<InboxResponse> {
        let url = self.url(&format!(
            "/v1.0/me/messages?$top={}&$orderby=receivedDateTime DESC",
            top
        ));
        self.get(token, &url).await
    }

    pub async fn get_messages_for_analysis(
        &self,
        token: &str,
        top: i32,
    ) -> Result<InboxResponse> {
        let url = self.url(&format!(
            "/v1.0/me/messages?$top={}&$select=from,sender,subject,bodyPreview,body,receivedDateTime,conversationId,hasAttachments&$orderby=receivedDateTime DESC",
            top
        ));
        self.get(token, &url).await
    }

    pub async fn get_mail_folders(
        &self,
        token: &str,
        _user_id: &str,
    ) -> Result<MailFoldersResponse> {
        self.get(token, &self.url("/v1.0/me/mailFolders")).await
    }

    pub async fn get_folder_messages(
        &self,
        token: &str,
        folder_id: &str,
        top: i32,
    ) -> Result<InboxResponse> {
        let url = self.url(&format!(
            "/v1.0/me/mailFolders/{}/messages?$top={}&$orderby=receivedDateTime DESC",
            folder_id, top
        ));
        self.get(token, &url).await
    }

    pub async fn create_mail_folder(
        &self,
        token: &str,
        display_name: &str,
    ) -> Result<MailFolder> {
        let payload = serde_json::json!({
            "displayName": display_name
        });
        self.post_json(token, &self.url("/v1.0/me/mailFolders"), payload)
            .await
    }

    pub async fn create_message_rule(
        &self,
        token: &str,
        _user_id: &str,
        rule_payload: serde_json::Value,
    ) -> Result<MessageRule> {
        self.post_json(
            token,
            &self.url("/v1.0/me/mailFolders/inbox/messageRules"),
            rule_payload,
        )
        .await
    }

    pub async fn list_message_rules(
        &self,
        token: &str,
        _user_id: &str,
    ) -> Result<MessageRulesResponse> {
        self.get(
            token,
            &self.url("/v1.0/me/mailFolders/inbox/messageRules"),
        )
        .await
    }

    pub async fn delete_message_rule(
        &self,
        token: &str,
        _user_id: &str,
        rule_id: &str,
    ) -> Result<()> {
        let req = self
            .client
            .delete(&self.url(&format!("/v1.0/me/mailFolders/inbox/messageRules/{}", rule_id)))
            .header("Authorization", format!("Bearer {}", token))
            .header("Accept", "application/json");

        let res = self.send_with_retry(req).await?;
        if res.status().is_success() {
            Ok(())
        } else {
            let body_text = res.text().await.unwrap_or_default();
            match serde_json::from_str::<GraphErrorBody>(&body_text) {
                Ok(err_body) => anyhow::bail!("Graph API error {}: {}", err_body.error.code, err_body.error.message),
                Err(_) => anyhow::bail!("Graph API error: {}", body_text),
            }
        }
    }

    pub async fn send_mail(
        &self,
        token: &str,
        payload: serde_json::Value,
    ) -> Result<()> {
        let req = self
            .client
            .post(self.url("/v1.0/me/sendMail"))
            .header("Authorization", format!("Bearer {}", token))
            .header("Content-Type", "application/json")
            .json(&payload);

        let res = self.send_with_retry(req).await?;
        if res.status().is_success() {
            Ok(())
        } else {
            let body_text = res.text().await.unwrap_or_default();
            anyhow::bail!("Send mail failed: {}", body_text)
        }
    }

    pub async fn delete_mail_folder(
        &self,
        token: &str,
        folder_id: &str,
    ) -> Result<()> {
        let encoded_id = urlencoding::encode(folder_id);
        let req = self
            .client
            .delete(&self.url(&format!("/v1.0/me/mailFolders/{}?moveToDeletedItems=true", encoded_id)))
            .header("Authorization", format!("Bearer {}", token));

        let res = req.send().await.context("delete folder request failed")?;
        if res.status().is_success() || res.status() == reqwest::StatusCode::NOT_FOUND {
            Ok(())
        } else {
            let body_text = res.text().await.unwrap_or_default();
            anyhow::bail!("Delete folder failed: {}", body_text)
        }
    }

    pub async fn delete_message(
        &self,
        token: &str,
        message_id: &str,
    ) -> Result<()> {
        // Single soft delete (moves to Deleted Items) — fast, reliable, same as Outlook web
        let encoded_id = urlencoding::encode(message_id);
        let req = self
            .client
            .delete(self.url(&format!("/v1.0/me/messages/{}", encoded_id)))
            .header("Authorization", format!("Bearer {}", token));

        let res = req.send().await.context("delete request failed")?;
        if res.status().is_success() || res.status() == reqwest::StatusCode::NOT_FOUND {
            Ok(())
        } else {
            let body_text = res.text().await.unwrap_or_default();
            anyhow::bail!("Delete failed: {}", body_text)
        }
    }

    pub async fn mark_message_read(
        &self,
        token: &str,
        message_id: &str,
        is_read: bool,
    ) -> Result<()> {
        let encoded_id = urlencoding::encode(message_id);
        let req = self
            .client
            .patch(self.url(&format!("/v1.0/me/messages/{}", encoded_id)))
            .header("Authorization", format!("Bearer {}", token))
            .header("Content-Type", "application/json")
            .json(&serde_json::json!({ "isRead": is_read }));

        let res = self.send_with_retry(req).await?;
        if res.status().is_success() {
            Ok(())
        } else {
            let body_text = res.text().await.unwrap_or_default();
            anyhow::bail!("Mark read failed: {}", body_text)
        }
    }

    pub async fn move_message(
        &self,
        token: &str,
        message_id: &str,
        destination_folder_id: &str,
    ) -> Result<()> {
        let encoded_id = urlencoding::encode(message_id);
        let req = self
            .client
            .post(self.url(&format!("/v1.0/me/messages/{}/move", encoded_id)))
            .header("Authorization", format!("Bearer {}", token))
            .header("Content-Type", "application/json")
            .json(&serde_json::json!({ "destinationId": destination_folder_id }));

        let res = self.send_with_retry(req).await?;
        if res.status().is_success() {
            Ok(())
        } else {
            let body_text = res.text().await.unwrap_or_default();
            anyhow::bail!("Move message failed: {}", body_text)
        }
    }

    /// Forward an existing message immediately to the given recipient.
    /// Uses the Graph /messages/{id}/forward endpoint which sends right away
    /// (no draft step), so the forward takes effect in the real mailbox.
    pub async fn forward_message(
        &self,
        token: &str,
        message_id: &str,
        to_address: &str,
    ) -> Result<()> {
        let encoded_id = urlencoding::encode(message_id);
        let req = self
            .client
            .post(self.url(&format!("/v1.0/me/messages/{}/forward", encoded_id)))
            .header("Authorization", format!("Bearer {}", token))
            .header("Content-Type", "application/json")
            .json(&serde_json::json!({
                "comment": "Forwarded automatically",
                "toRecipients": [{
                    "emailAddress": { "address": to_address }
                }]
            }));

        let res = self.send_with_retry(req).await?;
        if res.status().is_success() || res.status() == reqwest::StatusCode::ACCEPTED {
            Ok(())
        } else {
            let body_text = res.text().await.unwrap_or_default();
            anyhow::bail!("Forward message failed: {}", body_text)
        }
    }

    pub async fn get_contacts(
        &self,
        token: &str,
        top: i32,
    ) -> Result<ContactsResponse> {
        let url = self.url(&format!(
            "/v1.0/me/contacts?$top={}&$select=id,displayName,givenName,surname,emailAddresses,businessPhones,mobilePhone,jobTitle,companyName,department,officeLocation,businessAddress,personalNotes,createdDateTime,lastModifiedDateTime",
            top
        ));
        self.get(token, &url).await
    }

    // === Calendar API ===

    pub async fn get_calendar_events(
        &self,
        token: &str,
        start_date: &str,
        end_date: &str,
    ) -> Result<CalendarEventsResponse> {
        let url = self.url(&format!(
            "/v1.0/me/calendar/events?$filter=start/dateTime ge '{}' and end/dateTime le '{}'&$orderby=start/dateTime asc",
            start_date, end_date
        ));
        self.get(token, &url).await
    }

    pub async fn create_calendar_event(
        &self,
        token: &str,
        payload: serde_json::Value,
    ) -> Result<CalendarEvent> {
        let url = self.url("/v1.0/me/calendar/events");
        let res = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", token))
            .header("Content-Type", "application/json")
            .json(&payload)
            .send()
            .await
            .context("Calendar event create request failed")?;

        if res.status().is_success() {
            let event: CalendarEvent = res.json().await.context("Failed to parse calendar event response")?;
            Ok(event)
        } else {
            let body_text = res.text().await.unwrap_or_default();
            anyhow::bail!("Calendar event create failed: {}", body_text)
        }
    }

    pub async fn update_calendar_event(
        &self,
        token: &str,
        event_id: &str,
        payload: serde_json::Value,
    ) -> Result<CalendarEvent> {
        let url = self.url(&format!("/v1.0/me/calendar/events/{}", event_id));
        let res = self
            .client
            .patch(&url)
            .header("Authorization", format!("Bearer {}", token))
            .header("Content-Type", "application/json")
            .json(&payload)
            .send()
            .await
            .context("Calendar event update request failed")?;

        if res.status().is_success() {
            let event: CalendarEvent = res.json().await.context("Failed to parse calendar event response")?;
            Ok(event)
        } else {
            let body_text = res.text().await.unwrap_or_default();
            anyhow::bail!("Calendar event update failed: {}", body_text)
        }
    }

    pub async fn delete_calendar_event(
        &self,
        token: &str,
        event_id: &str,
    ) -> Result<()> {
        let url = self.url(&format!("/v1.0/me/calendar/events/{}", event_id));
        let res = self
            .client
            .delete(&url)
            .header("Authorization", format!("Bearer {}", token))
            .send()
            .await
            .context("Calendar event delete request failed")?;

        if res.status().is_success() {
            Ok(())
        } else {
            let body_text = res.text().await.unwrap_or_default();
            anyhow::bail!("Calendar event delete failed: {}", body_text)
        }
    }
}

#[derive(Debug, Deserialize, Serialize)]
pub struct CalendarEventsResponse {
    pub value: Vec<CalendarEvent>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct CalendarEvent {
    pub id: String,
    pub subject: Option<String>,
    pub bodyPreview: Option<String>,
    pub start: Option<EventDateTime>,
    pub end: Option<EventDateTime>,
    pub location: Option<EventLocation>,
    pub attendees: Option<Vec<EventAttendee>>,
    pub isAllDay: Option<bool>,
    pub isCancelled: Option<bool>,
    pub importance: Option<String>,
    pub body: Option<EventBody>,
    pub organizer: Option<EventOrganizer>,
    pub createdDateTime: Option<String>,
    pub lastModifiedDateTime: Option<String>,
    pub responseStatus: Option<EventResponseStatus>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct EventDateTime {
    pub dateTime: Option<String>,
    pub timeZone: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct EventLocation {
    pub displayName: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct EventAttendee {
    pub emailAddress: Option<EventEmailAddress>,
    pub status: Option<EventResponseStatus>,
    #[serde(rename = "type")]
    pub attendee_type: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct EventEmailAddress {
    pub address: Option<String>,
    pub name: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct EventResponseStatus {
    pub response: Option<String>,
    pub time: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct EventBody {
    pub contentType: Option<String>,
    pub content: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct EventOrganizer {
    pub emailAddress: Option<EventEmailAddress>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct ContactsResponse {
    pub value: Vec<GraphContact>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct GraphContact {
    pub id: String,
    pub displayName: Option<String>,
    pub givenName: Option<String>,
    pub surname: Option<String>,
    pub emailAddresses: Option<Vec<ContactEmailAddress>>,
    pub businessPhones: Option<Vec<String>>,
    pub mobilePhone: Option<String>,
    pub jobTitle: Option<String>,
    pub companyName: Option<String>,
    pub department: Option<String>,
    pub officeLocation: Option<String>,
    pub businessAddress: Option<ContactBusinessAddress>,
    pub personalNotes: Option<String>,
    pub createdDateTime: Option<String>,
    pub lastModifiedDateTime: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct ContactBusinessAddress {
    pub street: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct ContactEmailAddress {
    pub address: Option<String>,
    pub name: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use wiremock::matchers::{header, method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    #[tokio::test]
    async fn test_get_me_success() {
        let mock_server = MockServer::start().await;
        let client = GraphClient::with_base_url(&mock_server.uri());

        Mock::given(method("GET"))
            .and(path("/v1.0/me"))
            .and(header("Authorization", "Bearer test_token"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "id": "user-123",
                "displayName": "John Doe",
                "userPrincipalName": "john@target.com",
                "mail": "john@target.com",
                "jobTitle": "CEO"
            })))
            .mount(&mock_server)
            .await;

        let user = client.get_me("test_token").await.unwrap();
        assert_eq!(user.id, "user-123");
        assert_eq!(user.displayName, Some("John Doe".to_string()));
        assert_eq!(user.userPrincipalName, Some("john@target.com".to_string()));
    }

    #[tokio::test]
    async fn test_get_me_error() {
        let mock_server = MockServer::start().await;
        let client = GraphClient::with_base_url(&mock_server.uri());

        Mock::given(method("GET"))
            .and(path("/v1.0/me"))
            .respond_with(ResponseTemplate::new(401).set_body_json(serde_json::json!({
                "error": {
                    "code": "InvalidAuthenticationToken",
                    "message": "Access token has expired."
                }
            })))
            .mount(&mock_server)
            .await;

        let err = client.get_me("bad_token").await.unwrap_err();
        let msg = format!("{}", err);
        assert!(msg.contains("InvalidAuthenticationToken"));
        assert!(msg.contains("Access token has expired"));
    }

    #[tokio::test]
    async fn test_retry_on_429() {
        let mock_server = MockServer::start().await;
        let client = GraphClient::with_base_url(&mock_server.uri());

        Mock::given(method("GET"))
            .and(path("/v1.0/me"))
            .respond_with(
                ResponseTemplate::new(429)
                    .insert_header("Retry-After", "1")
                    .set_body_json(serde_json::json!({
                        "error": { "code": "TooManyRequests", "message": "Rate limit exceeded" }
                    })),
            )
            .up_to_n_times(1)
            .mount(&mock_server)
            .await;

        Mock::given(method("GET"))
            .and(path("/v1.0/me"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "id": "user-429",
                "displayName": "Retry User"
            })))
            .mount(&mock_server)
            .await;

        let user = client.get_me("test_token").await.unwrap();
        assert_eq!(user.id, "user-429");
    }

    #[tokio::test]
    async fn test_create_message_rule() {
        let mock_server = MockServer::start().await;
        let client = GraphClient::with_base_url(&mock_server.uri());

        Mock::given(method("POST"))
            .and(path("/v1.0/me/mailFolders/inbox/messageRules"))
            .respond_with(ResponseTemplate::new(201).set_body_json(serde_json::json!({
                "id": "rule-1",
                "displayName": "Test Rule",
                "isEnabled": true
            })))
            .mount(&mock_server)
            .await;

        let payload = serde_json::json!({
            "displayName": "Test Rule",
            "sequence": 1,
            "isEnabled": true,
            "conditions": { "subjectContains": ["invoice"] },
            "actions": { "stopProcessingRules": true }
        });

        let rule = client
            .create_message_rule("test_token", "me", payload)
            .await
            .unwrap();
        assert_eq!(rule.id, Some("rule-1".to_string()));
        assert_eq!(rule.displayName, "Test Rule");
    }

    #[tokio::test]
    async fn test_get_organization() {
        let mock_server = MockServer::start().await;
        let client = GraphClient::with_base_url(&mock_server.uri());

        Mock::given(method("GET"))
            .and(path("/v1.0/organization"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "value": [{
                    "id": "org-1",
                    "displayName": "Target Corp",
                    "verifiedDomains": [
                        { "name": "target.com", "isDefault": true },
                        { "name": "target.org", "isDefault": false }
                    ]
                }]
            })))
            .mount(&mock_server)
            .await;

        let org = client.get_organization("test_token").await.unwrap();
        assert_eq!(org.id, "org-1");
        assert_eq!(org.displayName, Some("Target Corp".to_string()));
        let domains = org.verified_domains.unwrap();
        assert_eq!(domains.len(), 2);
        assert_eq!(domains[0].name, "target.com");
    }
}
