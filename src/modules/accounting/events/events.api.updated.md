# Events API — Templates, Dispatch & Instances

This document describes the Events system: per-organization **Event Templates** (configuration), **Event Instances** (runtime), **dispatch** workflow, and the **Journal** plugin. Domain actions (invoice, payment, stock-adjust, product-add, etc.) can trigger automatic journal entries via templates.

**Base path:** `/api/v1/business/events`

**Recurring events:** Mounted at `/api/v1/business/events/recurring` (separate router).

---

## Auth & scoping

- Authenticated user (Better Auth session).
- `activeOrganizationId` must be set in session.
- All operations are scoped to the active organization.

---

## Schema summary

### EventTemplate (configuration)

| Field | Type | Description |
|-------|------|-------------|
| organizationId | ObjectId | Server-set |
| name | string | Human label (e.g. "Sales Invoice") |
| orchid | string | Short code, unique per org (e.g. "INVOICE", "PAYMENT") — stored uppercase |
| referenceConfig | object | `{ prefix, serialMethod: "incrementor" \| "randomHex", length }` — default prefix "DOC", length 6 |
| narrationConfig | string | Optional; journal entry description (supports `%field%`, `%reference%`) |
| inputSchema | object | Optional; JSON schema for payload validation. If `required` (array) is set, those fields are checked before dispatch. |
| plugins | string[] | Must include `"journal"` (default `["journal"]`) |
| linesRule | array | Journal line rules (see below) |
| isSystemGenerated | boolean | If true, template cannot be deleted (default false) |
| isActive | boolean | Default true |

**linesRule (journal line rules)**

Each rule defines one journal line. Use **accountCode** (preferred) or **accountId**:

| Field | Type | Description |
|-------|------|-------------|
| accountCode | string | **Preferred.** COA account code (e.g. `"4000"`, `"1100"`). Resolved to `accountId` at create time for the organization. |
| accountId | string | ObjectId of COA account, or a string that is not a valid ObjectId — in the latter case it is treated as account code and resolved. |
| direction | string | `"debit"` or `"credit"` |
| amountConfig | object | `{ field: string, operator?: "direct" \| "%" \| "+" \| "-" \| "*", operand?: number }`. Amount is taken from `payload[field]`; `%` = field * operand / 100; others are arithmetic. |
| narrationConfig | string[] | Optional. Joined to form line narration; placeholders `%field%` (from payload) and `%reference%` (event reference) are replaced. |

**Rule:** Each line must have either `accountCode` or `accountId`. On **create**, the backend resolves `accountCode` (or non-ObjectId `accountId`) to the COA document’s `_id` for the active organization and stores only `accountId` in the template. On **update** (PATCH), if you send `linesRule`, use `accountId` values (e.g. from GET template); accountCode is not re-resolved on update.

### EventInstance (runtime)

| Field | Type | Description |
|-------|------|-------------|
| organizationId | ObjectId | |
| templateId | ObjectId | Ref to event_template |
| type | string | orchid |
| reference | string | Generated per template’s referenceConfig |
| payload | object | Event payload (used by journal plugin for amounts and narrations) |
| status | "PENDING" \| "PROCESSED" \| "FAILED" | |
| processedAt | Date | Set when processing completes |
| errorMessage | string | Set when status is FAILED |
| results | array | `[{ plugin, success, resultId?, error? }]` — one entry per plugin run |

---

## Endpoints

### 1. List templates

- **GET** `/templates`
- **Query:** `page`, `limit`, `orchid`, `name`, `isActive` (true/false string)

**Response (200):**

```json
{
  "success": true,
  "status": 200,
  "data": {
    "templates": [ /* EventTemplate[] */ ],
    "total": 42
  }
}
```

---

### 2. Create template

- **POST** `/templates`
- **Body:** EventTemplate payload (omit `id`, `organizationId`, `createdAt`, `updatedAt`). **Use `accountCode` in each linesRule** (e.g. `"4000"`, `"1100"`). Backend resolves codes to COA `_id` for the organization; if an account is not found, returns 400.

**Example:**

```json
{
  "name": "Sales Invoice",
  "orchid": "INVOICE",
  "referenceConfig": {
    "prefix": "INV",
    "serialMethod": "incrementor",
    "length": 6
  },
  "narrationConfig": "",
  "inputSchema": { "required": ["totalAmount", "contactId"] },
  "plugins": ["journal"],
  "linesRule": [
    {
      "accountCode": "4000",
      "direction": "credit",
      "amountConfig": { "field": "totalAmount", "operator": "direct" },
      "narrationConfig": ["Sales revenue ", "%reference%"]
    },
    {
      "accountCode": "1100",
      "direction": "debit",
      "amountConfig": { "field": "totalAmount", "operator": "direct" },
      "narrationConfig": ["Receivable ", "%reference%"]
    }
  ]
}
```

**Response (201):** `{ "data": { "template": { ... } } }` — stored template has `linesRule[].accountId` (resolved); `accountCode` is not stored.

**Errors:** `400` — account code not found in organization, or invalid line (missing accountCode/accountId).

---

### 3. Get template by orchid

- **GET** `/templates/:orchid`
- `orchid` is case-insensitive (stored uppercase).

**Response (200):** `{ "data": { "template": { ... } } }`  
**Errors:** `404` — template not found.

---

### 4. Update template (partial)

- **PATCH** `/templates/:orchid`
- **Body:** Partial template. When sending `linesRule`, use **accountId** (from GET template); accountCode is not re-resolved on update.

