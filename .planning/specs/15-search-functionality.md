# Feature Spec: Search Functionality (#15)

**Created**: 2026-06-01
**Status**: draft
**Author**: Yuvraj Satyapal
**Epic**: flowgrid-saas (Phase 4)
**Depends on**: Features #7, #8, #9 (Cards fully built)

---

## Problem

Users in multi-board, high-velocity environments lose context. They know a card or board exists somewhere, but the system structure (boards → lists → cards) doesn't match their mental model (partial keywords, vague context, approximate memory). This forces "hunt mode" — opening boards one by one, scrolling lists, recreating tasks that already exist. Each failed navigation attempt interrupts focus and fragments the working session.

This is not a navigation problem. It's a context-recovery problem. Search is the recovery tool when navigation breaks down.

---

## Goal

A user goes from "I need to find that thing" to "found it" in under 3 keystrokes — without leaving their current context, without opening a single board manually. Search must feel instant, permission-safe, and trust-building: if a card exists and the user has access, they find it.

**Measurable success:**
- ≥90% of search queries for existing, accessible cards return the correct card in the top 5 results
- Search modal opens in under 100ms
- Results appear within 300ms of the user stopping typing (debounce)
- Zero permission leakage (strict RBAC at query time, not index time)

---

## User Stories

**Primary (must deliver):**
> As a project manager juggling 6+ active boards, I want to press Cmd+K from anywhere in the app and type a partial keyword so I can surface the card I'm thinking of — without remembering which board it lives in or opening multiple boards manually.

**Secondary:**
> As a team lead who was recently removed from a board, I want search to respect my current permissions so I never see results for boards I no longer have access to.

> As a power user with dozens of recent searches, I want to see my last few search queries on the empty state so I can re-run frequent lookups instantly.

---

## Requirements

### Must-Have (MVP)

1. **Global search modal** — opens via `Cmd+K` (Mac) / `Ctrl+K` (Windows/Linux); also triggerable from a search icon in the sidebar
2. **Full-text card search** — searches `Card.title` + `Card.description` using PostgreSQL `tsvector`
3. **Permission-scoped results** — only surfaces cards from workspaces/boards the user is currently a member of; RBAC enforced at query time via JOIN, never from index alone
4. **Minimum query length guard** — queries shorter than 2 characters show an inline hint ("Keep typing…"), no DB query fired
5. **Relevance ranking** — title matches weighted higher than description; `ts_rank` with `{0.1, 0.2, 0.4, 1.0}` weights (D→A order)
6. **Fallback for noisy input** — special characters, symbols, and short tokens fall back to `ILIKE '%keyword%'` when `websearch_to_tsquery` produces no results
7. **Result context** — each result shows: card title, board name, list name, priority badge, due date (if set), assignee avatars (up to 3)
8. **Navigate to card** — clicking a result opens the card detail modal and closes search
9. **Keyboard navigation** — `↑`/`↓` to move between results, `Enter` to open, `Esc` to close
10. **Debounced input** — 300ms debounce before firing query
11. **Recent searches** — last 5 queries stored in `localStorage`, shown on empty input state
12. **Loading + empty states** — spinner during query, friendly empty state with "No results for…" + suggestion to broaden the search

### Nice-to-Have (post-MVP)

- Filters: workspace, board, label, priority, assignee, due date range
- Board search in addition to cards
- Matched term highlighting in results
- Prefix matching via `:*` operator
- Boost recently accessed or self-assigned cards

### Out of Scope

