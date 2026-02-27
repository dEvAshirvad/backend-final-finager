# Financial Reports API Documentation

This document describes the financial reporting system that generates Trial Balance, Balance Sheet, Net Income, Profit & Loss (P&L), Cash Flow, Inventory Valuation, and GST Summary reports from **posted** journal entries.

## Overview

The Reports module provides standard financial reports based on posted journal entries:

- **Trial Balance** – Lists all accounts with debit and credit balances to verify the accounting equation (as of a date).
- **Balance Sheet** – Shows assets, liabilities, and equity at a specific point in time.
- **Net Income Report** – Simplified report showing total revenue, expenses, and net income for a period.
- **Profit & Loss (P&L)** – Detailed income statement with configurable sections (revenue, COGS, operating expenses, etc.).
- **Cash Flow Statement** – Shows cash inflows and outflows by Operating, Investing, and Financing activities, with **journal-level items** (description, date, reference).
- **Inventory Valuation** – ASSET account balances (optionally filtered by parent code).
- **GST Summary** – GSTR-3B pre-fill (Table 3.1, Table 4).

All reports use only **POSTED** journal entries and follow standard accounting principles.

**Base path:** `/api/v1/accounting/reports`

**Requirements:** Authenticated user, member of the active organization, `activeOrganizationId` set in session.

## Accounting Principles

### Profit & Loss

```
Revenue - Expenses = Net Income
```

- **Revenue**: Income accounts (credit increases, debit decreases).
- **Expenses**: Expense accounts (debit increases, credit decreases).
- **Net Income**: Revenue − Expenses.

### Balance Sheet

```
Assets = Liabilities + Equity
```

- **Assets**: Asset accounts (debit increases, credit decreases).
- **Liabilities**: Liability accounts (credit increases, debit decreases).
- **Equity**: Equity accounts (credit increases, debit decreases). Net Income is included in the equation.

## API Endpoints

| Report | Method | Path | Key Params |
|--------|--------|------|------------|
| Trial Balance | GET | `/trial-balance` | `asOfDate` (opt) |
| Balance Sheet | GET | `/balance-sheet` | `asOfDate` (opt) |
| Net Income | GET | `/net-income` | `periodFrom`, `periodTo` |
| P&L | POST | `/profit-loss` | Body: `periodFrom`, `periodTo`, `config` (opt) |
| Cash Flow | POST | `/cash-flow` | Body: `periodFrom`, `periodTo`, `config` (opt) |
| Inventory Valuation | GET | `/inventory-valuation` | `asOfDate`, `inventoryParentCode` (opt) |
| GST Summary | GET | `/gst-summary` | `periodFrom`, `periodTo` |

**Point-in-time reports** (Trial Balance, Balance Sheet, Inventory) use only POSTED journal entries. When `asOfDate` is omitted, they use COA `currentBalance` (latest posted state).

**Config-based reports** (P&L, Cash Flow) use **account codes** (e.g. `4000`, `1001`). If `config` is omitted, the backend uses a **default code-based config** so the report works for every org.

---

## Data Models

### Account Balance (used in Balance Sheet, P&L)

```typescript
{
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: 'asset' | 'liability' | 'equity' | 'income' | 'expense';
  balance: number;
  parentCode?: string | null;
  children?: AccountBalance[];
}
```

### Trial Balance Report

```typescript
{
  asOf: Date;
  accounts: TrialBalanceAccount[];
  totalDebits: number;
  totalCredits: number;
  isBalanced: boolean;
  difference?: number;  // Only present if not balanced
}

interface TrialBalanceAccount {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  debitBalance: number;
  creditBalance: number;
}
```

### Balance Sheet Report

```typescript
{
  asOf: Date;
  assets: { accounts: AccountBalance[]; total: number };
  liabilities: { accounts: AccountBalance[]; total: number };
  equity: { accounts: AccountBalance[]; total: number };
  netIncome: number;
  totalLiabilitiesAndEquity: number;
  isBalanced: boolean;
  difference?: number;  // Only present if not balanced
}
```

