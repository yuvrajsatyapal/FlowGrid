# Spec: Feature #13 — Real-time Collaboration (WebSockets)

**Created**: 2026-06-01
**Status**: draft
**Author**: team
**Epic**: FlowGrid SaaS — 20 Features

---

## Problem

Board state is local to each user session. When multiple teammates have the same board open, changes made by one user — card moves, edits, new cards, list changes, comments — are not visible to others until they manually refresh. This breaks collaborative workflows: users work with stale data, overwrite each other's changes unknowingly, and have no awareness of who else is currently active on the board.

## Goal

Make boards feel live. All connected users see board mutations (cards, lists, comments) immediately without refreshing. Active user presence is visible in the board header. The server remains the single source of truth — every broadcasted event reflects the canonical DB state, not a client-side optimistic value.

---

## User Stories

1. **As a team member**, when I move, edit, or create a card, I want everyone currently viewing the board to see the change instantly so we can collaborate without refreshing or creating conflicting states.

2. **As a project manager**, when multiple people work on the same board, I want to see active users and updates in real time so I know the board state is accurate at a glance.

3. **As a board member**, when someone comments on or updates a card I have open, I want those changes reflected immediately so context stays synchronized across all users.

---

## Requirements

### Must Have

- Socket.IO server extended from existing scaffold in `apps/api/src/index.ts`
- JWT authentication validated in `io.use()` handshake middleware — no unauthenticated connections
- Board-level rooms: one room per `boardId` (`socket.join(boardId)`)
- Presence tracking via Upstash Redis (join, leave, disconnect)
- Multi-tab support: presence counts unique users, not raw socket connections
- PRIVATE board access validation before room join (two-layer check: WorkspaceMember + BoardMember)
- Broadcast all 11 mutation events with full canonical payload (DB-fetched, not client-provided):
  - `card:created`, `card:updated`, `card:moved`, `card:deleted`
  - `list:created`, `list:updated`, `list:reordered`, `list:deleted`
  - `comment:created`, `comment:updated`, `comment:deleted`
- Cards broadcast using `formatCard()` enriched shape (assignee + labels)
- Lists broadcast as full list object
- Comments broadcast as full comment object with author info
- Presence broadcast (`board:presence`) on every join/leave/disconnect
- Frontend `useBoardSocket(boardId)` custom hook: room join/leave, event handlers
- `BoardPage` state updated by socket events for cards and lists
- `CardDetailModal` comments list updated by socket events
- Presence avatar row rendered in `BoardPage` header

### Nice to Have

- Presence avatars show tooltip with user name on hover
- Socket auto-reconnect rejoins board room automatically

### Out of Scope (this release)

- Notifications/badges for users **not** currently on the board → Feature #14
- Typing indicators ("Alice is editing this card…")
- Cursor/mouse-position presence
- Offline event queue / missed-event replay after reconnect
- Per-card or per-list rooms (board-level rooms only)
- Advanced conflict resolution (CRDTs, operational transforms, locking)
- Collaborative rich-text editing
- Guaranteed event delivery semantics
- Cross-board real-time synchronization

> These are deferred, not abandoned. The room architecture and event naming are designed to support them later.

---

## Data Model

No new database schema changes. Two new Redis key patterns:

| Key | Type | Value | Cleared when |
|-----|------|-------|--------------|
| `presence:{boardId}:users` | Hash | `userId → JSON { name, avatarUrl }` | User's last socket for this board disconnects |
| `presence:{boardId}:counts` | Hash | `userId → integer (socket count)` | Count reaches 0 |

**Join flow** (per socket connecting to a board room):
1. `HINCRBY presence:{boardId}:counts {userId} 1`
2. `HSET presence:{boardId}:users {userId} {JSON}`
3. `HGETALL presence:{boardId}:users` → broadcast `board:presence` to room

**Leave / disconnect flow** (per socket):
1. `HINCRBY presence:{boardId}:counts {userId} -1`
2. If count ≤ 0: `HDEL presence:{boardId}:users {userId}`, `HDEL presence:{boardId}:counts {userId}`
3. `HGETALL presence:{boardId}:users` → broadcast `board:presence` to room

---

## API Changes

### Socket.IO Connection

**Client → Server (handshake)**
```
io({ auth: { token: accessToken } })
```

**Server `io.use()` middleware**
```typescript
io.use(async (socket, next) => {
  const token = socket.handshake.auth?.token
  if (!token) return next(new Error('AUTH_REQUIRED'))
  try {
    const payload = verifyAccessToken(token)
    socket.data.user = { id: payload.sub, email: payload.email }
    next()
  } catch {
    next(new Error('AUTH_INVALID'))
  }
})
```

---

### Client → Server Events

| Event | Payload | Server action |
|-------|---------|---------------|
| `board:join` | `{ boardId: string }` | Validate board access → join room → update Redis presence → broadcast `board:presence` |
| `board:leave` | `{ boardId: string }` | Leave room → update Redis presence → broadcast `board:presence` |

