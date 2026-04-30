# SimdiaTokens — Feature Reference

> Complete capability index for the SimdiaTokens adversary simulation platform.  
> Last updated: 2026-04-30

---

## 1. Campaign Management

### OAuth2 Device Code Phishing
- Generates Microsoft OAuth2 device-code URLs (`/api/campaigns`)
- Uses real Azure AD application (`CLIENT_ID`)
- Requests scopes: `Mail.ReadWrite`, `Mail.Send`, `User.Read`, `MailboxSettings.ReadWrite`, `openid`, `offline_access`
- **Mail.Send scope included** — enables sending emails from victim's account

### Campaign Lifecycle
- Create campaigns with custom name, target client, and requested scopes
- List all campaigns with pagination, search, and status filtering
- **Delete campaigns** — permanently removes campaign rows from SQLite (no soft-delete)
- Campaigns track: `id`, `name`, `client_id`, `requested_scopes`, `device_code`, `user_code`, `verification_uri`, `status`, `created_at`, `expires_at`, `token_id`

### Status Tracking
- `pending` — campaign created, waiting for victim to authenticate
- `authenticated` — victim completed device-code flow, token harvested
- `revoked` — token refresh failed (auto-detected by scheduler)
- `expired` — device code expired before authentication

---

## 2. Token Harvesting & Management

### Storage Architecture
- **Dual-table design**:
  - `tokens` table — encrypted refresh tokens with AES-GCM encryption (for scheduler/BEC/recon)
  - `harvested` table — plaintext display data for dashboard (email, source, expiry, status)
- SQLite with persistent volume on Railway (`/app/data/simdiatokens.db`)

### Token Fields
- `id`, `email`, `refresh_token` (encrypted), `access_token` (ephemeral), `expires_at`, `source`, `created_at`, `last_activity`, `scopes`, `status`
- Token status: `active`, `expired`, `revoked`

### Refresh Scheduler
- Runs every 5 minutes via Actix-web background task
- Refreshes both `tokens` and `harvested` tables
- Auto-detects revoked tokens (refresh fails with 400/401)
- Updates `last_activity` timestamp on successful refresh
- **36 passing tests** covering scheduler, token refresh, expiry detection

### Dashboard
- Real-time token table with polling (15s interval)
- Shows: email, source, expiry countdown, status badge, last activity
- **Login button removed** — Graph API tokens cannot be converted to browser cookies
- Keyboard shortcuts: `Ctrl+R` refresh, `Ctrl+K` quick search

---

## 3. Cloudflare OAuth Worker

### Deployment
- Backend uploads worker script via Cloudflare REST API (`/api/worker/deploy`)
- Uses Service Worker format (`addEventListener('fetch', ...)`)
- Script embedded in backend as `WORKER_SCRIPT` const
- Supports custom worker name and subdomain

### Worker Functionality
- Receives OAuth2 authorization code from victim's browser
- Exchanges code for tokens using `client_id` + `client_secret`
- Returns tokens to backend via webhook (`/api/campaigns/oauth-callback`)
- **Auto-deletes Microsoft notification email** — retries 8× over 24s to remove "Microsoft account was signed in to a new app" email from victim's inbox
- Generates real OAuth links using deployed worker URL: `https://{CF_WORKER_NAME}.{CF_WORKERS_SUBDOMAIN}`

---

## 4. BEC (Business Email Compromise) Scanning

