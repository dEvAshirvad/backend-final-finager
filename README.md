### Full Technical Summary for Backend Developers – Finager India SaaS

**Overview**  
Finager India is a multi-tenant, real-time accounting and taxation automation SaaS for Indian CAs and SMBs. It automates double-entry bookkeeping, GST reconciliation, and client-CA collaboration.

The backend is built with **Express.js** for API routing, **Mongoose** for MongoDB interactions, and **Better Auth** for authentication. All operations are scoped to organizations (multi-tenant), with RBAC enforced via middleware.

Key principles:

- **Event-driven**: Transactions trigger journals, balance updates, GST calc.
- **Compliance-first**: Double-entry invariants, GST API integration (Whitebooks).
- **Scalable & Secure**: Rate limiting, caching, central error/logging.
- **MVP Focus**: Fixed transaction types with optional rules; simple reports from journals.

**Tech Stack**

- **API Framework**: Express.js (Next.js API routes optional for full-stack).
- **Database**: MongoDB (Atlas for cloud), Mongoose ODM.
- **Auth**: Better Auth (email/password, sessions, RBAC plugins).
- **Storage**: AWS S3 (documents/uploads).
- **Compute**: AWS EC2 (Node.js runtime).
- **Tools**: Nodemailer/Resend (emails), Whitebooks GST API (reconciliation/filing).
- **Dev Tools**: TypeScript, Jest (tests), ESLint/Prettier (lint).

**Architecture Features**

- **Rate Limiting**: express-rate-limit on all routes (e.g., 100 req/15min per IP/user; higher for auth). Prevents DDoS/abuse.
- **Caching**: Redis (or in-memory for MVP) for reports, lists (e.g., COA list TTL 5min; invalidate on journal post).
- **Central Error Handling**: Global middleware catches errors → logs (Winston/console) + responds with { code, message, stack (dev only) }. Custom APIError class for 400/403/500.
- **Logging**: Winston for structured logs (req/res, errors, audits). Levels: info (API calls), warn (warnings like missing GSTIN), error (failures).

**Folder Structure**

```
src/
├── auth/                     # Better Auth config, custom plugins, email templates
├── organization/             # Org models, invites, RBAC access control
├── accounting/               # Core engine
│   ├── coa/                  # Models, controllers, routes
│   ├── journal/              # Models, controllers, routes
│   ├── ledger/               # Virtual query helpers
│   └── reports/              # Controllers, aggregation queries
├── business/                 # Client operations
│   ├── contacts/             # Models, controllers, routes, bulk import/export
│   ├── inventory/            # Models, controllers, routes, stock movements
│   ├── transactions/         # Fixed types (subfolders for each: invoice/, bill/, etc.)
│   ├── journal-rules/        # Models, controllers for override rules
│   ├── events/               # Generic event model + pipeline engine
│   └── documents/            # Upload controllers, S3 integration
├── gst/                      # Reconciliation, summaries, Whitebooks API wrappers
├── middleware/               # Auth, RBAC, org scoping, rate-limit, error handler
├── utils/                    # Helpers (GST calc, email send, CSV parse, aggregations)
├── configs/                  # Env, email templates, constants (COA defaults)
└── index.ts                  # App entry, routes mount
```

**Overall Backend Flow**

- **Request → Middleware**: Rate limit → Auth check → Org scoping (attach req.activeOrg) → RBAC enforce
- **Transaction/Event → Pipeline**: Calc GST → Apply rule (fixed/custom) → Generate journal → Update balances/inventory
- **Reports**: Aggregate from journals (Mongo $group/$sum) → Cache result
- **Errors/Logs**: Central handler → Winston log + JSON response

Now, phase-by-phase breakdown with **Expectations** (technical goals/outcomes) and **API Maps** (key routes + methods).

#### Phase 1: Authentication, Organization, and Access Control

