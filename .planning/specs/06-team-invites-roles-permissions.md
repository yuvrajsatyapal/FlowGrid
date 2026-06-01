# Spec: Feature #6 — Team Invites, Roles & Permissions

**Created**: 2026-06-01
**Status**: draft
**Author**: Yuvraj Satyapal
**Epic**: FlowGrid SaaS (`flowgrid-saas.md`)

---

## Problem

FlowGrid workspaces currently have no invite mechanism — there is no way for an owner to bring
specific teammates in with controlled access. All workspace members share the same implicit role
(effectively ADMIN). This means:

- Teams can't onboard colleagues without them finding the workspace themselves.
- There's no permission boundary between managers (who configure boards) and read-only
  stakeholders (executives, clients).
- Owners can't revoke or adjust access as team composition changes.

---

## Goal

Ship a complete workspace membership lifecycle: invite by email → join with a predefined role →
owner/admin can change roles or revoke access at any time.

Success: a workspace owner sends an email invite, the recipient clicks the link, authenticates via
Google, gets added as the specified role, and can immediately access the workspace with correct
permissions enforced throughout the app.

---

## User Stories

1. **As a workspace Owner/Admin**, I want to invite a teammate by email with a specific role
   (Admin/Member/Viewer) so they can join without needing to find or configure anything themselves.
2. **As a workspace Owner/Admin**, I want to change a member's role or revoke their access so
   I can manage permissions as the team evolves.
3. **As a team member**, I want to receive an email invite with a direct join link so I can
   access the workspace without manual setup or needing a workspace ID.

---

## Requirements

### Must-Have

- Invite by email with role selection (Admin, Member, Viewer)
- Email delivery via **Resend API**
- Invite token: `crypto.randomBytes(32).toString('hex')`, stored in DB, expires in **7 days**
- Invite acceptance: authenticated user's Google email must exactly match invite email
- Unauthenticated invite click: redirect to Google OAuth → return to accept page post-auth
- Role management: change any member's role, remove member from workspace
- Resend invite: invalidates old token, issues new one, resets expiry to 7 days from now
- Revoke pending invite: marks token invalid before acceptance
- **VIEWER role**: read-only — cannot create/edit/delete boards, lists, cards, comments
- **Last owner protection**: workspace must always have ≥1 OWNER; last owner cannot demote
  themselves, leave, or be removed
- **VIEWER enforcement**: all existing write routes must reject requests from VIEWER-role members

### Nice-to-Have

- Pending invites list in workspace settings (with resend/revoke per row)
- Role badge on member list
- Email template with workspace name, inviter name, and expiry date

### Out of Scope

- Per-board role overrides (private boards continue using existing BoardMember access check)
- Bulk invites (multi-email or CSV)
- Public invite links (workspace-wide shareable URL)
- Ownership transfer UI (last-owner protection exists, but no "transfer to X" flow)

---

## Data Model

### Schema Changes

**1. Update Role enum — add VIEWER:**

```prisma
enum Role {
  OWNER
  ADMIN
  MEMBER
  VIEWER  // ← NEW
}
```

**2. New InviteStatus enum + WorkspaceInvite model:**

```prisma
enum InviteStatus {
  PENDING
  ACCEPTED
  REVOKED
  EXPIRED
}

model WorkspaceInvite {
  id          String       @id @default(cuid())
  workspaceId String
  email       String
  role        Role         // ADMIN | MEMBER | VIEWER only; OWNER not assignable via invite
  token       String       @unique
  invitedById String
  status      InviteStatus @default(PENDING)
  expiresAt   DateTime     @db.Timestamptz()
  createdAt   DateTime     @default(now()) @db.Timestamptz()
  updatedAt   DateTime     @updatedAt @db.Timestamptz()

  workspace Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  invitedBy User      @relation("SentInvites", fields: [invitedById], references: [id])

  @@unique([workspaceId, email])  // one invite record per email per workspace; upsert on resend
  @@index([token])
  @@index([workspaceId])
}
```

**Notes:**

- `@@unique([workspaceId, email])` forces one record per email per workspace. Resend uses upsert
  (reset `token` + `expiresAt` + `status = PENDING` on existing row). Re-inviting a previously
  removed member also uses upsert.
- OWNER role is not assignable via invite — only via a future ownership-transfer feature.
- Migration: `prisma migrate deploy` against Neon (never `migrate dev`).
- `WorkspaceInvite` does not use soft delete — status field is the lifecycle tracker.

---

## API Changes

All endpoints follow project convention: mutations = POST, no path params (`?id=` only),
JSON bodies, `snake_case` on wire.

### New Endpoints

```
POST /api/invites                       create or upsert invite (OWNER/ADMIN only)
POST /api/invites/accept?token=         accept invite (authenticated user)
POST /api/invites/resend?id=            resend — new token, reset expiry
POST /api/invites/revoke?id=            revoke pending invite
GET  /api/invites?workspaceId=          list pending invites (OWNER/ADMIN only)
```

### Updated Endpoints