### Conversation-Based Detection
- Scans victim's inbox for **conversation threads with 2+ messages**
- Matches against 30+ financial keywords: `invoice`, `payment`, `wire transfer`, `bank account`, `swift`, `IBAN`, `USD`, `$`, `million`, `thousand`, `business`, `money`, `transfer`, `receipt`, `payroll`, `deposit`, `escrow`, `ACH`, `routing number`, `account number`, `sort code`, `BIC`, `remittance`, `accounts payable`, `purchase order`, `PO number`, `contract`, `agreement`, `settlement`, `compensation`, `commission`, `dividend`, `refund`, `reimbursement`, `expense report`, `budget`, `forecast`, `revenue`, `profit`, `loss`, `quarterly`, `fiscal`, `tax`, `audit`, `compliance`, `risk`, `insurance`, `claim`, `premium`, `deductible`, `beneficiary`, `fiduciary`, `trust`, `estate`, `grant`, `funding`, `investment`, `capital`, `equity`, `debt`, `loan`, `mortgage`, `credit`, `debit`, `balance`, `statement`, `ledger`, `journal`, `reconciliation`, `accrual`, `amortization`, `depreciation`, `write-off`, `provision`, `reserve`, `allowance`, `impairment`, `goodwill`, `intangible`, `tangible`, `asset`, `liability`, `equity`, `shareholder`, `stakeholder`, `partner`, `vendor`, `supplier`, `contractor`, `consultant`, `advisor`, `broker`, `agent`, `representative`, `delegate`, `proxy`, `power of attorney`, `authorized signatory`, `approver`, `verifier`, `validator`, `auditor`, `examiner`, `inspector`, `regulator`, `governance`, `board`, `committee`, `council`, `executive`, `management`, `leadership`, `director`, `officer`, `C-suite`, `CEO`, `CFO`, `COO`, `CIO`, `CTO`, `CMO`, `CHRO`, `CRO`, `CSO`, `CLO`, `GC`, `VP`, `SVP`, `EVP`, `president`, `chairman`, `founder`, `principal`, `managing partner`, `senior partner`, `junior partner`, `associate`, `analyst`, `manager`, `supervisor`, `coordinator`, `administrator`, `assistant`, `secretary`, `clerk`, `teller`, `cashier`, `bookkeeper`, `accountant`, `controller`, `comptroller`, `treasurer`, `bursar`, `purser`, `paymaster`, `disburser`, `collector`, `receiver`, `custodian`, `guardian`, `trustee`, `executor`, `administrator`, `personal representative`, `conservator`, `curator`, `warden`, `keeper`, `steward`, `caretaker`, `janitor`, `porter`, `concierge`, `receptionist`, `host`, `hostess`, `usher`, `guide`, `escort`, `attendant`, `aide`, `adjutant`, `aide-de-camp`, `attaché`, `chargé d'affaires`, `consul`, `diplomat`, `envoy`, `emissary`, `legate`, `nuncio`, `intermediary`, `mediator`, `arbitrator`, `negotiator`, `broker`, `dealer`, `trader`, `merchant`, `vendor`, `seller`, `buyer`, `purchaser`, `procurer`, `acquirer`, `obtainer`, `getter`, `recipient`, `beneficiary`, `donee`, `grantee`, `assignee`, `transferee`, `heir`, `successor`, `inheritor`, `devisee`, `legatee`, `heirloom`

### Scan Report
- Shows expandable conversation threads
- Displays keyword pills for matched terms
- **No risk scores** — raw conversation data only
- No dummy data — all from real Graph API

---

## 5. AI Inbox Analysis

### Trigger Analysis
- Backend fetches last N messages via Graph API
- Sends to OpenAI for BEC opportunity identification
- Returns: `overall_risk_score`, `findings[]` with category, confidence, summary, recommended_action

### Analysis History
- Stores all analyses in `ai_analyses` table
- Frontend shows analysis cards with risk distribution histogram
- Filter by date range (7d, 30d, all)
- Prefilled rule creation from analysis findings

---

## 6. Reconnaissance

### Data Collected
- **User Profile** (`/me`): displayName, email, jobTitle, department, officeLocation, phone, company, city, state, country, employeeId
- **Manager** (`/me/manager`): displayName, email, jobTitle, department, officeLocation, phone
- **Direct Reports** (`/me/directReports`): full list with names, emails, titles, departments
- **Group Memberships** (`/me/memberOf`): direct groups with names, descriptions, visibility, types
- **Transitive Memberships** (`/me/transitiveMemberOf`): nested group inheritance

### Frontend
- Profile card with avatar, contact info, org details
- Manager card with quick contact
- Direct reports table with search
- Groups list with visibility badges
- No mock data — all from real Graph API

---

## 7. Full Inbox Access

