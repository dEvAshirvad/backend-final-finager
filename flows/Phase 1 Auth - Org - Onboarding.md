## Phase 1 – Auth, Organization & Onboarding Flow

This document describes the end-to-end flow for Phase 1, covering:

- **Authentication (email + password, sessions)**
- **Email verification**
- **Organization creation and membership**
- **Onboarding for CA and Owner roles**

---

### 1. High-Level User Journey

1. **Registration**
   - User signs up with email and password.
   - A session is created and a verification email is sent.
2. **Email Verification**
   - User clicks the link in the email.
   - Backend verifies the token and marks the user as `emailVerified`.
3. **Onboarding**
   - User updates **name** and **profile picture**.
   - User chooses a **role**: `ca` (Chartered Accountant) or `owner` (business owner).
   - Flow then branches — **both CA and Owner can create orgs or join via invitation**:
     - **Create organization path** (CA or Owner):
       - CA: Verify CA ID (`caId`) first.
       - Owner: Skip CA ID.
       - Create organization (name, slug, GSTIN, industry, etc.).
       - Set active organization.
       - Invite other members (CA can invite Owner, Owner can invite CA).
       - Mark user as `isOnboarded = true`.
     - **Join via invitation path** (CA or Owner):
       - User receives or follows an invitation link.
       - Joins an existing organization.
       - Sets active organization (implicitly through auth/organization APIs).
       - Marks onboarding as complete.

---

### 2. Stage 1 – Registration

#### 2.1 Endpoint

- **URL**: `POST /api/auth/sign-up/email`
- **Purpose**: Create a new user, credentials entry, and initial session.

#### 2.2 Example Request

```json
POST /api/auth/sign-up/email
{
  "name": "",
  "email": "ashirvadsatapathy2828@gmail.com",
  "password": "ashirvadsatapathy2828",
  "rememberMe": true
}
```

#### 2.3 Example Response

```json
{
  "token": "9cBuiIGjG0VjA7b9ZxBAsuOUOOAFfd3T",
  "user": {
    "name": "",
    "email": "ashirvadsatapathy2828@gmail.com",
    "emailVerified": false,
    "createdAt": "2026-02-11T09:59:33.963Z",
    "updatedAt": "2026-02-11T09:59:33.963Z",
    "role": "user",
    "banned": false,
    "isOnboarded": false,
    "id": "698c5305d2b9acb9c64fe550"
  }
}
```

#### 2.4 Database Side Effects

- **`users`**:
  - New user with:
    - `email`
    - `name` (may be empty)
    - `emailVerified: false`
    - `role: "user"`
    - `isOnboarded: false`
- **`accounts`**:
  - Credential provider entry:
    - `providerId: "credential"`
    - `userId` references `users._id`
    - `password` is **bcrypt-hashed**.
- **`sessions`**:
  - Session document with:
    - `token`
    - `userId`
    - `expiresAt`
    - `ipAddress`
    - `userAgent`

#### 2.5 Frontend Behavior

- After successful sign-up:
  - Redirect user from **Sign-up** page → **Verify Email** page.
  - The Verify Email page shows instructions to check email and click the verification link.

---

### 3. Stage 2 – Email Verification

#### 3.1 Email Link

- The verification email contains a link like:

```text
http://localhost:3000/verify-email?token=<JWT_TOKEN>
```

#### 3.2 Backend Verification Endpoint

- **URL**: `PATCH /api/auth/verify-email?token=<JWT_TOKEN>`
- **Purpose**: Validate the email-verification token and update the user.

#### 3.3 Example Response

```json
{
  "status": true,
  "user": null
}
```

#### 3.4 Database Side Effects

- **`users`**:
  - The user’s `emailVerified` field is set to `true`.

#### 3.5 Frontend Behavior

- After a successful verification call:
  - Frontend redirects to `/onboarding`.
  - From now on, user is considered **verified but not onboarded**.

---

### 4. Stage 3 – Onboarding (Common Steps)

Once the user is on the Onboarding page:

#### 4.1 Update User Profile

- **URL**: `POST /api/auth/update-user`
- **Purpose**: Update `name` and `image` for the logged-in user.

**Request:**

```json
{
  "name": "Ashirvad Satapathy",
  "image": ""
}
```

**Response:**

```json
{
  "status": true
}
```

**DB:** updates `users.name`, `users.image`, `updatedAt`.

#### 4.2 Choose Role

- **URL**: `POST /api/v1/onboarding/choose-role`
- **Purpose**: Set `role` for the user (`"ca"`, `"owner"`, or `"staff"`).

**Request:**

