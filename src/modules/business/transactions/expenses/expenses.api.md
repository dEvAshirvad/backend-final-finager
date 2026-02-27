# Expenses API

This document describes the Expenses (purchase / outlay) API. It reuses the base transaction and adds expense-specific fields.

- **Base transaction:** `src/modules/business/transactions/transaction.model.ts`
- **Expense:** `src/modules/business/transactions/expenses/expenses.model.ts` — `expenseZodSchema`, `expenseZodCreateSchema`, `expenseZodUpdateSchema`

**Base path:** `/api/v1/business/transactions/expenses`

---

## Requirements

- Authenticated user with `activeOrganizationId` in session.
- RBAC: `owner` / `ca` full access; `staff` allowed to create/read/post (no delete).

---

## Business scenarios

| Scenario               | User intent                       | Server behavior |
|------------------------|-----------------------------------|------------------|
| **Single expense**     | One-off (e.g. travel, office).    | Create with `totalAmount` and optional `items` (single line). Post when approved → journal. |
| **Multi-line expense** | Bill with multiple line items.    | Create with `items[]`; server sums to `totalAmount`. Post → journal. |
| **Inventory purchase** | Buy stock you later sell.         | Create with `isInventoryItem: true` and `inventoryItems[]`; post → inventory journal + stock qty increase. |
| **Reimbursement**      | Employee expense to be paid back. | Create as DRAFT; post when approved; record payment (status PAID). |

---

## Expense lifecycle

```
                    ┌──────────────┐
                    │   DRAFT      │
                    └──────┬───────┘
                           │ POST
                           ▼
                    ┌──────────────┐     Pay (full)     ┌──────────────┐
                    │   POSTED     │ ──────────────────►│    PAID       │
                    └──────┬───────┘                    └──────────────┘
                           │ CANCEL (reversal)
                           ▼
                    ┌──────────────┐
                    │  CANCELLED   │
                    └──────────────┘

  From DRAFT: DELETE → hard delete (no journal).
```

| Status      | Meaning |
|------------|---------|
| **DRAFT**  | Expense created; editable. No journal. |
| **POSTED** | Finalized: journal entry created. `journalId` set. |
| **PAID**   | Payment recorded. |
| **PARTIAL**| Partially paid (if supported). |
| **CANCELLED** | From POSTED: reversal journal, then status CANCELLED. |

**Allowed actions by status:**

| Status     | Update (PATCH) | Post | Record payment | Delete/Cancel |
|------------|----------------|------|-----------------|----------------|
| DRAFT      | ✓              | ✓    | —                | ✓ (delete)    |
| POSTED     | —              | —    | ✓                | ✓ (reversal)  |
| PAID       | —              | —    | —                | —             |
| CANCELLED  | —              | —    | —                | —             |

---

## Schema summary

### Base transaction (shared)

Same as invoices: `reference`, `date`, `contactId` (vendor/payee), `totalAmount`, `taxableAmount`, `gstAmount`, `status`, `journalId`, `placeOfSupply`, `paymentDue`, `narration`, `autoPosting`, `createdBy`, `updatedBy`.

### Expense-specific

| Field             | Type     | Required | Notes |
|-------------------|----------|:--------:|-------|
| `category`        | string   |          | e.g. TRAVEL, OFFICE, UTILITIES, MARKETING. |
| `expenseType`     | string   |          | Free-form or enum (e.g. REIMBURSABLE, BILLABLE). |
| `paymentMode`     | enum     |          | `CASH` \| `ONLINE` \| `CREDIT`. Default `CREDIT`. |
| `items`           | array    |          | Line items: `{ description?, amount, category? }`. If omitted, single amount from `totalAmount`. |
| `receiptRef`      | string   |          | Receipt number or reference. |
| `attachmentUrl`   | string   |          | URL to receipt/document. |
| `isInventoryItem` | boolean  |          | Default `false`. When `true`, this expense affects inventory (e.g. purchase of stock you sell). |
| `inventoryItems`  | array    |          | Optional. See **Inventory item** below. Used only when `isInventoryItem: true`. |

