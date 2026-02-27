# Events API (Event Templates & Dispatch)

This document describes the Event Template and Event Instance APIs for Finager India.
Events provide a dynamic, per-organization way to transform domain actions (invoices, bills, stock-adjust, product add, etc.) into side-effects (journal entry creation, email/webhook, etc.). For MVP we implement the Journal plugin only.

Base path:

- **`/api/v1/business/events`**

All endpoints require:

- User to be **authenticated** (Better Auth session)
- User to be have a role req.user?.role ?? "staff"
- **`activeOrganizationId`** set in session (organization scoping)
- RBAC: CA / Owner = full CRUD + dispatch; Staff = read + create/dispatch (no delete)

Notes:

- Event templates are organization-scoped (unique `orchid` per org).
- Dispatching an event creates an EventInstance and runs configured plugins (journal required).

---

## Schema Summary

Event Template (configuration)

- `organizationId` (ObjectId, server-set)
- `name` (string) — human label (e.g., "Sales Invoice")
- `orchid` (string) — short code, uppercase unique per org (e.g., "INVOICE")
- `referenceConfig` — { prefix, serialMethod: `incrementor|randomHex`, length }
- `inputSchema` — arbitrary JSON used for validating incoming payloads (MVP: informational)
- `plugins` — array of plugin ids (must include `"journal"`)
- `linesRule` — array of journal line rules:
  - `accountId` (ObjectId)
  - `direction` (`debit` | `credit`)
  - `amountConfig` — { field, operator (`direct`, `%`, `+`, `-`, `*`), operand }
  - `narrationConfig` — array of string parts (supports placeholders `%field%`, `%reference%`)
- `isActive` (boolean)

Event Instance (runtime)

- `organizationId`
- `templateId`
- `type` (orchid)
- `reference` (string) — generated per referenceConfig
- `payload` (object) — event payload
- `status` (`PENDING`|`PROCESSED`|`FAILED`)
- `processedAt`, `errorMessage`
- `results` — plugin run results: { plugin, success, resultId, error }

---

## Endpoints

Base: `/api/v1/business/events`

### 1. List Templates

- Method: `GET`
- URL: `/templates`
- Query: `page`, `limit`, `orchid`, `name`, `isActive`
- Roles: CA/Owner, Staff

Response (200):

```json
{
  "success": true,
  "status": 200,
  "data": [
    {
      "_id": "601...",
      "organizationId": "698c7aa4...",
      "name": "Sales Invoice",
      "orchid": "INVOICE",
      "referenceConfig": {
        "prefix": "INV",
        "serialMethod": "incrementor",
        "length": 6
      },
      "plugins": ["journal"],
      "linesRule": [
        /* ... */
      ],
      "isActive": true,
      "createdAt": "...",
      "updatedAt": "..."
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 5 }
}
```

### 2. Create Template

- Method: `POST`
- URL: `/templates`
- Roles: CA/Owner
- Body: EventTemplate payload (see schema)

Example (minimal):

```json
{
  "name": "Sales Invoice",
  "orchid": "INVOICE",
  "referenceConfig": {
    "prefix": "INV",
    "serialMethod": "incrementor",
    "length": 6
  },
  "inputSchema": { "required": ["totalAmount", "contactId"] },
  "plugins": ["journal"],
  "linesRule": [
    {
      "accountId": "60f...salesAccountId",
      "direction": "credit",
      "amountConfig": { "field": "totalAmount", "operator": "direct" },
      "narrationConfig": ["Invoice ", "%reference%", " to ", "%contactName%"]
    },
    {
      "accountId": "60f...cashAccountId",
      "direction": "debit",
      "amountConfig": { "field": "totalAmount", "operator": "direct" },
      "narrationConfig": ["Received for invoice ", "%reference%"]
    }
  ]
}
```

Response (201 Created): created template object.

Error codes:

- `400` validation error
- `403` insufficient role

### 3. Get / Update / Delete Template

- GET `/templates/:orchid` — fetch template by orchid
- PUT `/templates/:orchid` — replace template (CA/Owner)
- PATCH `/templates/:orchid` — partial update (CA/Owner)
- DELETE `/templates/:orchid` — soft-disable (set isActive=false) (CA/Owner)

Responses follow same shape as create.

---

### 4. Dispatch Event (core operation)

- Method: `POST`
- URL: `/dispatch/:orchid`
- Roles: CA/Owner, Staff
- Description: Trigger an event for activeOrganizationId using template `orchid`. System will:
  1. Find template by (organizationId, orchid)
  2. Validate payload (basic checks vs inputSchema)
  3. Generate `reference` using template.referenceConfig (atomic incrementor using a counter collection or randomHex)
  4. Create EventInstance (status = PENDING)
  5. Sequentially run configured plugins (journal for MVP)
  6. Save plugin results and set instance status to PROCESSED/FAILED

Request body: event payload (JSON). Example for invoice:

```json
{
  "contactId": "698f...",
  "totalAmount": 1200.5,
  "taxableAmount": 1000,
  "taxAmount": 200.5,
  "items": [{ "productId": "...", "qty": 2, "rate": 500 }],
  "meta": { "paymentMode": "BANK" }
}
```

Response (201 Created):

```json
{
  "success": true,
  "status": 201,
  "data": {
    "event": {
      "_id": "ev_...",
      "organizationId": "org_...",
      "templateId": "tmpl_...",
      "type": "INVOICE",
      "reference": "INV-000001",
      "status": "PROCESSED",
      "payload": {
        /* ... */
      },
      "results": [
        { "plugin": "journal", "success": true, "resultId": "journal_..." }
      ],
      "processedAt": "2026-02-17T..."
    }
  }
}
```