- **Expectations**: Secure user sessions with RBAC; Multi-tenant orgs with invites; Onboarding flow to set roles/isOnboarded; Middleware for all future routes to enforce active org + permissions; Audit logs on key actions. All in 3–4 days.
- **API Maps**:
  - POST /auth/sign-up/email – Create user (minimal: email, password) → return token/user
  - POST /auth/sign-in/email – Login → return token/user
  - PATCH /auth/verify-email?token=... – Verify email → set emailVerified=true
  - PATCH /auth/update-user – Update name/image/role
  - POST /organization/create – Create org → auto-seed COA, add Member
  - POST /organization/invite-member – Send invite email → create Invitation
  - POST /organization/accept-invitation – Join org → create Member
  - POST /organization/set-active – Switch active org in session
  - POST /organization/has-permission – Check RBAC for actions (e.g. { "coa": ["create"] }) → true/false
  - GET /auth/get-session – Get current session/user/org

#### Phase 2: Core Accounting Engine

- **Expectations**: COA with hierarchy + defaults seeded on org create; Journals with invariants (debit=credit, no both non-zero per line); Ledger as virtual queries; Reports as aggregations (dynamic via config for P&L/Cash Flow); Tally import via CSV (parse → map CoA → create journals). All in 4–6 days.
- **API Maps**:
  - POST /accounting/coa/template – Bulk create from defaults
  - GET /accounting/coa – List (paginated, filter type)
  - POST /accounting/journal – Create (validate balance)
  - GET /accounting/journal – List (paginated)
  - PATCH /accounting/journal/:id/post – Post DRAFT → POSTED
  - PATCH /accounting/journal/:id/reverse – Reverse POSTED
  - POST /accounting/journal/validate – Dry-run validation
  - GET /accounting/reports/trial-balance?asOfDate=... – Aggregated balances
  - GET /accounting/reports/balance-sheet?asOfDate=... – Assets = Liab+Equity
  - POST /accounting/reports/pl – P&L with optional config
  - POST /accounting/reports/cash-flow – Cash Flow with optional config
  - POST /accounting/import/tally-journals – CSV upload → parse/map → create journals + warnings

#### Phase 3: Business Operations Layer

- **Expectations**: Fixed transaction types with discriminators; Auto-journal from transactions (fixed flows + optional rules); Contacts with GST validation/warnings; Inventory with variants/SKU auto-gen + search morphing; Bulk import/export for contacts/products; Documents S3 uploads. All in 5–7 days.
- **API Maps**:
  - POST /business/contacts – Create (minimal email/phone)
  - GET /business/contacts – List + warnings for missing GSTIN/PAN
  - POST /business/contacts/import – Bulk Excel/JSON + mapping + hit/miss stats
  - GET /business/contacts/export/excel – Download Excel
  - POST /business/inventory/products – Create (variants → auto SKU)
  - GET /business/inventory/products?search=... – Fuzzy/morphed variant search
  - POST /business/inventory/products/import – Bulk + variant parse + hit/miss
  - POST /business/transactions/invoice – Create invoice → journal
  - POST /business/transactions/bill – Create bill → journal
  - POST /business/transactions/payment – Create payment → journal
  - (Similar for receipt, credit-note, debit-note, expense, sales-order, purchase-order)
  - POST /business/journal-rules – Create override rule
  - POST /business/documents – Upload file → S3 link

#### Phase 4: GST Compliance & Reconciliation

- **Expectations**: Whitebooks API wrappers for GSTR-2B fetch; Matching logic (bills vs 2B); ITC reversal suggestions; Pre-fill summaries from journals. All in 4–6 days.
- **API Maps**:
  - POST /gst/reconciliation/upload-gstr2b – Upload CSV/JSON → parse/store
  - POST /gst/reconciliation/run?period=... – Match + flag mismatches
  - GET /gst/summary/gstr3b?period=... – Pre-fill Table 3.1 + 4
  - GET /gst/summary/gstr1?period=... – Outward supplies summary

This full backend summary gives you a clear roadmap. If you need code for a specific phase or folder, let me know!
