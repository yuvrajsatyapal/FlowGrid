# User Profile & Workspace Identity — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Profile page where users can update their name and upload a photo, and add an Identity section to Workspace Settings for a workspace logo and color badge.

**Architecture:** File uploads go to the existing R2/local storage provider via multer (same pattern as card attachments). The Profile page lives at `/:workspaceId/profile` inside AppLayout. Workspace identity fields (logoUrl, color) are added to the Workspace table and surfaced in the WorkspaceSwitcher badge.

**Tech Stack:** Express + multer + Prisma (backend), React + TypeScript (frontend), existing `storage` provider (`apps/api/src/lib/storage.ts`)

---

## File Map

**Backend — new/modified**
- `apps/api/prisma/migrations/20260603000000_add_workspace_identity/migration.sql` — new, adds `logoUrl` + `color` to Workspace
- `apps/api/src/routes/users.ts` — add `POST /api/users/avatar` upload endpoint
- `apps/api/src/routes/workspaces.ts` — extend `/update` with `color`/`logoUrl`; add `POST /api/workspaces/logo`; add `POST /api/workspaces/logo/remove`; include `logoUrl`+`color` in all workspace selects

**Frontend — new/modified**
- `apps/web/src/api/users.ts` — new, `updateName()` and `uploadAvatar()`
- `apps/web/src/api/workspaces.ts` — add `uploadLogo()`, `removeLogo()`, extend `update()` type
- `apps/web/src/stores/workspaceStore.ts` — add `logoUrl`/`color` to `WorkspaceSummary`
- `apps/web/src/contexts/AuthContext.tsx` — add `updateUser()` helper
- `apps/web/src/pages/ProfilePage.tsx` — new, full profile page
- `apps/web/src/pages/WorkspaceSettingsPage.tsx` — add Identity section
- `apps/web/src/components/layout/WorkspaceSwitcher.tsx` — use logoUrl/color in badge
- `apps/web/src/components/layout/AppLayout.tsx` — make user row a link to profile
- `apps/web/src/App.tsx` — add `/:workspaceId/profile` route

---

### Task 1: DB migration — add logoUrl and color to Workspace

**Files:**
- Create: `apps/api/prisma/migrations/20260603000000_add_workspace_identity/migration.sql`
- Modify: `apps/api/prisma/schema.prisma`

- [ ] **Step 1: Create migration SQL**

```sql
-- apps/api/prisma/migrations/20260603000000_add_workspace_identity/migration.sql
ALTER TABLE "Workspace" ADD COLUMN "logoUrl" TEXT;
ALTER TABLE "Workspace" ADD COLUMN "color"   TEXT NOT NULL DEFAULT 'blue';
```

- [ ] **Step 2: Update Prisma schema**

In `apps/api/prisma/schema.prisma`, add two fields to the `Workspace` model after `description`:

```prisma
  logoUrl       String?
  color         String    @default("blue")
```

- [ ] **Step 3: Apply migration and regenerate client**

```bash
cd apps/api
npx prisma migrate resolve --applied 20260603000000_add_workspace_identity
npx prisma generate
```

If the above fails (migration not applied yet), run:
```bash
npx prisma db push
npx prisma generate
```

Expected: `✔ Generated Prisma Client`

- [ ] **Step 4: Type-check**

```bash
cd apps/api && npx tsc --noEmit
```

Expected: no output (clean).

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/migrations/20260603000000_add_workspace_identity/migration.sql apps/api/prisma/schema.prisma apps/api/generated/
git commit -m "feat(db): add logoUrl and color columns to Workspace"
```

---

### Task 2: Backend — user avatar upload endpoint

**Files:**
- Modify: `apps/api/src/routes/users.ts`

The existing `PATCH /api/users/me` already handles updating `name` and `avatarUrl` as strings. We add a new `POST /api/users/avatar` that accepts a file upload, stores it, and updates `User.avatarUrl`.

- [ ] **Step 1: Add imports to users.ts**

At the top of `apps/api/src/routes/users.ts`, add:

```typescript
import crypto from "crypto"
import multer from "multer"
import { storage, keyFromUrl } from "../lib/storage"
import logger from "../lib/logger"
```

- [ ] **Step 2: Add multer instance and MIME allowlist below imports**

After the imports (before the `const router = Router()` line):

```typescript
const ALLOWED_IMAGE_MIMETYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif",
])

const MAX_AVATAR_SIZE = 2 * 1024 * 1024 // 2 MB