```json
{
  "role": "ca"
}
```

**Response:**

```json
{
  "success": true,
  "status": 200,
  "data": {
    "message": "Role chosen successfully"
  }
}
```

**DB:** user’s `role` updated (e.g. from `"user"` → `"ca"`).

**Frontend branching:**

- Show options: **Create organization** or **Join via invitation** (both available for CA and Owner).
- CA path (create): requires CA ID verification before org creation.
- Owner path (create): can create org directly.
- Both can invite each other once org exists.

---

### 5. Create Organization Path – CA or Owner

**Note:** Both CA and Owner can create organizations. CA must verify `caId` first; Owner can create directly.

#### 5.1 Verify CA ID (MRN) — CA only

- **URL**: `POST /api/v1/onboarding/get-verify-ca`
- **Purpose**: Store ICAI membership number as `caId`.

**Request:**

```json
{
  "caId": "529486"
}
```

**Response:**

```json
{
  "success": true,
  "status": 200,
  "data": {
    "message": "CA ID verified successfully"
  }
}
```

**DB:** user’s `caId` updated.

#### 5.2 Organization Name & Slug Preparation

1. **Check slug availability**
   - **URL**: `POST /api/auth/organization/check-slug`
   - **Request**:

     ```json
     {
       "slug": "trendywool"
     }
     ```

   - **Response**:

     ```json
     {
       "status": true
     }
     ```

2. **Generate organization code**
   - **URL**: `POST /api/v1/onboarding/generate-org-code`
   - **Request**:

     ```json
     {
       "name": "Trendy Wools",
       "slug": "trendywools"
     }
     ```

   - **Response**:

     ```json
     {
       "success": true,
       "status": 200,
       "data": {
         "message": "Organization code generated successfully",
         "orgCode": "TRE1729"
       }
     }
     ```

   - **Logic**:
     - Prefix from `name` or `slug` (first 3 characters, uppercased).
     - Append random 4-digit number.
     - Ensure uniqueness against `organizations.orgCode` (retry a few times).

#### 5.3 Create Organization

- **URL**: `POST /api/auth/organization/create`
- **Purpose**: Create an organization and automatically add the creator as a member.

**Request:**

```json
{
  "name": "Trendy Wools",
  "slug": "trendywools",
  "gstin": "27AAACR5055K1Z7",
  "industry": "retail",
  "pan": "",
  "financialYearStart": "2025-2026",
  "orgCode": "TRE1729"
}
```

**Response (simplified):**

```json
{
  "name": "Trendy Wools",
  "slug": "trendywools",
  "createdAt": "...",
  "gstin": "27AAACR5055K1Z7",
  "industry": "retail",
  "pan": "",
  "financialYearStart": "2025-2026",
  "orgCode": "TRE1729",
  "id": "698c7aa4d92e03597be8d492",
  "members": [
    {
      "organizationId": "698c7aa4d92e03597be8d492",
      "userId": "698c5305d2b9acb9c64fe550",
      "role": "ca",
      "createdAt": "...",
      "id": "698c7aa4d92e03597be8d493"
    }
  ]
}
```

**DB effects:**

- **`organizations`**:
  - New org with GSTIN, PAN, financial year, `orgCode`, timestamps.
- **`members`**:
  - New member for creator: `role: "ca"`.

**Validation highlights (from `organizationHooks`):**

- **GSTIN**:
  - Regex format check.
  - Remote verification via WhiteBooks API (see `src/lib/gst.ts`).
- **PAN**:
  - If present, must match digits 3–12 of GSTIN.
- **Financial year**:
  - Must match pattern `YYYY-YYYY` (e.g. `"2025-2026"`).

#### 5.4 Set Active Organization

- **URL**: `POST /api/auth/organization/set-active`
- **Purpose**: Attach `activeOrganizationId` to the current session.

**Request:**

```json
{
  "organizationId": "698c7aa4d92e03597be8d492"
}
```

**Response:** returns the selected organization’s data.

**DB:** updates `sessions.activeOrganizationId` for the current session.

**Frontend:** redirect user to **CA dashboard**, scoped to the active organization.

#### 5.5 Invite Members

- **URL**: `POST /api/auth/organization/invite-member`
- **Purpose**: Invite another user to join the organization with a given role (e.g. `owner`).

**Request:**

```json
{
  "email": "ashirvad.satapathy01@gmail.com",
  "role": "owner",
  "organizationId": "698c7aa4d92e03597be8d492"
}
```

**Response:** an `invitation` object with:

- `organizationId`
- `email`
- `role`
- `status: "pending"`
- `expiresAt`
- `inviterId`
- `id` (invitation ID)

