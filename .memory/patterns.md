# FlowGrid — Engineering Patterns

## 1. Async flush-before-close in debounced modals

**Context:** Any modal with a debounced auto-save (e.g. `CardDetailModal` description field).

**Rule:** `flushAndClose` must be `async` and must `await` the pending save before calling `onClose()`. Fire-and-forget causes the modal to unmount before the save resolves — the save indicator vanishes and errors are silent.

**Pattern:**
```tsx
const flushAndClose = useCallback(async () => {
  if (debounceRef.current) {
    clearTimeout(debounceRef.current)
    debounceRef.current = null
    if (pendingRef.current !== null) {
      const value = pendingRef.current
      pendingRef.current = null
      await saveField({ field: value })   // ← AWAIT, not void
    }
  }
  onClose()
}, [saveField, onClose])
```

**Unmount cleanup** is different — fire-and-forget is acceptable there because the component is already being destroyed and there is no UI to show errors:
```tsx
useEffect(() => {
  return () => {
    if (debounceRef.current && pendingRef.current !== null) {
      void api.update(id, { field: pendingRef.current })
    }
  }
}, [])   // id is stable for modal lifetime
```

---

## 2. Stable event listener with latest-ref pattern

**Context:** A `keydown`/`click` listener registered in `useEffect([], [])` that needs to call a function which itself depends on state or other callbacks.

**Problem:** `useEffect([], [])` captures the function from the first render — a stale closure. Adding the function to the dep array forces the listener to re-register on every change.

**Pattern:** Keep a ref that is updated every render (via a synchronous `useEffect` with no dep array), and have the stable listener call the ref.

```tsx
const flushAndCloseRef = useRef<() => Promise<void>>(async () => { onClose() })

// Update ref every render — synchronous, no deps
useEffect(() => {
  flushAndCloseRef.current = flushAndClose
})

// Stable listener — registered once, always calls latest version
useEffect(() => {
  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape") void flushAndCloseRef.current()
  }
  document.addEventListener("keydown", onKey)
  return () => document.removeEventListener("keydown", onKey)
}, [])
```

This avoids both dep explosion on the stable listener and `eslint-disable` suppressions.

---

## 3. Shared presentation utilities location

Pure, zero-import utility functions used by multiple UI components live in `apps/web/src/utils/`.

Current: `apps/web/src/utils/avatar.ts` — `hashCode`, `getInitials`, `getAvatarBg` (used by `CardItem` and `CardDetailModal`).

Never duplicate these inline in component files.

---

## 4. Enriched GET but lean-mutation trap

**Context:** After #10a, `GET /api/cards` returns enriched `assignee` + `labels`. All mutation endpoints (`/update`, `/move`) must return the same shape — otherwise components that store the mutation response will silently lose those fields.

**Rule:** When you add joined data to a GET response, audit every mutation endpoint on the same resource and add the same `include` to their responses.

Applied in #10a review (fixed `/update` and `/move`) and #10b (fixed from the start).

---

## 5. Fire-and-forget activity logging

**Context:** Any Express route that auto-logs an `Activity` row as a side-effect of a primary mutation.

**Rule:** Use `void logActivity({...})` — never `await`. The `logActivity` helper in `apps/api/src/lib/activity.ts` wraps `prisma.activity.create` in `try/catch` and never throws. The primary response must already be committed before the `void` call.

```ts
// After primary operation succeeds:
void logActivity({ cardId, userId: req.user!.id, action: "card_archived", metadata: {} })
res.json({ success: true })
```

The `void` operator explicitly discards the promise, suppressing floating-promise lint warnings. Activity logging failure is logged to `console.error` but never surfaces to the caller.

---

## 6. resolveCardAccess pattern

**Context:** Routes that receive a `cardId` and need to verify the requesting user has access (workspace member + optional PRIVATE board check).

**Pattern:** Inline in each route file (consistent with `resolveListAccess` in `cards.ts` and `labels.ts`). Walk: `card → list → board → workspaceMember`. Add `boardMember` check when `board.visibility === "PRIVATE"`.

