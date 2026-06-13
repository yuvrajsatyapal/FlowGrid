# TanStack Query Server-State Consolidation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate all client-side server-state management onto TanStack Query, with Socket.IO as a cache-write transport, eliminating hand-rolled `useState`/`useEffect`+axios data flows and the tangled optimistic/socket logic in `BoardPage` — with no UI, UX, workflow, or behavior change.

**Architecture:** Four-way ownership split — TanStack Query owns all server state; Socket.IO writes into the cache; Zustand holds only cross-tree client selections; `useState` holds only ephemeral UI. The clean `src/api/*` axios layer stays as-is and becomes the transport the hooks call. Pure cache primitives are TDD'd; page migrations are validated by behavioral parity.

**Tech Stack:** Vite + React 18 + React Router 6 + TypeScript, `@tanstack/react-query@5.45`, `socket.io-client@4.8`, Zustand 4.5. Backend (unchanged): Express + Prisma + Socket.IO + Upstash Redis.

**Companion spec:** `docs/superpowers/specs/2026-06-12-tanstack-query-server-state-consolidation-design.md`

---

## Git / VCS policy for this plan

**Per the owner's explicit instruction, this plan performs NO git operations.** Every "Commit" step in the standard writing-plans template is replaced here by a **Checkpoint** step: run validation, confirm green, and *stop for the owner to decide whether to commit*. Do not run `git add`, `git commit`, `git branch`, `git push`, or any history-altering command. Work directly on the current `main` working tree.

---

## Testing Strategy (read before starting)

| Surface | How it's validated | Why |
|---|---|---|
| Pure cache primitives (`upsertById`, `removeById`, `reorderByIds`, version guard, key factories, presence reducer) | **TDD with Vitest** (unit) | Pure functions, deterministic, high-signal — the place TDD pays |
| Query/mutation hooks | Typecheck + a thin RTL render test with a real `QueryClient` + mocked `api/*` module | Confirms wiring, cache keys, optimistic rollback |
| Page migrations | **Behavioral parity**: `pnpm --filter @flowgrid/web typecheck` + `build` + existing Playwright flows + two-browser manual smoke for socket surfaces | Contract is "nothing observable changes" — parity beats brittle snapshot tests mid-refactor |

**Per-phase global gate (must pass before any Checkpoint):**
```bash
pnpm --filter @flowgrid/web typecheck
pnpm --filter @flowgrid/web lint
pnpm --filter @flowgrid/web build
pnpm --filter @flowgrid/web test run   # available after Phase 0
```

---

# PHASE 0 — Foundation Primitives

**Objective:** Add the test runner and the reusable cache primitives + per-domain key factories + global query config. Pure-additive: no page imports them yet, app behavior is byte-identical.

**Expected impact:** Zero runtime change. Adds `vitest`, `@testing-library/react`, `jsdom`; adds `src/lib/cache/*` and `src/features/*/queries/keys.ts`. Establishes the patterns every later phase reuses.

**Rollback approach:** Delete the new files and the three devDependencies. Nothing references them, so removal is safe and total.

---

### Task 0.1: Install and configure Vitest + React Testing Library

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/vitest.config.ts`
- Create: `apps/web/src/test/setup.ts`

- [ ] **Step 1: Add dev dependencies**

Run from repo root:
```bash
pnpm --filter @flowgrid/web add -D vitest@^2 @testing-library/react@^16 @testing-library/jest-dom@^6 jsdom@^25 @testing-library/user-event@^14
```

- [ ] **Step 2: Add the test script**

In `apps/web/package.json` `"scripts"`, add:
```json
"test": "vitest"
```

- [ ] **Step 3: Create `apps/web/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
  },
})
```

- [ ] **Step 4: Create `apps/web/src/test/setup.ts`**

```ts
import "@testing-library/jest-dom/vitest"
```

- [ ] **Step 5: Smoke-test the runner**

Create `apps/web/src/test/sanity.test.ts`:
```ts
import { describe, it, expect } from "vitest"
describe("vitest", () => {
  it("runs", () => { expect(1 + 1).toBe(2) })
})
```
Run: `pnpm --filter @flowgrid/web test run`
Expected: 1 passed.

- [ ] **Step 6: Delete the sanity file**

```bash
rm apps/web/src/test/sanity.test.ts
```

- [ ] **Step 7: Checkpoint** — run the global gate (typecheck, lint, build, test). Confirm green. Stop for owner's commit decision.

---

### Task 0.2: `upsertById` / `removeById` / `reorderByIds` cache helpers (TDD)

**Files:**
- Create: `apps/web/src/lib/cache/collection.ts`
- Test: `apps/web/src/lib/cache/collection.test.ts`

These operate on an array of `{ id: string; updatedAt?: string | Date }` items and are the heart of socket→cache idempotency + the version guard (spec §6).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest"
import { upsertById, removeById, reorderByIds } from "./collection"

interface Item { id: string; updatedAt: string; name?: string }
const a = (id: string, t: string, name = ""): Item => ({ id, updatedAt: t, name })

describe("upsertById", () => {
  it("inserts when id is absent", () => {
    const r = upsertById([a("1", "2026-01-01")], a("2", "2026-01-02"))
    expect(r.map(i => i.id)).toEqual(["1", "2"])
  })
  it("replaces when id is present and incoming is newer", () => {
    const r = upsertById([a("1", "2026-01-01", "old")], a("1", "2026-01-02", "new"))
    expect(r).toHaveLength(1)
    expect(r[0].name).toBe("new")
  })
  it("ignores an incoming item older than the cached one (version guard)", () => {
    const r = upsertById([a("1", "2026-01-02", "new")], a("1", "2026-01-01", "stale"))
    expect(r[0].name).toBe("new")
  })
  it("replaces when updatedAt is missing (no guard possible)", () => {
    const r = upsertById([{ id: "1", name: "old" } as any], { id: "1", name: "new" } as any)
    expect((r[0] as any).name).toBe("new")
  })
  it("is idempotent: applying the same upsert twice yields one entry", () => {
    const once = upsertById([a("1", "2026-01-01")], a("1", "2026-01-01", "x"))
    const twice = upsertById(once, a("1", "2026-01-01", "x"))
    expect(twice).toHaveLength(1)
  })
})

describe("removeById", () => {
  it("removes the matching id", () => {
    expect(removeById([a("1","t"), a("2","t")], "1").map(i => i.id)).toEqual(["2"])
  })
  it("is a no-op when id is absent", () => {
    expect(removeById([a("1","t")], "9").map(i => i.id)).toEqual(["1"])
  })
})

describe("reorderByIds", () => {
  it("reorders items to match the id order", () => {
    const r = reorderByIds([a("1","t"), a("2","t"), a("3","t")], ["3","1","2"])
    expect(r.map(i => i.id)).toEqual(["3","1","2"])
  })
  it("keeps items missing from the order at the end, original order", () => {
    const r = reorderByIds([a("1","t"), a("2","t"), a("3","t")], ["2"])
    expect(r.map(i => i.id)).toEqual(["2","1","3"])
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @flowgrid/web test run src/lib/cache/collection.test.ts`
Expected: FAIL — "Failed to resolve import './collection'".

