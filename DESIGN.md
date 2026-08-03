# brieFFlow / PressTuner Design System

## 1. Atmosphere & Identity

brieFFlow is a quiet writing command center for press and career documents. It should feel calm, focused, and operational rather than decorative: users bring rough material, the product structures it, and the interface keeps the next writing action visible. The signature is a light editorial workspace with soft panels, restrained blue actions, and compact status surfaces.

## 2. Color

### Palette

| Role | Token | Light | Dark | Usage |
|------|-------|-------|------|-------|
| Surface/primary | `--background` | `hsl(210 40% 98%)` | `hsl(224 55% 6%)` | Main app background |
| Surface/elevated | `--card` | `hsl(0 0% 100%)` | `hsl(225 44% 10%)` | Editor panels, modals, cards |
| Surface/muted | `--muted` | `hsl(210 40% 96%)` | `hsl(224 32% 14%)` | Secondary bands, inactive controls |
| Text/primary | `--foreground` | `hsl(222.2 47.4% 11.2%)` | `hsl(210 40% 98%)` | Main copy and labels |
| Text/secondary | `--muted-foreground` | `hsl(215 16.3% 46.9%)` | `hsl(215 20.2% 72%)` | Hints, metadata, helper text |
| Border/default | `--border` | `hsl(214.3 31.8% 91.4%)` | `hsl(224 22% 20%)` | Panel and control borders |
| Input/default | `--input` | `hsl(214.3 31.8% 91.4%)` | `hsl(224 22% 20%)` | Form field border |
| Accent/primary | `--primary` | `hsl(224.3 76.3% 48%)` | `hsl(224.3 76.3% 55%)` | Primary actions, focus, active states |
| Accent/on-primary | `--primary-foreground` | `hsl(210 40% 98%)` | `hsl(210 40% 98%)` | Text on primary actions |
| AI/accent | `--ai` | `hsl(30 100% 50%)` | `hsl(32 100% 60%)` | AI-specific accents |
| AI/soft | `--ai-soft` | `hsl(35 100% 92%)` | `hsl(32 60% 12%)` | AI hint backgrounds |
| Status/error | `--destructive` | `hsl(0 84.2% 60.2%)` | `hsl(0 72% 51%)` | Errors and destructive actions |
| Status/success | `--success` | `hsl(142 76% 36%)` | `hsl(160 84% 39%)` | Saved and completed states |

### Rules

- Use blue only for current workflow actions, focus rings, and active state.
- Use orange only for AI-specific hints or extraction actions.
- Use status colors only for true success, warning, or failure feedback.
- Prefer token opacity and `color-mix` over new raw colors.

## 3. Typography

### Scale

| Level | Size | Weight | Line Height | Tracking | Usage |
|-------|------|--------|-------------|----------|-------|
| H1 | `2.25rem` | 700 | 1.2 | 0 | Page titles |
| H2 | `1.75rem` | 700 | 1.3 | 0 | Section titles |
| H3 | `1.25rem` | 700 | 1.4 | 0 | Panel titles |
| Body | `1rem` | 400-600 | 1.6-2 | 0 | Draft text and main copy |
| Body/sm | `0.875rem` | 400-600 | 1.5-1.75 | 0 | Secondary UI copy |
| Caption | `0.75rem` | 500-700 | 1.4 | 0 | Metadata and compact buttons |
| Overline | `0.6875rem` | 700 | 1.3 | `0.12em` to `0.18em` | Status labels |

### Font Stack

- Primary: `var(--font-geist-sans), system-ui, sans-serif`
- Mono: `var(--font-geist-mono), ui-monospace, monospace`

### Rules

- Body text never drops below 12px in dense controls and 14px in reading surfaces.
- Draft/editor copy should use generous line height, usually `leading-8`.
- Letter spacing stays at 0 except compact uppercase status labels already present in the product.

## 4. Spacing & Layout

### Base Unit

All spacing derives from a 4px base.

| Token | Value | Usage |
|-------|-------|-------|
| `--space-1` | 4px | Icon-to-label, compact controls |
| `--space-2` | 8px | Button gaps, tags |
| `--space-3` | 12px | Dense panel padding |
| `--space-4` | 16px | Standard panel padding |
| `--space-5` | 20px | Editor and modal padding |
| `--space-6` | 24px | Large panel padding |
| `--space-8` | 32px | Section separation |