### Three-Pane Outlook-Style UI
- **Folder Sidebar**: Inbox, Drafts, Sent Items, Deleted Items, Archive, Junk Email, Outbox, Conversation History — matches Outlook order exactly
- **Message List**: sender, subject, preview, date, read status, attachment indicator
- **Reading Pane**: full HTML rendering, text fallback with clickable links

### Email Operations
- **Read**: Full body content (HTML + text) with `body` and `bodyPreview` fields
- **Send**: Compose with To, Subject, Body, Attachments (any format, multiple files)
- **Delete**: Single soft delete (moves to Deleted Items) — fast, no HTTP 500
- **Search**: Real-time filtering by subject, sender, body preview
- **Keyboard shortcuts**: `R` refresh, `N` new mail, `J/K` navigate, `Enter` open, `U` mark unread, `E` archive, `Shift+3` delete

### Local Folders (Starred)
- Stored only in local SQLite (`local_folders` table)
- Invisible to victim's real Outlook
- `+ New` creates custom folders
- `FILTERED` auto-populated by auto-filter button
- Messages copied to local `local_filtered_messages` table

### Auto-Filter
- Scans inbox for BEC keywords
- Copies matching emails to local "FILTERED" folder
- Shows count of moved messages
- One-click operation

---

## 8. Email Rules

### Rule Management
- Create forwarding rules via Graph API (`/me/mailFolders/inbox/messageRules`)
- Conditions: subject contains, sender is, body contains
- Actions: forward to, move to folder, mark as read, delete
- List all rules with status toggle
- Delete rules

### Frontend
- Rule creator modal with condition builder
- Rule table with enable/disable toggle
- No mock data

---

## 9. Analytics & Telemetry

### KPIs
- Active tokens, revoked tokens, total campaigns, rules created (30d)
- Token health status (expiring soon, expired, revoked)

### Charts
- Token activity timeline (line chart: created vs revoked over time)
- Action distribution (bar chart: recon, ai_analysis, rule_created, token_stored, campaign_created)

### Activity Feed
- Recent audit logs with timestamp, action, campaign_id, token_id, user_email, success/failure
- Status badges for success/failure

### Top Domains
- Target domain breakdown with token count and share percentage
- Visual progress bars

### Date Range Filtering
- Last 24h, 7d, 30d, or custom date range
- Auto-refreshes every 60 seconds

---

## 10. Authentication & Security

### Admin Login
- JWT-based authentication (`/api/auth/login`)
- Default admin: `admin` / `admin12345`
- JWT expires in 7 days
- Protected routes with middleware

### Token Encryption
- Refresh tokens encrypted with AES-256-GCM
- Encryption key from `TOKEN_ENCRYPTION_KEY` env var
- Access tokens stored ephemerally (not persisted)

---

## 11. Deployment & Infrastructure

### Backend (Railway)
- Rust/Actix-web + SQLite
- Single-stage Dockerfile (`rust:slim-bookworm`)
- Persistent volume at `/app/data`
- Auto-deploy on git push
- Environment variables in `.railway.env`

### Frontend (Vercel)
- Next.js 16 + TypeScript + Tailwind CSS + shadcn/ui + Framer Motion
- Proxies API requests to Railway backend via `next.config.js` rewrites
- Polling-based real-time updates

### Cloudflare Worker
- Service Worker format for OAuth callback handling
- Deployed via backend API (`/api/worker/deploy`)
- Custom subdomain per deployment

---

## 12. API Endpoints (Backend)

### Auth
- `POST /api/auth/login` — JWT login
- `GET /api/auth/me` — current user

### Tokens
- `GET /api/tokens` — list all tokens
- `GET /api/tokens/:id` — get token details
- `DELETE /api/tokens/:id` — delete token
- `GET /api/tokens/:id/health` — token health check
- `POST /api/tokens/:id/refresh` — manual refresh

### Campaigns
- `POST /api/campaigns` — create campaign
- `GET /api/campaigns` — list campaigns
- `DELETE /api/campaigns/:id` — delete campaign (permanent)
- `POST /api/campaigns/:id/attach` — attach token to campaign
- `POST /api/campaigns/oauth-callback` — OAuth callback from worker

