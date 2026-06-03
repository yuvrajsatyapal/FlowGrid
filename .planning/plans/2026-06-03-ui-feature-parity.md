# FlowGrid UI Feature-Parity Implementation Plan

> **For agentic workers:** Implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. After each phase, run the **Verification** block. Update the **Progress Log** at the bottom so a fresh session can resume from the exact stopping point.

**Goal:** Make every FlowGrid app screen match the `stitch_flowgrid_saas_Ui/` mockups *exactly*, in both themes, and implement every feature shown in those mockups (using the existing backend wherever possible).

**Architecture:** Dual-theme design system driven entirely by OKLCH CSS variables in `apps/web/src/styles/tokens.css` (already remapped: **dark = Apex Precision**, **light = Editorial Precision**). Pages are React + inline styles that consume those variables, so structural work is per-component. Backend is Express + Prisma + Upstash Redis (`apps/api`) and is already feature-complete for almost everything; a few endpoints need small additions (flagged ⚠️BACKEND).

**Tech Stack:** React 18 + Vite + TypeScript (App is SPA, react-router), inline styles + OKLCH tokens, framer-motion, @dnd-kit (board DnD), TanStack Query (some), Express + Prisma (Postgres) + Upstash Redis, Socket.IO (realtime).

---

## How To Resume (READ FIRST in a new session)

1. **Read this file top-to-bottom**, then jump to the first unchecked `- [ ]` task in the **Progress Log** order.
2. **Start dev servers:**
   - API: backend must be running (Postgres + Redis). If `curl -s localhost:8080/health` (or the port in `apps/api/.env`) fails, ask the user to start it. The web app proxies `/api` to it.
   - Web (for visual QA): use the Claude Preview MCP — `preview_start({name:"web"})` (config in `.claude/launch.json`, port 5175). Then `preview_resize({width:1440,height:900})` (the viewport collapses `100vh` otherwise).
