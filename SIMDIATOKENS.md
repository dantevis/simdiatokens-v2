# SimdiaTokens — Full System Features & Benefits

## Overview

SimdiaTokens is a multi-tenant SaaS platform for Microsoft 365 / Outlook email interception, reconnaissance, and adversary simulation. Each tenant (client) gets a fully isolated deployment with its own Cloudflare Worker, Vercel frontend, and Railway backend.

---

## 1. OAuth Token Harvesting

### Features
- **Cloudflare Worker OAuth proxy** — disguised OAuth flow that captures refresh tokens
- **Microsoft Graph API integration** — full access to Mail, Contacts, Calendar, OneDrive, Teams
- **Automatic token refresh** — background scheduler keeps all tokens alive for 90 days
- **Account type detection** — auto-detects consumer (hotmail/outlook/live) vs enterprise (M365 business/school)
- **IP + location tracking** — captures victim IP and geolocation on token capture
- **Telegram notifications** — real-time alert when a new token is harvested

### Benefits
- Persistent, silent access to target mailboxes without passwords
- Works across all Microsoft account types (consumer + enterprise)
- No user interaction required after initial OAuth consent

---

## 2. Inbox Rules (Graph + Local)

### Features
- **Full OWA messageRule support** — all Graph API conditions and actions
- **Conditions**: subjectContains, bodyContains, bodyOrSubjectContains, senderContains, fromAddresses, fromAddressContains, recipientContains, headerContains, hasAttachments, sentOnlyToMe, sentToMe, notSentToMe, sentToOrCcMe, isApprovalRequest, isAutomaticForward, isAutomaticReply, isEncrypted, isMeetingRequest, isMeetingResponse, isNonDeliveryReport, isPermissionControlled, isReadReceipt, isSigned, isVoicemail, flagged, importance, messageActionFlag, withinSizeRange
- **Actions**: forwardTo, forwardAsAttachmentTo, redirectTo, delete, permanentDelete, markAsRead, markAsImportance, assignCategories, moveToFolder, copyToFolder, stopProcessingRules
- **OPSEC-style immediate execution** — background task polls inbox every 10 seconds for 5 minutes after rule creation, applies actions instantly via Graph API
- **Graph messageRule sync** — rules created as real OWA inbox rules that fire instantly server-side (message never reaches inbox)
- **Local-only fallback** — rules work even when Graph rule creation fails (consumer accounts)
- **Folder management** — local folders visible in admin panel, invisible in real OWA
- **Rule disguise** — all rules display as "External Mail Filter" in real OWA

### Benefits
- Messages matching rules NEVER appear in the victim's inbox (permanent delete + forward)
- External email forwarding happens instantly and silently
- Admin panel shows all rules and filtered messages across all tokens

---

## 3. OPSEC (Operational Security)

### Features
- **Auto-delete Microsoft notification emails** — Graph messageRules instantly delete "New app connected" notifications before they reach the inbox
- **Notification email polling** — 30-second background sweep as backup
- **Rule disguise** — all created rules show as "External Mail Filter"
- **Victim redirect** — post-OAuth redirect goes to the org/tenant OWA mail (not a proxy domain)

### Benefits
- Victim never sees Microsoft's security warning about new app access
- Rules are invisible in the victim's Outlook rules list (disguised name)

---

## 4. Mailbox Management (Full OWA Replica)

### Features
- **Inbox view** — full message list with sender, subject, preview, timestamp
- **Folder navigation** — all OWA folders (Inbox, Sent, Drafts, Archive, Deleted Items, Junk, etc.)
- **Message operations** — delete, archive, move, mark read/unread, flag, pin, report junk, recall, resend
- **Compose/reply/forward** — full email composition with rich text, attachments, CC/BCC
- **Multi-select delete** — bulk delete messages from real mailbox
- **Deleted Items management** — view and permanently purge all deleted items
- **Search** — full-text search across messages
- **BEC filter** — automatic Business Email Compromise detection

