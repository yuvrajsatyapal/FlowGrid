# Plan: Feature #13 — Real-time Collaboration (WebSockets)

**Spec**: .planning/specs/13-realtime-collaboration-websockets.md
**Epic**: FlowGrid SaaS — 20 Features
**Created**: 2026-06-01
**Status**: draft

---

## Stack Detection

Full-stack feature: Node.js/Express API + React/Vite frontend.
Backend first, then frontend.

---

## Architecture Overview

### How `io` reaches route handlers

`socket.io` is already installed in `apps/api`. The `io` instance is created in `index.ts` but currently a stub. The plan extracts socket setup into `apps/api/src/lib/socket.ts`, which exports module-level functions (`emitBoardEvent`, presence helpers). Route handlers import these functions; no circular dependency.

```
index.ts
  └── initSocket(httpServer) → apps/api/src/lib/socket.ts
        ├── io.use()        auth middleware
        ├── io.on('connection') → board:join / board:leave / disconnect
        ├── emitBoardEvent(boardId, event, payload)  ← imported by routes
        └── addPresence / removePresence / getPresence  ← Redis helpers
```

### Frontend socket lifecycle

A socket is created per `BoardPage` mount, not a global singleton. This avoids stale auth-token and multi-board interference.

```
BoardPage
  └── useBoardSocket(boardId)
        ├── createBoardSocket(accessToken)  ← apps/web/src/lib/socket.ts
        ├── socket.emit('board:join', { boardId })  on 'connect'
        ├── socket.emit('board:leave', { boardId }) on cleanup
        ├── event handlers → callbacks update BoardPage state
        └── returns { onlineUsers, socket }

BoardPage → passes socket prop to CardDetailModal
CardDetailModal → subscribes to comment:* events filtered by cardId
```

---

## Components Table

| Component | Type | Location | Purpose |
|-----------|------|----------|---------|
| `initSocket` | Server lib | `apps/api/src/lib/socket.ts` | Wires auth middleware, room handlers, presence logic |
| `emitBoardEvent` | Server lib | `apps/api/src/lib/socket.ts` | Broadcasts a mutation event to a board room |
| `addPresence` / `removePresence` / `getPresence` | Server lib | `apps/api/src/lib/socket.ts` | Redis-backed presence management |
| `createBoardSocket` | Client lib | `apps/web/src/lib/socket.ts` | Factory that creates a configured `socket.io-client` instance |
| `useBoardSocket` | React hook | `apps/web/src/hooks/useBoardSocket.ts` | Manages socket lifecycle, room join/leave, event → state updates |
| `BoardPresence` | React component | `apps/web/src/components/boards/BoardPresence.tsx` | Renders avatar row of online users in board header |

---

## File Locations Table

### New Files

| File | Purpose |
|------|---------|
| `apps/api/src/lib/socket.ts` | `initSocket`, `emitBoardEvent`, Redis presence helpers |
| `apps/web/src/lib/socket.ts` | `createBoardSocket(token)` factory |
| `apps/web/src/hooks/useBoardSocket.ts` | Full socket lifecycle hook |
| `apps/web/src/components/boards/BoardPresence.tsx` | Online users avatar row |

### Files to Change

| File | What Changes | Why |
|------|-------------|-----|
| `apps/api/src/lib/redis.ts` | Add `boardPresenceUsers` and `boardPresenceCounts` key patterns | Presence uses two Redis Hashes per board |
| `apps/api/src/index.ts` | Replace inline `io` + stub handler with `initSocket(httpServer)` | Moves all socket logic into `lib/socket.ts` |
| `apps/api/src/routes/cards.ts` | Add `emitBoardEvent` calls to create, update, move, delete | Broadcast card mutations |
| `apps/api/src/routes/lists.ts` | Add `emitBoardEvent` calls to create, update, reorder, delete | Broadcast list mutations |
| `apps/api/src/routes/comments.ts` | Add `emitBoardEvent` calls to create, update, delete | Broadcast comment mutations |
| `packages/types/src/index.ts` | Add `PresenceUser` interface | Shared type for presence users |
| `apps/web/src/pages/BoardPage.tsx` | Mount `useBoardSocket`, apply state updates, render `<BoardPresence />` | Live board updates |
| `apps/web/src/components/boards/CardDetailModal.tsx` | Subscribe to `comment:*` events via socket prop | Live comment updates |

