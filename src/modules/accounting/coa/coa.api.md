## Chart of Accounts (COA) API

This document describes the Chart of Accounts API, including hierarchical account management, templates, and tree navigation.

Base path for all endpoints:

- **`/api/v1/accounting/coa`**

All endpoints require:
- User to be **authenticated** (Better Auth session)
- User to be a **member** of the active organization
- **`activeOrganizationId`** set in session (organization scoping)

Organization scoping uses the session's active organization for list, tree, hierarchy, statistics, and journal entries. Create and template may accept `organizationId` in the request body per validation schema.

---

### Account Types & Normal Balances

Supported account types:

| Account Type  | Description                           | Normal Balance |
| ------------- | ------------------------------------- | -------------- |
| **ASSET**     | Resources owned by the business       | DEBIT          |
| **LIABILITY** | Obligations owed by the business      | CREDIT         |
| **EQUITY**    | Owner's stake in the business         | CREDIT         |
| **INCOME**    | Revenue from business operations      | CREDIT         |
| **EXPENSE**   | Costs incurred in business operations | DEBIT          |

Fields used across endpoints (simplified):

- `organizationId` (string) – Organization this account belongs to.
- `code` (string) – Unique code **within an organization**.
- `name` (string) – Account name.
- `description` (string, optional).
- `type` (`"ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE"`).
- `normalBalance` (`"DEBIT" | "CREDIT"`).
- `parentCode` (string, optional) – Code of the parent account for hierarchy.
- `isSystem` (boolean) – System accounts cannot be deleted (logical rule).
- `openingBalance` / `currentBalance` (number).

**Account `_id`:** Use the MongoDB ObjectId (`_id`) from created accounts in journal entry `lines.accountId` and reports config (`accountIds`). Get IDs from `GET /coa`, `GET /coa/tree/all`, or `POST /coa/template` response.

---

## 1. Basic CRUD

### 1.1 Create Account

- **Method**: `POST`
- **Path**: `/api/v1/accounting/coa`

**Body:** Account is created in the session's `activeOrganizationId`. Do not send `organizationId`.

```json
{
  "code": "1001",
  "name": "Cash in Hand",
  "description": "Main cash account",
  "type": "ASSET",
  "normalBalance": "DEBIT",
  "parentCode": null
}
```

**Responses:**

- `201 Created` – returns the created account (includes `_id` for use in journal entries and reports).
- `400 Bad Request` – validation error.
- `409 Conflict` – if unique constraint on `(organizationId, code)` fails.

---

### 1.2 List Accounts (Paginated)

- **Method**: `GET`
- **Path**: `/api/v1/accounting/coa`
- **Query params**:
  - `name` (optional) – filter by name (regex)
  - `code` (optional) – filter by code (regex)
  - `type` (optional) – filter by type
  - `page` (optional, default `1`)
  - `limit` (optional, default `10`)
  - `sort` (optional, e.g. `"code"`, `"name"`, `"code,name"`)
  - `order` (optional, `"asc"` or `"desc"`, default `"asc"`)

Scoped to `activeOrganizationId` from session.

**Example:**

```http
GET /api/v1/accounting/coa?page=1&limit=20&type=ASSET
```

**Response:**

- `200 OK` – paginated list with `data` and `pagination` (via `RespondWithPagination`).
- `404` – if active organization not found in session.

---

### 1.3 Get Account by ID

- **Method**: `GET`
- **Path**: `/api/v1/accounting/coa/:id`

**Response:**

- `200 OK` – account object.
- `404 Not Found` – if no account with that ID.

---

### 1.4 Get Account by Code

- **Method**: `GET`
- **Path**: `/api/v1/accounting/coa/code/:code`

Scoped to `activeOrganizationId` from session.

**Response:**

- `200 OK` – account object.
- `404 Not Found` – if no account with that code in the active organization.

---

### 1.5 Update Account (Full)

- **Method**: `PUT`
- **Path**: `/api/v1/accounting/coa/:id`

