# Screen Design: CardItem — Enriched Card Face

**Date**: 2026-06-01
**Status**: approved
**Critic**: design-critic agent
**Verdict**: PASSED (3 rounds)
**Designer**: Claude (main agent)
**Feature**: Card Face Redesign — compact kanban tile with metadata at-a-glance
**Spec**: `.planning/specs/card-face-redesign.md`
**Tokens**: `apps/web/src/styles/tokens.css` (OKLCH, Quiet theme, Workbench macrostructure)
**Design config**: `.planning/design-config.md` (modern-minimal, Geist, electric blue accent)

---

## 1. Component Overview

`CardItem` is a compact, draggable tile inside a 272px-wide list column. It is the primary unit of work on the kanban board — the thing a user's eye moves across dozens of times per session. Every visual choice optimizes for fast scanning without contributing noise.

**Principle**: Show only what exists. If a field is null, render nothing — not a placeholder, not a dash, not an empty row.

---

## 2. Card Anatomy

### 2.1 Structure

```
┌─ card container (256px effective width, 8px 10px padding) ────────┐
│                                                                     │
│  ●  Title text — may wrap to a second line if long enough          │
│     to require it                                                  │
│                                                                     │
│  [● Design] [● FE]  [+2]          ⚠ Jun 1  ●●                     │
│   └─ labels ──────┘ └─ overflow ┘  └─ date ┘ └─ avatar ─┘         │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

- **Row 1**: Priority dot (left, top-aligned) + Title (flex-1, 2-line clamp)
- **Row 2** (conditional): Label chips (left) + Due date chip + Assignee avatar (right)
- Row 2 is completely omitted when `assignee === null && dueDate === null && labels.length === 0`

### 2.2 Dimensions

| Property | Value |
|----------|-------|
| Width | Full-width of column padding box (~252px) |
| Min-height | Content-driven (≈ 40px minimal, ≈ 76px fully enriched) |
| Padding | 8px 10px |
| Border radius | `var(--radius-card)` = 8px |
| Border | `1px solid oklch(var(--color-border))` |
| Background | `oklch(var(--color-paper))` |
| Row gap | 6px (between row 1 and row 2) |
| Margin-bottom | 4px (between sibling cards) |

---

## 3. Row 1: Priority + Title

```
display: flex; align-items: flex-start; gap: 7px;
```

### 3.1 Priority Dot

| Priority | Color | Rendered |
|----------|-------|---------|
| NONE | — | Not rendered (no gap, no space) |
| LOW | `oklch(0.62 0.17 237)` | ● blue |
| MEDIUM | `oklch(0.77 0.15 85)` | ● yellow |
| HIGH | `oklch(0.67 0.19 48)` | ● orange |
| URGENT | `oklch(0.59 0.22 27)` | ● red |

```
width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
margin-top: 4px;  /* vertically aligns to first text baseline */
```

When priority is NONE: dot element is not rendered. Title then occupies full row width with no left offset.

### 3.2 Title

```
font-family: var(--font-body);
font-size: var(--text-sm);        /* 0.875rem */
font-weight: 500;
color: oklch(var(--color-ink));
line-height: 1.4;
flex: 1;
overflow: hidden;
display: -webkit-box;
-webkit-line-clamp: 2;
-webkit-box-orient: vertical;
word-break: break-word;
```

- `title` attribute set to the full card title string (native browser tooltip on hover)
- No JavaScript truncation — CSS handles it
- Font weight 500 (not 600) — headings elsewhere use 600+, title needs slightly less hierarchy

---

## 4. Row 2: Metadata Strip

```
display: flex; align-items: center; gap: 6px; margin-top: 6px;
```

Omit entirely when no metadata exists. Never render an empty row.

### 4.1 Label Chips (left side, flex: 1)

```
display: flex; align-items: center; gap: 4px;
flex: 1; overflow: hidden; flex-wrap: nowrap;
```

- **Rule**: Show all labels up to 3. The overflow chip (+N) only appears when 4 or more labels are assigned. When exactly 3 labels exist, all 3 are shown with no overflow chip.
  - 1 label → show 1
  - 2 labels → show 2
  - 3 labels → show all 3 (no +N)
  - 4+ labels → show first 2 + "+N" chip (e.g. "+2" for 4 labels)
- If 0 labels, this section is omitted from the flex container (no empty space)

**Label chip:**
```
display: flex; align-items: center; gap: 3px;
padding: 1px 5px;
border-radius: var(--radius-badge);
border: 1px solid oklch(var(--color-border));
background: oklch(var(--color-paper-2));
max-width: 80px;
overflow: hidden;
```

Inside each chip:
- Colored dot: `width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; background: {label.color}`
- Label name: `font-size: var(--text-xs); color: oklch(var(--color-ink-2)); white-space: nowrap; overflow: hidden; text-overflow: ellipsis`

**Overflow chip ("+N"):**
```
font-size: var(--text-xs);
color: oklch(var(--color-ink-3));
padding: 1px 4px;
border-radius: var(--radius-badge);
border: 1px solid oklch(var(--color-border));
white-space: nowrap;
flex-shrink: 0;
```

Examples:
- 1 label → `[● Design]`
- 3 labels → `[● Design] [● FE] [● Bug]`
- 5 labels → `[● Design] [● FE] [+3]`

### 4.2 Due Date Chip (right side, before avatar)

```
display: flex; align-items: center; gap: 3px;
font-family: var(--font-body);
font-size: var(--text-xs);
white-space: nowrap;
flex-shrink: 0;
margin-left: auto;   /* push right when no labels exist */
```

Omit entire element when `dueDate === null`.

**Color logic (computed at render time):**

```
const now = new Date()
const due = new Date(card.dueDate)
const hoursUntilDue = (due - now) / 36e5

