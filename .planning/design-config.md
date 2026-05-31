# FlowGrid Design Config

> Read by Hallmark before generating any UI. This is the locked design brief for the project.

---

## Product

**Name:** FlowGrid
**Type:** B2B SaaS — Project Management
**Genre:** modern-minimal (Stripe / Linear / ElevenLabs school)
**Audience:** Startup teams and indie developers who live in their tools — they've used Jira, Notion, and Trello. They want speed, visual clarity, and keyboard-first power.
**Core action:** Organize and ship work faster as a team.
**Tone:** Technical-utilitarian with warmth. Dense but breathable. Not a toy, not enterprise bloat.

---

## Brand Personality

- Focused and fast — no decorative noise
- Trustworthy and calm under pressure (like a great kanban board itself)
- Slightly opinionated — opinions are features
- Human without being playful

---

## Color Direction

**Primary anchor:** Deep slate-blue — cool, authoritative, modern
**Accent:** Vivid electric blue or indigo — interactive affordances
**Surface:** Near-white with very subtle warm tint — not pure white
**Dark mode:** Near-black with blue tinting, not pure grey-on-black

OKLCH palette to be constructed by Hallmark at build time. No purple-on-white gradients. No generic gray-on-gray.

---

## Typography Direction

- **Display:** Geometric sans or condensed sans — Geist, Inter Display, DM Sans, or similar
- **Body:** Clean readable sans — Inter, Geist, or DM Sans
- **Mono:** Used for IDs, shortcuts, code blocks — Geist Mono or JetBrains Mono
- **NOT:** Serif display faces, decorative scripts, system-ui as primary

---

## Layout Principles

- **Dense but breathable** — more content per screen than marketing sites, but with clear visual hierarchy
- **Left-anchored navigation** — collapsible sidebar, always-visible on desktop
- **Keyboard-first affordances** — visible shortcut hints, slash commands, Cmd+K palette
- **Cards as the primary unit** — task cards, board cards — should feel tactile and clickable
- **Dark mode native** — both modes are first-class, not afterthoughts

---

## Anti-Patterns (DO NOT USE)

- Purple/violet gradient hero backgrounds
- Blob or wave section dividers
- "Unlock your potential"-style copy
- Centered everything with no grid logic
- Generic SaaS illustration style
- N1 (full-width nav bar) — use sidebar or N5/N6 instead
- Ft3 (4-column link footer) — not a marketing site
- Shadow-on-shadow depth stacking
- Rounded pill buttons everywhere (use radius tokens per context)

---

## Component Voice

- **Buttons:** Primary = filled solid, no gradient. Secondary = outlined or ghost. Destructive = red variant.
- **Cards:** Subtle shadow, 8px radius, hover lifts with `transform: translateY(-1px)` + shadow increase
- **Badges/Tags:** Small, compact, colored by label. Not pill-shaped by default.
- **Inputs:** Clean single-line border, focused with electric accent ring
- **Modals/Drawers:** Card detail opens as right-side drawer on desktop, bottom sheet on mobile
- **Drag handles:** Visible on hover only (don't clutter the UI)

---

## Hallmark Instructions

When invoking Hallmark for any FlowGrid screen:
1. Read this file first — genre is **modern-minimal**
2. Theme cluster: Quiet, Plume, Studio are closest — rotate among them
3. Macrostructure: **Workbench** for dashboard/app screens; **Bento Grid** for landing; **Long Document** for settings
4. Always emit `tokens.css` at `apps/web/src/styles/tokens.css`
5. Append to `.hallmark/log.json` at project root after each screen
6. Dark mode via Tailwind `class` strategy — tokens must have both `[data-theme=light]` and `[data-theme=dark]` variants
7. All interactive elements: 8-state (default, hover, focus, active, disabled, loading, error, success)
8. Motion: Framer Motion is in the stack — use sparingly. Animate transform + opacity only.
