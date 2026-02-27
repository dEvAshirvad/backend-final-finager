## Phase 1 — Auth, Organization & Onboarding Flow

## Overview

This document describes the end-to-end Phase 1 flows: authentication, organization creation, and user onboarding. It contains API examples (cURL) and expected responses.

## Environment

Frontend URL: `http://localhost:3002`  
Backend URL: `http://localhost:3001`

## Notes

- Backend manages sessions; frontend controls cookies. No client-side localStorage required for auth tokens.

1. New User Registration

---

Users can register via:

- Social sign-in (OAuth)
- Email/password (credential-based)

Social sign-in (example)

```bash
curl http://localhost:3001/api/auth/sign-in/social \
  --request POST \
  --header 'Content-Type: application/json' \
  --header 'Accept: application/json' \
  --header 'Authorization: Bearer YOUR_SECRET_TOKEN' \
  --cookie 'apiKeyCookie=YOUR_SECRET_TOKEN' \
  --data '{
    "callbackURL": "http://localhost:3002/",
    "newUserCallbackURL": "http://localhost:3002/auth/onboarding",
    "provider": "google"
  }'
```

Example response:

```json
{
  "url": "https://accounts.google.com/o/oauth2/v2/auth?...",
  "redirect": true
}
```

Credential-based sign-up (example)

```bash
curl --request POST \
  --url http://localhost:3001/api/auth/sign-up/email \
  --header 'Content-Type: application/json' \
  --header 'User-Agent: insomnia/12.3.1' \
  --data '{
    "name": "",
    "email": "ashirvad.satapathy01@gmail.com",
    "password": "ashirvad.satapathy01",
    "rememberMe": true
  }'
```

Example response:

```json
{
  "token": "T7vSVsQWzDL03JvM4LKcXnj9lyA69eQn",
  "user": {
    "name": "",
    "email": "ashirvad.satapathy01@gmail.com",
    "emailVerified": false,
    "createdAt": "2026-02-17T08:36:45.599Z",
    "updatedAt": "2026-02-17T08:36:45.599Z",
    "role": "user",
    "banned": false,
    "isOnboarded": false,
    "id": "6994289d65e33d805c4a3268"
  }
}
```

Redirect after signup

- If credential-based signup: frontend should navigate to `/auth/verify-email`.
- If social sign-in and email is verified: frontend should navigate to `/auth/onboarding`.

2. Email verification (credential flow)

---

Users receive a verification email with a link similar to:
`http://localhost:3002/auth/verify-email?token=<JWT>`

Server verification example:

```bash
curl --request GET \
  --url 'http://localhost:3001/api/auth/verify-email?token=<TOKEN>' \
  --header 'User-Agent: insomnia/12.3.1' \
  --cookie 'apiKeyCookie=YOUR_SECRET_TOKEN'
```

Example response:

```json
{
  "status": true,
  "user": null
}
```

3. Onboarding (step-based)

---

Onboarding is a series of steps. UI should guide the user through each step and show progress.

3A — User details & role

```bash
curl --request POST \
  --url http://localhost:3001/api/auth/update-user \
  --header 'Authorization: Bearer YOUR_SECRET_TOKEN' \
  --header 'Content-Type: application/json' \
  --data '{
    "name": "Ashirvad Satapathy Owner",
    "image": ""
  }'
```

Response:

```json
{ "status": true }
```

Choose role:

```bash
curl --request POST \
  --url http://localhost:3001/api/v1/onboarding/choose-role \
  --header 'Authorization: Bearer YOUR_SECRET_TOKEN' \
  --header 'Content-Type: application/json' \
  --data '{
    "role": "owner"   // allowed: "owner" | "ca"
  }'
```

Success response example:

```json
{
  "success": true,
  "status": 200,
  "timestamp": "February 17th, 2026 2:11 PM",
  "data": { "message": "Role chosen successfully" },
  "requestId": "95f688d2-1515-4660-a746-d93356e725a0"
}
```

3B — (Optional) Verify CA

```bash
curl --request POST \
  --url http://localhost:3001/api/v1/onboarding/get-verify-ca \
  --header 'Authorization: Bearer YOUR_SECRET_TOKEN' \
  --header 'Content-Type: application/json' \
  --data '{
    "caId": "529486"
  }'
```

Response:

```json
{
  "success": true,
  "status": 200,
  "data": { "message": "CA ID verified successfully" }
}
```

## 3C — Join via invitation

- Check if user has pending invitations. If none, allow organization creation.
- If invitations exist, show them as horizontal cards with an "Accept" action and a "Create new org" CTA.

List invitations:

```bash
curl http://localhost:3001/api/auth/organization/list-user-invitations \
  --header 'Authorization: Bearer YOUR_SECRET_TOKEN'
```

Example response:

