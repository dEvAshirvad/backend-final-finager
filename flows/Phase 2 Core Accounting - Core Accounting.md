## Phase 2 — Core Accounting (COA & Journal)

Overview
--------

This document describes Phase 2: the core accounting APIs and flows — Chart of Accounts (COA) and Journal Entries (double-entry). It consolidates endpoint references, examples, request/response shapes, and recommended UI behavior. Use this together with Phase 1 (Auth, Org, Onboarding).

Environment
-----------

Frontend URL: `http://localhost:3002`  
Backend URL: `http://localhost:3001`

Notes
-----
- All endpoints are scoped to the session's `activeOrganizationId`. Users must be authenticated and be members of the active organization.
- Use environment variables in examples when sharing externally (e.g., `$API_BASE`, `$FRONTEND_URL`).
- This doc mirrors implementation in `src/modules/accounting/coa/*` and `src/modules/accounting/journal/*`.

Part A — Chart of Accounts (COA)
--------------------------------

Base path:
`/api/v1/accounting/coa`

Purpose
- Manage hierarchical accounts, templates, and tree navigation. COA `_id` is used in journal lines (`lines.accountId`) and reports configuration.

Account types & normal balances
- ASSET — Normal: DEBIT  
- LIABILITY — Normal: CREDIT  
- EQUITY — Normal: CREDIT  
- INCOME — Normal: CREDIT  
- EXPENSE — Normal: DEBIT

Common fields (used across endpoints)
- `organizationId` (ObjectId) — internal; endpoints use session `activeOrganizationId`.  
- `code` (string) — unique within org.  
- `name` (string)  
- `description` (string, optional)  
- `type` (`ASSET|LIABILITY|EQUITY|INCOME|EXPENSE`)  
- `normalBalance` (`DEBIT|CREDIT`)  
- `parentCode` (string | null) — hierarchy parent code  
- `isSystem` (boolean) — system accounts cannot be deleted  
- `openingBalance`, `currentBalance` (number)

Guidelines
- Use `code` for human-friendly navigation; use `_id` for programmatic references in journal entries and reports.
- Prevent cycles when moving accounts; disallow moving an account under its descendant.

Endpoints (summary + examples)
- Create account
```bash
curl --request POST \
  --url $API_BASE/api/v1/accounting/coa \
  --header 'Content-Type: application/json' \
  --data '{
    "code":"1001","name":"Cash in Hand","type":"ASSET","normalBalance":"DEBIT","parentCode":null
  }'
```
Response: `201 Created` — created account (includes `_id`).

- List accounts (paginated)
GET `/api/v1/accounting/coa?page=1&limit=20&type=ASSET`
Response: `200 OK` — paginated list with `data` and `pagination`.

- Get account by id
GET `/api/v1/accounting/coa/:id` — `200 OK` or `404`.

- Get account by code
GET `/api/v1/accounting/coa/code/:code` — scoped to active org.

- Update (PUT) / Partial update (PATCH) / Delete (DELETE)
PUT `/api/v1/accounting/coa/:id` — full update (must include required fields).  
PATCH `/api/v1/accounting/coa/:id` — partial update.  
DELETE `/api/v1/accounting/coa/:id` — deletes if safe (future: add guards for system/used accounts).

Templates
- Get template by industry:
GET `/api/v1/accounting/coa/templates/:industry`  
Industries accepted by implementation: `retail`, `serviceBased`, `manufacturing`.

- Create from template:
POST `/api/v1/accounting/coa/template` with body `{ accounts: COACreate[] }`. Creates accounts in active org and returns created accounts (with `_id`).

Tree & Hierarchy
- Full tree: GET `/api/v1/accounting/coa/tree/all` — returns nested nodes (each node includes `_id`).
- Roots: GET `/api/v1/accounting/coa/tree/roots` — flat list of root accounts.
- Leaves: GET `/api/v1/accounting/coa/tree/leaves` — flat list of leaf accounts.
- Ancestors: GET `/api/v1/accounting/coa/:id/ancestors` — root → parent order.
- Descendants: GET `/api/v1/accounting/coa/:id/descendants`
- Children: GET `/api/v1/accounting/coa/:id/children`
- Path: GET `/api/v1/accounting/coa/:id/path` — path from root to account.
- Level: GET `/api/v1/accounting/coa/:id/level` — returns `{ level: number }`.
- Move account: PATCH `/api/v1/accounting/coa/:id/move` with `{ newParentCode: string | null }` — validates cycles.

Statistics
- Overview statistics: GET `/api/v1/accounting/coa/statistics/overview` — returns counts by type, root/leaf counts.

Journal entries for an account
- GET `/api/v1/accounting/coa/:id/journal-entries` — paginated journal entries affecting the account (and descendants). Query params: `page, limit, status, dateFrom, dateTo`.

Part B — Journal Entry API (Double-entry)
------------------------------------------