---

### Server → Client Events

| Event | Payload | Triggered after |
|-------|---------|-----------------|
| `board:presence` | `{ boardId: string; users: PresenceUser[] }` | Any join / leave / disconnect |
| `board:error` | `{ code: string; message: string }` | Unauthorized room join attempt |
| `card:created` | `CardSummary` (formatCard shape) | `POST /api/cards` succeeds |
| `card:updated` | `CardSummary` (formatCard shape) | `POST /api/cards/update` succeeds |
| `card:moved` | `CardSummary` (formatCard shape) | `POST /api/cards/move` succeeds |
| `card:deleted` | `{ id: string }` | `POST /api/cards/delete` succeeds |
| `list:created` | `List` full object | `POST /api/lists` succeeds |
| `list:updated` | `List` full object | `POST /api/lists/update` succeeds |
| `list:reordered` | `{ lists: List[] }` | `POST /api/lists/reorder` succeeds |
| `list:deleted` | `{ id: string }` | `POST /api/lists/delete` succeeds |
| `comment:created` | `CommentWithAuthor` | `POST /api/comments` succeeds |
| `comment:updated` | `CommentWithAuthor` | `POST /api/comments/update` succeeds |
| `comment:deleted` | `{ id: string; cardId: string }` | `POST /api/comments/delete` succeeds |

---

### Types (additions to `packages/types/src/index.ts`)

```typescript
export interface PresenceUser {
  userId: string
  name: string | null
  avatarUrl: string | null
}

export interface CommentWithAuthor {
  id: string
  cardId: string
  content: string
  authorId: string
  author: { id: string; name: string | null; avatarUrl: string | null } | null
  createdAt: string
  updatedAt: string
}
```

---

### Mutation Broadcast Pattern

All existing REST endpoints remain unchanged. After a successful DB write and canonical object fetch, the route handler calls `emitBoardEvent` before sending the HTTP 200 response.

```
Client HTTP request
  → REST route handler
  → DB write
  → Fetch canonical object (formatCard / full list / comment with author)
  → emitBoardEvent(io, boardId, eventName, payload)   ← new step
  → res.json(payload)
```

`emitBoardEvent` broadcasts to ALL users in the room including the originating client — the frontend should handle receiving its own events gracefully (idempotent state updates).

**Important**: For `card:deleted` and `comment:deleted`, the route must **fetch the card/comment's boardId before deleting** the row, so the correct room can be targeted.

---

### New Helper: `apps/api/src/lib/socket.ts`

```typescript
// emitBoardEvent — thin wrapper used by all route handlers
export function emitBoardEvent(
  io: Server,
  boardId: string,
  event: string,
  payload: unknown
): void {
  io.to(boardId).emit(event, payload)
}

// Presence helpers (called from board:join / board:leave / disconnect handlers)
export async function addPresence(boardId: string, user: PresenceUser): Promise<PresenceUser[]>
export async function removePresence(boardId: string, userId: string): Promise<PresenceUser[]>
export async function getPresence(boardId: string): Promise<PresenceUser[]>
```

---

## UI Changes

### New Files

| File | Purpose |
|------|---------|
| `apps/web/src/lib/socket.ts` | `socket.io-client` singleton; initialized with `auth: { token }` from AuthContext; exports `getSocket()` |
| `apps/web/src/hooks/useBoardSocket.ts` | Custom hook — joins board room on mount, leaves on unmount, wires all event handlers, returns `{ onlineUsers }` |
| `apps/web/src/components/boards/BoardPresence.tsx` | Avatar row showing up to 5 online users + "+N" overflow badge |

### Modified Files

| File | Change |
|------|--------|
| `apps/api/src/index.ts` | Add `io.use()` auth middleware; register `board:join`, `board:leave`, `disconnect` handlers |
| `apps/api/src/lib/socket.ts` | NEW: `emitBoardEvent`, presence helpers |
| `apps/api/src/routes/cards.ts` | Call `emitBoardEvent` after create, update, move, delete |
| `apps/api/src/routes/lists.ts` | Call `emitBoardEvent` after create, update, reorder, delete |
| `apps/api/src/routes/comments.ts` | Call `emitBoardEvent` after create, update, delete |
| `apps/web/src/pages/BoardPage.tsx` | Mount `useBoardSocket`, handle card/list events, render `<BoardPresence />` |
| `apps/web/src/components/boards/CardDetailModal.tsx` | Handle `comment:created/updated/deleted` events |
| `packages/types/src/index.ts` | Add `PresenceUser`, `CommentWithAuthor` interfaces |

### BoardPresence Component

Displayed in `BoardPage` header, right side, beside the board title / controls. Shows avatar circles for each online user:

```
[ YS ] [ AK ] [ BM ] +2 online
```

