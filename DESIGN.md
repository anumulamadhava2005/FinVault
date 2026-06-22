# Design System (FinVault)

## Theme & Colors

### Color Strategy
- **Charcoal Monochromatic**: A soft dark-gray monochromatic visual theme using deep charcoal tones (`#181818` background, `#1F1F1F` surfaces) for dark mode, and soft off-whites (`#F5F5F5` background, `#FFFFFF` surfaces) for light mode.
- **Density**: Prioritize spacious layouts with generous padding, margins, and separation.

### Color Tokens (Dark Mode)
- `bg`: `#181818` (Charcoal background)
- `surface`: `#1F1F1F` (Charcoal card/surface)
- `surface-variant`: `#2A2A2A` (Lighter charcoal separator/panel)
- `ink`: `#F5F5F5` (Soft white text)
- `ink-muted`: `#9E9E9E` (Slate/gray text)
- `primary`: `#FAFAFA` (Accent)
- `secondary`: `#FAFAFA`
- `border`: `#2E2E2E` (Charcoal border)

### Color Tokens (Light Mode)
- `bg`: `#F5F5F5` (Soft light background)
- `surface`: `#FFFFFF` (White card/surface)
- `surface-variant`: `#ECECEC` (Light gray separator/panel)
- `ink`: `#181818` (Charcoal text)
- `ink-muted`: `#6D6D6D` (Gray text)
- `primary`: `#181818` (Charcoal accent)
- `secondary`: `#181818`
- `border`: `#E0E0E0` (Light gray border)

### Semantic States (Subtle accents for financial metrics only)
- `success`: `#10B981` (Emerald)
- `warning`: `#F59E0B` (Amber)
- `danger`: `#EF4444` (Rose)

## Typography
- **Font Family**: Inter, SF Pro, system sans-serif.
- **Scale**:
  - `display`: 32px (bold, tabular numbers)
  - `headline`: 24px (bold)
  - `title`: 18px (semi-bold)
  - `body`: 14px (regular, leading 1.4)
  - `label`: 12px (semi-bold, tracking 0.05em)

## Layout & Components

### Spacing & Spacing-First Layout
- Page padding: 18px (generous page spacing).
- Card padding: 18px.
- Card vertical margin: 12px (giving breathing room between cards).
- List row gap: 14px (spacious lists).
- Separators: thin, subtle borders to group sections cleanly without clutter.

### Cards & Surfaces
- Corner radius: 18px (premium rounded corner).
- Border: 1px solid `border`.
- Elevation: minimal (0-1).

### Interactive Press Feedbacks
- Active press scale: `0.97` using spring animations (`friction: 6, tension: 120`).
- Entry animations: Staggered translation (translateY: 10px -> 0px, opacity: 0 -> 1) with `50ms` delay between rows.