```ts
async function resolveCardAccess(res, cardId, userId, requireWriteRole = false) {
  // 1. card.findUnique — 404 if not found or deletedAt set
  // 2. list.findUnique on card.listId
  // 3. board.findUnique on list.boardId — check workspace membership
  // 4. PRIVATE board → check boardMember row
  // 5. requireWriteRole → canWrite(membership.role) — blocks VIEWER, allows MEMBER+
}
```

After Feature #6: `requireWriteRole = true` blocks only VIEWER (not MEMBER). `canWrite(role)` is defined in `apps/api/src/lib/roles.ts` as `role !== "VIEWER"`.

Currently in `comments.ts` and `activities.ts`. If a third route needs it, extract to `apps/api/src/lib/cardAccess.ts`.

---

## 7. Two-pass sanitize for rich text validation

**Context:** Any backend route that accepts TipTap HTML and must reject empty submissions.

**Problem:** `content.trim().length === 0` passes for `<p></p>` (TipTap's empty state = 7 chars). The raw HTML string is never empty even when the editor is blank.

**Pattern:** Apply `sanitize-html` twice — once to produce stored HTML, second pass to extract text-only content for the emptiness check:

```ts
const sanitized = sanitizeHtml(content, SANITIZE_OPTIONS)
const textOnly = sanitizeHtml(sanitized, { allowedTags: [], allowedAttributes: {} }).trim()
if (textOnly.length === 0) {
  res.status(400).json({ error: { message: "content cannot be empty", status: 400 } })
  return
}
```

Uses `sanitize-html` itself for text extraction — no extra dependency needed. Apply to both create AND update handlers.

---

## 8. Fire-and-forget email with graceful no-key degradation

**Context:** Transactional email triggered as a side-effect of a mutation (e.g. invite email after `POST /api/invites`).

**Rule:** Use `void sendInviteEmail(...)` — never `await`. The `sendInviteEmail` helper in `apps/api/src/lib/email.ts` wraps `resend.emails.send()` in `try/catch` and never throws. If `RESEND_API_KEY` is not set, the function logs a warning and returns immediately — server starts fine without it in dev.

```ts
// After primary operation succeeds:
void sendInviteEmail({ to, inviterName, workspaceName, role, inviteUrl })
res.json({ invite })
```

Pattern: optional env key check at init (`const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null`), `if (!resend) { warn + return }` at call time.

---

## 9. Invite upsert with composite unique constraint

**Context:** One invite record per email per workspace, regardless of how many times the owner sends or resends.

**Schema**: `@@unique([workspaceId, email])` on `WorkspaceInvite`.

**Pattern:** `POST /api/invites` always does `prisma.workspaceInvite.upsert({ where: { workspaceId_email: ... }, create: {...}, update: { token, expiresAt, status: "PENDING" } })`. No "check for existing invite then branch" — the upsert is atomic. Resend reuses this same upsert path.

---

## 10. Defense-in-depth guard ordering for role mutations

**Context:** Any endpoint that modifies a member's role or removes a member.

**Correct ordering** (prevents all privilege escalation vectors):

```ts
// 1. Target exists?
if (!target) return 404

// 2. Actor has management permission?
if (!isOwnerOrAdmin(actorMembership.role)) return 403

// 3. Actor cannot assign a role above their own (for role-change endpoints)?
if (!roleAtLeast(actorMembership.role, newRole)) return 403

// 4. Actor cannot touch an OWNER row unless actor is also an OWNER?
if (target.role === "OWNER" && actorMembership.role !== "OWNER") return 403

// 5. Last-owner invariant — count owners, block if removing the last one?
if (target.role === "OWNER") {
  const count = await prisma.workspaceMember.count({ where: { workspaceId, role: "OWNER" } })
  if (count <= 1) return 403 LAST_OWNER
}
```

Steps 4 and 5 are separate. Step 4 prevents ADMIN from touching OWNER rows at all. Step 5 prevents an OWNER from locking themselves out. Both are needed.
