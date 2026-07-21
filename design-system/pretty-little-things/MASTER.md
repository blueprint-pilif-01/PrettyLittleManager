# Pretty Little Things product design system

## Product register

This is a private operational tool for catalog, inventory and channel publishing. Design serves repeated tasks. Familiar controls, fast scanning and clear state always win over decorative presentation.

Design dials:

- Design variance: 4/10
- Motion intensity: 2/10
- Visual density: 7/10

## Foundation

- Typography: Plus Jakarta Sans Variable for all product UI.
- Palette: restrained cool neutrals with one cyan-teal primary accent.
- Theme: semantic CSS variables in `apps/web/src/styles.css`, with light and dark modes.
- Radius rule: 6px controls, 8px grouped surfaces, pill only for status badges.
- Icon family: Phosphor Icons only.
- Spacing: 4, 6, 8, 10, 12, 16, 20, 24, 32px.

## Layout rules

- Tables, rows and section dividers are the default for operational data.
- Cards are reserved for independent objects or elevated interaction contexts.
- Settings use section navigation and editable rows, not status-card grids.
- Editors use a sticky action header, local section navigation and a single continuous form.
- Empty states explain the next available action.
- Responsive behavior is structural: collapse navigation and columns below 960px, then simplify controls below 680px.

## Interaction rules

- Frequent and keyboard-triggered actions change instantly.
- Hover, focus, selected and press feedback use 150-200ms transitions.
- No page-load choreography, looping indicators, bounce or decorative movement.
- Animate transform and opacity only. Respect `prefers-reduced-motion`.
- Every mutation exposes pending, success and error states close to the action.

## Content rules

- Use operational language: Create product, Record stock, Sync metadata, Publish listing.
- Show provider implementation terms only inside the relevant integration setup.
- Dashboard content must be actionable. Infrastructure diagnostics belong in Settings > System.
- The eMAG test adapter is presented as `Test connection`; `mock` is an internal implementation term.

## Accessibility and quality

- WCAG 2.2 AA contrast, visible focus rings and explicit labels.
- All icon-only actions require accessible names.
- No placeholder-only labels.
- Loading uses layout-matched skeletons where possible.
- Test at 375px, 768px, 1024px and 1440px in both themes.