### Expense item

| Field         | Type   | Required | Notes |
|---------------|--------|:--------:|-------|
| `description` | string |          | Line description. |
| `amount`      | number | ✓        | ≥ 0. |
| `category`    | string |          | Line-level category. |

### Inventory item

Used when `isInventoryItem: true` to describe stock being purchased.

| Field         | Type   | Required | Notes |
|---------------|--------|:--------:|-------|
| `productId`   | string | ✓        | Product to update (ref Product). |
| `qty`         | number | ✓        | Quantity added (positive). |
| `costPerUnit` | number | ✓        | Cost per unit; used for inventory valuation. |
| `skuCombo`    | string |          | Optional variant key or combination (e.g. `"orange-M"`). |

**Minimal create:** `reference`, `date`, `contactId`, `totalAmount`; optional `category`, `paymentMode`, `items`.  
**Inventory create:** `reference`, `date`, `contactId`, plus either `totalAmount` or `inventoryItems` with valid `qty * costPerUnit`.

---

## Validation (server-side)

- Request bodies validated with Zod: base transaction + `expenseZodCreateSchema` / `expenseZodUpdateSchema`.
- `reference` unique per organization.
- If `items` provided, server may set `totalAmount` = sum of `items[].amount` when not provided or for consistency.
- If `isInventoryItem: true` and `inventoryItems` present, server:
  - Validates each `productId` and `qty > 0`.
  - Can derive `totalAmount` from Σ(`qty * costPerUnit`) when not provided.

---

## Endpoints

### 1. Create expense

- **POST** `/api/v1/business/transactions/expenses`
- **Roles:** owner, ca, staff
- **Body:** `reference`, `date`, `contactId`, `totalAmount`; optional `category`, `expenseType`, `paymentMode`, `items`, `receiptRef`, `attachmentUrl`, `placeOfSupply`, `paymentDue`, `narration`, `isInventoryItem`, `inventoryItems`.

**Minimal (non-inventory):**

```json
{
  "reference": "EXP-000001",
  "date": "2026-03-01T00:00:00.000Z",
  "contactId": "699d...f7e",
  "totalAmount": 1500,
  "category": "TRAVEL",
  "paymentMode": "CREDIT"
}
```

**With line items:**

```json
{
  "reference": "EXP-000002",
  "date": "2026-03-01T00:00:00.000Z",
  "contactId": "699d...f7e",
  "items": [
    { "description": "Train fare", "amount": 500, "category": "TRAVEL" },
    { "description": "Meals", "amount": 300, "category": "MEALS" }
  ],
  "category": "TRAVEL",
  "paymentMode": "CASH"
}
```

**Inventory purchase (stock you sell):**

```json
{
  "reference": "EXP-INV-0001",
  "date": "2026-03-01T00:00:00.000Z",
  "contactId": "699d...f7e",
  "category": "RAW_MATERIAL",
  "paymentMode": "CREDIT",
  "isInventoryItem": true,
  "inventoryItems": [
    {
      "productId": "699d...p01",
      "qty": 10,
      "costPerUnit": 150,
      "skuCombo": "orange-M"
    }
  ]
}
```

- **Response:** 201 — created expense (DRAFT). If `items` sent, server sets `totalAmount` = sum(items.amount) when not provided.
- **Errors:** 400 validation; 409 duplicate reference.

---

### 2. Get expense

- **GET** `/api/v1/business/transactions/expenses/:id`
- **Response:** 200 — `{ expense }`.

---

### 3. List expenses

- **GET** `/api/v1/business/transactions/expenses`
- **Query:** `status`, `contactId`, `category`, `from`, `to`, `paymentDueBy`, `page`, `limit`, `sort`, `order`
- **Response:** 200 — paginated list with `pagination` meta.

**Export:**

