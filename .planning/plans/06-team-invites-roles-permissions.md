# Plan: Feature #6 — Team Invites, Roles & Permissions

**Spec**: `.planning/specs/06-team-invites-roles-permissions.md`
**Epic**: FlowGrid SaaS (`flowgrid-saas.md`)
**Created**: 2026-06-01
**Status**: draft

---

## Stack

Full-stack — Node.js/Express/Prisma backend + React/Vite frontend.
Order: Database → Backend Utilities → Backend API → Frontend Types/Clients → Frontend Pages.

---

## Architecture

### Components Table

| Component | Type | Purpose |
|-----------|------|---------|
| `WorkspaceInvite` Prisma model | Database | Stores invite token, role, status, expiry per email+workspace |
| `roles.ts` | Utility lib | Role hierarchy, `canWrite(role)`, `roleAtLeast(role, min)` helpers |
| `email.ts` | Utility lib | Resend client, `sendInviteEmail()` — constructs + sends invite email |
| `invites.ts` router | API route | POST /, GET /, POST /accept, POST /resend, POST /revoke |
| `workspaces.ts` router (extended) | API route | POST /members/update, POST /members/remove |
| `invites.ts` API client | Frontend | create, accept, resend, revoke, list invite calls |
| `InviteAcceptPage` | Page | Handles `/invite/accept?token=` — authenticated accept flow |
| `WorkspaceMembersPage` | Page | `/:workspaceId/members` — member list + invite management |

### New Files

| File | Location | Purpose |
|------|----------|---------|
| `migration.sql` | `apps/api/prisma/migrations/20260601000000_add_workspace_invites/` | DB migration |
| `roles.ts` | `apps/api/src/lib/` | Role hierarchy utility |
| `email.ts` | `apps/api/src/lib/` | Resend email client + sendInviteEmail() |
| `invites.ts` | `apps/api/src/routes/` | All invite endpoints |
| `invites.ts` | `apps/web/src/api/` | Frontend invite API client |
| `InviteAcceptPage.tsx` | `apps/web/src/pages/` | Accept invite flow page |
| `WorkspaceMembersPage.tsx` | `apps/web/src/pages/` | Members list + invite management page |

### Files to Change

| File | What Changes | Why |
|------|-------------|-----|
| `apps/api/prisma/schema.prisma` | Add `InviteStatus` enum + `WorkspaceInvite` model | DB schema for invites |
| `apps/api/src/config/env.ts` | Add `RESEND_API_KEY`, `APP_URL` to env schema | Required for email + invite links |
| `apps/api/src/routes/cards.ts` | `resolveListAccess` write check: `!OWNER&&!ADMIN` → `VIEWER` | Allow MEMBER to write content |
| `apps/api/src/routes/lists.ts` | Same write check fix | Allow MEMBER to write lists |
| `apps/api/src/routes/boards.ts` | Same write check fix | Allow MEMBER to write boards |
| `apps/api/src/routes/comments.ts` | Same write check fix | Allow MEMBER to write comments |
| `apps/api/src/routes/labels.ts` | Same write check fix | Allow MEMBER to write labels |
| `apps/api/src/routes/workspaces.ts` | Add /members/update + /members/remove endpoints | Member role/remove management |
| `apps/api/src/index.ts` | Mount `invitesRouter` | Register invite routes |
| `packages/types/src/index.ts` | Add `WorkspaceInvite`, `WorkspaceMemberResponse`, `InviteStatus` | Shared types for FE |
| `apps/web/src/api/workspaces.ts` | Add `updateMember`, `removeMember` methods | FE member management |
| `apps/web/src/App.tsx` | Add `/invite/accept` + `/:workspaceId/members` routes | Wire new pages |
| `apps/web/src/pages/AuthCallbackPage.tsx` | Read `sessionStorage.next` after auth, redirect there | Unauthenticated invite flow |

---

## Task Breakdown

### Phase 1: Database (run first — blocks everything)

| # | Task | Files | What to verify |
|---|------|-------|---------------|
| 1 | Write schema changes: `InviteStatus` enum + `WorkspaceInvite` model with `@@unique([workspaceId, email])`. Create migration SQL file manually. Run `cd apps/api && pnpm prisma migrate deploy` | `schema.prisma`, `migrations/.../migration.sql` | `prisma migrate status` shows migration applied; `WorkspaceInvite` table exists in Neon |
| 2 | Add `RESEND_API_KEY` (required) + `APP_URL` (optional, default `http://localhost:5173`) to `env.ts` schema. Add to `apps/api/.env`. Install resend: `pnpm add resend --filter api` | `env.ts`, `apps/api/package.json` | API server starts without env validation errors |

### Phase 2: Backend Utilities (parallel — both independent)