**Body:**

- Must conform to the full **update schema** (all required fields present).

**Response:**

- `200 OK` – updated account.
- `404 Not Found` – if account doesn’t exist.

---

### 1.6 Update Account (Partial)

- **Method**: `PATCH`
- **Path**: `/api/v1/accounting/coa/:id`

**Body:**

- Any subset of updatable fields (`coaZodUpdateSchema.partial()`).

**Response:**

- `200 OK` – updated account.
- `404 Not Found` – if account doesn’t exist.

---

### 1.7 Delete Account

- **Method**: `DELETE`
- **Path**: `/api/v1/accounting/coa/:id`

**Response:**

- `200 OK` – `{ "message": "Account deleted" }` on success.
- `404 Not Found` – if account doesn’t exist.

> Note: In the future you may add guards to prevent deleting `isSystem` accounts or accounts with child accounts/journal activity.

---

## 2. Template Operations

### 2.1 Get Template by Industry

- **Method**: `GET`
- **Path**: `/api/v1/accounting/coa/templates/:industry`

Returns pre-defined account structure for the given industry. Industries: `Retail`, `ServiceBased`, `Manufacturing`.

**Response:**

```json
{
  "data": {
    "industry": "Retail",
    "accounts": [
      { "code": "1001", "name": "Cash in Hand", "type": "ASSET", "normalBalance": "DEBIT" },
      { "code": "1300", "name": "Inventory", "type": "ASSET", "normalBalance": "DEBIT" }
    ]
  }
}
```

- `200 OK` – `accounts` array (empty if industry unknown).

---

### 2.2 Create Accounts from Template

- **Method**: `POST`
- **Path**: `/api/v1/accounting/coa/template`

Creates accounts in the active organization (from session). Use accounts from `GET /templates/:industry` or provide custom array. Each account must include `code`, `name`, `type`, `normalBalance`. Optional: `parentCode`, `description`.

**Body:**

```json
{
  "accounts": [
    { "code": "1001", "name": "Cash in Hand", "type": "ASSET", "normalBalance": "DEBIT" },
    { "code": "1300", "name": "Inventory", "type": "ASSET", "normalBalance": "DEBIT", "parentCode": null },
    { "code": "1301", "name": "Raw Materials", "type": "ASSET", "normalBalance": "DEBIT", "parentCode": "1300" }
  ]
}
```

**Response:**

- `201 Created` – array of created account objects (includes `_id` for P&L/Cash Flow config).
- `400 Bad Request` – on validation errors.

---

## 3. Tree Operations

All tree endpoints are scoped to `activeOrganizationId` from session.

### 3.1 Get Full COA Tree

- **Method**: `GET`
- **Path**: `/api/v1/accounting/coa/tree/all`
- **Query params**:
  - `organizationId` (optional) – Defaults to session's `activeOrganizationId`.

**Response:** Each node includes `_id` for use in journal `accountId` and reports config.

- `200 OK` – array of tree nodes:

```json
[
  {
    "code": "1000",
    "name": "Assets Root",
    "type": "ASSET",
    "...": "...",
    "children": [
      {
        "code": "1100",
        "name": "Cash and Bank",
        "parentCode": "1000",
        "children": []
      }
    ]
  }
]
```

---

### 3.2 Get Root Accounts

- **Method**: `GET`
- **Path**: `/api/v1/accounting/coa/tree/roots`
- **Query params**: `organizationId` (optional)

**Response:**

- `200 OK` – flat list of accounts with no `parentCode` in that org.

---

### 3.3 Get Leaf Accounts

- **Method**: `GET`
- **Path**: `/api/v1/accounting/coa/tree/leaves`
- **Query params**: `organizationId` (optional)

**Response:**

- `200 OK` – flat list of accounts that have **no children**.

---

## 4. Hierarchy Navigation

All hierarchy endpoints use `:id` (account `_id`) in the path. Query param `organizationId` (optional) defaults to session's `activeOrganizationId`.

