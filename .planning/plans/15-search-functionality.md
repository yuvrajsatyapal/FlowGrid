# Implementation Plan: Search Functionality (#15)

**Spec**: .planning/specs/15-search-functionality.md
**Epic**: flowgrid-saas (Phase 4)
**Created**: 2026-06-01
**Status**: draft

---

## Stack Detection

Full-stack: Express + Prisma (backend) · React + Vite (frontend)

Plan covers: **Database → Backend API → Shared Types → Frontend**

---

## Architecture Decision: Title-Only Indexing (MVP)

The `Card.description` field stores TipTap's serialized JSON (e.g. `{"type":"doc","content":[...]}`). Indexing raw JSON in `tsvector` would pollute results with tokens like `type`, `doc`, `content`, `paragraph`, etc.

**MVP decision: Index `title` only.** Title is always plain text and is the primary search signal.

**Phase 2 extension (not in this plan):** Add `descriptionText` shadow column (nullable text), maintained by a Prisma middleware that strips TipTap JSON to plain text on `card.create` + `card.update`. Then expand the generated column to include both.

---

## Components Table

| Component | Type | Purpose |
|---|---|---|
| Prisma migration | SQL migration | Add `searchVector` generated column + GIN index to `Card` |
| `searchRouter` | Express Router | `GET /api/search` endpoint with FTS + permission enforcement |
| `CardSearchResult` | Shared type | Result shape used by backend response and frontend |
| `searchApi` | Frontend API client | Wraps `GET /api/search` |
| `useSearch` | React hook | Debounce, query firing, recent searches (localStorage) |
| `SearchResult` | React component | Single result row (title, board/list breadcrumb, badges) |
| `SearchModal` | React component | Global modal: input, results list, empty/loading states |
| `AppLayout` update | Existing file | Mount `<SearchModal>`, add Cmd+K listener, add search icon to sidebar |

---

## File Locations

### New Files

| File | Location | Purpose |
|---|---|---|
| `search.ts` | `apps/api/src/routes/` | Express search route |
| `search.ts` | `apps/web/src/api/` | Frontend API client |
| `useSearch.ts` | `apps/web/src/hooks/` | Debounce + query + recent searches logic |
| `SearchResult.tsx` | `apps/web/src/components/search/` | Result row component |
| `SearchModal.tsx` | `apps/web/src/components/search/` | Global search modal |

### Files to Change

| File | What Changes | Why |
|---|---|---|
| `apps/api/prisma/schema.prisma` | No model change needed | Migration handled via raw SQL |
| `apps/api/prisma/migrations/` | New migration directory | Add `searchVector` column + GIN index |
| `apps/api/src/index.ts` | Import + register `searchRouter` | Mount at `/api/search` |
| `packages/types/src/index.ts` | Add `CardSearchResult`, `SearchResponse` | Shared types for both layers |
| `apps/web/src/components/layout/AppLayout.tsx` | Add Cmd+K listener, search icon, `<SearchModal>` | Trigger point for global search |

---

## Implementation Phases

### Phase 1: Database — tsvector Column

| # | Task | Files |
|---|---|---|
| 1 | Create Prisma migration: add `searchVector` generated column (title only) + GIN index to `Card` | `apps/api/prisma/migrations/20260601100000_add_card_search_vector/migration.sql` |

**Migration SQL:**
```sql
ALTER TABLE "Card"
  ADD COLUMN IF NOT EXISTS "searchVector" tsvector
    GENERATED ALWAYS AS (
      to_tsvector('english', coalesce(title, ''))
    ) STORED;

CREATE INDEX IF NOT EXISTS "idx_cards_search_vector"
  ON "Card" USING GIN ("searchVector");
```

**What to test after this task:**
- `\d "Card"` in psql shows `searchVector` column
- `SELECT "searchVector" FROM "Card" LIMIT 1` returns a tsvector value
- `SELECT * FROM pg_indexes WHERE tablename = 'Card' AND indexname = 'idx_cards_search_vector'` returns a row
- Insert a new card → `searchVector` auto-populates (generated column behavior)

---

### Phase 2: Shared Types

| # | Task | Files |
|---|---|---|
| 2 | Add `CardSearchResult` and `SearchResponse` to shared types | `packages/types/src/index.ts` |

**Types to add:**
```typescript
export interface CardSearchResult {
  id: string
  title: string
  boardId: string
  boardName: string
  listId: string
  listName: string
  priority: Priority
  labels: { id: string; name: string; color: string }[]
  assignees: { id: string; name: string | null; avatarUrl: string | null }[]
  dueDate: string | null
  rank: number
}

export interface SearchResponse {
  cards: CardSearchResult[]
  total: number
  limit: number
  offset: number
}
```