| # | Task | Files | What to verify |
|---|------|-------|---------------|
| 3 | Create `lib/roles.ts`: role order array `['VIEWER','MEMBER','ADMIN','OWNER']`, `canWrite(role)` → `role !== 'VIEWER'`, `roleAtLeast(role, min)` → compares index, `isOwnerOrAdmin(role)` → shorthand | `apps/api/src/lib/roles.ts` | Unit: canWrite('MEMBER') = true, canWrite('VIEWER') = false, roleAtLeast('ADMIN','MEMBER') = true |
| 4 | Create `lib/email.ts`: import `Resend` from `'resend'`, init client, export `sendInviteEmail({ to, inviterName, workspaceName, role, inviteUrl })` — builds text + HTML body, calls `resend.emails.send()`, logs warning on failure (never throws) | `apps/api/src/lib/email.ts` | Type-checks; no runtime error when called with valid args |

### Phase 3: Backend API (sequential — depends on Phase 2)

| # | Task | Files | What to verify |
|---|------|-------|---------------|
| 5 | VIEWER enforcement part 1: in `cards.ts` change `resolveListAccess` write check from `role !== 'OWNER' && role !== 'ADMIN'` to `!canWrite(role)`. Same fix in `lists.ts` `resolveListAccess`. Same fix in `boards.ts` POST create + update write check. | `cards.ts`, `lists.ts`, `boards.ts` | MEMBER can now create cards/lists/boards; VIEWER still gets 403 |
| 6 | VIEWER enforcement part 2: `comments.ts` — fix write check in `resolveCardAccess`. `labels.ts` — fix write check. | `comments.ts`, `labels.ts` | MEMBER can create comments/labels; VIEWER gets 403 |
| 7 | Create `routes/invites.ts`: five endpoints. Use `crypto.randomBytes(32).toString('hex')` for token. Upsert pattern on create with `prisma.workspaceInvite.upsert`. Check ALREADY_MEMBER before upsert (join WorkspaceMember→User on email). Last-owner check on remove. 7-day expiry: `new Date(Date.now() + 7*24*60*60*1000)`. Call `sendInviteEmail()` after create/resend (fire-and-forget: `void sendInviteEmail(...)`). Endpoints: `POST /`, `GET /`, `POST /accept?token=`, `POST /resend?id=`, `POST /revoke?id=` | `apps/api/src/routes/invites.ts` | All 5 endpoints respond correctly; tsc passes |
| 8 | Extend `workspaces.ts`: add `POST /members/update?memberId=` (role change, last-owner guard) + `POST /members/remove?memberId=` (remove member, last-owner guard). Mount `invitesRouter` in `index.ts` at `/api/invites`. | `workspaces.ts`, `index.ts` | Endpoints accessible; last-owner returns 403 |

### Phase 4: Frontend Types + API Clients (parallel — independent of each other, depends on Phase 3)

| # | Task | Files | What to verify |
|---|------|-------|---------------|
| 9 | Add to `packages/types/src/index.ts`: `InviteStatus` type union, `WorkspaceInvite` interface, `WorkspaceMemberResponse` interface (with nested `user` object). `Role` already has VIEWER — no change needed. | `packages/types/src/index.ts` | Types exported correctly, no TS errors |
| 10 | Create `apps/web/src/api/invites.ts`: five methods matching spec. All requests/responses go through `keysToSnake` / `keysToCamel` pattern (or use `api` axios instance which handles it). Error message extraction: `(err as Error).message` (axiosInstance pre-wraps). | `apps/web/src/api/invites.ts` | Type-checks; no TS errors |
| 11 | Add `updateMember(memberId, role)` + `removeMember(memberId)` to `workspacesApi` in `workspaces.ts`. | `apps/web/src/api/workspaces.ts` | Type-checks; no TS errors |

### Phase 5: Frontend Pages (sequential — depends on Phase 4)

| # | Task | Files | What to verify |
|---|------|-------|---------------|
| 12 | Create `InviteAcceptPage.tsx`: on mount, check auth. If not authenticated: save `window.location.href` to `sessionStorage.setItem('invite_next', ...)`, redirect to `/api/auth/google`. If authenticated: call `invitesApi.accept(token)`, show success card (workspace name, role, "Go to workspace" button) or error state (expired/revoked/email-mismatch). All error states map to spec edge cases 2, 3, 8, 10. | `apps/web/src/pages/InviteAcceptPage.tsx` | Renders all 5 states: loading, success, expired, invalid, email-mismatch |
| 13 | Create `WorkspaceMembersPage.tsx` at `/:workspaceId/members`: two sections — (A) Current Members: fetch `workspacesApi.listMembers()`, show table with role badge, change-role dropdown (OWNER/ADMIN only, last-owner row disabled), remove button. (B) Invites: email input + role select + "Invite" button; pending invite list with resend/revoke. Only OWNER/ADMIN see management controls; MEMBER/VIEWER see read-only member list. | `apps/web/src/pages/WorkspaceMembersPage.tsx` | Renders members list; OWNER sees controls; VIEWER sees read-only |
| 14 | Wire everything: (a) `App.tsx` — add `/invite/accept` route (public, no ProtectedRoute) + `/:workspaceId/members` route inside AppLayout. (b) `AuthCallbackPage.tsx` — after `setTokenAndUser`, check `sessionStorage.getItem('invite_next')`, if present `sessionStorage.removeItem('invite_next')` + navigate there, else navigate to dashboard/onboarding as before. | `App.tsx`, `AuthCallbackPage.tsx` | Unauthenticated invite flow works end-to-end; members route navigable from sidebar |