**Response (200):** `{ "data": { "template": { ... } } }`  
**Errors:** `404` — template not found.

---

### 5. Delete template

- **DELETE** `/templates/:orchid`
- **Behavior:** Soft delete — sets `isActive: false`. System-generated templates (`isSystemGenerated: true`) cannot be deleted (403).

**Response (200):** `{ "data": { "template": { ... } } }`  
**Errors:** `403` — system-generated template; `404` — not found.

---

### 6. Dispatch template

- **POST** `/dispatch/:orchid`
- **Body:** `{ "payload": { ... } }`. The **payload** object is the event payload: it is stored on the instance and used by the journal plugin for `amountConfig.field` and narration placeholders (`%field%`, `%reference%`).

**Example (invoice):**

```json
{
  "payload": {
    "contactId": "698f...",
    "contactName": "Acme Corp",
    "totalAmount": 1200.5,
    "taxableAmount": 1000,
    "taxAmount": 200.5,
    "items": [{ "productId": "...", "qty": 2, "rate": 500 }]
  }
}
```

**Workflow:**

1. Find template by `(organizationId, orchid)` → 404 if missing.
2. If template has `inputSchema.required` (array), check payload for those fields → on failure create instance with status FAILED and return.
3. Generate `reference` per template’s referenceConfig (incrementor or randomHex).
4. Create EventInstance (status PENDING) with `reference` and payload.
5. Run plugins (e.g. journal) in order; journal plugin builds journal lines from `linesRule` and payload, creates journal entry.
6. Set instance status to PROCESSED or FAILED; persist `results` and `processedAt`.

**Response (201):**

```json
{
  "success": true,
  "status": 201,
  "data": {
    "event": {
      "_id": "...",
      "templateId": "...",
      "type": "INVOICE",
      "reference": "INV-000001",
      "status": "PROCESSED",
      "payload": { ... },
      "results": [
        { "plugin": "journal", "success": true, "resultId": "<journalEntryId>" }
      ],
      "processedAt": "2026-02-17T..."
    }
  }
}
```

**Errors:** `404` — template not found; `500` — dispatch/plugin failure (instance may be saved with status FAILED and `errorMessage`).

---

### 7. Get instance

- **GET** `/instances/:id`

**Response (200):** `{ "data": { "event": { ... } } }`  
**Errors:** `404` — not found or not in organization.

---

### 8. List instances

- **GET** `/instances`
- **Query:** `page`, `limit`, `reference`, `status`

**Response (200):**

```json
{
  "message": "Instances fetched successfully",
  "data": [ /* EventInstance[] */ ],
  "pagination": { "page": 1, "limit": 20, "total": 100, "totalPages": 5 }
}
```

---

## Recurring events

**Base path:** `/api/v1/business/events/recurring`

- **POST** `/` — Create recurring event (body: templateId, payload?, schedule, startAt?, endAt?, enabled?, etc.). Schedule: `{ type: "daily"|"weekly"|"monthly"|"calendar_monthly", time?: "HH:mm", dayOfWeek?: 0-6, dayOfMonth?: 1-31 }`.
- **GET** `/` — List recurring events for org.
- **DELETE** `/:id` — Remove/disable recurrence.

Scheduler runs in-process and dispatches the template with the stored payload at each `nextRun`; then updates `lastRun`, `runCount`, and next run time.

---

## Journal plugin (MVP)

When the `journal` plugin runs for an instance:

1. For each `linesRule` (with resolved `accountId`):
   - **Amount:** From `payload[amountConfig.field]`; apply operator (`direct`, `%`, `+`, `-`, `*`) and operand.
   - **Narration:** Join `narrationConfig` and replace `%field%` with `payload[field]`, `%reference%` with instance.reference.
2. Build journal entry: `reference` = instance.reference, `lines` = one line per rule (accountId, debit/credit per direction, narration).
3. Call Journal service to create the entry (organizationId, userId, role from context).
4. Return `{ plugin: "journal", success: true, resultId: "<journalId>" }`.

If the plugin throws, the instance is updated with status FAILED and the error in `results`.

---

## Reference generation

- **incrementor:** Atomic counter per `(organizationId, orchid)`; reference = `prefix` + zero-padded sequence (e.g. `INV-000001`).
- **randomHex:** Secure random hex string of given length; reference = `prefix` + hex.

---

## Errors

| Status | Meaning |
|--------|---------|
| 400 | Validation (missing required payload fields, account code not found, invalid linesRule). |
| 403 | Not a member of org; or deleting a system-generated template. |
| 404 | Template or instance not found. |
| 500 | Dispatch or plugin failure (instance may be FAILED with errorMessage). |

---

## Implementation notes (reference)

- **events.model.ts:** Zod `lineRuleZ` has `accountId` (string) and `accountCode` (optional). Mongoose `LineRuleSchema` stores `accountId` (ObjectId); no `accountCode` in DB.
- **template.service.ts:** On create (and createMany), each linesRule’s `accountCode` (or non-ObjectId `accountId`) is resolved to COA `_id` for the organization; line is stored with `accountId` only. Update (updateByOrchid) does not re-resolve accountCode.
- **events.handler.ts:** Dispatch accepts body `{ payload: { ... } }`; the inner `payload` object is passed to the dispatcher and stored on the instance so the journal plugin can read `payload[field]`.
- **dispatcher.service.ts:** Loads template, validates payload against inputSchema.required, generates reference, creates instance, runs plugins (journal), updates instance status and results.
- **plugins/journal.plugin.ts:** Builds journal lines from template.linesRule and payload; creates entry via JournalServices.createJournalEntry.
