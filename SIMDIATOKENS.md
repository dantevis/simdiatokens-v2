# SimdiaTokens: OAuth Token Harvesting System

> **A pure OAuth2 token harvesting platform for authorized penetration testing and red team operations. Uses Microsoft Graph API for full mailbox access without proxy infrastructure.**

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [System Capabilities](#system-capabilities)
3. [Token Flow](#token-flow)
4. [Dashboard Features](#dashboard-features)
5. [Outlook View Features](#outlook-view-features)
6. [Infrastructure](#infrastructure)
7. [Security](#security)
8. [Admin Management](#admin-management)
9. [Deployment](#deployment)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│  ATTACKER SENDS ONE LINK TO VICTIM                      │
│  https://login.microsoftonline.com/... (legitimate)    │
└─────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────┐
│  VICTIM clicks → Microsoft login page (real, trusted)    │
│  Victim enters credentials → Microsoft authenticates      │
└─────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────┐
│  MICROSOFT redirects to Cloudflare Worker callback       │
│  Worker captures: authorization_code                     │
│  Worker exchanges: code → access_token + refresh_token  │
│  ✅ TOKEN CAPTURED (OAuth Token)                         │
└─────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────┐
│  Auth-success page redirects to REAL Outlook             │
│  https://outlook.live.com/owa/                          │
│  Victim never sees attacker's domain                     │
└─────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────┐
│  ATTACKER DASHBOARD:                                     │
│  • OAuth Token (API access to emails, calendar, files)  │
│  • Outlook View (Graph API powered mailbox interface)     │
│  • BEC Filter (Auto-filter financial emails)              │
│  • Rules Engine (Create/manage inbox rules)               │
│  • Contact Extraction (Export all email addresses)        │
│  • Super Admin Panel (Manage admin users)                 │
└─────────────────────────────────────────────────────────┘
```

---

## System Capabilities

### Core Features

| Feature | Description | Status |
|---------|-------------|--------|
| **OAuth Token Capture** | Captures access + refresh tokens via legitimate Microsoft OAuth flow | ✅ Active |
| **Auto-Refresh** | Tokens auto-refreshed every 5 minutes via background scheduler | ✅ Active |
| **Outlook View** | Full mailbox interface using Graph API (emails, calendar, contacts, files) | ✅ Active |
| **BEC Filter** | Automatically filters financial/BEC emails to a separate folder | ✅ Active |
| **Rules Engine** | Create stealth inbox rules (forward, move, mark as read) | ✅ Active |
| **Contact Extraction** | Extract all email contacts from mailbox with copy/export | ✅ Active |
| **Lure Composer** | AI-generated phishing emails with anti-spam features | ✅ Active |
| **Campaign Manager** | Deploy OAuth campaigns with custom scopes | ✅ Active |
| **Super Admin Panel** | Create/manage admin users with expiration and suspension | ✅ Active |
| **Analytics** | Dashboard metrics and audit logging | ✅ Active |

### Removed Components (No Longer Needed)

| Feature | Reason for Removal |
|---------|-------------------|
| **AiTM Cookie Session** | Impossible to implement due to Microsoft's `NoBootJs` detection and browser cross-origin policies |
| **Reverse Proxy** | Microsoft's JavaScript detects proxy domains and returns error before any cookies are set |
| **Ghost Window Capture** | Browser Same-Origin Policy blocks cross-origin cookie reading |
| **Browser Session** | OWA cookies are HttpOnly and cannot be read by JavaScript |

---

## Token Flow

### Step-by-Step Capture Process

1. **Attacker generates OAuth link** via Campaign Manager
2. **Victim clicks link** → legitimate Microsoft login page
3. **Victim logs in** → Microsoft authenticates and redirects
4. **Cloudflare Worker captures** authorization code
5. **Worker exchanges code** for access_token + refresh_token
6. **Token stored** in encrypted database with victim metadata
7. **Auth-success page** redirects victim to real Outlook (outlook.live.com)
8. **Attacker dashboard** shows new token with full access

### What the Victim Sees

- **One legitimate Microsoft link** (login.microsoftonline.com)
- **Real Microsoft login page** (not a phishing page)
- **Real Outlook interface** after login (outlook.live.com)
- **No attacker domain** ever visible to victim

---

## Dashboard Features

### Token Management

- **View all tokens** with email, status, IP, location, account type
- **Refresh tokens** manually with one click
- **Delete tokens** with confirmation
- **Copy email** to clipboard
- **Contact extraction** modal with filter and copy

### Token Display

- **Collapsed by default** (shows email, status, IP, location)
- **First token expanded** always
- **Hover to expand** other tokens (shows refresh time, app buttons)
- **Loading indicators** on all action buttons

### App Buttons

| Button | Function |
|--------|----------|
| **OUTLOOK** | Opens full mailbox view via Graph API |
| **Rules** | Opens rules management page |
| **ONEDRIVE** | Opens OneDrive file browser |
| **EXCHANGE** | Opens mail flow rules (Exchange admin) |
| **Contacts** | Extracts all email contacts from mailbox |
| **Refresh** | Manually refreshes the OAuth token |
| **Delete** | Removes the token from database |

---

## Outlook View Features

### Full Mailbox Interface

- **Email list** with sender, subject, preview, date
- **Reading pane** with full HTML rendering
- **Folder navigation** (Inbox, Sent, Drafts, Archive, Filtered)
- **Search** across all messages
- **Sort** by date, sender, subject, importance

### Email Actions

- **Compose** new emails with HTML editor
- **Reply/Reply All/Forward**
- **Delete** (move to Deleted Items)
- **Archive**
- **Mark as Read/Unread**
- **Flag** for follow-up
- **Move** to folder
- **Pin** important messages

### BEC Filter

- **One-click activation** with loading indicator
- **Auto-scans** last 100 emails for financial keywords
- **Moves suspicious emails** to real Archive folder (invisible to victim)
- **Stores locally** in Filtered folder for attacker review
- **Keywords**: invoice, payment, wire, bank, transfer, USD, SWIFT, IBAN, etc.

### Settings Panel

- **Create inbox rules** (forward, move, delete, categorize)
- **Manage signatures**
- **Auto-reply configuration**
- **Appearance settings**

---

## Infrastructure

### Domains

| Domain | Purpose | Status |
|--------|---------|--------|
| `simdiatokens-frontend.vercel.app` | Admin dashboard | ✅ Active |
| `simdiatokens-production.up.railway.app` | Backend API | ✅ Active |
| `simdiatokens-oauth-worker.lubaking-co.workers.dev` | OAuth callback | ✅ Active |
| `baloncloud.eu` | API domain (Railway custom domain) | ✅ Active |

### Required Services

- **Vercel** (Frontend hosting) - Free tier
- **Railway** (Backend + database) - $5/month
- **Cloudflare** (OAuth Worker + DNS) - Free tier

### Database Schema

- **harvested** - Token storage with metadata
- **tokens** - Encrypted token vault
- **created_rules** - Inbox rules
- **recon_reports** - Reconnaissance data
- **campaigns** - Campaign management
- **audit_logs** - Audit trail
- **local_folders** - Local filtered folders
- **local_filtered_messages** - BEC filtered messages
- **users** - Admin user management

---

## Security

### Authentication

- **JWT-based** authentication with refresh
- **Argon2** password hashing
- **Role-based access** (Admin, Operator, Viewer)
- **Super Admin** role for system management

### Token Security

- **AES-256-GCM** encryption for stored tokens
- **Auto-refresh** every 5 minutes
- **Token revocation** on password change
- **Audit logging** for all actions

### Stealth Features

- **Legitimate OAuth flow** (no phishing pages)
- **Victim never sees attacker domain**
- **Real Outlook redirect** after capture
- **No proxy infrastructure** needed

---

## Admin Management

### Super Admin Panel

Access: `/super-admin` (visible in sidebar for admin users)

**Features:**
- **Create new admins** with username, email, password, role, usage days
- **Edit admin** properties (username, email, password, role, expiration)
- **Suspend/Unsuspend** admins (temporary disable)
- **Delete admins** (permanent removal)
- **Stats dashboard** (Total, Active, Suspended, Super Admins)

### Roles

| Role | Permissions |
|------|------------|
| **Super Admin** | Full access + admin management |
| **Admin** | Full access (no admin management) |
| **Operator** | Tokens, campaigns, inbox, rules |
| **Viewer** | Read-only access |

### Default Login

- **Username:** `admin`
- **Password:** `admin12345`
- **Role:** Super Admin

---

## Deployment

### Quick Deploy

```bash
# 1. Push to GitHub
git add -A
git commit -m "deploy"
git push origin main

# 2. Railway auto-deploys
# 3. Vercel auto-deploys frontend
```

### Environment Variables

```bash
# Required
CLIENT_ID=<microsoft-app-client-id>
CLIENT_SECRET=<microsoft-app-client-secret>
REDIRECT_URI=<callback-url>
DATABASE_URL=<sqlite-url>

# Optional
TELEGRAM_BOT_TOKEN=<telegram-bot-token>
TELEGRAM_CHAT_ID=<telegram-chat-id>
AI_API_KEY=<openai-api-key>
JWT_SECRET=<jwt-secret>
```

---

## Support

If you encounter issues:
1. Check Railway status: https://status.railway.app
2. Check Vercel status: https://status.vercel.com
3. Check Cloudflare status: https://www.cloudflarestatus.com
4. Review logs: Railway Dashboard → Logs
5. Check this guide: `DEPLOY.md`

---

## Disclaimer

This system is designed for **authorized penetration testing, security research, and red team operations only**. Unauthorized access to computer systems is illegal under the Computer Fraud and Abuse Act (CFFA) and similar laws worldwide. Always obtain **explicit written permission** before testing any system you do not own.

---

**Document Version:** 2.0
**Last Updated:** 2026-06-14
**Project:** SimdiaTokens v2
**Repository:** https://github.com/simdie/simdiatokens-v2
