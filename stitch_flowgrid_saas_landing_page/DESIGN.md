---
name: Editorial Precision
colors:
  surface: '#fcf9f8'
  surface-dim: '#dcd9d9'
  surface-bright: '#fcf9f8'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f6f3f2'
  surface-container: '#f0edec'
  surface-container-high: '#ebe7e7'
  surface-container-highest: '#e5e2e1'
  on-surface: '#1c1b1b'
  on-surface-variant: '#59413c'
  inverse-surface: '#313030'
  inverse-on-surface: '#f3f0ef'
  outline: '#8c716a'
  outline-variant: '#e0bfb8'
  surface-tint: '#ab3418'
  primary: '#a83216'
  on-primary: '#ffffff'
  primary-container: '#ca4a2c'
  on-primary-container: '#fffbff'
  inverse-primary: '#ffb4a3'
  secondary: '#25695b'
  on-secondary: '#ffffff'
  secondary-container: '#adf0de'
  on-secondary-container: '#2c6f61'
  tertiary: '#695858'
  on-tertiary: '#ffffff'
  tertiary-container: '#837070'
  on-tertiary-container: '#fffbff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdad2'
  primary-fixed-dim: '#ffb4a3'
  on-primary-fixed: '#3d0700'
  on-primary-fixed-variant: '#8a1c01'
  secondary-fixed: '#adf0de'
  secondary-fixed-dim: '#91d3c2'
  on-secondary-fixed: '#00201a'
  on-secondary-fixed-variant: '#005144'
  tertiary-fixed: '#f5dddd'
  tertiary-fixed-dim: '#d8c1c1'
  on-tertiary-fixed: '#251819'
  on-tertiary-fixed-variant: '#534343'
  background: '#fcf9f8'
  on-background: '#1c1b1b'
  surface-variant: '#e5e2e1'
  background-warm: '#F5F0EB'
  surface-dark: '#111111'
  text-on-dark: '#FFFFFF'
typography:
  display-lg:
    fontFamily: Anton
    fontSize: 84px
    fontWeight: '400'
    lineHeight: 90px
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Anton
    fontSize: 48px
    fontWeight: '400'
    lineHeight: 52px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Anton
    fontSize: 42px
    fontWeight: '400'
    lineHeight: 48px
    letterSpacing: 0em
  headline-sm:
    fontFamily: Anton
    fontSize: 24px
    fontWeight: '400'
    lineHeight: 32px
    letterSpacing: 0.02em
  section-label:
    fontFamily: Hanken Grotesk
    fontSize: 12px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.15em
  body-lg:
    fontFamily: Hanken Grotesk
    fontSize: 20px
    fontWeight: '400'
    lineHeight: 32px
  body-md:
    fontFamily: Hanken Grotesk
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-bold:
    fontFamily: Hanken Grotesk
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  margin-desktop: 64px
  margin-mobile: 24px
  gutter: 24px
  section-padding: 120px
  stack-sm: 8px
  stack-md: 16px
  stack-lg: 32px
---

## Brand & Style
The design system is anchored in a European editorial aesthetic, blending the structured reliability of a Swiss design studio with the warmth of a modern boutique. It targets professional teams who value clarity over clutter, positioning itself as a "calm" productivity tool.

The visual style is **Minimalism** with a heavy focus on **Grid-based Layouts**. It rejects the typical "SaaS fluff"—meaning no gradients, no soft shadows, and no decorative blobs. Instead, it relies on high-contrast typography, precise linework, and a sophisticated use of negative space to create a sense of premium authority and focused efficiency.

## Colors
The palette is built on a foundation of warm neutrals to avoid the clinical feel of pure white. The primary coral (`#E05A3A`) is the high-energy driver, used intentionally for primary actions and brand emphasis.

- **Primary (Coral):** Reserved for the most important interactive elements and brand highlights.
- **Secondary (Dusty Teal):** Used for categorical distinction in features or subtle data visualization.
- **Tertiary (Blush):** Provides a soft background for secondary cards or content buckets, maintaining the warm theme.
- **Neutral (Near-Black):** Used for typography to ensure maximum legibility and for the "Statement" sections to create high-impact visual breaks.

## Typography
The typographic hierarchy is the primary engine of the design system. It uses a "Heavy-Light" contrast:

- **Headlines:** Use **Anton** for a bold, condensed, editorial feel. Large display sizes should use tight tracking to emphasize the "grid-filling" nature of the text.
- **Body & UI:** Use **Hanken Grotesk** for its clean, modernist proportions. It provides a functional counterpoint to the expressive headlines.
- **Section Labels:** These must always be set in small caps (or uppercase) with generous letter-spacing and rendered in the Primary Coral color to act as clear wayfinders.

## Layout & Spacing
The layout follows a **Fixed Grid** philosophy on desktop (12 columns) and a fluid 4-column grid on mobile. 

- **Generous Margins:** Content is framed by wide external margins to maintain the editorial "magazine" feel.
- **Vertical Rhythm:** Sections are separated by significant vertical padding (`120px+`) to allow the eyes to rest and the content to breathe.
- **Grid Alignment:** All elements, especially in the feature cards, must snap strictly to the grid. Use hard edges and avoid offset alignments.

## Elevation & Depth
This design system is strictly **Flat**. Depth is achieved through color-blocking and layering rather than shadows or blurs.

- **No Shadows:** Do not use box-shadows or drop-shadows on any element, including buttons and cards.
- **Tonal Layering:** Use the palette (Warm Off-White vs. Blush vs. Teal) to create visual hierarchy. 
- **High-Contrast Breaks:** Use the dark theme statement sections (Black background) to create "interruptions" in the scroll, providing an immediate sense of depth through extreme tonal contrast.

## Shapes
The shape language is predominantly sharp and architectural. 

- **Cards:** Use "Soft" (`0.25rem`) rounded corners to provide a slight hint of modern approachability without losing the professional edge.
- **Interactive Elements:** Buttons and Input fields should remain perfectly sharp (0px radius) to reinforce the brutalist/minimalist aesthetic.
- **Dividers:** Use thin, 1px lines in the Neutral color (at low opacity) or the Primary color for structural separation.

## Components

### Buttons
Primary buttons are flat blocks of Primary Coral with Near-Black text. They do not have borders or shadows. On hover, the background should shift to a slightly darker shade of coral or invert to black with coral text.

### Feature Cards
Grid-based cards use flat background fills (Blush or Teal). Content inside should be top-aligned. The card itself should have a subtle 1px border or rely entirely on the color fill for definition.

### Process Steps
Use a large, editorial number (e.g., 01, 02) in the Headline font. The number should be treated as a lead visual element, often larger than the step title itself.

### Accordion (FAQ)
Clean, horizontal dividers. The trigger uses the `label-bold` style. The expansion should be a simple vertical reveal without any decorative background change, maintaining the flat aesthetic.

### Navigation
The navigation is sticky with a blurred "glass" effect only if necessary for legibility over content, though a solid Warm Off-White background is preferred. Use the `section-label` typography for nav links.

### Inputs & Forms
Sharp-edged boxes with a 1px border. Focus states are indicated by a thicker 2px border in Primary Coral. Labels should follow the `section-label` style.