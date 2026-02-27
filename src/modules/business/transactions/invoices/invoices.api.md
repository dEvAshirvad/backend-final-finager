# Invoices API — Sales Invoices

This document describes the Sales Invoice API. It follows the project's API style and maps to:

- **Base transaction:** `src/modules/business/transactions/transaction.model.ts` — `transactionZod`, common fields for all transaction types
- **Invoice:** `src/modules/business/transactions/invoices/invoices.model.ts` — `invoiceZodSchema`, `invoiceZodCreateSchema`, `invoiceZodUpdateSchema`

**Base path:** `/api/v1/business/transactions/invoices`

---

## Requirements

- Authenticated user with `activeOrganizationId` in session.
- RBAC: `owner` / `ca` full access; `staff` allowed to create/read/post (no delete).
- **GST:** Server fetches **GSTIN** from the active organization (`activeOrganizationId`) for GST calculation. **placeOfSupply** is required for correct CGST/SGST vs IGST; server may default it from organization or from the contact’s `placeOfSupply` / state if not sent.

---

## Business scenarios

| Scenario | paymentMode | User intent | Server behavior |
|----------|-------------|-------------|------------------|
| **Credit sale** | `CREDIT` | Create draft, post later, collect payment later. | Create as DRAFT. Client posts when ready; payment recorded separately. |
| **POS (cash sale)** | `CASH` | Sale + payment at once (e.g. counter). | Send payment at create → server sets `autoPosting: true`, posts immediately, records payment → invoice ends **POSTED** or **PAID** in one request. |
| **Online order** | `ONLINE` | Sale + payment captured online. | Same as POS: payment at create → `autoPosting: true`, post + record payment in one request. |

**Rule:** If the client sends **payment at create time** (e.g. `payment: { amount, reference, date }`) and `paymentMode` is **CASH** or **ONLINE**, the server sets **`autoPosting: true`**, posts the invoice in the same request, and records the payment so the invoice is **POSTED** or **PAID** without a separate post/pay call.

---

## Minimal data & server-calculated fields

**Ask minimal data; server computes and fills the rest.**

**Server fetches (from `activeOrganizationId`):**

- Organization **GSTIN** — used for GST calculation and to compare state (first 2 digits) with **placeOfSupply** to decide CGST+SGST (same state) vs IGST (different state).
- Organization default **placeOfSupply** (if stored on org) — used when client does not send `placeOfSupply`.

**Server may also use:**

- **Contact** (from `contactId`): `placeOfSupply` or state code — to default invoice `placeOfSupply` when not sent.
- **Product** (from item `productId`): default `gstRate`, `name`, `hsnOrSacCode` for the line when not sent.

**Client sends (minimal create):**

| Field | Required | Notes |
|-------|:--------:|-------|
| `reference` | ✓ | Unique per org. |
| `date` | ✓ | Invoice date. |
| `contactId` | ✓ | Customer. |
| `paymentMode` | ✓ | `CASH` \| `ONLINE` \| `CREDIT`. |
| `placeOfSupply` | ✓ (for GST) | e.g. `"21-Odisha"`. If omitted, server may default from **org** or **contact**. |
| `paymentDue` |  | Optional. Payment due date (e.g. for CREDIT; can default from contact payment terms). |
| `items` | ✓ | At least one line. Per line minimal: `productId` (optional), `qty`, `rate`; optional: `gstRate`, `discount`, `name`, `hsnOrSacCode`. |

**Server calculates and fills:**

- Per line: `taxableAmount`, `gstAmount`, `lineTotal` (and `name` / `hsnOrSacCode` from product if missing).
- Invoice: `taxableAmount`, `gstAmount`, `cgst` / `sgst` / `igst` (from placeOfSupply vs org state), `totalAmount`, `discountTotal`, `totalCost` (from product costs when `productId` present).
- If **CASH/ONLINE + payment** at create: `autoPosting: true`, then post and record payment so `status` = POSTED or PAID.

---

## Invoice lifecycle

Invoices move through a small state machine. Only certain transitions are allowed.

```
                    ┌──────────────┐
                    │   DRAFT      │
                    │  (created)   │
                    └──────┬───────┘
                           │ POST
                           ▼
                    ┌──────────────┐     Pay (full)     ┌──────────────┐
                    │   POSTED     │ ──────────────────►│    PAID       │
                    │ (journal +   │                    └──────────────┘
                    │  stock out)  │     Pay (partial)  ┌──────────────┐
                    └──────┬───────┘ ──────────────────►│   PARTIAL     │
                           │                            └──────────────┘
                           │ CANCEL (credit note)
                           ▼
                    ┌──────────────┐
                    │  CANCELLED   │
                    └──────────────┘

  From DRAFT: CANCEL → soft-delete or hard delete (no journal).
```