### Net Income Report

```typescript
{
  period: { from: Date; to: Date };
  revenue: number;
  expenses: number;
  netIncome: number;
}
```

### Cash Flow Report

```typescript
{
  period: { from: Date; to: Date };
  openingCashBalance: number;
  operating: CashFlowSection;
  investing: CashFlowSection;
  financing: CashFlowSection;
  netCashFlow: number;
  closingCashBalance: number;
  usedDefaultConfig: boolean;
}

interface CashFlowSection {
  label: string;
  lineItems: { label: string; accountCodes: string[]; amount: number; accounts?: { code: string; name: string; amount: number }[] }[];
  items?: CashFlowItemDetail[];  // Journal-level detail
  total: number;
}
```

### Cash Flow Item (journal-level)

```typescript
{
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  amount: number;  // Positive = inflow, negative = outflow
  description?: string;
  date?: Date;
  reference?: string;
}
```

---

## Endpoint Details

### Get Trial Balance

**GET** `/api/v1/accounting/reports/trial-balance`

Generates a Trial Balance as of a specific date (defaults to today if not provided). Verifies that total debits equal total credits.

**Query parameters**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `asOfDate` | string (ISO 8601) | No | As-of date (e.g. `2025-12-31` or `2025-12-31T23:59:59.999Z`). Omit for latest. |

**Response:** `200 OK`

```json
{
  "success": true,
  "status": 200,
  "data": {
    "message": "Trial balance report",
    "asOf": "2025-12-31T23:59:59.999Z",
    "accounts": [
      {
        "accountId": "...",
        "accountCode": "1101",
        "accountName": "Cash in Hand",
        "accountType": "asset",
        "debitBalance": 150000,
        "creditBalance": 0
      },
      {
        "accountId": "...",
        "accountCode": "4000",
        "accountName": "Sales Revenue",
        "accountType": "income",
        "debitBalance": 0,
        "creditBalance": 500000
      }
    ],
    "totalDebits": 530000,
    "totalCredits": 530000,
    "isBalanced": true
  }
}
```

**When Trial Balance does not balance:**

```json
{
  "data": {
    "message": "Trial balance report",
    "asOf": "2025-12-31T23:59:59.999Z",
    "accounts": [...],
    "totalDebits": 530000,
    "totalCredits": 529999.50,
    "isBalanced": false,
    "difference": 0.50
  }
}
```

---

### Get Balance Sheet

**GET** `/api/v1/accounting/reports/balance-sheet`

Generates a Balance Sheet as of a specific date (defaults to today if not provided).

**Query parameters**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `asOfDate` | string (ISO 8601) | No | As-of date. Omit for current date. |

**Response:** `200 OK`

```json
{
  "success": true,
  "status": 200,
  "data": {
    "message": "Balance sheet report",
    "asOf": "2025-12-31T23:59:59.999Z",
    "assets": {
      "type": "ASSET",
      "label": "Assets",
      "accounts": [
        {
          "accountId": "...",
          "accountCode": "1001",
          "accountName": "Cash in Hand",
          "accountType": "asset",
          "balance": 150000
        },
        {
          "accountId": "...",
          "accountCode": "1200",
          "accountName": "Accounts Receivable",
          "accountType": "asset",
          "balance": 80000
        }
      ],
      "total": 330000
    },
    "liabilities": {
      "type": "LIABILITY",
      "label": "Liabilities",
      "accounts": [
        {
          "accountId": "...",
          "accountCode": "2000",
          "accountName": "Accounts Payable",
          "accountType": "liability",
          "balance": 50000
        }
      ],
      "total": 80000
    },
    "equity": {
      "type": "EQUITY",
      "label": "Equity",
      "accounts": [
        {
          "accountId": "...",
          "accountCode": "3000",
          "accountName": "Owner's Capital",
          "accountType": "equity",
          "balance": 250000
        }
      ],
      "total": 250000
    },
    "netIncome": 0,
    "totalLiabilitiesAndEquity": 330000,
    "isBalanced": true
  }
}
```