```json
[
  {
    "id": "string",
    "email": "string",
    "role": "string",
    "organizationId": "string",
    "organizationName": "string",
    "inviterId": "string",
    "teamId": "string",
    "status": "string",
    "expiresAt": "string",
    "createdAt": "string"
  }
]
```

Get invitation details:

```bash
curl 'http://localhost:3001/api/auth/organization/get-invitation?id=<id>' \
  --header 'Accept: application/json' \
  --header 'Authorization: Bearer YOUR_SECRET_TOKEN' \
  --cookie 'apiKeyCookie=YOUR_SECRET_TOKEN'
```

Accept invitation:

```bash
curl http://localhost:3001/api/auth/organization/accept-invitation \
  --request POST \
  --header 'Content-Type: application/json' \
  --header 'Authorization: Bearer YOUR_SECRET_TOKEN' \
  --data '{ "invitationId": "<id>" }'
```

Response:

```json
{ "invitation": {}, "member": {} }
```

## 3D — Organization creation

Process:

1. Validate slug (debounced while typing) — show check/tick when available.
2. Generate org code automatically once name+slug are provided.
3. Create organization (GSTIN -> generate PAN internally; do not expose PAN input if not required).

Check slug:

```bash
curl --request POST \
  --url http://localhost:3001/api/auth/organization/check-slug \
  --header 'Authorization: Bearer YOUR_SECRET_TOKEN' \
  --header 'Content-Type: application/json' \
  --data '{ "slug": "trendywool" }'
```

Response:

```json
{ "status": true }
```

Generate org code:

```bash
curl --request POST \
  --url http://localhost:3001/api/v1/onboarding/generate-org-code \
  --header 'Authorization: Bearer YOUR_SECRET_TOKEN' \
  --header 'Content-Type: application/json' \
  --data '{ "name": "Trendy Wools", "slug": "trendywools" }'
```

Response:

```json
{
  "success": true,
  "status": 200,
  "data": {
    "message": "Organization code generated successfully",
    "orgCode": "TRE6033"
  }
}
```

Create organization:

```bash
curl --request POST \
  --url http://localhost:3001/api/auth/organization/create \
  --header 'Authorization: Bearer YOUR_SECRET_TOKEN' \
  --header 'Content-Type: application/json' \
  --data '{
    "name": "Trendy Wools",
    "slug": "trendywools",
    "gstin": "27AAACR5055K1Z7",
    "industry": "retail",
    "pan": "",
    "financialYearStart": "2025-2026",
    "orgCode": "TRE6033"
  }'
```

Activate organization (set active for account):

```bash
curl http://localhost:3001/api/auth/organization/set-active \
  --request POST \
  --header 'Content-Type: application/json' \
  --header 'Authorization: Bearer YOUR_SECRET_TOKEN' \
  --data '{ "organizationId": null, "organizationSlug": null }'
```

Expected response (organization object):

```json
{
  "id": "string",
  "name": "string",
  "slug": "string",
  "logo": "string",
  "createdAt": "2026-02-24T16:12:41.931Z",
  "metadata": "string",
  "gstin": "string",
  "industry": "string",
  "pan": "string",
  "financialYearStart": "string",
  "assignedRoleCA": "string",
  "assignedRoleOwner": "string",
  "orgCode": "string"
}
```

## 3E — Invite members

Invite a member:

```bash
curl --request POST \
  --url http://localhost:3001/api/auth/organization/invite-member \
  --header 'Authorization: Bearer YOUR_SECRET_TOKEN' \
  --header 'Content-Type: application/json' \
  --data '{
  "email": "ashirvad.satapathy01@gmail.com",
  "role": "owner",
  "organizationId": "69940677f64f789748e3e5b8"
}'
```

Expected response (organization object):

```json
{
  "organizationId": "69940677f64f789748e3e5b8",
  "email": "ashirvad.satapathy01@gmail.com",
  "role": "owner",
  "status": "pending",
  "expiresAt": "2026-02-19T08:34:55.378Z",
  "createdAt": "2026-02-17T08:34:55.378Z",
  "inviterId": "6993ff864bec0b2a2c8e87fb",
  "id": "6994282f65e33d805c4a3266"
}
```

## 3F — Complete onboarding

Triggered after invite acceptance or when onboarding steps finish:

```bash
curl --request POST \
  --url http://localhost:3001/api/v1/onboarding/complete-onboarding \
  --header 'Authorization: Bearer YOUR_SECRET_TOKEN' \
  --header 'Content-Type: application/json' \
  --data '{ "organizationId": "69940677f64f789748e3e5b8" }'
```

Success response:

```json
{
  "success": true,
  "status": 200,
  "data": { "message": "Onboarding completed successfully" },
  "requestId": "9f545704-6825-4075-85e3-5dc238eaea73"
}
```