| Status      | Meaning |
|------------|---------|
| **DRAFT**  | Invoice created; editable. No journal, no inventory change. |
| **POSTED** | Finalized: totals computed, journal entry created, inventory reduced (for lines with `productId`). `journalId` set. |
| **PAID**   | Fully paid (sum of payments ≥ totalAmount). |
| **PARTIAL**| Partially paid. |
| **CANCELLED** | From DRAFT: invoice removed or deactivated. From POSTED: reversal/credit note (journal) and then status set to CANCELLED. |

**Allowed actions by status:**

| Status     | Update (PATCH) | Post | Record payment | Cancel |
|------------|----------------|------|-----------------|--------|
| DRAFT      | ✓ (items, totals) | ✓   | —                | ✓ (delete/soft-delete) |
| POSTED     | —              | —    | ✓                | ✓ (reversal) |
| PAID       | —              | —    | —                | —     |
| PARTIAL    | —              | —    | ✓                | —     |
| CANCELLED  | —              | —    | —                | —     |

---

## Schema summary

### Base transaction (shared)

From `transaction.model.ts` — all transaction types (including Invoice) have:

| Field           | Type     | Required | Notes |
|-----------------|----------|:--------:|-------|
| `type`         | string   | ✓        | Discriminator; for invoices always `"INVOICE"`. |
| `reference`    | string   | ✓        | Unique per organization (compound index). |
| `date`         | Date     | ✓        | Invoice date. |
| `contactId`   | string   | ✓        | Customer (contact `_id`). |
| `totalAmount`  | number   | ✓        | ≥ 0. Grand total (taxable + GST). |
| `taxableAmount`| number   |          | ≥ 0. Sum of line taxable amounts. |
| `gstAmount`    | number   |          | ≥ 0. Total GST. |
| `cgst` / `sgst` / `igst` | number |   | Split by tax type when applicable. |
| `status`       | enum     |          | `DRAFT` \| `POSTED` \| `PAID` \| `PARTIAL` \| `CANCELLED`. Default `DRAFT`. |
| `journalId`    | string   |          | Set after successful post (journal entry id). |
| `createdBy` / `updatedBy` | string | | User refs. |
| `placeOfSupply`| string   | ✓ (for GST) | e.g. `"21-Odisha"`. Required for correct CGST/SGST/IGST. Defaulted from org or contact if not sent. |
| `autoPosting`  | boolean  |          | Default `false`. Set `true` when paymentMode is CASH/ONLINE and payment is captured at create (post + pay in one request). |
| `narration`    | string   |          | Optional note (Zod; may not be on Mongoose schema yet). |
| `paymentDue`   | Date     |          | Payment due date. Used in list/filters and on invoice for credit terms. |

### Invoice-specific

From `invoices.model.ts`:

| Field          | Type     | Required | Notes |
|----------------|----------|:--------:|-------|
| `dueDate`      | Date     |          | Payment due date (invoice-specific). Prefer **base `paymentDue`** in APIs for consistency across transaction types. |
| `paymentTerms` | string   |          | Free text. |
| `paymentMode`  | enum     |          | `CASH` \| `ONLINE` \| `CREDIT`. Default `CREDIT`. |
| `items`        | array    | ✓        | Line items; see **Invoice item** below. |
| `discountTotal`| number   |          | ≥ 0. Total discount. |
| `totalCost`    | number   |          | ≥ 0. Sum of (qty × product cost); used for COGS. |

### Invoice item

| Field          | Type   | Required | Notes |
|----------------|--------|:--------:|-------|
| `productId`   | string |          | Optional; product ref for stock and COGS. |
| `qty`         | number | ✓        | ≥ 0. |
| `discount`     | number |          | ≥ 0. Default 0. |
| `rate`        | number | ✓        | ≥ 0. Unit price. |
| `name`        | string |          | Line description. |
| `hsnOrSacCode`| string |          | HSN/SAC code. |
| `taxableAmount`| number| ✓        | ≥ 0. Typically qty×rate − discount (server may compute/validate). |
| `gstAmount`   | number | ✓        | ≥ 0. GST on this line. |
| `gstRate`     | number | ✓        | 0–28. |
| `lineTotal`   | number | ✓        | ≥ 0. taxableAmount + gstAmount. |

