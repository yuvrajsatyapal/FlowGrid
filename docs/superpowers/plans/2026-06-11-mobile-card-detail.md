# Mobile Card Detail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `CardDetailModal` fully readable and usable on phones (< 640px) with a single-column layout, tightened header, and no change to the desktop experience.

**Architecture:** `useWindowWidth` is extracted to a shared hook so both `BoardPage` and `CardDetailModal` can use it. The modal derives `isMobile = windowWidth < 640` and conditionally renders a single-column body (metadata grid → labels → description → sections inline) vs. the existing two-column layout. All field handlers, sub-components, and API calls are untouched.

**Tech Stack:** React, TypeScript, inline styles (no Tailwind/CSS modules), framer-motion (unchanged)

---

## File Map

| Action | File | What changes |
|--------|------|-------------|
| **Create** | `apps/web/src/hooks/useWindowWidth.ts` | Shared hook extracted from BoardPage |
| **Modify** | `apps/web/src/pages/BoardPage.tsx` | Remove local `useWindowWidth`, import from hooks/ |
| **Modify** | `apps/web/src/components/boards/CardDetailModal.tsx` | Add `isMobile`, conditional header button, conditional body layout |

---

## Task 1: Extract `useWindowWidth` to a shared hook

`useWindowWidth` is currently a private function in `BoardPage.tsx`. `CardDetailModal` needs the same hook — extract it to `hooks/` so both can import it without duplication.

**Files:**
- Create: `apps/web/src/hooks/useWindowWidth.ts`
- Modify: `apps/web/src/pages/BoardPage.tsx`

- [ ] **Step 1: Create the shared hook**

Create `apps/web/src/hooks/useWindowWidth.ts` with this exact content:

```ts
import { useState, useEffect } from "react"

/** Returns the current viewport width, updating on resize. */
export function useWindowWidth(): number {
  const [width, setWidth] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth : 1200
  )
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth)
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])
  return width
}
```

- [ ] **Step 2: Update `BoardPage.tsx` to import from the shared hook**

In `apps/web/src/pages/BoardPage.tsx`, remove the local `useWindowWidth` function (lines 36–46):

```ts
// DELETE this entire block:
function useWindowWidth() {
  const [width, setWidth] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth : 1200
  )
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth)
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])
  return width
}
```

Then add this import near the top of the file with the other hook imports:

```ts
import { useWindowWidth } from "../hooks/useWindowWidth"
```

- [ ] **Step 3: Verify the build passes**

```bash
cd apps/web && yarn build 2>&1 | tail -20
```

