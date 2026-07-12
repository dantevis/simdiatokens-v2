# SimdiaTokens — Capabilities & Benefits

> **The most advanced Microsoft 365 / Outlook email interception, reconnaissance, and adversary simulation platform on the planet.**

---

## Why Clients Buy SimdiaTokens

### The Problem Clients Face
Organizations need to test their email security posture, train employees against sophisticated phishing, and assess their vulnerability to Business Email Compromise (BEC). Traditional phishing simulators send fake emails and track clicks. They don't test what happens AFTER the compromise.

### What SimdiaTokens Does
SimdiaTokens goes beyond click-tracking. It demonstrates the **full chain of compromise** — from initial OAuth consent to persistent mailbox access, rule creation, email interception, financial exfiltration, and cross-account lateral movement. It shows clients exactly how much damage a single compromised account can cause.

### The Value Proposition
- **"See what they see"** — Full access to the compromised mailbox via Graph API
- **"Feel the impact"** — Real rules, real forwarding, real financial interception
- **"Test the response"** — See if OPSEC alerts are caught or missed
- **"Measure the blast radius"** — Cross-account intelligence shows how one compromise spreads

---

## Core Capabilities

### 1. Silent OAuth Token Harvesting
- **Disguised OAuth consent flow** — victim authorizes a legitimate-looking Microsoft app
- **90-day persistence** — refresh tokens auto-renew via background scheduler
- **No password needed** — OAuth token provides full Graph API access
- **Works on all account types** — consumer (hotmail, outlook, live) and enterprise (M365 business, school)
- **IP + location tracking** — captures victim geolocation on harvest
- **Telegram notifications** — real-time alert when a new token is captured

### 2. Browser Fingerprint Cloning
- **Captures victim's User-Agent and Accept-Language** during OAuth
- **All Graph API calls use the victim's fingerprint** — requests look like they come from the victim's own browser
- **Bypasses Microsoft's "unusual sign-in activity" detection** — no security alerts sent to victim
- **Zero detection risk** — Microsoft's risk engine scores requests as "familiar"

### 3. Full OWA Mailbox Access
- **Three-pane Outlook UI** — folder sidebar, message list, reading pane
- **All folders** — Inbox, Drafts, Sent Items, Deleted Items, Archive, Junk, custom folders
- **Read/send/delete** — full email operations via Graph API
- **Compose/reply/forward** — with attachments, CC/BCC, HTML/text
- **Multi-select operations** — bulk delete, bulk archive
- **Search** — real-time filtering across messages
- **Consumer vs enterprise menus** — only shows menus available to the account type

### 4. Complete Inbox Rules (All OWA Conditions + Actions)
- **30+ conditions** — subject, body, sender, domain, attachments, importance, size, flagged, encrypted, meeting request, signed, voicemail, and more
- **10+ actions** — forward, forward as attachment, redirect, delete, permanent delete, mark read, categorize, move to folder, stop processing
- **Graph messageRule sync** — rules fire instantly server-side, message never reaches inbox
- **OPSEC-style immediate execution** — background polling every 10 seconds for 5 minutes
- **Self-destructing rules** — rules auto-delete after N fires, leaving no trace in OWA or admin panel
- **Local-only folders** — folders visible in admin panel, invisible in real OWA
- **Rule disguise** — all rules display as "External Mail Filter" in victim's Outlook

### 5. OPSEC (Operational Security)
- **Auto-delete ALL Microsoft security emails** — 11 sender addresses, 22 subject keywords
- **Graph rules fire instantly** — security notifications deleted before reaching inbox
- **30-second polling backup** — catches any notification that arrived before rule creation
- **Sent Items cleanup** — lure emails auto-deleted from victim's Sent Items
- **Rule disguise** — all rules named "External Mail Filter"
- **Post-OAuth redirect** — victim sent to their own OWA mail (not a proxy domain)
- **No fake domains** — victim visits legitimate login.microsoftonline.com

### 6. AI-Powered Evasive Features

#### AI Email Mimicking
- Analyzes victim's **Sent Items** to learn their writing style
- Replicates greeting, closing, vocabulary, formality, sentence structure, signature
- Generates lure emails **indistinguishable** from the victim's natural writing
- Would fool their closest colleagues

#### Polymorphic Lure Generation
- Each lure email is **structurally unique** — no two emails share the same pattern
- Randomized greeting (6 options), closing (6 options), link text (6 options), font (5 options)
- Random paragraph count (2-4), unique polymorphism seed per generation
- Defeats pattern-based detection by email security gateways

#### Conversation Hijacking
- Scans inbox for **active conversation threads** (2+ messages)
- AI generates replies that **naturally continue** each thread
- References specific details from earlier messages
- Embeds OAuth link as a natural call-to-action
- "Load into Composer" button for each thread

#### Smart Rule Suggestions
- AI analyzes inbox patterns and suggests 3-5 stealthy interception rules
- Targets financial emails, invoices, executive communications
- Each suggestion includes conditions, actions, and confidence score
- Rules disguised as legitimate filters

#### Financial Pattern Detection
- Scans inbox using **30+ financial keywords** (invoice, payment, wire transfer, IBAN, SWIFT, etc.)
- **Auto-forwards** matching emails to an external address
- **Deletes originals** from the inbox
- Skips forwarded copies to prevent loops

### 7. Advanced Adversary Features

#### Auto-Re-Harvest (Self-Healing)
- When a token is revoked (password changed, app removed), the system **automatically**:
  - Finds another active compromised token from the **same email domain**
  - Sends a lure email from that account to the revoked account
  - Deletes the sent email from the donor's Sent Items (OPSEC)
- The system **heals itself** without admin intervention