**When Balance Sheet does not balance:**

```json
{
  "data": {
    "asOf": "2025-12-31T23:59:59.999Z",
    "assets": { "accounts": [...], "total": 330000 },
    "liabilities": { "accounts": [...], "total": 80000 },
    "equity": { "accounts": [...], "total": 249999.50 },
    "netIncome": 0,
    "totalLiabilitiesAndEquity": 329999.50,
    "isBalanced": false,
    "difference": 0.50
  }
}
```

---

### Get Net Income Report

**GET** `/api/v1/accounting/reports/net-income`

Simplified Net Income for the period: total revenue, total expenses, net income (from posted journals).

**Query parameters**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `periodFrom` | string (ISO 8601) | Yes | Start date (e.g. `2025-01-01`) |
| `periodTo` | string (ISO 8601) | Yes | End date (e.g. `2025-12-31`) |

**Response:** `200 OK`

```json
{
  "success": true,
  "status": 200,
  "data": {
    "message": "Net income report",
    "period": {
      "from": "2025-01-01T00:00:00.000Z",
      "to": "2025-12-31T23:59:59.999Z"
    },
    "revenue": 700000,
    "expenses": 450000,
    "netIncome": 250000
  }
}
```

**Error:** `400 Bad Request` – Missing `periodFrom` or `periodTo`.

---

### Get Profit & Loss Report

**POST** `/api/v1/accounting/reports/profit-loss`

Detailed P&L for the period with configurable sections (revenue, COGS, operating expenses, other income/expenses). Config uses **account codes**; omit `config` to use the default code-based config.

**Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `periodFrom` | string (ISO date) | Yes | Period start |
| `periodTo` | string (ISO date) | Yes | Period end |
| `config` | PnLConfig | No | Section-wise line items with `accountCodes`. Omit for default. |

**PnLConfig:** `revenue`, `cogs`, `operatingExpenses`, `otherIncome`, `otherExpenses` – each an array of `{ label: string, accountCodes: string[] }`.

**Response:** `200 OK` – Includes `periodFrom`, `periodTo`, `revenue`, `cogs`, `grossProfit`, `operatingExpenses`, `operatingIncome`, `otherIncome`, `otherExpenses`, `netIncome`, `usedDefaultConfig`. Each section has `label`, `lineItems` (with optional `accounts: { code, name, amount }[]`), and `total`.

**Error:** `400 Bad Request` – Missing `periodFrom` or `periodTo`.

---

### Get Cash Flow Report

**POST** `/api/v1/accounting/reports/cash-flow`

Cash Flow Statement for the period. Returns **period**, **openingCashBalance**, **closingCashBalance**, **netCashFlow**, and for each section (operating, investing, financing) **lineItems** (aggregated by config) and **items** (journal-level detail: description, date, reference from posted journal entries that affect cash accounts).

**Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `periodFrom` | string (ISO date) | Yes | Period start |
| `periodTo` | string (ISO date) | Yes | Period end |
| `config` | CashFlowConfig | No | Operating / investing / financing line items with `accountCodes`. Omit for default. |

**CashFlowConfig:** `operating`, `investing`, `financing` – each an array of `{ label: string, accountCodes: string[], sign?: 'positive' | 'negative' }`.

**Response:** `200 OK`