Error cases:

- `404` template not found
- `400` payload validation failed — response includes validation messages
- `500` plugin failure — EventInstance saved with `status=FAILED` and `errorMessage`

---

### 5. Get Event Instance

- Method: `GET`
- URL: `/instances/:id`
- Returns the EventInstance document, plugin results and status.

Response (200):

```json
{
  "success": true,
  "status": 200,
  "data": {
    "event": {
      /* instance doc */
    }
  }
}
```

---

## Reference generation (details)

- `incrementor`:
  - Use a dedicated `counters` collection keyed by `{ organizationId, orchid }`.
  - Atomic `findOneAndUpdate({key}, { $inc: { seq: 1 } }, { upsert: true, new: true })` to obtain next serial.
  - Pad to `length`: `INV-000001`.

- `randomHex`:
  - Use secure random: `crypto.randomBytes(Math.ceil(length/2)).toString('hex').slice(0,length)`.
  - Format: `INV-ax9b4f`

---

## Journal plugin (MVP behavior)

When the journal plugin runs:

1. For each `linesRule` in template:
   - Resolve amount:
     - `direct`: `payload[field]`
     - `%`: `payload[field] * operand/100`
     - arithmetic operators apply accordingly
   - Build narration by joining `narrationConfig` strings and replacing `%field%` placeholders with payload values (and `%reference%` with generated reference)
2. Create a JournalEntry (use existing Journal model/service) with lines (debit/credit as specified) and metadata:
   - `reference`: event.reference
   - `source`: `{ type: 'event', eventId: <instanceId>, template: orchid }`
3. Return plugin result `{ plugin: 'journal', success: true, resultId: journal._id }`

Error handling:

- If any plugin fails, capture error text in instance.results and set instance.status = FAILED with `errorMessage`.
- Prefer transactional journal creation (Mongo session) when available.

---

## Default templates (auto-create on org creation)

Create simple default templates for:
INVOICE, BILL, PAYMENT, RECEIPT, CREDIT_NOTE, DEBIT_NOTE, EXPENSE, PRODUCTADD, STOCKADJ

Each default:

- `referenceConfig.prefix` set (INV, BILL, PAY, REC, CN, DN, EXP, PA, SA)
- `plugins: ['journal']`
- `inputSchema`: minimal required fields for the event (e.g. invoice requires `totalAmount` and `contactId`)
- `linesRule`: simple debit/credit mapping (e.g., invoice: credit sales acct, debit accounts receivable)

Implementation note: Admin should update accountId values post-org creation to map to actual ledger accounts.

---

## Acceptance Criteria

- Default templates created for new organizations.
- dispatchEvent('INVOICE', payload) → EventInstance created + journal entry created, event.status=PROCESSED.
- incrementor references unique and atomically generated.
- linesRule used to compute dynamic journal amounts and narrations.
- All operations scoped to organizationId.

---
## Recurring Events (scheduler)

Support simple, in-process recurring events where a template is dispatched repeatedly with a fixed payload.

Schedule options (MVP)
- `daily` — run every day at given `time` (HH:mm)
- `weekly` — run on a given `dayOfWeek` (0=Sun..6=Sat) at `time`
- `monthly` — run on `dayOfMonth` (1..31) at `time` (clamped to month length)
- `calendar_monthly` — run on the last day of each month at `time`

Recurring model (summary)
- `templateId`, `organizationId`
- `payload` (fixed object passed to dispatch)
- `schedule` `{ type, time, dayOfWeek?, dayOfMonth? }`
- `startAt`, `endAt`, `nextRun`, `lastRun`, `enabled`, `runCount`, `maxRuns`

Endpoints
- POST `/recurring` — create a recurring event (body: templateId, schedule, payload, optional start/end/maxRuns) — Roles: CA/Owner, Staff
- GET `/recurring` — list recurring events for org
- DELETE `/recurring/:id` — disable recurrence

Example create (daily at 02:30):

```json
POST /api/v1/business/events/recurring
{
  "templateId": "tmpl_...",
  "schedule": { "type": "daily", "time": "02:30" },
  "payload": { "contactId": "698f...", "totalAmount": 1000 },
  "startAt": "2026-03-01T00:00:00Z"
}
```

Behavior & notes
- In-process scheduler (setTimeout) loads enabled recurrences at startup and schedules next run.
- Each run calls `dispatchEvent` (creates EventInstance + runs plugins).
- Scheduler persists nextRun/lastRun/runCount in DB; on restart it reloads DB and re-schedules.
- Limitations: single-process scheduler (MVP). For HA or multi-instance deployment, migrate to a persistent job queue (Agenda/Bull).
- Timezone support is not implemented in MVP; `time` is interpreted in server timezone.

Acceptance criteria (recurring)
- Creating a recurrence schedules it and produces EventInstances at correct times.
- Each run creates an EventInstance and runs the journal plugin.
- Disable (DELETE) stops future runs.

---

## Next steps (implementation)

I can now implement:

- models (done)
- counters collection & reference generator
- dispatcher service + template CRUD + instance service
- journal plugin (integrate with Journal service/model)
- org creation hook to seed defaults
- router/handlers for Templates + Dispatch + Instances

Which piece should I implement next? (suggest: dispatcher + journal plugin)
