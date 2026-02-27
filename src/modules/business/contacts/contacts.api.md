# Contacts API (Customers & Vendors)

This document describes the Contacts API for unified customer/vendor management, GST/compliance fields, and bulk import/export.

Base path for all endpoints:

- **`/api/v1/business/contacts`**

All endpoints require:

- User to be **authenticated** (Better Auth session)
- User to be a **member** of the active organization
- **`activeOrganizationId`** set in session (organization scoping)

Contacts are scoped to the session's active organization. Creation is minimal — **at least one of** `name`, `email`, or `phone` required. If `name` is missing, it is auto-filled: `email.split('@')[0]` → `"Contact " + phone.slice(-4)` → `"New Contact"`. Full GST/AR/AP fields are optional. Fetch responses include **warnings** for missing compliance fields.

### Access Control (RBAC)

| Role           | Permissions                           |
| -------------- | ------------------------------------- |
| **CA / Owner** | Full CRUD, bulk import/export, delete |
| **Staff**      | Read, create, update. No delete.      |

---

## Contact Schema & Field Descriptions

| Field                | Type                             | Required       | Description                                                                                                                                                                                                                                                                                                                                             |
| -------------------- | -------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `organizationId`     | ObjectId                         | ✓ (server-set) | Organization this contact belongs to. Not sent in create/update.                                                                                                                                                                                                                                                                                        |
| **type**             | `CUSTOMER` \| `VENDOR` \| `BOTH` | ✓              | **Accounting value:** Determines whether this party appears in AR (customer) or AP (vendor) aging, GST reports (GSTR-1 vs GSTR-2B). **Helps CA:** Quickly filter GSTR-1 (outward) vs inward supplies. **Helps Business:** One list for all parties — no duplicate entries.                                                                              |
| **name**             | string                           |                | **Accounting value:** Primary display name in invoices, bills, ledgers, reports. Auto-filled from email/phone if not provided (e.g. `priya@example.com` → `"priya"`).                                                                                                                                                                                   |
| **legalName**        | string                           |                | **Accounting value:** Used in GST invoices (legal name mandatory if different from trade name). **Helps CA:** Ensures compliance with GST invoice rules.                                                                                                                                                                                                |
| **gstin**            | string                           |                | GSTIN format: `22AAAAA0000A1Z5` (2-digit state + 10-char PAN + 2-char entity + 1 checksum). **Accounting value:** Critical for place-of-supply logic (CGST/SGST vs IGST), ITC eligibility check in reconciliation. **Helps CA:** Auto-determines GST breakup, flags unregistered vendors for RCM. **Helps Business:** One-click GST invoice generation. |
| **pan**              | string                           |                | PAN format: `AAAAA0000A` (5 letters + 4 digits + 1 letter). **Accounting value:** Required for TDS deduction (if applicable), cross-verification with GSTIN. **Helps CA:** TDS compliance and matching in Form 26AS.                                                                                                                                    |
| **email**            | string                           | ✓\*            | Lowercase. **Accounting value:** Used for sending invoice PDFs, payment reminders, WhatsApp notifications. **Helps Business:** Faster collections. \*At least one of `email` or `phone` required.                                                                                                                                                       |
| **phone**            | string                           | ✓\*            | **Accounting value:** Same as email — invoices, reminders, notifications. \*At least one of `email` or `phone` required.                                                                                                                                                                                                                                |
| **address**          | string                           |                | Street address.                                                                                                                                                                                                                                                                                                                                         |
| **city**             | string                           |                | City.                                                                                                                                                                                                                                                                                                                                                   |
| **state**            | string                           |                | State name.                                                                                                                                                                                                                                                                                                                                             |
| **stateCode**        | string                           |                | GST state code, e.g. `"21"` for Odisha.                                                                                                                                                                                                                                                                                                                 |
| **pincode**          | string                           |                | Postal code.                                                                                                                                                                                                                                                                                                                                            |
| **placeOfSupply**    | string                           |                | E.g. `"21-Odisha"`. **Accounting value:** Determines intra-state (CGST+SGST) vs inter-state (IGST). **Helps both:** Automatic correct GST calculation on invoices/bills.                                                                                                                                                                                |
| **openingBalance**   | number                           |                | Default `0`. Opening AR/AP balance.                                                                                                                                                                                                                                                                                                                     |
| **currentBalance**   | number                           |                | Default `0`. **Accounting value:** Tracks AR/AP running balance in real time. **Helps CA:** Instant aged receivables/payables report. **Helps Business:** Knows who owes how much.                                                                                                                                                                      |
| **creditLimit**      | number                           |                | **Accounting value:** Used in AR/AP aging, cash flow forecasting. **Helps Business:** Controls credit risk.                                                                                                                                                                                                                                             |
| **paymentTermsDays** | number                           |                | Default `30`. **Accounting value:** Used in AR/AP aging. **Helps Business:** Controls credit risk.                                                                                                                                                                                                                                                      |
| **tags**             | string[]                         |                | Optional tags for filtering.                                                                                                                                                                                                                                                                                                                            |
| **notes**            | string                           |                | Internal notes.                                                                                                                                                                                                                                                                                                                                         |
| **isActive**         | boolean                          |                | Default `true`. Soft-disable without deleting.                                                                                                                                                                                                                                                                                                          |