```json
{
  "success": true,
  "status": 200,
  "data": {
    "message": "Cash flow report",
    "period": {
      "from": "2025-01-01T00:00:00.000Z",
      "to": "2025-12-31T23:59:59.999Z"
    },
    "openingCashBalance": 100000,
    "operating": {
      "label": "Operating Activities",
      "lineItems": [
        { "label": "Cash and Bank", "accountCodes": ["1001", "1002"], "amount": 50000, "accounts": [{ "code": "1001", "name": "Cash in Hand", "amount": 50000 }] }
      ],
      "items": [
        {
          "accountId": "...",
          "accountCode": "4000",
          "accountName": "Sales Revenue",
          "accountType": "income",
          "amount": 50000,
          "description": "Invoice INV-2025-0001",
          "date": "2025-11-20T00:00:00.000Z",
          "reference": "INV-2025-0001"
        }
      ],
      "total": 50000
    },
    "investing": {
      "label": "Investing Activities",
      "lineItems": [],
      "items": [
        {
          "accountId": "...",
          "accountCode": "1500",
          "accountName": "Fixed Assets - Equipment",
          "accountType": "asset",
          "amount": -50000,
          "description": "Purchase of equipment",
          "date": "2025-06-15T00:00:00.000Z",
          "reference": "PUR-001"
        }
      ],
      "total": -50000
    },
    "financing": {
      "label": "Financing Activities",
      "lineItems": [],
      "items": [],
      "total": 0
    },
    "netCashFlow": 0,
    "closingCashBalance": 100000,
    "usedDefaultConfig": true
  }
}
```

**Error:** `400 Bad Request` – Missing `periodFrom` or `periodTo`.

---

### Get Inventory Valuation

**GET** `/api/v1/accounting/reports/inventory-valuation`

ASSET account balances as of a date. Optionally filter by `inventoryParentCode`.

**Query parameters**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `asOfDate` | string (ISO) | No | As-of date |
| `inventoryParentCode` | string | No | Filter by parent code or prefix |

**Response:** `200 OK` – `asOfDate`, `rows` (`{ accountId, code, name, balance }`), `totalValue`.

---

### Get GST Summary

**GET** `/api/v1/accounting/reports/gst-summary`

GSTR-3B pre-fill: Table 3.1 (Outward supplies), Table 4 (ITC), **driven entirely from posted journal entries** (output tax and ITC accounts).

**Query parameters**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `periodFrom` | string (ISO) | Yes | Period start |
| `periodTo` | string (ISO) | Yes | Period end |

**Response:** `200 OK` – `periodFrom`, `periodTo`, `table31`, `table4`, optional `note`.

---

## GST Reconciliation Engine (GSTR‑2B vs Books)

The GST reconciliation engine compares **supplier GST invoices from GSTR‑2B** (e.g. `gstr2b.csv`) with **input tax credit booked in your journals** (e.g. from `journal.csv`).

- **Source 1 – Books (journal)**: ITC is read from posted journals where:
  - Debit account is a GST input account (e.g. `1500` – GST Input Credit), and
  - The journal lines fall within the requested period.
- **Source 2 – GSTR‑2B**: Supplier invoices as downloaded from the GSTN portal.
  - File format follows the **GSTR‑2B B2B CSV** header structure (e.g. `GSTIN of supplier`, `Invoice number`, `Invoice Date`, `Taxable Value (₹)`, `Integrated Tax(₹)`, `Central Tax(₹)`, `State/UT Tax(₹)`, `ITC Availability`, etc.).

> In this project, sample data for reconciliation is provided via `journal.csv` (books) and `gstr2b.csv` (GSTR‑2B import).

### Reconciliation Endpoint

**POST** `/api/v1/accounting/reports/gst-reconciliation`

Performs line‑level reconciliation between:

- **GSTR‑2B purchase invoices** – uploaded as a **single CSV file** in the request, and
- **Booked ITC in books** – read automatically from posted journal entries (no need to upload `journal.csv`).

#### Request (multipart/form-data)

Content type: `multipart/form-data`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | file (`text/csv`) | Yes | GSTR‑2B B2B CSV export (e.g. `gstr2b.csv`) |
| `periodFrom` | string (ISO) | Yes | GST period start (e.g. `2026-03-01`) |
| `periodTo` | string (ISO) | Yes | GST period end (e.g. `2026-03-31`) |
| `matchOn` | string (JSON array) | No | Override default match keys, e.g. `["gstin","invoiceNumber","invoiceDate","taxableValue"]` |
| `toleranceAmount` | number | No | Allowed rounding difference in total tax/ITC (₹), default `1.0` |
| `toleranceDateDays` | number | No | Allowed difference in days between portal invoice date and books posting date, default `3` |

**Default matching options**