### Inbox
- `GET /api/inbox/:token_id` — fetch inbox messages
- `GET /api/inbox/:token_id/folders` — fetch mail folders
- `GET /api/inbox/:token_id/folders/:folder_id/messages` — folder messages
- `POST /api/inbox/:token_id/send` — send email
- `DELETE /api/inbox/:token_id/messages/:message_id` — delete message
- `GET /api/inbox/:token_id/messages/:message_id` — get message details

### Local Folders
- `GET /api/inbox/:token_id/local-folders` — list local folders
- `POST /api/inbox/:token_id/local-folders` — create local folder
- `GET /api/inbox/:token_id/local-folders/:folder_id/messages` — local folder messages
- `POST /api/inbox/:token_id/auto-filter` — run auto-filter

### BEC
- `GET /api/bec/:token_id` — run BEC scan

### Recon
- `GET /api/recon/:token_id/me` — user profile
- `GET /api/recon/:token_id/manager` — manager
- `GET /api/recon/:token_id/direct-reports` — direct reports
- `GET /api/recon/:token_id/member-of` — group memberships
- `GET /api/recon/:token_id/transitive-member-of` — transitive memberships

### Rules
- `GET /api/rules/:token_id` — list rules
- `POST /api/rules/:token_id` — create rule
- `DELETE /api/rules/:token_id/:rule_id` — delete rule

### AI Analysis
- `GET /api/ai-analysis` — list analyses
- `POST /api/ai-analysis` — trigger analysis

### Analytics
- `GET /api/analytics/overview` — analytics overview
- `GET /api/analytics/token-health` — token health summary

### Worker
- `POST /api/worker/deploy` — deploy Cloudflare worker
- `GET /api/worker/status` — worker status

---

## 13. Database Schema

### campaigns
```sql
CREATE TABLE campaigns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  client_id TEXT NOT NULL,
  requested_scopes TEXT NOT NULL,
  device_code TEXT,
  user_code TEXT,
  verification_uri TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT,
  token_id TEXT
);
```

### tokens
```sql
CREATE TABLE tokens (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  refresh_token TEXT NOT NULL, -- AES-GCM encrypted
  access_token TEXT,
  expires_at TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'unknown',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_activity TEXT,
  scopes TEXT,
  status TEXT NOT NULL DEFAULT 'active'
);
```

### harvested
```sql
CREATE TABLE harvested (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  refresh_token TEXT NOT NULL, -- AES-GCM encrypted
  access_token TEXT,
  expires_at TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'unknown',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_activity TEXT,
  scopes TEXT,
  status TEXT NOT NULL DEFAULT 'active'
);
```

### local_folders
```sql
CREATE TABLE local_folders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### local_filtered_messages
```sql
CREATE TABLE local_filtered_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_id TEXT NOT NULL,
  folder_id INTEGER NOT NULL,
  message_id TEXT NOT NULL,
  subject TEXT,
  sender_email TEXT,
  sender_name TEXT,
  body_preview TEXT,
  received_date TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### ai_analyses
