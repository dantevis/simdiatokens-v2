# SimdiaTokens v2 — Complete System Documentation

> **SimdiaTokens** is a multi-tenant SaaS platform for Microsoft 365 / Outlook email interception, reconnaissance, and adversary simulation. Each tenant (client) gets a fully isolated deployment with its own Cloudflare Worker, Vercel frontend, and Railway backend.

**Version:** 2.1 | **Last Updated:** 2026-06-19 | **Repository:** https://github.com/simdie/simdiatokens-v2

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Multi-Tenant Super Admin](#2-multi-tenant-super-admin)
3. [OAuth Token Harvesting](#3-oauth-token-harvesting)
4. [OPSEC (Operational Security)](#4-opsec-operational-security)
5. [Inbox Rules (Full OWA Rules)](#5-inbox-rules-full-owa-rules)
6. [Mailbox Management (Full OWA Replica)](#6-mailbox-management-full-owa-replica)
7. [Advanced Graph API Features](#7-advanced-graph-api-features)
8. [Reconnaissance](#8-reconnaissance)
9. [Campaigns](#9-campaigns)
10. [Lure Email Generation (AI-Powered)](#10-lure-email-generation-ai-powered)
11. [BEC Detection](#11-bec-detection)
12. [Contacts](#12-contacts)
13. [Calendar](#13-calendar)
14. [OneDrive & Office Apps](#14-onedrive--office-apps)
15. [Tasks (To Do)](#15-tasks-to-do)
16. [Analytics Dashboard](#16-analytics-dashboard)
17. [Security & Encryption](#17-security--encryption)
18. [Settings](#18-settings)
19. [Session/Cookie Management](#19-sessioncookie-management)
20. [API Endpoints Reference](#20-api-endpoints-reference)
21. [Database Schema](#21-database-schema)
22. [Environment Variables](#22-environment-variables)
23. [Deployment Guide](#23-deployment-guide)
24. [Known Limitations](#24-known-limitations)
25. [Planned Enhancements](#25-planned-enhancements)

---

## 1. Architecture Overview

```
SUPER ADMIN (simdia / daniel@2020)
├── /super-admin panel — manages ALL client deployments
│
├── DEPLOYMENT 1: client-a
│   ├── Frontend:  Vercel (simdiatokens-frontend.vercel.app)
│   ├── API:       Railway (baloncloud.eu)
│   ├── Worker:    Cloudflare (simdiatokens-oauth-worker.lubaking-co.workers.dev)
│   └── Database:  SQLite (Railway volume /app/data/simdiatokens.db)
│
├── DEPLOYMENT 2: client-b
│   ├── Frontend:  Vercel (client-b-simdia.vercel.app)
│   ├── API:       Railway (client-b-api.up.railway.app)
│   ├── Worker:    Cloudflare (client-b-simdia-worker.workers.dev)
│   └── Database:  SQLite (Railway volume)
│
└── ... (unlimited deployments, fully isolated)
```

### Tech Stack

| Component | Technology |
|-----------|-----------|
| Frontend | Next.js 16 + TypeScript + Tailwind CSS + shadcn/ui + Framer Motion |
| Backend | Rust / Actix-web + SQLite (persistent volume) |
| Worker | Cloudflare Workers (Module Format) |
| AI | OpenAI GPT-4o Mini |
| Auth | JWT (7-day tokens) + Argon2id password hashing |
| Encryption | AES-256-GCM for refresh tokens, AES-256 for response encryption |

---

## 2. Multi-Tenant Super Admin

### Features
- **Multi-tenant management** — create, edit, delete, suspend client deployments from one panel
- **Deployment cards** — each client shows username, email, role, status, expiration, and all 3 infrastructure URLs (frontend, API, worker)
- **Subscription management** — preset durations (1 day, 3 days, 1 week, 30/60/90 days) + custom input
- **Suspend/unsuspend** — instantly block a client's login with red "SUBSCRIPTION EXPIRED - Contact Admin" banner
- **Expiration auto-suspend** — expired clients auto-blocked on next login attempt
- **Detail view** — click any deployment card for full admin info (identity, subscription, URLs, activity stats, management actions)
- **URL configuration** — set/edit Vercel, Railway, Cloudflare URLs per deployment
- **Super admin isolation** — super admin account (simdia) excluded from deployment list
- **Delete protection** — super admin accounts cannot be deleted via the API

### Default Credentials

| Role | Username | Password | Access |
|------|----------|----------|--------|
| Super Admin | simdia | daniel@2020 | /super-admin panel only |
| Managed Admin | admin | admin12345 | Main dashboard (per deployment) |

---

## 3. OAuth Token Harvesting

### Features
- **Cloudflare Worker OAuth proxy** — disguised OAuth flow captures refresh tokens silently
- **Microsoft Graph API integration** — full access to Mail, Contacts, Calendar, OneDrive, Teams
- **Automatic token refresh** — background scheduler keeps all tokens alive for 90 days
- **Account type detection** — auto-detects consumer (hotmail/outlook/live) vs enterprise (M365 business/school) from id_token claims
- **IP + location tracking** — captures victim IP and geolocation on token capture
- **Telegram notifications** — real-time alert when a new token is harvested
- **Dual-table storage** — `harvested` (display) + `tokens` (encrypted vault)
- **AES-256-GCM encryption** — refresh tokens encrypted at rest

### OAuth Scopes
`openid offline_access User.Read Mail.ReadWrite Mail.Send Contacts.Read MailboxSettings.ReadWrite`

---

## 4. OPSEC (Operational Security)

### Auto-OPSEC — All Microsoft Security Emails Auto-Deleted
When a new OAuth token is harvested, the system immediately creates **2 Graph messageRules** to auto-delete ALL Microsoft security emails:

**Rule 1 — Sender-based (11 sender addresses):**
- `account-security-noreply@accountprotection.microsoft.com`
- `microsoftaccount@microsoft.com`
- `security@microsoft.com`
- `microsoft@communications.microsoft.com`
- `no-reply@accountprotection.microsoft.com`
- `no-reply@microsoft.com`
- `azureadnotification@microsoft.com`
- `no-reply@azureadnotifications.microsoft.com`
- `msonlineservicesteam@microsoftonline.com`
- `no-reply@signin.microsoft.com`
- `account-security-noreply@signin.microsoft.com`

**Rule 2 — Subject-based (22 keywords):**
- New app / New app(s) / have access to your data / connected to your Microsoft
- suspicious sign-in / unusual sign-in / unusual activity
- password changed / password was changed / security alert / security notification
- account security / verify your identity / MFA / two-step verification / two-factor authentication
- review recent activity / help us protect your account / action required / your account was accessed

Both rules fire **instantly server-side** — the notification is deleted before it reaches the inbox. A 30-second polling backup also runs with 20 search queries covering all known notification phrases.

### Sent Items Cleanup
When a lure email is sent from the victim's account, the system **automatically deletes it from Sent Items** so the victim never sees it was sent. Uses fingerprint-aware Graph API calls.

### Rule Disguise
All created inbox rules display as **"External Mail Filter"** in the victim's Outlook rules list.

### Browser Fingerprint Cloning
All Graph API calls use the victim's real User-Agent and Accept-Language headers, captured during OAuth. This makes requests look like they come from the victim's own browser, bypassing Microsoft's "unusual sign-in activity" risk detection.

### Auto-Token Rotation
When a token refresh fails (victim changed password or revoked the app), the system:
1. Marks the token as `revoked` in the database
2. Sends a webhook alert with the victim's email and "re-harvest" action required
3. Logs an audit entry so the admin knows to send a new lure email

### Post-OAuth Redirect
After OAuth, the victim is redirected to their own OWA mail:
- Enterprise → `https://outlook.office.com/mail/0/`
- Consumer → `https://outlook.live.com/mail/0/`

The victim never sees the proxy domain.

---

## 5. Inbox Rules (Full OWA Rules)

### Architecture — Two-Tier Execution

**Tier 1: Graph messageRule (instant, server-side)**
- Non-folder actions (delete, permanentDelete, forwardTo, forwardAsAttachmentTo, redirectTo, markAsRead, assignCategories, stopProcessingRules) fire **instantly** via Graph messageRule
- The message is deleted/forwarded **before it reaches the inbox** — user never sees it
- Exactly like OPSEC notification auto-delete

**Tier 2: OPSEC-style immediate execution (background polling)**
- When a rule is created, a background task spawns and polls the inbox every 10 seconds for 5 minutes
- Matches messages against all rule conditions and applies actions via Graph API
- Fetches ONLY from Inbox (not Sent Items) to prevent infinite forwarding loops
- Skips messages from the account owner and "fw:"/"fwd:" subjects
- Tracks processed message IDs to prevent re-processing

**Tier 3: Local-only fallback (for consumer accounts where Graph rule creation fails)**
- Local engine handles all actions during periodic inbox sync
- moveToFolder is always local-only (invisible in real OWA, visible in admin panel)

### All Supported Conditions
- **Text matching**: subjectContains, bodyContains, bodyOrSubjectContains, senderContains, fromAddresses, fromAddressContains, recipientContains, headerContains
- **Boolean flags**: hasAttachments, sentOnlyToMe, sentToMe, notSentToMe, sentToOrCcMe, isApprovalRequest, isAutomaticForward, isAutomaticReply, isEncrypted, isMeetingRequest, isMeetingResponse, isNonDeliveryReport, isPermissionControlled, isReadReceipt, isSigned, isVoicemail, flagged
- **Structured**: importance, messageActionFlag, withinSizeRange (min/max)

### All Supported Actions
- **Folder (local-only)**: moveToFolder, copyToFolder
- **Forwarding (real OWA)**: forwardTo, forwardAsAttachmentTo, redirectTo
- **Boolean**: delete, permanentDelete, markAsRead, stopProcessingRules
- **Structured**: markAsImportance, assignCategories

### Deleted Items Management
- `GET /api/inbox/deleted-items/{token_id}` — fetch all messages from real OWA Deleted Items
- `POST /api/inbox/deleted-items/{token_id}/purge` — permanently delete ALL messages in Deleted Items (unrecoverable)

---

## 6. Mailbox Management (Full OWA Replica)

### Three-Pane Outlook UI
- **Sidebar**: Mail, Calendar, People, To Do, OneDrive, Office Apps (enterprise-only menus hidden for consumer accounts)
- **Message list**: sender, subject, preview, date, read status, attachment indicator
- **Reading pane**: full HTML rendering, text fallback

### Email Operations
- **Read**: full body (HTML + text) with clickable links
- **Compose**: To, CC, BCC, Subject, Body, attachments, content type (HTML/Text)
- **Reply / Reply All / Forward**: pre-filled with original message
- **Delete**: single + multi-select bulk delete from real mailbox
- **Mark read/unread**: syncs to real Outlook via Graph API
- **Move**: move messages between folders
- **Flag/Pin**: flag and pin messages
- **Report junk**: move to Junk Email folder
- **Search**: real-time filtering by subject, sender, body

### Folder Navigation
- All OWA folders: Inbox, Drafts, Sent Items, Deleted Items, Archive, Junk Email, Outbox, Conversation History
- **Local folders** (Starred): stored in SQLite only, invisible to victim's real Outlook
- Rule-created folders appear in admin panel, not in real OWA
- Sidebar is fully scrollable

---

## 7. Advanced Graph API Features

### Out-of-Office Auto-Reply
- `GET /api/mailbox/settings/{token_id}` — get current OOO status and message
- `POST /api/mailbox/auto-reply/{token_id}` — set OOO auto-reply (internal + external)
- `POST /api/mailbox/auto-reply/{token_id}/disable` — disable OOO

### Mailbox-Level Forwarding
- `POST /api/mailbox/forwarding/{token_id}` — set server-level forwarding (ALL incoming mail forwarded)
- `POST /api/mailbox/forwarding/{token_id}/disable` — disable forwarding

### Azure AD Directory Search
- `GET /api/directory/users/{token_id}?q=search` — search Azure AD for users by name, email, or UPN (enterprise only)

### Draft Management
- `GET /api/drafts/{token_id}` — list all draft messages
- `POST /api/drafts/{token_id}` — create a new draft
- `POST /api/drafts/{token_id}/{message_id}/send` — send a draft

### Email Categories
- `POST /api/messages/{token_id}/{message_id}/categories` — apply/remove categories on messages

---

## 8. Reconnaissance

### Data Collected
- **User Profile** (`/me`): displayName, email, jobTitle, department, officeLocation, phone, company
- **Manager** (`/me/manager`): displayName, email, jobTitle, department
- **Direct Reports** (`/me/directReports`): full list with names, emails, titles
- **Group Memberships** (`/me/memberOf`): all Azure AD groups
- **Organization** (`/organization`): tenant name, verified domains
- **All Groups** (`/groups`): full directory group listing

### Implementation
- Uses `retrieve_any_token` (checks both vault and harvested tables)
- Refreshes access token before Graph API calls
- 1-3 second jitter between calls for rate-limiting

---

## 9. Campaigns

### Features
- **OAuth link generation** — generates disguised OAuth consent URLs via Cloudflare Worker
- **Per-campaign tracking** — each campaign has its own tokens and metadata
- **Token management** — view, refresh, revoke captured tokens per campaign
- **Status tracking**: pending → authenticated → revoked/expired

---

## 10. Lure Email Generation (AI-Powered)

### AI Integration
- Uses **OpenAI GPT-4o Mini** via `OPENAI_API_KEY` environment variable
- Anti-spam system prompt: natural language, no trigger words, contextual personalization
- Returns JSON with subject, plain text body, and HTML body

### 6 Templates
1. **Shared Document** — appears to share a file via OneDrive/SharePoint
2. **Meeting Follow-up** — appears to follow up from a Teams meeting
3. **Invoice** — appears to be a routine vendor invoice
4. **Password Reset** — appears to be an IT password expiration notice
5. **Package Delivery** — appears to be a delivery confirmation
6. **Default** — generic business email

### Fallback
When AI key is not configured, template-based generation produces realistic emails with anti-spam techniques.

---

## 11. BEC Detection

### Features
- Scans inbox for conversation threads with 2+ messages
- Matches against 100+ financial and crypto keywords
- Shows expandable conversation threads with keyword pills
- All from real Graph API — no mock data

---

## 12. Contacts

### Features
- Full contact list from Graph API
- Contact details: name, email, phone, job title, company, department
- CRUD operations: create, update, delete contacts
- Email extraction from message bodies
- Office-only filter with 3-layer detection (static domains, MX-verified M365, manual whitelist)

---

## 13. Calendar

### Features
- Event list with subject, location, attendees, time
- Event details and full body
- Create calendar events
- Enterprise only — hidden for consumer accounts

---

## 14. OneDrive & Office Apps

### Features
- OneDrive file browser with folder navigation
- File search across OneDrive
- Download URLs for any file
- Office documents (Word, Excel, PowerPoint) embed URLs
- Enterprise only — hidden for consumer accounts

---

## 15. Tasks (To Do)

### Features
- Task lists from Microsoft To Do
- Task CRUD: create, update, delete tasks
- Enterprise only — hidden for consumer accounts

---

## 16. Analytics Dashboard

### KPIs
- Active tokens, revoked tokens, total campaigns, rules created (30d)

### Charts
- Token activity timeline (created vs revoked)
- Action distribution (recon, rule_created, token_stored, etc.)
- Top domains with token counts

### Activity Feed
- Recent audit logs with timestamp, action, token, email, success/failure
- Date range filtering (24h, 7d, 30d, custom)

---

## 17. Security & Encryption

### Authentication
- JWT-based (7-day expiry)
- Argon2id password hashing
- Role-based access: admin (full), operator (limited), viewer (read-only)
- Super admin role for multi-tenant management

### Encryption
- AES-256-GCM for refresh tokens at rest
- AES-256 response encryption with master passphrase
- Passphrase stored in sessionStorage (cleared on tab close)

### Audit Logging
- Every action logged with IP, user agent, timestamp, success/failure
- Webhook alerts for critical events (token_stored, rule_created, token_authenticated)

---

## 18. Settings

### Features
- **AI configuration** — OpenAI API key, model, max tokens
- **Encryption management** — set/change master passphrase
- **Stealth mode** — toggle stealth configuration
- **Rules management** — view all rules across all tokens, expand details, delete
- **Purge expired tokens** — bulk delete expired/revoked tokens
- **Webhook testing** — test Telegram webhook
- **Password change** — change admin password

---

## 19. Session/Cookie Management

### Features
- Cookie session testing — test cookie-based OWA access
- Session status check
- Session kill — revoke active sessions
- Bookmarklet token generation for in-browser access

---

## 20. API Endpoints Reference

### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/login` | JWT login |
| POST | `/api/auth/register` | Register new user |
| GET | `/api/auth/me` | Current user profile |
| POST | `/api/auth/change-password` | Change password |

### Super Admin
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admins` | List all deployments (super admin only) |
| POST | `/api/admins` | Create new deployment |
| PATCH | `/api/admins/{id}` | Update deployment |
| DELETE | `/api/admins/{id}` | Delete deployment |

### Tokens
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/tokens` | List all tokens |
| DELETE | `/api/tokens` | Delete tokens |
| GET | `/api/tokens/health` | Token health summary |
| POST | `/api/tokens/store` | Store a token |
| GET | `/api/tokens/{id}` | Get token details |
| POST | `/api/refresh` | Refresh a token |

### Inbox
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/inbox` | Fetch inbox messages |
| GET | `/api/inbox/folders` | List mail folders |
| POST | `/api/inbox/folders` | Create folder |
| GET | `/api/inbox/folders/{id}` | Folder messages |
| DELETE | `/api/inbox/folders/{id}` | Delete folder |
| POST | `/api/inbox/send` | Send email |
| DELETE | `/api/inbox/messages/{id}` | Delete message |
| POST | `/api/inbox/messages/{id}/move` | Move message |
| PATCH | `/api/inbox/messages/{id}/read` | Mark read/unread |
| GET | `/api/inbox/contacts` | Fetch contacts |
| POST | `/api/inbox/mx-check` | MX lookup for M365 detection |
| POST | `/api/inbox/auto-filter` | Run BEC auto-filter |
| GET | `/api/inbox/deleted-items/{token_id}` | Fetch deleted items |
| POST | `/api/inbox/deleted-items/{token_id}/purge` | Purge deleted items |

### Rules
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/rules?token_id=X` | List rules |
| POST | `/api/rules/create` | Create rule |
| DELETE | `/api/rules/{id}` | Delete rule |
| PUT | `/api/rules/{id}` | Update rule |
| GET | `/api/rules/graph?token_id=X` | Fetch Graph rules |
| POST | `/api/rules/run` | Run local rules |
| POST | `/api/rules/ai-suggest` | AI rule suggestions |

### Advanced Graph API
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/mailbox/settings/{token_id}` | Get mailbox settings |
| POST | `/api/mailbox/auto-reply/{token_id}` | Set OOO auto-reply |
| POST | `/api/mailbox/auto-reply/{token_id}/disable` | Disable OOO |
| POST | `/api/mailbox/forwarding/{token_id}` | Set mail forwarding |
| POST | `/api/mailbox/forwarding/{token_id}/disable` | Disable forwarding |
| GET | `/api/directory/users/{token_id}?q=X` | Search Azure AD users |
| GET | `/api/drafts/{token_id}` | List drafts |
| POST | `/api/drafts/{token_id}` | Create draft |
| POST | `/api/drafts/{token_id}/{msg_id}/send` | Send draft |
| POST | `/api/messages/{token_id}/{msg_id}/categories` | Apply categories |

### Other
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/recon/run` | Run reconnaissance |
| GET | `/api/recon/{token_id}` | Get recon report |
| GET | `/api/contacts` | List contacts |
| POST | `/api/contacts` | Create contact |
| PATCH | `/api/contacts/{id}` | Update contact |
| DELETE | `/api/contacts/{id}` | Delete contact |
| GET | `/api/tasks/lists` | Task lists |
| GET | `/api/tasks` | List tasks |
| POST | `/api/tasks` | Create task |
| GET | `/api/onedrive/items` | OneDrive items |
| GET | `/api/office/docs` | Office documents |
| GET | `/api/calendar/events` | Calendar events |
| GET | `/api/teams` | Teams list |
| POST | `/api/lure/generate` | AI lure generation |
| GET | `/api/analytics/overview` | Analytics |
| GET | `/api/audit/logs` | Audit logs |
| GET | `/api/settings/ai` | AI settings |
| POST | `/api/settings/ai` | Update AI settings |
| POST | `/api/maintenance/purge-expired` | Purge expired tokens |

---

## 21. Database Schema

### users
```sql
CREATE TABLE users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    email TEXT,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'viewer',
    super_admin BOOLEAN NOT NULL DEFAULT 0,
    suspended BOOLEAN NOT NULL DEFAULT 0,
    expires_at DATETIME,
    usage_days INTEGER,
    api_url TEXT,
    frontend_url TEXT,
    worker_url TEXT,
    created_at DATETIME NOT NULL
);
```

### harvested
```sql
CREATE TABLE harvested (
    id TEXT PRIMARY KEY,
    email TEXT,
    access_token TEXT,
    refresh_token TEXT,
    expires_at DATETIME,
    captured_at DATETIME,
    source TEXT,
    ip_address TEXT,
    location TEXT,
    tenant_id TEXT,
    category TEXT,
    account_type TEXT,
    last_refreshed_at DATETIME,
    status TEXT
);
```

### created_rules
```sql
CREATE TABLE created_rules (
    id TEXT PRIMARY KEY,
    token_id TEXT,
    graph_rule_id TEXT,
    display_name TEXT,
    disguise_name TEXT DEFAULT 'External Mail Filter',
    conditions_json TEXT,
    actions_json TEXT,
    target_folder TEXT,
    forward_to TEXT,
    created_at DATETIME,
    status TEXT DEFAULT 'active'
);
```

### audit_logs
```sql
CREATE TABLE audit_logs (
    id TEXT PRIMARY KEY,
    timestamp DATETIME,
    action TEXT,
    campaign_id TEXT,
    token_id TEXT,
    user_email TEXT,
    ip_address TEXT,
    user_agent TEXT,
    details TEXT,
    success BOOLEAN
);
```

---

## 22. Environment Variables

### Required
| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | SQLite path (e.g., `sqlite:/app/data/simdiatokens.db`) |
| `JWT_SECRET` | JWT signing secret |
| `CLIENT_ID` | Azure AD app client ID |
| `CLIENT_SECRET` | Azure AD app client secret |
| `REDIRECT_URI` | OAuth redirect URI (worker URL + /oauth/callback) |
| `OPENAI_API_KEY` | OpenAI API key for AI features |

### Optional
| Variable | Description |
|----------|-------------|
| `MASTER_SECRET` | Response encryption key |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token for notifications |
| `TELEGRAM_CHAT_ID` | Telegram chat ID |
| `WEBHOOK_URL` | Custom webhook for alerts |
| `CF_API_TOKEN` | Cloudflare API token |
| `CF_ACCOUNT_ID` | Cloudflare account ID |
| `CF_WORKER_NAME` | Worker name |
| `CF_WORKERS_SUBDOMAIN` | Workers subdomain |

---

## 23. Deployment Guide

### Backend (Railway)
1. Go to [Railway Dashboard](https://railway.app/dashboard)
2. New Project → Deploy from GitHub repo → select `simdie/simdiatokens-v2`
3. Root directory: `SimdiaTokens/simdiatokens_server`
4. Add volume: mount path `/app/data`
5. Add environment variables (see above)
6. Deploy — wait ~2 minutes
7. Note the URL (e.g., `https://baloncloud.eu`)

### Cloudflare Worker
1. Go to [Cloudflare Workers Dashboard](https://dash.cloudflare.com)
2. Find or create `simdiatokens-oauth-worker`
3. Set environment variables:
   - `MAIN_SERVER` = your Railway URL
   - `CLIENT_ID` = your Azure AD client ID
   - `REDIRECT_URI` = `https://your-worker.workers.dev/oauth/callback`
4. Deploy worker script from `SimdiaTokens/worker/simdiatokens-oauth-worker/src/index.js`

### Frontend (Vercel)
1. Go to [Vercel Dashboard](https://vercel.com)
2. Import GitHub repo: `simdie/simdiatokens-v2`
3. Root directory: `SimdiaTokens-frontend`
4. Framework: Next.js
5. Environment variables:
   - `NEXT_PUBLIC_API_URL` = your Railway URL
   - `NEXT_PUBLIC_WORKER_URL` = your Cloudflare Worker URL
6. Deploy

### Azure AD App Registration
1. [Azure Portal](https://portal.azure.com) → Azure AD → App Registrations
2. Find app with your `CLIENT_ID`
3. Authentication → Add redirect URI for each worker
4. API permissions: Microsoft Graph (delegated): Mail.ReadWrite, Mail.Send, Contacts.Read, User.Read, MailboxSettings.ReadWrite, openid, offline_access

---

## 24. Known Limitations

1. **Graph API tokens cannot be converted to browser cookies** — direct OWA web login requires AiTM proxy. The inbox UI provides full functional equivalent via Graph API.
2. **Token revocation** — Microsoft does not support programmatic revocation. Delete operations remove tokens from local DB only.
3. **SQLite** — single-node database. For multi-node, migrate to PostgreSQL.
4. **Consumer accounts** — some Graph API features (directory search, organization info) are enterprise-only.

---

## 25. Planned Enhancements

### Evasive AI-Powered Enhancements (Planned)
1. **AI-powered email mimicking** — analyze victim's sent emails to learn writing style, generate lures matching their tone
2. **Smart rule suggestions** — AI analyzes inbox patterns and auto-suggests interception rules
3. **Auto-pilot mode** — AI monitors inbox in real-time, auto-creates/adjusts rules without admin intervention
4. **Sentiment-based timing** — AI determines optimal send times for lure emails
5. **Conversation hijacking** — AI detects active threads and injects contextual replies
6. **Smart contact mapping** — AI builds relationship graph from email interactions
7. **Auto-OPSEC** — AI monitors for security alerts and auto-deletes them
8. **Polymorphic lures** — AI ensures no two lure emails share the same structure
9. **Browser fingerprint cloning** — clone victim's browser fingerprint for cookie-based sessions
10. **Auto-token rotation** — AI detects when a token is about to be revoked and harvests a new one

### Additional Graph API Features (Planned)
1. SharePoint integration — browse sites, access shared documents
2. Teams chat — read/send Teams messages, channel history
3. Planner integration — view/manipulate Microsoft Planner tasks
4. Power BI — access dashboards and reports (enterprise)
5. Message trace — track email delivery status (enterprise admin)
6. Junk email rules — manage junk email filter rules

---

**Document Version:** 2.0
**Last Updated:** 2026-06-19
**Project:** SimdiaTokens v2 — Multi-Tenant
**Repository:** https://github.com/simdie/simdiatokens-v2







