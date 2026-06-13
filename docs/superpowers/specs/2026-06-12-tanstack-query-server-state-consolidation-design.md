# Server-State Consolidation: TanStack Query Architecture Migration

**Status:** Design / approved skeleton
**Author:** Staff/Principal review
**Date:** 2026-06-12
**Type:** Internal architecture & maintainability refactor — **no UI, feature, or workflow changes**

---

## 0. Context & Goal

FlowGrid is a Trello/Jira-style collaborative project-management SPA.

- **Frontend:** Vite + React 18 + React Router 6 + TypeScript (`apps/web`). *(Not Next.js — pure client SPA, so TanStack Query is unambiguously correct with no SSR/RSC caveats.)*
- **Backend:** Express + Prisma + PostgreSQL + Socket.IO + Upstash Redis (`apps/api`).
- **Shared types:** `packages/types`.

**The goal is maintainability, not speed.** The app already feels instant (optimistic updates exist). The disease is that server-state caching, optimistic logic, and socket reconciliation are hand-rolled and tangled — most visibly in `BoardPage.tsx` (~1,300 lines, 26 `useState`, 10 `useEffect`, 9 socket handlers writing the same two reducers as the mutations).

**Success metrics:** smaller components, one consistent server-state pattern, fewer stale-data/dedup bugs, easier onboarding, no server state duplicated across Query / Zustand / `useState`.

**Non-goals:** frontend rewrite, micro-perf, CRDTs/local-first sync engine, big-bang rewrite, Redis re-architecture.

### The enabling fact

The axios layer is **already a clean seam**: 18 thin domain modules in `src/api/*` (837 lines total), and `axiosInstance` already unwraps backend error messages so thrown errors carry `(err as Error).message`. **Every migration step is "wrap an existing api function in a query/mutation hook." The transport is never rewritten.** This de-risks the entire effort.

### Current adoption (why prior attempts stalled)

`@tanstack/react-query@5.45` + devtools are already installed; `queryClient.ts` is configured; but it's used in only **4 files** (`main.tsx`, `InboxPage`, `useNotifications`, `AttachmentSection`) while **39 files** use `useEffect`+axios. It stalled because the first targets were leaves with no forcing function to establish a reusable pattern. This plan front-loads a forcing function (a painful reference page) and visible value to inoculate against the same stall.

---

## 1. Target Architecture — Four-Way Responsibility Split

One rule per layer, zero overlap. **No server datum lives in more than one place.**

| Layer | Owns | Must never hold |
|---|---|---|
| **TanStack Query** | **All server state** — single source of truth for anything that came from the API (boards, lists, cards, members, invites, comments, checklists, notifications, analytics). Fetching, caching, background refetch, optimistic mutation + rollback, retry. | Ephemeral UI; client-only selections |
| **Socket.IO** | **Transport only** — a *write-driver* into the Query cache. Incoming event → `setQueryData`. | Any state. Socket payloads never land in `useState` again |
| **Zustand** | Cross-tree **client** state that isn't server data: the *active workspace selection*, global modal/command-palette open state. **Shrinks** — the workspace *list* moves to Query; only the active *selection id* stays. | Server data |
| **React `useState`** | Ephemeral UI only: form inputs, open/closed modal, hover, drag-in-progress, local toggles. | Anything that survives refresh or that another user cares about |

**The onboarding mantra (the whole refactor in one sentence):** *server data in `useState` → moves to TanStack Query; socket payload → becomes a `setQueryData` call; Zustand keeps only cross-tree client selections; `useState` keeps only ephemeral UI.*

---

## 2. Query Key Architecture

### Convention

- Keys are **arrays**, hierarchical, **broad → narrow**: `[domain, scopeId, sub-resource, sub-scopeId]`.
- One **key factory per domain**, co-located with that domain's hooks. Components and socket handlers import the factory — **never inline a raw array.** This is the rule that makes targeted `setQueryData` and surgical invalidation possible.
- Entity-detail keys are top-level (`['card', cardId]`) so a card opened from any context shares one cache entry.

### Factories