if (due < now):
  color = oklch(var(--color-error))   // red
  prefix = ⚠                          // warning icon

else if hoursUntilDue <= 48:
  color = oklch(var(--color-warning)) // amber — uses --color-warning token (72%/78% 0.18/0.16 hue 70)

else:
  color = oklch(var(--color-ink-3))   // muted
  prefix = none
```

**Date format:** `"Jun 3"` — short month name + day, no year (unless year !== current year → `"Jun 3, 2027"`).

Use `<time dateTime={card.dueDate}>Jun 3</time>` for semantic HTML.

Warning icon (overdue only): 10px SVG triangle-warning, same color as text — never color-only for overdue state.

### 4.3 Assignee Avatar (far right)

```
width: 20px; height: 20px;
border-radius: 50%;
flex-shrink: 0;
overflow: hidden;
```

Omit when `card.assignee === null`.

**With avatarUrl:**
```jsx
<img
  src={assignee.avatarUrl}
  alt={assignee.name ?? "Assignee"}
  width={20} height={20}
  style={{ borderRadius: '50%', objectFit: 'cover', display: 'block' }}
/>
```

**Without avatarUrl (initials fallback):**
- Extract initials: first character of first word + first character of last word of name. If name is one word, use first two characters. If no name, use "?"
- Background hue: `Math.abs(hashCode(assignee.id)) % 360` mapped to `hsl(hue, 55%, 48%)` — deterministic, 48% lightness keeps white text above 4.5:1 contrast across all hues including yellow
- Text: white, `font-size: 9px; font-weight: 600; letter-spacing: 0.5px`
- `aria-label={assignee.name ?? "Assigned user"}`

```
background: hsl({hash(assignee.id) % 360}, 55%, 48%);
display: flex; align-items: center; justify-content: center;
color: #fff;
font-size: 9px; font-weight: 600; font-family: var(--font-body);
```

hashCode function (Java polynomial hash — multiplier 31, same as Java String.hashCode):
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

## 5. States

### 5.1 Default
As designed. `cursor: grab`.

### 5.2 Hover (non-dragging)
```
border-color: oklch(var(--color-accent-muted));  /* subtle blue-tint */
transform: translateY(-1px);
box-shadow: 0 2px 8px oklch(0% 0 0 / 0.08);
transition: border-color var(--dur-fast) var(--ease-out),
            transform var(--dur-fast) var(--ease-out),
            box-shadow var(--dur-fast) var(--ease-out);
