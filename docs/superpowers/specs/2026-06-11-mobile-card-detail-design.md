# Mobile Card Detail — Design Spec

**Date:** 2026-06-11
**Status:** Approved
**Scope:** `CardDetailModal.tsx` — mobile layout only (`< 640px`)

---

## Problem

On screens narrower than ~640px, `CardDetailModal` renders a fixed two-column body:
- Left column (`flex: 1`, ~155px on a 375px screen): description text wraps into a single-character column with ugly hyphenation.
- Right sidebar (fixed `width: 220px`): takes more than half the screen width.
- Header row packs TASK badge + list pill + "Mark as Complete" button + trash icon — overflows on phones with longer board names.

## Goal

Make the card detail modal fully readable and usable on phones (< 640px) with no information hidden, no horizontal overflow, and no change to the desktop experience.

---

## Design

### Breakpoint

`windowWidth < 640` — same as `headerIsSmall` already used in `BoardPage.tsx`. Detected via `useWindowWidth()` called directly inside `CardDetailModal` — no prop threading required.

No changes are made above 640px.

---

### 1. Header (mobile)

**Current:** `[TASK-XXXX] [● React] [□ Mark as Complete] [🗑]` — text button causes overflow.

**New:**
- "Mark as Complete" button collapses to a **28×28px icon-only button** showing `✓`.
- When complete: button background turns `oklch(var(--color-success))` (green), icon turns white.
- `title="Mark as complete"` / `title="Mark as incomplete"` preserved for accessibility.
- Trash button and badge row unchanged.
- Title (`<h1>`) remains below the badge row, full-width.

---

### 2. Body layout (mobile)

The fixed two-column `display: flex` body becomes a **single scrollable column**.

#### Metadata fields — paired rows

Fields are grouped into 2-column rows using `display: grid; grid-template-columns: 1fr 1fr`:

| Row | Left | Right |
|-----|------|-------|
| 1 | Priority (select) | Due Date (date input + clear) |
| 2 | Start Date (date input + clear) | Assignee (select + avatar) |

Each cell has its own section padding, field label, and input. No change to field behaviour — selects, date pickers, and clear buttons all work identically.

#### Labels — full-width row

Labels get a dedicated full-width section below the metadata rows:
- Existing label chips + remove button
- "+ Add label" inline

#### Description — full-width

The description editor (`EditorContent`) renders at full card width with the existing border, padding, and inline edit behaviour. `minHeight: 120` preserved.

#### Sections — inline, always expanded

Checklist, Attachments, Watchers, and Dependencies render in-flow below the description, separated by a divider — exactly as they do on desktop. No accordion or collapse state is added. Each section already manages its own layout via its sub-component.

Order (top to bottom): Description → Checklist → Attachments → Watchers → Dependencies.

---

### 3. Blocked banner

The blocked warning banner (`🔒 This card is blocked…`) stays full-width below the header, unchanged.

---

### 4. Save state indicator

The auto-save dot (`saving` / `saved` / `error`) stays in the header area. No change.

---

## What does NOT change

- Desktop layout (≥ 640px): the two-column body is completely untouched.
- All field logic: priority change, date change, assignee change, label add/remove, watchers, dependencies — same handlers, same API calls.
- Animation (`framer-motion`): modal enter/exit animation unchanged.
- Viewer mode (`isViewer`): read-only behaviour unchanged on mobile.

---

## Files to change

| File | Change |
|------|--------|
| `apps/web/src/components/boards/CardDetailModal.tsx` | Add `isMobile` detection, conditional header button, conditional body layout |

No new components required. The existing sub-components (`ChecklistSection`, `AttachmentSection`, `WatchersSection`, `DependenciesSection`) are reused inside the expanded section rows.

---

## Acceptance criteria

- [ ] On a 375px viewport, no horizontal scrollbar appears on the modal.
- [ ] Description text is readable — no single-character word-wrap.
- [ ] All fields (priority, dates, assignee, labels) remain editable on mobile.
- [ ] "Mark as Complete" ✓ button works and turns green when toggled.
- [ ] Checklist, Attachments, Watchers, Dependencies sections are accessible by tapping.
- [ ] On a 1024px viewport, layout is identical to before this change.