---

## Validation (server-side)

- Request bodies validated with Zod: base transaction fields + `invoiceZodCreateSchema` / `invoiceZodUpdateSchema`.
- `reference` unique per organization (compound index on `organizationId` + `reference`).
- `items` non-empty on create; numeric fields ≥ 0; `gstRate` in allowed range (0–28).
- **placeOfSupply:** Required for correct GST. If not sent, server may default from organization or contact (when available).

---

## Endpoints

### 1. Create invoice

- **POST** `/api/v1/business/transactions/invoices`
- **Roles:** owner, ca, staff
- **Body:** Conforms to `invoiceZodCreateSchema`. Send **minimal** fields; server fetches org GSTIN (from `activeOrganizationId`), defaults `placeOfSupply` from org/contact if omitted, and **computes** line totals, GST (cgst/sgst/igst), and invoice totals.

**Credit sale (draft, post later) — minimal body:**

```json
{
  "reference": "INV-000123",
  "date": "2026-03-01T00:00:00.000Z",
  "contactId": "699d...f7e",
  "paymentMode": "CREDIT",
  "placeOfSupply": "21-Odisha",
  "paymentDue": "2026-03-31T00:00:00.000Z",
  "items": [
    { "productId": "abc...", "qty": 2, "rate": 350 }
  ]
}
```

Server fills: line `taxableAmount`, `gstAmount`, `lineTotal`, `name`/`hsnOrSacCode`/`gstRate` from product if missing; invoice `taxableAmount`, `gstAmount`, `totalAmount`, `totalCost`. Response: invoice in **DRAFT**.

**POS / Online order (pay at create) — minimal body:**

```json
{
  "reference": "INV-000124",
  "date": "2026-03-01T00:00:00.000Z",
  "contactId": "699d...f7e",
  "paymentMode": "CASH",
  "placeOfSupply": "21-Odisha",
  "items": [
    { "productId": "abc...", "qty": 1, "rate": 500 }
  ],
  "payment": {
    "amount": 560,
    "date": "2026-03-01T00:00:00.000Z",
    "reference": "POS-001",
    "notes": "Cash"
  }
}
```

When `paymentMode` is **CASH** or **ONLINE** and **`payment`** is present, server sets **`autoPosting: true`**, posts the invoice (journal + stock out), and records the payment in the same request. Response: invoice in **POSTED** or **PAID** with `journalId` set.

- **Response:** 201 — created invoice (DRAFT, or POSTED/PAID when payment at create).
- **Errors:** 400 validation; 409 duplicate reference.

---

### 2. Get invoice

- **GET** `/api/v1/business/transactions/invoices/:id`
- **Roles:** owner, ca, staff
- **Response:** 200 — `{ invoice }` with totals and `journalId` if posted.

---

### 3. List invoices

- **GET** `/api/v1/business/transactions/invoices`
- **Query:** `status`, `contactId`, `from`, `to`, `paymentDueBy` (filter by payment due by date), `page`, `limit`, `sort`, `order`
- **Response:** 200 — paginated list with `pagination` meta. Each invoice includes `paymentDue` when set.

**Export:**

- **GET** `/api/v1/business/transactions/invoices/export/json` — same query as list; returns `invoices` array and `pagination` (up to 10000).
- **GET** `/api/v1/business/transactions/invoices/export/csv` — returns CSV of invoices (reference, date, contactId, paymentMode, placeOfSupply, paymentDue, status, totalAmount, taxableAmount, gstAmount).

---

### 4. Update invoice (DRAFT only)

- **PATCH** `/api/v1/business/transactions/invoices/:id`
- **Roles:** owner, ca, staff
- **Body:** partial `invoiceZodUpdateSchema`. Items editable only when `status === 'DRAFT'`.
- **Response:** 200 — updated invoice (totals recalculated if items changed).

---

### 5. Post invoice

- **POST** `/api/v1/business/transactions/invoices/:id/post`
- **Roles:** owner, ca, staff
- **Body (optional):** `{ "orchid": "INVOICE_CREDIT" }`

**Behavior:**

1. Validate invoice (items present).
2. Recompute line and invoice totals (`taxableAmount`, `gstAmount`, `lineTotal`, `totalAmount`, `totalCost`).
3. For lines with `productId`, call stock adjust (e.g. `STOCK_OUT`) to reduce inventory.
4. Resolve orchid: body `orchid` or from `paymentMode` → `INVOICE_CASH` | `INVOICE_ONLINE` | `INVOICE_CREDIT`.
5. Dispatch event; on journal success set `status = POSTED` and store `journalId`.
6. Return updated invoice, plugin results, and any stock-adjust failures.