- [ ] **Step 3: Implement `collection.ts`**

```ts
export interface Identifiable {
  id: string
  updatedAt?: string | Date
}

const time = (v: string | Date | undefined): number =>
  v == null ? NaN : (typeof v === "string" ? Date.parse(v) : v.getTime())

/** Insert or replace by id. If both have updatedAt, ignore an incoming item
 *  strictly older than the cached one (out-of-order / stale event guard). */
export function upsertById<T extends Identifiable>(list: T[], incoming: T): T[] {
  const idx = list.findIndex((i) => i.id === incoming.id)
  if (idx === -1) return [...list, incoming]
  const prev = list[idx]
  const tPrev = time(prev.updatedAt)
  const tNew = time(incoming.updatedAt)
  if (!Number.isNaN(tPrev) && !Number.isNaN(tNew) && tNew < tPrev) return list
  const next = list.slice()
  next[idx] = incoming
  return next
}

export function removeById<T extends Identifiable>(list: T[], id: string): T[] {
  return list.filter((i) => i.id !== id)
}

/** Reorder to match `orderedIds`; ids not present in the order are appended
 *  in their original relative order. */
export function reorderByIds<T extends Identifiable>(list: T[], orderedIds: string[]): T[] {
  const byId = new Map(list.map((i) => [i.id, i]))
  const ordered: T[] = []
  for (const id of orderedIds) {
    const item = byId.get(id)
    if (item) { ordered.push(item); byId.delete(id) }
  }
  for (const item of list) if (byId.has(item.id)) ordered.push(item)
  return ordered
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @flowgrid/web test run src/lib/cache/collection.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Checkpoint** — global gate green, stop for owner.

---

### Task 0.3: Query-key factories

**Files:**
- Create: `apps/web/src/features/workspace/queries/keys.ts`
- Create: `apps/web/src/features/board/queries/keys.ts`
- Create: `apps/web/src/features/card/queries/keys.ts`
- Test: `apps/web/src/features/board/queries/keys.test.ts`

- [ ] **Step 1: Write the failing test** (locks in the prefix hierarchy that targeted writes/invalidation depend on)

```ts
import { describe, it, expect } from "vitest"
import { boardKeys } from "./keys"

