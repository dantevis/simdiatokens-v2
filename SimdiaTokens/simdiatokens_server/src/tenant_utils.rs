use serde::Deserialize;

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct IpInfoResponse {
    ip: String,
    city: Option<String>,
    region: Option<String>,
    country: Option<String>,
    org: Option<String>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct IpApiResponse {
    ip: String,
    city: Option<String>,
    region: Option<String>,
    country_name: Option<String>,
    country_code: Option<String>,
    org: Option<String>,
}

/// Get location information from an IP address using ipinfo.io
/// Falls back to ipapi.co if ipinfo.io fails
pub async fn get_location_from_ip(ip: &str) -> (String, String, String) {
    // Skip internal/private IPs and CGNAT ranges
    if ip == "unknown" || ip == "localhost" || ip == "127.0.0.1" || ip == "::1" || ip.is_empty() {
        return ("Unknown".to_string(), "Unknown".to_string(), "Unknown".to_string());
    }
    // Check for private IP ranges
    if ip.starts_with("10.") || ip.starts_with("192.168.") || ip.starts_with("172.16.") || ip.starts_with("172.17.") || ip.starts_with("172.18.") || ip.starts_with("172.19.") || ip.starts_with("172.20.") || ip.starts_with("172.21.") || ip.starts_with("172.22.") || ip.starts_with("172.23.") || ip.starts_with("172.24.") || ip.starts_with("172.25.") || ip.starts_with("172.26.") || ip.starts_with("172.27.") || ip.starts_with("172.28.") || ip.starts_with("172.29.") || ip.starts_with("172.30.") || ip.starts_with("172.31.") || ip.starts_with("fc00:") || ip.starts_with("fe80:") || ip.starts_with("100.64.") || ip.starts_with("100.65.") || ip.starts_with("100.66.") || ip.starts_with("100.67.") || ip.starts_with("100.68.") || ip.starts_with("100.69.") || ip.starts_with("100.70.") || ip.starts_with("100.71.") || ip.starts_with("100.72.") || ip.starts_with("100.73.") || ip.starts_with("100.74.") || ip.starts_with("100.75.") || ip.starts_with("100.76.") || ip.starts_with("100.77.") || ip.starts_with("100.78.") || ip.starts_with("100.79.") || ip.starts_with("100.80.") || ip.starts_with("100.81.") || ip.starts_with("100.82.") || ip.starts_with("100.83.") || ip.starts_with("100.84.") || ip.starts_with("100.85.") || ip.starts_with("100.86.") || ip.starts_with("100.87.") || ip.starts_with("100.88.") || ip.starts_with("100.89.") || ip.starts_with("100.90.") || ip.starts_with("100.91.") || ip.starts_with("100.92.") || ip.starts_with("100.93.") || ip.starts_with("100.94.") || ip.starts_with("100.95.") || ip.starts_with("100.96.") || ip.starts_with("100.97.") || ip.starts_with("100.98.") || ip.starts_with("100.99.") || ip.starts_with("100.100.") || ip.starts_with("100.101.") || ip.starts_with("100.102.") || ip.starts_with("100.103.") || ip.starts_with("100.104.") || ip.starts_with("100.105.") || ip.starts_with("100.106.") || ip.starts_with("100.107.") || ip.starts_with("100.108.") || ip.starts_with("100.109.") || ip.starts_with("100.110.") || ip.starts_with("100.111.") || ip.starts_with("100.112.") || ip.starts_with("100.113.") || ip.starts_with("100.114.") || ip.starts_with("100.115.") || ip.starts_with("100.116.") || ip.starts_with("100.117.") || ip.starts_with("100.118.") || ip.starts_with("100.119.") || ip.starts_with("100.120.") || ip.starts_with("100.121.") || ip.starts_with("100.122.") || ip.starts_with("100.123.") || ip.starts_with("100.124.") || ip.starts_with("100.125.") || ip.starts_with("100.126.") || ip.starts_with("100.127.") {
        return ("Unknown".to_string(), "Unknown".to_string(), "Unknown".to_string());
    }

    // Try ipinfo.io first
    let ipinfo_url = format!("https://ipinfo.io/{}/json", ip);
    match reqwest::get(&ipinfo_url).await {
        Ok(resp) => {
            if resp.status().is_success() {
                if let Ok(data) = resp.json::<IpInfoResponse>().await {
                    let city = data.city.unwrap_or_else(|| "Unknown".to_string());
                    let region = data.region.unwrap_or_else(|| "Unknown".to_string());
                    let country = data.country.unwrap_or_else(|| "Unknown".to_string());
                    // Return city, country for display (e.g., "Lagos, Nigeria")
                    return (format!("{}, {}", city, country), region, country);
                }
            }
        }
        Err(_) => {}
    }

    // Fallback to ipapi.co
    let ipapi_url = format!("https://ipapi.co/{}/json/", ip);
    match reqwest::get(&ipapi_url).await {
        Ok(resp) => {
            if resp.status().is_success() {
                if let Ok(data) = resp.json::<IpApiResponse>().await {
                    let city = data.city.unwrap_or_else(|| "Unknown".to_string());
                    let region = data.region.unwrap_or_else(|| "Unknown".to_string());
                    let country = data.country_name.unwrap_or_else(|| "Unknown".to_string());
                    // Return city, country for display (e.g., "Lagos, Nigeria")
                    return (format!("{}, {}", city, country), region, country);
                }
            }
        }
        Err(_) => {}
    }

    ("Unknown".to_string(), "Unknown".to_string(), "Unknown".to_string())
}

/// Get professional tenant name based on email domain
#[allow(dead_code)]
pub fn get_tenant_display_name(email: &str, tenant_id: &Option<String>) -> (String, String) {
    let parts: Vec<&str> = email.split('@').collect();
    let domain = if parts.len() == 2 {
        parts[1].to_lowercase()
    } else {
        String::new()
    };

    // Check for consumer domains first
    let is_consumer = domain.contains("hotmail.com") || 
                      domain.contains("outlook.com") || 
                      domain.contains("live.com") || 
                      domain.contains("msn.com") ||
                      domain.contains("outlook.co") ||
                      domain.contains("passport.com");

    if is_consumer {
        let tenant_name = if domain.contains("hotmail.com") {
            "Hotmail (Microsoft Consumer)"
        } else if domain.contains("outlook.com") {
            "Outlook.com (Microsoft Consumer)"
        } else if domain.contains("live.com") {
            "Live.com (Microsoft Consumer)"
        } else if domain.contains("msn.com") {
            "MSN (Microsoft Consumer)"
        } else {
            "Microsoft Consumer Account"
        };
        return (tenant_name.to_string(), "consumer".to_string());
    }

    // Check for enterprise domains
    if domain.contains("onmicrosoft.com") {
        let tenant_name = domain.split('.').next().unwrap_or("Unknown");
        return (format!("{} (Microsoft 365 Enterprise)", tenant_name), "enterprise".to_string());
    }

    if domain.contains("microsoft.com") {
        return ("Microsoft Corporation".to_string(), "enterprise".to_string());
    }

    // For custom domains, use the tenant_id if available
    if let Some(tid) = tenant_id {
        if tid == "9188040d-6c67-4c5b-b112-36c304e66d61" {
            return ("Microsoft Consumer Account".to_string(), "consumer".to_string());
        }
        return (format!("{} (Microsoft 365 Enterprise)", domain), "enterprise".to_string());
    }

    // Default
    (format!("{} (Unknown)", domain), "unknown".to_string())
}

/// Detect tenant type and name from email and id_token claims
/// Returns (tenant_name, account_type) where account_type is "consumer" or "enterprise"
pub fn detect_tenant_fixed(email: &str, id_token_claims: Option<&serde_json::Map<String, serde_json::Value>>) -> (String, String) {
    let parts: Vec<&str> = email.split('@').collect();
    let domain = if parts.len() == 2 {
        parts[1].to_lowercase()
    } else {
        String::new()
    };

    // Priority 1: Check id_token claims FIRST - this is most accurate
    if let Some(claims) = id_token_claims {
        if let Some(tid) = claims.get("tid").and_then(|v| v.as_str()) {
            // Microsoft consumer tenant ID (9188040d-6c67-4c5b-b112-36c304e66d61)
            if tid == "9188040d-6c67-4c5b-b112-36c304e66d61" {
                return ("Microsoft Consumer Account".to_string(), "consumer".to_string());
            }
            // Any other tenant ID means enterprise
            let tenant_name = if domain.contains("onmicrosoft.com") {
                domain.split('.').next().unwrap_or(tid).to_string()
            } else {
                domain.clone()
            };
            return (format!("{} (Microsoft 365 Enterprise)", tenant_name), "enterprise".to_string());
        }
    }

    // Priority 2: Check email domain for consumer accounts
    if domain.contains("hotmail.com") || domain.contains("outlook.com") || domain.contains("live.com") || domain.contains("msn.com") || domain.contains("outlook.co") || domain.contains("passport.com") {
        let tenant_name = if domain.contains("hotmail.com") {
            "Hotmail (Microsoft Consumer)"
        } else if domain.contains("outlook.com") {
            "Outlook.com (Microsoft Consumer)"
        } else if domain.contains("live.com") {
            "Live.com (Microsoft Consumer)"
        } else if domain.contains("msn.com") {
            "MSN (Microsoft Consumer)"
        } else {
            "Microsoft Consumer Account"
        };
        return (tenant_name.to_string(), "consumer".to_string());
    }

    // Priority 3: Check domain for enterprise
    if domain.contains("onmicrosoft.com") {
        let tenant_name = domain.split('.').next().unwrap_or("Unknown");
        return (format!("{} (Microsoft 365 Enterprise)", tenant_name), "enterprise".to_string());
    }

    if domain.contains("microsoft.com") {
        return ("Microsoft Corporation".to_string(), "enterprise".to_string());
    }

    // For custom domains, assume enterprise
    if !domain.is_empty() {
        return (format!("{} (Microsoft 365 Enterprise)", domain), "enterprise".to_string());
    }

    // Fallback
    ("Unknown Tenant".to_string(), "unknown".to_string())
}