### Virtual (read-only)

| Field        | Description                                                          |
| ------------ | -------------------------------------------------------------------- |
| **arApType** | `"Receivable"` if CUSTOMER, `"Payable"` if VENDOR, `"Both"` if BOTH. |

### Warnings (response-only)

When fetching a contact (get by ID, create, update), the response may include `warnings`:

- **Vendor:** Missing GSTIN, PAN, place of supply, legal name.
- **Customer:** Missing GSTIN, place of supply, address.

---

## 1. Basic CRUD

### 1.1 Create Contact

- **Method:** `POST`
- **URL:** `/api/v1/business/contacts`
- **Behavior:** Minimal creation — at least one of `name`, `email`, or `phone` required. If `name` missing → auto-filled from email (`email.split('@')[0]`) or phone (`"Contact " + last 4 digits`) or `"New Contact"`. Returns contact + warnings (if any).

**Body:**

```json
{
  "type": "CUSTOMER",
  "name": "Acme Pvt Ltd",
  "email": "billing@acme.com",
  "phone": "+91 9876543210",
  "legalName": "Acme Private Limited",
  "gstin": "22AAAAA0000A1Z5",
  "pan": "AAAAA0000A",
  "address": "123 Main St",
  "city": "Bhubaneswar",
  "state": "Odisha",
  "stateCode": "21",
  "pincode": "751001",
  "placeOfSupply": "21-Odisha",
  "creditLimit": 100000,
  "paymentTermsDays": 30,
  "tags": ["vip"],
  "notes": "Preferred customer",
  "isActive": true
}
```

**Minimal body (only required fields):**

```json
{
  "type": "CUSTOMER",
  "email": "priya@example.com"
}
```

→ `name` auto-filled as `"priya"`.

**Expected response (201 Created):**

```json
{
  "success": true,
  "status": 201,
  "timestamp": "February 13th, 2026 6:30 PM",
  "cache": false,
  "data": {
    "contact": {
      "_id": "698f1773b658409bbfc1be53",
      "organizationId": "698c7aa4d92e03597be8d492",
      "type": "CUSTOMER",
      "name": "Acme Pvt Ltd",
      "email": "billing@acme.com",
      "phone": "+91 9876543210",
      "openingBalance": 0,
      "currentBalance": 0,
      "paymentTermsDays": 30,
      "isActive": true,
      "createdAt": "2026-02-13T12:30:00.000Z",
      "updatedAt": "2026-02-13T12:30:00.000Z",
      "arApType": "Receivable"
    },
    "warnings": {
      "missingGstin": true,
      "missingPan": false,
      "missingPlaceOfSupply": true,
      "missingLegalName": false,
      "missingAddress": false,
      "messages": [
        "Customer: GSTIN missing - may need for B2B invoices, GSTR-1",
        "Customer: Place of supply missing - affects invoice GST calculation"
      ]
    }
  }
}
```

**Error responses:**

- `400 Bad Request` — validation failed (e.g. neither email nor phone provided, invalid GSTIN/PAN).
- `403 Forbidden` — not a member of the active organization.