```
Per design-config Component Voice: "Cards: hover lifts with `transform: translateY(-1px)` + shadow increase." Applied here even though the card is not yet clickable — the lift signals interactivity (draggability) and aligns with the stated design system rule. `prefers-reduced-motion`: transitions suppressed, no transform applied.

### 5.3 isDragging (in-place ghost)
```
opacity: 0.35;
cursor: grabbing;
```
The ghost stays in place at reduced opacity. dnd-kit handles transform.

### 5.4 DragOverlay (floating clone)
```
box-shadow: 0 8px 24px oklch(0% 0 0 / 0.16);
cursor: grabbing;
```
`overlay` prop = true → no transform applied, no useSortable ref. Shadow elevates the card above the board surface.

### 5.5 Long Title (>200 chars)
CSS handles via `-webkit-line-clamp: 2`. Full title available via native `title` attribute (browser tooltip). No JS intervention.

---

## 6. Visual Variants (All States)

### Variant A: Title-only card
Card with title and NONE priority, no metadata.
```
┌──────────────────────────────────────────┐
│  Prepare weekly standup notes            │
└──────────────────────────────────────────┘
```
- Single row only. No dot (NONE priority). No row 2. Minimum height ~40px.

### Variant B: Priority + title, no metadata
Card with URGENT priority, no assignee/labels/date.
```
┌──────────────────────────────────────────┐
│ ● Fix production login crash             │
└──────────────────────────────────────────┘
```
- Red dot. One row. No row 2.

### Variant C: Due date only (amber)
Card due in 36 hours, no labels, no assignee.
```
┌──────────────────────────────────────────┐
│ ● Send invoice to Acme Corp              │
│                                Jun 2 →   │
└──────────────────────────────────────────┘
```
- Amber due date chip, right-aligned (pushed right via `margin-left: auto`).

### Variant D: Fully enriched, overdue
Card with all fields, due date in the past.
```
┌──────────────────────────────────────────┐
│ ● Design dashboard wireframes for Q3     │
│   sprint review                          │
│                                          │
│ [● Design] [● FE] [+1]    ⚠ Jun 1  ●●   │
└──────────────────────────────────────────┘
```
- MEDIUM priority (yellow dot). 2-line title. 2 label chips + "+1" overflow. ⚠ red due date. Initials avatar (●●).

### Variant E: Assignee with real avatar, no labels
```
┌──────────────────────────────────────────┐
│ ● Write API documentation                │
│                          Jun 15    [img] │
└──────────────────────────────────────────┘
```
- LOW priority (blue dot). Normal date (muted ink). Real avatar image.

### Variant F: DragOverlay clone
Same as Variant D but with elevated shadow, cursor: grabbing, no opacity reduction.

---

## 7. Motion Plan

| Element | Property | Trigger | Duration | Easing |
|---------|----------|---------|----------|--------|
| Hover border | `border-color` | Mouse enter | `var(--dur-fast)` = 100ms | `var(--ease-out)` |
| Drag transform | `transform` | dnd-kit | — | dnd-kit default |
| DragOverlay appear | implicit | dragstart | — | dnd-kit default |

`prefers-reduced-motion`: `border-color` transition suppressed. Drag always functional.

---

## 8. Accessibility

- **Card wrapper**: `role="article"` + `aria-label="{title} — {priority} priority"` (e.g. `"Fix login crash — urgent priority"`). Gives screen readers structural context and a complete announcement without forcing traversal of every nested element. NONE priority → omit the priority suffix.
- `title` attribute on card wrapper → full title on hover (browser native, free)
- `<time dateTime={card.dueDate}>` for semantic due date
- Avatar `<img alt={name}>` or `aria-label={name}` on initials fallback div
- Overdue state: ⚠ SVG icon (10px, same color as text) + red color — not color alone
- dnd-kit provides `aria-roledescription="sortable"` and keyboard drag via Enter/Space automatically
- Focus ring: dnd-kit applies focus to the drag handle element; do not suppress outline

---

## 9. Dark Mode

The token file (`tokens.css`) has full `[data-theme="dark"]` values. All CSS custom property references in this design (`--color-paper`, `--color-border`, `--color-ink`, `--color-ink-2`, `--color-ink-3`, `--color-error`, `--color-warning`, `--color-accent-muted`) resolve automatically to dark-mode values when `data-theme="dark"` is set on the root. No additional dark-mode branches needed in the component.

**Dark mode specifics:**

| Element | Light token value | Dark token value | Concern |
|---------|------------------|-----------------|---------|
| Card background | `97.5% 0.003 240` (near-white) | `14% 0.012 250` (near-black) | ✅ Custom prop resolves automatically |
| Card border | `88% 0.006 240` | `28% 0.015 250` | ✅ Visible against dark paper |
| Title | `18% 0.012 250` | `95% 0.005 240` | ✅ High contrast on dark |
| Metadata text | `62% 0.010 250` | `52% 0.012 245` | ✅ Adequate for secondary info |
| Error (overdue) | `55% 0.25 25` | `65% 0.22 25` | ✅ Both pass 4.5:1 on their respective paper values |
| Warning (48h) | `72% 0.18 70` | `78% 0.16 70` | ✅ Amber is lighter in dark mode — intentional |

**Assignee initials fallback (not token-relative):**
The `hsl(hue, 55%, 48%)` background for initials is a fixed lightness value. White text (`#fff`) at 48% HSL lightness passes 4.5:1 contrast across all hues including the yellow-range (hue 50–80°) where higher lightness values would fail. Use 48% rather than 52% — the extra 4 points of darkness resolves the yellow-hue edge case without a conditional check. In dark mode, a mid-lightness colored circle on near-black paper (`oklch(14%)`) will appear well-separated and visible.