- `matchOn` (when omitted):
  - `gstin` ↔ `GSTIN of supplier`
  - `invoiceNumber` ↔ `Invoice number`
  - `invoiceDate` ↔ `Invoice Date`
  - `taxableValue` ↔ `Taxable Value (₹)` / sum of taxable base linked to GST input journals.
- `toleranceAmount`: `1.0`
- `toleranceDateDays`: `3`

### Matching Logic (high‑level)

1. **Load GSTR‑2B** rows for the period.
2. **Load journal ITC** lines for the period:
   - Include only lines where `accountCode` is a GST input account (e.g. `1500`).
3. **Normalize keys**:
   - Strip spaces, uppercase invoice numbers.
   - Normalize GSTIN, and parse dates to ISO.
4. **Match** each GSTR‑2B row to books by:
   - Same GSTIN + invoice number.
   - Invoice date within `dateDays` tolerance.
   - Taxable value + tax amounts within `amount` tolerance against the sum of matching journal lines.
5. **Classify**:
   - **`matched`** – fully matched amount and date.
   - **`amountMismatch`** – same invoice but ITC amount differs.
   - **`dateMismatch`** – same invoice and amount, but outside date tolerance.
   - **`missingInBooks`** – present in GSTR‑2B, no ITC booked.
   - **`missingInGstr2b`** – ITC booked in books, but no corresponding GSTR‑2B invoice.

### Response Shape

**Response:** `200 OK`

```json
{
  "success": true,
  "status": 200,
  "data": {
    "period": {
      "from": "2026-03-01T00:00:00.000Z",
      "to": "2026-03-31T23:59:59.999Z"
    },
    "summary": {
      "gstr2bItc": 46350.0,
      "booksItc": 46350.0,
      "difference": 0,
      "matchedCount": 8,
      "missingInBooksCount": 1,
      "missingInGstr2bCount": 0
    },
    "buckets": {
      "matched": [
        {
          "gstin": "22AAYSC0001G1Z1",
          "invoiceNumber": "UTM-INV-0001",
          "invoiceDate": "2026-03-15",
          "gstr2b": {
            "taxableValue": 15000,
            "cgst": 900,
            "sgst": 900,
            "igst": 0
          },
          "books": {
            "journalReferences": ["JV-021"],
            "itcAmount": 1800
          }
        }
      ],
      "amountMismatch": [],
      "dateMismatch": [],
      "missingInBooks": [],
      "missingInGstr2b": []
    }
  }
}
```

### How `journal.csv` and `gstr2b.csv` map to this engine

- **`journal.csv` (books)**:
  - ITC entries like:
    - Debit `1500` (GST Input Credit) with narration such as `"GST input credit on inventory EXP-000007"` or `"GST input credit on consulting EXP-000008"`.
  - These represent **ITC actually recorded in your books**.
- **`gstr2b.csv` (GSTR‑2B)**:
  - Contains supplier GSTIN, invoice numbers, invoice dates, taxable value, and tax split (IGST/CGST/SGST).
  - Represents **ITC available as per GST portal**.

The reconciliation engine allows you to:

- Confirm that **all eligible ITC in `gstr2b.csv` is recorded in `journal.csv`** for the period.
- Identify **missed ITC** (in GSTR‑2B but not in books).
- Identify **incorrectly claimed ITC** (in books but not in GSTR‑2B).

---

## Usage Examples

### Trial Balance

```typescript
const response = await fetch(
  '/api/v1/accounting/reports/trial-balance?asOfDate=2025-12-31',
  { headers: { Cookie: 'session_token=...' } }
);
const { data } = await response.json();
console.log('Total Debits:', data.totalDebits);
console.log('Total Credits:', data.totalCredits);
console.log('Is Balanced:', data.isBalanced);
data.accounts.forEach((a) =>
  console.log(`${a.accountCode} ${a.accountName}: Debit ${a.debitBalance}, Credit ${a.creditBalance}`)
);
```

### Balance Sheet