---

### 1.2 List Contacts (Paginated)

- **Method:** `GET`
- **URL:** `/api/v1/business/contacts`

**Query params:**

| Param      | Type   | Description                             |
| ---------- | ------ | --------------------------------------- |
| `type`     | string | `CUSTOMER`, `VENDOR`, or `BOTH`         |
| `name`     | string | Filter by name (case-insensitive regex) |
| `isActive` | string | `true` or `false`                       |
| `page`     | string | Page number (default `1`)               |
| `limit`    | string | Items per page (default `10`)           |
| `sort`     | string | Sort field (e.g. `name`, `createdAt`)   |
| `order`    | string | `asc` or `desc`                         |

**Example:**

```http
GET /api/v1/business/contacts?type=VENDOR&page=1&limit=20
```

**Expected response (200 OK):**

```json
{
  "success": true,
  "status": 200,
  "timestamp": "February 13th, 2026 6:32 PM",
  "cache": false,
  "data": [
    {
      "_id": "698f1773b658409bbfc1be53",
      "organizationId": "698c7aa4d92e03597be8d492",
      "type": "VENDOR",
      "name": "XYZ Suppliers",
      "email": "vendor@xyz.com",
      "gstin": "22AAAAA0000A1Z5",
      "currentBalance": 15000,
      "arApType": "Payable"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 45,
    "totalPages": 3,
    "hasNext": true,
    "hasPrev": false
  },
  "_links": {
    "self": "/api/v1/business/contacts?page=1&limit=20",
    "next": "/api/v1/business/contacts?page=2&limit=20"
  }
}
```

---

### 1.3 Get Contact by ID

- **Method:** `GET`
- **URL:** `/api/v1/business/contacts/:id`
- **Behavior:** Returns contact + compliance warnings.

**Expected response (200 OK):**

```json
{
  "success": true,
  "status": 200,
  "data": {
    "contact": {
      "_id": "698f1773b658409bbfc1be53",
      "organizationId": "698c7aa4d92e03597be8d492",
      "type": "VENDOR",
      "name": "XYZ Suppliers",
      "legalName": "XYZ Suppliers Pvt Ltd",
      "gstin": "22AAAAA0000A1Z5",
      "pan": "AAAAA0000A",
      "email": "vendor@xyz.com",
      "phone": "+91 9876543210",
      "address": "456 Vendor Lane",
      "city": "Cuttack",
      "state": "Odisha",
      "stateCode": "21",
      "pincode": "753001",
      "placeOfSupply": "21-Odisha",
      "openingBalance": 0,
      "currentBalance": 15000,
      "creditLimit": 50000,
      "paymentTermsDays": 30,
      "tags": [],
      "notes": "",
      "isActive": true,
      "createdAt": "2026-02-13T12:00:00.000Z",
      "updatedAt": "2026-02-13T12:00:00.000Z",
      "arApType": "Payable"
    },
    "warnings": {
      "missingGstin": false,
      "missingPan": false,
      "missingPlaceOfSupply": false,
      "missingLegalName": false,
      "missingAddress": false,
      "messages": []
    }
  }
}
```

- `404 Not Found` — contact not found or not in the organization.

---

### 1.4 Update Contact

- **Method:** `PUT` or `PATCH`
- **URL:** `/api/v1/business/contacts/:id`
- **Behavior:** `PUT` = full replace; `PATCH` = partial update. Returns updated contact + warnings.

**Body (partial update example):**

```json
{
  "gstin": "22AAAAA0000A1Z5",
  "placeOfSupply": "21-Odisha",
  "legalName": "Acme Private Limited"
}
```

**Expected response (200 OK):** Same shape as create — `{ contact, warnings }`.

- `404 Not Found` — contact not found.
- `400 Bad Request` — validation error.

---

### 1.5 Delete Contact

- **Method:** `DELETE`
- **URL:** `/api/v1/business/contacts/:id`

**Expected response (200 OK):**

```json
{
  "success": true,
  "status": 200,
  "data": {
    "message": "Contact deleted"
  }
}
```

- `404 Not Found` — contact not found.

---

## 2. Bulk Export