describe("boardKeys", () => {
  it("nests lists/cards/members under the board detail prefix", () => {
    expect(boardKeys.detail("b1")).toEqual(["board", "b1"])
    expect(boardKeys.lists("b1")).toEqual(["board", "b1", "lists"])
    expect(boardKeys.cards("b1")).toEqual(["board", "b1", "cards"])
    expect(boardKeys.members("b1")).toEqual(["board", "b1", "members"])
  })
  it("detail is a prefix of its sub-keys (so invalidating detail invalidates all)", () => {
    const detail = boardKeys.detail("b1")
    const lists = boardKeys.lists("b1")
    expect(lists.slice(0, detail.length)).toEqual(detail)
  })
})
```

- [ ] **Step 2: Run to verify it fails** — `pnpm --filter @flowgrid/web test run src/features/board/queries/keys.test.ts` → FAIL (import).

- [ ] **Step 3: Implement the three factories**

`apps/web/src/features/board/queries/keys.ts`:
```ts
export const boardKeys = {
  all: ["board"] as const,
  detail: (boardId: string) => ["board", boardId] as const,
  lists: (boardId: string) => ["board", boardId, "lists"] as const,
  cards: (boardId: string) => ["board", boardId, "cards"] as const,
  members: (boardId: string) => ["board", boardId, "members"] as const,
  depGraph: (boardId: string) => ["board", boardId, "dependency-graph"] as const,
}
```

`apps/web/src/features/workspace/queries/keys.ts`:
```ts
export const workspaceKeys = {
  all: ["workspace"] as const,
  list: () => ["workspace", "list"] as const,
  detail: (id: string) => ["workspace", id] as const,
  members: (id: string) => ["workspace", id, "members"] as const,
  invites: (id: string) => ["workspace", id, "invites"] as const,
  userSearch: (id: string, q: string) => ["workspace", id, "user-search", q] as const,
}
```

`apps/web/src/features/card/queries/keys.ts`:
```ts
export const cardKeys = {
  detail: (cardId: string) => ["card", cardId] as const,
  comments: (cardId: string) => ["card", cardId, "comments"] as const,
  checklists: (cardId: string) => ["card", cardId, "checklists"] as const,
}
```

- [ ] **Step 4: Run to verify it passes** → PASS.

- [ ] **Step 5: Checkpoint** — global gate green, stop for owner.

---

### Task 0.4: Update global QueryClient config

**Files:**
- Modify: `apps/web/src/lib/queryClient.ts`

**Behavior note:** This flips `refetchOnWindowFocus` to `true` and raises `gcTime`. No page yet relies on this; the WorkspaceMembersPage focus listener is removed in Phase 1, so until then the page double-refreshes on focus (harmless — same data). Acceptable mid-migration state; resolved within Phase 1.

- [ ] **Step 1: Replace the file contents**

```ts
import { QueryClient } from "@tanstack/react-query"

function isNonRetryable(error: unknown): boolean {
  const status = (error as { response?: { status?: number } })?.response?.status
  return typeof status === "number" && status >= 400 && status < 500
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: (count, error) => !isNonRetryable(error) && count < 2,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
    mutations: { retry: 0 },
  },
})
```

- [ ] **Step 2: Typecheck + build** — `pnpm --filter @flowgrid/web typecheck && pnpm --filter @flowgrid/web build` → PASS.

- [ ] **Step 3: Manual parity** — run `pnpm --filter @flowgrid/web dev`, open Inbox/notifications (existing Query consumers), confirm identical behavior; no console errors.

- [ ] **Step 4: Checkpoint** — global gate green, stop for owner.

---

### Task 0.5: Optimistic mutation helper + reusable realtime-sync hook

**Files:**
- Create: `apps/web/src/lib/cache/optimistic.ts`
- Create: `apps/web/src/lib/cache/useRealtimeCacheSync.ts`
- Test: `apps/web/src/lib/cache/optimistic.test.ts`

> These are scaffolding used starting Phase 1 (presence) and Phase 2 (optimistic). Built now so the pattern is fixed once.

- [ ] **Step 1: Write the failing test for the optimistic option-builder**

```ts
import { describe, it, expect, vi } from "vitest"
import { QueryClient } from "@tanstack/react-query"
import { optimisticListUpdate } from "./optimistic"

describe("optimisticListUpdate", () => {
  it("cancels queries, snapshots, and applies the patch in onMutate", async () => {
    const qc = new QueryClient()
    const key = ["things"]
    qc.setQueryData(key, [{ id: "1", updatedAt: "t" }])
    const cancel = vi.spyOn(qc, "cancelQueries").mockResolvedValue()
    const opts = optimisticListUpdate(qc, key, (prev) => [...(prev ?? []), { id: "2", updatedAt: "t" }])
    const ctx = await opts.onMutate!({} as never)
    expect(cancel).toHaveBeenCalledWith({ queryKey: key })
    expect((ctx as { snapshot: unknown[] }).snapshot).toEqual([{ id: "1", updatedAt: "t" }])
    expect(qc.getQueryData(key)).toHaveLength(2)
  })

  it("restores the snapshot in onError (rollback)", async () => {
    const qc = new QueryClient()
    const key = ["things"]
    qc.setQueryData(key, [{ id: "1", updatedAt: "t" }])
    const opts = optimisticListUpdate(qc, key, () => [])
    const ctx = await opts.onMutate!({} as never)
    qc.setQueryData(key, [])
    opts.onError!(new Error("x"), {} as never, ctx as never)
    expect(qc.getQueryData(key)).toEqual([{ id: "1", updatedAt: "t" }])
  })
})
```

- [ ] **Step 2: Run to verify it fails** → FAIL (import).

- [ ] **Step 3: Implement `optimistic.ts`**

```ts
import type { QueryClient, QueryKey } from "@tanstack/react-query"

export interface OptimisticContext<T> { snapshot: T }

/** Builds the onMutate/onError/onSettled trio for an optimistic update on a
 *  single list-shaped query key. `apply` is a pure (prev) => next reducer. */
