## Journal Entry API

This document describes the Journal Entry API with double-entry bookkeeping validation, status workflows, and role-based access control.

Base path for all endpoints:

- **`/api/v1/accounting/journal`**

**Single vs bulk create:** Use `POST /journal` for one entry (body: `{ date, reference, lines }`). Use `POST /journal/bulk` for multiple entries (body: `{ entries: [...] }`, max 100). **CSV import:** Use `GET /journal/template` to download a CSV template and `POST /journal/import` to upload; CSV uses **account code** (e.g. `1001`), not `accountId`.

All endpoints require:
- User to be **authenticated** (Better Auth session)
- User to be a **member** of the active organization
- **`activeOrganizationId`** set in session (organization scoping)

---

### Access Control

| Role | Create | List | Get | Update | Delete | Post | Reverse |
|------|--------|------|-----|--------|--------|------|---------|
| **Owner** | POSTED | All | All | Own DRAFT | Own DRAFT | ✓ | ✓ |
| **CA** | POSTED | All | All | Own DRAFT | Own DRAFT | ✓ | ✓ |
| **Staff** | DRAFT only | Own + POSTED | Own + POSTED | Own DRAFT | Own DRAFT | ✗ | ✗ |

- **All** = owner/CA can see all entries in the organization.
- **Own** = entries created or updated by the current user (`createdBy`, `updatedBy`).
- **Own + POSTED** = staff see own entries plus any POSTED entries from others.
- **Status** cannot be updated via `PUT`/`PATCH` — use `POST /post` and `POST /reverse` with `{ ids: [...] }`.

---

### Journal Line Structure

Each journal **line** has:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `accountId` | string | ✓ | COA account `_id` (24-char hex MongoDB ObjectId). Obtain from `GET /coa` or `GET /coa/tree/all`. |
| `debit` | number | ✓* | Debit amount (≥ 0) |
| `credit` | number | ✓* | Credit amount (≥ 0) |
| `narration` | string | | Optional line description |

\* Each line must have **either** debit **or** credit, not both. Total debits must equal total credits.

---

### Journal Entry Fields

| Field | Type | Description |
|-------|------|-------------|
| `date` | string (ISO) | Transaction date. Accepts `YYYY-MM-DD` (e.g. `2026-02-12`). |
| `reference` | string | Reference (e.g. JV-001, INV-001) |
| `description` | string | Entry description |
| `lines` | JournalLine[] | Array of lines (min 2) |
| `status` | DRAFT \| POSTED \| REVERSED | Set automatically by role |

---

## 1. Basic CRUD

### 1.1 Create Journal Entry

- **Method**: `POST`
- **Path**: `/api/v1/accounting/journal`

**Behavior:**
- Staff: Creates as **DRAFT** (no balance update).
- Owner/CA: Creates as **POSTED** and updates COA `currentBalance` for each line.
- Validates: account existence, double-entry rules, balance sheet equation.

**Body:**

```json
{
  "date": "2026-02-11",
  "reference": "JV-001",
  "description": "Initial cash deposit",
  "lines": [
    {
      "accountId": "698c7aa4d92e03597be8d491",
      "debit": 10000,
      "credit": 0,
      "narration": "Cash received"
    },
    {
      "accountId": "698c7aa4d92e03597be8d492",
      "debit": 0,
      "credit": 10000,
      "narration": "Capital contribution"
    }
  ]
}
```