---

## Parallel vs Sequential

| Parallel Group | Tasks | Why |
|----------------|-------|-----|
| Phase 2 | 3, 4 | roles.ts and email.ts are independent files |
| Phase 4 | 9, 10, 11 | types, invites client, workspaces client are independent |

| Sequential | Depends On | Why |
|-----------|-----------|-----|
| Phase 2 (3, 4) | Phase 1 complete | roles.ts imports from env.ts; email.ts uses env.RESEND_API_KEY |
| Task 5 | Task 3 | canWrite() from roles.ts used in route changes |
| Task 6 | Task 3 | canWrite() from roles.ts |
| Task 7 | Tasks 3, 4 | invites.ts uses canWrite() + sendInviteEmail() |
| Task 8 | Tasks 7 | Mounts invites router; extends workspaces.ts |
| Phase 4 | Phase 3 | Frontend types reflect finalized API shapes |
| Tasks 12, 13 | Phase 4 | Pages import from api clients + types |
| Task 14 | Tasks 12, 13 | Wires pages that now exist |

---

## Testing Plan

### Data Layer
- `WorkspaceInvite` upsert: create → create again same email → single row, token updated
- `WorkspaceInvite` accept: status transitions PENDING → ACCEPTED; VIEWER becomes WorkspaceMember
- Last-owner query: count OWNER members before demote/remove

### Business Logic
- `canWrite('MEMBER')` → true; `canWrite('VIEWER')` → false
- `roleAtLeast('ADMIN', 'MEMBER')` → true; `roleAtLeast('VIEWER', 'MEMBER')` → false
- Invite create: existing member → 409; new email → 200 + email sent
- Invite accept: expired token → 410; wrong email → 403; valid → 200 + WorkspaceMember created
- Resend: old token rejected after resend; new token accepted
- Last owner: remove/demote self → 403

### API / Integration
Each spec edge case maps to an endpoint test:
| EC | Endpoint | Expected |
|----|----------|---------|
| 1 | POST /invites | 409 ALREADY_MEMBER |
| 2 | POST /invites/accept (expired) | 410 INVITE_EXPIRED |
| 3 | POST /invites/accept (wrong email) | 403 EMAIL_MISMATCH |
| 4 | POST /workspaces/members/update (last owner) | 403 LAST_OWNER |
| 5 | POST /invites/accept (old token after resend) | 410 INVITE_INVALID |
| 6 | POST /invites (duplicate) | 200, upserted record |
| 7 | POST /invites (admin→owner role) | 403 FORBIDDEN |
| 8 | POST /invites/accept (revoked) | 410 INVITE_INVALID |
| 9 | POST /invites/accept (accepted twice) | 410 INVITE_INVALID |

### UI
- `InviteAcceptPage`: renders loading → success → shows workspace name + role
- `InviteAcceptPage`: renders all error states (expired, invalid, mismatch)
- `WorkspaceMembersPage`: owner sees role dropdown + remove; viewer sees read-only
- `AuthCallbackPage`: if `invite_next` in sessionStorage → redirects there post-auth
- `WorkspaceMembersPage`: invite form — empty email blocked; invalid email rejected; duplicate invite shows success (upsert)

---

## Integration Point

Backend complete when:
- `tsc --noEmit` passes in `apps/api`
- `POST /api/invites` returns 200 and email is sent to Resend

Frontend picks up at Phase 4. Full flow tested manually:
1. Owner sends invite → email received → click link → Google OAuth → accept page → workspace loaded
2. VIEWER tries to create card → 403 returned and UI shows error

---

## Notes

- `VIEWER` is already in Prisma `Role` enum and `packages/types` — no change needed
- Migration must use `prisma migrate deploy` (not `prisma migrate dev`) due to Neon advisory lock
- `sendInviteEmail()` is fire-and-forget: `void sendInviteEmail(...)` — never await in route handlers. Failure is logged, not thrown (same pattern as `logActivity`)
- The `/@`next=` OAuth flow is handled entirely on the frontend via `sessionStorage` — no backend passport changes needed
- `APP_URL` defaults to `http://localhost:5173` in dev; must be set in production