```typescript
const response = await fetch(
  '/api/v1/accounting/reports/balance-sheet?asOfDate=2025-12-31',
  { headers: { Cookie: 'session_token=...' } }
);
const { data } = await response.json();
console.log('Total Assets:', data.assets.total);
console.log('Total Liabilities + Equity:', data.totalLiabilitiesAndEquity);
console.log('Is Balanced:', data.isBalanced);
```

### Net Income

```typescript
const response = await fetch(
  '/api/v1/accounting/reports/net-income?periodFrom=2025-01-01&periodTo=2025-12-31',
  { headers: { Cookie: 'session_token=...' } }
);
const { data } = await response.json();
console.log('Revenue:', data.revenue);
console.log('Expenses:', data.expenses);
console.log('Net Income:', data.netIncome);
```

### Cash Flow (with journal-level items)

```typescript
const response = await fetch('/api/v1/accounting/reports/cash-flow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Cookie: 'session_token=...' },
  body: JSON.stringify({
    periodFrom: '2025-01-01',
    periodTo: '2025-12-31',
  }),
});
const { data } = await response.json();
console.log('Opening Cash:', data.openingCashBalance);
console.log('Closing Cash:', data.closingCashBalance);
console.log('Net Cash Flow:', data.netCashFlow);
data.operating.items?.forEach((item) => {
  console.log(`${item.reference} ${item.date}: ${item.accountName} ${item.amount}`);
});
```

---

## Report Generation Logic

### Trial Balance

1. Fetch posted journal entries up to the as-of date.
2. Get all active COA accounts; compute balance per account (debit-normal vs credit-normal).
3. For each account, show debit and credit columns; sum total debits and total credits.
4. Report `isBalanced` when totals match within rounding; otherwise include `difference`.

### Balance Sheet

1. Fetch posted journal entries up to the as-of date.
2. Group accounts by type (ASSET, LIABILITY, EQUITY); compute section totals.
3. Compute Net Income (revenue − expenses) and add to equity equation.
4. Compare assets to liabilities + equity; set `isBalanced` and optional `difference`.

### Net Income

1. Fetch posted journal entries in the period.
2. Sum period movements for INCOME accounts (revenue) and EXPENSE accounts (expenses).
3. Return revenue, expenses, netIncome.

### Cash Flow

1. Resolve cash account codes (e.g. from first operating line or default 1001, 1002).
2. Opening cash balance = sum of cash account balances as of (periodFrom − 1).
3. Period movements by account from config (operating/investing/financing); build lineItems and totals.
4. Fetch posted journals in period that touch cash accounts; build **items** with description, date, reference from each journal and categorize by counter account.
5. Net cash flow = sum of section totals; closing cash balance = opening + net cash flow.

### P&L

1. Resolve config account codes to IDs; get period movements.
2. Group by config sections (revenue, COGS, operating expenses, etc.); compute gross profit, operating income, net income.

---

## Important Notes

- **Only posted entries:** Reports include only **POSTED** journal entries. Draft or reversed entries are excluded.
- **Account codes in config:** P&L and Cash Flow use **account codes** in config so the same config works across organizations.
- **Default config:** When `config` is omitted, the backend uses a default code-based config (standard COA template codes).
- **Date handling:** Dates in ISO 8601 format. Balance Sheet and Trial Balance default to current date when `asOfDate` is omitted.
- **Balance validation:** Trial Balance and Balance Sheet set `isBalanced`; when false, `difference` is included (rounding tolerance &lt; 0.02).
- **Cash flow items:** Each section’s `items` array contains journal-level detail (description, date, reference) for posted journals in the period that affect cash accounts.

---

## Error Handling

| Status | Meaning |
|--------|---------|
| `400 Bad Request` | Missing required query/body params (e.g. `periodFrom`, `periodTo`); invalid date format. |
| `403 Forbidden` | Not a member of the active organization or active organization not set. |

---

## Related APIs

- **COA:** `GET /api/v1/accounting/coa`, `GET /api/v1/accounting/coa/tree/all` – use `code` values in P&L and Cash Flow config.
- **Journal:** `GET /api/v1/accounting/journal` – list posted entries; reports are derived from these.