const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_AVATAR_SIZE },
})
```

- [ ] **Step 3: Add POST /api/users/avatar endpoint**

Add this after the existing `PATCH /me` route, before `export { router as usersRouter }`:

```typescript
// POST /api/users/avatar — upload or replace profile photo
router.post(
  "/avatar",
  validateJWT,
  (req, res, next) => {
    uploadMiddleware.single("file")(req, res, (err) => {
      if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
        res.status(400).json({ error: { message: "Avatar must be 2 MB or smaller", status: 400 } })
        return
      }
      if (err) {
        res.status(400).json({ error: { message: "File upload failed", status: 400 } })
        return
      }
      next()
    })
  },
  async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: { message: "file is required", status: 400 } })
      return
    }
    if (!ALLOWED_IMAGE_MIMETYPES.has(req.file.mimetype)) {
      res.status(400).json({ error: { message: "Only image files are allowed", status: 400 } })
      return
    }

    try {
      const userId = req.user!.id

      // Delete old avatar from storage if one exists
      const existing = await prisma.user.findUnique({
        where: { id: userId },
        select: { avatarUrl: true },
      })
      if (existing?.avatarUrl) {
        try {
          await storage.delete(keyFromUrl(existing.avatarUrl))
        } catch (err) {
          logger.warn("Failed to delete old avatar", { userId, error: err instanceof Error ? err.message : err })
        }
      }

      const ext = req.file.originalname.split(".").pop()?.toLowerCase() ?? "jpg"
      const key = `user/${userId}/avatar-${crypto.randomBytes(8).toString("hex")}.${ext}`
      const url = await storage.upload(key, req.file.buffer, req.file.mimetype)

      const updated = await prisma.user.update({
        where: { id: userId },
        data: { avatarUrl: url },
        select: { id: true, email: true, name: true, avatarUrl: true, onboardingCompleted: true },
      })

      res.json({ user: updated })
    } catch {
      res.status(500).json({ error: { message: "Failed to upload avatar", status: 500 } })
    }
  },
)

// POST /api/users/avatar/remove — delete profile photo and clear avatarUrl
router.post("/avatar/remove", validateJWT, async (req, res) => {
  try {
    const userId = req.user!.id
    const existing = await prisma.user.findUnique({
      where: { id: userId },
      select: { avatarUrl: true },
    })
    if (existing?.avatarUrl) {
      try {
        await storage.delete(keyFromUrl(existing.avatarUrl))
      } catch (err) {
        logger.warn("Failed to delete avatar from storage", { userId, error: err instanceof Error ? err.message : err })
      }
    }
    const updated = await prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: null },
      select: { id: true, email: true, name: true, avatarUrl: true, onboardingCompleted: true },
    })
    res.json({ user: updated })
  } catch {
    res.status(500).json({ error: { message: "Failed to remove avatar", status: 500 } })
  }
})
```

- [ ] **Step 4: Type-check**

```bash
cd apps/api && npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/users.ts
git commit -m "feat(api): add user avatar upload and remove endpoints"
```

---

### Task 3: Backend — workspace logo upload + color

**Files:**
- Modify: `apps/api/src/routes/workspaces.ts`

- [ ] **Step 1: Add imports to workspaces.ts**

At the top of `apps/api/src/routes/workspaces.ts`, add:

```typescript
import crypto from "crypto"
import multer from "multer"
import { storage, keyFromUrl } from "../lib/storage"
import logger from "../lib/logger"
```

- [ ] **Step 2: Add image upload constants after imports**

After the imports block:

```typescript
const ALLOWED_IMAGE_MIMETYPES = new Set([
  "image/jpeg", "image/png", "image/gif", "image/webp", "image/avif",
])
const MAX_LOGO_SIZE = 2 * 1024 * 1024

const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_LOGO_SIZE },
})

const VALID_COLORS = new Set([
  "blue", "teal", "purple", "orange", "pink", "yellow", "slate", "red",
])
```

- [ ] **Step 3: Extend POST /workspaces/update to accept color**

Find the existing `router.post("/update", ...)` handler. Change:
```typescript
  const { name, description } = req.body as { name?: string; description?: string }

  if (name === undefined && description === undefined) {
    res.status(400).json({ error: { message: "At least one of name or description is required", status: 400 } })
```
To:
```typescript
  const { name, description, color } = req.body as { name?: string; description?: string; color?: string }

  if (name === undefined && description === undefined && color === undefined) {
    res.status(400).json({ error: { message: "At least one field is required", status: 400 } })
```

Then add color validation after the existing `name` validation block, before the `try`:
```typescript
  if (color !== undefined && !VALID_COLORS.has(color)) {
    res.status(400).json({ error: { message: "color must be one of: blue, teal, purple, orange, pink, yellow, slate, red", status: 400 } })
    return
  }
```

Inside the `try`, find the `prisma.workspace.update` call and add `color` to the data:
```typescript
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(description !== undefined && { description: description === null ? null : description.trim() || null }),
        ...(color !== undefined && { color }),
      },
      select: { id: true, name: true, slug: true, description: true, organizationId: true, logoUrl: true, color: true },
```

- [ ] **Step 4: Add logoUrl + color to all workspace select shapes**

In `workspaces.ts`, every `select` that returns workspace fields to the frontend needs `logoUrl: true, color: true` added. Find and update these three selects:

**In the `GET /` list endpoint** (around line 98):
```typescript
select: { id: true, name: true, slug: true, organizationId: true, deletedAt: true, logoUrl: true, color: true },
```
And in the map that builds the response (around line 107):
```typescript
      logoUrl: m.workspace.logoUrl,
      color: m.workspace.color,
```

**In the `GET /one` endpoint** (around line 140):
```typescript
      select: { id: true, name: true, slug: true, description: true, organizationId: true, logoUrl: true, color: true, createdAt: true, deletedAt: true, ... }
```
And in the response object (around line 152):
```typescript
      logoUrl: workspace.logoUrl,
      color: workspace.color,
```

**In the `POST /update` return select** (just updated in Step 3 above) — already done.

- [ ] **Step 5: Add POST /workspaces/logo endpoint**

Add before `export { router as workspacesRouter }`:

```typescript
// POST /api/workspaces/logo — upload workspace logo (OWNER | ADMIN)
router.post(
  "/logo",
  validateJWT,
  (req, res, next) => {
    uploadMiddleware.single("file")(req, res, (err) => {
      if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
        res.status(400).json({ error: { message: "Logo must be 2 MB or smaller", status: 400 } })
        return
      }
      if (err) {
        res.status(400).json({ error: { message: "File upload failed", status: 400 } })
        return
      }
      next()
    })
  },
  async (req, res) => {
    const workspaceId = req.query.id as string | undefined
    if (!workspaceId) {
      res.status(400).json({ error: { message: "id is required", status: 400 } })
      return
    }
    if (!req.file) {
      res.status(400).json({ error: { message: "file is required", status: 400 } })
      return
    }
    if (!ALLOWED_IMAGE_MIMETYPES.has(req.file.mimetype)) {
      res.status(400).json({ error: { message: "Only image files are allowed", status: 400 } })
      return
    }

    try {
      const membership = await prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: req.user!.id } },
      })
      if (!membership || !isOwnerOrAdmin(membership.role)) {
        res.status(403).json({ error: { message: "Only owners and admins can update workspace logo", status: 403 } })
        return
      }

      const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId, deletedAt: null },
        select: { logoUrl: true },
      })
      if (!workspace) {
        res.status(404).json({ error: { message: "Workspace not found", status: 404 } })
        return
      }

      // Delete old logo if one exists
      if (workspace.logoUrl) {
        try {
          await storage.delete(keyFromUrl(workspace.logoUrl))
        } catch (err) {
          logger.warn("Failed to delete old workspace logo", { workspaceId, error: err instanceof Error ? err.message : err })
        }
      }

      const ext = req.file.originalname.split(".").pop()?.toLowerCase() ?? "jpg"
      const key = `workspace/${workspaceId}/logo-${crypto.randomBytes(8).toString("hex")}.${ext}`
      const url = await storage.upload(key, req.file.buffer, req.file.mimetype)

      const updated = await prisma.workspace.update({
        where: { id: workspaceId },
        data: { logoUrl: url },
        select: { id: true, name: true, slug: true, organizationId: true, logoUrl: true, color: true },
      })

      res.json({ workspace: updated })
    } catch {
      res.status(500).json({ error: { message: "Failed to upload logo", status: 500 } })
    }
  },
)

