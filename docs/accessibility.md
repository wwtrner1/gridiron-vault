# GridIronVault — accessibility audit

Standard applied: WCAG 2.1 level AA. Every fix below is in the working tree —
this is a record of what changed, not a list of recommendations.

Work order was shared layout and reusable components first, then individual
pages, so that a single fix covered every screen that renders the component.

---

## Shared layout and components

### `src/components/Modal.tsx`
The shared dialog had no dialog semantics and no focus management.

- `role="dialog"`, `aria-modal="true"` and `aria-labelledby` pointed at the
  heading through a `useId()` id.
- Focus moves to the first control in the dialog on open and returns to the
  element that opened it on close, so a keyboard user never loses their place
  in the page behind.
- `Tab` and `Shift+Tab` cycle inside the dialog instead of escaping to the page.
  The stop list is filtered by `offsetParent` so controls hidden by a collapsed
  section are skipped.
- `Escape` closes.
- The icon-only close button got `aria-label={`Close ${title}`}`, so a button
  list names which dialog it closes.

Every modal in the app — export, playbook rename, delete confirmation, add
plays — inherits all of this.

### `src/components/Tooltip.tsx`
The hint span carried `role="tooltip"` and an `id` that nothing referenced, so
the text was invisible to assistive tech. The id is now wired to the control it
describes with `aria-describedby`, applied by cloning the child element. Escape
dismisses the hint without moving focus off the tool.

### `src/components/Panel.tsx`
The foldable tool panels are the main navigation of the designer rail.

- `aria-expanded` on the header button.
- `aria-controls` pointed at the body through `useId()`.
- The body is now always rendered and toggled with the `hidden` attribute.
  It used to unmount, which left `aria-controls` referencing an element that
  did not exist. `[hidden] { display: none !important; }` backs this in CSS.

### `src/components/Shell.tsx`
The layout behind the Vault, Playbooks, Season Grid, Starters and Account.

- A skip link to `#main` as the first focusable element.
- `<main id="main">` wraps the page content — the landmark was missing.
- The rail is `<aside id="rail-nav" aria-label="Playbook navigation">` and its
  two link groups are `<nav aria-labelledby>` regions with real headings.
- The narrow-screen rail toggle got `aria-label`, `aria-expanded` and
  `aria-controls="rail-nav"`.
- Sign out reads `Sign out of <name>` rather than bare "Sign out".
- The decorative avatar initial is `aria-hidden="true"`.

The topbar `<h1>{title}</h1>` is the canonical `h1` for every app page; in-page
duplicates were demoted (see Heading hierarchy).

### `src/App.tsx`
Client-side navigation replaces the view without a page load, which is silent
to a screen reader. `RouteChrome` now renders an `sr-only` polite live region
that announces the new page name on every route change, alongside the
`document.title` update it already did.

### `src/components/ExportDialog.tsx` and `src/components/Inspector.tsx`
- Chip rows (File, Plays per sheet, Resolution) are `role="group"` with
  `aria-labelledby` pointing at their eyebrow label; each chip carries
  `aria-pressed`.
- The size list is a proper `role="radiogroup"` / `role="radio"` /
  `aria-checked`, with the decorative radio dot hidden.
- DPI chips above the plan cap announce the lock: `300 DPI — locked on Sideline`.
- Colour swatches got names and `aria-pressed`; the tag-remove buttons and the
  label input got `aria-label`s.

### `src/styles/global.css`
- One `:focus-visible` rule covers links, inputs, buttons, selects, textareas,
  `summary`, `[role="button"]`, `[role="option"]` and anything with `tabindex`.
  Links were missing from the previous rule, which left the main way of moving
  around the site with no visible ring.
- On the dark bands (nav, hero, CTA, footer, rail) the ring switches from cyan
  to white, where cyan on navy was hard to see.
- `.sr-only` and a `.skip-link` that is offscreen until focused.
- `@media (prefers-reduced-motion: reduce)` reduces animation and transition
  duration and disables smooth scrolling.

---

## Contrast

Ratios were computed from the actual custom property values rather than
eyeballed. Three pairs failed AA for text:

| Token | Was | Now | Ratio on white |
|---|---|---|---|
| `--cyan-2` used as text | `#12b5d4` | new `--cyan-ink: #0b8096` | 2.4:1 → 4.6:1 |
| `--muted` | `#667f94` | `#60788c` | 4.18:1 → 4.6:1 |
| `.mkt-legal` | `#5e7a91` | `#627f97` | on navy, now clears 4.5:1 |

`--cyan-ink` was introduced rather than darkening `--cyan-2` globally, so
borders, rules and accents keep the brand tone while text clears 4.5:1.
`--cyan-ink` is now used by `.feature-kicker`, the step numbers, the FAQ marker,
the meter link hover and the auth skip link.

`--green` was left at 3.38:1 deliberately — it only colours an icon that sits
beside a text label, where the applicable threshold is 3:1 for non-text.

---

## Heading hierarchy

One `h1` per page, no skipped levels. Verified sequences:

| Page | Sequence |
|---|---|
| Landing | 1, 2, 3, 2, 3, 2, 2, 2, 3, 3, 3 |
| Pricing | 1, 2, 3, 2, 2, 2 |
| Vault | 1, 2, 2, 3 |
| Playbooks | 1, 2, 3×6 |
| Season Grid | 1, 2, 3 |
| Starters | 1, 2, 3, 3 |
| Account | 1, 2, 3×5 |
| Designer | 1 (screen-reader only) |
| Sign in | 1 (branches are mutually exclusive) |
| Not found | 1 |

Changes made to get there: page `h1`s inside Shell demoted to `h2` (Shell's
topbar owns the `h1`); card headings raised from `h4` to `h3`; Pricing gained an
`sr-only` "Plans" `h2` to close an h1→h3 skip; the Sign-in art column's `h2`,
which preceded the form's `h1` in DOM order, became a styled paragraph; the
Designer — the one page that does not use Shell, and so had no `h1` at all —
gained an `sr-only` `h1` naming the play being drawn.

---

## Pages

### `src/pages/Landing.tsx`
Skip link, `<nav aria-label="Main">`, `<main id="main">` around hero through
CTA band, `aria-labelledby` on every section, decorative hero chrome hidden,
and the footer restructured into three labelled `<nav>` columns under an
`sr-only` "Site footer" heading. The steps became an ordered list, which is
what they are.

### `src/pages/SeasonGrid.tsx`
The largest surface, and the one a coach drives from a tablet.

- `<caption class="sr-only">` and `scope="col"` on every header cell.
- `aria-sort` on the sorted column, and sort buttons labelled with the *next*
  action — `Sort by Play Name, descending`, `Clear the sort on Group`.
- The row grip became `<th scope="row">`, so each row is named "Row 4" rather
  than reading as an unlabelled cell. While paint mode is on the grip is a real
  button (`Paint row 4`) — it was pointer-only before.
- Predictive autocomplete is now a conformant combobox: `role="combobox"`,
  `aria-autocomplete="list"`, `aria-expanded`, `aria-controls` and
  `aria-activedescendant` on the input, paired with `role="listbox"` /
  `role="option"` / `aria-selected` on the suggestion list.
- Every cell input is named `<Column>, row <n>`.

### `src/pages/Builder.tsx`
`<main className="builder-main" id="main">` landmark; `sr-only` `h1`; the rail,
canvas and details panel are labelled regions; the action bar is
`role="toolbar"`; tool buttons carry `aria-pressed` and say when they are
locked; the scale anchor grid announces position in words
(`Anchor at top left`); the status line is `role="status" aria-live="polite"`.

### `src/pages/SignIn.tsx`, `Vault.tsx`, `Starters.tsx`, `Playbooks.tsx`, `Account.tsx`
- The sign-in `role="tablist"` was removed rather than completed. It had no
  tabpanel, no roving tabindex and no arrow-key handling, and its third state
  (password reset) is not a tab. It is now `role="group"` with `aria-pressed`,
  which is fully conformant and promises no keyboard contract the code does not
  implement. The same reasoning was applied to the Vault view switcher.
- Errors render inside `role="alert"`, confirmations inside
  `role="status" aria-live="polite"`, and the session check has its own live
  region.
- Bulk-selection bars announce the count through an `sr-only` live region, with
  the visible count hidden from the reader so it is not spoken twice.
- Filter and plan chip rows are labelled groups with `aria-pressed`.
- Repeated card controls — Open, Export, Copy, Print, Rename, Delete, Move up,
  Move down — are scoped with the play or book name, so a button list is
  navigable instead of reading "Delete" eleven times.
- The playbook spine colour picker is a `radiogroup` of named colours rather
  than hex values.
- Usage meters are `role="progressbar"` with `aria-valuetext`
  (`6 of 8 plays used`).
- `NotFound` became a `<main>` landmark.

---

## Checked, no change needed

- **Images.** There is no `<img>` element anywhere in the repo. All artwork is
  inline SVG. `PlayThumb` already renders `role="img"` with a descriptive
  `aria-label`, and `Icon` already sets `aria-hidden="true"` on every glyph,
  which is correct — the icons sit beside text labels or inside buttons that
  now carry their own `aria-label`.
- **Language.** `index.html` already declares `<html lang="en">`.
- **Toasts.** `src/lib/toast.tsx` already wrapped its stack in
  `role="status" aria-live="polite"`.
- **Form labels.** Every input in the app was already inside a `<label>`
  element. What was missing was naming on *icon-only buttons* and on the
  unlabelled grid cells, both fixed above.

---

## Known gaps

- Screen-reader testing was not performed. The work above is
  standards-conformant and type-checks, but nothing here has been driven with
  NVDA, VoiceOver or TalkBack, and the Season Grid combobox in particular
  deserves a real pass.
- Drag-and-drop has no keyboard equivalent. Reordering Season Grid rows and
  columns, and dragging tokens onto the field, are pointer-only. Cell editing,
  sorting and painting are all reachable by keyboard, so the grid is usable
  without a mouse, but reordering is not. This needs a keyboard reorder mode
  and is the largest remaining gap.
- Automated audits (axe, Lighthouse) were not run; the build was not executed.