---

## 10. Responsive

CardItem lives inside a 272px fixed-width column. The board scrolls horizontally; the card itself has no responsive breakpoints. The 272px column width was chosen to comfortably hold 2 label chips + date + avatar without overflow. No responsive changes to the component.

---

## 11. Implementation Map

| What | Where | Note |
|------|-------|------|
| Enrich `GET /api/cards` | `apps/api/src/routes/cards.ts` | Prisma include for assignee + labels |
| Extend `CardSummary` | `apps/web/src/api/cards.ts` | Add `assignee`, `labels` fields |
| Redesign `CardItem` | `apps/web/src/components/boards/CardItem.tsx` | Full rewrite of render logic |
| `hashCode` helper | Inline in `CardItem.tsx` | Java polynomial hash (not djb2 — naming corrected), 5 lines |
| No other files | — | `BoardPage`, `ListColumn`, `CreateCardInline` unchanged |

---

## 12. Self-Check (Pre-Critic)

- [x] Colors from `tokens.css` only — no Tailwind defaults, no hardcoded hex (priority dot colors are explicit OKLCH as per existing pattern in Feature #9)
- [x] No Tailwind class names in JSX — all inline styles with CSS custom properties
- [x] Not AI-generic: no purple gradients, no centered-everything, no identical-looking blocks
- [x] Clear visual hierarchy: title (weight 500, --text-sm) > metadata (weight 400, --text-xs)
- [x] Accent color used sparingly — only for hover border-color, not splashed everywhere
- [x] Hover lift `translateY(-1px)` + shadow per design-config Component Voice rule
- [x] All states designed: default, hover, dragging ghost, drag overlay, long title, overdue, due-soon, no-metadata
- [x] Responsive: N/A for this component (fixed 272px column context)
- [x] Accessibility: `role="article"` + `aria-label`, color-not-alone on overdue (SVG icon + color), title tooltip, semantic `<time>`, aria-label on avatar
- [x] Dark mode: all CSS custom props resolve from `[data-theme="dark"]` tokens; initials avatar lightness capped at 48% for yellow-hue contrast safety
- [x] Token compliance: `--color-warning` used for amber date (not hardcoded OKLCH), `--radius-card` for card container, `--radius-badge` for chips only
- [x] Label count rule clarified: 3 labels → show all 3; 4+ labels → show first 2 + "+N"
- [x] Absence = silence: null fields produce zero DOM output, no placeholders
- [x] Design personality match: dense but breathable, technical-utilitarian, not toy-like
- [x] No shadow-on-shadow: default card has border only (no shadow), overlay clone gets shadow only