---

## Task Breakdown

### Phase 1 — Shared Types (no dependencies)

| # | Task | Files | What to verify |
|---|------|-------|---------------|
| 1 | Add `PresenceUser` to shared types | `packages/types/src/index.ts` | `tsc --noEmit` passes on both apps |

**`PresenceUser` interface:**
```typescript
export interface PresenceUser {
  userId: string
  name: string | null
  avatarUrl: string | null
}
```

Note: `CommentWithAuthor` from the spec is **not needed** — `CommentResponse` already exists in this file and exactly matches `formatComment()`'s output shape. Use `CommentResponse` for comment socket events.

---

### Phase 2 — Backend Server Layer (sequential: 2 → 3 → 4)

| # | Task | Files | What to verify |
|---|------|-------|---------------|
| 2 | Add presence Redis key patterns | `apps/api/src/lib/redis.ts` | Keys exported, no TS errors |
| 3 | Create `apps/api/src/lib/socket.ts` | `apps/api/src/lib/socket.ts` | `tsc --noEmit` passes |
| 4 | Wire `initSocket` into `index.ts` | `apps/api/src/index.ts` | Server starts, no errors on console |

**Task 2 — Redis key additions:**
```typescript
// Add to redisKeys in apps/api/src/lib/redis.ts
boardPresenceUsers: (boardId: string) => `board:${boardId}:presence:users`,
boardPresenceCounts: (boardId: string) => `board:${boardId}:presence:counts`,
```

**Task 3 — `apps/api/src/lib/socket.ts` full spec:**

```typescript
import http from 'http'
import { Server } from 'socket.io'
import { env } from '../config/env'
import { verifyAccessToken } from './jwt'
import { redis, redisKeys } from './redis'
import { prisma } from './prisma'
import type { PresenceUser } from '@flowgrid/types'

let io: Server

export function initSocket(httpServer: http.Server): Server {
  io = new Server(httpServer, {
    cors: { origin: env.CORS_ORIGIN, credentials: true },
  })

  // 1. Auth middleware — rejects connections with missing/expired JWT
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined
    if (!token) return next(new Error('AUTH_REQUIRED'))
    try {
      const payload = verifyAccessToken(token)
      socket.data.user = { id: payload.sub, email: payload.email }
      next()
    } catch {
      next(new Error('AUTH_INVALID'))
    }
  })

  // 2. Connection handler
  io.on('connection', (socket) => {
    const userId = socket.data.user?.id as string | undefined
    if (!userId) return

    socket.on('board:join', async ({ boardId }: { boardId: string }) => {
      // Validate board access (two-layer check matching resolveCardAccess)
      const board = await prisma.board.findUnique({
        where: { id: boardId },
        select: { id: true, workspaceId: true, visibility: true, deletedAt: true },
      })
      if (!board || board.deletedAt) {
        socket.emit('board:error', { code: 'NOT_FOUND', message: 'Board not found' })
        return
      }
      const member = await prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId: board.workspaceId, userId } },
      })
      if (!member) {
        socket.emit('board:error', { code: 'ACCESS_DENIED', message: 'Access denied' })
        return
      }
      if (board.visibility === 'PRIVATE') {
        const boardMember = await prisma.boardMember.findUnique({
          where: { boardId_userId: { boardId: board.id, userId } },
        })
        if (!boardMember) {
          socket.emit('board:error', { code: 'ACCESS_DENIED', message: 'Access denied' })
          return
        }
      }

      socket.join(boardId)
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, avatarUrl: true },
      })
      if (user) {
        const users = await addPresence(boardId, { userId: user.id, name: user.name, avatarUrl: user.avatarUrl })
        io.to(boardId).emit('board:presence', { boardId, users })
      }
    })

    socket.on('board:leave', async ({ boardId }: { boardId: string }) => {
      socket.leave(boardId)
      const users = await removePresence(boardId, userId)
      io.to(boardId).emit('board:presence', { boardId, users })
    })

    socket.on('disconnect', async () => {
      // socket.rooms already reflects the state before disconnection per Socket.IO docs
      const boardIds = [...socket.rooms].filter((r) => r !== socket.id)
      for (const boardId of boardIds) {
        const users = await removePresence(boardId, userId)
        io.to(boardId).emit('board:presence', { boardId, users })
      }
    })
  })

  return io
}

export function emitBoardEvent(boardId: string, event: string, payload: unknown): void {
  io.to(boardId).emit(event, payload)
}

// ── Presence helpers ──────────────────────────────────────────────────────────

async function addPresence(boardId: string, user: PresenceUser): Promise<PresenceUser[]> {
  const usersKey = redisKeys.boardPresenceUsers(boardId)
  const countsKey = redisKeys.boardPresenceCounts(boardId)
  await redis.hincrby(countsKey, user.userId, 1)
  await redis.hset(usersKey, { [user.userId]: JSON.stringify(user) })
  return getPresence(boardId)
}

async function removePresence(boardId: string, userId: string): Promise<PresenceUser[]> {
  const usersKey = redisKeys.boardPresenceUsers(boardId)
  const countsKey = redisKeys.boardPresenceCounts(boardId)
  const newCount = await redis.hincrby(countsKey, userId, -1)
  if (newCount <= 0) {
    await redis.hdel(usersKey, userId)
    await redis.hdel(countsKey, userId)
  }
  return getPresence(boardId)
}

async function getPresence(boardId: string): Promise<PresenceUser[]> {
  const usersKey = redisKeys.boardPresenceUsers(boardId)
  const raw = await redis.hgetall(usersKey)
  if (!raw) return []
  return Object.values(raw).map((v) => JSON.parse(v as string) as PresenceUser)
}
```