### Grid

- Max app workspace width: `1180px`.
- Main writing surface: editor-first grid with an optional assistant panel.
- Mobile writing surface: question tabs plus bottom-sheet assistant.
- Breakpoints follow Tailwind defaults.

### Rules

- Prefer constrained workspace containers to full-bleed dashboard content.
- Keep writing controls stable in height so character counters and sticky footers do not shift layout.
- Use scroll containers only inside panels that have a stable visual boundary.

## 5. Components

### App Surface (Sharp)

- **Structure**: flat panel — `border border-border`, `bg-card`, zero border-radius,
  no box-shadow. Established in `resume/write`, `resume/applications`, and
  `press/new` (see `components/page/PageSection`, `PageSurface`, `PageCTA`,
  `KpiCard`); this supersedes the earlier rounded/shadow "soft" surface below.
  Content dividers inside a flat panel use a heavy `border-t-2 border-foreground`
  rule, not nested cards.
- **CTAs and buttons**: flat rectangle, no radius, no shadow — including
  primary buttons (`bg-primary`, no `rounded-full`, no `shadow-lg`).
- **Exceptions that keep `rounded-full`** (small, inherently circular or pill
  elements, not containers): spinners, avatars/circular icon glyphs, single
  status dot indicators, thin progress-bar track/fill, and the compact
  `status-badge` pill. Do not extend the flat rule to these.
- **Floating overlays** (dropdown menus, modals, tooltips) may keep a border
  plus the "Soft shadow" / "Work surface shadow" elevation tokens below —
  they sit above content rather than being part of the flat page surface.
- **Spacing**: `--space-4` to `--space-6`.
- **States**: default, hover for selectable surfaces, disabled opacity for unavailable actions.
- **Accessibility**: interactive panels remain buttons or links when clickable.

### Draft Editor

- **Structure**: header, textarea or comparison body, sticky action footer.
- **Spacing**: `--space-4` mobile, `--space-5` desktop.
- **States**: read-only, saving, AI preview, error/banner.
- **Accessibility**: textarea remains a native input, action buttons have clear labels.

### Assistant Panel

- **Structure**: quick prompts, scrollable message list, prompt input.
- **Spacing**: compact controls with `--space-2`, message bubbles with `--space-3` to `--space-4`.
- **States**: loading history, AI working, empty guidance, error/banner.
- **Accessibility**: mobile assistant opens as a bottom sheet with a close button.

### Review Modal

- **Structure**: modal header, scrollable candidate list, action footer.
- **Spacing**: `--space-5` to `--space-6`.
- **States**: loading, selected, skipped, disabled apply.
- **Accessibility**: modal controls use native buttons, no destructive default action.

## 6. Motion & Interaction

### Timing

| Type | Duration | Easing | Usage |
|------|----------|--------|-------|
| Micro | 120ms | ease | Hover and focus shifts |
| Standard | 200-300ms | ease-out | Panel open, bottom sheet, view transition |
| Emphasis | 300ms | ease-out | Floating assistant affordances |

### Rules

- Animate only `transform`, `opacity`, `background`, `border-color`, and `box-shadow`.
- Every primary or secondary action has hover, disabled, and focus-visible affordances.
- Bottom-sheet motion must keep the backdrop and panel synchronized.

## 7. Depth & Surface

### Strategy

Use a mixed but restrained strategy: token borders for structure, subtle shadows for active work surfaces and modals, tonal shifts for secondary sections.

| Level | Value | Usage |
|-------|-------|-------|
| Surface border | `1px solid hsl(var(--border))` | Panels, controls, modals |
| Soft shadow | `0 1px 2px rgba(16, 24, 40, 0.06), 0 10px 24px rgba(16, 24, 40, 0.06)` | Standard elevated surfaces |
| Work surface shadow | `0 24px 80px rgba(12,18,28,0.12)` | Primary draft editor |

### Rules

- Avoid nested card stacks; panels may contain list items, but page sections should not become cards inside cards.
- Use depth to show active work or modal priority, not decoration.
- Dark mode shadows use black alpha and keep borders visible.
- Flat page surfaces (see App Surface (Sharp) above) use the border row only,
  no shadow. The soft shadow / work surface shadow rows apply only to
  floating overlays and the primary draft editor, not to ordinary page panels.
