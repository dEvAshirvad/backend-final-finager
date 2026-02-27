# Products API

This document describes the Products (inventory) API for Finager — variants, SKUs, inventory valuation, GST/HSN, bulk import/export, and search.

**Base path:** `/api/v1/business/products`

**Requirements:**

- Authenticated user (Better Auth session)
- Member of the active organization (`activeOrganizationId` in session)
- Role: `req.user.role` (CA/Owner vs Staff)

**Scoping:** All data is scoped by the session’s `activeOrganizationId`.

---

## Product schema (summary)

- **organizationId** (ObjectId) — set by server
- **name** (string) — required
- **variants** (array) — `[{ variant, qty, skuCode?, costPrice?, sellingPrice? }]`. Each `variant` is a combo string (e.g. `"orange-M"`). Backend generates `skuCode` if missing.
- **sku** (array) — `[{ variantCombo, skuCode, qty, costPrice? }]`. Populated from variants when `isInventoryItem` is true.
- **hsnOrSacCode** (string) — HSN/SAC
- **isInventoryItem** (boolean) — default `true`
- **productType** — `RAW | WIP | FINISHED | SERVICE` (default `FINISHED`)
- **parentProductId** (ObjectId, optional) — for WIP → finished
- **bom** (array) — `[{ componentProductId, qty }]`
- **category**, **unit** (e.g. `pcs`, `kg`), **gstRate** (0–28), **sellingPrice**, **costPrice**, **lowStockThreshold**, **isActive**, **tags** (string[]), **notes**
- **createdBy**, **updatedBy**, **createdAt**, **updatedAt**

**Virtuals (read-only):** `currentQty`, `totalCostValue`, `avgCost`, `totalStock` (from variants when `isInventoryItem` is true).

---

## Access control

| Role       | Permissions                          |
| ---------- | ------------------------------------ |
| CA / Owner | Full CRUD, bulk import/export, delete |
| Staff      | Read, create, update (no delete)      |

---

## Endpoints

### 1. Create product

- **Method:** `POST`
- **URL:** `/`
- **Roles:** CA/Owner, Staff

**Request body**

Minimal (name only):

```json
{
  "name": "Plain Shirt"
}
```

With variants (array of `{ variant, qty }`; optional `skuCode`, `costPrice`, `sellingPrice` per variant):

```json
{
  "name": "Plain Shirt",
  "variants": [
    { "variant": "orange-M", "qty": 3 },
    { "variant": "orange-L", "qty": 7 }
  ],
  "costPrice": 200,
  "sellingPrice": 350,
  "hsnOrSacCode": "6109",
  "gstRate": 12,
  "isInventoryItem": true,
  "productType": "FINISHED",
  "tags": ["mens", "summer"]
}
```

- **variants:** Array of `{ variant: string, qty: number }`. Optional per item: `skuCode`, `costPrice`, `sellingPrice`. If `skuCode` is omitted, the backend generates it (e.g. `PLAIN-SHIRT-orange-M-37310E51`).
- **costPrice** / **sellingPrice:** Product-level defaults; variant-level overrides when provided.
- **tags:** Array of strings.

**Response:** `201 Created`

```json
{
  "success": true,
  "status": 201,
  "data": {
    "product": {
      "organizationId": "...",
      "name": "Plain Shirt",
      "variants": [
        {
          "variant": "orange-M",
          "qty": 3,
          "skuCode": "PLAIN-SHIRT-orange-M-37310E51",
          "costPrice": 200,
          "sellingPrice": 350,
          "_id": "..."
        },
        {
          "variant": "orange-L",
          "qty": 7,
          "skuCode": "PLAIN-SHIRT-orange-L-1A40D614",
          "costPrice": 200,
          "sellingPrice": 350,
          "_id": "..."
        }
      ],
      "hsnOrSacCode": "6109",
      "isInventoryItem": true,
      "productType": "FINISHED",
      "unit": "pcs",
      "gstRate": 12,
      "sellingPrice": 350,
      "costPrice": 200,
      "lowStockThreshold": 10,
      "isActive": true,
      "tags": ["mens", "summer"],
      "_id": "...",
      "sku": [],
      "bom": [],
      "createdAt": "...",
      "updatedAt": "...",
      "__v": 0
    }
  }
}
```

Virtuals `currentQty`, `totalCostValue`, `avgCost`, `totalStock` are included when the response is serialized with virtuals. `sku` may be empty in the create response; variants hold the canonical data.

**Errors:** `400` — validation (e.g. missing name, invalid gstRate). `403` — not a member of org or insufficient role.

---

### 2. List products (paginated + search)

- **Method:** `GET`
- **URL:** `/`
- **Query:** `search`, `category`, `tags` (comma-separated), `isActive` (`true`|`false`), `page`, `limit`, `sort`, `order`

Search is tokenized over `name` and variant/`sku.variantCombo`. Response includes products and pagination.

**Response:** `200 OK`

```json
{
  "success": true,
  "status": 200,
  "data": [ /* product objects */ ],
  "pagination": { "page": 1, "limit": 20, "total": 42, "totalPages": 3, "hasNext": true, "hasPrev": false }
}
```

---

### 3. Get product by ID

- **Method:** `GET`
- **URL:** `/:id`