- AI / semantic / NLP reasoning layer — no intent guessing, no "smart suggestions"
- Analytics or reporting from search results (belongs to Feature #17)
- Workflow actions from search (complete, move, bulk edit) — search is read-only
- Attachment full-text indexing (PDF/image OCR)
- Comment thread deep indexing
- Personalization or ML-based ranking models
- Cross-workspace federation search
- Any external data sources

---

## Data Model

### Schema Changes

**Migration** (raw SQL via Prisma `$executeRaw`):

```sql
-- Add generated tsvector column to cards
ALTER TABLE "Card"
  ADD COLUMN IF NOT EXISTS "searchVector" tsvector
    GENERATED ALWAYS AS (
      to_tsvector('english',
        coalesce(title, '') || ' ' || coalesce(description, '')
      )
    ) STORED;

-- GIN index for performant full-text search
CREATE INDEX IF NOT EXISTS "idx_cards_search_vector"
  ON "Card" USING GIN ("searchVector");
```

**Notes:**
- `GENERATED ALWAYS AS ... STORED` — Postgres 12+ generated column; no application-layer recomputation, no trigger drift
- `coalesce(description, '')` — description is nullable; guard prevents null concatenation breaking vector
- Prisma does not natively represent generated columns; the field is queried via raw SQL only, not via Prisma's generated client
- `description` in `Card` model stores TipTap's serialized JSON — strip HTML/JSON tags before indexing (preprocess in trigger or a DB function)

**No new Prisma models required.** Search is a query concern, not a new entity.

---

## API Changes

### Endpoint

```
GET /api/search?q=<query>&workspaceId=<uuid>&limit=20&offset=0
```

**Request query params:**

| Param | Type | Required | Notes |
|---|---|---|---|
| `q` | string | yes | Raw search query, 2–200 chars |
| `workspace_id` | UUID | yes | Scopes search to one workspace |
| `limit` | int | no | Default 20, max 50 |
| `offset` | int | no | Default 0, for pagination |

**Response (200):**

```json
{
  "cards": [
    {
      "id": "uuid",
      "title": "Fix login bug on mobile",
      "description_snippet": "…mobile Safari crashes when…",
      "board_id": "uuid",
      "board_name": "Engineering",
      "list_id": "uuid",
      "list_name": "In Progress",
      "priority": "HIGH",
      "labels": [{ "id": "uuid", "name": "Bug", "color": "#ef4444" }],
      "assignees": [{ "id": "uuid", "name": "Alice", "avatar_url": "…" }],
      "due_date": "2026-06-15T00:00:00Z",
      "rank": 0.0759
    }
  ],
  "total": 14,
  "limit": 20,
  "offset": 0
}
```

**Error responses:**

| Code | When |
|---|---|
| 400 | `q` missing, empty, or < 2 chars |
| 401 | Unauthenticated |
| 403 | `workspace_id` is a workspace the user is not a member of |

**Permission enforcement in query (critical):**

```sql
SELECT c.*, ts_rank(c."searchVector", query) AS rank
FROM "Card" c
JOIN "List" l ON l.id = c."listId"
JOIN "Board" b ON b.id = l."boardId"
JOIN "BoardMember" bm ON bm."boardId" = b.id AND bm."userId" = :userId
JOIN "WorkspaceMember" wm ON wm."workspaceId" = b."workspaceId" AND wm."userId" = :userId
WHERE c."deletedAt" IS NULL
  AND b."workspaceId" = :workspaceId
  AND c."searchVector" @@ query
ORDER BY rank DESC
LIMIT :limit OFFSET :offset;
```

---

## Frontend Changes

### Files to Change / Create

| File | Change |
|---|---|
| `apps/web/src/components/search/SearchModal.tsx` | New — global search modal |
| `apps/web/src/components/search/SearchResult.tsx` | New — single result row component |
| `apps/web/src/hooks/useSearch.ts` | New — query + debounce + recent searches logic |
| `apps/web/src/api/search.ts` | New — API client for search endpoint |
| `apps/web/src/components/layout/Sidebar.tsx` | Add search icon button + Cmd+K listener |
| `apps/web/src/App.tsx` or root layout | Mount global `Cmd+K` keyboard listener |

### TypeScript Types

```typescript
// packages/types/src/search.ts
export interface CardSearchResult {
  id: string
  title: string
  descriptionSnippet: string | null
  boardId: string
  boardName: string
  listId: string
  listName: string
  priority: Priority | null
  labels: { id: string; name: string; color: string }[]
  assignees: { id: string; name: string; avatarUrl: string | null }[]
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

### Component Behavior

**SearchModal:**
- Renders as a centered overlay (`z-50`) with backdrop blur
- Input autofocuses on open
- Shows recent searches (from `localStorage`) when input is empty
- Shows loading spinner for 300ms debounce window
- Shows results list when query ≥ 2 chars and response arrives
- Shows empty state ("No results for "X"") when `cards.length === 0`
- Esc closes modal; clicking backdrop closes modal

**SearchResult row:**
- Title (bold) + board/list breadcrumb (muted)
- Right side: priority badge, due date chip, assignee avatars (max 3 + overflow count)
- Hover + keyboard-focus state uses Hallmark 8-state recipe
- Click → open `CardDetailModal` for that card + close search

**Cmd+K listener:**
- Global `keydown` listener in root layout
- `(e.metaKey || e.ctrlKey) && e.key === 'k'` → `e.preventDefault()` + open modal
- Zustand store or simple `useState` in root to track `isSearchOpen`

---

## Edge Cases

1. **Empty results (false negatives)** — user knows a card exists but gets "No results." Show: "No results for [query]. Try a shorter keyword or check filters." Do not show a blank screen. Fallback to `ILIKE` if `tsvector` query returns empty before giving up.

2. **Very short queries (1–2 chars)** — `ts_rank` becomes noisy or irrelevant. Guard: minimum 2 characters before firing query. Show inline hint: "Keep typing…" for 0–1 chars.

3. **Permission drift — lost access after card was visible** — user was removed from a board since their last search. Query always JOINs `BoardMember` + `WorkspaceMember` at runtime; results dynamically reflect current memberships. Cached `localStorage` recent searches may reference inaccessible cards — clicking a stale result should gracefully redirect to a "You don't have access to this card" state (not a 500).

4. **Special characters in query** — `fix/auth#login`, `C++ crash`, `UI (dashboard)`. PostgreSQL's `websearch_to_tsquery` handles most punctuation gracefully but may produce an empty `tsquery` for symbol-heavy input. Strategy: run `tsvector` query first; if result count is 0, re-run with `ILIKE '%normalized_term%'` as fallback. Normalize input before indexing: strip HTML/JSON from TipTap description.

5. **Ranking confusion — wrong card ranks first** — user searches "login bug" and gets a card that mentions "login" once in description over a card titled "login bug." Mitigation: use `setweight()` to assign `A` weight to `title`, `B` to `description` in the vector generation. Exact phrase matches should naturally bubble up with proper weighting.

6. **Empty workspace (no boards yet)** — new user presses Cmd+K. Query returns 0 results for any query. Show encouraging empty state: "Your workspace doesn't have any cards yet. Create a board to get started."

---

## Testing Criteria

### Happy Path

- User presses `Cmd+K` → modal opens, input focused
- User types "bug fix" (≥ 300ms debounce) → relevant card appears in results
- User sees board/list breadcrumb on each result
- User presses `↓` → highlights second result; presses `Enter` → opens card detail modal
- User opens modal with empty input → sees last 3 recent searches listed
- User clicks a recent search → re-runs query

### Edge Cases

- Query `"a"` → shows "Keep typing…" hint, no DB request fired
- Query `"C++ crash"` → symbols normalized, returns cards matching "crash" at minimum
- User searches for a card from a board they were removed from → result does not appear
- Query with 300 chars → 400 error returned, frontend shows validation message
- Network timeout on search request → error state shown with retry option, modal remains open
- TipTap JSON in description (e.g. `{"type":"doc","content":[...]}`) → does not pollute search results with JSON tokens (stripped before indexing)

---

## Dependencies

| Dependency | Status | Why needed |
|---|---|---|
| Feature #7 (Boards) | Done | Boards exist for permission JOINs |
| Feature #8 (Lists) | Done | Lists exist for result breadcrumb |
| Feature #9 (Cards + DnD) | Done | Cards exist with title/description to index |
| Feature #10 (Card Details Modal) | Done | Clicking a result opens this modal |
| PostgreSQL ≥12 | In use | Generated columns require Postgres 12+ |
| Prisma `$executeRaw` | Available | For migration + search query |

---

## Open Questions (non-blocking)

1. Should `workspaceId` be required in the query, or should search default to "all accessible workspaces"? (Recommendation: require it for MVP — simpler permission logic, avoids cross-workspace JOINs at scale)
2. Should TipTap JSON stripping happen in the DB trigger or in a Prisma middleware layer before write? (Recommendation: Prisma middleware on `Card.create`/`Card.update` — keeps DB function simple)
3. Rate limit for search endpoint? (Recommendation: 60 req/min per user via Upstash ratelimit, same pattern as auth endpoints)