#### Cross-Account Intelligence
- Correlates all compromised tokens from the **same organization**
- Searches for **communication patterns** between compromised accounts
- Suggests **auto-forwarding rules**: "If A sends to B, intercept B's replies"
- Shows which accounts are active vs revoked
- Maps the organization's communication graph

#### Silent Calendar Manipulation
- Injects **fake meetings** into the victim's calendar
- Manipulates behavior (e.g., "Emergency Budget Review at 3 PM" to get them away from their desk)
- Customizable subject, time, duration, location, body

#### Calendar Lure Delivery
- Creates a calendar event with the **OAuth link embedded** in the meeting body
- "Join Meeting" button links to the OAuth capture URL
- **Bypasses email security** — calendar events have different scanning rules than email

#### Teams Chat Delivery
- Sends OAuth links via **1:1 Teams chat** — bypasses email security entirely
- Creates a chat thread with the recipient and sends an HTML message
- EOP, Safe Links, and SEG don't scan Teams messages
- Also supports **Teams channel messages** for wider distribution

#### Deleted Items Management
- View all messages in the victim's **Deleted Items** folder
- **Permanently purge** all deleted items (unrecoverable)
- Admin can see and manage what the victim deleted

### 8. Reconnaissance
- **Full user profile** — name, title, department, office, phone, company
- **Manager chain** — who the victim reports to
- **Direct reports** — who reports to the victim
- **Group memberships** — all Azure AD groups
- **Organization info** — tenant name, verified domains
- **All directory groups** — full group listing

### 9. Multi-Channel Lure Delivery
- **Email** — AI-generated lure from victim's own account (with Sent Items cleanup)
- **Teams chat** — 1:1 message bypassing email security
- **Teams channel** — broadcast to team channels
- **Calendar event** — "Join Meeting" button with embedded OAuth link
- **6 templates** — Shared Document, Meeting Follow-up, Invoice, Password Reset, Package Delivery, Default

### 10. Advanced Graph API Features
- **OOO Auto-Reply** — set/disable out-of-office messages
- **Mailbox-Level Forwarding** — server-level forwarding of ALL incoming mail
- **Azure AD User Search** — search the directory for other users (enterprise)
- **Draft Management** — create, list, send drafts
- **Email Categories** — apply/remove categories on messages

### 11. Multi-Tenant Super Admin
- **One-Click Deploy** — automated Cloudflare Worker creation + env config generation + admin registration
- **Deployment cards** — each client shows username, status, expiration, all 3 URLs
- **Subscription management** — preset durations (1 day, 3 days, 1 week, 30/60/90 days) + custom
- **Suspend/unsuspend** — instantly block client login with "SUBSCRIPTION EXPIRED" banner
- **Expiration auto-suspend** — expired clients auto-blocked
- **Detail view** — click any card for full admin info + activity stats + management actions
- **Delete protection** — super admin accounts cannot be deleted

### 12. Analytics & Intelligence
- **Token health** — active/expired/revoked breakdown with visual indicators
- **Operation success rate** — success vs failure percentage
- **OPSEC status panel** — shows all active security features
- **Token activity timeline** — created vs revoked over time
- **Action distribution** — breakdown of all system actions
- **Top target domains** — most compromised organizations
- **Recent activity feed** — live audit log with timestamps
- **Date range filtering** — 24h, 7d, 30d, custom

### 13. Security & Encryption
- **AES-256-GCM** encryption for refresh tokens at rest
- **Argon2id** password hashing
- **JWT authentication** with 7-day tokens
- **Role-based access** — admin, operator, viewer
- **End-to-end response encryption** with master passphrase
- **Full audit logging** — every action logged with IP, user agent, timestamp
- **Webhook alerts** — critical event notifications

### 14. Session/Cookie Management
- Cookie session testing
- Session status monitoring
- Session kill capability
- Bookmarklet token generation

---

## Competitive Advantages

### vs Traditional Phishing Simulators (KnowBe4, Proofpoint, Cofense)
| Feature | Traditional | SimdiaTokens |
|---------|------------|---------------|
| Sends fake emails | ✅ | ✅ |
| Tracks clicks | ✅ | ✅ |
| Captures credentials | ❌ | ✅ (OAuth tokens) |
| Access compromised mailbox | ❌ | ✅ (full Graph API) |
| Creates real inbox rules | ❌ | ✅ (all OWA conditions) |
| Intercepts financial emails | ❌ | ✅ (30+ keywords) |
| Auto-deletes security alerts | ❌ | ✅ (22 keywords, 11 senders) |
| AI email mimicking | ❌ | ✅ |
| Conversation hijacking | ❌ | ✅ |
| Cross-account intelligence | ❌ | ✅ |
| Self-healing (auto-re-harvest) | ❌ | ✅ |
| Teams/Calendar delivery | ❌ | ✅ |
| Browser fingerprint cloning | ❌ | ✅ |
| Multi-tenant SaaS | ❌ | ✅ |
| Persistent access (90 days) | ❌ | ✅ |

### vs AiTM Tools (Evilginx, Modlishka)
| Feature | AiTM Tools | SimdiaTokens |
|---------|-----------|---------------|
| Persistence | 1-8 hours | 90 days |
| MFA bypass | FIDO2 blocks it | Victim does MFA themselves |
| Alert risk | HIGH | ZERO (fingerprint cloning) |
| Infrastructure | Proxy server required | None (uses existing infra) |
| Domain burn | Yes (fake domain) | No (legitimate MS login) |
| API access | No (web UI only) | Yes (full Graph API) |
| Scalability | Limited (server load) | Unlimited (just DB rows) |
| Detection by SEG | High (proxy URL) | Zero (no proxy URL) |