- **Response:** 200 on success; 400 validation; 409 conflict; 500 on plugin/downstream error (response may still include plugin results).

---

### 6. Record payment

- **POST** `/api/v1/business/transactions/invoices/:id/pay`
- **Roles:** owner, ca
- **Body (example):**

```json
{
  "amount": 500,
  "date": "2026-03-05T00:00:00.000Z",
  "paymentMode": "ONLINE",
  "reference": "PAY-00012",
  "notes": "Bank transfer"
}
```

- **Behavior:** Create payment record/journal; set invoice `status` to `PAID` (full) or `PARTIAL`.

---

### 7. Cancel / delete invoice

- **DELETE** `/api/v1/business/transactions/invoices/:id`
- **Roles:** owner, ca
- **Behavior:**
  - **DRAFT:** soft-delete or hard delete (no journal).
  - **POSTED:** create credit note/reversal journal, then set `status = CANCELLED`.

---

### 8. Download CSV template

- **GET** `/api/v1/business/transactions/invoices/template`
- **Roles:** owner, ca, staff
- **Response:** `200` — CSV file download (`Content-Type: text/csv`, `Content-Disposition: attachment; filename="invoices-import-template.csv"`).

**Template headers (column order):**

`reference,date,contactId,paymentMode,placeOfSupply,paymentDue,items,dueDate,paymentTerms,narration`

**Items column format:**

- **JSON array** of line items. Each item: `{ "productId": "...", "qty": 2, "rate": 350, "gstRate": 12 }`. Optional per line: `discount`, `name`, `hsnOrSacCode`.
- Example (single line): `[{"productId":"abc...","qty":2,"rate":350,"gstRate":12}]`
- Multiple lines: `[{"productId":"id1","qty":1,"rate":100,"gstRate":12},{"productId":"id2","qty":3,"rate":50,"gstRate":5}]`

**Other columns:** `reference` (required), `date` (ISO), `contactId` (required), `paymentMode` (CASH|ONLINE|CREDIT), `placeOfSupply` (e.g. 21-Odisha), `paymentDue` (ISO, optional), `dueDate`, `paymentTerms`, `narration`.

---

### 9. Bulk import (CSV)

- **POST** `/api/v1/business/transactions/invoices/import`
- **Content-type:** `multipart/form-data`, field **`file`** (CSV, max 5MB)
- **Roles:** owner, ca, staff

**CSV format:** Same headers as the template (§8). Each row = one invoice (DRAFT). Server computes line and invoice totals from `items` (and product data when `productId` present).

**Matching:** Existing invoice is matched by **reference** (same organization). If reference exists, row is skipped or updated per implementation (recommended: skip and report in `errors`).

**On create:** New invoice is created as **DRAFT** with computed `taxableAmount`, `gstAmount`, `totalAmount`, and optional `totalCost`. No post or payment in import.

**Response:** `200 OK`

```json
{
  "message": "Imported 10",
  "hit": 10,
  "created": 10,
  "updated": 0,
  "errors": [],
  "imported": [ /* invoice objects */ ]
}
```

**Errors:** `errors[]` may contain `{ row, field?, reason }` (row 1-based; row 1 = headers). `400` — no file or invalid CSV.

---

## Errors

| Code | Meaning |
|------|---------|
| 400 | Validation (Zod). |
| 403 | Forbidden (role / org). |
| 404 | Invoice not found. |
| 409 | Duplicate `reference` in organization. |
| 500 | Plugin or unexpected error. |

---

## Lifecycle summary

| Step   | Action   | Status before → after      |
|--------|----------|----------------------------|
| Create | POST     | — → DRAFT (or POSTED/PAID when CASH/ONLINE + `payment` at create) |
| Finalize | POST /:id/post | DRAFT → POSTED        |
| Pay    | POST /:id/pay | POSTED/PARTIAL → PAID or PARTIAL |
| Cancel | DELETE   | DRAFT → removed; POSTED → CANCELLED (with reversal) |

**One-step flow (POS / Online):** Create with `paymentMode: CASH` or `ONLINE` and body `payment: { amount, reference, date, ... }` → server sets `autoPosting: true`, posts, and records payment → response invoice is **POSTED** or **PAID** with `journalId` set.