```ts
// features/board/queries/keys.ts
export const boardKeys = {
  all:      ['board'] as const,
  detail:   (boardId: string) => ['board', boardId] as const,
  lists:    (boardId: string) => ['board', boardId, 'lists'] as const,
  cards:    (boardId: string) => ['board', boardId, 'cards'] as const,        // all cards for board
  members:  (boardId: string) => ['board', boardId, 'members'] as const,
  depGraph: (boardId: string) => ['board', boardId, 'dependency-graph'] as const,
}

// features/card/queries/keys.ts
export const cardKeys = {
  detail:     (cardId: string) => ['card', cardId] as const,
  comments:   (cardId: string) => ['card', cardId, 'comments'] as const,
  checklists: (cardId: string) => ['card', cardId, 'checklists'] as const,
}

// features/workspace/queries/keys.ts
export const workspaceKeys = {
  all:     ['workspace'] as const,
  list:    () => ['workspace', 'list'] as const,
  detail:  (id: string) => ['workspace', id] as const,
  members: (id: string) => ['workspace', id, 'members'] as const,
  invites: (id: string) => ['workspace', id, 'invites'] as const,
}
```

### Cache hierarchy & the cards decision

**Decision: keep board cards as one cache entry per board (`boardKeys.cards(boardId)`), grouped by list on read** — mirroring today's `boardCards: Record<listId, CardSummary[]>`. Rationale: a board loads all cards together, drag moves cards *between* lists (a per-list key would force two-key writes on every drag), and socket reorder events target a list within the board. Per-list keys (`['board', id, 'cards', listId]`) are a future option only if a single board grows large enough to need per-column virtualization/pagination — **not now** (premature).

Invalidating `boardKeys.detail(boardId)` (prefix match) invalidates lists, cards, members, dep-graph together — used only on reconnect/hard-refresh, never on a normal mutation.

---

## 3. Folder Structure (feature-based)