**Responses:**
- `201 Created` – created entry with `journalId` and `accountingValidation`.
- `400 Bad Request` – validation failed (e.g. accounts not found, balance sheet doesn't balance).
- `403 Forbidden` – not a member of the active organization.

---

### 1.1b Create Many Journal Entries (Bulk)

- **Method**: `POST`
- **Path**: `/api/v1/accounting/journal/bulk`

**Behavior:**
- Validates **all** entries first (account existence, double-entry, balance sheet).
- If **any** fail validation, returns `400` with `failures` array (index, reference, errors) – **no entries created**.
- If all pass, creates all entries (POSTED for CA/Owner, DRAFT for Staff).
- Max 100 entries per request.

**Body:** Use real COA account `_id` values (24-char hex) from `GET /coa` or `GET /coa/tree/all`. Placeholders like `CASH_ID` will fail validation.

```json
{
  "entries": [
    {
      "date": "2026-02-12",
      "reference": "JV-001",
      "description": "Capital contribution",
      "lines": [
        { "accountId": "698de41eee41e91dac1ef43a", "debit": 100000, "credit": 0 },
        { "accountId": "698de41eee41e91dac1ef445", "debit": 0, "credit": 100000 }
      ]
    },
    {
      "date": "2026-02-12",
      "reference": "JV-002",
      "description": "Cash sale",
      "lines": [
        { "accountId": "698de41eee41e91dac1ef43a", "debit": 25000, "credit": 0 },
        { "accountId": "698de41eee41e91dac1ef447", "debit": 0, "credit": 25000 }
      ]
    }
  ]
}
```

**Responses:**
- `201 Created` – `{ "created": [...], "count": N }`
- `400 Bad Request` – validation failed, `meta.failures`: `[{ index, reference, errors }]`

---

### 1.2 List Journal Entries (Paginated)

- **Method**: `GET`
- **Path**: `/api/v1/accounting/journal`
- **Query params**:

| Param | Type | Description |
|-------|------|--------------|
| `reference` | string | Filter by reference |
| `dateFrom` | string (ISO) | Entries on or after this date |
| `dateTo` | string (ISO) | Entries on or before this date |
| `description` | string | Filter by description |
| `status` | string | `DRAFT`, `POSTED`, or `REVERSED` |
| `createdBy` | string | Filter by creator user ID |
| `updatedBy` | string | Filter by updater user ID |
| `createdAt` | string (ISO) | Filter by created date |
| `updatedAt` | string (ISO) | Filter by updated date |
| `page` | string | Page number (default `1`) |
| `limit` | string | Items per page (default `10`) |
| `sort` | string | Sort field(s) (e.g. `date`, `reference`) |
| `order` | string | `asc` or `desc` |

**Behavior:**
- Owner/CA: returns all entries in the organization.
- Staff: returns entries created/updated by the user or with status POSTED.

**Example:**

```http
GET /api/v1/accounting/journal?page=1&limit=20
```

**Response:**
- `200 OK` – paginated list with `data` and `pagination`.
- `403 Forbidden` – active organization not set or not a member.

---

### 1.3 Get Journal Entry by ID

- **Method**: `GET`
- **Path**: `/api/v1/accounting/journal/:id`

**Behavior:**
- Owner/CA: returns any entry in the organization.
- Staff: returns entry only if created/updated by user or status is POSTED.

**Response:**
- `200 OK` – journal entry object.
- `404 Not Found` – entry not found or not owned by user.
- `403 Forbidden` – not a member.

---

### 1.4 Update Journal Entry (Full)

- **Method**: `PUT`
- **Path**: `/api/v1/accounting/journal/:id`

**Behavior:**
- Only **own** entries in **DRAFT** status can be updated.
- **Status cannot be changed** — use `POST /post` with `{ ids: [...] }` to post.

**Body:**

```json
{
  "date": "2026-02-12",
  "reference": "JV-001",
  "description": "Updated description",
  "lines": [
    {
      "accountId": "698c7aa4d92e03597be8d491",
      "debit": 5000,
      "credit": 0,
      "narration": "Revised"
    },
    {
      "accountId": "698c7aa4d92e03597be8d492",
      "debit": 0,
      "credit": 5000,
      "narration": "Revised"
    }
  ]
}
```

**Response:**
- `200 OK` – updated entry.
- `404 Not Found` – entry not found, not owned, or not in DRAFT status.
- `400 Bad Request` – validation error (e.g. debits ≠ credits).

---

### 1.5 Update Journal Entry (Partial)

- **Method**: `PATCH`
- **Path**: `/api/v1/accounting/journal/:id`

**Body:**
- Any subset of `date`, `reference`, `description`, `lines`. **Status is omitted** from the schema.

**Response:**
- Same as `PUT`.

---

### 1.6 Delete Journal Entry

- **Method**: `DELETE`
- **Path**: `/api/v1/accounting/journal/:id`

**Behavior:**
- Only **own** entries in **DRAFT** status can be deleted.

**Response:**
- `200 OK` – `{ "message": "Journal entry deleted" }`.
- `404 Not Found` – entry not found, not owned, or not in DRAFT status.

---

## 2. Journal Status Operations

### 2.1 Post Journal Entries (Bulk)

- **Method**: `POST`
- **Path**: `/api/v1/accounting/journal/post`

**Behavior:**
- **Owner/CA only.** Staff cannot post.
- Accepts array of IDs; posts all DRAFT entries in one request.
- Transitions **DRAFT → POSTED**.
- Updates COA `currentBalance` for each line (`currentBalance += debit - credit`).

**Body:**

```json
{
  "ids": ["698c7aa4d92e03597be8d491", "698c7aa4d92e03597be8d492"]
}
```

**Response:**
- `200 OK` – `{ message, posted: [...], failed: [...] }`. IDs not found or not in DRAFT appear in `failed`.
- `403 Forbidden` – not owner/CA.

---

### 2.2 Reverse Journal Entries (Bulk)

- **Method**: `POST`
- **Path**: `/api/v1/accounting/journal/reverse`

**Behavior:**
- **Owner/CA only.** Staff cannot reverse.
- Accepts array of IDs; reverses all POSTED entries in one request.
- Transitions **POSTED → REVERSED**.
- Reverses COA balances (`currentBalance += credit - debit` for each line).

**Body:**

```json
{
  "ids": ["698c7aa4d92e03597be8d491", "698c7aa4d92e03597be8d492"]
}
```

**Response:**
- `200 OK` – `{ message, reversed: [...], failed: [...] }`. IDs not found or not in POSTED appear in `failed`.
- `403 Forbidden` – not owner/CA.

---

## 3. CSV Template & Import

Journal import uses **account code** (COA `code`, e.g. `1001`, `2001`) instead of `accountId`. One CSV row = one journal **line**; consecutive rows with the same `date` and `reference` form one entry (minimum 2 lines per entry). The server resolves each `accountCode` to the COA account `_id` for the active organization.

### 3.1 Download Import Template

- **Method**: `GET`
- **Path**: `/api/v1/accounting/journal/template`

**Behavior:** Returns a CSV file with headers and two example rows (one journal entry with two lines). Use it as a template for bulk import.

**Response:** `Content-Type: text/csv`, `Content-Disposition: attachment; filename="journal-import-template.csv"`.

**CSV columns:**

| Column        | Required | Description |
|---------------|----------|-------------|
| `date`        | ✓        | Entry date (e.g. `2026-02-12`) |
| `reference`   | ✓        | Reference (e.g. `JV-001`). Rows with same `date` + `reference` = one entry. |
| `description` |          | Entry description (optional) |
| `accountCode` | ✓        | COA account **code** (e.g. `1001`, `2001`), not ObjectId. From `GET /coa` or COA tree. |
| `debit`       | ✓*       | Debit amount (≥ 0) |
| `credit`      | ✓*       | Credit amount (≥ 0) |
| `narration`   |          | Line narration (optional) |

\* Each line must have either debit or credit; total debits must equal total credits per entry.

**Example template content:**

```csv
date,reference,description,accountCode,debit,credit,narration
2026-02-12,JV-001,Capital contribution,1001,10000,0,Cash received
2026-02-12,JV-001,Capital contribution,2001,0,10000,Capital contribution
```

---

### 3.2 Import Journals from CSV

- **Method**: `POST`
- **Path**: `/api/v1/accounting/journal/import`
- **Content-Type**: `multipart/form-data`
- **Field**: `file` (CSV file)

**Behavior:**
- Parses CSV; groups rows by `date` + `reference` into journal entries.
- Resolves `accountCode` to COA account `_id` for the active organization. Unknown codes are reported in `errors`.
- Validates each entry (double-entry, balance sheet rules). Invalid entries are skipped and listed in `errors`.
- Creates valid entries (POSTED for Owner/CA, DRAFT for Staff). Same rules as `POST /journal/bulk`.
- Temp file is deleted after processing.

**Response (201 Created):**

```json
{
  "success": true,
  "status": 201,
  "data": {
    "message": "Imported 2 journal entries",
    "created": [ /* created journal entry objects with journalId */ ],
    "count": 2,
    "errors": []
  }
}
```

**Partial success (some rows invalid):** `created` and `count` reflect successful entries; `errors` lists row number (1-based, header = 1), `reference`, and `message` for each failed row or entry.

**Error responses:**
- `400 Bad Request` – no file uploaded, or all rows had errors (response includes `errors` array).
- `403 Forbidden` – not a member of the active organization.
- Max file size: 5MB. Accepted: `.csv`, `text/csv`, `application/vnd.ms-excel`.

---

## 4. Validation

### 4.1 Validate Transactions (No Create)

- **Method**: `POST`
- **Path**: `/api/v1/accounting/journal/validate`

**Behavior:**
- Validates lines against accounting rules without creating an entry.
- Checks: account existence, double-entry (debits = credits), balance sheet equation.

**Body:**

```json
{
  "lines": [
    {
      "accountId": "698c7aa4d92e03597be8d491",
      "debit": 1000,
      "credit": 0
    },
    {
      "accountId": "698c7aa4d92e03597be8d492",
      "debit": 0,
      "credit": 1000
    }
  ],
  "organizationId": "698c7aa4d92e03597be8d492"
}
```

**Note:** `organizationId` is optional; defaults to session's `activeOrganizationId`.

**Response:**

```json
{
  "isValid": true,
  "errors": [],
  "balanceSheetBalanced": true,
  "totalAssets": 1000,
  "totalLiabilities": 0,
  "totalEquity": 1000,
  "totalRevenue": 0,
  "totalExpenses": 0
}
```

- `200 OK` – validation result. If `isValid` is `false`, `errors` contains messages.
- `400 Bad Request` – API error (e.g. accounts not found).
- `403 Forbidden` – not a member.

---

## 5. Accounting Rules Enforced

| Rule | Where |
|------|-------|
| **Double-entry** (Total Debits = Total Credits) | Zod schema + Mongoose validator |
| **Each line**: debit XOR credit | Zod `journalLineCreateSchema` |
| **Account existence** | Service: all `accountId` must exist in COA for the org |
| **Balance sheet equation** | Service: Assets = Liabilities + Equity + (Revenue - Expenses) |
| **Debit/Credit by account type** | Service: applies correct +/- per account type |

---

## 6. Related APIs

**Journal entries for a specific COA account** (including descendants):

- **Method**: `GET`
- **Path**: `/api/v1/accounting/coa/:id/journal-entries`

See [COA API - Journal Entries](../coa/coa.api.md#6-journal-entries-for-an-account) for query parameters (`page`, `limit`, `status`, `dateFrom`, `dateTo`) and response structure.

**Accounting reports** (Trial Balance, Balance Sheet, P&L, Cash Flow, GST Summary):

- **Base path**: `/api/v1/accounting/reports`
- See [Reports API](../reports/reports.api.md).