// POST /api/workspaces/logo/remove — delete logo and clear logoUrl (OWNER | ADMIN)
router.post("/logo/remove", validateJWT, async (req, res) => {
  const workspaceId = req.query.id as string | undefined
  if (!workspaceId) {
    res.status(400).json({ error: { message: "id is required", status: 400 } })
    return
  }
  try {
    const membership = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: req.user!.id } },
    })
    if (!membership || !isOwnerOrAdmin(membership.role)) {
      res.status(403).json({ error: { message: "Only owners and admins can update workspace logo", status: 403 } })
      return
    }
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId, deletedAt: null },
      select: { logoUrl: true },
    })
    if (!workspace) {
      res.status(404).json({ error: { message: "Workspace not found", status: 404 } })
      return
    }
    if (workspace.logoUrl) {
      try {
        await storage.delete(keyFromUrl(workspace.logoUrl))
      } catch (err) {
        logger.warn("Failed to delete workspace logo from storage", { workspaceId, error: err instanceof Error ? err.message : err })
      }
    }
    const updated = await prisma.workspace.update({
      where: { id: workspaceId },
      data: { logoUrl: null },
      select: { id: true, name: true, slug: true, organizationId: true, logoUrl: true, color: true },
    })
    res.json({ workspace: updated })
  } catch {
    res.status(500).json({ error: { message: "Failed to remove logo", status: 500 } })
  }
})
```

- [ ] **Step 6: Type-check**

```bash
cd apps/api && npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/workspaces.ts
git commit -m "feat(api): add workspace logo upload/remove and color update"
```

---

### Task 4: Frontend — extend types and AuthContext

**Files:**
- Modify: `apps/web/src/api/workspaces.ts`
- Modify: `apps/web/src/stores/workspaceStore.ts`
- Modify: `apps/web/src/contexts/AuthContext.tsx`

- [ ] **Step 1: Add logoUrl and color to WorkspaceSummary**

In `apps/web/src/api/workspaces.ts`, update `WorkspaceSummary`:

```typescript
export interface WorkspaceSummary {
  id: string
  name: string
  slug: string
  organizationId: string
  role?: Role
  logoUrl?: string | null
  color?: string
}
```

And update `UpdateWorkspaceRequest` to include `color`:

```typescript
interface UpdateWorkspaceRequest {
  name?: string
  description?: string | null
  color?: string
}
```

- [ ] **Step 2: Add uploadLogo and removeLogo to workspacesApi**

In `apps/web/src/api/workspaces.ts`, add these two methods to the `workspacesApi` object (after `deleteWorkspace`):

```typescript
  async uploadLogo(id: string, file: File): Promise<WorkspaceSummary> {
    const formData = new FormData()
    formData.append("file", file)
    const res = await api.post<{ workspace: WorkspaceSummary }>("/workspaces/logo", formData, {
      params: { id },
      headers: { "Content-Type": "multipart/form-data" },
    })
    return res.data.workspace
  },

  async removeLogo(id: string): Promise<WorkspaceSummary> {
    const res = await api.post<{ workspace: WorkspaceSummary }>("/workspaces/logo/remove", {}, { params: { id } })
    return res.data.workspace
  },