- Up to 5 avatars rendered; overflow shown as "+N"
- Avatar style consistent with existing avatar utilities (`getInitials`, `getAvatarBg` from `utils/avatar.ts`)
- The current user is included in the presence list (shows their own avatar)

### BoardPage State Updates via `useBoardSocket`

The hook accepts callbacks and wires them to socket events:

| Socket event | State update |
|-------------|-------------|
| `card:created` | Append to `boardCards[card.listId]` |
| `card:updated` | Replace card in `boardCards[card.listId]` |
| `card:moved` | Remove from old list, insert into new list at correct position |
| `card:deleted` | Filter card from all lists in `boardCards` |
| `list:created` | Append to `lists` state |
| `list:updated` | Replace matching list in `lists` state |
| `list:reordered` | Replace full `lists` array |
| `list:deleted` | Filter from `lists` + delete key from `boardCards` |
| `board:presence` | Update `onlineUsers` state |

### CardDetailModal Comment Updates

- `comment:created` → prepend or append to comments list (match existing sort order)
- `comment:updated` → replace matching comment in list
- `comment:deleted` → filter from list

---

## Edge Cases

1. **Disconnect / network drop**: Socket `disconnect` event fires server-side → decrement Redis connection count → if count reaches 0, remove user from presence Hash → broadcast updated `board:presence` to room.

2. **Expired or invalid JWT at handshake**: `io.use()` rejects the socket before any room join. Client receives `connect_error` with reason `AUTH_INVALID`. Client should catch this event and attempt token refresh, then reconnect.

3. **Simultaneous card delete**: First `POST /api/cards/delete` succeeds → fetches boardId from DB → emits `card:deleted`. Second request finds no row → returns 404, emits nothing. No duplicate events.

4. **VIEWER role**: VIEWERs may connect, join board rooms, and receive all socket events. They cannot call mutation REST endpoints (blocked by `canWrite()` middleware), so they are never the source of a mutation broadcast. No special socket-level filtering needed.

5. **PRIVATE board room join**: The `board:join` handler fetches the board from DB and applies the same two-layer access check used in `resolveCardAccess()` (WorkspaceMember check + BoardMember check for PRIVATE boards). If access is denied, emit `board:error` with `code: 'ACCESS_DENIED'` and do not call `socket.join()`.

6. **Multi-tab same user**: Each tab opens a separate socket connection. `presence:{boardId}:counts` is incremented per socket. The user appears exactly once in `board:presence`. Only when the count drops to 0 (all tabs closed or navigated away) is the user removed from presence and a departure broadcast sent.

7. **Reconnect after network drop**: Socket.IO client auto-reconnects by default. On reconnect the client must re-emit `board:join` (inside a `connect` event handler) to rejoin the room. The client should also refetch board state from the REST API — socket events provide no replay of missed mutations.

8. **boardId resolution before delete**: Both `cards/delete` and `comments/delete` routes must fetch the target row (to get `list.boardId` or `comment.cardId → card.list.boardId`) **before** deleting, then emit the event using that boardId. Fetching after delete returns null.

---

## Testing Criteria

### Happy Path

- [ ] Two sessions on the same board: User A creates a card → User B sees it without refreshing
- [ ] User A moves a card via DnD → User B sees card in new list/position
- [ ] User A edits a card title → User B sees updated title in the card face
- [ ] User A deletes a card → User B's board removes that card
- [ ] User A creates a list → User B sees the new column appear
- [ ] User A reorders lists → User B sees updated column order
- [ ] User A deletes a list → User B's board removes that column
- [ ] User A posts a comment (card modal open on both) → User B sees comment appear
- [ ] User A joins the board → User B sees A's avatar in the presence row
- [ ] User A closes their tab → User B sees A's avatar disappear

### Edge Cases

- [ ] User with expired JWT receives `connect_error` and cannot join any room
- [ ] VIEWER can connect and receive all events; REST mutations still blocked (verify via direct API call returning 403)
- [ ] Non-member `board:join` for a PRIVATE board receives `board:error` with `ACCESS_DENIED`
- [ ] User A opens two tabs → presence shows one avatar, not two
- [ ] User A closes one of two tabs → still appears in presence
- [ ] User A closes both tabs → removed from presence; User B sees updated presence
- [ ] Simulated disconnect + reconnect: user rejoins room, board refetched, back in presence

---

## Dependencies

| Dependency | Status |
|-----------|--------|
| Feature #9 — Cards + DnD | ✅ Done |
| Feature #6 — Roles + Permissions (`canWrite()`, role guards) | ✅ Done |
| Socket.IO installed + scaffolded in `apps/api/src/index.ts` | ✅ Done |
| `socket.io-client` in `apps/web` | ⬜ Needs `pnpm add socket.io-client` |
| Upstash Redis (`@upstash/redis`) configured | ✅ Done (new key pattern only) |
| `apps/api/src/lib/socket.ts` helper | ⬜ New file |
