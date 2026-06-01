# Spec: Card Face — Compact Kanban Board Tile

**Created**: 2026-06-01
**Status**: final
**Author**: team
**Epic**: FlowGrid SaaS (#10a)
**Implementation**: `apps/web/src/components/boards/CardItem.tsx` — merged to `main`

---

## Purpose

This document is the **authoritative reference** for what the FlowGrid kanban card tile shows, how it handles every data state, and what it intentionally does not show. It supersedes the earlier implementation spec (`card-face-redesign.md`). Any future changes to the card tile must be evaluated against the constraints and rules here.

---

## Constraints

| Constraint | Rule |
|------------|------|
| Design system | Hallmark — OKLCH tokens, Quiet theme, Workbench macrostructure |
| Styling | CSS custom properties only — no Tailwind class names in JSX |
| Density | Must support 50+ cards per board without visual fatigue |
| Scanability | A user must identify owner, urgency, and label category in < 1 second |
| Compactness | Card must remain draggable; height must not inflate to the point it disrupts dense boards |
| Data | Rendered from enriched API response only — no new backend features, no extra fetches |

---

## Available Data

Per card, the API returns:

| Field | Type | Notes |
|-------|------|-------|
| `title` | `string` | Always present |
| `priority` | `"NONE" \| "LOW" \| "MEDIUM" \| "HIGH" \| "URGENT"` | Always present |
| `dueDate` | `string \| null` | ISO 8601 UTC |
| `assignee` | `{ id, name, avatarUrl } \| null` | Null if unassigned |
| `labels` | `Array<{ id, name, color }>` | Empty array if none |

Fields like `description`, `coverColor`, `createdAt`, `updatedAt`, `deletedAt`, `listId` are available but **not rendered on the tile**.

---

## Layout Hierarchy

```
┌─ card tile (full column width, 8px 10px padding, 8px radius) ────┐
│                                                                    │
│  ●  Title text that may wrap to a second                          │  ← Row 1 (always)
│     line when long enough                                         │
│                                                                    │
│  [● Design] [● FE]  [+2]         ⚠ Jun 1  ○○                     │  ← Row 2 (conditional)
│   └── labels ──────┘ └─ overflow ┘  └─ date ┘ └─ avatar ─┘       │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

### Row 1 — Always rendered

`[priority dot]  [title]`

- Priority dot: 8×8px circle, flush left, top-aligned to first text baseline (`margin-top: 4px`)
- Title: `flex: 1`, font weight 500, `var(--text-sm)`, 2-line CSS clamp

### Row 2 — Conditional

Rendered only when at least one of: `assignee !== null`, `dueDate !== null`, `labels.length > 0`.

Layout within Row 2: `display: flex; align-items: center; gap: 6px`

- **Left zone** (`flex: 1`): label chips
- **Middle-right**: due date chip (pushed right via `margin-left: auto` when no labels)
- **Far right**: assignee avatar

When all three are absent: row 2 is not rendered. The card is title + dot only.

---

## Visual Priority Rules

What a user's eye hits first, in order:

1. **Priority dot** — leftmost, appears before the first word. URGENT (red) and HIGH (orange) fire preattentive color recognition before any text is read.
2. **Title** — the primary information unit. Weight 500 differentiates it from metadata without going full bold.
3. **Due date chip** — urgency signaling. Red + ⚠ icon for overdue; amber for imminent. Placed right so the eye exits the title and lands on urgency next.
4. **Assignee avatar** — ownership at a glance. Far-right, small (20px), never distracting.
5. **Label chips** — category/context. Left-aligned metadata, secondary to urgency signals.

---

## Rules: Long Titles

| Scenario | Behavior |
|----------|----------|
| Title fits in 1 line | Single line, no clamp applied |
| Title wraps to 2 lines | Full 2 lines shown, no truncation |
| Title would wrap to 3+ lines | Hard clamp at 2 lines via `-webkit-line-clamp: 2`; full title visible on `title` attribute (native browser tooltip) |
| Title > 200 characters | Same as above — CSS handles it, no JS intervention |

No "..." suffix is added manually; the browser ellipsis from `-webkit-line-clamp` handles it.

---

## Rules: Missing Fields

**Principle: absence = silence.** No placeholder text, no dashes, no empty rows, no zero-value indicators.

| Missing field | Behavior |
|---------------|----------|
| No priority (NONE) | Dot is not rendered. Title uses full row width with no left offset. |
| No due date | Due date chip is not rendered. Avatar shifts left if present. |
| No assignee | Avatar is not rendered. |
| No labels | Label zone is not rendered. If only due date and/or avatar exist, Row 2 still appears for those. |
| None of the above | Row 2 is entirely omitted. Card is title + optional dot only. |

---

## Rules: Due Date States

Computed at render time from `new Date(card.dueDate)` vs `new Date()`:

| State | Condition | Color | Icon | Example |
|-------|-----------|-------|------|---------|
| Overdue | `dueDate < now` | `oklch(var(--color-error))` — red | ⚠ SVG (10px, same color) | `⚠ Jun 1` |
| Due soon | `0 < hoursUntilDue ≤ 48` | `oklch(var(--color-warning))` — amber | none | `Jun 2` |
| Future | `hoursUntilDue > 48` | `oklch(var(--color-ink-3))` — muted | none | `Jun 15` |

**Accessibility note:** overdue state uses both color AND the ⚠ icon — color is never the sole indicator.

**Date format:** `"Jun 3"` (short month + day, no year unless year ≠ current year → `"Jun 3, 2027"`). Rendered as `<time dateTime={card.dueDate}>`.

---

## Rules: Label Overflow

| Label count | Rendered |
|-------------|----------|
| 0 | Nothing (label zone omitted) |
| 1 | `[● Design]` |
| 2 | `[● Design] [● FE]` |
| 3 | `[● Design] [● FE] [● Bug]` — all three, no overflow chip |
| 4 | `[● Design] [● FE] [+2]` |
| 5 | `[● Design] [● FE] [+3]` |
| N ≥ 4 | First 2 labels + `+{N-2}` overflow chip |

Chips use `max-width: 80px` with text-overflow ellipsis on the label name. Overflow chip is `+N` in `var(--color-ink-3)`.

---

## Rules: Missing Avatar Fallback

When `assignee.avatarUrl` is null or absent:

- **Background**: `hsl(Math.abs(hashCode(assignee.id)) % 360, 55%, 48%)` — deterministic hue derived from the user's ID
- **Text**: initials in white (`#fff`), 9px, weight 600
- **Initials logic**:
  - Multi-word name: first char of first word + first char of last word → `"YS"` for `"Yuvraj Satyapal"`
  - Single word: first two chars → `"YU"` for `"Yuvraj"`
  - No name: `"?"`
- **Lightness 48%** (not higher): ensures white text passes 4.5:1 contrast across all hues including yellow (hue 50–80°)

`hashCode` implementation (Java polynomial, multiplier 31):
```ts
function hashCode(str: string): number {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0
  }
  return h
}
```

---

## Priority Color Reference

| Priority | Color value | Visible |
|----------|-------------|---------|
| NONE | — | Not rendered |
| LOW | `oklch(0.62 0.17 237)` | Blue dot |
| MEDIUM | `oklch(0.77 0.15 85)` | Yellow dot |
| HIGH | `oklch(0.67 0.19 48)` | Orange dot |
| URGENT | `oklch(0.59 0.22 27)` | Red dot |

These are explicit OKLCH values (not token-mapped) because the priority dot is the one element that must be consistent across both light and dark themes without token variance.

---

## Intentionally Not Shown

The following data exists in the schema or enriched API response but is **deliberately excluded** from the card tile to maintain density and focus:

| Excluded | Reason |
|----------|--------|
| Description | Even a preview adds height and cognitive noise across 50+ cards |
| Comment count | Not yet in enriched API; will be shown only when feature #11 lands |
| Attachment count | Same as above |
| Cover image / cover color | `coverColor` exists in schema; not surfaced on tile until it can be consistently applied |
| Checklist progress | Not in schema yet |
| Dependency / blocked status | Not in schema |
| `createdAt` / `updatedAt` | Too granular for board scanning |
| Card ID | Internal — not user-facing on this surface |
| List name | User is already looking at the list column |

---

## States

| State | Visual |
|-------|--------|
| Default | Border `1px solid oklch(var(--color-border))`, background `oklch(var(--color-paper))` |
| Hover | `translateY(-1px)` + `box-shadow: 0 2px 8px oklch(0% 0 0 / 0.08)` + border → `oklch(var(--color-accent-muted))`. Suppressed under `prefers-reduced-motion`. |
| Dragging ghost | `opacity: 0.35` |
| DragOverlay clone | `box-shadow: 0 8px 24px oklch(0% 0 0 / 0.16)`, `cursor: grabbing`, no opacity reduction |

---

## Accessibility

- Card wrapper: `role="article"` + `aria-label="{title} — {priority} priority"` (NONE priority omits the suffix)
- `title` attribute on wrapper → full title tooltip on hover
- `<time dateTime={card.dueDate}>` for semantic due date
- Assignee `<img alt={name}>` or `aria-label={name}` on initials fallback
- Overdue uses ⚠ SVG icon + red color — not color alone
- dnd-kit provides `aria-roledescription="sortable"` and keyboard drag via Enter/Space

---

## What Triggers Row 2

```
hasMetadata = assignee !== null || dueDate !== null || labels.length > 0
```

Row 2 renders iff `hasMetadata === true`. Each sub-element within Row 2 renders only if its own data exists.

---

## Dimensions

| Property | Value |
|----------|-------|
| Width | Full column padding box (~252px effective) |
| Min height | ~40px (title-only card) |
| Max height | ~76px (2-line title + full metadata row) |
| Padding | 8px 10px |
| Border radius | `var(--radius-card)` = 8px |
| Row gap | 6px (between Row 1 and Row 2) |
| Card margin-bottom | 4px |
| Priority dot | 8×8px |
| Avatar | 20×20px |
| Label chip dot | 6×6px |

---

## Edge Cases

| Case | Behavior |
|------|----------|
| Title ≥ 200 chars | 2-line clamp, `title` attr shows full text on hover |
| All metadata absent | Row 2 not rendered; card is title-only (~40px) |
| Due date exactly now | Treated as overdue (`due < now` check) |
| Due date 48h from now | Amber — boundary is inclusive (`hoursUntilDue ≤ 48`) |
| 4+ labels | First 2 + "+N" chip |
| `label.color` missing | Fallback to `oklch(var(--color-ink-3))` |
| Assignee name is null | Avatar shows "?" initials |
| `avatarUrl` is present but fails to load | Browser shows broken image; no JS fallback needed at this tier |
| Card being dragged | Ghost at 0.35 opacity, full DOM preserved |
| DragOverlay clone | `overlay=true` prop disables refs/listeners, applies elevated shadow |

---

## Dependencies

- Feature #9 — Cards CRUD + DnD: **done**
- Feature #10a — Card Face Redesign (enriched API + implementation): **done** (merged to `main`)
- `Label` and `CardLabel` models in schema: **exist**
- Hallmark tokens (`--color-error`, `--color-warning`, `--color-ink-3`, `--color-accent-muted`, `--radius-card`, `--radius-badge`, `--text-sm`, `--text-xs`): **wired**
- `GET /api/cards` enriched response (assignee + labels): **live**

---

## Changelog

| Date | Change |
|------|--------|
| 2026-06-01 | Initial implementation spec (`card-face-redesign.md`) |
| 2026-06-01 | Implementation merged to `main` (Feature #10a) |
| 2026-06-01 | This document written as the authoritative final reference |