### 4.1 Get Ancestors

- **Method**: `GET`
- **Path**: `/api/v1/accounting/coa/:id/ancestors`

**Behavior**:

- Returns all ancestor accounts, ordered from **root → closest parent**.

**Response:**

- `200 OK` – array of ancestor accounts (can be empty for root).

---

### 4.2 Get Descendants

- **Method**: `GET`
- **Path**: `/api/v1/accounting/coa/:id/descendants`

**Behavior**:

- Returns all descendant accounts at any depth under the given account.

**Response:**

- `200 OK` – array of accounts.

---

### 4.3 Get Direct Children

- **Method**: `GET`
- **Path**: `/api/v1/accounting/coa/:id/children`

**Behavior**:

- Returns accounts where `parentCode` equals the current account’s `code`.

**Response:**

- `200 OK` – array of direct child accounts.

---

### 4.4 Get Path from Root

- **Method**: `GET`
- **Path**: `/api/v1/accounting/coa/:id/path`

**Behavior**:

- Returns the full path from the **root** to the given account.

**Response:**

- `200 OK` – `[{root}, {...}, {currentAccount}]`.

---

### 4.5 Get Account Level (Depth)

- **Method**: `GET`
- **Path**: `/api/v1/accounting/coa/:id/level`

**Behavior**:

- Returns numeric `level` (depth) where **root level = 0**.

**Response:**

```json
{
  "level": 2
}
```

---

### 4.6 Move Account

- **Method**: `PATCH`
- **Path**: `/api/v1/accounting/coa/:id/move`

**Body:**

```json
{
  "newParentCode": "1000"
}
```

**Behavior**:

- Updates `parentCode` for the given account.
- Validations:
  - Account cannot be its **own parent**.
  - Account cannot be moved under one of its **own descendants**.

**Response:**

- `200 OK` – updated account.
- `400 Bad Request` – invalid move (e.g. cycle).
- `404 Not Found` – if account doesn’t exist.

---

## 5. Statistics

### 5.1 Overview Statistics

- **Method**: `GET`
- **Path**: `/api/v1/accounting/coa/statistics/overview`

Scoped to `activeOrganizationId` from session.

**Response:**

```json
{
  "total": 42,
  "byType": {
    "ASSET": 10,
    "LIABILITY": 8,
    "EQUITY": 4,
    "INCOME": 10,
    "EXPENSE": 10
  },
  "rootCount": 5,
  "leafCount": 18
}
```

---

## 6. Journal Entries for an Account

### 6.1 Get Journal Entries for an Account

- **Method**: `GET`
- **Path**: `/api/v1/accounting/coa/:id/journal-entries`

Returns journal entries affecting the specified account (including descendant accounts in the COA hierarchy). `:id` is the COA account `_id`.

**Query params:**

| Param      | Type   | Required | Description                                   |
| ---------- | ------ | -------- | --------------------------------------------- |
| `page`     | number | No       | Page number (default `1`)                     |
| `limit`    | number | No       | Items per page (default `10`)                  |
| `status`   | string | No       | Filter by `DRAFT`, `POSTED`, or `REVERSED`    |
| `dateFrom` | string | No       | Filter entries on or after this date (ISO)    |
| `dateTo`   | string | No       | Filter entries on or before this date (ISO)   |

**Response:**

```json
{
  "data": {
    "entries": {
      "account": { "_id": "...", "name": "...", "code": "...", "type": "ASSET" },
      "descendantAccounts": [...],
      "journalEntries": [...],
      "totalDocs": 25,
      "limit": 10,
      "page": 1,
      "totalPages": 3,
      "nextPage": true,
      "prevPage": false
    }
  }
}
```

Journal entries include only lines affecting the account or its descendants.

**Related:** Full journal CRUD and status operations are in the [Journal API](../journal/journal.api.md). Reports (Trial Balance, Balance Sheet, P&L, Cash Flow, GST Summary) are in the [Reports API](../reports/reports.api.md).

