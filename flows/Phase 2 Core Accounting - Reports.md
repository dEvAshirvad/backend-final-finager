# Phase 2 – Core Accounting & Reporting Flow

This document describes the end-to-end testing flow for Phase 2, covering:

- **Chart of Accounts (COA)** – create, list, tree, hierarchy, template
- **Journal Entries** – create, post, reverse, CRUD
- **Reports** – Trial Balance, Balance Sheet, Inventory, GST Summary, P&L, Cash Flow

**Prerequisites:** User is signed in, session has `activeOrganizationId`, and user is a member of the organization (from Phase 1).

---

## Test Variables

Before running curls, set these (or replace in commands):

```bash
BASE_URL="http://localhost:3001"
TOKEN="4RnJBxbgXG4lIuiaGdKetpBYks52VqNl"   # From sign-in / get-session
ORG_ID="698c7aa4d92e03597be8d492"           # activeOrganizationId
```

**Retail COA Account IDs** (from GET /coa/tree/all – replace with your org's `_id` values):

```bash
# Cash & Bank
CASH_ID="698de41eee41e91dac1ef43a"        # 1001 Cash in Hand
BANK_ID="698de41eee41e91dac1ef43b"        # 1002 Bank Accounts
# Equity
CAPITAL_ID="698de41eee41e91dac1ef445"     # 3000 Owner's Capital
# Income
SALES_ID="698de41eee41e91dac1ef447"       # 4000 Sales Revenue
# Expenses
RENT_ID="698de41eee41e91dac1ef44c"       # 5200 Rent Expense
```

Use `-H "Authorization: Bearer $TOKEN"` and `--cookie "apiKeyCookie=$TOKEN"` for authenticated requests.

---

## User Story

**As a CA**, I want to:

1. Set up Chart of Accounts for my organization
2. Create and post journal entries
3. View Trial Balance, Balance Sheet, and reports

---

## 1. Auth & Session (Prerequisites – from Phase 1)

### 1.1 Sign In

```bash
curl "$BASE_URL/api/auth/sign-in/email" \
  --request POST \
  --header 'Content-Type: application/json' \
  --header 'Accept: */*' \
  --header "Authorization: Bearer $TOKEN" \
  --cookie "apiKeyCookie=$TOKEN" \
  --data '{
    "email": "ashirvadsatapathy2828@gmail.com",
    "password": "ashirvadsatapathy2828",
    "rememberMe": true
  }'
```

**Expected:** `{ "token": "...", "user": { ... } }`

### 1.2 Get Session

```bash
curl "$BASE_URL/api/auth/get-session" \
  --header 'Accept: */*' \
  --header "Authorization: Bearer $TOKEN" \
  --cookie "apiKeyCookie=$TOKEN"
```

**Expected:** `session.activeOrganizationId` and `user` populated.

### 1.3 Get Full Organization

```bash
curl "$BASE_URL/api/auth/organization/get-full-organization" \
  --header 'Accept: */*' \
  --header "Authorization: Bearer $TOKEN" \
  --cookie "apiKeyCookie=$TOKEN"
```

### 1.4 Access Check (COA create permission)

```bash
curl "$BASE_URL/api/auth/organization/has-permission" \
  --request POST \
  --header 'Content-Type: application/json' \
  --header "Authorization: Bearer $TOKEN" \
  --cookie "apiKeyCookie=$TOKEN" \
  --data '{
    "permissions": {
      "coa": ["create"]
    }
  }'
```

**Expected:** `{ "success": true }`

---

## 2. Chart of Accounts (COA)

### 2.1 Create Accounts from Template

```bash
curl "$BASE_URL/api/v1/accounting/coa/template" \
  --request POST \
  --header 'Content-Type: application/json' \
  --header "Authorization: Bearer $TOKEN" \
  --cookie "apiKeyCookie=$TOKEN" \
  --data '{
    "accounts": [
      { "code": "1000", "name": "Assets Root", "type": "ASSET", "normalBalance": "DEBIT", "parentCode": null },
      { "code": "1100", "name": "Cash and Bank", "type": "ASSET", "normalBalance": "DEBIT", "parentCode": "1000" },
      { "code": "1001", "name": "Cash in Hand", "type": "ASSET", "normalBalance": "DEBIT", "parentCode": "1100" },
      { "code": "2000", "name": "Liabilities Root", "type": "LIABILITY", "normalBalance": "CREDIT", "parentCode": null },
      { "code": "2100", "name": "Capital", "type": "EQUITY", "normalBalance": "CREDIT", "parentCode": null },
      { "code": "3000", "name": "Income Root", "type": "INCOME", "normalBalance": "CREDIT", "parentCode": null },
      { "code": "3100", "name": "Sales", "type": "INCOME", "normalBalance": "CREDIT", "parentCode": "3000" },
      { "code": "4000", "name": "Expenses Root", "type": "EXPENSE", "normalBalance": "DEBIT", "parentCode": null },
      { "code": "4100", "name": "Operating Expenses", "type": "EXPENSE", "normalBalance": "DEBIT", "parentCode": "4000" }
    ]
  }'
```

**Save account IDs** from response (e.g. Cash in Hand `1001`, Capital `2100`, Sales `3100`) for journal entries.

### 2.2 Create Single COA Account (Retail)

Create one account for the Retail industry. Use a unique code (e.g. `5700`) to avoid conflict with template accounts (1001–5600):

```bash
curl "$BASE_URL/api/v1/accounting/coa" \
  --request POST \
  --header 'Content-Type: application/json' \
  --header "Authorization: Bearer $TOKEN" \
  --cookie "apiKeyCookie=$TOKEN" \
  --data '{
    "code": "5700",
    "name": "Miscellaneous Expense",
    "description": "Other retail operating expenses",
    "type": "EXPENSE",
    "normalBalance": "DEBIT",
    "parentCode": null
  }'
```

**Expected:** `201 Created` with the created account. `organizationId` is taken from session `activeOrganizationId`.

### 2.3 List Accounts (Paginated)

```bash
curl "$BASE_URL/api/v1/accounting/coa?page=1&limit=20" \
  --header "Authorization: Bearer $TOKEN" \
  --cookie "apiKeyCookie=$TOKEN"
```

### 2.3 List Accounts by Type (ASSET)

```bash
curl "$BASE_URL/api/v1/accounting/coa?type=ASSET&page=1&limit=20" \
  --header "Authorization: Bearer $TOKEN" \
  --cookie "apiKeyCookie=$TOKEN"
```

### 2.4 Get Full COA Tree

```bash
curl "$BASE_URL/api/v1/accounting/coa/tree/all" \
  --header "Authorization: Bearer $TOKEN" \
  --cookie "apiKeyCookie=$TOKEN"
```

### 2.5 Get Root Accounts

```bash
curl "$BASE_URL/api/v1/accounting/coa/tree/roots" \
  --header "Authorization: Bearer $TOKEN" \
  --cookie "apiKeyCookie=$TOKEN"
```

### 2.6 Get Leaf Accounts

```bash
curl "$BASE_URL/api/v1/accounting/coa/tree/leaves" \
  --header "Authorization: Bearer $TOKEN" \
  --cookie "apiKeyCookie=$TOKEN"
```

### 2.7 Get Account by Code

```bash
curl "$BASE_URL/api/v1/accounting/coa/code/1001" \
  --header "Authorization: Bearer $TOKEN" \
  --cookie "apiKeyCookie=$TOKEN"
```

**Save `_id`** of this account for journal lines.

### 2.8 Get Account by ID

Use an account `_id` from 2.1 or 2.7 (e.g. `ACCOUNT_1001_ID`):

```bash
curl "$BASE_URL/api/v1/accounting/coa/ACCOUNT_1001_ID" \
  --header "Authorization: Bearer $TOKEN" \
  --cookie "apiKeyCookie=$TOKEN"
```

### 2.9 Overview Statistics

```bash
curl "$BASE_URL/api/v1/accounting/coa/statistics/overview" \
  --header "Authorization: Bearer $TOKEN" \
  --cookie "apiKeyCookie=$TOKEN"
```

---

## 3. Journal Entries

Use the account IDs from **Test Variables** (`$CASH_ID`, `$CAPITAL_ID`, etc.) or extract from `GET /coa/tree/all`.

### 3.1 Validate Transactions (No Create)

```bash
curl "$BASE_URL/api/v1/accounting/journal/validate" \
  --request POST \
  --header 'Content-Type: application/json' \
  --header "Authorization: Bearer $TOKEN" \
  --cookie "apiKeyCookie=$TOKEN" \
  --data '{
    "lines": [
      { "accountId": "'"$CASH_ID"'", "debit": 100000, "credit": 0 },
      { "accountId": "'"$CAPITAL_ID"'", "debit": 0, "credit": 100000 }
    ]
  }'
```

**Expected:** `{ "isValid": true, "balanceSheetBalanced": true, ... }`

### 3.2 Create JV-001: Owner Capital Contribution (CA/Owner → POSTED)

Owner contributes ₹1,00,000 cash to start the business:

```bash
curl "$BASE_URL/api/v1/accounting/journal" \
  --request POST \
  --header 'Content-Type: application/json' \
  --header "Authorization: Bearer $TOKEN" \
  --cookie "apiKeyCookie=$TOKEN" \
  --data '{
    "date": "2026-02-12",
    "reference": "JV-001",
    "description": "Owner capital contribution",
    "lines": [
      { "accountId": "'"$CASH_ID"'", "debit": 100000, "credit": 0, "narration": "Cash received" },
      { "accountId": "'"$CAPITAL_ID"'", "debit": 0, "credit": 100000, "narration": "Capital contribution" }
    ]
  }'
```

**Expected:** `201 Created`, status `POSTED`. **Save `_id`** for post/reverse flows.

### 3.2b Create JV-002: Cash Sale

Cash sale of goods ₹25,000:

```bash
curl "$BASE_URL/api/v1/accounting/journal" \
  --request POST \
  --header 'Content-Type: application/json' \
  --header "Authorization: Bearer $TOKEN" \
  --cookie "apiKeyCookie=$TOKEN" \
  --data '{
    "date": "2026-02-12",
    "reference": "JV-002",
    "description": "Cash sale",
    "lines": [
      { "accountId": "'"$CASH_ID"'", "debit": 25000, "credit": 0, "narration": "Cash received from sale" },
      { "accountId": "'"$SALES_ID"'", "debit": 0, "credit": 25000, "narration": "Sales revenue" }
    ]
  }'
```

### 3.2c Create JV-003: Rent Payment

Rent payment ₹5,000 from cash:

```bash
curl "$BASE_URL/api/v1/accounting/journal" \
  --request POST \
  --header 'Content-Type: application/json' \
  --header "Authorization: Bearer $TOKEN" \
  --cookie "apiKeyCookie=$TOKEN" \
  --data '{
    "date": "2026-02-12",
    "reference": "JV-003",
    "description": "Monthly rent payment",
    "lines": [
      { "accountId": "'"$RENT_ID"'", "debit": 5000, "credit": 0, "narration": "Rent expense" },
      { "accountId": "'"$CASH_ID"'", "debit": 0, "credit": 5000, "narration": "Cash paid" }
    ]
  }'
```

After JV-001, JV-002, JV-003: Cash = 1,20,000; Capital = 1,00,000; Sales = 25,000; Rent = 5,000. Use **Trial Balance** and **Balance Sheet** to validate.

**Quick copy-paste** (uses concrete Retail COA IDs – replace if your org differs):

```bash
# JV-001: Owner capital ₹1,00,000
curl "$BASE_URL/api/v1/accounting/journal" -X POST -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" -b "apiKeyCookie=$TOKEN" \
  -d '{"date":"2026-02-12","reference":"JV-001","description":"Owner capital contribution","lines":[{"accountId":"698de41eee41e91dac1ef43a","debit":100000,"credit":0,"narration":"Cash received"},{"accountId":"698de41eee41e91dac1ef445","debit":0,"credit":100000,"narration":"Capital contribution"}]}'
```

### 3.3 List Journal Entries

```bash
curl "$BASE_URL/api/v1/accounting/journal?page=1&limit=10" \
  --header "Authorization: Bearer $TOKEN" \
  --cookie "apiKeyCookie=$TOKEN"
```

### 3.4 Get Journal Entry by ID

```bash
curl "$BASE_URL/api/v1/accounting/journal/JOURNAL_ENTRY_ID" \
  --header "Authorization: Bearer $TOKEN" \
  --cookie "apiKeyCookie=$TOKEN"
```

### 3.5 Create DRAFT Entry (for Post flow)

If testing with Staff, create as DRAFT. As CA, create another entry as DRAFT by using Staff user, or create a second org. For simplicity, **create a second journal as DRAFT** – Staff would create DRAFT; Owner/CA create POSTED. To test Post:

**Option A:** Invite a staff user, sign in as staff, create DRAFT, then sign in as CA and post.

**Option B:** Use a journal that was created as POSTED and test **Reverse** instead.

### 3.6 Post Journal Entry (DRAFT → POSTED)

```bash
curl "$BASE_URL/api/v1/accounting/journal/JOURNAL_ENTRY_ID/post" \
  --request PATCH \
  --header "Authorization: Bearer $TOKEN" \
  --cookie "apiKeyCookie=$TOKEN"
```

**Note:** Only works if entry is DRAFT. Owner/CA only.

### 3.7 Reverse Journal Entry (POSTED → REVERSED)

```bash
curl "$BASE_URL/api/v1/accounting/journal/JOURNAL_ENTRY_ID/reverse" \
  --request PATCH \
  --header "Authorization: Bearer $TOKEN" \
  --cookie "apiKeyCookie=$TOKEN"
```

**Note:** Only works if entry is POSTED. Owner/CA only. Reverses COA balances.

### 3.8 Get Journal Entries for COA Account

Use Cash account `_id`:

```bash
curl "$BASE_URL/api/v1/accounting/coa/ACCOUNT_CASH_ID/journal-entries?page=1&limit=10" \
  --header "Authorization: Bearer $TOKEN" \
  --cookie "apiKeyCookie=$TOKEN"
```

---

## 4. Reports

### 4.1 Trial Balance (Latest)

```bash
curl "$BASE_URL/api/v1/accounting/reports/trial-balance" \
  --header "Authorization: Bearer $TOKEN" \
  --cookie "apiKeyCookie=$TOKEN"
```

### 4.2 Trial Balance (As of Date)

```bash
curl "$BASE_URL/api/v1/accounting/reports/trial-balance?asOfDate=2026-02-11" \
  --header "Authorization: Bearer $TOKEN" \
  --cookie "apiKeyCookie=$TOKEN"
```

### 4.3 Balance Sheet (Latest)

```bash
curl "$BASE_URL/api/v1/accounting/reports/balance-sheet" \
  --header "Authorization: Bearer $TOKEN" \
  --cookie "apiKeyCookie=$TOKEN"
```

### 4.4 Balance Sheet (As of Date)

```bash
curl "$BASE_URL/api/v1/accounting/reports/balance-sheet?asOfDate=2026-02-11" \
  --header "Authorization: Bearer $TOKEN" \
  --cookie "apiKeyCookie=$TOKEN"
```

### 4.5 Inventory Valuation Report

```bash
curl "$BASE_URL/api/v1/accounting/reports/inventory-valuation" \
  --header "Authorization: Bearer $TOKEN" \
  --cookie "apiKeyCookie=$TOKEN"
```

### 4.6 GST Summary (GSTR-3B Pre-fill)

```bash
curl "$BASE_URL/api/v1/accounting/reports/gst-summary?periodFrom=2026-02-01&periodTo=2026-02-28" \
  --header "Authorization: Bearer $TOKEN" \
  --cookie "apiKeyCookie=$TOKEN"
```

### 4.7 P&L (Profit & Loss) – Default Config

```bash
curl "$BASE_URL/api/v1/accounting/reports/profit-loss" \
  --request POST \
  --header 'Content-Type: application/json' \
  --header "Authorization: Bearer $TOKEN" \
  --cookie "apiKeyCookie=$TOKEN" \
  --data '{
    "periodFrom": "2026-02-01",
    "periodTo": "2026-02-28"
  }'
```

### 4.8 P&L with Custom Config

Replace account IDs with real COA `_id` values:

```bash
curl "$BASE_URL/api/v1/accounting/reports/profit-loss" \
  --request POST \
  --header 'Content-Type: application/json' \
  --header "Authorization: Bearer $TOKEN" \
  --cookie "apiKeyCookie=$TOKEN" \
  --data '{
    "periodFrom": "2026-02-01",
    "periodTo": "2026-02-28",
    "config": {
      "revenue": [{ "label": "Sales", "accountIds": ["SALES_ACCOUNT_ID"] }],
      "cogs": [],
      "operatingExpenses": [{ "label": "Operating", "accountIds": ["EXPENSE_ACCOUNT_ID"] }],
      "otherIncome": [],
      "otherExpenses": []
    }
  }'
```

### 4.9 Cash Flow (Empty Config)

```bash
curl "$BASE_URL/api/v1/accounting/reports/cash-flow" \
  --request POST \
  --header 'Content-Type: application/json' \
  --header "Authorization: Bearer $TOKEN" \
  --cookie "apiKeyCookie=$TOKEN" \
  --data '{
    "periodFrom": "2026-02-01",
    "periodTo": "2026-02-28"
  }'
```

### 4.10 Cash Flow with Custom Config

```bash
curl "$BASE_URL/api/v1/accounting/reports/cash-flow" \
  --request POST \
  --header 'Content-Type: application/json' \
  --header "Authorization: Bearer $TOKEN" \
  --cookie "apiKeyCookie=$TOKEN" \
  --data '{
    "periodFrom": "2026-02-01",
    "periodTo": "2026-02-28",
    "config": {
      "operating": [
        { "label": "Cash from customers", "accountIds": ["CASH_ACCOUNT_ID"], "sign": "positive" }
      ],
      "investing": [],
      "financing": []
    }
  }'
```

---

## 5. Quick Test Script (Bash)

Save as `test-phase2.sh` and run after setting `BASE_URL` and `TOKEN`:

```bash
#!/bin/bash
BASE_URL="${BASE_URL:-http://localhost:3001}"
TOKEN="${TOKEN:-YOUR_TOKEN}"

auth_header="Authorization: Bearer $TOKEN"
cookie="apiKeyCookie=$TOKEN"

echo "=== 1. COA Template ==="
curl -s "$BASE_URL/api/v1/accounting/coa/template" -X POST -H "Content-Type: application/json" -H "$auth_header" -b "$cookie" \
  -d '{"accounts":[{"code":"1001","name":"Cash","type":"ASSET","normalBalance":"DEBIT","parentCode":null},{"code":"2100","name":"Capital","type":"EQUITY","normalBalance":"CREDIT","parentCode":null}]}' | jq .

echo "=== 2. List COA ==="
curl -s "$BASE_URL/api/v1/accounting/coa?page=1&limit=5" -H "$auth_header" -b "$cookie" | jq .

echo "=== 3. Trial Balance ==="
curl -s "$BASE_URL/api/v1/accounting/reports/trial-balance" -H "$auth_header" -b "$cookie" | jq .

echo "=== 4. Balance Sheet ==="
curl -s "$BASE_URL/api/v1/accounting/reports/balance-sheet" -H "$auth_header" -b "$cookie" | jq .
```

**Usage:** `TOKEN=your_token ./test-phase2.sh`

---

## 5.1 Concrete Run Example (Extract IDs)

After creating template, extract account IDs for journal entries:

```bash
# Create template and save response
COA_RESPONSE=$(curl -s "$BASE_URL/api/v1/accounting/coa/template" -X POST \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" -b "apiKeyCookie=$TOKEN" \
  -d '{"accounts":[
    {"code":"1001","name":"Cash in Hand","type":"ASSET","normalBalance":"DEBIT","parentCode":null},
    {"code":"2100","name":"Capital","type":"EQUITY","normalBalance":"CREDIT","parentCode":null}
  ]}')

# Extract IDs (requires jq)
CASH_ID=$(echo "$COA_RESPONSE" | jq -r '.data[0]._id // .data[0].id // empty')
CAPITAL_ID=$(echo "$COA_RESPONSE" | jq -r '.data[1]._id // .data[1].id // empty')

# Create journal entry
curl -s "$BASE_URL/api/v1/accounting/journal" -X POST \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" -b "apiKeyCookie=$TOKEN" \
  -d "{\"date\":\"2026-02-11\",\"reference\":\"JV-001\",\"description\":\"Capital deposit\",\"lines\":[
    {\"accountId\":\"$CASH_ID\",\"debit\":50000,\"credit\":0},
    {\"accountId\":\"$CAPITAL_ID\",\"debit\":0,\"credit\":50000}
  ]}" | jq .
```

**Note:** Response structure may use `data` array or direct array – adjust jq path as needed.

---

## 6. Expected Outcomes Summary

| Stage | Endpoint | Expected |
|-------|----------|----------|
| COA Template | POST /coa/template | 201, array of created accounts |
| COA List | GET /coa | 200, paginated data |
| COA Tree | GET /coa/tree/all | 200, tree with children |
| Journal Create | POST /journal | 201, entry with status POSTED (CA) or DRAFT (Staff) |
| Journal List | GET /journal | 200, paginated entries |
| Journal Validate | POST /journal/validate | 200, isValid, balanceSheetBalanced |
| Journal Post | PATCH /journal/:id/post | 200, status POSTED |
| Journal Reverse | PATCH /journal/:id/reverse | 200, status REVERSED |
| Trial Balance | GET /reports/trial-balance | 200, rows, totalDebit, totalCredit |
| Balance Sheet | GET /reports/balance-sheet | 200, assets, liabilities, equity, balanced |
| Inventory | GET /reports/inventory-valuation | 200, rows, totalValue |
| GST Summary | GET /reports/gst-summary | 200, table31, table4 |
| P&L | POST /reports/profit-loss | 200, revenue, netIncome, etc. |
| Cash Flow | POST /reports/cash-flow | 200, operating, investing, financing |

---

## 7. Permission Reference (from organizationConfig.ts)

| Resource | CA / Owner | Staff |
|----------|------------|-------|
| coa | create, read, update, delete, readAll | create, read, update |
| journel | create, read, update, delete, readAll, post, reverse, validate | create, read, update, post, readAll, validate |

Reports use organization membership (no explicit permission check) – any member can access.