export function optimisticListUpdate<TData, TVars>(
  queryClient: QueryClient,
  queryKey: QueryKey,
  apply: (prev: TData | undefined, vars: TVars) => TData,
) {
  return {
    onMutate: async (vars: TVars): Promise<OptimisticContext<TData | undefined>> => {
      await queryClient.cancelQueries({ queryKey })
      const snapshot = queryClient.getQueryData<TData>(queryKey)
      queryClient.setQueryData<TData>(queryKey, (prev) => apply(prev, vars))
      return { snapshot }
    },
    onError: (_err: unknown, _vars: TVars, ctx?: OptimisticContext<TData | undefined>) => {
      if (ctx) queryClient.setQueryData<TData>(queryKey, ctx.snapshot)
    },
    onSettled: () => {
      // Default: no invalidation — socket echo / pessimistic write reconciles.
      // Callers needing server-computed fields override onSettled at the call site.
    },
  }
}
```

- [ ] **Step 4: Run to verify it passes** → PASS.

- [ ] **Step 5: Implement `useRealtimeCacheSync.ts`** (no separate unit test — exercised via Phase 1 presence parity)

```ts
import { useEffect } from "react"
import type { Socket } from "socket.io-client"

type Handlers = Record<string, (payload: any) => void>

/** Subscribes the given handlers to socket events for the lifetime of the
 *  component, translating each event into a cache write (the handler body).
 *  Handlers are held in a ref so identity churn never re-subscribes. */