- **GET** `/api/v1/business/transactions/expenses/export/json` — query as list; returns `expenses` array.
- **GET** `/api/v1/business/transactions/expenses/export/csv` — CSV of expenses.

---

### 4. Update expense (DRAFT only)

- **PATCH** `/api/v1/business/transactions/expenses/:id`
- **Body:** partial `expenseZodUpdateSchema`.
- **Response:** 200 — updated expense.

---

### 5. Post expense

- **POST** `/api/v1/business/transactions/expenses/:id/post`
- **Body (optional):** `{ "orchid": "EXPENSE_CREDIT" \| "EXPENSE_INVENTORY_CASH" \| "EXPENSE_INVENTORY_ONLINE" \| "EXPENSE_INVENTORY_CREDIT" }`
- **Behavior:**
  - Recompute total from items/inventory if needed.
  - If `isInventoryItem: true` and `inventoryItems` present:
    - Increase product stock (STOCK_IN) per `inventoryItems` (qty and costPerUnit).
    - Dispatch inventory-oriented event (`EXPENSE_INVENTORY_<paymentMode>`) → Dr Inventory + Dr GST input, Cr Cash/Bank/AP.
  - Else:
    - Dispatch regular expense event (`EXPENSE_<paymentMode>`) → Dr Expense + Dr GST input, Cr Cash/Bank/AP.
  - Set `status = POSTED`, store `journalId`.
- **Response:** 200 — `{ expense, results, stockAdjustFailures? }`; 400/404/500.

---

### 6. Record payment

- **POST** `/api/v1/business/transactions/expenses/:id/pay`
- **Roles:** owner, ca
- **Body:** `{ "amount", "date?", "paymentMode?", "reference?", "notes?" }`
- **Behavior:** Create payment record/journal; set expense `status` to PAID or PARTIAL.

---

### 7. Delete / cancel expense

- **DELETE** `/api/v1/business/transactions/expenses/:id`
- **Roles:** owner, ca
- **Behavior:** DRAFT → hard delete. POSTED → reversal journal, then `status = CANCELLED`.

---

### 8. Download CSV template

- **GET** `/api/v1/business/transactions/expenses/template`
- **Response:** 200 — CSV file `expenses-import-template.csv`.

**Template headers:**  
`reference,date,contactId,paymentMode,category,expenseType,items,isInventoryItem,inventoryItems,receiptRef,narration`

**items column:** JSON array of `{ "description": "", "amount": 0, "category": "" }`.  
Example: `[{"description":"Office supplies","amount":500,"category":"OFFICE"}]`

**inventoryItems column:** JSON array of `{ "productId": "", "qty": 0, "costPerUnit": 0, "skuCombo": "" }`.  
Example: `[{"productId":"699d...p01","qty":10,"costPerUnit":150,"skuCombo":"orange-M"}]`

---

### 9. Bulk import (CSV)

- **POST** `/api/v1/business/transactions/expenses/import`
- **Content-type:** `multipart/form-data`, field **`file`** (CSV).
- **CSV format:** Same headers as template. Each row = one expense (DRAFT). Server sets `totalAmount` from `items` and/or `inventoryItems` if provided.
- **Response:** 200 — `{ message, hit, created, updated, errors, imported }`.
- **Errors:** `errors[]` with `{ row, field?, reason }`; 400 if no file.

---

## Errors

| Code | Meaning |
|------|---------|
| 400 | Validation. |
| 403 | Forbidden (role / org). |
| 404 | Expense not found. |
| 409 | Duplicate `reference`. |
| 500 | Plugin or unexpected error. |

---

## Lifecycle summary

| Step   | Action   | Status before → after      |
|--------|----------|----------------------------|
| Create | POST     | — → DRAFT                  |
| Post   | POST /:id/post | DRAFT → POSTED        |
| Pay    | POST /:id/pay | POSTED/PARTIAL → PAID or PARTIAL |
| Delete | DELETE   | DRAFT → removed; POSTED → CANCELLED (reversal) |