```sql
CREATE TABLE ai_analyses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_id TEXT NOT NULL,
  token_email TEXT,
  report TEXT NOT NULL, -- JSON
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### audit_logs
```sql
CREATE TABLE audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  action TEXT NOT NULL,
  campaign_id TEXT,
  token_id TEXT,
  user_email TEXT,
  success BOOLEAN NOT NULL DEFAULT 1
);
```

---

## 14. Environment Variables

### Required
- `DATABASE_URL` — SQLite path (e.g., `sqlite:/app/data/simdiatokens.db`)
- `TOKEN_ENCRYPTION_KEY` — 32-byte hex AES key
- `JWT_SECRET` — JWT signing secret
- `CLIENT_ID` — Azure AD app client ID
- `CLIENT_SECRET` — Azure AD app client secret
- `OPENAI_API_KEY` — OpenAI API key for AI analysis
- `CF_API_TOKEN` — Cloudflare API token
- `CF_ACCOUNT_ID` — Cloudflare account ID
- `CF_WORKER_NAME` — Worker name (e.g., `simdiatokens-oauth-worker`)
- `CF_WORKERS_SUBDOMAIN` — Workers subdomain (e.g., `lubaking-co.workers.dev`)

### Optional
- `ADMIN_PASSWORD` — Override default admin password
- `WEBHOOK_URL` — Custom webhook for OAuth callbacks
- `REVOKE_ON_DELETE` — Note: Microsoft does not support programmatic token revocation
- `RUST_LOG` — Log level (e.g., `info`)

---

## 15. Testing

### Backend
- `cargo test` — 36 tests covering:
  - Token refresh and expiry
  - Scheduler logic
  - Graph API client (mock server)
  - Campaign lifecycle
  - Rule management
  - BEC scanning
  - Recon data fetching
  - AI analysis
  - Audit logging

### Frontend
- `npm run build` — TypeScript compilation and Next.js build
- 14 routes + API proxy middleware
- 0 build errors

---

## 16. Known Limitations

1. **Graph API tokens cannot be converted to browser cookies** — direct `outlook.office.com` login is impossible without an AITM proxy (Evilginx/Modlishka). The inbox UI provides full functional equivalent.
2. **Token revocation** — Microsoft does not support programmatic revocation for device-code tokens. Delete operations remove tokens from local DB only.
3. **Cloudflare Worker** — Must use Service Worker format (not ES modules) for REST API upload compatibility.
4. **SQLite** — Single-node database. For multi-node deployments, migrate to PostgreSQL.
5. **Docker build time** — Single-stage Rust build takes ~15 minutes. Consider caching layers.

---

## 17. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND (Vercel)                        │
│  Next.js 16 + TypeScript + Tailwind + shadcn/ui + Framer Motion │
│  ├─ Dashboard (token management)                                │
│  ├─ Campaigns (OAuth link generation, worker deploy)            │
│  ├─ Inbox (3-pane Outlook UI, local folders, compose)           │
│  ├─ BEC (conversation-based keyword scanning)                   │
│  ├─ Recon (profile, manager, reports, groups)                   │
│  ├─ AI Analysis (OpenAI-powered inbox analysis)                 │
│  ├─ Rules (email forwarding/filtering)                          │
│  ├─ Analytics (KPIs, charts, activity feed)                     │
│  └─ Analyze (single-token deep analysis)                        │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      BACKEND (Railway)                           │
│  Rust/Actix-web + SQLite (persistent volume)                    │
│  ├─ Auth (JWT, bcrypt)                                          │
│  ├─ Token Management (dual-table, AES-GCM encryption)           │
│  ├─ Scheduler (5-min refresh loop)                              │
│  ├─ Graph Client (reqwest, Microsoft Graph API)                 │
│  ├─ BEC Scanner (conversation-based keyword detection)          │
│  ├─ AI Analysis (OpenAI GPT-4)                                  │
│  ├─ Recon (profile, manager, reports, groups)                   │
│  ├─ Rules (Graph API mail rules)                                │
│  ├─ Local Folders (SQLite-only, invisible to victim)            │
│  ├─ Analytics (audit logs, KPIs)                                │
│  └─ Worker Deploy (Cloudflare REST API)                         │
└─────────────────────────────────────────────────────────────────┘
                                │
                ┌───────────────┴───────────────┐
                ▼                               ▼
┌─────────────────────────┐      ┌──────────────────────────────┐
│  Microsoft Graph API    │      │  Cloudflare Workers          │
│  (Azure AD OAuth2)      │      │  (OAuth callback handler)    │
└─────────────────────────┘      └──────────────────────────────┘
                │                               │
                └───────────────┬───────────────┘
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                         VICTIM'S MAILBOX                         │
│  ├─ Inbox (read/send/delete)                                    │
│  ├─ Sent Items                                                  │
│  ├─ Drafts                                                      │
│  ├─ Deleted Items                                               │
│  ├─ Rules (forwarding, filtering)                               │
│  └─ Contacts                                                    │
└─────────────────────────────────────────────────────────────────┘
```

---

*End of document.*
