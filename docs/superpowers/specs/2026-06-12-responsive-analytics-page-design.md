# Responsive Analytics Page — Design

**Date:** 2026-06-12
**File:** `apps/web/src/pages/AnalyticsPage.tsx`
**Goal:** Make the Analytics page usable on small and medium screens, with iPhone SE (375px) as the floor.

## Problem

The page uses fixed inline styles tuned for desktop. At 375px:

- **Charts grid** uses `gridTemplateColumns: "340px 1fr"` (line 529). The fixed 340px first column is wider than the ~295px of available content width, so the whole row overflows horizontally — "Cards by Priority" is clipped on the left and "Cards by Board" bleeds off the right edge with a horizontal scroll.
- **Header right cluster** (period `<select>` + Export button) overflows the viewport; the Export button is cut off the right edge.
- **Page padding** `32px 40px` is too wide for 375px.
- The native period `<select>` renders a detached/overlapping option popup in mobile device emulation (same issue already fixed on the members page).

## Approach

Follow the established codebase pattern (as used on `WorkspaceMembersPage` and `CardDetailModal`):

- `const isMobile = useWindowWidth() < 640` (hook: `apps/web/src/hooks/useWindowWidth.ts`).
- Single breakpoint at **640px**. `< 640` reflows; `>= 640` keeps today's desktop layout unchanged.
- All changes via `isMobile ? … : …` inline conditionals. No new files, no CSS, no recharts changes.

## Scope of changes (all within `AnalyticsPage.tsx`)

### 1. Page shell
- Root padding `32px 40px` → `18px 16px 28px` on mobile.

### 2. Header
- On mobile, the header stacks: eyebrow + title block on top; the controls cluster goes full-width below.
- Controls: "Last updated: Just now" on its own line, then a row containing the period dropdown (`flex: 1`) + Export button side-by-side. Export gets `justify-content: center`. Nothing clips off the right edge.
- Desktop keeps the existing `space-between` wrap row.

### 3. Period dropdown
- On mobile, replace the native `<select>` with a custom anchored dropdown — same pattern as `RoleSelect` (members page) / `MobileSelect` (card detail): trigger button + option list `position: absolute; top: calc(100% + 4px); left: 0; right: 0` + a `position: fixed; inset: 0` tap-out backdrop. Selected option marked with an accent `✓`.
- Desktop keeps the native `<select>`.
- A small local `PeriodSelect` component holds this; it calls `setDays(Number)` like the native select did.

### 4. Totals grid
- On mobile, grid → `repeat(2, 1fr)` (2×2) with tighter `StatCard` padding (`16px 18px` instead of `20px 24px`).
- Desktop unchanged (`repeat(auto-fit, minmax(180px, 1fr))`).
- `StatCard` accepts an optional `compact`/`isMobile` flag to pick its padding.

### 5. Charts grid — the core fix
- On mobile, `gridTemplateColumns: "340px 1fr"` → single column (`"1fr"`), so the donut card and the bar-chart card each take full width and stack vertically. No horizontal overflow.
- The donut SVG (252px) fits inside the full-width card at 375px; the bar chart's `ResponsiveContainer` (`width="100%"`) reflows automatically.
- Desktop keeps the `340px 1fr` two-column layout.

### 6. Team Insights / Top Contributors
- Left as-is. Rows (avatar + name/role + actions count) already fit at 375px and stack cleanly.

## Explicitly untouched

- Data fetching (`useAnalytics`), loading/error states.
- XLSX export logic (`handleExport`).
- Donut math, tooltip, and legend internals.
- Recharts `BarChart` configuration and tooltip.
- The entire `>= 640px` desktop appearance.

## Acceptance criteria

- At 375px (iPhone SE): no horizontal scroll anywhere; Export button fully visible and tappable; period dropdown opens anchored directly under its trigger (not detached); totals show as a 2×2 grid; donut and bar charts each render full-width, stacked.
- At 640px and above: visually identical to the current desktop layout.
- Resizing across the 640px boundary reflows live (the `useWindowWidth` hook listens to resize).
- `pnpm --filter @flowgrid/web build` passes clean (no new TS/unused errors).

## Verification note

The Analytics page is behind Google-OAuth-only login, so a live logged-in screenshot isn't possible without a session (see project memory `project_auth_gated_preview`). Verification = build pass + the approved 375px standalone mockup + clean `/login` redirect with no console errors. Final live confirmation: log in and resize below 640px.