3. **Authenticate for QA (Google OAuth can't run headless).** Mint a refresh cookie for a real seeded user:
   - Create `apps/api/_qa_mint.ts` (see **Appendix A**), run `npx tsx _qa_mint.ts` from `apps/api`. It prints `{refreshToken, workspaceId, ...}`.
   - In the preview page, set the cookie and reload:
     ```js
     document.cookie = "fg_refresh=<refreshToken>; path=/";
     localStorage.setItem('flowgrid:theme','dark'); // or 'light'
     location.href = '/<workspaceId>';
     ```
   - The SPA calls `POST /api/auth/refresh` on mount → authenticates. **Delete `_qa_mint.ts` when done** (it's a QA-only artifact).
4. **Toggle themes** via the sun/moon button at the bottom of the sidebar, or `localStorage.setItem('flowgrid:theme', 'dark'|'light')` + reload.
5. **Always finish a task with:** `cd apps/web && npx tsc --noEmit` (must pass) and a `preview_screenshot` in BOTH themes compared against the matching mockup `screen.png`.

**Mockup reference files** (each folder has `screen.png`; design tokens in `apex_precision/DESIGN.md` + `editorial_precision/DESIGN.md`):
| Screen | Dark mockup folder | Light mockup folder |
|---|---|---|
| Dashboard/Boards | `flowgrid_premium_dashboard_redesign` | `flowgrid_dashboard_themed_variant` |
| Kanban board | `flowgrid_kanban_workspace_apex_dark_variant` | `flowgrid_kanban_workspace_light_editorial_variant` |
| Analytics | `flowgrid_analytics_apex_dark_variant` | `flowgrid_analytics_editorial_premium_redesign` |
| Members | `flowgrid_members_apex_dark_variant` | `flowgrid_members_editorial_light_variant` |
| Task details | `flowgrid_task_details_apex_dark_variant` | `flowgrid_task_details_editorial_light_variant` |
| Workspace settings | `flowgrid_workspace_settings_apex_dark_variant` | `flowgrid_workspace_settings_editorial_light_variant` |

---

## Design System Reference (already implemented — do not regress)

`apps/web/src/styles/tokens.css` defines per-theme tokens. Use these variables, never raw hex:
- Surfaces: `--color-paper`, `--color-paper-2`, `--color-paper-3`
- Text: `--color-ink`, `--color-ink-2`, `--color-ink-3`
- Accent: `--color-accent`, `--color-accent-hover`, `--color-accent-muted`
- Semantic: `--color-border`, `--color-error`, `--color-success`, `--color-warning`, `--color-focus`
- Fonts: `--font-display` (Apex=Inter, Editorial=Anton), `--font-body` (Apex=Inter, Editorial=Hanken Grotesk), `--font-mono`
- Radius: `--radius-card/-button/-badge/-input/-modal` (Apex=rounded, Editorial=sharp)
- `--shadow-card`, `--shadow-pop`, `--display-tracking`
- Consume as `oklch(var(--color-x))`. Example: `background: oklch(var(--color-paper-2))`.

**Apex (dark) feel:** ink-black canvas, electric-blue `#0066ff` accent, glass 1px borders, subtle blur on modals, rounded 8–14px.
**Editorial (light) feel:** warm off-white, coral accent, FLAT (no shadows), sharp 0–4px corners, Anton headlines (often uppercase section labels via Hanken Grotesk 700 + 0.12em tracking).

---

## STATUS OVERVIEW (Phase ↔ Screen)

| Phase | Screen | State |
|---|---|---|
| 0 | Foundation (tokens, sidebar, partial pages) | ✅ DONE (prior session) |
| 1 | Dashboard / Boards | ⏳ Partial (header+search done) |
| 2 | Analytics | ⏳ Partial (base structure exists) |
| 3 | Members | ⏳ Partial (stat cards done) |
| 4 | Kanban board + cards | ⏳ Pending |
| 5 | Task details modal | ⏳ Mostly done (header chrome missing) |
| 6 | Workspace settings | ⏳ Partial (identity/general/danger done) |
| 7 | Cross-cutting polish | ⏳ Pending |

---

## Phase 0 — Foundation (✅ DONE — reference only)

Already completed and verified in both themes:
- [x] `tokens.css` remapped: dark=Apex, light=Editorial; fonts + radius theme-aware.
- [x] `index.html`: added Inter font.
- [x] `index.css`: headings use `--display-tracking`.
- [x] `AppLayout.tsx`: grouped sidebar (Overview/Insights/Manage), active accent bar, `end` on Boards nav (only-one-active fix).
- [x] `WorkspacePage.tsx`: header (title + role badge + count subtitle + Invite/Settings/New Board) + client board search.
- [x] `WorkspaceMembersPage.tsx`: stat-card row (Total/Owners/Pending/Active).

---

## Phase 1 — Dashboard / Boards page (`WorkspacePage.tsx`)

**Target (from `flowgrid_premium_dashboard_redesign` / `flowgrid_dashboard_themed_variant`):**
Header (done) → search + filter chips + view toggle → board grid with rich cards → Recent Activity + Upcoming Deadlines two-column section.

**Files:**
- Modify: `apps/web/src/pages/WorkspacePage.tsx`
- Modify: `apps/web/src/components/boards/BoardCard.tsx`
- Modify: `apps/web/src/api/boards.ts` (BoardSummary shape) ⚠️BACKEND
- Modify: `apps/api/src/routes/boards.ts` (add members + cardCount to list response) ⚠️BACKEND
- Read for data: `apps/web/src/api/activities.ts`, `apps/web/src/components/boards/ActivityFeed.tsx`

### Task 1.1 — Filter chips (All / Recent / Shared)
- [ ] Add `const [filter, setFilter] = useState<'all'|'recent'|'shared'>('all')`.
- [ ] Render a segmented chip group to the right of the search bar (match mockup: pill group, active chip filled with `--color-paper-3`/accent text).
- [ ] Apply filter to `filteredBoards`:
  - `all`: no filter.
  - `recent`: sort by `updatedAt` desc (top 8) — boards already have `updatedAt`.
  - `shared`: `visibility !== 'PRIVATE'`.
- [ ] **Verify:** chips switch board set; active styling correct in both themes.

### Task 1.2 — View toggle (grid / list)
- [ ] Add `const [view, setView] = useState<'grid'|'list'>('grid')` (persist to `localStorage('flowgrid:boardsView')`).
- [ ] Add the two-icon toggle at the far right of the search row (grid icon + list icon; active has `--color-paper-3` bg). Icons: 2x2 squares + horizontal lines (copy style from mockup).
- [ ] When `view==='list'`, render boards as full-width rows (cover swatch chip + name + visibility + listCount + updated time) instead of the grid.
- [ ] **Verify:** toggle switches layout; persists across reload.

### Task 1.3 — ⚠️BACKEND: board members + card count in list response
- [ ] In `apps/api/src/routes/boards.ts`, find the `GET /boards` (list) handler. Extend each board with:
  - `members: {id,name,avatarUrl}[]` (first ~3 board/workspace members) and `memberCount: number`.
  - `cardCount: number` (count cards across the board's lists where `deletedAt IS NULL`).
  - Keep it efficient (single `include`/`groupBy`; avoid N+1).
- [ ] Update `BoardSummary` in `apps/web/src/api/boards.ts` to include `members`, `memberCount`, `cardCount`.
- [ ] Run `cd apps/api && npx tsc --noEmit` and `cd apps/web && npx tsc --noEmit`.

### Task 1.4 — Rich board cards (`BoardCard.tsx`)
- [ ] Cover strip: keep `coverColor`; center a board glyph/icon (mockup shows an icon in the colored header). Use a neutral board icon tinted white at 80%.
- [ ] Content row: member avatars cluster (overlapping circles, show up to 3 + `+N`), visibility chip (Private/Workspace/Public — already have icons), `listCount` lists, and a relative "Xm ago" from `updatedAt` (write a small `timeAgo(iso)` helper — or reuse one if present; search `timeAgo`/`formatRelative` first).
- [ ] Match Apex (rounded, subtle border, hover lift) vs Editorial (flat, sharp, 1px border, no shadow). The token radius/shadow already differ per theme — keep using tokens.
- [ ] **Verify:** card matches mockup in both themes (avatars, count, time).

### Task 1.5 — Recent Activity section
- [ ] Confirm a workspace-level activity source exists. Check `apps/web/src/api/activities.ts` and `apps/api/src/routes/activities.ts`. If activities are board-scoped only, add ⚠️BACKEND `GET /activities?workspace_id=` that aggregates recent activities across the workspace's boards (limit 10).
- [ ] Below the board grid, render a "RECENT ACTIVITY" section (uppercase Hanken/Inter label): rows of `avatar + "<b>Name</b> <action> <target>" + relative time`. Reuse `ActivityFeed.tsx` rendering style if compatible; otherwise build a compact list.
- [ ] Empty state: "No recent activity yet."
- [ ] **Verify:** real activities render; matches mockup left column.

### Task 1.6 — Upcoming Deadlines card
- [ ] ⚠️BACKEND (small): add `GET /cards/upcoming?workspace_id=&days=14` returning cards with a `dueDate` within N days across the workspace, sorted ascending: `{id, title, dueDate, boardId, listId}`. (Or compute client-side if a workspace cards endpoint already exists — check `cards.ts` client first.)
- [ ] Render the "UPCOMING DEADLINES" card (right column): calendar icon header, rows of `• <title>` + a right-aligned relative tag (`TODAY`/`TOMORROW`/date). Color the tag with `--color-accent`/`--color-warning` for today/tomorrow.
- [ ] Clicking a row navigates to the board (and opens the card if feasible).
- [ ] Empty state: "No upcoming deadlines."
- [ ] **Verify:** two-column section matches mockup; both themes.

**Phase 1 Verification:**
- `cd apps/web && npx tsc --noEmit` passes.
- Screenshot `/<wsId>` in dark + light; compare to dashboard mockups (header, chips, toggle, rich cards, activity, deadlines).

---

## Phase 2 — Analytics page (`AnalyticsPage.tsx`)

**Target (`flowgrid_analytics_apex_dark_variant` / `flowgrid_analytics_editorial_premium_redesign`):**
Eyebrow "WORKSPACE OVERVIEW" + "Analytics" title + "Last updated: Just now" + "Last 30 Days" dropdown + Export button → 4 stat cards (icon + value + trend%) → Cards by Priority (donut + legend) + Cards by Board (bar) → Activity Over Time (line chart / empty state with "View Raw Logs") → Team Insights / Top Contributors (rows + Invite Member tile).

**Files:**
- Modify: `apps/web/src/pages/AnalyticsPage.tsx`
- Modify: `apps/api/src/routes/analytics.ts` ⚠️BACKEND (trend deltas)
- Modify: `packages/types/src/index.ts` (AnalyticsTotals trend fields) ⚠️BACKEND

### Task 2.1 — Header chrome
- [ ] Add eyebrow label "WORKSPACE OVERVIEW" (accent color, uppercase, 0.12em tracking) above the `Analytics` H1.
- [ ] Add right cluster: "Last updated: Just now" (muted, with clock glyph), a "Last 30 Days" dropdown (static options: 7/30/90 days — wire to refetch if endpoint supports a range param; else display-only with TODO note), and an "Export" button (accent filled, download glyph) → triggers Task 2.6.
- [ ] **Verify:** header matches both mockups (Editorial = coral Export + Anton title).

### Task 2.2 — ⚠️BACKEND: trend deltas
- [ ] In `analytics.ts`, also compute previous-period totals (the 30 days before the current window) and return `trend` deltas. Extend `AnalyticsTotals` in `packages/types/src/index.ts`:
  ```ts
  export interface AnalyticsTotals {
    totalCards: number; totalBoards: number; totalMembers: number; totalActivities: number;
    cardsTrendPct: number; boardsTrendPct: number; membersTrendPct: number; activitiesTrendPct: number;
  }
  ```
- [ ] Compute pct = `prev === 0 ? (curr>0?100:0) : Math.round((curr-prev)/prev*100)`.
- [ ] `cd apps/api && npx tsc --noEmit`.

### Task 2.3 — Stat cards with icon + trend
- [ ] Update the existing `StatCard` to accept `icon` and `trendPct`. Layout: uppercase label + small square icon top-right; big value (`--font-display`, 2xl/3xl); trend row (`↗ +12%` green / `→ 0%` muted / `↘ -x%` red) using `--color-success`/`--color-ink-3`/`--color-error`.
- [ ] Wire the 4 cards: Total Cards, Boards, Members, Activities (the analytics mockup uses "ACTIVITIES" not "(30d)"—match the label casing/wording exactly).
- [ ] **Verify:** matches mockup stat row in both themes.

### Task 2.4 — Cards by Priority donut
- [ ] Replace the current priority bar with a donut/pie (SVG `<circle>` stroke-dasharray segments, or a minimal hand-rolled donut). Legend below: ● High ● Medium ● Low with counts. Colors: High=`--color-error`, Medium=`--color-accent`, Low=`--color-ink-3` (match mockup legend order/colors).
- [ ] Empty state (no cards): the donut outline glyph + "No cards yet…".
- [ ] **Verify:** donut + legend match.

### Task 2.5 — Cards by Board bar + Activity Over Time
- [ ] Keep "Cards by Board" as a vertical bar chart (already close); restyle bars to `--color-accent`, labels under bars.
- [ ] "Activity Over Time": render a simple line/area chart from `activityOverTime` when data exists; otherwise the mockup empty card: chart-up icon + "Activity Over Time" + helper text + a "VIEW RAW LOGS" ghost button (links to board activity or a no-op TODO).
- [ ] **Verify:** both chart cards match.

### Task 2.6 — Team Insights / Top Contributors + Export CSV
- [ ] Render `topMembers` as rows: square avatar/initials tile + name + role + right-aligned "N Actions". After the rows, an "Invite Member" dashed tile (links to `/<wsId>/members`). Section header "Team Insights" with right-aligned "TOP CONTRIBUTORS" label (Editorial mockup).
- [ ] Implement Export: build a CSV string from the analytics data (totals + top members) client-side and trigger download via a Blob + anchor. No backend needed.
- [ ] **Verify:** contributors section + Export download work; both themes.

**Phase 2 Verification:** tsc passes; screenshots match analytics mockups (eyebrow, trend stat cards, donut, contributors, Export).

---

## Phase 3 — Members page (`WorkspaceMembersPage.tsx`)

**Target (`flowgrid_members_apex_dark_variant` / `flowgrid_members_editorial_light_variant`):**
"Team Members" title + subtitle + Export CSV + Team Settings buttons → stat cards (with icons) → Invite New Member row → Active Members (search + rows with status dot + ⋮ menu) → No Pending Invites empty state.

**Files:** Modify `apps/web/src/pages/WorkspaceMembersPage.tsx`.

### Task 3.1 — Header buttons + title wording
- [ ] Change H1 to "Team Members"; subtitle already "Manage workspace access and roles (N total)".
- [ ] Add header-right buttons: "Export CSV" (secondary, download glyph) and "Team Settings" (secondary, gear glyph → `/<wsId>/settings`). Use a flex header like WorkspacePage.
- [ ] **Verify:** header matches.

### Task 3.2 — Stat card icons
- [ ] Add an icon to each `MemberStat` (members glyph, shield/owner glyph, envelope glyph, check/active glyph) top-right, matching the mockup stat cards.
- [ ] **Verify.**

### Task 3.3 — Active Members search + row chrome
- [ ] Add a "Search members…" input in the members card header (client filter over name/email).
- [ ] Each member row: avatar, name + (you), email, role badge (Owner/Member styled like mockup), a green "Active" status dot + label, and a ⋮ overflow menu replacing the inline role-select + Remove (menu items: Change role → submenu/options, Remove). Keep existing handlers (`handleRoleChange`, `handleRemove`) wired into the menu. Guard by `canManage`/not-self/not-owner as today.
- [ ] **Verify:** rows match mockup; role change + remove still work.

### Task 3.4 — Export CSV
- [ ] Implement Export CSV: members list → CSV (name,email,role,status) → Blob download.
- [ ] **Verify.**

### Task 3.5 — Pending invites empty state
- [ ] Style the empty state to match: centered envelope-in-circle icon + "No Pending Invites" (Anton in light) + helper "Any invites you send will appear here until accepted. They expire after 7 days." Dashed border card.
- [ ] **Verify.**

**Phase 3 Verification:** tsc; screenshots match members mockups both themes.

---

## Phase 4 — Kanban board + cards (`BoardPage.tsx`, `CardItem.tsx`, `ListColumn.tsx`)

**Target (`flowgrid_kanban_workspace_*`):**
Board header (title + "Team · visibility") → columns with count badges (+ status blip on In Progress) → cards: category label chip, title, assignee avatar(s) + `+N`, comment count, attachment count, status pill ("In Review"), due-date flag, completed strikethrough + "Completed <date>".

**Files:** Modify `apps/web/src/components/boards/CardItem.tsx`, `ListColumn.tsx`, `apps/web/src/pages/BoardPage.tsx`. Read first to learn current structure.

### Task 4.1 — Read current state
- [ ] Read `CardItem.tsx`, `ListColumn.tsx`, and the board header in `BoardPage.tsx`. Note which of: label chip, assignee avatar, comment count, attachment count, due date, watchers — already render. Record findings in Progress Log.

### Task 4.2 — Column header
- [ ] Column header: uppercase list name + a count badge (`--color-paper-3` pill). For lists whose name implies in-progress (or any list — match mockup generic), the mockup shows a small accent "blip" before the count on one column; replicate as a subtle accent dot on the active/hovered column header (keep simple: show blip on columns with at least one card in progress — or omit if ambiguous; match the visual, not literal semantics).
- [ ] **Verify.**

### Task 4.3 — Card face
- [ ] Ensure each card renders, top-to-bottom: optional category **label chip** (first label, small uppercase chip with label color bg at low opacity), **title**, footer row with: assignee avatar cluster (`+N`), comment count (speech glyph + n) when >0, attachment count (paperclip glyph + n) when >0, due-date flag (flag glyph + date, colored `--color-error` when overdue/soon), and a right-aligned **status pill = the card's list name** (DECIDED: derive status from `list.name`, e.g. a card in the "In Review" list shows an "In Review" pill). Render the pill subtly (accent dot + muted text) so it doesn't fight the label chip.
- [ ] "Done"-list cards: strike-through title + "Completed <Mon DD>" (use card `updatedAt` or completion—if no completedAt, use updatedAt) muted.
- [ ] Selected/focused card: 1px accent border (Apex blue, Editorial coral) like the mockup's highlighted "In Progress" card.
- [ ] **Verify:** card faces match both mockups closely.

### Task 4.4 — Board header
- [ ] Header: board name (H1) + "<workspaceName> · <visibility>" subtitle. Keep the Kanban/Calendar/Timeline view tabs (already exist). In Apex, the mockup header has a blue tint band — keep current styling but verify it reads as the mockup.
- [ ] **Verify.**

**Phase 4 Verification:** tsc; screenshots of board match kanban mockups both themes (don't break @dnd-kit drag — test dragging a card).

---

## Phase 5 — Task details modal (`CardDetailModal.tsx` + sections)

**Target (`flowgrid_task_details_*`):** Most already implemented. Missing header chrome.

**Files:** Modify `apps/web/src/components/boards/CardDetailModal.tsx` (and confirm `ChecklistSection`, `AttachmentSection`, `WatchersSection`, `DependenciesSection`, `CommentThread`).

### Task 5.1 — Modal header chrome
- [ ] Add a `TASK-<shortid>` mono badge (derive a short code from card id, e.g. last 4 chars uppercased, prefixed `TASK-`) + a status pill (map from list name, e.g. "In Progress", accent dot + text). Place left of the title block, above the title.
- [ ] Add header-right icon buttons: an **eye/watch** toggle (wire to existing watch/unwatch via `WatchersSection` logic or `cardWatchers` API), a **share** button (copy card deep-link to clipboard + toast), an **⋮** overflow (Delete card, etc. — reuse existing actions if present), and the existing close (×).
- [ ] **Verify:** header matches mockup; watch toggle + copy-link work.

### Task 5.2 — Section parity audit
- [ ] Confirm CHECKLIST (progress bar + %), ATTACHMENTS (+Add, file rows, drag&drop), PRIORITY/START/DUE/ASSIGNEE, WATCHERS (+Watching toggle), LABELS (+Add label), DEPENDENCIES (Blocks/Blocked by +Add) all render and match. Fix any spacing/label-casing deltas vs mockup (section labels are uppercase, 0.1em tracking, `--color-ink-3`).
- [ ] **Verify** both themes.

**Phase 5 Verification:** tsc; screenshots match task-detail mockups.

---

## Phase 6 — Workspace settings (`WorkspaceSettingsPage.tsx`)

**Target (`flowgrid_workspace_settings_*`):**
Top bar (breadcrumb "FlowGrid › Workspace Settings" + Live badge, notif/search icons, Cancel + Save Changes) → title + subtitle + Actions dropdown → Identity & Branding (logo upload/remove, Accent Color swatches + hex) → General Information (Workspace Name, Workspace URL slug, Description) → right Preview card + meta (Created/Members/Boards) → Danger Zone (done). Editorial variant shows a left sub-nav (General/Members/Billing/Integrations/Security). **DECIDED: omit the sub-nav entirely** — the page is a single General settings view (no Billing/Integrations/Security, those have no backend). Do not render the sub-nav column.

**Files:** Modify `apps/web/src/pages/WorkspaceSettingsPage.tsx`; `apps/web/src/api/workspaces.ts` (ensure `slug`, counts available); maybe `apps/api/src/routes/workspaces.ts` ⚠️BACKEND (return board count + member count + createdAt if not already on detail).

### Task 6.1 — Sticky top action bar
- [ ] Add a top bar: breadcrumb "FlowGrid › Workspace Settings" + a small "Live" status badge (accent dot). Right side: Cancel (reverts form to loaded values) + Save Changes (accent). Wire Save to the existing update handler; Cancel resets local form state.
- [ ] **Verify.**

### Task 6.2 — Title + Actions dropdown
- [ ] Title = workspace name; subtitle "Manage your workspace identity, general settings, and operational preferences." Add an "Actions" dropdown (menu: e.g., Duplicate (stub/omit), Leave workspace, Delete — only wire actions that exist).
- [ ] **Verify.**

### Task 6.3 — Identity & Branding
- [ ] Card with header "Identity & Branding" + gear glyph. Logo block: current logo/initials, "Upload Image" + "Remove". Accent Color: swatch row (existing colors) + show the selected hex string (e.g., `#8b5cf6`) next to swatches.
- [ ] **Verify.**

### Task 6.4 — General Information (+ Workspace URL)
- [ ] Card "General Information". Fields: Workspace Name (exists), **Workspace URL** = read-only prefix `flowgrid.app/` + editable slug input bound to `workspace.slug` (⚠️BACKEND: ensure update endpoint accepts `slug`; validate uniqueness server-side — if not supported, render read-only), Description (exists).
- [ ] **Verify.**

### Task 6.5 — Preview card + meta
- [ ] Right column "Preview" card: live render of the workspace badge (logo/initials + name) as it appears to members, with a visibility eye. Below it a meta list: Created `<date>` (from `createdAt`), Members `<memberCount>`, Boards `<boardCount>`. ⚠️BACKEND: ensure `getOne`/detail returns `createdAt`, `memberCount`, `boardCount` (add if missing). Omit "Region" (no data) or hardcode with a TODO.
- [ ] **Verify.**

### Task 6.6 — Layout
- [ ] Switch to a two-column layout (main forms left, Preview/meta right) on desktop; stack on mobile. Keep Danger Zone full-width at the bottom (done).
- [ ] **Verify** both themes (Editorial = flat cards, Anton headers; Apex = rounded, glass).

**Phase 6 Verification:** tsc; screenshots match settings mockups.

---

## Phase 7 — Cross-cutting polish

**Files:** various; `tokens.css`; `index.css`.

### Task 7.1 — Apex glass + Editorial flat fidelity
- [ ] Modals/popovers in Apex: add `backdrop-filter: blur(20px)` + translucent `--color-paper-2` and `--shadow-pop`; in Editorial keep flat (no blur, no shadow). Gate via theme using a CSS class or `[data-theme]` rule (not inline, since blur differs per theme) — add helper classes in `index.css` (e.g., `.surface-pop`).
- [ ] **Verify** SearchModal, CardDetailModal, dropdowns.

### Task 7.2 — Status blips + micro-animations
- [ ] Add an 8px accent "blip" with a subtle breathing animation (`@keyframes` in `index.css`, respect `prefers-reduced-motion`) for "Live"/active indicators (settings top bar, in-progress column, presence).
- [ ] **Verify.**

### Task 7.3 — Typography + spacing audit vs DESIGN.md
- [ ] Cross-check headline sizes/tracking, section labels (uppercase 0.12em), body 14px, card padding (Apex 20px / Editorial per its scale) against `apex_precision/DESIGN.md` + `editorial_precision/DESIGN.md`. Fix obvious deviations.
- [ ] **Verify.**

### Task 7.4 — Responsive + a11y pass
- [ ] Check each page at 375 / 768 / 1440 (preview presets). Ensure header button rows wrap, grids reflow, sidebar drawer works on mobile.
- [ ] A11y: focus rings, `aria-label` on icon buttons, color-contrast for coral/blue on their backgrounds, 44px touch targets.
- [ ] **Verify.**

### Task 7.5 — Final build gate
- [ ] `cd apps/web && npm run build` (tsc -b + vite build) passes.
- [ ] Full screenshot sweep of all 6 screens × 2 themes vs mockups. Log diffs.

---

## Backend additions summary (⚠️BACKEND — group these if doing API work in one pass)
1. `GET /boards` list: add `members[]`, `memberCount`, `cardCount` (Task 1.3).
2. `GET /activities?workspace_id=`: workspace-level recent activity (Task 1.5, if not already).
3. `GET /cards/upcoming?workspace_id=&days=`: upcoming deadlines (Task 1.6, or client-derive).
4. `analytics.ts` + `AnalyticsTotals`: previous-period trend percentages (Task 2.2).
5. `workspaces` update: accept `slug` w/ uniqueness; detail returns `createdAt`, `memberCount`, `boardCount` (Tasks 6.4, 6.5).

Keep all DB access through Prisma; follow existing route patterns; no N+1; respect soft-delete (`deletedAt IS NULL`) and permission checks (workspace membership; private-board BoardMember rule).

---

## Out of scope / decisions (RESOLVED)
- ✅ DECIDED: Settings sub-nav **Billing / Integrations / Security** — **omit entirely** (single General view).
- ✅ DECIDED: Card "status pill" — **derive from the card's list name** (Task 4.3).
- Analytics "Region US-East" (no data) — omit (don't render the Region meta row).
- "Last 30 Days" range switching if analytics endpoint has no range param — display-only until backend supports it (Task 2.1).

---

## Appendix A — QA cookie mint script (`apps/api/_qa_mint.ts`, delete after use)
```ts
import crypto from "crypto"
import { prisma } from "./src/lib/prisma"
import { redis, redisKeys } from "./src/lib/redis"
import { signRefreshToken, REFRESH_TOKEN_TTL_SECONDS } from "./src/lib/jwt"

async function main() {
  const m = await prisma.workspaceMember.findFirst({ include: { user: true, workspace: true }, orderBy: { createdAt: "asc" } })
  if (!m) { console.log(JSON.stringify({ error: "no membership" })); return }
  const jti = crypto.randomUUID()
  const refreshToken = signRefreshToken({ sub: m.user.id, jti })
  await redis.set(redisKeys.refresh(jti), m.user.id, { ex: REFRESH_TOKEN_TTL_SECONDS })
  console.log(JSON.stringify({ refreshToken, userId: m.user.id, email: m.user.email, workspaceId: m.workspaceId, workspaceName: m.workspace.name }))
}
main().then(() => process.exit(0)).catch((e) => { console.error("MINT_ERR", e?.message ?? e); process.exit(1) })
```
Cookie name is `fg_refresh`. The SPA exchanges it via `POST /api/auth/refresh` on mount.

---

## Progress Log (update every task; newest at top)

- 2026-06-03 — **ALL PHASES COMPLETE.** Full implementation verified in browser (dark + light). Production build passes. No console errors.
  - Phase 1 ✅: Dashboard — filter chips, view toggle, rich BoardCards (avatars+cardCount+timeAgo), Recent Activity, Upcoming Deadlines. Backend: boards list adds members[]+cardCount, activities/workspace endpoint, cards/upcoming endpoint.
  - Phase 2 ✅: Analytics — WORKSPACE OVERVIEW eyebrow, trend-% stat cards with icons, Priority donut SVG, Cards-by-Board bar, Activity Over Time empty state, Team Insights/Contributors + Invite Member tile, Export CSV.
  - Phase 3 ✅: Members — "Team Members" h1, Export CSV + Team Settings header buttons, stat cards with icons, "Active Members" section with search + role badge + Active dot + ⋮ overflow menu, styled "No Pending Invites" empty state.
  - Phase 4 ✅: Kanban — uppercase column headers + accent blip + count badge, card face: label chip (first label), priority dot, assignee avatar, comment count, attachment count, due-date flag, status pill = list name, done-list strikethrough. Backend: cards list adds commentCount+attachmentCount.
  - Phase 5 ✅: Task details modal — TASK-XXXX mono badge, status pill (list name), Watch/Share/⋯/× icon buttons added to header top row.
  - Phase 6 ✅: Workspace settings — sticky top action bar (breadcrumb + Live badge + Cancel + Save Changes), workspace name as title + subtitle, Actions dropdown, Identity & Branding card (logo + color swatches + hex display), General Information (name + URL slug read-only + description), Preview card (right column: badge + Created/Members/Boards), two-column layout, Danger Zone full-width. No sub-nav (per decision).
  - Phase 7 ✅: Cross-cutting polish — `.surface-pop` glass class (Apex blur / Editorial flat), `.blip` breathing keyframe animation (prefers-reduced-motion safe), `settings-grid` responsive breakpoint. Production build passes (tsc-b + vite build).
- 2026-06-03 — Product decisions locked: status pill = list name; Settings sub-nav omitted; Region row omitted. Execution deferred to a NEW session — start at **Phase 1, Task 1.1**.
- 2026-06-03 — Plan created. Phase 0 complete (foundation). Verified all 6 screens render in both themes after token remap.

<!-- When resuming: append a dated line per completed task here, and tick the `- [ ]` boxes above. -->