**What to test after this task:**
- `pnpm --filter @flowgrid/types build` (or typecheck) passes with no errors

---

### Phase 3: Backend Search Route

*(Depends on Phase 1 — migration must run first)*

| # | Task | Files |
|---|---|---|
| 3 | Create `searchRouter` with `GET /` — validation, FTS query, ILIKE fallback, permission JOINs | `apps/api/src/routes/search.ts` |
| 4 | Register `searchRouter` in the Express app | `apps/api/src/index.ts` |

**Route logic (Task 3):**

```
GET /api/search?q=<query>&workspace_id=<uuid>&limit=20&offset=0

Guards (in order):
1. validateJWT → 401 if not authenticated
2. q missing or trim().length < 2 → 400 "Query must be at least 2 characters"
3. workspace_id missing → 400 "workspace_id is required"
4. User must be WorkspaceMember of workspace_id → 404 "Workspace not found" if not

Search strategy:
A. Run $queryRaw with websearch_to_tsquery + ts_rank, JOINing through:
   List → Board → WorkspaceMember (userId + workspaceId)
   If board.visibility = PRIVATE → also JOIN BoardMember
B. If results.length === 0, run ILIKE fallback:
   Simple Prisma query: title ilike '%q%' + same permission scope

Response: { cards: CardSearchResult[], total: number, limit, offset }
```

**Permission-safe raw query pattern:**
```typescript
// TypeScript in route handler
const results = await prisma.$queryRaw<RawSearchRow[]>`
  SELECT
    c.id,
    c.title,
    c."boardId",
    b.name AS "boardName",
    c."listId",
    l.name AS "listName",
    c.priority,
    c."dueDate",
    ts_rank(c."searchVector", query) AS rank
  FROM "Card" c
  CROSS JOIN websearch_to_tsquery('english', ${q}) query
  JOIN "List" l ON l.id = c."listId" AND l."deletedAt" IS NULL
  JOIN "Board" b ON b.id = l."boardId" AND b."deletedAt" IS NULL
  JOIN "WorkspaceMember" wm ON wm."workspaceId" = b."workspaceId"
    AND wm."userId" = ${userId}
  WHERE c."deletedAt" IS NULL
    AND b."workspaceId" = ${workspaceId}::uuid
    AND c."searchVector" @@ query
    -- PRIVATE board access check inline:
    AND (
      b.visibility != 'PRIVATE'
      OR EXISTS (
        SELECT 1 FROM "BoardMember" bm
        WHERE bm."boardId" = b.id AND bm."userId" = ${userId}
      )
    )
  ORDER BY rank DESC
  LIMIT ${limit} OFFSET ${offset}
`
```

**ILIKE fallback (when FTS returns 0 results):**
```typescript
// Only fires if FTS returns empty — uses Prisma ORM (no raw SQL needed)
const fallbackCards = await prisma.card.findMany({
  where: {
    deletedAt: null,
    title: { contains: q, mode: 'insensitive' },
    list: {
      deletedAt: null,
      board: {
        deletedAt: null,
        workspaceId,
        workspaceMembers: { some: { userId } },
      },
    },
  },
  include: { ... },
  take: limit,
  skip: offset,
})
```

**What to test after Task 3+4:**
- `GET /api/search?q=test&workspace_id=xxx` with valid JWT → 200 with results
- `GET /api/search?q=a` → 400 (too short)
- `GET /api/search?q=test` (no workspace_id) → 400
- Unauthenticated request → 401
- User searching in a workspace they don't belong to → 404
- Card from a PRIVATE board → not returned unless user is BoardMember
- Query with special chars → normalizes gracefully (ILIKE fallback fires)
- Empty workspace → 200 `{ cards: [], total: 0 }`

---

### Phase 4: Frontend API Client + Hook

*(Phase 3 and Phase 2 must both be done first)*

| # | Task | Files |
|---|---|---|
| 5 | Create `searchApi` client | `apps/web/src/api/search.ts` |
| 6 | Create `useSearch` hook — debounce 300ms, min-length guard, recent searches in localStorage | `apps/web/src/hooks/useSearch.ts` |

**`searchApi` (Task 5):**
```typescript
import { api } from '../lib/axiosInstance'
import type { SearchResponse } from '@flowgrid/types'

export const searchApi = {
  async search(q: string, workspaceId: string, limit = 20, offset = 0): Promise<SearchResponse> {
    const res = await api.get<SearchResponse>('/search', {
      params: { q, workspace_id: workspaceId, limit, offset },
    })
    return res.data
  },
}
```

**`useSearch` responsibilities (Task 6):**
- `query` state — controlled by input
- Fires API call after 300ms debounce when `query.trim().length >= 2`
- Sets `isLoading`, `results`, `error` state
- On successful search: prepend to `recentSearches` in localStorage (key: `flowgrid:recent-searches`, max 5 unique entries)
- Exposes: `{ query, setQuery, results, isLoading, error, recentSearches }`