**DB:** new document in `invitations` collection.

**Frontend links (based on whether user exists):**

- If user **does not exist**:
  - `http://localhost:3000/auth/signup?redirectTo=/auth/organization/invitation/<invitationId>`
- If user **already exists**:
  - `http://localhost:3000/auth/organization/invitation/<invitationId>`

**Who can invite whom:** CA can invite Owner (and vice versa). Both use the same `invite-member` endpoint.

---

### 6. Join via Invitation Path – CA or Owner

#### 6.1 New User Sign-up and Verification

- Invitee (CA or Owner) follows the **“not present”** link:
  - Signs up via standard auth flow.
  - Verifies email (same as Section 3).
  - Updates profile (name, image).
  - Role is set based on invitation (`"owner"`, `"ca"`, etc.) as part of onboarding.

#### 6.2 Fetch Invitation Details

- **URL**: `GET /api/auth/organization/get-invitation?id=<invitationId>`

**Response:**

```json
{
  "organizationId": "698c7aa4d92e03597be8d492",
  "email": "ashirvad.satapathy01@gmail.com",
  "role": "owner",
  "status": "pending",
  "expiresAt": "...",
  "createdAt": "...",
  "inviterId": "698c5305d2b9acb9c64fe550",
  "id": "698c919ac9af3edfbaa04c11",
  "organizationName": "Trendy Wools",
  "organizationSlug": "trendywools",
  "inviterEmail": "ashirvadsatapathy2828@gmail.com"
}
```

**Frontend:** show invitation details and an **Accept invitation** button.

#### 6.3 Accept Invitation

- **URL**: `POST /api/auth/organization/accept-invitation`

**Request:**

```json
{
  "invitationId": "698c919ac9af3edfbaa04c11"
}
```

**Response:**

```json
{
  "invitation": {
    "organizationId": "698c7aa4d92e03597be8d492",
    "email": "ashirvad.satapathy01@gmail.com",
    "role": "owner",
    "status": "accepted",
    "expiresAt": "...",
    "createdAt": "...",
    "inviterId": "698c5305d2b9acb9c64fe550",
    "id": "698c919ac9af3edfbaa04c11"
  },
  "member": {
    "organizationId": "698c7aa4d92e03597be8d492",
    "userId": "698c93911d36c3b0c9d35ece",
    "role": "owner",
    "createdAt": "...",
    "id": "698c95ba1d36c3b0c9d35ed1"
  }
}
```

**DB effects:**

- **`invitations`**:
  - `status` changed from `"pending"` → `"accepted"`.
- **`members`**:
  - New member entry created for the owner.
- **`users`**:
  - Owner user exists with `role: "owner"`, `isOnboarded: false`.

---

### 7. Completing Onboarding (CA & Owner)

#### 7.1 Endpoint

- **URL**: `POST /api/v1/onboarding/complete-onboarding`
- **Purpose**: Mark a user as fully onboarded for a specific organization.

**Request:**

```json
{
  "organizationId": "698c7aa4d92e03597be8d492"
}
```

#### 7.2 Validation Rules

Inside `OnboardingHandler.completeOnboarding`:

- User must **not** already be onboarded (`isOnboarded` is false).
- User’s `role` must be in `["ca", "owner", "staff"]`.
- If `role === "ca"`, user must have a **`caId`** set.
- User must be a **member of the organization** with matching role:
  - `members.findOne({ userId, organizationId, role })` must exist.

If any of these fail, the endpoint responds with an error (400) and a descriptive message.

#### 7.3 Success Response

```json
{
  "success": true,
  "status": 200,
  "data": {
    "message": "Onboarding completed successfully"
  }
}
```

**DB effect:**

- **`users`**:
  - `isOnboarded` set to `true` for the current user.

#### 7.4 Frontend Behavior

- Redirect user to the final **role-aware dashboard**:
  - CA → **CA dashboard** (active organization).
  - Owner → **Business dashboard** (active organization).

---

### 8. Summary

- **Auth**:
  - Email/password registration.
  - Sessions with tokens and active organization tracking.
  - Mandatory email verification before onboarding.
- **Organizations**:
  - Both CA and Owner users can create organizations (CA must verify `caId` first).
  - Both can invite each other to existing organizations.
  - Validation includes GSTIN, PAN matching, and financial year format.
  - Memberships are stored in `members` linking users to organizations by role.
- **Onboarding**:
  - Enforces profile completion, role selection, CA verification (for CA), and membership checks.
  - `isOnboarded` is only set to `true` when all business rules for the chosen role and organization are satisfied.