**Task 4 — `apps/api/src/index.ts` diff:**
- Add `import { initSocket } from './lib/socket'`
- Remove: `const io = new Server(httpServer, { cors: {...} })`
- Remove: `io.on('connection', (socket) => { socket.on('disconnect', () => {}) })`
- Add: `initSocket(httpServer)` (before routes, after `app` is created)

---

### Phase 3 — Backend Route Broadcasts (parallel: 5, 6, 7 can be done together)

| # | Task | Files | What to verify |
|---|------|-------|---------------|
| 5 | Emit card events in cards routes | `apps/api/src/routes/cards.ts` | All 4 mutations emit; boardId always resolved before delete |
| 6 | Emit list events in lists routes | `apps/api/src/routes/lists.ts` | All 4 mutations emit; boardId from `access.board.id` |
| 7 | Emit comment events in comments routes | `apps/api/src/routes/comments.ts` | All 3 mutations emit; boardId from `access.board.id` |

**Task 5 — cards.ts emit points:**

Add `import { emitBoardEvent } from '../lib/socket'` at top.

| Route | Emit after | Event | Payload |
|-------|-----------|-------|---------|
| `POST /` (create) | `res.status(201).json(...)` line | `card:created` | `formatCard(card)` — assignee/labels are null at create time; fetch them or emit without (no assignee/labels on creation) |
| `POST /update` | `res.json(...)` line | `card:updated` | `formatCard(updated, updatedAssignee, updatedLabels)` |
| `POST /move` | `res.json(...)` line | `card:moved` | `formatCard(moved, movedAssignee, movedLabels)` |
| `POST /delete` | after `prisma.card.update(deletedAt)` | `card:deleted` | `{ id: cardId }` |

For `card:created`: the card is created without assignee/labels included in the Prisma `create`. Add `include: { assignee: {...}, labels: { include: { label: true } } }` to the `create` call so `formatCard` has full data.

For `card:deleted`: `access.board.id` is resolved by `resolveListAccess` BEFORE the delete — emit `{ id: cardId }` after the soft-delete.

Emit calls go **before** `res.json()`:
```typescript
emitBoardEvent(access.board.id, 'card:created', formatCard(card, null, []))
res.status(201).json({ card: formatCard(card, null, []) })
```

**Task 6 — lists.ts emit points:**

Add `import { emitBoardEvent } from '../lib/socket'` at top.

| Route | Emit after | Event | Payload |
|-------|-----------|-------|---------|
| `POST /` (create) | before `res.json(...)` | `list:created` | full list object |
| `POST /update` | before `res.json(...)` | `list:updated` | full updated list object |
| `POST /reorder` | before `res.json(...)` | `list:reordered` | `{ lists: updatedListsArray }` — fetch all board lists after reorder to emit canonical order |
| `POST /delete` | after soft-delete, before `res.json(...)` | `list:deleted` | `{ id: listId }` |

For `list:reordered`: the route currently returns `{ success: true }`. After reordering, fetch all non-deleted lists for the board ordered by position, then emit `{ lists }`.