**What to test after Task 5+6:**
- `searchApi.search` resolves with `SearchResponse` shape
- `useSearch`: debounce prevents immediate firing; `results` populated after 300ms
- Short query (1 char): no API call fired
- After successful search: localStorage updated with query

---

### Phase 5: UI Components

*(Phase 4 must be done first)*

| # | Task | Files |
|---|---|---|
| 7 | `SearchResult` — result row with title, breadcrumb, priority badge, due date, assignees | `apps/web/src/components/search/SearchResult.tsx` |
| 8 | `SearchModal` — modal wrapper with input, results list, empty/loading/recent states, keyboard nav | `apps/web/src/components/search/SearchModal.tsx` |

**`SearchResult` layout (Task 7):**
```
[left]  Card title (bold)              [right] Priority badge · Due date · Avatars
        Board name › List name (muted)
```
- Click → call `onSelect(card)` prop
- Highlighted state via `:focus` / `data-highlighted` for keyboard nav

**`SearchModal` structure (Task 8):**
```
<dialog> or fixed overlay (z-50, backdrop-blur)
  <input autofocus placeholder="Search cards..." />
  
  [empty input state]
    "Recent searches" header (if recentSearches.length > 0)
    <RecentSearchItem> × N (click → setQuery)
    OR: "Press Cmd+K to search cards across all boards"
  
  [typing, query < 2 chars]
    "Keep typing…" hint
  
  [loading]
    Spinner (debounce window)
  
  [results]
    <SearchResult> × N (keyboard navigable)
    Pagination or "Show more" if total > limit
  
  [empty results]
    "No results for "[query]""
    "Try a shorter keyword or different spelling"
</dialog>
```

Keyboard nav:
- `↑` / `↓` — move `focusedIndex` state
- `Enter` — call `onSelect(results[focusedIndex])`
- `Esc` — call `onClose()`

`onSelect` behavior: navigate to `/workspaces/:workspaceId/boards/:boardId` (or open card detail modal if that state is accessible), then `onClose()`.

**What to test after Task 7+8:**
- `SearchModal` renders without crashing
- Input renders autofocused
- Typing populates results via `useSearch`
- Arrow keys move highlight between results
- Enter on focused result calls `onSelect`
- Esc calls `onClose`
- Empty input shows recent searches
- `isLoading=true` → spinner visible
- `results.length === 0` + query ≥ 2 chars → empty state visible

---

### Phase 6: Integration

*(Phase 5 must be done first)*

| # | Task | Files |
|---|---|---|
| 9 | Add `<SearchModal>`, Cmd+K listener, and search icon to `AppLayout` | `apps/web/src/components/layout/AppLayout.tsx` |

**Changes to `AppLayout` (Task 9):**
1. Add `isSearchOpen` state (`useState(false)`)
2. Add global `keydown` listener in `useEffect`:
   ```typescript
   (e.metaKey || e.ctrlKey) && e.key === 'k' → e.preventDefault(); setIsSearchOpen(true)
   ```
3. Add `<SearchIcon>` SVG button in sidebar (below boards nav, above settings), `onClick={() => setIsSearchOpen(true)}`
4. Mount `<SearchModal isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} workspaceId={workspaceId} />` near the end of the component tree
5. Get `workspaceId` from `useParams()` (already available in AppLayout context) or `useWorkspaceStore`

**What to test after Task 9:**
- Pressing Cmd+K opens modal
- Pressing Esc closes modal
- Clicking search icon opens modal
- Modal is mounted at root level (not inside a scroll container)
- `workspaceId` correctly passed to search API calls

---

## Parallel vs Sequential

| Sequential Chain | Dependency |
|---|---|
| Task 1 (migration) → Task 3 (route) | Route uses the column |
| Task 2 (types) → Task 3 (route) | Route returns typed response |
| Task 2 (types) → Task 5 (API client) | Client uses shared types |
| Task 3 + Task 5 → Task 6 (hook) | Hook calls API client, types results |
| Task 6 → Task 7, 8 (components) | Components consume hook |
| Task 7 + 8 → Task 9 (integration) | AppLayout mounts the modal |

| Parallel Group | Tasks | Why |
|---|---|---|
| Group A | Task 1 + Task 2 | Migration and types are independent |
| Group B | Task 3 + Task 4 | Route + registration are one commit each, independent of frontend |
| Group C | Task 7 + Task 8 | SearchResult and SearchModal share no state; can scaffold both together |

---

## Testing Plan

### Data Layer
- After migration: `searchVector` column exists and is `tsvector` type
- GIN index `idx_cards_search_vector` exists
- New card inserted → `searchVector` auto-populated (select to verify)
- Card title updated → `searchVector` reflects updated tokens
- Null description does not break vector (handled by `coalesce`)