### Benefits
- Admin has full OWA functionality without needing the victim's password
- All actions are performed on the real mailbox via Graph API

---

## 5. Reconnaissance

### Features
- **User profile** — full Graph /me profile (name, job title, department, office, phone)
- **Org chart** — manager chain and direct reports
- **Group memberships** — all Azure AD groups the user belongs to
- **Organization info** — tenant name, verified domains
- **Directory summary** — total user count in tenant

### Benefits
- Map the target organization's structure for targeted attacks
- Identify high-value targets (executives, finance, IT admins)

---

## 6. Campaigns

### Features
- **OAuth link generation** — generates disguised OAuth consent URLs
- **Per-campaign tracking** — each campaign has its own tokens and metadata
- **Token management** — view, refresh, revoke captured tokens per campaign
- **Deployment tracking** — each admin/deployment has its own campaign history

### Benefits
- Organize token harvesting by target group or engagement
- Track which campaigns are most effective

---

## 7. Lure Email Generation (AI-Powered)

### Features
- **OpenAI GPT-4o Mini integration** — uses OPENAI_API_KEY from env
- **6 templates**: shared_document, meeting_followup, invoice, password_reset, package_delivery, default
- **Anti-spam evasion** — natural language, no trigger words, human-like imperfections
- **HTML + plain text** — both formats generated, Outlook-compatible inline CSS
- **Personalization** — uses target name, email, domain, and context

### Benefits
- Generate convincing phishing emails that bypass ML spam filters
- No manual email writing — AI creates contextual, personalized lures

---

## 8. BEC (Business Email Compromise) Detection

### Features
- **AI-powered analysis** — scans inbox for BEC patterns (wire fraud, fake invoices, CEO fraud)
- **Risk scoring** — messages scored for BEC likelihood
- **Auto-filter** — suspicious messages moved to filtered folder

### Benefits
- Identify ongoing BEC attacks against the target organization
- Collect evidence of financial fraud attempts

---

## 9. Contacts

### Features
- **Full contact list** — all contacts from Graph API
- **Contact details** — name, email, phone, job title, company, department
- **CRUD operations** — create, update, delete contacts
- **Email extraction** — extract email addresses from message bodies

### Benefits
- Build target lists for spear-phishing campaigns
- Identify key contacts in the target organization

---

## 10. Calendar

### Features
- **Event list** — upcoming calendar events
- **Event details** — subject, location, attendees, time
- **Create events** — add fake meetings to victim's calendar
- **Enterprise only** — hidden for consumer accounts

### Benefits
- Know when the victim is busy/away for timing attacks
- Inject fake meetings to manipulate victim behavior

---

## 11. OneDrive & Office Apps

### Features
- **OneDrive file browser** — navigate folders, view files
- **File search** — search across OneDrive
- **Download links** — generate download URLs for any file
- **Office documents** — Word, Excel, PowerPoint embed URLs
- **Enterprise only** — hidden for consumer accounts

### Benefits
- Access sensitive documents stored in OneDrive
- Identify valuable files for exfiltration

---

## 12. Tasks (To Do)

### Features
- **Task lists** — view all Microsoft To Do lists
- **Task CRUD** — create, update, delete tasks
- **Enterprise only** — hidden for consumer accounts

### Benefits
- Monitor victim's task list for project details and deadlines
- Inject fake tasks to manipulate victim behavior

---

## 13. Analytics Dashboard

### Features
- **KPI overview** — active tokens, revoked tokens, total campaigns, rules created (30d)
- **Token timeline** — daily token creation/revocation chart
- **Action distribution** — breakdown of all actions (token_stored, rule_created, etc.)
- **Top domains** — most common email domains across tokens
- **Recent activity** — live audit log feed
- **Audit logs** — full searchable log of all actions with IP, user agent, timestamp

### Benefits
- Track engagement effectiveness at a glance
- Monitor system health and activity patterns

---

## 14. Super Admin Panel