**Response:** `200 OK` — `{ "data": { "product": { ... } } }`

**Errors:** `404` — not found or not in organization.

---

### 4. Update product (partial)

- **Method:** `PATCH`
- **URL:** `/:id`
- **Roles:** CA/Owner, Staff

**Behavior:** Partial updates. The handler **does not** allow updating `variants` via PATCH (variants are stripped from the body). Use stock-adjust or import to change quantities. Other fields (name, costPrice, sellingPrice, hsnOrSacCode, category, tags, etc.) can be updated.

**Request body (example):**

```json
{
  "sellingPrice": 375,
  "category": "apparel"
}
```

**Response:** `200 OK` — updated product.

**Errors:** `404` — not found.

---

### 5. Stock adjust

- **Method:** `POST`
- **URL:** `/:id/stock-adjust`
- **Body:** `{ "type": "STOCK_IN" | "STOCK_OUT" | "STOCK_ADJUSTED", "qty": number, "variant"?: string, "reason"?: string, "costPrice"?: number, "orchid"?: string }`

Adjusts quantity for the product (or a specific variant when `variant` is provided).

---

### 6. Delete product

- **Method:** `DELETE`
- **URL:** `/:id`
- **Roles:** CA/Owner only

**Behavior:** Soft delete (sets `isActive: false`), or hard delete per business rules.

**Response:** `200 OK` — `{ "data": { "message": "Product deleted" } }`

---

### 7. Bulk export

- **GET** `/export/json` — Query: `category`, `isActive`. Returns array of product objects (variants, sku, etc.).
- **GET** `/export/csv` — Same query. Returns CSV (template headers and data; variants encoded for re-import).

---

### 8. Download import template

- **Method:** `GET`
- **URL:** `/template`

Returns a CSV with headers and one example row. Fields that contain comma, quote, or newline are quoted and escaped (RFC 4180).

**Headers:**  
`name,variants,hsnOrSacCode,isInventoryItem,productType,bom,gstRate,category,unit,costPrice,sellingPrice,lowStockThreshold,tags,notes,isActive`

**Variants column format (user-friendly, no JSON):**

- Each variant is: `part1-%-part2-%-...-%-qty` (parts and qty separated by `-%-`).
- Multiple variants are comma-separated.

**Example:**  
`orange-%-M-%-3,orange-%-L-%-7` means variant `orange-M` with qty 3 and variant `orange-L` with qty 7.

`parentProductId` is not included in the template.

---

### 9. Bulk import (CSV)

- **Method:** `POST`
- **URL:** `/import`
- **Content-type:** `multipart/form-data`, field **`file`** (CSV, max 5MB)

**CSV format:** Use the same headers as the template (§8) so the downloaded template or an export can be re-imported.

**Variants column:**

- **Preferred:** Comma-separated entries, each `part1-%-part2-%-...-%-qty`.  
  Example: `orange-%-M-%-3,orange-%-L-%-7`
- **Fallback:** If the cell does not contain `-%-`, the backend tries to parse it as JSON (object for combo generation or array of `{ variant, qty }`).

**Other columns:** `name` (required), `hsnOrSacCode`, `isInventoryItem` (true/false), `productType`, `bom` (JSON array), `gstRate`, `category`, `unit`, `costPrice`, `sellingPrice`, `lowStockThreshold`, `tags` (comma-separated), `notes`, `isActive`.

**Matching:** Existing product is matched by **name** (case-insensitive; regex specials escaped).

**On create:** New product is created with variants and generated SKUs.  
**On update:** Variants/sku are rebuilt from the CSV variants; existing `qty` and `skuCode` are preserved where `variant` matches.

**Response:** `200 OK`

```json
{
  "message": "Imported 15",
  "hit": 15,
  "miss": 0,
  "created": 10,
  "updated": 5,
  "errors": [],
  "imported": [ /* product objects */ ]
}
```

**Errors:** `errors[]` contains `{ row, field?, reason }` (row 1-based; row 1 = headers). `400` — no file or invalid CSV.

---

## Validation (Zod / Mongoose)

- **name** — required on create
- **gstRate** — 0–28
- **variants[].qty** — ≥ 0
- **sku[].skuCode** — required when sku is present

---

## Examples

**Create with variants:**

```http
POST /api/v1/business/products
Content-Type: application/json

{
  "name": "Plain Shirt",
  "variants": [
    { "variant": "orange-M", "qty": 3 },
    { "variant": "orange-L", "qty": 7 }
  ],
  "costPrice": 200,
  "sellingPrice": 350,
  "hsnOrSacCode": "6109",
  "gstRate": 12,
  "tags": ["mens", "summer"]
}
```

**Import template variants column:**

```text
orange-%-M-%-3,orange-%-L-%-7
```

**List with search:**

```http
GET /api/v1/business/products?search=plain%20shirt&page=1&limit=10
```

---

## Implementation notes

- Routes: static paths (`/export/json`, `/export/csv`, `/template`, `/import`) are registered before `/:id`.
- Create/update set `createdBy`/`updatedBy` from session.
- Update handler removes `variants` from the PATCH body; stock changes use stock-adjust or import.
- CSV parsing supports quoted fields and `""` as escaped quote (RFC 4180).