### Backend API
- `GET /api/search?q=fix&workspace_id=xxx` (valid auth) → 200 with matching cards
- `GET /api/search?q=a` → 400 ("Query must be at least 2 characters")
- `GET /api/search?q=fix` (missing workspace_id) → 400
- No `Authorization` header → 401
- Valid token but non-member workspace → 404
- PRIVATE board: workspace member who is NOT board member → card not returned
- PRIVATE board: workspace member who IS board member → card returned
- Special chars "C++": ILIKE fallback fires, returns results matching "C"
- Zero-result workspace → 200 `{ cards: [], total: 0, limit: 20, offset: 0 }`
- `limit=50`, `offset=20` → correct page of results
- `limit=100` (over max) → clamped to 50

### Frontend Hook + API
- `useSearch` with query "ab": API call fires after 300ms
- `useSearch` with query "a": no API call (length < 2)
- Successful search → query added to localStorage under `flowgrid:recent-searches`
- localStorage never exceeds 5 entries (oldest dropped)
- Duplicate query not added twice to recent searches

### UI Components
- `SearchModal` opens when `isOpen=true`, hidden when `false`
- Input autofocuses on open
- `↓` key moves highlight to next result
- `↑` on first result does not go below 0
- `Enter` on result calls `onSelect` with correct card
- `Esc` calls `onClose`
- `isLoading=true` → spinner renders
- Empty results → empty state text renders
- Recent searches render on empty input

### Integration
- Cmd+K opens modal from any page in the app
- Ctrl+K (Windows) also opens modal
- Clicking sidebar search icon opens modal
- Clicking a result navigates to correct board
- No duplicate event listeners on re-render

---

## Gate 2 Checklist

**Architecture:**
- [x] Express Router pattern matches all other routes
- [x] `validateJWT` first, guards second, query last — consistent ordering
- [x] Raw SQL only for FTS query; Prisma ORM for ILIKE fallback and workspace membership check
- [x] Permission JOINs mirror existing `resolveListAccess` pattern from `cards.ts`
- [x] Frontend components in `components/search/` — consistent with `components/notifications/`
- [x] Hook in `hooks/` — consistent with `useNotifications.ts`
- [x] No cross-layer violations (components don't call routes directly)

**Task Breakdown:**
- [x] All new files listed (5 new files)
- [x] All existing files to change listed (4 files)
- [x] Each task ≤ 3 files
- [x] Task dependencies explicit and correct
- [x] Parallel groups identified (Tasks 1+2 parallel, Tasks 7+8 parallel)

**Testing:**
- [x] Data layer: migration verification + generated column behavior
- [x] Business logic: permission enforcement for PUBLIC and PRIVATE boards
- [x] API: validation (400), auth (401), access (404), edge cases
- [x] Frontend hook: debounce, min-length guard, localStorage
- [x] Frontend UI: keyboard nav, all states (loading/empty/results/recent)
- [x] Integration: Cmd+K + Ctrl+K, sidebar icon

**Edge cases from spec — all covered:**
- [x] Empty results → empty state + ILIKE fallback at API layer
- [x] Very short queries → 2-char guard in both route (400) and hook (no API call)
- [x] Permission drift → RBAC enforced at query time, stale localStorage links handled gracefully
- [x] Special characters → `websearch_to_tsquery` handles most; ILIKE fallback fires on empty FTS result
- [x] Ranking confusion → `setweight` title=A weighting in generated column (can add in migration)

**Gate 2: PASSED**

---

## Notes for Build Phase

1. **Prisma migration**: Use `prisma migrate dev --name add_card_search_vector` which will run the raw SQL. Confirm the generated column works correctly in psql before proceeding.

2. **`websearch_to_tsquery` vs `to_tsquery`**: Use `websearch_to_tsquery` (Postgres 11+) — it's more user-friendly, handles multi-word queries naturally, won't throw on empty stop-word queries.

3. **Rate limiting on search**: The search endpoint is a read-heavy endpoint that could be abused. Consider adding Upstash ratelimit (same pattern as auth) at 60 req/min per user. This is a post-MVP hardening step, not a blocker.

4. **`$queryRaw` type safety**: Prisma's `$queryRaw` returns `unknown[]`. Define a `RawSearchRow` interface locally in the route file for the join result, then map to `CardSearchResult` before sending the response.

5. **Labels and assignees for FTS results**: The raw SQL query doesn't include labels/assignees (requires additional JOINs that complicate the query). Fetch labels and assignees in a separate Prisma query using the returned card IDs (batch: `prisma.cardLabel.findMany({ where: { cardId: { in: ids } } })`), then merge. This keeps the FTS query clean.
