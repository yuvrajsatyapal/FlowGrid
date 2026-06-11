# Responsive Team Members Page — Design

**Date:** 2026-06-12
**File:** `apps/web/src/pages/WorkspaceMembersPage.tsx`
**Goal:** Make the Team Members page usable on small and medium screens, with iPhone SE (375px) as the floor.

## Problem

The page is built entirely with fixed inline styles: `maxWidth: 960px`, padding `32px 36px`, and member/invite rows laid out as a single horizontal flex line (avatar + name/email + role badge + online status + `⋮` menu). At 375px this breaks:

- Member names truncate to "Yuvi S…", emails truncate.
- Role badge, online-status label, and the `⋮` menu crowd the right edge.
- Section padding is too wide, wasting horizontal space.
- The "Active Members" title wraps to two lines fighting its search box.
- Pending-invite rows (name/email + badge + Resend + Revoke) overflow.

## Approach

Follow the codebase's existing responsive pattern exactly — no new dependencies, no CSS files, no markup restructure beyond conditional inline styles.

- Add `const isMobile = useWindowWidth() < 640` (hook: `apps/web/src/hooks/useWindowWidth.ts`).
- Single breakpoint at **640px**: matches `CardDetailModal`'s existing breakpoint. `< 640` covers iPhone SE (375px) through large phones. `>= 640` keeps today's desktop layout, which already fits fine inside the 960px container at tablet widths.
- Drive all changes via `isMobile ? mobileStyle : desktopStyle` inline conditionals, as `WorkspacePage` does.

## Scope of changes (all within `WorkspaceMembersPage.tsx`)

### 1. Page shell
- Root padding: `32px 36px` → `18px 16px 32px` when mobile (matches `WorkspacePage`).
- Header row (title + Export CSV / Team Settings): already `flex-wrap`. On mobile, the two action buttons fill the line evenly — each `flex: 1` — instead of clustering top-left. The button container goes full-width below the title.

### 2. Stat cards
- Keep the `auto-fit` grid. Reduce `minmax(140px, 1fr)` → `minmax(130px, 1fr)` for slightly more breathing room. Still a clean 2×2 at 375px. No structural change.

### 3. Invite form
- Search input stays full-width (`flex: 1 1 200px`).
- On mobile, role `<select>` and "Send invite" share the next row: select `flex: 1`, button auto-width.
- Search-results dropdown is already absolutely positioned full-width — unchanged.

### 4. Active Members section header
- On mobile, stack vertically: title on top, "Search members…" box full-width below it. (Desktop keeps them side-by-side via the existing `space-between` row.)

### 5. Member rows — the core change
On mobile, each row becomes a **stacked card block** instead of one horizontal line:

- **Top line:** avatar (36px) + full name with `(you)` suffix + `⋮` menu pinned right. Name no longer needs `nowrap`/ellipsis on mobile — it may wrap.
- **Second line:** email, left-indented to align under the name (past the avatar + gap).
- **Third line:** role badge + online-status dot/label, same indent.
- The current-user row (no menu, `canModify` false) keeps the same structure so vertical alignment stays consistent across rows.
- Vertical padding bumped to `14px 16px` on mobile for touch comfort. Rows still separated by the existing bottom border (drop on last row).

Desktop (`>= 640`) keeps the existing single-line flex layout untouched.

### 6. Pending Invites rows
Same stacked treatment on mobile:
- Avatar + invitee name on the top line.
- `email · Expires <date>` (or "Expired") below.
- Role badge on its own line.
- **Resend / Revoke** as two side-by-side buttons on a final row, each `flex: 1` (full-width-ish, tap-friendly ≥44px target). The "Sent!" confirmation stays inline with Resend.
- Empty state (envelope icon + copy) unchanged.

## Explicitly untouched

- All data fetching, `useWorkspaceSocket` presence handling, silent refresh interval/focus listeners.
- Member sorting/filtering logic, `canManage`/`canModify` gating.
- Role change, remove, invite, resend, revoke handlers and CSV export.
- `MemberMenu` overflow menu and its viewport drop-up flip logic.
- The entire `>= 640px` desktop appearance.

## Acceptance criteria

- At 375px (iPhone SE): no horizontal scroll; no member name or email truncated by layout; role badge, status, and `⋮` menu all fully visible; Resend/Revoke buttons fully tappable.
- At 640px and above: visually identical to the current desktop layout.
- Resizing across the 640px boundary reflows live (the `useWindowWidth` hook already listens to resize).
- No new TypeScript/build errors (`yarn build` clean per FRONTEND.md).