**Task 7 — comments.ts emit points:**

Add `import { emitBoardEvent } from '../lib/socket'` at top.

| Route | Emit after | Event | Payload |
|-------|-----------|-------|---------|
| `POST /` (create) | before `res.status(201).json(...)` | `comment:created` | `formatComment(comment)` |
| `POST /update` | before `res.json(...)` | `comment:updated` | `formatComment(updated)` |
| `POST /delete` | after soft-delete, before `res.json(...)` | `comment:deleted` | `{ id: commentId, cardId: comment.cardId }` |

For `comment:delete`: the route must fetch the comment FIRST (to get `cardId` → `board.id`), THEN delete. Check if the existing delete handler already does this. If so, `access.board.id` is available. If not, add the fetch.

---

### Phase 4 — Frontend Setup (sequential: 8 → 9 → 10)

| # | Task | Files | What to verify |
|---|------|-------|---------------|
| 8 | Install `socket.io-client` | `apps/web/package.json` | `pnpm add socket.io-client` succeeds |
| 9 | Create frontend socket factory | `apps/web/src/lib/socket.ts` | No TS errors, imports work |
| 10 | Create `useBoardSocket` hook | `apps/web/src/hooks/useBoardSocket.ts` | Hook compiles, events list is complete |

**Task 9 — `apps/web/src/lib/socket.ts`:**
```typescript
import { io, type Socket } from 'socket.io-client'

export function createBoardSocket(token: string): Socket {
  return io({
    auth: { token },
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
  })
}
```