```

- [ ] **Step 3: Add updateUser to AuthContext**

In `apps/web/src/contexts/AuthContext.tsx`:

Add `updateUser` to the `AuthContextValue` interface:

```typescript
interface AuthContextValue extends AuthState {
  setTokenAndUser: (token: string, user: AuthUser) => void
  logout: () => Promise<void>
  refresh: () => Promise<void>
  updateUser: (patch: Partial<AuthUser>) => void
}
```

Inside `AuthProvider`, add the `updateUser` function after `logout`:

```typescript
  const updateUser = useCallback((patch: Partial<AuthUser>) => {
    setState((prev) =>
      prev.user ? { ...prev, user: { ...prev.user, ...patch } } : prev
    )
  }, [])
```

Add `updateUser` to the context value:

```typescript
  return (
    <AuthContext.Provider value={{ ...state, setTokenAndUser, logout, refresh, updateUser }}>
      {children}
    </AuthContext.Provider>
  )
```

- [ ] **Step 4: Type-check**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/api/workspaces.ts apps/web/src/stores/workspaceStore.ts apps/web/src/contexts/AuthContext.tsx
git commit -m "feat(frontend): extend workspace types with logoUrl/color, add updateUser to AuthContext"
```

---

### Task 5: Frontend API — users.ts

**Files:**
- Create: `apps/web/src/api/users.ts`

- [ ] **Step 1: Create users API file**

```typescript
// apps/web/src/api/users.ts
import { api } from "../lib/axiosInstance"
import type { AuthUser } from "./auth"

export const usersApi = {
  async updateName(name: string): Promise<AuthUser> {
    const res = await api.patch<{ user: AuthUser }>("/users/me", { name })
    return res.data.user
  },

  async uploadAvatar(file: File): Promise<AuthUser> {
    const formData = new FormData()
    formData.append("file", file)
    const res = await api.post<{ user: AuthUser }>("/users/avatar", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    })
    return res.data.user
  },

  async removeAvatar(): Promise<AuthUser> {
    const res = await api.post<{ user: AuthUser }>("/users/avatar/remove", {})
    return res.data.user
  },
}
```

Note: `PATCH /users/me` uses `api.patch` — the axiosInstance interceptor handles keysToSnake on the body. No conversion needed for the `name` field (single word).

- [ ] **Step 2: Type-check**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/api/users.ts
git commit -m "feat(frontend): add users API client (updateName, uploadAvatar, removeAvatar)"
```

---

### Task 6: Frontend — ProfilePage

**Files:**
- Create: `apps/web/src/pages/ProfilePage.tsx`

- [ ] **Step 1: Create ProfilePage component**

```typescript
// apps/web/src/pages/ProfilePage.tsx
import { useRef, useState } from "react"
import { useAuth } from "../contexts/AuthContext"
import { usersApi } from "../api/users"
import { getInitials, getAvatarBg } from "../utils/avatar"

const sectionCard: React.CSSProperties = {
  border: "1px solid oklch(var(--color-border))",
  borderRadius: "var(--radius-card)",
  background: "oklch(var(--color-paper-2))",
  overflow: "hidden",
}
const sectionHeader: React.CSSProperties = {
  padding: "16px 20px",
  borderBottom: "1px solid oklch(var(--color-border))",
}
const sectionBody: React.CSSProperties = { padding: "20px" }
const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  borderRadius: "var(--radius-input)",
  border: "1px solid oklch(var(--color-border))",
  background: "oklch(var(--color-paper))",
  color: "oklch(var(--color-ink))",
  fontSize: "var(--text-sm)",
  outline: "none",
  boxSizing: "border-box",
}
const primaryBtn: React.CSSProperties = {
  padding: "8px 18px",
  borderRadius: "var(--radius-button)",
  border: "none",
  background: "oklch(var(--color-accent))",
  color: "#fff",
  fontSize: "var(--text-sm)",
  fontWeight: 500,
  cursor: "pointer",
}
const ghostBtn: React.CSSProperties = {
  padding: "7px 14px",
  borderRadius: "var(--radius-button)",
  border: "1px solid oklch(var(--color-border))",
  background: "transparent",
  color: "oklch(var(--color-ink-2))",
  fontSize: "var(--text-sm)",
  cursor: "pointer",
}
const dangerGhostBtn: React.CSSProperties = {
  ...ghostBtn,
  borderColor: "oklch(var(--color-error) / 0.4)",
  color: "oklch(var(--color-error))",
}