Organize by **feature**, not by technical type. Each feature owns its keys, queries, mutations, and socket sync. The flat `src/api/*` transport layer **stays as-is** (it's already clean) and becomes the dependency that hooks call.

```
src/
  api/                         # UNCHANGED — thin axios transport, one file per domain
    cards.ts  boards.ts  lists.ts  workspaces.ts  invites.ts  ...
  lib/
    queryClient.ts             # global config (§4)
    socket.ts                  # UNCHANGED — socket factory
    cache/
      optimistic.ts            # buildOptimisticMutation() wrapper (§5)
      realtimeSync.ts          # useRealtimeCacheSync() primitive (§6)
      upsert.ts                # upsertById / removeById / reorderByIds cache helpers
  features/
    workspace/
      queries/keys.ts
      queries/useWorkspaceMembers.ts      # useQuery wrappers
      queries/useWorkspaceInvites.ts
      mutations/useUpdateMemberRole.ts     # useMutation wrappers
      mutations/useRemoveMember.ts
      mutations/useCreateInvite.ts
      realtime/useWorkspacePresenceSync.ts # socket → cache (online boolean)
    board/
      queries/{keys,useBoardDetail,useBoardLists,useBoardCards}.ts
      mutations/{useCreateCard,useMoveCard,useReorderCards,...}.ts
      realtime/useBoardRealtimeSync.ts
    card/
      queries/...  mutations/...  realtime/...
  hooks/                       # cross-feature/UI hooks only (useWindowWidth, useKeyboardShortcuts)
  stores/                      # Zustand — shrinks to client selections only
  pages/                       # thin: compose feature hooks + presentational components
  components/
```

**Naming:** `use<Resource>` for queries (`useWorkspaceMembers`), `use<Verb><Resource>` for mutations (`useUpdateMemberRole`), `use<Feature>RealtimeSync` for socket bridges. Hooks return the raw TanStack result; pages don't see `queryClient` or socket internals.

---

## 4. TanStack Query Standards

```ts
// lib/queryClient.ts
new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,           // see per-domain overrides below
      gcTime: 5 * 60_000,          // keep cache 5 min after last observer
      retry: (count, err) => !isAuthOrClientError(err) && count < 2,
      refetchOnWindowFocus: true,  // ON — replaces hand-rolled focus listeners
      refetchOnReconnect: true,    // ON — part of the reconnect reconciliation story (§6)
    },
    mutations: { retry: 0 },       // never auto-retry mutations (non-idempotent)
  },
})
```

**Challenge to current config:** today `refetchOnWindowFocus` is `false` and `staleTime` is 60s globally. Turning focus-refetch **on** lets us *delete* the manual `window.addEventListener('focus', refresh)` code (e.g. in WorkspaceMembersPage). With sockets live, a focus refetch is cheap insurance, not a flash source (data is usually unchanged → no re-render).

**Per-domain `staleTime` (override at the hook):**

| Data | staleTime | Why |
|---|---|---|
| Board lists/cards | `Infinity` (socket-driven) | Real-time keeps it fresh; refetch only on reconnect/mount. Never poll. |
| Card detail / comments / checklists | `Infinity` (socket-driven) | Same — driven by socket events |
| Workspace members / invites | `30_000` | Light real-time (presence only); short stale catches non-presence drift |
| Analytics / activity / deadlines | `60_000`–`5 * 60_000` | Reporting data, not real-time; tolerate staleness |
| Notifications | `Infinity` (socket-driven) | Per-user socket room already pushes these |

**Retry:** never retry auth (401) or client (4xx) errors; retry transient network/5xx up to 2×. Mutations never auto-retry.

**Rule:** real-time entities use `staleTime: Infinity` + socket writes + reconnect-invalidate. Polling is banned where a socket already exists (would double-source the data).

---

## 5. Mutation Architecture

### Two mutation shapes — choose deliberately

| Shape | Use for | Lifecycle |
|---|---|---|
| **Pessimistic** (await → write cache) | Permission-sensitive, server-authoritative, low-frequency, side-effectful: member role/remove, invites, deletes-with-cascade, uploads, anything touching visibility/permissions | `mutationFn` awaits server → `onSuccess` writes returned entity into cache via `setQueryData` (or invalidates if the server computed fields) |
| **Optimistic** (write cache → await → rollback on error) | Cheap, reversible, high-frequency, low-conflict: card create/rename/move/reorder, list create/rename/reorder, label toggle, checklist tick, comment add | `onMutate` snapshot + patch → `onError` rollback → `onSettled` reconcile |

**Do not make membership/permission mutations optimistic** — showing a role flip before the server authorizes it is a correctness/security-UX bug, and these are rare enough that latency is irrelevant.

### Optimistic wrapper (the standard lifecycle)

```ts
// lib/cache/optimistic.ts — conceptual shape
buildOptimisticMutation({
  mutationFn,
  queryKey,                         // the cache entry to patch
  applyOptimistic(prev, vars),      // pure: returns next cache value
  // lifecycle (TanStack):
  onMutate: async (vars) => {
    await queryClient.cancelQueries({ queryKey })      // stop in-flight refetch clobber
    const snapshot = queryClient.getQueryData(queryKey)
    queryClient.setQueryData(queryKey, prev => applyOptimistic(prev, vars))
    return { snapshot }
  },
  onError: (_e, _vars, ctx) => queryClient.setQueryData(queryKey, ctx.snapshot), // rollback
  onSettled: () => {/* usually nothing — socket echo reconciles; invalidate only if server-computed */},
})
```

### Error handling convention

- Mutations **throw** the backend message (axios interceptor already provides it). Components surface it via the mutation's `error`/`onError` — never via raw `useState` error strings copied around.
- Rollback is **always** via the `onMutate` snapshot; never reconstruct prior state manually.
- `onSettled` invalidation is the exception, not the rule — only when the server returns computed fields the client can't predict (e.g. a recomputed `position` or denormalized counts).

---

## 6. Socket.IO → Query Cache Synchronization

### Principle

Socket events are **cache writes, not state.** A feature mounts exactly one `use<Feature>RealtimeSync` hook that subscribes to the relevant events and translates each into a `setQueryData` on the matching key. Components never read socket payloads directly.

```ts
// features/board/realtime/useBoardRealtimeSync.ts — conceptual
useBoardRealtimeSync(boardId) {
  useRealtimeCacheSync(boardId, {
    'card:created':   (card)  => upsertCardIntoCache(boardId, card),
    'card:updated':   (card)  => upsertCardIntoCache(boardId, card),   // version-guarded
    'card:moved':     (card)  => moveCardInCache(boardId, card),
    'card:deleted':   ({id})  => removeCardFromCache(boardId, id),
    'card:reordered': ({listId, cardIds}) => reorderCardsInCache(boardId, listId, cardIds),
    'list:created' | 'list:updated' | 'list:reordered' | 'list:deleted': ...,
  })
}
```

### Cache update patterns

- **created/updated** → `upsertById` (replace if id present, else insert). This is **idempotent**, which is the key win.
- **deleted** → `removeById`.
- **moved** → remove from old list array, insert into new (by `position`/order).
- **reordered** → replace the ordering array for that list.

### Deduplication — the guards disappear

Today the server echoes events to the sender too (sender receives its own events; `BoardPage` has manual "guard against the socket handler having already inserted this card" checks). With **key-based `upsertById`, your optimistic write and the echoed socket write converge to the same value idempotently** — so the manual dedup guards are *deleted*, not ported. This is one of the larger maintainability wins.

### Event versioning (stale-overwrite prevention)

Socket payloads carry `updatedAt` (confirmed: `CardSummary`/list/comment types all have `updatedAt`; `cards.ts` emits it). `upsertById` **compares `updatedAt` and ignores an incoming event older than the cached entity.** This prevents a late/out-of-order socket event from clobbering a newer optimistic or already-applied value.

> ⚠️ **Verify per event type** that the backend includes `updatedAt` in *every* broadcast payload (cards confirmed; audit lists/comments/checklists during implementation). Where a payload is append-only with no `updatedAt` (e.g. activity log), versioning is unnecessary — those are insert-only.

### Reconnection handling

On socket reconnect, the client may have **missed events while offline.** Reconnect handler invalidates the board's queries (`boardKeys.detail(boardId)`, `refetchType: 'active'`) to reconcile from the server. **This is the one place invalidation-as-primary is correct** — everywhere else, direct cache writes win (invalidate-on-every-event would cause the refetch flashes the existing FRONTEND.md optimistic-update rule warns against). `refetchOnReconnect: true` (§4) backstops this.

---

## 7. Race-Condition Prevention (summary table)

| Race | Mechanism |
|---|---|
| **Concurrent mutations** on same entity | `cancelQueries` in `onMutate` stops an in-flight refetch from overwriting a newer optimistic value; snapshots stack correctly via per-mutation context |
| **Optimistic conflict** (mutation fails) | `onError` restores the `onMutate` snapshot exactly |
| **Out-of-order socket events** | `updatedAt` version guard in `upsertById` — older event ignored |
| **Stale overwrite from refetch** | `staleTime: Infinity` on socket-driven data + `cancelQueries` during mutation; background refetch can't clobber live cache |
| **Missed events while disconnected** | Reconnect → invalidate board queries (§6) |
| **Self-echo double-apply** | Idempotent `upsertById` (§6) |

---

## 8. BoardPage Migration Design (Phase 3 — the boss)

### Today's tangle

`BoardPage` holds `lists` and `boardCards` in `useState`, written by **both** ~12 mutation/handler functions **and** 9 socket handlers — hence the manual dedup guards and the 26-state god component.

### Target decomposition

Replace the two reducers with cache + the proven primitives. The component splits into:

1. **Data hooks** (`features/board/queries/*`, `mutations/*`): `useBoardDetail`, `useBoardLists`, `useBoardCards`, plus `useCreateCard`, `useMoveCard`, `useReorderCards`, `useCreateList`, etc. Each is a thin wrapper over the existing `api/*` function + the §5 wrapper.
2. **One realtime hook**: `useBoardRealtimeSync(boardId)` (§6) — replaces all 9 inline socket handlers and their dedup guards.
3. **Presentational components**: `BoardColumns`, `ListColumn`, `CardTile` — receive data + callbacks as props, hold only **ephemeral UI** state (drag-in-progress, inline-edit input). No data fetching.
4. **`BoardPage`** becomes a thin composition shell: route params → feature hooks → presentational tree + view switch (kanban/calendar/timeline). Target: well under 300 lines.

### Data ownership boundaries (what moves vs stays)

| Stays `useState` (ephemeral UI) | Moves to TanStack Query (server state) |
|---|---|
| `activeCard` (drag in progress), `openCardId` (which modal), `boardView`, `shortcutsOpen`, `accessPanelOpen`, `addMemberSearch`, column width/height measurements, `capNotice` | `board`, `lists`, `boardCards`, `boardMembers`, `allWsMembers`, dependency graph, `blockedCardIds` (derived from dep-graph query) |

`onlineMemberIds` → derived from the presence sync (cache or a small Zustand presence slice), not page state.

### Incremental strategy *within* Phase 3 (still deployable mid-way)

BoardPage is migrated **read-path first, then write-path, then socket-path** — each independently shippable:

1. **3a:** Introduce `useBoardLists` + `useBoardCards` queries; feed existing render from query data while the old `useState` still exists behind them (queries seed state). Ship.
2. **3b:** Convert mutations one operation at a time (create card → move → reorder → lists…), each switching from `setBoardCards` to the mutation hook. Ship after each.
3. **3c:** Replace the 9 inline socket handlers with `useBoardRealtimeSync`; delete dedup guards. Ship.
4. **3d:** Delete the now-dead `useState` reducers; extract presentational components. Ship.

At no point is the board non-functional, and the diff is reviewable in small pieces.

---

## 9. Redis Recommendations

**Keep current usage exactly as-is for this project.** Sessions, refresh tokens, rate-limiting, and presence are correct and **orthogonal** to a frontend state refactor. Adding Redis caching or app-data pub/sub now is scope creep against the stated non-goals.

**Document, don't build — the future scaling blocker:** the Socket.IO server is a **single in-memory instance**; presence is in Redis but the event fan-out (`io.to(boardId).emit`) is in-process. The moment you run **2+ API instances**, a user on instance A won't receive events emitted on instance B. The fix is `@socket.io/redis-adapter` — which needs a **persistent TCP Redis pub/sub connection**, and the current `@upstash/redis` **REST** client **cannot serve it.** So a future multi-instance deploy requires either Upstash's TCP-compatible Redis endpoint or a different Redis for the adapter.

**This is explicitly a non-goal here** (scaling, not maintainability). Recorded so it isn't a surprise; **premature to act on now.**

---

## 10. Anti-Patterns to Avoid

- **Duplicating server state.** The cardinal sin: a card living in Query *and* `useState` *and* Zustand. After migrating a slice, **delete** the old `useState`/store copy in the same PR.
- **`invalidateQueries` on every socket event.** Causes refetch flashes; use direct `setQueryData`. Invalidate only on reconnect/hard-refresh.
- **Inline query keys.** Always go through the factory or targeted writes silently miss.
- **Optimistic membership/permission/delete-cascade mutations.** Correctness > snappiness there.
- **Porting the dedup guards.** They become dead code under idempotent `upsertById` — delete them.
- **Polling alongside sockets.** Double-sources data and fights the cache.
- **Mutations auto-retrying.** Non-idempotent → duplicate side effects.
- **Putting socket payloads into component state.** Always cache writes.
- **Zustand creep.** If it came from the API, it's not Zustand's. Active-workspace *selection* stays; the workspace *list* does not.
- **Big mixed PRs.** Each phase/sub-step must be independently deployable and UI-identical.

**Highest regression-risk areas:** (1) BoardPage socket reconciliation (Phase 3c) — guard with the version check and manual two-client testing; (2) drag-reorder position reconciliation (server may recompute `position` → may need `onSettled` invalidate); (3) presence flicker on WorkspaceMembersPage if presence sync and member query disagree on identity (`userId` vs member `id`).

---

## 11. Phased Implementation Plan

Every phase is independently deployable, UI-identical, and reviewable. Order chosen to **prove the two hard patterns (pessimistic+query, then optimistic+socket) on low-risk surfaces before BoardPage assembles them.**

### Phase 0 — Foundation primitives (additive, zero behavior change)
**Deliverables:** `queryClient.ts` config (§4); `lib/cache/{optimistic,realtimeSync,upsert}.ts`; one query-key factory file per domain; `features/` scaffolding.
**Success:** builds & deploys; primitives unit-tested in isolation; no page imports them yet (dead but live code).
**Rollback:** delete the new files — nothing references them.

### Phase 1 — WorkspaceMembersPage (reference implementation)
**Why first:** complex CRUD, meaningful workflows, *light* real-time (presence boolean), low blast radius — exposes query/mutation/key weaknesses before BoardPage.
**Deliverables:** `useWorkspaceMembers`, `useWorkspaceInvites` queries; `useUpdateMemberRole`, `useRemoveMember`, `useCreateInvite` **pessimistic** mutations; `useWorkspacePresenceSync` (first socket→cache, the `online` boolean); **delete the manual focus-refetch listener**; page drops from 21 `useState` to ephemeral-UI-only.
**Success:** page behaves identically (manual + Playwright parity); zero server data in `useState`; focus refetch works via TanStack; presence updates via cache; member CRUD round-trips with backend error messages surfaced.
**Rollback:** revert the page file + delete its feature hooks; transport `api/*` untouched.

### Phase 2 — Card-detail surfaces (prove the optimistic+socket path)
**Why second:** comment-add / checklist-tick are cheap, reversible, high-frequency — the *correct* first home for the optimistic wrapper, plus richer socket events than presence.
**Deliverables:** `useCardDetail`, `useCardComments`, `useCardChecklists` queries; **optimistic** `useAddComment`, `useToggleChecklistItem` (+ rollback); `useCardRealtimeSync` for comment/checklist events with `updatedAt` versioning; migrate `AttachmentSection` (already partly TanStack) into the convention.
**Success:** optimistic add shows instantly, rolls back on forced error; two-browser test shows convergence with no duplicate/flicker; version guard drops a stale event in test.
**Rollback:** revert card-feature files; modal falls back to current local-state path.

### Phase 3 — BoardPage decomposition (the boss, now mechanical)
**Why third:** both patterns are proven; this becomes assembly, not invention. Sub-steps 3a→3d (§8) each deployable.
**Deliverables:** board queries + mutations; `useBoardRealtimeSync` replacing 9 inline handlers; dedup guards deleted; presentational `BoardColumns`/`ListColumn`/`CardTile`; `BoardPage` < 300 lines.
**Success:** full board parity across kanban/calendar/timeline; two-client real-time test (create/move/reorder/delete) with no flicker, no dupes, no stale overwrite; `useState` count drops from 26 to ephemeral-only.
**Rollback:** per sub-step revert; each 3a–3d ships behind a green parity check before the next starts.

### Phase 4 — Long-tail + enforcement
**Deliverables:** migrate `AllActivityPage`, `AllDeadlinesPage`, `DashboardPage`, `ProfilePage`, `WorkspaceSettingsPage`, `WorkspacePage`, `AnalyticsPage`, `InboxPage` (finish) to the convention; shrink `workspaceStore` to active-selection only; **ESLint rule** forbidding `api.*` calls inside `useEffect` in `pages/` (prevents regression to the old pattern); remove dead code.
**Success:** `grep` shows no `useEffect`+axios data-fetch in `pages/`; one consistent pattern; lint gate green.
**Rollback:** per-page reverts; lint rule warn-only first, then error.

### Keeping the UI identical throughout
- **No JSX/styles/copy changes** in a migration PR — data *source* changes, render does not. Enforced in review.
- **Playwright parity** before/after each phase (you already have `.playwright-mcp` flows): same screenshots, same interactions.
- **Two-browser manual smoke** for any phase touching sockets (1, 2, 3c).
- **Feature-by-feature, deploy-after-each** — never a phase that leaves a page half-migrated across a deploy boundary.

---

## Open items to confirm during implementation
1. Audit that **every** socket broadcast payload (lists, comments, checklists) carries `updatedAt` for the version guard (cards confirmed).
2. Confirm whether the backend **recomputes `position`** on move/reorder (decides whether reorder mutations need `onSettled` invalidate).
3. Decide where `onlineMemberIds`/presence lives long-term: derived from a presence query vs a thin Zustand presence slice (lean: cache-derived).