### 2.1 Export as JSON

- **Method:** `GET`
- **URL:** `/api/v1/business/contacts/export/json`
- **Query:** `type` (optional) — `CUSTOMER`, `VENDOR`, or `BOTH`

**Example:**

```http
GET /api/v1/business/contacts/export/json?type=VENDOR
```

**Expected response (200 OK):**

```json
{
  "success": true,
  "status": 200,
  "data": {
    "contacts": [
      {
        "name": "XYZ Suppliers",
        "type": "VENDOR",
        "legalName": "XYZ Suppliers Pvt Ltd",
        "gstin": "22AAAAA0000A1Z5",
        "pan": "AAAAA0000A",
        "email": "vendor@xyz.com",
        "phone": "+919876543210",
        "address": "456 Vendor Lane",
        "city": "Cuttack",
        "state": "Odisha",
        "stateCode": "21",
        "pincode": "753001",
        "placeOfSupply": "21-Odisha",
        "creditLimit": 50000,
        "paymentTermsDays": 30,
        "tags": [],
        "notes": "",
        "isActive": true,
        "arApType": "Payable"
      }
    ],
    "count": 12
  }
}
```

---

### 2.2 Export as CSV (Excel-compatible)

- **Method:** `GET`
- **URL:** `/api/v1/business/contacts/export/csv`
- **Query:** `type` (optional)
- **Response:** `Content-Type: text/csv`, file download

**Example:**

```http
GET /api/v1/business/contacts/export/csv?type=CUSTOMER
```

---

### 2.3 Download Import Template

- **Method:** `GET`
- **URL:** `/api/v1/business/contacts/template`
- **Response:** CSV file with headers + example row. Use as template for bulk import.

**Example:**

```http
GET /api/v1/business/contacts/template
```

---

## 3. Bulk Import

### 3.1 Import Contacts (JSON)

- **Method:** `POST`
- **URL:** `/api/v1/business/contacts/import`
- **Behavior:** Accepts array of contact objects. Each must have at least one of `email` or `phone`. Returns hit/miss stats and error details for failed rows.

**Body:**

```json
{
  "contacts": [
    {
      "type": "CUSTOMER",
      "name": "New Customer A",
      "email": "a@example.com",
      "phone": "+919876543210"
    },
    {
      "type": "VENDOR",
      "name": "New Vendor B",
      "email": "b@example.com",
      "gstin": "22AAAAA0000A1Z5",
      "placeOfSupply": "21-Odisha"
    }
  ]
}
```

**Expected response (200 OK):**

```json
{
  "success": true,
  "status": 200,
  "data": {
    "message": "Imported 2 contacts, 0 failed",
    "hit": 2,
    "miss": 0,
    "errors": [],
    "imported": [
      {
        "_id": "698f1773b658409bbfc1be70",
        "organizationId": "698c7aa4d92e03597be8d492",
        "type": "CUSTOMER",
        "name": "New Customer A",
        "email": "a@example.com",
        "phone": "+919876543210"
      },
      {
        "_id": "698f1773b658409bbfc1be71",
        "organizationId": "698c7aa4d92e03597be8d492",
        "type": "VENDOR",
        "name": "New Vendor B",
        "email": "b@example.com",
        "gstin": "22AAAAA0000A1Z5",
        "placeOfSupply": "21-Odisha"
      }
    ]
  }
}
```

**Partial failure example:**

```json
{
  "success": true,
  "status": 200,
  "data": {
    "message": "Imported 1 contacts, 1 failed",
    "hit": 1,
    "miss": 1,
    "errors": [
      {
        "row": 2,
        "message": "At least one of email or phone required",
        "data": {
          "type": "VENDOR",
          "name": "Bad Row",
          "email": "",
          "phone": ""
        }
      }
    ],
    "imported": [...]
  }
}
```

- `400 Bad Request` — body must include `contacts` array.

---

### 3.2 Import from CSV (Upload)

- **Method:** `POST`
- **URL:** `/api/v1/business/contacts/import/csv`
- **Content-Type:** `multipart/form-data`
- **Field:** `file` (CSV file)
- **Behavior:** Upload CSV → backend parses, normalizes headers (e.g. "GST Number" → `gstin`, "Mobile" → `phone`), imports contacts, deletes temp file. Use template from `GET /template` for column layout.