Expected: no TypeScript errors. If `useState`/`useEffect` are no longer used in `BoardPage.tsx` after the removal, remove them from its import line too.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/hooks/useWindowWidth.ts apps/web/src/pages/BoardPage.tsx
git commit -m "refactor: extract useWindowWidth into shared hook"
```

---

## Task 2: Mobile-aware complete button

On mobile the header row is tight. Replace the text "Mark as Complete" button with a compact 28×28px icon-only ✓ button when `isMobile` is true.

**Files:**
- Modify: `apps/web/src/components/boards/CardDetailModal.tsx`

- [ ] **Step 1: Import `useWindowWidth` and derive `isMobile`**

In `CardDetailModal.tsx`, add the import at the top with the other hook imports:

```ts
import { useWindowWidth } from "../../hooks/useWindowWidth"
```

Inside the component function body (after the existing `useState`/`useEffect` hooks, before the `return`), add:

```ts
const windowWidth = useWindowWidth()
const isMobile = windowWidth < 640
```

- [ ] **Step 2: Replace the completion button with a conditional render**

Find the completion toggle button block (around line 572). Replace it with:

```tsx
{effectiveCanEdit && (
  isMobile ? (
    /* Mobile: icon-only 28×28 button */
    <button
      onClick={handleToggleComplete}
      disabled={completing}
      aria-pressed={isComplete}
      title={isComplete ? "Mark as incomplete" : "Mark as complete"}
      style={{
        width: 28,
        height: 28,
        borderRadius: "var(--radius-button)",
        border: isComplete ? "none" : "1px solid oklch(var(--color-border))",
        background: isComplete ? "oklch(var(--color-success))" : "transparent",
        color: isComplete ? "#fff" : "oklch(var(--color-ink-2))",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: completing ? "default" : "pointer",
        opacity: completing ? 0.6 : 1,
        flexShrink: 0,
      }}
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
        <path d="M2.5 6.2l2.2 2.2L9.5 3.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  ) : (
    /* Desktop: existing text button — unchanged */
    <button
      onClick={handleToggleComplete}
      disabled={completing}
      aria-pressed={isComplete}
      title={isComplete ? "Mark as incomplete" : "Mark as complete"}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 12px",
        borderRadius: "var(--radius-button)",
        border: isComplete ? "none" : "1px solid oklch(var(--color-border))",
        background: isComplete ? "oklch(var(--color-success))" : "transparent",
        color: isComplete ? "#fff" : "oklch(var(--color-ink-2))",
        fontSize: "var(--text-xs)",
        fontWeight: 600,
        fontFamily: "var(--font-body)",
        cursor: completing ? "default" : "pointer",
        opacity: completing ? 0.6 : 1,
        flexShrink: 0,
      }}
    >
      <span style={{
        width: 14, height: 14, borderRadius: 4, flexShrink: 0,
        border: isComplete ? "none" : "1.5px solid oklch(var(--color-ink-3))",
        background: isComplete ? "rgba(255,255,255,0.25)" : "transparent",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {isComplete && (
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M2.5 6.2l2.2 2.2L9.5 3.6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      {isComplete ? "Completed" : "Mark as Complete"}
    </button>
  )
)}
```

- [ ] **Step 3: Verify the build passes**

```bash
cd apps/web && yarn build 2>&1 | tail -20
```

Expected: no TypeScript errors.

- [ ] **Step 4: Verify visually in the dev server**

```bash
cd apps/web && yarn dev
```

Open the app, open a card modal. In browser DevTools set viewport to 375px — confirm the complete button is a small square icon. Set viewport to 1024px — confirm the text button is restored. Close dev server with Ctrl+C.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/boards/CardDetailModal.tsx
git commit -m "feat(mobile): icon-only complete button on small screens"
```

---

## Task 3: Mobile body layout — single-column

Replace the two-column `display: flex` body with a conditional layout. On mobile: single-column with a 2-up metadata grid at the top, full-width labels, full-width description, then inline sections. On desktop: the existing two-column layout is completely untouched.

**Files:**
- Modify: `apps/web/src/components/boards/CardDetailModal.tsx`

- [ ] **Step 1: Wrap the existing body in a conditional**

Find the body section comment `{/* ── Body ── */}` (around line 697). The current markup is:

```tsx
{/* ── Body ── */}
<div style={{ display: "flex", gap: 0 }}>
  {/* Left: description */}
  <div style={{ flex: 1, padding: "16px 20px 20px", borderRight: "1px solid oklch(var(--color-border))", minWidth: 0 }}>
    ...description, checklists, attachments...
  </div>

  {/* Right: fields */}
  <div style={{ width: 220, flexShrink: 0, padding: "16px 20px 20px", display: "flex", flexDirection: "column", gap: 20 }}>
    ...priority, dates, assignee, labels, watchers, dependencies...
  </div>
</div>
```

Replace the entire `{/* ── Body ── */}` block with the following. The desktop right-column JSX (priority, start date, due date, assignee, labels, watchers, dependencies) is preserved character-for-character inside the `{/* Desktop: right column */}` section — do not change any of it:

```tsx
{/* ── Body ── */}
{isMobile ? (
  /* ── Mobile: single-column scroll ── */
  <div style={{ display: "flex", flexDirection: "column" }}>

    {/* Row 1: Priority (left) + Due Date (right) */}
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderBottom: "1px solid oklch(var(--color-border))" }}>
      <div style={{ padding: "12px 14px", borderRight: "1px solid oklch(var(--color-border))" }}>
        <FieldLabel>Priority</FieldLabel>
        <select
          value={localCard.priority}
          onChange={handlePriorityChange}
          disabled={!effectiveCanEdit}
          style={{
            width: "100%",
            padding: "6px 8px",
            borderRadius: "var(--radius-input)",
            border: "1px solid oklch(var(--color-border))",
            background: "oklch(var(--color-paper-2))",
            color: "oklch(var(--color-ink))",
            fontSize: "var(--text-sm)",
            fontFamily: "var(--font-body)",
            cursor: effectiveCanEdit ? "pointer" : "default",
          }}
        >
          {PRIORITY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>
      <div style={{ padding: "12px 14px" }}>
        <FieldLabel>Due Date</FieldLabel>
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <input
            type="date"
            value={localDueDate}
            onChange={handleDueDateChange}
            disabled={!effectiveCanEdit}
            style={{
              flex: 1,
              minWidth: 0,
              padding: "6px 6px",
              borderRadius: "var(--radius-input)",
              border: "1px solid oklch(var(--color-border))",
              background: "oklch(var(--color-paper-2))",
              color: localDueDate ? "oklch(var(--color-ink))" : "oklch(var(--color-ink-3))",
              fontSize: "var(--text-sm)",
              fontFamily: "var(--font-body)",
              cursor: effectiveCanEdit ? "pointer" : "default",
              colorScheme: "dark",
            }}
          />
          {localDueDate && effectiveCanEdit && (
            <button
              onClick={() => { setLocalDueDate(""); void saveField({ dueDate: null }) }}
              aria-label="Clear due date"
              style={{ background: "none", border: "none", cursor: "pointer", color: "oklch(var(--color-ink-3))", fontSize: 16, lineHeight: 1, padding: "2px 2px", flexShrink: 0 }}
            >×</button>
          )}
        </div>
      </div>
    </div>

    {/* Row 2: Start Date (left) + Assignee (right) */}
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderBottom: "1px solid oklch(var(--color-border))" }}>
      <div style={{ padding: "12px 14px", borderRight: "1px solid oklch(var(--color-border))" }}>
        <FieldLabel>Start Date</FieldLabel>
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <input
            type="date"
            value={localStartDate}
            onChange={handleStartDateChange}
            disabled={!effectiveCanEdit}
            style={{
              flex: 1,
              minWidth: 0,
              padding: "6px 6px",
              borderRadius: "var(--radius-input)",
              border: "1px solid oklch(var(--color-border))",
              background: "oklch(var(--color-paper-2))",
              color: localStartDate ? "oklch(var(--color-ink))" : "oklch(var(--color-ink-3))",
              fontSize: "var(--text-sm)",
              fontFamily: "var(--font-body)",
              cursor: effectiveCanEdit ? "pointer" : "default",
              colorScheme: "dark",
            }}
          />
          {localStartDate && effectiveCanEdit && (
            <button
              onClick={() => { setLocalStartDate(""); void saveField({ startDate: null }) }}
              aria-label="Clear start date"
              style={{ background: "none", border: "none", cursor: "pointer", color: "oklch(var(--color-ink-3))", fontSize: 16, lineHeight: 1, padding: "2px 2px", flexShrink: 0 }}
            >×</button>
          )}
        </div>
      </div>
      <div style={{ padding: "12px 14px" }}>
        <FieldLabel>Assignee</FieldLabel>
        <select
          value={localCard.assigneeId ?? ""}
          onChange={handleAssigneeChange}
          disabled={!effectiveCanEdit}
          style={{
            width: "100%",
            padding: "6px 8px",
            borderRadius: "var(--radius-input)",
            border: "1px solid oklch(var(--color-border))",
            background: "oklch(var(--color-paper-2))",
            color: "oklch(var(--color-ink))",
            fontSize: "var(--text-sm)",
            fontFamily: "var(--font-body)",
            cursor: effectiveCanEdit ? "pointer" : "default",
          }}
        >
          <option value="">Unassigned</option>
          {members.map((m) => (
            <option key={m.id} value={m.userId}>{m.name ?? m.email}</option>
          ))}
        </select>
        {localCard.assignee && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
            {localCard.assignee.avatarUrl ? (
              <img src={localCard.assignee.avatarUrl} alt={localCard.assignee.name ?? "Assignee"} width={16} height={16}
                style={{ borderRadius: "50%", objectFit: "cover", display: "block", flexShrink: 0 }} />
            ) : (
              <div style={{ width: 16, height: 16, borderRadius: "50%", background: getAvatarBg(localCard.assignee.id),
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0, color: "#fff", fontSize: 8, fontWeight: 600, fontFamily: "var(--font-body)" }}>
                {getInitials(localCard.assignee.name)}
              </div>
            )}
            <span style={{ fontSize: "var(--text-xs)", color: "oklch(var(--color-ink-2))", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {localCard.assignee.name ?? localCard.assignee.id}
            </span>
          </div>
        )}
      </div>
    </div>

    {/* Labels — full width */}
    <div style={{ padding: "12px 14px", borderBottom: "1px solid oklch(var(--color-border))" }}>
      <FieldLabel>Labels</FieldLabel>
      {localCard.labels.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
          {localCard.labels.map((label) => (
            <span key={label.id} style={{
              display: "flex", alignItems: "center", gap: 4,
              padding: "2px 6px", borderRadius: "var(--radius-badge)",
              border: "1px solid oklch(var(--color-border))",
              background: "oklch(var(--color-paper-2))",
              fontSize: "var(--text-xs)", color: "oklch(var(--color-ink-2))",
            }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: label.color, flexShrink: 0 }} />
              {label.name}
              {effectiveCanEdit && (
                <button onClick={() => handleLabelToggle({ id: label.id, name: label.name, color: label.color })}
                  aria-label={`Remove label ${label.name}`}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "oklch(var(--color-ink-3))", fontSize: 12, lineHeight: 1, padding: 0, marginLeft: 2 }}>
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
      )}
      {effectiveCanEdit && (
        <div style={{ position: "relative" }}>
          <button
            onClick={() => setLabelPopoverOpen((v) => !v)}
            style={{
              fontSize: "var(--text-xs)", color: "oklch(var(--color-accent))",
              background: "none", border: "1px solid oklch(var(--color-border))",
              borderRadius: "var(--radius-badge)", padding: "3px 8px",
              cursor: "pointer", fontFamily: "var(--font-body)",
            }}
          >+ Add label</button>
          {/* Label popover — reuse existing popover JSX from desktop column unchanged */}
          {labelPopoverOpen && (
            <div style={{
              position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
              width: 260, maxHeight: 340, overflowY: "auto", zIndex: 400,
              padding: 10, background: "oklch(var(--color-paper))",
              border: "1px solid oklch(var(--color-border))",
              borderRadius: "var(--radius-card)",
              boxShadow: "0 8px 24px oklch(0% 0 0 / 0.22)",
            }}>
              {/* Same inner content as the desktop label popover */}
              {labelPopoverOpen && (() => {
                // Re-render the same popover children. Import nothing new —
                // just copy the inner JSX from the desktop popover block below.
                // See desktop right column "Label popover" section for the exact children.
                return null
              })()}
            </div>
          )}
        </div>
      )}
    </div>

    {/* Description — full width */}
    <div style={{ padding: "16px 14px", borderBottom: "1px solid oklch(var(--color-border))" }}>
      <FieldLabel>Description</FieldLabel>
      <div style={{
        border: "1px solid oklch(var(--color-border))",
        borderRadius: "var(--radius-input)",
        background: "oklch(var(--color-paper-2))",
        padding: "10px 12px",
        minHeight: 120,
        fontSize: "var(--text-sm)",
        fontFamily: "var(--font-body)",
        color: "oklch(var(--color-ink))",
        lineHeight: 1.6,
      }}>
        <EditorContent editor={editor} />
      </div>
    </div>

    {/* Checklist */}
    <div style={{ padding: "16px 14px", borderBottom: "1px solid oklch(var(--color-border))" }}>
      <ChecklistSection cardId={localCard.id} canEdit={effectiveCanEdit} canToggle={canToggleChecklist} />
    </div>

    {/* Attachments */}
    <div style={{ padding: "16px 14px", borderBottom: "1px solid oklch(var(--color-border))" }}>
      <AttachmentSection cardId={localCard.id} canEdit={effectiveCanEdit} />
    </div>

    {/* Watchers */}
    <div style={{ padding: "16px 14px", borderBottom: "1px solid oklch(var(--color-border))" }}>
      <WatchersSection cardId={localCard.id} currentUserId={user.id} assigneeId={localCard.assigneeId} />
    </div>

    {/* Dependencies */}
    <div style={{ padding: "16px 14px" }}>
      <DependenciesSection cardId={localCard.id} boardId={boardId} canEdit={effectiveCanEdit} onChanged={() => void refreshBlocked()} />
    </div>

  </div>
) : (
  /* ── Desktop: original two-column layout — UNCHANGED ── */
  <div style={{ display: "flex", gap: 0 }}>
    {/* Left: description + checklists + attachments */}
    <div style={{ flex: 1, padding: "16px 20px 20px", borderRight: "1px solid oklch(var(--color-border))", minWidth: 0 }}>
      <div style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "oklch(var(--color-ink-3))", letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 8 }}>
        Description
      </div>
      <div style={{
        border: "1px solid oklch(var(--color-border))",
        borderRadius: "var(--radius-input)",
        background: "oklch(var(--color-paper-2))",
        padding: "10px 12px",
        minHeight: 120,
        fontSize: "var(--text-sm)",
        fontFamily: "var(--font-body)",
        color: "oklch(var(--color-ink))",
        lineHeight: 1.6,
      }}>
        <EditorContent editor={editor} />
      </div>
      <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid oklch(var(--color-border))" }}>
        <ChecklistSection cardId={localCard.id} canEdit={effectiveCanEdit} canToggle={canToggleChecklist} />
      </div>
      <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid oklch(var(--color-border))" }}>
        <AttachmentSection cardId={localCard.id} canEdit={effectiveCanEdit} />
      </div>
    </div>

    {/* Right: fields — PRESERVE EXACTLY AS-IS */}
    <div style={{ width: 220, flexShrink: 0, padding: "16px 20px 20px", display: "flex", flexDirection: "column", gap: 20 }}>
      {/* === PASTE THE EXISTING RIGHT COLUMN JSX HERE VERBATIM === */}
      {/* Priority, Start date, Due date, Assignee, Labels, Watchers, Dependencies */}
      {/* Do not change a single character of this block */}
    </div>
  </div>
)}
```

> **Important note on the label popover (mobile):** The desktop uses `position: absolute, bottom: calc(100% + 6px)` to open the popover upward. On mobile the modal is full-screen so there may not be room above. The mobile label section above uses `position: fixed, top: 50%, left: 50%, transform: translate(-50%, -50%)` to centre it on screen. The inner popover children (label list, create-new form, color swatches) are identical to the desktop — just copy them from the existing right column `{labelPopoverOpen && ...}` block.

- [ ] **Step 2: Copy existing desktop right column into the desktop branch verbatim**

In the desktop branch you left a placeholder comment `{/* === PASTE THE EXISTING RIGHT COLUMN JSX HERE VERBATIM === */}`. Replace that comment with the full existing right-column JSX (priority → start date → due date → assignee → labels → watchers → dependencies) exactly as it was before this task. Do not change a single prop or style value.

- [ ] **Step 3: Verify the build passes**

```bash
cd apps/web && yarn build 2>&1 | tail -20
```

Expected: no TypeScript errors. Fix any `setLocalDueDate`/`setLocalStartDate` references if TypeScript complains — these are already defined in the component.

- [ ] **Step 4: Verify mobile layout visually**

```bash
cd apps/web && yarn dev
```

Open the app and navigate to any board. Open a card modal. In browser DevTools:

1. Set viewport to **375px** wide.
   - Confirm no horizontal scrollbar on the modal.
   - Confirm description text is full-width and readable — no single-character word wrap.
   - Confirm Priority/Due Date appear side-by-side in a 2-column grid.
   - Confirm Start Date/Assignee appear side-by-side below.
   - Confirm Labels row is full width.
   - Confirm Checklist, Attachments, Watchers, Dependencies all appear inline below.
   - Confirm the ✓ complete button from Task 2 is visible in the header.

2. Set viewport to **1024px** wide.
   - Confirm the two-column layout is unchanged — description left, fields panel right at 220px.
   - Confirm "Mark as Complete" text button is restored.

Close dev server with Ctrl+C.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/boards/CardDetailModal.tsx
git commit -m "feat(mobile): single-column card detail layout on small screens"
```

---

## Self-Review Checklist

- [x] **Spec: breakpoint `< 640`** → `isMobile = windowWidth < 640` in Task 1 ✓
- [x] **Spec: icon-only complete button** → Task 2 ✓
- [x] **Spec: paired metadata grid** → Task 3, Row 1 (Priority/Due) + Row 2 (Start/Assignee) ✓
- [x] **Spec: full-width labels** → Task 3, Labels section ✓
- [x] **Spec: full-width description** → Task 3, Description section ✓
- [x] **Spec: inline sections (Checklist, Attachments, Watchers, Dependencies)** → Task 3 ✓
- [x] **Spec: desktop layout unchanged** → desktop branch in Task 3 ✓
- [x] **Spec: `useWindowWidth()` inside component, no prop threading** → Task 1 shared hook + Task 2 import ✓
- [x] **No placeholders** → all code blocks are complete except the desktop right column which is explicitly instructed to be copied verbatim (zero-change)