export function useRealtimeCacheSync(socket: Socket | null, handlers: Handlers): void {
  useEffect(() => {
    if (!socket) return
    const entries = Object.entries(handlers)
    for (const [event, fn] of entries) socket.on(event, fn)
    return () => { for (const [event, fn] of entries) socket.off(event, fn) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket])
}
```

> Note: handler bodies are closures that call `queryClient.setQueryData`. Because the effect re-subscribes only when `socket` changes (not on handler identity), keep `queryClient` (stable singleton) usage inside handlers rather than capturing changing props. Phase 1 follows this exactly.

- [ ] **Step 6: Checkpoint** — global gate green, stop for owner.

**Phase 0 success criteria:** test runner green; `src/lib/cache/*` and three key factories exist and are unit-tested; `queryClient` reconfigured; `pnpm --filter @flowgrid/web build` passes; **no page behavior changed** (verified by opening the app and exercising Inbox/notifications).

---

# PHASE 1 — WorkspaceMembersPage (reference implementation)

**Objective:** Migrate the entire data layer of `WorkspaceMembersPage` to Query hooks (pessimistic mutations) + presence-via-cache, deleting the manual fetch/`useState`/focus-refetch machinery. UI and behavior identical.

**Expected impact:** `WorkspaceMembersPage` loses ~6 server-data `useState`s and 4 `useEffect` data flows; gains 3 query hooks, 5 mutation hooks, 1 presence-sync hook. The hand-rolled 30s interval + focus listener is **deleted** (replaced by Query's `refetchInterval` + `refetchOnWindowFocus`). This is the pattern every other page will copy.

**Rollback approach:** The page is migrated behind unchanged JSX. If parity fails, `git checkout -- apps/web/src/pages/WorkspaceMembersPage.tsx` (owner's call — no git ops by the agent) and delete the new `features/workspace/*` hook files; `api/*` is untouched so nothing else breaks.

**Reference — current data layer (from `WorkspaceMembersPage.tsx`):**
- Server state to move: `members`, `invites`, `loadingMembers`, `loadingInvites`, `membersError`, `invitesError`.
- Ephemeral UI staying as `useState`: `memberSearch`, `inviteSearch`, `inviteSearchResults`, `inviteSearchLoading`, `selectedUser`, `showDropdown`, `inviteRole`, `inviting`, `inviteError`, `inviteSuccess`, `resendSuccess`.
- Operations: `fetchMembers`, `fetchInvites`, silent refresh + 30s interval + focus listener, `handleRoleChange`, `handleRemove`, `handleInvite`, `handleResend`, `handleRevoke`, debounced `usersApi.search`, presence `onMemberOnline/onMemberOffline`.
- Derived: `currentUserMember`, `canManage` (gates the invites query), `onlineCount`, `filteredMembers`.

---

### Task 1.1: `useWorkspaceMembers` + `useWorkspaceInvites` query hooks

**Files:**
- Create: `apps/web/src/features/workspace/queries/useWorkspaceMembers.ts`
- Create: `apps/web/src/features/workspace/queries/useWorkspaceInvites.ts`

- [ ] **Step 1: Implement `useWorkspaceMembers.ts`**

```ts
import { useQuery } from "@tanstack/react-query"
import { workspacesApi } from "../../../api/workspaces"
import { workspaceKeys } from "./keys"

export function useWorkspaceMembers(workspaceId: string | undefined) {
  return useQuery({
    queryKey: workspaceKeys.members(workspaceId ?? ""),
    queryFn: () => workspacesApi.listMembers(workspaceId as string),
    enabled: !!workspaceId,
    refetchInterval: 30_000, // preserves the old silent 30s presence refresh
  })
}
```

- [ ] **Step 2: Implement `useWorkspaceInvites.ts`** (gated on `canManage`, mirroring the old `fetchInvites` guard)

```ts
import { useQuery } from "@tanstack/react-query"
import { invitesApi } from "../../../api/invites"
import { workspaceKeys } from "./keys"

export function useWorkspaceInvites(workspaceId: string | undefined, canManage: boolean) {
  return useQuery({
    queryKey: workspaceKeys.invites(workspaceId ?? ""),
    queryFn: () => invitesApi.list(workspaceId as string),
    enabled: !!workspaceId && canManage,
    refetchInterval: 30_000,
  })
}
```

- [ ] **Step 3: Typecheck** — `pnpm --filter @flowgrid/web typecheck` → PASS (hooks unused so far, but must compile).

- [ ] **Step 4: Checkpoint** — gate green, stop for owner.

---

### Task 1.2: Pessimistic member/invite mutation hooks

**Files:**
- Create: `apps/web/src/features/workspace/mutations/useUpdateMemberRole.ts`
- Create: `apps/web/src/features/workspace/mutations/useRemoveMember.ts`
- Create: `apps/web/src/features/workspace/mutations/useCreateInvite.ts`
- Create: `apps/web/src/features/workspace/mutations/useResendInvite.ts`
- Create: `apps/web/src/features/workspace/mutations/useRevokeInvite.ts`

All are **pessimistic**: await the server, then write the result into cache via `setQueryData` (spec §5). Errors propagate so the page surfaces `(err as Error).message` exactly as today.

- [ ] **Step 1: `useUpdateMemberRole.ts`**

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query"
import type { Role } from "@flowgrid/types"
import { workspacesApi, type WorkspaceMember } from "../../../api/workspaces"
import { workspaceKeys } from "../queries/keys"

export function useUpdateMemberRole(workspaceId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ memberId, role }: { memberId: string; role: Role }) =>
      workspacesApi.updateMember(memberId, role),
    onSuccess: (updated, { memberId }) => {
      qc.setQueryData<WorkspaceMember[]>(workspaceKeys.members(workspaceId), (prev) =>
        prev?.map((m) => (m.id === memberId ? { ...m, role: updated.role } : m)),
      )
    },
  })
}
```

- [ ] **Step 2: `useRemoveMember.ts`**

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { workspacesApi, type WorkspaceMember } from "../../../api/workspaces"
import { workspaceKeys } from "../queries/keys"

export function useRemoveMember(workspaceId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ memberId }: { memberId: string }) => workspacesApi.removeMember(memberId),
    onSuccess: (_void, { memberId }) => {
      qc.setQueryData<WorkspaceMember[]>(workspaceKeys.members(workspaceId), (prev) =>
        prev?.filter((m) => m.id !== memberId),
      )
    },
  })
}
```

- [ ] **Step 3: `useCreateInvite.ts`** (invalidate invites — server assigns id/expiry/status the client can't predict)

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query"
import type { Role } from "@flowgrid/types"
import { invitesApi } from "../../../api/invites"
import { workspaceKeys } from "../queries/keys"

export function useCreateInvite(workspaceId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: Role }) =>
      invitesApi.create(workspaceId, userId, role),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: workspaceKeys.invites(workspaceId) })
    },
  })
}
```

- [ ] **Step 4: `useResendInvite.ts`**

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { invitesApi, type WorkspaceInviteRecord } from "../../../api/invites"
import { workspaceKeys } from "../queries/keys"

export function useResendInvite(workspaceId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ inviteId }: { inviteId: string }) => invitesApi.resend(inviteId),
    onSuccess: (result, { inviteId }) => {
      qc.setQueryData<WorkspaceInviteRecord[]>(workspaceKeys.invites(workspaceId), (prev) =>
        prev?.map((i) => (i.id === inviteId ? { ...i, ...result.invite } : i)),
      )
    },
  })
}
```

- [ ] **Step 5: `useRevokeInvite.ts`**

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { invitesApi, type WorkspaceInviteRecord } from "../../../api/invites"
import { workspaceKeys } from "../queries/keys"

export function useRevokeInvite(workspaceId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ inviteId }: { inviteId: string }) => invitesApi.revoke(inviteId),
    onSuccess: (_void, { inviteId }) => {
      qc.setQueryData<WorkspaceInviteRecord[]>(workspaceKeys.invites(workspaceId), (prev) =>
        prev?.filter((i) => i.id !== inviteId),
      )
    },
  })
}
```

- [ ] **Step 6: Typecheck** → PASS. **Checkpoint** — stop for owner.

---

### Task 1.3: `useWorkspacePresenceSync` — first socket→cache write

**Files:**
- Create: `apps/web/src/features/workspace/realtime/useWorkspacePresenceSync.ts`

Replaces the inline `useWorkspaceSocket({ onMemberOnline, onMemberOffline })` reducers. Patches the cached members array's `online` boolean via `setQueryData` (spec §6 — gentlest socket→cache).

- [ ] **Step 1: Implement**

```ts
import { useQueryClient } from "@tanstack/react-query"
import { useWorkspaceSocket } from "../../../hooks/useWorkspaceSocket"
import { workspaceKeys } from "../queries/keys"
import type { WorkspaceMember } from "../../../api/workspaces"

export function useWorkspacePresenceSync(workspaceId: string | undefined) {
  const qc = useQueryClient()
  const setOnline = (userId: string, online: boolean) => {
    if (!workspaceId) return
    qc.setQueryData<WorkspaceMember[]>(workspaceKeys.members(workspaceId), (prev) =>
      prev?.map((m) => (m.userId === userId ? { ...m, online } : m)),
    )
  }
  useWorkspaceSocket(workspaceId, {
    onMemberOnline: ({ userId }) => setOnline(userId, true),
    onMemberOffline: ({ userId }) => setOnline(userId, false),
  })
}
```

> Uses the existing `useWorkspaceSocket` (no change to it) rather than the generic `useRealtimeCacheSync`, because that hook already owns the workspace socket lifecycle. The generic primitive is used for board events in Phase 3.

- [ ] **Step 2: Typecheck** → PASS. **Checkpoint** — stop for owner.

---

### Task 1.4: Rewire WorkspaceMembersPage to the hooks (delete old data layer)

**Files:**
- Modify: `apps/web/src/pages/WorkspaceMembersPage.tsx` (the component body at lines ~450–665; JSX below `return` is **untouched** except swapping the handler references and loading/error variable sources)

- [ ] **Step 1: Replace imports** — remove `workspacesApi`, `invitesApi` direct data imports where now wrapped (keep `usersApi`, `XLSX`, type imports). Add:

```ts
import { useWorkspaceMembers } from "../features/workspace/queries/useWorkspaceMembers"
import { useWorkspaceInvites } from "../features/workspace/queries/useWorkspaceInvites"
import { useUpdateMemberRole } from "../features/workspace/mutations/useUpdateMemberRole"
import { useRemoveMember } from "../features/workspace/mutations/useRemoveMember"
import { useCreateInvite } from "../features/workspace/mutations/useCreateInvite"
import { useResendInvite } from "../features/workspace/mutations/useResendInvite"
import { useRevokeInvite } from "../features/workspace/mutations/useRevokeInvite"
import { useWorkspacePresenceSync } from "../features/workspace/realtime/useWorkspacePresenceSync"
```

- [ ] **Step 2: Replace server-state `useState` + fetch/effects** (delete lines ~455–460 server-state states, the `fetchMembers`/`fetchInvites`/silent-refresh/interval/focus `useEffect`s ~507–565, and the inline `useWorkspaceSocket` ~498–505) with:

```ts
const membersQuery = useWorkspaceMembers(workspaceId)
const members = membersQuery.data ?? []
const loadingMembers = membersQuery.isLoading
const membersError = membersQuery.isError ? ((membersQuery.error as Error).message || "Failed to load members") : ""

const currentUserMember = members.find((m) => m.userId === user?.id)
const canManage = currentUserMember?.role === "OWNER" || currentUserMember?.role === "ADMIN"

const invitesQuery = useWorkspaceInvites(workspaceId, canManage)
const invites = invitesQuery.data ?? []
const loadingInvites = invitesQuery.isLoading
const invitesError = invitesQuery.isError ? ((invitesQuery.error as Error).message || "Failed to load invites") : ""

useWorkspacePresenceSync(workspaceId)

const updateRole = useUpdateMemberRole(workspaceId ?? "")
const removeMember = useRemoveMember(workspaceId ?? "")
const createInvite = useCreateInvite(workspaceId ?? "")
const resendInvite = useResendInvite(workspaceId ?? "")
const revokeInvite = useRevokeInvite(workspaceId ?? "")
```

> `filteredMembers`, `onlineCount`, `currentUserMember`, the `memberSearch` and all invite-form `useState`s stay exactly as they are — they're ephemeral UI / derived.

- [ ] **Step 3: Rewrite the handlers to call mutations** (preserve the exact UX: `alert` on role/remove/resend/revoke errors; success/error strings on invite)

```ts
const handleRoleChange = async (memberId: string, newRole: Role) => {
  try { await updateRole.mutateAsync({ memberId, role: newRole }) }
  catch (err: unknown) { alert((err as Error).message || "Failed to update role") }
}

const handleRemove = async (memberId: string) => {
  try { await removeMember.mutateAsync({ memberId }) }
  catch (err: unknown) { alert((err as Error).message || "Failed to remove member") }
}

const handleInvite = async (e: React.FormEvent) => {
  e.preventDefault()
  if (!workspaceId || !selectedUser) return
  setInviting(true); setInviteError(""); setInviteSuccess("")
  try {
    await createInvite.mutateAsync({ userId: selectedUser.id, role: inviteRole })
    setInviteSuccess(`Invite sent to ${selectedUser.name ?? selectedUser.email}`)
    setSelectedUser(null); setInviteSearch("")
  } catch (err: unknown) {
    setInviteError((err as Error).message || "Failed to send invite")
  } finally { setInviting(false) }
}

const handleResend = async (inviteId: string) => {
  try {
    await resendInvite.mutateAsync({ inviteId })
    setResendSuccess((prev) => ({ ...prev, [inviteId]: true }))
    setTimeout(() => setResendSuccess((prev) => ({ ...prev, [inviteId]: false })), 3000)
  } catch (err: unknown) { alert((err as Error).message || "Failed to resend invite") }
}

const handleRevoke = async (inviteId: string) => {
  try { await revokeInvite.mutateAsync({ inviteId }) }
  catch (err: unknown) { alert((err as Error).message || "Failed to revoke invite") }
}
```

> The invite-search debounce `useEffect` (lines ~586–606) and `handleSelectUser`, `handleExport` stay unchanged — search remains a local ephemeral concern this phase (optional future: convert to `workspaceKeys.userSearch` query; **not now**, YAGNI).

- [ ] **Step 4: Typecheck + lint** — `pnpm --filter @flowgrid/web typecheck && pnpm --filter @flowgrid/web lint`. Fix any unused-import / unused-variable errors (e.g. now-dead `useCallback`, `setMembers`). Expected: PASS, and the FRONTEND.md build-check rule (no leftover imports) satisfied.

- [ ] **Step 5: Build** — `pnpm --filter @flowgrid/web build` → PASS.

- [ ] **Step 6: Behavioral parity (manual)** — `pnpm --filter @flowgrid/web dev`, then on the Members page verify, identical to before:
  - members + invites load; loading and error states render the same;
  - change a role → persists, list updates, no flash;
  - remove a member → row disappears;
  - send an invite → success message, invite appears in pending list;
  - resend → "Resent" confirmation; revoke → invite disappears;
  - **two browsers**: log in as another member elsewhere → presence dot flips online/offline within the room;
  - switch tab away and back → no error, data still correct (focus refetch silent);
  - export to XLSX still works.

- [ ] **Step 7: Playwright parity** — run the existing members flow under `.playwright-mcp`; screenshots match pre-migration.

- [ ] **Step 8: Checkpoint** — global gate green + parity confirmed. Stop for owner's commit decision.

**Phase 1 success criteria:** Members page renders/behaves identically; zero server data in `useState` on this page; manual focus listener + interval deleted; presence flows through the cache; typecheck/lint/build/test all green; two-browser presence verified.

---

# PHASE 2 — Card-detail surfaces (prove optimistic + richer socket→cache)

**Objective:** Migrate the card-detail modal's comments and checklists to Query, introducing the **first optimistic mutations** (comment add, checklist toggle) with rollback, plus a `useCardRealtimeSync` using the generic primitive and the `updatedAt` version guard.

**Expected impact:** `CardDetailModal` + `AttachmentSection` converge on the convention; comment/checklist interactions become optimistic with safe rollback; the version guard ships in a real socket path.

**Rollback approach:** Revert the card-feature files and the modal's data wiring; the modal falls back to its current local-state path. `api/*` untouched.

**Tasks (file-by-file; detailed steps authored at execution time once Phase 1 has validated the hook shape — the pattern is now fixed by Phases 0–1, so these mirror it):**

- [ ] **Task 2.1** — `features/card/queries/{useCardDetail,useCardComments,useCardChecklists}.ts` (queries; `staleTime: Infinity`, socket-driven). Validation: typecheck + render test with mocked `api/comments`, `api/checklists`.
- [ ] **Task 2.2** — `features/card/mutations/useAddComment.ts` (**optimistic** via `optimisticListUpdate`, temp-id placeholder, `onSettled` invalidates `cardKeys.comments` to swap temp id for the server id). Validation: unit test the apply-reducer; manual add-with-forced-error rollback.
- [ ] **Task 2.3** — `features/card/mutations/useToggleChecklistItem.ts` (**optimistic** boolean flip + rollback). Validation: unit reducer test; manual toggle + offline-error rollback.
- [ ] **Task 2.4** — `features/card/realtime/useCardRealtimeSync.ts` using `useRealtimeCacheSync` + `upsertById` (version-guarded) for comment/checklist events. **Audit backend payloads include `updatedAt`** (open spec item #1); if a payload lacks it, add it server-side in `apps/api/src/routes/comments.ts` (minimal, additive). Validation: two-browser comment/checklist sync, no dupes/flicker.
- [ ] **Task 2.5** — Fold existing `AttachmentSection` Query usage into the `features/card` convention (key factory + folder). Validation: attachment upload/delete parity.
- [ ] **Checkpoint after each task** — global gate + parity; stop for owner.

**Phase 2 success criteria:** comment add / checklist toggle are optimistic with verified rollback; version guard drops a synthetically-stale event in a two-browser test; modal behavior identical; all gates green.

---

# PHASE 3 — BoardPage decomposition (the boss)

**Objective:** Replace `BoardPage`'s twin `setLists`/`setBoardCards` reducers with Query cache + `useBoardRealtimeSync`, delete the dedup guards, and split the component into data hooks + presentational columns. Sub-steps each independently deployable (spec §8).

**Expected impact:** `BoardPage` drops from 26 `useState`/1,300 lines to a thin composition shell (<300 lines target); 9 inline socket handlers + dedup guards removed; lists/cards/members/dep-graph all server-state in Query.

**Rollback approach:** Each sub-step (3a–3d) is reverted independently; never start the next until the current is parity-green.

- [ ] **Task 3a — Read path.** Add `features/board/queries/{useBoardDetail,useBoardLists,useBoardCards,useBoardMembers,useBoardDependencyGraph}.ts`. Render from query data while old `useState` remains as a thin shadow (queries are source of truth; delete the loader `useEffect`s). Cards cache shape: `Record<listId, CardSummary[]>` under `boardKeys.cards(boardId)` (spec §2 decision). Validation: board renders identically across kanban/calendar/timeline; typecheck/build.
- [ ] **Task 3b — Write path.** Convert mutations one operation at a time to `features/board/mutations/*` (`useCreateCard`, `useRenameCard`, `useMoveCard`, `useReorderCards`, `useCreateList`, `useRenameList`, `useReorderLists`, `useDeleteList`, `useDeleteCard`), each **optimistic** with rollback (these are the cheap/reversible ops). For move/reorder, check spec open item #2 — if the backend recomputes `position`, add `onSettled` invalidate of `boardKeys.cards`. Validation after each op: drag/create/rename/delete parity, no flash.
- [ ] **Task 3c — Socket path.** Replace all 9 inline handlers with `useBoardRealtimeSync(boardId, socket)` (generic primitive + `upsertById`/`removeById`/`reorderByIds`, version-guarded). **Delete the dedup guards** — idempotent upsert makes them redundant. Validation: two-browser create/move/reorder/delete of cards and lists; no dupes, no flicker, no stale overwrite (synthetic stale-event test).
- [ ] **Task 3d — Decompose + clean.** Extract `BoardColumns`/`ListColumn`/`CardTile` presentational components (ephemeral UI state only); delete dead `useState`/reducers. Validation: full board parity; `useState` count is ephemeral-only; Playwright board flows match.
- [ ] **Checkpoint after each sub-step** — global gate + two-browser parity; stop for owner.

**Phase 3 success criteria:** board fully on Query + cache-driven sockets; dedup guards gone; `BoardPage` <300 lines; two-client real-time verified across all entity ops; all gates green; UI identical.

---

# PHASE 4 — Long-tail + enforcement

**Objective:** Migrate remaining pages to the convention, shrink Zustand to client selections, and add a lint guard preventing regression to `useEffect`+axios data fetching.

**Expected impact:** One consistent pattern app-wide; `workspaceStore` holds only the active-workspace *selection* (list moves to `useWorkspaceList` query); a lint rule blocks the old pattern.

**Rollback approach:** Per-page reverts; lint rule introduced as `warn` first, promoted to `error` only after all pages pass.

- [ ] **Task 4.1** — Migrate `AllActivityPage`, `AllDeadlinesPage`, `DashboardPage`, `ProfilePage` (read-heavy leaves) to query hooks under their features. Validation: per-page parity.
- [ ] **Task 4.2** — Migrate `WorkspaceSettingsPage`, `WorkspacePage`, `AnalyticsPage`; finish `InboxPage`. Validation: per-page parity.
- [ ] **Task 4.3** — Move workspace *list* to `features/workspace/queries/useWorkspaceList.ts`; reduce `stores/workspaceStore.ts` to `{ activeWorkspaceId, setActiveWorkspaceId }` (selection only). Update consumers to read the list from the query and the selection from the store. Validation: workspace switcher parity; no server data left in the store.
- [ ] **Task 4.4** — Add an ESLint rule (custom `no-restricted-syntax` or a small local rule) forbidding `api.*`/`*Api.*` calls inside `useEffect` within `apps/web/src/pages/**`. Land as `warn`, fix stragglers, promote to `error`. Validation: `pnpm --filter @flowgrid/web lint` green; `grep -rn "useEffect" src/pages` shows no data-fetch effects.
- [ ] **Checkpoint after each task** — gate green; stop for owner.

**Phase 4 success criteria:** no `useEffect`+axios data fetch remains in `pages/`; Zustand holds only client selections; lint gate enforces the pattern; all gates green; UI identical throughout.

---

## Plan-wide definition of done
- Every page's server state lives only in TanStack Query; no duplication across Query/Zustand/`useState`.
- Socket events are cache writes; no socket payload in component state; dedup guards deleted.
- Mutations follow the pessimistic/optimistic split from spec §5.
- App builds, typechecks, lints, and unit tests pass after every phase; UI/UX/workflows unchanged at every checkpoint.
- No git operations performed by the agent at any point.

---

## Self-review notes (author check against spec)
- Spec §1 four-way split → enforced in Phase 1 (page), Phase 4.3 (Zustand shrink), and the lint rule (4.4). ✓
- Spec §2 keys → Task 0.3 (factories) + 0.3 test locks prefix hierarchy. ✓
- Spec §3 folders → feature structure used from Phase 1 on. ✓
- Spec §4 config → Task 0.4; per-domain `staleTime` applied at hooks (`Infinity` for board/card in P3/P2, `30s` members in P1). ✓
- Spec §5 mutation split → P1 pessimistic, P2/P3 optimistic via `optimisticListUpdate` (Task 0.5). ✓
- Spec §6 socket→cache → `useRealtimeCacheSync` + `upsertById` version guard (0.2, 0.5); P1 presence, P2 card, P3 board. ✓
- Spec §7 races → version guard (0.2), `cancelQueries` in `optimisticListUpdate` (0.5), reconnect invalidate (called out P3c). ✓
- Spec §8 BoardPage → Phase 3 sub-steps 3a–3d. ✓
- Spec §9 Redis → no task (correctly unchanged). ✓
- Spec §10 anti-patterns → encoded as validation/checkpoints + lint rule (4.4). ✓
- Spec open items (1 updatedAt audit, 2 position recompute, 3 presence home) → surfaced in Tasks 2.4, 3b, and 1.3 respectively. ✓
