# Accessibility record — Grid1ronVault

Scope: the whole shipped site, which is three files (`index.html`, `styles.css`,
`app.js`) plus the 56 card images in `cards/`. There is one page and one modal.

Last audited: 2026-09-21. Method: manual review of the markup, the stylesheet
and the rendered DOM, plus computed contrast ratios. No screen reader and no
automated tool (axe, Lighthouse) was run — see "Not verified" below.

## What is in place

These were already correct at the time of this audit and were confirmed, not
changed:

- `<html lang="en">`.
- A skip link that targets `<main id="top" tabindex="-1">`, visible on focus.
- One `h1` per page, then `h2` (`All formations`), then `h3` (empty state). No
  skipped levels. The modal's own `h2` names the dialog via `aria-labelledby`.
- Landmarks: `header` (banner), `main`, `footer` (contentinfo, since its only
  ancestor is a `div`). Both content sections are named by `aria-labelledby`.
- The search input has a real `<label>`, an `aria-describedby` hint that
  explains the `/` shortcut, and `aria-keyshortcuts="/"`. The shortcut handler
  refuses to steal `/` while the user is typing or while the modal is open.
- Formation filters are a named `role="group"` of toggle buttons carrying
  `aria-pressed`, kept in sync on every render.
- Result counts are announced through `role="status"`, suppressed on first
  paint so the page does not announce itself on load.
- Every icon-only control is named: card buttons get a composed label
  (`Open Cover 2, Defense formation, card 54 of 56`), and the close, previous,
  next and print controls have `aria-label`s.
- Card thumbnails are `alt=""` because the enclosing button already names the
  play; the full-size preview image gets a descriptive alt naming the play and
  formation.
- Focus is never dropped when a control disappears: hiding the focused "Clear
  filter" button moves focus to the search box, and disabling the focused arrow
  in the modal hands focus to the next live control.
- The preview uses a native `<dialog>` with `showModal()`, which supplies the
  focus trap, `Escape`, modal semantics and focus restore natively.
- `:focus-visible` rings on every interactive element, with a lighter ring
  token on the dark bands.
- A `prefers-reduced-motion: reduce` block that neutralises the transitions and
  the smooth-scroll behaviour.

## Contrast

Ratios computed from the token values in `styles.css`, not eyeballed. The
translucent panel in the hero was measured against its blended backdrop
(`#ffffff` at 7% over `--navy`, which resolves to `#182436`). Text on the hero
was checked against both ends of its gradient. Every pair clears WCAG AA:

| Pair | Ratio |
| --- | --- |
| `.lede` `#aebed2` on `--navy` / gradient far end | 9.81 / 8.39 |
| `.privacy` `#b8c7da` on `--navy` | 10.80 |
| `.brand small` `#8cc2f7` on `--navy` | 9.88 |
| `--blue-on-dark` eyebrow on `--navy` / far end | 8.85 / 7.58 |
| footer `#a7b6c8` on `--navy` | 8.99 |
| `.ratio-card small` `#b3c2d4` on blended panel | 8.62 |
| `.filter-button` `#536175` on white | 6.30 |
| `--muted-strong` on white / on `kbd` `#f8fafc` | 5.43 / 5.19 |
| `--muted` `#64748b` on white | 4.76 |
| `--blue` on white / on `--blue-soft` | 5.58 / 4.99 |
| white on `--blue` (print + active filter) | 5.58 |
| `.icon-button` / `.nav-button` glyphs on white | 5.76 / 8.07 |
| `.validation` tick `#067647` on `#dff7eb` | 5.05 |
| focus ring on white / on `--navy` | 5.58 / 10.99 |

The headline's outlined word is stroked in `#4e9ce6`, which is 6.38:1 on
`--navy` — comfortably past the 3:1 that its size would require.

Purely decorative text — the `00` in the empty state, the `OPEN` badge grown by
`.thumb::after`, the `4.5 × 2.02` chip, the `/` key cap and the green privacy
dot — is `aria-hidden` or CSS-generated, so it is exempt and was not measured.

## Changed in this pass

One real defect, in the hero headline. `h1 em` set `color: transparent` and
painted the word with `-webkit-text-stroke`. Where that property is not honoured
there is no stroke and no fill, so "Fast." renders as invisible text — the word
is in the accessibility tree and read aloud, but a sighted user sees a gap. The
transparent fill is now scoped to an `@supports (-webkit-text-stroke: ...)`
block, and the unguarded rule paints the word solid in the same blue. Where the
stroke works, nothing about the design changes.

## Judgement calls

- The formation filters stay `role="group"` with `aria-pressed` rather than
  becoming a `radiogroup`. Only one filter can be active, which argues for
  radios, but a radiogroup owes the user arrow-key navigation and a roving
  tabindex that this code does not implement. The group of toggle buttons is
  conformant and promises only the keyboard contract that exists: tab to a
  filter, activate it, keep focus.
- The card thumbnails stay `alt=""`. A per-image description of a route diagram
  would be genuinely useful, but it would have to be written per card by someone
  who can read the diagrams; generated text would be worse than the button label
  that already names the play, formation and card number.

## Not verified

- No screen-reader pass (VoiceOver, NVDA, JAWS).
- No automated pass (axe, Lighthouse, WAVE).
- No Windows High Contrast / forced-colors check. The dark bands rely on
  `background` for their contrast, which forced-colors mode discards.
- Reflow at 400% zoom and a 320px viewport was reasoned about from the
  breakpoints, not measured in a browser.

## Known gaps

- The 56 card diagrams have no text alternative describing the play itself. A
  coach using a screen reader can find a card by name but cannot read the route
  from the page. This is the largest outstanding gap.
- Card artwork is raster PNG, so it blurs when magnified rather than scaling.