**Example:**

```http
POST /api/v1/business/contacts/import/csv
Content-Type: multipart/form-data; boundary=----WebKitFormBoundary
------WebKitFormBoundary
Content-Disposition: form-data; name="file"; filename="contacts.csv"
Content-Type: text/csv
<file bytes>
------WebKitFormBoundary--
```

**Expected response (200 OK):** Same shape as JSON import — `{ message, hit, miss, errors, imported }`.

- `400 Bad Request` — no file or invalid file.
- Max file size: 5MB. Accepted: `.csv`, `text/csv`, `application/vnd.ms-excel`.

---

### 3.3 Map Headers (for CSV/Excel field mapping)

- **Method:** `POST`
- **URL:** `/api/v1/business/contacts/import/map-headers`
- **Behavior:** Given column headers from a CSV/Excel file, returns mapping of column index → schema field name. Use when file has mismatched headers (e.g. "Contact Name" → `name`, "GST Number" → `gstin`).

**Body:**

```json
{
  "headers": [
    "Contact Name",
    "Email",
    "Phone",
    "GST Number",
    "Type",
    "Place of Supply"
  ]
}
```

**Expected response (200 OK):**

```json
{
  "success": true,
  "status": 200,
  "data": {
    "mapping": {
      "0": "name",
      "1": "email",
      "2": "phone",
      "3": "gstin",
      "4": "type",
      "5": "placeOfSupply"
    }
  }
}
```

---

## 4. Flows

### 4.1 Create a minimal contact (quick add)

```
User → POST /api/v1/business/contacts
  Body: { type: "CUSTOMER", name: "Quick Add", email: "q@x.com" }
  ← 201 { contact, warnings? }
```

### 4.2 Create full GST-compliant vendor

```
User → POST /api/v1/business/contacts
  Body: { type: "VENDOR", name, legalName, gstin, pan, email, phone, address, city, state, stateCode, pincode, placeOfSupply, ... }
  ← 201 { contact, warnings } (warnings empty if all fields provided)
```

### 4.3 List vendors with compliance gaps

```
User → GET /api/v1/business/contacts?type=VENDOR
  ← 200 { data: [...], pagination }
  For each contact, user can GET /:id to see warnings
```

### 4.4 Bulk import from CSV

```
1. User → GET /api/v1/business/contacts/template
   ← CSV file (headers + example row)

2. User fills template in Excel, exports as CSV

3. User → POST /api/v1/business/contacts/import/csv
   Body: multipart/form-data, field "file" = CSV
   ← 200 { hit, miss, errors, imported }

   Backend: parses CSV, normalizes headers, imports, deletes temp file.
```

### 4.5 Export vendors for reconciliation

```
User → GET /api/v1/business/contacts/export/csv?type=VENDOR
  ← CSV file download (or JSON via /export/json)
```

### 4.6 Resolve field mapping for external file

```
1. User has CSV with headers: "Customer Name", "Email Address", "Mobile"
2. User → POST /api/v1/business/contacts/import/map-headers
   Body: { headers: ["Customer Name", "Email Address", "Mobile"] }
   ← 200 { mapping: { "0": "name", "1": "email", "2": "phone" } }
3. Client uses mapping to transform CSV rows → contact objects before import
```

---

## 5. Validation Rules

| Rule                                           | Enforcement                     |
| ---------------------------------------------- | ------------------------------- |
| At least one of `email` or `phone`             | Zod refine on create            |
| `type` must be `CUSTOMER`, `VENDOR`, or `BOTH` | Zod enum                        |
| GSTIN format (if provided)                     | Mongoose validator + Zod refine |
| PAN format (if provided)                       | Mongoose validator + Zod refine |
| Email format (if provided)                     | Zod union with `""` allowed     |

---

## 6. Related APIs

- **Invoices / Bills** — will reference `contactId` for customer or vendor.
- **Payments** — will update contact `currentBalance` via journal entries.
- **Reports** — AR/AP aging uses contacts; GST reports (GSTR-1, GSTR-2B) filter by contact type.
