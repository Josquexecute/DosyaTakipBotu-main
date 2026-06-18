---
name: HasarBotu Enterprise
colors:
  surface: '#f9f9ff'
  surface-dim: '#d4dae9'
  surface-bright: '#f9f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f0f3ff'
  surface-container: '#e8eeff'
  surface-container-high: '#e3e8f8'
  surface-container-highest: '#dde2f2'
  on-surface: '#161c27'
  on-surface-variant: '#434751'
  inverse-surface: '#2b313c'
  inverse-on-surface: '#ecf0ff'
  outline: '#737782'
  outline-variant: '#c3c6d2'
  surface-tint: '#305da6'
  primary: '#002a5d'
  on-primary: '#ffffff'
  primary-container: '#003f87'
  on-primary-container: '#84adfc'
  inverse-primary: '#acc7ff'
  secondary: '#712ae2'
  on-secondary: '#ffffff'
  secondary-container: '#8b4bfc'
  on-secondary-container: '#fffbff'
  tertiary: '#4e1b00'
  on-tertiary: '#ffffff'
  tertiary-container: '#722b00'
  on-tertiary-container: '#f99361'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d7e2ff'
  primary-fixed-dim: '#acc7ff'
  on-primary-fixed: '#001a40'
  on-primary-fixed-variant: '#0d458d'
  secondary-fixed: '#eaddff'
  secondary-fixed-dim: '#d2bbff'
  on-secondary-fixed: '#25005a'
  on-secondary-fixed-variant: '#5a00c6'
  tertiary-fixed: '#ffdbcc'
  tertiary-fixed-dim: '#ffb694'
  on-tertiary-fixed: '#351000'
  on-tertiary-fixed-variant: '#793004'
  background: '#f9f9ff'
  on-background: '#161c27'
  surface-variant: '#dde2f2'
  error-critical: '#ba1a1a'
  surface-subtle: '#f9f9ff'
  outline-faint: '#c2c6d4'
typography:
  h1:
    fontFamily: Hanken Grotesk
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.02em
  h2:
    fontFamily: Hanken Grotesk
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  h3:
    fontFamily: Hanken Grotesk
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
  data-mono:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 18px
    letterSpacing: -0.01em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 4px
  xs: 4px
  sm: 8px
  gutter: 12px
  md: 16px
  lg: 24px
  xl: 32px
  container-max: 1600px
---

## Brand & Style
The brand personality is **Corporate Modern**, specifically tailored for high-efficiency insurance adjusters and legal professionals. It evokes a sense of **precision, urgency, and institutional reliability**. 

The UI utilizes a "Dense Functionalist" approach, prioritizing information density over whitespace to accommodate complex data sets. It leans on a structured grid with sharp, crisp boundaries and professional-grade typography. The emotional response is one of calm control within a high-stakes environment—achieved through a cool-toned palette punctuated by high-visibility status indicators.

## Colors
The color system uses a **Fidelity** logic, where the primary navy blue (#003f87) anchors the professional identity. 

- **Primary:** Used for navigational anchors, primary actions, and brand identification.
- **Surface Palette:** Employs a sophisticated range of cool grays and blues to create "work zones." `surface-container-low` is used for headers, while `surface-bright` differentiates detail panes.
- **Status Indicators:** A semantic trio is essential: `error` (Red) for missing documents, `tertiary` (Warm Brown/Orange) for pending actions, and `secondary` (Violet) for tracking/follow-up.
- **Contrast:** High contrast between `on-surface` (#161c27) and background ensures legibility in data-heavy tables.

## Typography
The system utilizes a dual-font approach. **Hanken Grotesk** provides a sharp, modern geometric feel for headers and brand elements, conveying authority. **Inter** is the workhorse for all data, forms, and labels, selected for its extreme legibility at small sizes.

A specialized `data-mono` style (using Inter with tighter tracking and medium weight) is used for technical identifiers like Plate Numbers and File IDs to ensure they are visually distinct from descriptive text. Labels use uppercase styling and increased letter spacing when used as section headers to improve scanability.

## Layout & Spacing
The layout follows a **Master-Detail fixed-sidebar** philosophy. 

- **Global Container:** Centered with a maximum width of 1600px.
- **Left Pane (Master):** Fluid-width list view containing search, filters, and a high-density data table.
- **Right Pane (Detail):** A fixed-width (500px) drawer that appears on the right, utilizing a "Bento-style" grid for grouping data into logical chunks.
- **Spacing Rhythm:** Uses a strict 4px baseline. Most internal component padding is `sm` (8px), while structural gaps between major sections use `md` (16px).
- **Responsive Behavior:** On tablet, the detail pane converts to a full-screen overlay. On mobile, the KPI cards stack vertically and the table hides non-essential columns (Insurance, Date).

## Elevation & Depth
Elevation is primarily conveyed through **Tonal Layering** and **Low-Contrast Outlines** rather than heavy shadows, maintaining a flat, professional aesthetic.

- **Level 0 (Background):** `surface` color (#f9f9ff).
- **Level 1 (Containers):** `surface-container-lowest` (White) for cards and table rows to provide pop.
- **Level 2 (Interaction):** Subtle `shadow-sm` on cards and hover states.
- **Level 3 (Detail Pane):** `shadow-lg` is applied to the Detail Drawer to visually separate it from the master list when overlapping.
- **Borders:** `outline-variant` (#c2c6d4) is used for almost all structural dividers, ensuring a rigid, organized grid.

## Shapes
The shape language is **Soft (Sharp-leaning)**. 

- **Primary Elements:** Buttons, input fields, and small cards use a 4px (0.25rem) radius to feel precise.
- **Pills/Chips:** Status badges and filter buttons use a slightly more rounded 8px radius for quick visual categorization.
- **Avatar/Icons:** Circular shapes are reserved strictly for user profiles to provide a human element in the mechanical UI.

## Components
- **Buttons:** Primary buttons are solid `primary` with white text. Secondary buttons are `surface-container` with `outline-variant` borders.
- **Data Tables:** High-density, h-10 (40px) rows. The "Active" row uses a 20% opacity primary tint and a 3px left-accent border in the semantic status color (e.g., Red for Error).
- **KPI Cards:** Small, information-dense modules with a headline (H3) and a sub-label. They feature a 1px border that changes color on hover to match the semantic role.
- **Input Fields:** 32px height, `surface-container-lowest` background, with a 1px border. Focus states use a 1px `primary` ring.
- **Status Chips:** Small, bold labels with high-contrast background/foreground pairings (e.g., `error-container` background with `on-error-container` text).
- **Detail Tabs:** Underlined style with 2px `primary` border for the active state; no background color change, keeping the header clean.