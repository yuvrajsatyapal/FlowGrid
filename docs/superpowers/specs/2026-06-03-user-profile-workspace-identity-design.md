# User Profile & Workspace Identity — Design Spec

**Date:** 2026-06-03  
**Status:** Approved  
**Scope:** Two new features added to FlowGrid's settings surface

---

## Overview

Two features that give users and workspaces a real identity:

1. **User Profile page** — edit display name and upload a profile photo  
2. **Workspace Identity** — upload a workspace logo and pick an accent color for the badge

Both use the existing R2 storage provider (already wired up for card attachments).

---

## Feature 1: User Profile Page

### Route
`/:workspaceId/profile` — lives inside `AppLayout` so the sidebar stays visible. Consistent with the existing `/:workspaceId/settings` and `/:workspaceId/members` pattern.

### Access
The user's name/avatar row at the bottom of the sidebar becomes a clickable link to this page.

### Page content
- **Avatar upload**: 56px circle, click to open file picker. Accepts PNG/JPG, max 2 MB. Uploaded to R2 via `POST /api/users/avatar`. A "Remove" button reverts to the generated initials fallback.
- **Display name**: text input, editable, saved via `POST /api/users/update`.
- **Email**: read-only field with a "Signed in with Google — email can't be changed here" hint. No password change (Google OAuth only).
- **Save changes** button. Shows inline success/error feedback.

### Backend — new endpoints

#### `POST /api/users/avatar`
- Auth: JWT required
- Body: `multipart/form-data` with `file` field
- Validates: image MIME type, max 2 MB
- Uploads to R2 at key `user/{userId}/avatar`
- Deletes old avatar from R2 if one existed
- Updates `User.avatarUrl` in DB
- Returns `{ user: { id, avatarUrl } }`

#### `POST /api/users/update`
- Auth: JWT required
- Body: `{ name: string }`
- Validates: name 1–100 chars, trimmed
- Updates `User.name` in DB
- Returns `{ user: { id, name } }`

### Frontend — files changed
| File | Change |
|---|---|
| `src/App.tsx` | Add `/:workspaceId/profile` route inside AppLayout |
| `src/pages/ProfilePage.tsx` | New page component |
| `src/api/users.ts` | New — `updateName()` and `uploadAvatar()` |
| `src/components/layout/AppLayout.tsx` | User row at bottom-left becomes `<Link to="profile">` |
| `src/contexts/AuthContext.tsx` | After save, refresh `user.name` and `user.avatarUrl` in context |

### Schema
`User.avatarUrl String?` already exists. `User.name String?` already exists. **No migration needed.**

---

## Feature 2: Workspace Identity

### Location
New **Identity** section added to `WorkspaceSettingsPage.tsx`, positioned above the existing General section. OWNER/ADMIN only (same gate as General).

### Section content
- **Workspace logo**: 52px rounded-square badge, click to upload. Same R2 pattern. Stored at key `workspace/{workspaceId}/logo`. "Remove" button reverts to color + initials fallback.
- **Workspace color**: 8 preset gradient swatches (Blue, Teal, Purple, Orange, Pink, Yellow, Slate, Red). Selecting one highlights it. Saved together with logo via the existing `POST /api/workspaces/update` endpoint (extended).
- Logo takes precedence over color in the badge. Color is only shown as the badge background when no logo is set.

### Color values (stored as string token)
| Token | Gradient |
|---|---|
| `blue` | `#3b82f6 → #2563eb` |
| `teal` | `#10b981 → #06b6d4` |
| `purple` | `#8b5cf6 → #6366f1` |
| `orange` | `#f97316 → #ef4444` |
| `pink` | `#ec4899 → #8b5cf6` |
| `yellow` | `#f59e0b → #eab308` |
| `slate` | `#64748b → #475569` |
| `red` | `#ef4444 → #b91c1c` |

Default color when none selected: `blue`.

### Backend — new endpoint + schema change

#### DB migration
Add two nullable columns to `Workspace`:
```sql
ALTER TABLE "Workspace" ADD COLUMN "logoUrl" TEXT;
ALTER TABLE "Workspace" ADD COLUMN "color"   TEXT DEFAULT 'blue';
```

#### `POST /api/workspaces/logo`
- Auth: JWT required, OWNER/ADMIN only
- Body: `multipart/form-data` with `file` field
- Validates: image MIME type, max 2 MB
- Uploads to R2 at key `workspace/{workspaceId}/logo`
- Deletes old logo if one existed
- Updates `Workspace.logoUrl`
- Returns `{ workspace: { id, logoUrl } }`

#### `POST /api/workspaces/update` (extended)
- Existing endpoint gains two optional fields: `color?: string`, `logoUrl?: null` (setting `logoUrl: null` removes logo without upload)
- Validates `color` is one of the 8 known tokens if provided

### Frontend — files changed
| File | Change |
|---|---|
| `src/pages/WorkspaceSettingsPage.tsx` | Add Identity section above General |
| `src/api/workspaces.ts` | Add `uploadLogo()`, extend `update()` with `color`/`logoUrl` |
| `src/stores/workspaceStore.ts` | Add `logoUrl` and `color` to `WorkspaceSummary` |
| `src/components/layout/WorkspaceSwitcher.tsx` | Show logo img if set, else color gradient + initials |

---

## Shared: Avatar upload component

Both features use the same upload pattern. A small reusable helper `useAvatarUpload(uploadFn)` hook handles:
- Opening a hidden `<input type="file">` on click
- Validating file type + size client-side before upload
- Showing upload progress state
- Calling the provided `uploadFn` with the selected file

---

## What's explicitly out of scope
- Password / email change (Google OAuth only)
- Per-workspace sidebar accent theming (color is badge-only)
- Workspace URL slug rename
- Crop/resize UI (server accepts and stores as-is)
- Bio / timezone fields

---

## File checklist
- [ ] `apps/api/prisma/migrations/20260603000000_add_workspace_identity/migration.sql`
- [ ] `apps/api/src/routes/users.ts` — new file
- [ ] `apps/api/src/routes/workspaces.ts` — extend update + add logo endpoint
- [ ] `apps/web/src/pages/ProfilePage.tsx` — new file
- [ ] `apps/web/src/api/users.ts` — new file
- [ ] `apps/web/src/App.tsx` — add route
- [ ] `apps/web/src/components/layout/AppLayout.tsx` — link user row
- [ ] `apps/web/src/contexts/AuthContext.tsx` — refresh after profile save
- [ ] `apps/web/src/pages/WorkspaceSettingsPage.tsx` — identity section
- [ ] `apps/web/src/api/workspaces.ts` — extend
- [ ] `apps/web/src/stores/workspaceStore.ts` — extend
- [ ] `apps/web/src/components/layout/WorkspaceSwitcher.tsx` — logo/color support