export default function ProfilePage() {
  const { user, updateUser } = useAuth()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [name, setName] = useState(user?.name ?? "")
  const [nameFocused, setNameFocused] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState("")
  const [saveSuccess, setSaveSuccess] = useState(false)

  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState("")

  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    setSaving(true)
    setSaveError("")
    setSaveSuccess(false)
    try {
      const updated = await usersApi.updateName(trimmed)
      updateUser({ name: updated.name })
      setName(updated.name ?? "")
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 2500)
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } }
      setSaveError(axiosErr?.response?.data?.error?.message ?? "Failed to save changes")
    } finally {
      setSaving(false)
    }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    // Reset input so the same file can be re-selected after removal
    e.target.value = ""
    setUploading(true)
    setUploadError("")
    try {
      const updated = await usersApi.uploadAvatar(file)
      updateUser({ avatarUrl: updated.avatarUrl })
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } }
      setUploadError(axiosErr?.response?.data?.error?.message ?? "Failed to upload photo")
    } finally {
      setUploading(false)
    }
  }

  const handleRemoveAvatar = async () => {
    setUploading(true)
    setUploadError("")
    try {
      const updated = await usersApi.removeAvatar()
      updateUser({ avatarUrl: updated.avatarUrl })
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } }
      setUploadError(axiosErr?.response?.data?.error?.message ?? "Failed to remove photo")
    } finally {
      setUploading(false)
    }
  }

  const initials = getInitials(user?.name ?? user?.email ?? "?")
  const avatarBg = getAvatarBg(user?.id ?? "")

  return (
    <div
      style={{
        padding: "32px 36px",
        maxWidth: "560px",
        color: "oklch(var(--color-ink))",
        fontFamily: "var(--font-body)",
      }}
    >
      <div style={{ marginBottom: "28px" }}>
        <h1
          style={{
            margin: 0,
            fontSize: "var(--text-xl)",
            fontWeight: 600,
            letterSpacing: "-0.02em",
            fontFamily: "var(--font-display)",
          }}
        >
          Profile
        </h1>
        <p style={{ margin: "6px 0 0", fontSize: "var(--text-sm)", color: "oklch(var(--color-ink-2))" }}>
          {user?.email}
        </p>
      </div>

      <div style={sectionCard}>
        <div style={sectionHeader}>
          <h2 style={{ margin: 0, fontSize: "var(--text-sm)", fontWeight: 600 }}>Your profile</h2>
        </div>
        <div style={sectionBody}>
          {/* Avatar row */}
          <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "20px" }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: "50%",
                background: user?.avatarUrl ? "transparent" : avatarBg,
                flexShrink: 0,
                overflow: "hidden",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: uploading ? "default" : "pointer",
                opacity: uploading ? 0.6 : 1,
                border: "2px solid oklch(var(--color-border))",
              }}
              onClick={() => !uploading && fileInputRef.current?.click()}
              title="Click to change photo"
            >
              {user?.avatarUrl ? (
                <img src={user.avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <span style={{ fontSize: "18px", fontWeight: 700, color: "#fff" }}>{initials}</span>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  style={{ ...ghostBtn, opacity: uploading ? 0.5 : 1, cursor: uploading ? "not-allowed" : "pointer" }}
                >
                  {uploading ? "Uploading…" : "Upload photo"}
                </button>
                {user?.avatarUrl && (
                  <button
                    type="button"
                    onClick={handleRemoveAvatar}
                    disabled={uploading}
                    style={{ ...dangerGhostBtn, opacity: uploading ? 0.5 : 1, cursor: uploading ? "not-allowed" : "pointer" }}
                  >
                    Remove
                  </button>
                )}
              </div>
              <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "oklch(var(--color-ink-3))" }}>
                PNG or JPG, max 2 MB
              </p>
              {uploadError && (
                <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "oklch(var(--color-error))" }}>{uploadError}</p>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp,image/avif"
              style={{ display: "none" }}
              onChange={handleFileChange}
            />
          </div>

          {/* Name form */}
          <form onSubmit={handleSaveName} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label htmlFor="profile-name" style={{ fontSize: "var(--text-sm)", fontWeight: 500, color: "oklch(var(--color-ink-2))" }}>
                Display name
              </label>
              <input
                id="profile-name"
                type="text"
                value={name}
                onChange={(e) => { setName(e.target.value); setSaveSuccess(false) }}
                onFocus={() => setNameFocused(true)}
                onBlur={() => setNameFocused(false)}
                disabled={saving}
                maxLength={100}
                style={{
                  ...inputStyle,
                  maxWidth: "320px",
                  borderColor: nameFocused ? "oklch(var(--color-accent))" : "oklch(var(--color-border))",
                  boxShadow: nameFocused ? "0 0 0 3px oklch(var(--color-accent-muted))" : "none",
                }}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontSize: "var(--text-sm)", fontWeight: 500, color: "oklch(var(--color-ink-2))" }}>
                Email <span style={{ fontWeight: 400, fontSize: "var(--text-xs)", color: "oklch(var(--color-ink-3))" }}>(read-only)</span>
              </label>
              <input
                type="email"
                value={user?.email ?? ""}
                disabled
                style={{ ...inputStyle, maxWidth: "320px", opacity: 0.5, cursor: "not-allowed" }}
              />
              <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "oklch(var(--color-ink-3))" }}>
                Signed in with Google — email can't be changed here.
              </p>
            </div>

            {saveError && (
              <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "oklch(var(--color-error))" }}>{saveError}</p>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <button
                type="submit"
                disabled={saving || name.trim().length === 0}
                style={{
                  ...primaryBtn,
                  opacity: saving || name.trim().length === 0 ? 0.5 : 1,
                  cursor: saving || name.trim().length === 0 ? "not-allowed" : "pointer",
                }}
                onMouseEnter={(e) => { if (!saving) e.currentTarget.style.background = "oklch(var(--color-accent-hover))" }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "oklch(var(--color-accent))" }}
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
              {saveSuccess && (
                <span style={{ fontSize: "var(--text-xs)", color: "oklch(var(--color-success))" }}>Saved</span>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: no output. If `getInitials`/`getAvatarBg` import fails, check the actual path — it's used in `WorkspaceMembersPage.tsx`:
```typescript
import { getInitials, getAvatarBg } from "../utils/avatar"
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/ProfilePage.tsx
git commit -m "feat(frontend): add ProfilePage with avatar upload and name edit"
```

---

### Task 7: Frontend — route + sidebar link

**Files:**
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/components/layout/AppLayout.tsx`

- [ ] **Step 1: Add route in App.tsx**

In `apps/web/src/App.tsx`, add the import:

```typescript
import ProfilePage from "./pages/ProfilePage"
```

Inside the AppLayout route group (alongside `/settings`, `/members`, `/analytics`), add:

```typescript
<Route path="/:workspaceId/profile" element={<ProfilePage />} />
```

- [ ] **Step 2: Make user row in AppLayout a link**

In `apps/web/src/components/layout/AppLayout.tsx`, add `Link` to the imports from react-router-dom:

```typescript
import { Outlet, NavLink, useNavigate, useParams, Link } from "react-router-dom"
```

In `SidebarContent`, find the user section `<div>` that wraps the avatar, name and sign-out button. Replace the outer `<div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 8px", borderRadius: "6px" }}>` with a `<Link>` element that navigates to profile, keeping the sign-out button outside:

```typescript
      {/* User section */}
      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
        <Link
          to={activeWorkspace ? `/${activeWorkspace.id}/profile` : "#"}
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "6px 8px",
            borderRadius: "6px",
            textDecoration: "none",
            color: "oklch(var(--color-ink))",
            transition: "background var(--dur-fast) var(--ease-out)",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "oklch(var(--color-paper-3))" }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent" }}
        >
          {/* Avatar — same markup as before */}
          <div
            style={{
              width: "28px",
              height: "28px",
              borderRadius: "50%",
              background: user?.avatarUrl ? "transparent" : "oklch(52% 0.22 260)",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "0.6875rem",
              fontWeight: 600,
              flexShrink: 0,
              overflow: "hidden",
            }}
          >
            {user?.avatarUrl ? (
              <img src={user.avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              userInitials
            )}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <p
              style={{
                margin: 0,
                fontSize: "var(--text-xs)",
                fontWeight: 500,
                color: "oklch(var(--color-ink))",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {user?.name ?? user?.email}
            </p>
            {user?.name && (
              <p
                style={{
                  margin: 0,
                  fontSize: "var(--text-xs)",
                  color: "oklch(var(--color-ink-3))",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {user.email}
              </p>
            )}
          </div>
        </Link>

        {/* Sign-out button stays outside the link */}
        <button
          onClick={handleLogout}
          title="Sign out"
          aria-label="Sign out"
          style={{
            padding: "5px",
            borderRadius: "5px",
            border: "none",
            background: "transparent",
            color: "oklch(var(--color-ink-3))",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            transition: "background var(--dur-fast), color var(--dur-fast)",
            flexShrink: 0,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "oklch(var(--color-paper-3))"
            e.currentTarget.style.color = "oklch(var(--color-ink))"
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent"
            e.currentTarget.style.color = "oklch(var(--color-ink-3))"
          }}
        >
          <SignOutIcon />
        </button>
      </div>
```

- [ ] **Step 3: Type-check**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/App.tsx apps/web/src/components/layout/AppLayout.tsx
git commit -m "feat(frontend): add profile route and link sidebar user row to profile page"
```

---

### Task 8: Frontend — WorkspaceSwitcher badge with logo and color

**Files:**
- Modify: `apps/web/src/components/layout/WorkspaceSwitcher.tsx`

The `WorkspaceInitials` component uses a deterministic color from the workspace name. We replace it with a `WorkspaceBadge` component that uses `logoUrl` (if set) or falls back to `color` token → gradient, then initials.

- [ ] **Step 1: Add color-to-gradient map and replace WorkspaceInitials with WorkspaceBadge**

In `apps/web/src/components/layout/WorkspaceSwitcher.tsx`, replace the entire `WorkspaceInitials` function with:

```typescript
const COLOR_GRADIENTS: Record<string, string> = {
  blue:   "linear-gradient(135deg, #3b82f6, #2563eb)",
  teal:   "linear-gradient(135deg, #10b981, #06b6d4)",
  purple: "linear-gradient(135deg, #8b5cf6, #6366f1)",
  orange: "linear-gradient(135deg, #f97316, #ef4444)",
  pink:   "linear-gradient(135deg, #ec4899, #8b5cf6)",
  yellow: "linear-gradient(135deg, #f59e0b, #eab308)",
  slate:  "linear-gradient(135deg, #64748b, #475569)",
  red:    "linear-gradient(135deg, #ef4444, #b91c1c)",
}

function WorkspaceBadge({ name, logoUrl, color }: { name: string; logoUrl?: string | null; color?: string }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("")

  const background = COLOR_GRADIENTS[color ?? "blue"] ?? COLOR_GRADIENTS.blue

  return (
    <div
      style={{
        width: "28px",
        height: "28px",
        borderRadius: "6px",
        background: logoUrl ? "transparent" : background,
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "0.6875rem",
        fontWeight: 600,
        letterSpacing: "0.02em",
        flexShrink: 0,
        overflow: "hidden",
      }}
    >
      {logoUrl ? (
        <img src={logoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        initials || "W"
      )}
    </div>
  )
}
```

- [ ] **Step 2: Replace all WorkspaceInitials usages with WorkspaceBadge**

In the same file, find every `<WorkspaceInitials name={...} />` and replace with `<WorkspaceBadge name={ws.name} logoUrl={ws.logoUrl} color={ws.color} />` (or `activeWorkspace.name/logoUrl/color` where `activeWorkspace` is used).

There are two places:
1. In the trigger button: `<WorkspaceInitials name={activeWorkspace.name} />` → `<WorkspaceBadge name={activeWorkspace.name} logoUrl={activeWorkspace.logoUrl} color={activeWorkspace.color} />`
2. In the dropdown list: `<WorkspaceInitials name={ws.name} />` → `<WorkspaceBadge name={ws.name} logoUrl={ws.logoUrl} color={ws.color} />`

- [ ] **Step 3: Type-check**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/layout/WorkspaceSwitcher.tsx
git commit -m "feat(frontend): use workspace logo and color in sidebar badge"
```

---

### Task 9: Frontend — Workspace Settings Identity section

**Files:**
- Modify: `apps/web/src/pages/WorkspaceSettingsPage.tsx`

- [ ] **Step 1: Add imports and color constants at top of file**

In `apps/web/src/pages/WorkspaceSettingsPage.tsx`, add to the existing import line:

```typescript
import { workspacesApi, type WorkspaceDetail } from "../api/workspaces"
```
already exists. Add to the import:
```typescript
import { useRef } from "react"
```
(add `useRef` to the existing `import { useEffect, useRef, useState } from "react"` — `useRef` may not be there yet).

After the shared styles block, add:

```typescript
const COLOR_GRADIENTS: Record<string, string> = {
  blue:   "linear-gradient(135deg, #3b82f6, #2563eb)",
  teal:   "linear-gradient(135deg, #10b981, #06b6d4)",
  purple: "linear-gradient(135deg, #8b5cf6, #6366f1)",
  orange: "linear-gradient(135deg, #f97316, #ef4444)",
  pink:   "linear-gradient(135deg, #ec4899, #8b5cf6)",
  yellow: "linear-gradient(135deg, #f59e0b, #eab308)",
  slate:  "linear-gradient(135deg, #64748b, #475569)",
  red:    "linear-gradient(135deg, #ef4444, #b91c1c)",
}

const COLOR_OPTIONS = ["blue", "teal", "purple", "orange", "pink", "yellow", "slate", "red"] as const
```

- [ ] **Step 2: Add identity state to WorkspaceSettingsPage**

Inside the `WorkspaceSettingsPage` function, add new state after the existing save/delete state:

```typescript
  // Identity state
  const logoFileInputRef = useRef<HTMLInputElement>(null)
  const [logoUploading, setLogoUploading] = useState(false)
  const [logoError, setLogoError] = useState("")
  const [selectedColor, setSelectedColor] = useState<string>(detail?.color ?? "blue")
  const [colorSaving, setColorSaving] = useState(false)
  const [colorSaveSuccess, setColorSaveSuccess] = useState(false)
```

Also, when `detail` loads (in the `useEffect` that calls `workspacesApi.getOne`), set the selectedColor:

```typescript
      .then((ws) => {
        setDetail(ws)
        setName(ws.name)
        setDescription(ws.description ?? "")
        setSelectedColor(ws.color ?? "blue")   // ← add this line
      })
```

- [ ] **Step 3: Add logo upload and color save handlers**

Inside `WorkspaceSettingsPage`, add these handlers before `handleSave`:

```typescript
  const handleLogoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !workspaceId) return
    e.target.value = ""
    setLogoUploading(true)
    setLogoError("")
    try {
      const updated = await workspacesApi.uploadLogo(workspaceId, file)
      setDetail((prev) => prev ? { ...prev, logoUrl: updated.logoUrl } : prev)
      updateWorkspace(workspaceId, { logoUrl: updated.logoUrl })
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } }
      setLogoError(axiosErr?.response?.data?.error?.message ?? "Failed to upload logo")
    } finally {
      setLogoUploading(false)
    }
  }

  const handleRemoveLogo = async () => {
    if (!workspaceId) return
    setLogoUploading(true)
    setLogoError("")
    try {
      const updated = await workspacesApi.removeLogo(workspaceId)
      setDetail((prev) => prev ? { ...prev, logoUrl: updated.logoUrl } : prev)
      updateWorkspace(workspaceId, { logoUrl: updated.logoUrl ?? undefined })
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } }
      setLogoError(axiosErr?.response?.data?.error?.message ?? "Failed to remove logo")
    } finally {
      setLogoUploading(false)
    }
  }

  const handleSaveColor = async (color: string) => {
    if (!workspaceId) return
    setSelectedColor(color)
    setColorSaving(true)
    setColorSaveSuccess(false)
    try {
      await workspacesApi.update(workspaceId, { color })
      updateWorkspace(workspaceId, { color })
      setColorSaveSuccess(true)
      setTimeout(() => setColorSaveSuccess(false), 2000)
    } catch {
      // Color reverts on next load — no extra error UI needed
    } finally {
      setColorSaving(false)
    }
  }
```

Note: `updateWorkspace` is already destructured from `useWorkspaceStore()` in this component.

- [ ] **Step 4: Render Identity section**

In the JSX, add this **before** the existing `{/* General section */}` div (i.e., as the first section card in the page):

```typescript
        {/* Identity section — OWNER/ADMIN only */}
        {canEdit && (
          <div style={{ ...sectionCard, marginBottom: "24px" }}>
            <div style={sectionHeader}>
              <h2 style={{ margin: 0, fontSize: "var(--text-sm)", fontWeight: 600 }}>Identity</h2>
            </div>
            <div style={sectionBody}>
              {/* Logo upload */}
              <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "20px" }}>
                <div
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: "10px",
                    background: detail?.logoUrl ? "transparent" : (COLOR_GRADIENTS[detail?.color ?? "blue"] ?? COLOR_GRADIENTS.blue),
                    flexShrink: 0,
                    overflow: "hidden",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: logoUploading ? "default" : "pointer",
                    opacity: logoUploading ? 0.6 : 1,
                    border: "2px solid oklch(var(--color-border))",
                  }}
                  onClick={() => !logoUploading && logoFileInputRef.current?.click()}
                  title="Click to change logo"
                >
                  {detail?.logoUrl ? (
                    <img src={detail.logoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <span style={{ fontSize: "16px", fontWeight: 700, color: "#fff" }}>
                      {(detail?.name ?? "W").split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "W"}
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button
                      type="button"
                      onClick={() => logoFileInputRef.current?.click()}
                      disabled={logoUploading}
                      style={{ ...primaryBtn, opacity: logoUploading ? 0.5 : 1, cursor: logoUploading ? "not-allowed" : "pointer" }}
                      onMouseEnter={(e) => { if (!logoUploading) e.currentTarget.style.background = "oklch(var(--color-accent-hover))" }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "oklch(var(--color-accent))" }}
                    >
                      {logoUploading ? "Uploading…" : "Upload logo"}
                    </button>
                    {detail?.logoUrl && (
                      <button
                        type="button"
                        onClick={handleRemoveLogo}
                        disabled={logoUploading}
                        style={{ ...dangerBtn, opacity: logoUploading ? 0.5 : 1, cursor: logoUploading ? "not-allowed" : "pointer" }}
                        onMouseEnter={(e) => { if (!logoUploading) { e.currentTarget.style.background = "oklch(var(--color-error))"; e.currentTarget.style.color = "#fff" } }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "oklch(var(--color-error))" }}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "oklch(var(--color-ink-3))" }}>
                    PNG or JPG, max 2 MB. Used in the workspace badge.
                  </p>
                  {logoError && (
                    <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "oklch(var(--color-error))" }}>{logoError}</p>
                  )}
                </div>
                <input
                  ref={logoFileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp,image/avif"
                  style={{ display: "none" }}
                  onChange={handleLogoFileChange}
                />
              </div>

              {/* Color picker */}
              <div>
                <p style={{ margin: "0 0 4px", fontSize: "var(--text-sm)", fontWeight: 500, color: "oklch(var(--color-ink-2))" }}>
                  Workspace color
                </p>
                <p style={{ margin: "0 0 10px", fontSize: "var(--text-xs)", color: "oklch(var(--color-ink-3))" }}>
                  Used when no logo is set.
                </p>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {COLOR_OPTIONS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      title={c}
                      onClick={() => handleSaveColor(c)}
                      disabled={colorSaving}
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: "7px",
                        background: COLOR_GRADIENTS[c],
                        border: selectedColor === c ? "2.5px solid oklch(var(--color-ink))" : "2px solid transparent",
                        cursor: colorSaving ? "not-allowed" : "pointer",
                        transform: selectedColor === c ? "scale(1.15)" : "scale(1)",
                        transition: "transform 0.1s, border 0.1s",
                        padding: 0,
                      }}
                    />
                  ))}
                </div>
                {colorSaveSuccess && (
                  <p style={{ margin: "8px 0 0", fontSize: "var(--text-xs)", color: "oklch(var(--color-success))" }}>Color saved</p>
                )}
              </div>
            </div>
          </div>
        )}
```

- [ ] **Step 5: Type-check**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 6: Run build to catch unused import warnings**

```bash
cd apps/web && yarn build 2>&1 | grep -E "error|warning" | head -20
```

Expected: no errors. Fix any unused import warnings before continuing.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/pages/WorkspaceSettingsPage.tsx
git commit -m "feat(frontend): add Identity section to WorkspaceSettingsPage"
```

---

### Task 10: Manual smoke test

- [ ] **Step 1: Start dev servers**

```bash
# Terminal 1
cd apps/api && npm run dev

# Terminal 2
cd apps/web && npm run dev
```

- [ ] **Step 2: Test Profile page**

1. Open http://localhost:5173 and log in
2. Click your name/avatar at the bottom of the sidebar → should navigate to `/:workspaceId/profile`
3. Upload a photo (PNG under 2 MB) → avatar updates in the page and in the sidebar immediately
4. Edit your display name → click Save → sidebar name updates
5. Click "Remove" on avatar → reverts to initials

- [ ] **Step 3: Test Workspace Identity**

1. Navigate to Workspace Settings
2. Upload a logo → badge in sidebar switcher updates to show the image
3. Click "Remove" → reverts to initials with color
4. Click each color swatch → badge changes color instantly, "Color saved" appears
5. Reload page → color and logo persist

- [ ] **Step 4: Final build check**

```bash
cd apps/web && yarn build
```

Expected: no errors.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: user profile page and workspace identity (logo + color)"
```