The socket connects to the same origin. Vite dev proxy handles `/socket.io/*` transparently (Socket.IO uses its own path, not `/api/*` — verify Vite proxy doesn't interfere; if it does, pass `path: '/socket.io'` explicitly).

**Task 10 — `apps/web/src/hooks/useBoardSocket.ts` interface:**

```typescript
import type { CardSummary } from '../api/cards'
import type { ListSummary } from '../api/lists'
import type { CommentResponse } from '@flowgrid/types'
import type { PresenceUser } from '@flowgrid/types'

interface BoardSocketHandlers {
  onCardCreated?: (card: CardSummary) => void
  onCardUpdated?: (card: CardSummary) => void
  onCardMoved?: (card: CardSummary) => void
  onCardDeleted?: (payload: { id: string }) => void
  onListCreated?: (list: ListSummary) => void
  onListUpdated?: (list: ListSummary) => void
  onListReordered?: (payload: { lists: ListSummary[] }) => void
  onListDeleted?: (payload: { id: string }) => void
}

export function useBoardSocket(
  boardId: string | undefined,
  handlers: BoardSocketHandlers,
): { onlineUsers: PresenceUser[]; socket: Socket | null }
```

Hook internals:
- Get `accessToken` from `useAuth()` (AuthContext)
- On `boardId` or `accessToken` change: create socket via `createBoardSocket(accessToken)`, connect, emit `board:join` on `'connect'` event (handles initial connect + auto-reconnect)
- Register handlers via `socket.on(...)`
- Cleanup: `socket.emit('board:leave', { boardId })` + `socket.off()` + `socket.disconnect()`
- Return `{ onlineUsers, socket }` — `socket` is used by `CardDetailModal` for comment events

Note: when `accessToken` rotates (every 14 min), the running socket has an old token. For this release, this is acceptable: the socket stays connected until the next page navigation. A future enhancement could call `socket.auth = { token: newToken }` on token refresh.

---

### Phase 5 — Frontend UI Integration (11 parallel with 12/13 sequential)

| # | Task | Files | What to verify |
|---|------|-------|---------------|
| 11 | Create `BoardPresence` component | `apps/web/src/components/boards/BoardPresence.tsx` | Renders avatars, +N overflow, no TS errors |
| 12 | Wire `useBoardSocket` into `BoardPage` | `apps/web/src/pages/BoardPage.tsx` | All 8 card/list events update board state correctly |
| 13 | Wire comment events into `CardDetailModal` | `apps/web/src/components/boards/CardDetailModal.tsx` | Comment create/update/delete updates comment list |

**Task 11 — `BoardPresence` props:**
```typescript
interface BoardPresenceProps {
  users: PresenceUser[]
}
```
- Map over `users.slice(0, 5)` → render avatar circle using `getInitials()` + `getAvatarBg()` from `utils/avatar.ts`
- If `users.length > 5` → append `+{users.length - 5}` badge
- Render inline in `BoardPage` header (existing header row, right side)

**Task 12 — `BoardPage` changes:**

```typescript
const { onlineUsers, socket } = useBoardSocket(boardId, {
  onCardCreated: (card) => setBoardCards(prev => ({
    ...prev,
    [card.listId]: [...(prev[card.listId] ?? []), card],
  })),
  onCardUpdated: (card) => setBoardCards(prev => {
    const listCards = prev[card.listId]
    if (!listCards) return prev
    return { ...prev, [card.listId]: listCards.map(c => c.id === card.id ? card : c) }
  }),
  onCardMoved: (card) => setBoardCards(prev => {
    // Remove from all lists, insert into card.listId
    const next: Record<string, CardSummary[]> = {}
    for (const [lid, cards] of Object.entries(prev)) {
      next[lid] = cards.filter(c => c.id !== card.id)
    }
    next[card.listId] = [...(next[card.listId] ?? []), card]
    return next
  }),
  onCardDeleted: ({ id }) => setBoardCards(prev => {
    const next: Record<string, CardSummary[]> = {}
    for (const [lid, cards] of Object.entries(prev)) {
      next[lid] = cards.filter(c => c.id !== id)
    }
    return next
  }),
  onListCreated: (list) => setLists(prev => [...prev, list]),
  onListUpdated: (list) => setLists(prev => prev.map(l => l.id === list.id ? list : l)),
  onListReordered: ({ lists }) => setLists(lists),
  onListDeleted: ({ id }) => {
    setLists(prev => prev.filter(l => l.id !== id))
    setBoardCards(prev => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  },
})
```

Pass `socket` to `CardDetailModal`:
```tsx
<CardDetailModal
  card={openCard}
  socket={socket}
  onClose={...}
  onCardUpdated={handleCardUpdated}
/>
```

Render `<BoardPresence users={onlineUsers} />` in the board header area.

**Task 13 — `CardDetailModal` comment events:**

Add `socket: Socket | null` prop. In a `useEffect` that depends on `[socket, card.id]`:
```typescript
if (!socket || !card) return

const handleCreated = (comment: CommentResponse) => {
  if (comment.cardId !== card.id) return
  setComments(prev => [...prev, comment])
}
const handleUpdated = (comment: CommentResponse) => {
  if (comment.cardId !== card.id) return
  setComments(prev => prev.map(c => c.id === comment.id ? comment : c))
}
const handleDeleted = ({ id, cardId }: { id: string; cardId: string }) => {
  if (cardId !== card.id) return
  setComments(prev => prev.filter(c => c.id !== id))
}

socket.on('comment:created', handleCreated)
socket.on('comment:updated', handleUpdated)
socket.on('comment:deleted', handleDeleted)

return () => {
  socket.off('comment:created', handleCreated)
  socket.off('comment:updated', handleUpdated)
  socket.off('comment:deleted', handleDeleted)
}
```

---

## Parallel vs Sequential

| Parallel Group | Tasks | Why |
|---------------|-------|-----|
| Group A | 1, 2, 8 | Independent — types, Redis keys, and `pnpm add` have no deps on each other |
| Group B (after A) | 3, 9 | `socket.ts` backend needs redis keys (2); `socket.ts` frontend needs package (8) |
| Group C (after B) | 4, 5, 6, 7, 10, 11 | All need their respective lib file; 5/6/7 need task 3; 10 needs task 9 + task 1; 11 needs task 1 |
| Group D (after C) | 12, 13 | Need hook (10) + component (11) + socket lib |

Practical sequential order for a single developer:
`1 → 2 → 3 → 4 → 5 → 6 → 7` (backend complete, tsc check)
`8 → 9 → 10 → 11 → 12 → 13` (frontend complete, build check)

---

## Vite Dev Proxy Note

Socket.IO uses path `/socket.io/` by default. Vite only proxies `/api/*` today. Socket.IO client connects to the same origin, so in dev mode add to `vite.config.ts`:

```typescript
proxy: {
  '/api': { target: 'http://localhost:3001', ... },
  '/socket.io': {
    target: 'http://localhost:3001',
    ws: true,  // ← WebSocket upgrade required
  },
}
```

This is a small change to `apps/web/vite.config.ts` — add it in **Task 8** alongside the package install.

---

## Testing Plan

No automated test runner. Quality gates: `tsc --noEmit` (both apps) + `vite build`.

### Compilation Gate (after each phase)
- After Phase 2: `cd apps/api && npx tsc --noEmit`
- After Phase 3: `cd apps/api && npx tsc --noEmit`
- After Phase 5: `cd apps/web && npx tsc --noEmit` + `vite build`

### Manual Testing — Happy Path (from spec)

Run both dev servers (`pnpm dev` from root). Open two browser windows, sign in as different users.

| # | Test | Steps | Expected |
|---|------|-------|---------|
| HP-1 | Card create | User A creates card on any list | User B sees card appear without refresh |
| HP-2 | Card move (DnD) | User A drags card to another list | User B sees card in new list |
| HP-3 | Card update | User A opens card modal, edits title | User B sees updated title in card face |
| HP-4 | Card delete | User A deletes a card | User B's board removes that card |
| HP-5 | List create | User A creates a list | User B sees new column |
| HP-6 | List reorder | User A reorders lists | User B sees updated column order |
| HP-7 | List delete | User A deletes a list | User B's board removes that column |
| HP-8 | Comment | User A posts comment (both have modal open) | User B sees comment appear |
| HP-9 | Presence join | User A opens the board | User B sees A's avatar in header |
| HP-10 | Presence leave | User A closes their tab | User B's presence row updates |

### Manual Testing — Edge Cases (from spec)

| # | Test | How | Expected |
|---|------|-----|---------|
| EC-1 | Bad JWT | Connect via socket with tampered token | `connect_error` event on client |
| EC-2 | VIEWER role | Assign VIEWER, verify REST mutations blocked | 403 on write attempts; socket events still received |
| EC-3 | PRIVATE board, non-member | Join PRIVATE board via socket | `board:error` with `ACCESS_DENIED` |
| EC-4 | Multi-tab same user | Open 2 tabs | Presence shows one avatar |
| EC-5 | Close one tab | With 2 tabs open, close one | Avatar still present |
| EC-6 | Close both tabs | Close remaining tab | Avatar disappears for other users |
| EC-7 | Reconnect | Chrome DevTools → Network → Offline → Online | Socket reconnects, `board:join` re-emitted, board refetched |

---

## Known Constraints

1. **`card:created` enrichment**: The current `POST /api/cards` uses a raw `card.create` without `include`. The plan adds `include: { assignee: {...}, labels: {...} }` to the create call so `formatCard` can produce the enriched shape for the socket event.

2. **`list:reordered` payload**: The current reorder endpoint returns `{ success: true }`. The plan adds a post-reorder fetch of all board lists to emit the canonical ordered array. This adds one DB read per reorder.

3. **`socket.rooms` on disconnect**: Socket.IO `socket.rooms` contains the rooms the socket was in at disconnect time. This is the correct and documented way to clean up per-board presence on disconnect.

4. **Token rotation on long sessions**: Socket auth token is set at connection time. After 14 min auto-refresh, the running socket retains the old (valid until 15 min) token. For this release this is acceptable. Future: update `socket.auth` on refresh and call `socket.connect()` to re-authenticate.

5. **`@upstash/redis` `hincrby`**: Upstash Redis REST client supports `HINCRBY`. Returns the new integer value. If the key doesn't exist, it's created with value 0 before incrementing. The `removePresence` function must guard: `if (newCount <= 0)` to handle race conditions where count could go negative.

---

## Gate 2 Checklist

**Architecture:**
- [x] Follows layered architecture: lib helpers → route handlers → socket events
- [x] No circular imports: `socket.ts` imports from `redis`, `jwt`, `prisma`; routes import from `socket.ts`
- [x] Components in correct directories (hooks/, lib/, components/boards/)

**Task Breakdown:**
- [x] All files to change are listed with specific diffs described
- [x] All new files are listed with their locations and full interface specs
- [x] Each task is ≤ 3 files
- [x] Task dependencies are explicit (Parallel vs Sequential section)
- [x] Parallel vs sequential tasks are clearly marked

**Testing:**
- [x] Compilation gate after each phase
- [x] Manual happy-path tests for all 10 spec scenarios
- [x] Manual edge-case tests for all 7 spec edge cases
- [x] Known constraints called out (card:created enrichment, list:reordered payload, token rotation)