### Features
- **Multi-tenant management** — create, edit, delete, suspend client deployments
- **Deployment cards** — each client shows username, email, role, status, expiration, URLs (frontend, API, worker)
- **Subscription management** — preset durations (1 day, 3 days, 1 week, 30/60/90 days) + custom input
- **Suspend/unsuspend** — instantly block a client's login with "SUBSCRIPTION EXPIRED" banner
- **Expiration auto-suspend** — expired clients auto-blocked on next login attempt
- **Detail view** — click any deployment card for full info (identity, subscription, URLs, activity, actions)
- **URL configuration** — set/edit Vercel, Railway, Cloudflare URLs per deployment
- **Super admin isolation** — super admin account (simdia) is excluded from deployment list

### Benefits
- Manage unlimited client deployments from one panel
- Instant revenue control — suspend non-paying clients
- Full visibility into each client's infrastructure

---

## 15. Security & Encryption

### Features
- **End-to-end response encryption** — AES-256 encryption for sensitive API responses
- **Master passphrase** — admin enters passphrase to decrypt responses (stored in sessionStorage)
- **JWT authentication** — 7-day tokens with role-based access control
- **Role-based permissions** — admin (full), operator (limited), viewer (read-only)
- **Password hashing** — Argon2id hashing for all user passwords
- **Audit logging** — every action logged with IP, user agent, timestamp, success/failure

### Benefits
- Sensitive data is encrypted at rest and in transit
- Full audit trail for compliance and incident response

---

## 16. Settings

### Features
- **AI configuration** — OpenAI API key, model selection, max tokens
- **Encryption management** — set/change master passphrase
- **Stealth mode** — toggle stealth configuration
- **Rules management** — view all rules across all tokens, expand to see details, delete rules
- **Purge expired tokens** — bulk delete expired/revoked tokens
- **Webhook testing** — test Telegram webhook configuration
- **Password change** — change admin password

### Benefits
- Centralized configuration for all system features
- Quick maintenance and cleanup tools

---

## 17. Multi-Tenant Architecture

### Features
- **Full isolation** — each client gets separate Cloudflare Worker, Vercel frontend, Railway backend, SQLite database
- **Independent deployments** — one client being suspended does not affect others
- **Super admin oversight** — super admin manages all deployments from one panel
- **Per-client URLs** — each deployment tracked with its own frontend, API, and worker URLs

### Benefits
- Sell SimdiaTokens as a service to multiple clients
- Each client's data is 100% isolated
- Scale to unlimited clients

---

## 18. Session/Cookie Management

### Features
- **Cookie session testing** — test cookie-based OWA access
- **Session status** — check if session is alive
- **Session kill** — revoke active sessions
- **Bookmarklet token** — generate bookmarklet for in-browser access

### Benefits
- Alternative access method when OAuth tokens are insufficient
- Direct OWA access via cookies for scenarios requiring full web UI

---

## Architecture

```
SUPER ADMIN (simdia / daniel@2020)
├── /super-admin panel
├── Manages all client deployments
│
├── DEPLOYMENT 1: client-a
│   ├── Frontend:  Vercel (simdiatokens-frontend.vercel.app)
│   ├── API:       Railway (baloncloud.eu)
│   ├── Worker:    Cloudflare (simdiatokens-oauth-worker.lubaking-co.workers.dev)
│   └── Database:  SQLite (Railway volume)
│
├── DEPLOYMENT 2: client-b
│   ├── Frontend:  Vercel (client-b-simdia.vercel.app)
│   ├── API:       Railway (client-b-api.up.railway.app)
│   ├── Worker:    Cloudflare (client-b-simdia-worker.workers.dev)
│   └── Database:  SQLite (Railway volume)
│
└── ... (unlimited deployments)
```

## Default Credentials

| Role | Username | Password | Access |
|------|----------|----------|--------|
| Super Admin | simdia | daniel@2020 | /super-admin panel only |
| Managed Admin | admin | admin12345 | Main dashboard (per deployment) |

---

**Document Version:** 2.0
**Last Updated:** 2026-06-19
**Project:** SimdiaTokens v2 — Multi-Tenant