Base path:
`/api/v1/accounting/journal`

Purpose
- Create, validate, post, reverse, and manage journal entries. Enforces double-entry rules and balance-sheet validation.

Roles & access model (implementation)
- Owner / CA: Can create POSTED entries, list all, post, reverse.  
- Staff: Creates DRAFT entries only; can view own entries and POSTED entries.

Journal line structure
- `accountId` (string) — COA account `_id` (24-char hex).  
- `debit` (number, >=0) — debit amount.  
- `credit` (number, >=0) — credit amount.  
- `narration` (string, optional)

Rules
- Each line: debit XOR credit (not both).  
- Entry: total debits must equal total credits.  
- All referenced `accountId`s must exist and belong to the organization.  
- Balance sheet equation enforced: Assets = Liabilities + Equity + (Revenue - Expenses).

Endpoints (summary + examples)
- Create single journal entry
```bash
curl --request POST \
  --url $API_BASE/api/v1/accounting/journal \
  --header 'Content-Type: application/json' \
  --data '{
    "date":"2026-02-11","reference":"JV-001","description":"Initial cash",
    "lines":[
      {"accountId":"<CASH_ID>","debit":10000,"credit":0,"narration":"Cash received"},
      {"accountId":"<CAPITAL_ID>","debit":0,"credit":10000,"narration":"Capital"}
    ]
  }'
```
Behavior: Staff -> created as `DRAFT`; Owner/CA -> created as `POSTED` and updates COA `currentBalance`.
Response: `201 Created` — created entry with `journalId` and `accountingValidation` object.

- Bulk create (max 100)
POST `/api/v1/accounting/journal/bulk` with `{ entries: [...] }`. Validates all entries first; if any fail validation, returns `400` with `failures` and creates none.

- Validate (no create)
POST `/api/v1/accounting/journal/validate` with `{ lines, organizationId? }` — returns validation result `{ isValid, errors, balanceSheetBalanced, totals... }`.

- List (paginated)
GET `/api/v1/accounting/journal?page=1&limit=20&status=POSTED`
Owner/CA: all entries; Staff: own + POSTED entries.

- Get by id
GET `/api/v1/accounting/journal/:id`

- Update (PUT full / PATCH partial)
Only own DRAFT entries may be updated. Status cannot be changed via PUT/PATCH.

- Delete
DELETE `/api/v1/accounting/journal/:id` — only own DRAFT entries.

Status operations
- Post entries (bulk) — POST `/api/v1/accounting/journal/post` with `{ ids: [...] }` — Owner/CA only. Transitions DRAFT → POSTED and updates COA balances (`currentBalance += debit - credit` per line).

- Reverse entries (bulk) — POST `/api/v1/accounting/journal/reverse` with `{ ids: [...] }` — Owner/CA only. Transitions POSTED → REVERSED and reverses COA balances (`currentBalance += credit - debit` per line).

Validation details (returned object)
- `isValid` (boolean), `errors` (string[]), `balanceSheetBalanced` (boolean), `totalAssets`, `totalLiabilities`, `totalEquity`, `totalRevenue`, `totalExpenses`.

Implementation notes & mapping
----------------------------
- COA model fields and indexes are implemented at `src/modules/accounting/coa/coa.model.ts` (unique index: `{ organizationId, code }`).
- COA routes/handlers live in `src/modules/accounting/coa/` (router, handler, services) — the doc endpoints reflect those routers and zod validation.
- Journal routes/handlers live in `src/modules/accounting/journal/` (router, handler, services) — the doc endpoints reflect those routers and zod validation.
- Journal services enforce accounting rules and update COA `currentBalance` on posting/creation for Owner/CA. Bulk create validates all before creating any.

UI / UX recommendations
----------------------
- COA editor: show code, name, type, and current balance. Provide drag/drop or move action to change parent with validation (prevent cycles). Show toast errors for invalid moves.
- Templates: allow preview of accounts tree before creating. Show progress when creating from template.
- Journal entry editor: require at least 2 lines, validate totals locally before server submit using the same rules (debits = credits, debit/credit per line). Offer a "Validate" button that calls `/validate` endpoint and shows accountingValidation details.
- Posting/reversing: show confirmation modal listing affected accounts and balance deltas before owner/CA performs action.

Analysis & next steps
--------------------
- The Phase 2 doc reflects current implementation in COA and Journal modules. I recommend:
  1. Adding explicit request/response JSON schemas for each endpoint (machine-readable) — helpful for SDK generation.
  2. Adding error example responses for common failures (400 validation, 403 forbidden, 404 not found, 409 conflict).
  3. Creating sequence diagrams for: account creation → journal entry → post → report generation.

If you want, I can:
- Add JSON schemas and error examples to this doc.
- Generate a Postman/Insomnia collection from the examples.
- Add a simple sequence diagram (ASCII or Mermaid). Which should I do next?

