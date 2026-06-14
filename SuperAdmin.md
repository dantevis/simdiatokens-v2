# SuperAdmin.md — SimdiaTokens Multi-Tenant Deployment Guide

> **This document is for the super administrator only.** It describes how to manage multiple independent SimdiaTokens deployments, each assigned to a separate admin/client.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Super Admin Dashboard](#2-super-admin-dashboard)
3. [Creating a New Deployment](#3-creating-a-new-deployment)
4. [Deploying the Admin’s Infrastructure](#4-deploying-the-admins-infrastructure)
5. [Managing Deployments](#5-managing-deployments)
6. [Suspension & Expiration](#6-suspension--expiration)
7. [Revenue Model (Optional)](#7-revenue-model-optional)
8. [Troubleshooting](#8-troubleshooting)

---

## 1. Architecture Overview

### Multi-Tenant Model

SimdiaTokens runs as a **multi-tenant SaaS** where each tenant is an independent deployment.

```
┌─────────────────────────────────────────────────────────────────────┐
│                         SUPER ADMIN (YOU)                            │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  Super Admin Panel (your main dashboard)                      │  │
│  │  • Create / Edit / Delete deployments                         │  │
│  │  • Suspend / Unsuspend / Set expiration                       │  │
│  │  • View all deployment URLs and status                      │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                              │                                      │
│                              │ creates                              │
│                              ▼                                      │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  DEPLOYMENT 1: client-a-admin                               │  │
│  │  ├─ Frontend:  https://client-a.vercel.app                 │  │
│  │  ├─ API:       https://client-a-api.up.railway.app         │  │
│  │  ├─ Worker:    https://client-a-worker.workers.dev         │  │
│  │  └─ Database:  client-a-db (Railway volume)              │  │
│  │                                                               │  │
│  │  DEPLOYMENT 2: client-b-admin                               │  │
│  │  ├─ Frontend:  https://client-b.vercel.app                 │  │
│  │  ├─ API:       https://client-b-api.up.railway.app         │  │
│  │  ├─ Worker:    https://client-b-worker.workers.dev         │  │
│  │  └─ Database:  client-b-db (Railway volume)              │  │
│  │                                                               │  │
│  │  Each deployment is 100% isolated!                           │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### Key Principle

Each admin = one **completely separate** SimdiaTokens instance with its own:
- Cloudflare Worker (OAuth callback)
- Vercel Frontend (dashboard)
- Railway Backend (API + database)
- SQLite Database (tokens, campaigns, logs)

They are **independent**. One deployment being suspended does not affect others.

---

## 2. Super Admin Dashboard

### Access

Your Super Admin Panel is at the same URL as your main admin panel, but with the **Super Admin** link in the sidebar:

```
URL: https://<your-domain>/super-admin
Login: admin / admin12345
```

### What You See

- **Total Deployments**: How many admins have been created
- **Active**: How many are currently active (not suspended)
- **Suspended**: How many are temporarily disabled
- **With URLs**: How many have configured their infrastructure URLs

### Each Deployment Card Shows

- Admin username
- Email address
- Role (admin/operator/viewer)
- Status (Active / Suspended / Expired)
- Expiration date
- Usage days
- **Frontend URL** (clickable link to their dashboard)
- **API URL** (clickable link to their backend)
- **Worker URL** (clickable link to their Cloudflare Worker)

---

## 3. Creating a New Deployment

### Step 1: Create the Admin in Super Admin Panel

1. Login to your super admin dashboard
2. Click **"Create Deployment"** button
3. Fill in the form:

| Field | Example Value | Description |
|-------|---------------|-------------|
| **Username** | `client-a-admin` | Admin login name |
| **Email** | `admin@client-a.com` | Contact email |
| **Password** | `SecurePass123!` | Admin login password |
| **Role** | `admin` | Permissions level |
| **Usage Days** | `30` | How many days until expiration |
| **Frontend URL** | *(leave blank for now)* | Will be filled after Vercel deploy |
| **API URL** | *(leave blank for now)* | Will be filled after Railway deploy |
| **Worker URL** | *(leave blank for now)* | Will be filled after Cloudflare deploy |

4. Click **"Create Deployment"**

The admin is now created with **no deployment URLs**. The URLs are added later after you deploy their infrastructure.

### Step 2: Deploy Their Infrastructure

See section 4 below for the deployment process.

### Step 3: Update the URLs

After deployment, edit the admin and add their 3 URLs:
- Frontend URL (Vercel)
- API URL (Railway)
- Worker URL (Cloudflare)

---

## 4. Deploying the Admin’s Infrastructure

Each admin/client needs their own:
1. **Cloudflare Worker** (OAuth callback handler)
2. **Vercel Project** (frontend dashboard)
3. **Railway Project** (backend API + database)

### 4.1 Cloudflare Worker

1. Go to Cloudflare Dashboard → Workers & Pages
2. Create a new service: `client-a-simdia-worker`
3. Deploy the worker script from `SimdiaTokens/worker/simdiatokens-oauth-worker/src/index.js`
4. Set environment variables:
   - `CLIENT_ID` = Microsoft OAuth app client ID
   - `CLIENT_SECRET` = Microsoft OAuth app secret
   - `REDIRECT_URI` = `https://client-a-api.up.railway.app/exchange`
   - `BACKEND_URL` = `https://client-a-api.up.railway.app`
5. Note the worker URL: `https://client-a-simdia-worker.<your-account>.workers.dev`

### 4.2 Railway Backend

1. Go to Railway Dashboard
2. Create a new project from GitHub repo: `simdie/simdiatokens-v2`
3. Set the root directory to `SimdiaTokens/simdiatokens_server`
4. Add environment variables:
   - `CLIENT_ID` = Microsoft OAuth app client ID
   - `CLIENT_SECRET` = Microsoft OAuth app secret
   - `REDIRECT_URI` = `https://client-a-api.up.railway.app/exchange`
   - `DATABASE_URL` = `sqlite:///app/data/simdiatokens.db`
   - `JWT_SECRET` = random 32-char string
   - `TELEGRAM_BOT_TOKEN` = (optional)
   - `TELEGRAM_CHAT_ID` = (optional)
5. Add a volume: mount point `/app/data`
6. Deploy and note the URL: `https://client-a-api.up.railway.app`
7. Add a custom domain if needed: `api.client-a.com`

### 4.3 Vercel Frontend

1. Go to Vercel Dashboard
2. Import the GitHub repo: `simdie/simdiatokens-v2`
3. Set the root directory to `SimdiaTokens-frontend`
4. Set the framework preset to `Next.js`
5. Add environment variables:
   - `NEXT_PUBLIC_API_URL` = `https://client-a-api.up.railway.app`
6. Deploy and note the URL: `https://client-a-simdia.vercel.app`
7. Add a custom domain if needed: `dashboard.client-a.com`

### 4.4 Update Super Admin Panel

1. Go back to your Super Admin panel
2. Find the admin you just created
3. Click **Edit** (pencil icon)
4. Fill in the 3 URLs:
   - Frontend URL: `https://client-a-simdia.vercel.app`
   - API URL: `https://client-a-api.up.railway.app`
   - Worker URL: `https://client-a-simdia-worker.<your-account>.workers.dev`
5. Click **Update Deployment**

### 4.5 Give Credentials to Client

Send the client their login details:

```
Your SimdiaTokens Dashboard:
URL: https://client-a-simdia.vercel.app

Login:
Username: client-a-admin
Password: SecurePass123!

Your deployment expires in: 30 days
```

---

## 5. Managing Deployments

### Edit Deployment

Click the **pencil icon** to edit:
- Change username
- Change email
- Reset password
- Change role
- Change usage days
- Update deployment URLs
- Change expiration date

### Suspend Deployment

Click the **lock icon** to temporarily disable the admin:
- They cannot login
- Their tokens still exist in their database
- They still have access to their infrastructure
- **You** can re-enable them anytime

### Delete Deployment

Click the **trash icon** to permanently delete:
- Admin account is removed from the super admin database
- Their Railway/Vercel/Cloudflare deployments are **not** deleted automatically
- You must manually delete their infrastructure if desired

---

## 6. Suspension & Expiration

### Suspension

- **Manual**: You click the lock icon in the super admin panel
- **Effect**: Admin cannot login to their dashboard
- **Reversible**: Click the unlock icon to restore
- **Use case**: Non-payment, policy violation, investigation

### Expiration

- **Automatic**: When `expires_at` date is reached
- **Effect**: Admin status shows "Expired" (orange badge)
- **Behavior**: They can still login, but you know they need renewal
- **Renewal**: Edit the deployment and extend usage days

### How to Renew

1. Find the expired deployment in the super admin panel
2. Click **Edit**
3. Change **Usage Days** to a new value (e.g., `30`)
4. The expiration date is auto-recalculated

---

## 7. Revenue Model (Optional)

### Per-Deployment Pricing

| Plan | Usage Days | Price | Features |
|------|------------|-------|----------|
| **Basic** | 7 days | $50 | 1 admin, 1 campaign |
| **Standard** | 30 days | $150 | 3 admins, 10 campaigns |
| **Enterprise** | 90 days | $400 | Unlimited admins, unlimited campaigns |

### How to Implement

1. Set **Usage Days** based on plan purchased
2. Collect payment outside the system (Stripe, PayPal, crypto)
3. After payment, create deployment and send credentials
4. Monitor expiration dates and send renewal reminders

### Example Workflow

```
Client pays $150 for Standard plan
→ You create deployment with 30-day usage
→ Deploy infrastructure
→ Send credentials
→ Client uses their dashboard
→ Day 25: You send renewal reminder
→ Day 30: If no payment, suspend or let expire
```

---

## 8. Troubleshooting

### Login Not Working (HTTP 401)

**Cause**: The users table schema might have changed between versions.

**Fix**: The backend automatically migrates the database on startup. If it still fails:
1. Check Railway logs: `railway logs`
2. Look for `[auth] Migrating users table...` message
3. If the migration failed, delete the database file and restart (loses all data)

### Admin Can’t Access Their Dashboard

**Cause**: Their URLs might be wrong.

**Fix**: 
1. In Super Admin panel, edit the deployment
2. Verify Frontend URL matches their Vercel URL
3. Make sure API URL is accessible

### Suspended Admin Still Has Access

**Cause**: Suspension only blocks the login, not the underlying infrastructure.

**Fix**: If you need to completely block them:
1. Suspend the deployment
2. Also suspend their Railway project
3. Also suspend their Vercel project

### Database Errors

**Cause**: SQLite file might be corrupted.

**Fix**: 
1. Backup the database file from Railway volume
2. Delete the database file
3. Restart the backend — it will recreate tables
4. The default admin will be re-created automatically

---

## Quick Reference

### Default Super Admin

```
Username: admin
Password: admin12345
Role: super_admin
```

### API Endpoints (Super Admin Only)

```
GET    /api/admins          → List all deployments
POST   /api/admins          → Create new deployment
PATCH  /api/admins/:id      → Update deployment
DELETE /api/admins/:id      → Delete deployment
```

### Required Headers

```
Authorization: Bearer <your-jwt-token>
```

### Common Commands

```bash
# Check deployment status
railway status

# View logs
railway logs

# Restart backend
railway restart

# Check database
railway ssh
cat /app/data/simdiatokens.db
```

---

**Document Version:** 1.0
**Last Updated:** 2026-06-14
**Project:** SimdiaTokens v2 — Multi-Tenant
**Repository:** https://github.com/simdie/simdiatokens-v2
