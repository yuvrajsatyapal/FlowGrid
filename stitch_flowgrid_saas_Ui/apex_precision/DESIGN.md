---
name: Apex Precision
colors:
  surface: '#131313'
  surface-dim: '#131313'
  surface-bright: '#3a3939'
  surface-container-lowest: '#0e0e0e'
  surface-container-low: '#1c1b1b'
  surface-container: '#201f1f'
  surface-container-high: '#2a2a2a'
  surface-container-highest: '#353534'
  on-surface: '#e5e2e1'
  on-surface-variant: '#c2c6d8'
  inverse-surface: '#e5e2e1'
  inverse-on-surface: '#313030'
  outline: '#8c90a1'
  outline-variant: '#424656'
  surface-tint: '#b3c5ff'
  primary: '#b3c5ff'
  on-primary: '#002b75'
  primary-container: '#0066ff'
  on-primary-container: '#f8f7ff'
  inverse-primary: '#0054d6'
  secondary: '#c8c6c5'
  on-secondary: '#313030'
  secondary-container: '#4a4949'
  on-secondary-container: '#bab8b7'
  tertiary: '#ffb59d'
  on-tertiary: '#5d1900'
  tertiary-container: '#cc4204'
  on-tertiary-container: '#fff6f4'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#dae1ff'
  primary-fixed-dim: '#b3c5ff'
  on-primary-fixed: '#001849'
  on-primary-fixed-variant: '#003fa4'
  secondary-fixed: '#e5e2e1'
  secondary-fixed-dim: '#c8c6c5'
  on-secondary-fixed: '#1c1b1b'
  on-secondary-fixed-variant: '#474646'
  tertiary-fixed: '#ffdbd0'
  tertiary-fixed-dim: '#ffb59d'
  on-tertiary-fixed: '#390c00'
  on-tertiary-fixed-variant: '#832600'
  background: '#131313'
  on-background: '#e5e2e1'
  surface-variant: '#353534'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  title-md:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '500'
    lineHeight: 24px
  body-base:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-sm:
    fontFamily: Geist
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.02em
  mono-code:
    fontFamily: Geist
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 4px
  container-margin: 24px
  gutter: 16px
  card-padding: 20px
  stack-sm: 8px
  stack-md: 16px
  stack-lg: 32px
---

## Brand & Style

This design system is engineered for elite productivity, merging the surgical precision of developer tools with a premium, high-fidelity aesthetic. It is designed for users who value speed, keyboard-first navigation, and visual clarity.

The aesthetic direction is **Modern Glassmorphism**. It utilizes deep, ink-like blacks and charcoal surfaces to reduce eye strain, accented by "Electric Blue" highlights that signify action and focus. Visual hierarchy is established through translucency and 1px "ghost" borders rather than traditional heavy shadows. The interface should feel like a sophisticated cockpit: fast, responsive, and ultra-reliable.

Key principles:
- **Clarity over Decoration:** Every element has a functional purpose.
- **Dimensionality:** Layers use subtle backdrop blurs (20px+) to maintain context.
- **Frictionless Action:** Interactive elements use high-contrast blue to guide the eye instantly.

## Colors

The palette is strictly dark-mode, optimized for OLED displays and professional environments.

- **Background (Base):** #0a0a0a. Used for the primary application canvas.
- **Surface (Elevated):** #121212. Used for cards, sidebars, and floating panels.
- **Primary (Action):** #0066ff. Reserved for primary buttons, active states, and critical indicators.
- **Borders:** All borders use white at very low opacity (6% to 12%) to create a "glass" edge without adding visual weight.
- **Accents:** Use #0066ff with 15% opacity for soft "glow" effects behind active elements to simulate depth.

## Typography

The system utilizes **Inter** for its neutral, highly legible character across all UI scales. For technical labels and monospaced data, **Geist** is used to provide a modern, developer-centric feel.

- **Headlines:** Use tighter letter spacing (-0.01em to -0.02em) to create a compact, authoritative look.
- **Body:** Set at 14px for high density. The line height is kept at 1.4x-1.5x to ensure readability in data-heavy views.
- **Labels:** Uppercase labels should only be used for small metadata tags or table headers, paired with the `label-sm` style.
- **Colors:** Primary text is 90% white (#e5e5e5). Secondary text is 50% white (#888888).

## Layout & Spacing

This design system follows a **Fixed-Fluid Hybrid** model. The sidebar remains at a fixed 240px, while the main content area utilizes a 12-column fluid grid.

- **Rhythm:** All spacing is based on a 4px baseline unit. 
- **Margins:** 24px outer margins for desktop, scaling down to 16px for mobile.
- **Grid:** Use a 12-column grid for dashboards. For detail views (e.g., a task view), use a centered 8-column layout (max-width 1200px).
- **Density:** Elements are spaced generously but with clear grouping. Related items (buttons in a group) use `stack-sm`, while sections use `stack-lg`.

## Elevation & Depth

Depth is communicated through **Tonal Stacking** and **Translucency** rather than shadows. 

1. **Level 0 (Canvas):** #0a0a0a. The furthest layer.
2. **Level 1 (Cards/Sidebar):** #121212 with a 1px border of `border_subtle`.
3. **Level 2 (Popovers/Modals):** #1a1a1a with 80% opacity and 24px backdrop blur. This level uses a 1px border of `border_prominent`.
4. **Active State:** Elements that are focused or active receive an inner glow or a subtle outer bloom using the primary color at low opacity.

Shadows are rarely used, but when necessary, they are ultra-diffused: `0 20px 40px rgba(0,0,0,0.4)`.

## Shapes

The design uses a consistent "Rounded" profile to soften the technical nature of the dark theme.

- **Standard Elements (Buttons, Inputs):** 8px (0.5rem).
- **Container Elements (Cards, Modals):** 16px (1rem). 
- **Large Layout Blocks (Sidebars, Main Canvas):** Use `rounded-xl` (24px) for the main inner content container if it sits within a margin.
- **Interactive States:** On hover, clickable items should maintain their border radius but may transition to a slightly more pronounced border color.

## Components

### Buttons
- **Primary:** Background #0066ff, Text #ffffff. No shadow, 1px top-edge highlight.
- **Secondary:** Background #ffffff08, Border #ffffff10, Text #e5e5e5. On hover, background becomes #ffffff12.
- **Ghost:** No background or border. Text #888888. On hover, background #ffffff08.

### Input Fields
- **Default:** Background #ffffff05, Border #ffffff10, Text #e5e5e5.
- **Focus:** Border #0066ff, Inner Glow 2px #0066ff20.
- **Placeholder:** Text #555555.

### Cards
- **Style:** Background #121212, Border 1px #ffffff08, Padding 20px. 
- **Glass variant:** For overlays, use backdrop-filter: blur(20px) and 70% opacity on the background.

### Chips & Tags
- **Style:** Small, height 24px. Background #ffffff08, Border #ffffff10. Font: Geist (label-sm).

### Sidebar Items
- **Inactive:** Text #888888, transparent background.
- **Active:** Text #ffffff, Background #ffffff08, 2px vertical blue line on the left or right edge to indicate focus.

### Additional Components
- **Command Menu:** A centered modal (K-Bar style) with 32px backdrop blur and high-contrast typography for search results.
- **Status Blips:** Small 8px circles using primary color for "Live" or "Active" indicators, featuring a subtle breathing animation.