```
GET  /api/workspaces/members?workspaceId=      existing — add `role` field to each member
POST /api/workspaces/members/update?memberId=  NEW — change role
POST /api/workspaces/members/remove?memberId=  NEW — remove member
```

### Request / Response Examples

**POST /api/invites**
```json
// Request
{ "workspace_id": "cuid", "email": "jane@example.com", "role": "member" }

// 200 — created or upserted
{
  "id": "cuid",
  "email": "jane@example.com",
  "role": "member",
  "status": "pending",
  "expires_at": "2026-06-08T10:00:00Z"
}

// 409 — already a member
{ "error": { "code": "ALREADY_MEMBER", "message": "jane@example.com is already a workspace member." } }

// 403 — admin tried to invite owner
{ "error": { "code": "FORBIDDEN", "message": "You cannot invite a role higher than your own." } }
```

**POST /api/invites/accept?token=xxx**
```json
// 200
{ "workspace_id": "cuid", "workspace_name": "Acme Co", "role": "member" }

// 410 — expired, revoked, or workspace deleted
{ "error": { "code": "INVITE_INVALID", "message": "This invite is no longer valid." } }

// 410 — token expired specifically
{ "error": { "code": "INVITE_EXPIRED", "message": "Invite expired. Ask the workspace owner to resend." } }

// 403 — google email mismatch
{ "error": { "code": "EMAIL_MISMATCH", "message": "This invite was sent to a different email address." } }
```

**POST /api/workspaces/members/update?memberId=xxx**
```json
// Request
{ "role": "viewer" }

// 200 — updated member
{ "id": "cuid", "user_id": "cuid", "role": "viewer", "user": { "id", "name", "email", "avatar_url" } }

// 403 — last owner
{ "error": { "code": "LAST_OWNER", "message": "Workspace must have at least one owner." } }
```

**POST /api/workspaces/members/remove?memberId=xxx**
```json
// 200
{ "success": true }

// 403 — last owner
{ "error": { "code": "LAST_OWNER", "message": "Workspace must have at least one owner." } }
```

### Auth / Permission Matrix

| Action                              | OWNER | ADMIN          | MEMBER | VIEWER |
|-------------------------------------|-------|----------------|--------|--------|
| Send invite                         | ✓     | ✓ (≤ ADMIN)   | ✗      | ✗      |
| Resend / revoke invite              | ✓     | ✓              | ✗      | ✗      |
| List pending invites                | ✓     | ✓              | ✗      | ✗      |
| Change member role                  | ✓     | ✓ (≠ OWNER)   | ✗      | ✗      |
| Remove member                       | ✓     | ✓ (≠ OWNER)   | ✗      | ✗      |
| Create / edit boards, lists, cards  | ✓     | ✓              | ✓      | ✗      |
| View boards, lists, cards           | ✓     | ✓              | ✓      | ✓      |

---

## Frontend Changes

### New Files

**1. `apps/web/src/pages/WorkspaceSettingsPage.tsx`** — route: `/workspaces/settings?id=<workspaceId>`

- Two tabs: **Members** and **Invites**
- **Members tab**: table of current members (avatar, name, email, role badge, change-role dropdown,
  remove button). Last-owner row: dropdown + remove button disabled with tooltip.
- **Invites tab**: email input + role selector + "Send Invite" button; table of pending invites
  (email, role, expiry date, resend/revoke actions).
- Accessible to OWNER and ADMIN only; MEMBER/VIEWER redirected to workspace home.

**2. `apps/web/src/pages/InviteAcceptPage.tsx`** — route: `/invite/accept`

- Reads `?token=` from URL on mount.
- If not authenticated: saves `?next=/invite/accept?token=xxx` to `sessionStorage`, redirects to
  `/api/auth/google`.
- If authenticated: calls `POST /api/invites/accept?token=`, shows success card (workspace name,
  assigned role, "Go to workspace" button) or one of: expired / revoked / email-mismatch error
  states.

**3. `apps/web/src/api/invites.ts`** — API client

```typescript
invitesApi.create(workspaceId: string, email: string, role: Role): Promise<WorkspaceInvite>
invitesApi.accept(token: string): Promise<{ workspaceId: string; workspaceName: string; role: Role }>
invitesApi.resend(inviteId: string): Promise<WorkspaceInvite>
invitesApi.revoke(inviteId: string): Promise<void>
invitesApi.list(workspaceId: string): Promise<WorkspaceInvite[]>
```

### Updated Files

**4. `apps/web/src/api/workspaces.ts`** — add:

```typescript
workspacesApi.updateMember(memberId: string, role: Role): Promise<WorkspaceMember>
workspacesApi.removeMember(memberId: string): Promise<void>
```

**5. `apps/web/src/components/layout/AppLayout.tsx` (or sidebar)** — add "Settings" link/icon
per workspace that routes to `WorkspaceSettingsPage`.

**6. `packages/types/src/index.ts`** — add:

```typescript
export type Role = 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER'
export type InviteStatus = 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED'

export interface WorkspaceInvite {
  id: string; workspaceId: string; email: string; role: Role
  status: InviteStatus; expiresAt: string; createdAt: string
}

export interface WorkspaceMemberResponse {
  id: string; userId: string; workspaceId: string; role: Role
  user: { id: string; name: string; email: string; avatarUrl: string | null }
}
```

### VIEWER Enforcement on Existing Routes

Add a `requireMinRole(minRole: Role)` helper in `apps/api/src/middleware/auth.ts` that checks
`member.role` against the hierarchy `OWNER > ADMIN > MEMBER > VIEWER`.

Routes that must reject VIEWER (currently unenforced):

```
POST /api/boards, /api/boards/update, /api/boards/delete
POST /api/lists, /api/lists/update, /api/lists/reorder, /api/lists/delete
POST /api/cards, /api/cards/update, /api/cards/move, /api/cards/reorder, /api/cards/delete
POST /api/cards/labels/add, /api/cards/labels/remove
POST /api/labels
POST /api/comments, /api/comments/update, /api/comments/delete
```

### OAuth `?next=` Flow

Update `GET /api/auth/google` to accept a `next` query param, embed it in the Passport.js OAuth
`state` string. In the callback handler, read `state.next` and redirect to it after issuing
tokens. Validate `next` is same-origin before redirecting (prevent open redirect).

---

## Edge Cases

1. **Invite to existing member** → 409 `ALREADY_MEMBER`. Check by joining `WorkspaceMember → User`
   on email before creating invite.
2. **Expired invite clicked** → 410 `INVITE_EXPIRED` with "Invite expired. Ask the workspace
   owner to resend." Check `expiresAt < now() || status !== PENDING`.
3. **Unregistered Google email** → User signs up/in via Google, but `user.email !== invite.email`
   → 403 `EMAIL_MISMATCH`.
4. **Last owner protection** → Before role change or removal, count OWNERs in workspace; if 1
   and action would remove/demote that owner → 403 `LAST_OWNER`.
5. **Resend invalidates old token** → Upsert updates `token` field; old token no longer exists
   in DB — any attempt to accept it returns 404/410.
6. **Duplicate pending invite** → `@@unique([workspaceId, email])` forces upsert. `POST /api/invites`
   always does `upsert({ where: { workspaceId_email }, create: {...}, update: { token, expiresAt, status: PENDING } })`.
7. **Admin invites OWNER** → 403 `FORBIDDEN` before creating record. Rule: inviter cannot assign
   a role higher than their own. ADMIN can assign ADMIN, MEMBER, VIEWER.
8. **Workspace deleted or invite revoked before accept** → status check at accept time:
   `status !== PENDING` or `workspace.deletedAt !== null` → 410 `INVITE_INVALID`.
9. **Unauthenticated accept — open redirect guard** → `next` param must pass `new URL(next).origin
   === APP_URL` check in the OAuth callback before redirect.
10. **Previously accepted invite re-used** → `status === ACCEPTED` at accept time → 410
    `INVITE_INVALID` (not a duplicate member case; token already spent).

---

## Testing Criteria

### Happy Path

- [ ] Owner sends invite → Resend API called → invite record created, status=PENDING, 7-day expiry
- [ ] Unauthenticated invitee: clicks link → Google OAuth → redirected back → accept called →
      WorkspaceMember created with correct role → redirect to workspace
- [ ] Authenticated invitee: clicks link → accept page → calls accept → success redirect
- [ ] Owner sees new member in settings with correct role badge
- [ ] VIEWER member: attempts `POST /api/cards` → receives 403
- [ ] MEMBER member: creates card, leaves comment — both succeed
- [ ] Owner resends invite → new token works → old token rejected
- [ ] Owner revokes invite → token rejected on accept with `INVITE_INVALID`
- [ ] Admin changes member MEMBER → VIEWER → member loses write access on next request
- [ ] Owner removes member → member gets 403 on next workspace request

### Edge Case Tests

- [ ] Invite already-member email → 409
- [ ] Accept expired token → 410 expiry message
- [ ] Accept with mismatched Google email → 403
- [ ] Last owner demotes self → 403
- [ ] Admin invites OWNER role → 403
- [ ] Second invite to same email before acceptance → upsert (same row, new token)
- [ ] Accept revoked invite → 410 invalid message
- [ ] Accept already-accepted token a second time → 410 invalid message

---

## Dependencies

- `resend` npm package — `pnpm add resend --filter api`
- `RESEND_API_KEY` env var — add to `apps/api/.env` and document in `.env.example`
- `APP_URL` env var — e.g. `http://localhost:5173` in dev; used to build invite link in email
- Prisma schema migration: add VIEWER to Role enum + InviteStatus enum + WorkspaceInvite model
- `prisma migrate deploy` against Neon (never `migrate dev`)
- New route files: `apps/api/src/routes/invites.ts`, `workspaces-members.ts` (or extend existing)
- Update `apps/api/src/index.ts` to mount new routes
