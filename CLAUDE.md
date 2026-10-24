# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Names and addresses

- Canonical domain: **https://gridiron-vault.com** (Netlify DNS; www redirects to the apex). Use it for every absolute URL (Open Graph, Identity email templates, redirects). `gridiron-vault.netlify.app` only forwards to it.
- Repo slug: **wwtrner1/gridiron-vault**.
- Brand spelling: **GridIronVault** (capital I).
- Saved plays live in `localStorage`, which belongs to one origin. `public/handoff.js` (loaded first from `index.html`) and `old-address/move.js` forward plays from the older addresses to the apex in `#carry=…`, and `src/components/CarryOver.tsx` merges them (newer wins; never `gotrue.*`).

## What this is

GridIronVault (capital I — the brand changed from "Grid1ronVault" in October 2026; lowercase ids such as `grid1ronvault.*` localStorage keys, drag types and the old `gridi1ronvault` address keep the old spelling so nothing breaks) — a flag football playbook studio. Logos live in `public/brand/` (icon, horizontal and stacked lockups, shield); app icons and favicons are PNGs rendered from the icon. Coaches draw plays on an SVG canvas, organise them into playbooks, plan games in a spreadsheet-style Season Grid, and export PNG/PDF/wristband cards. Vite + React 19 SPA, a single Netlify Function as the API, Netlify Database (Postgres) via Drizzle, Netlify Identity for auth. Deployed on Netlify. (Formerly "NextPlay"/"Snapline" — those names still appear in localStorage keys; don't rename the keys or existing users lose their data.)

## Commands

```bash
npm ci                 # install
npm run dev            # Vite dev server (frontend only — /api and Identity are not served)
netlify dev            # full stack locally: Vite + functions + Identity (needs Netlify CLI + linked site)
npm run build          # production build to dist/
npx tsc -p .           # typecheck (tsconfig has noEmit; there is no lint or test script)
npm run db:generate    # drizzle-kit: generate a migration from db/schema.ts
npm run griddy:live    # Griddy against the real Claude API with a fixture Vault (needs ANTHROPIC_API_KEY; --dry scores ideal replies, --runs N, --only flip,sheet)
```

There is no test suite, linter, or formatter configured. `npx tsc -p .` and `npm run build` are the checks to run before pushing; the `Checks` workflow (`.github/workflows/ci.yml`) runs both on every PR.

## Architecture

### Local-first data, cloud when signed in
- `src/lib/store.ts` is the app's source of truth: a hand-rolled external store (`useSyncExternalStore`) persisted to `localStorage` under `snapline.workspace.v1`, holding plays, playbooks and call sheets.
- Every save writes to the local store first, then — only if signed in — calls the API and replaces the local record with the server copy (`toStoredPlay`, `remote: true`). Signed-out coaches keep working entirely in the browser. See the save flow in `src/pages/Builder.tsx`.
- `store.mergeRemotePlays` reconciles server rows by `updatedAt` (newer wins).
- Other per-browser stores: `tier.ts` (`nextplay.tier.v1`), `track.ts` (`nextplay.events.v1`), `autofill.ts` (`nextplay.autofill.v1`).

### API (`netlify/functions/api.ts`)
- One function mounted at `/api/*`, hand-routed by path segments `[resource, id, action]`. Resources: `me`, `plays` (incl. `POST plays/:id/copy`), `playbooks` (incl. `POST playbooks/:id/plays`), `call-sheets`, `ai` (`griddy`, `assistant`, `photo`; see Griddy below).
- `PUT /api/plays/:id` only writes the fields it is sent (`sanitisePlayPatch`), so scene-only updates from bulk edits keep the play's name and tags.
- Auth comes from `getUser()` (`@netlify/identity`) server-side; writes are scoped with `ownerId = me.id` in the `WHERE` clause. `ensureProfile` upserts a `profiles` row on first write.
- Errors are returned as `{ error }` with coach-facing wording; `src/lib/api.ts` throws `data.error` so the UI can toast it directly.
- `track()` beacons to `/api/events`; the function stores the three known events for signed-in coaches (`events` table) and answers 204 to everything else.
- Client wrapper: `src/lib/api.ts`. Add a resource by adding a branch in the function and a method on `api`.

### Griddy (the coaching agent)
- Griddy replaced the Play assistant. A coach talks to him from any page: `GriddyProvider` (`src/components/Griddy.tsx`, mounted in `App.tsx`) holds one conversation for the visit, a floating launcher opens the panel everywhere except `/signin` and `/build`, and the Designer has `GriddyComposer variant="bar"` in place of the old assistant bar. The Designer registers its field with `useGriddyDrawer` so "Yes, draw it" drops a play straight on it.
- `src/lib/griddy.ts` is the contract shared by browser and function: turn/action types, `GRIDDY_LIMITS`, the five tools (`draw_play`, `import_plays`, `show_plays`, `bulk_edit`, `build_call_sheet`) and the cached system prompt. Per-message context (page, open play, the coach's terms, a list of Vault plays and playbooks) goes after the coach's latest message as a `role: "system"` message, so the cached prefix stays stable.
- `POST /api/ai/griddy` → `netlify/ai/griddy.ts`: checks the browser-held history, rebuilds it as Claude messages (every `tool_use` gets a `tool_result` saying what the coach did with the card), calls `converse()` and validates every action (`cleanRead` in `netlify/ai/reads.ts`; `show_plays` ids must be in the Vault list sent). Thinking blocks are never replayed, so history edits can't invalidate them.
- Bulk import: Griddy only splits a dump into `{ name, call }` entries. The import card then reads each play through `POST /api/ai/assistant` with `bulk: true` (Haiku, three at a time) and saves with `savePlays` in `src/lib/griddyVault.ts`, which also files them in a named playbook. Nothing is drawn or saved without the coach confirming on a card.
- Bulk edits (`bulk_edit`): Griddy only describes the change and the scope (whole Vault, a playbook by name, or listed plays, optionally narrowed by `filter`: play type, tag or formation). Changes: `style` (any Style card look on players, lines or text, picked by `where`: letter, current color, side, line style; values held to `STYLE_LIMITS`), `wristband` (`bold` is the Designer's Wristband bold via `wristbandBold`, `sideline` thickens routes; the card also sets the Wristbands page preset via `chooseBandPreset`), `meta` (type and tags), `file` (add to or move between playbooks), plus the older recolor, swap (optional new color), route_color, clear_letters, remove_text and mirror (which also swaps Right/Left in the name and formation). The server checks open-ended changes with `cleanOpenChange`/`cleanFilter`; a filter that doesn't parse drops the change rather than widening it. GRIDDY_SYSTEM tells Griddy never to call a style change impossible. `only` narrows a player change to one current color ("the green Xs"), matched by `sameColor`; the context sends `looks` (every letter and color in the Vault) and each play's playbooks so Griddy can name real fills. `src/lib/bulkEdit.ts` works out the plays and players it touches (pure, so the card's preview and the write use the same code); node ids are kept so routes stay attached. The card writes through the store and `api.updatePlay`, edits the open Designer play live via the drawer's `onEdit` (so its next save doesn't overwrite the change), and Undo restores only plays still as the edit left them.
- Call sheets (`build_call_sheet`): Griddy picks Vault plays per situation; the card builds a Season Grid with `gridFromPlays` from `src/lib/sheet.ts` (the same helpers the Season Grid page uses), every row linked to its play.
- Quick picks (`QUICK_PICKS` in `Griddy.tsx`) type a starter into the panel's box via the provider's `prefill`; they never send. A whiteboard photo attached in chat goes to `/upload` (router state `{ photo }`) for the existing photo review.
- Models live in `MODELS` in `netlify/ai/claude.ts` (official `@anthropic-ai/sdk`; key in the `ANTHROPIC_API_KEY` Netlify env var). Griddy's conversation uses server-side refusal fallbacks (`fallbacks: "default"`) and low effort.
- Limits: server daily caps in `DAILY_AI` (`api.ts`: `assistant` counts Griddy messages and single reads, `import` counts bulk-read plays); monthly plan limits in `plan.ts` (`assistantCalls`, gated by `gateAi`, counted per browser in `aiUsage.ts`).
- Griddy's face (`GriddyMascot.tsx`) is the GridIronVault "G" with the football, in a lighter cyan: `public/brand/griddy.webp`. The badge does the Griddy (a CSS bob and tilt) when a play he drew is saved. Don't use NFL footage or a real player's likeness for him.

### Database
- Schema: `db/schema.ts` (Drizzle, Postgres). Client: `db/index.ts` uses `drizzle-orm/netlify-db` — no connection string in code.
- Migrations live in `netlify/database/migrations/` (drizzle-kit output dir). Change the schema, then `npm run db:generate`; never hand-edit generated migrations/snapshots.
- `plays.scene` is JSONB holding the whole editor document; its shape is the `Scene` type, not a DB schema.

### Play editor / scene model
- `src/lib/types.ts` defines `Scene` (`version: 2`, fixed `CANVAS_W`×`CANVAS_H` = 1040×660, `losY`, `nodes`) and the node union: `player | path | shape | text`, all sharing transform fields (x/y/rotation/scale/z/groupId/locked/hidden).
- One scene drives everything: the editor (`components/PlayCanvas.tsx`), thumbnails (`PlayThumb`), and exports. Shared SVG rendering is in `lib/render.tsx` (`NodeLayer`, `MarkerDefs`) and `lib/field.tsx` (field backgrounds per `FieldView`).
- `lib/scene.ts` — pure scene ops (selection, align/distribute/flip, cloning, node factories). Auto-connect paths store `fromId`/`toId`; call `reconcileConnections(scene)` before saving so they stay glued to their tokens.
- `lib/geometry.ts` — transforms and path-data math. `lib/tools.ts` — tool/mode definitions and export sizes. `lib/presets.ts` — position token colors and formation presets. `lib/starters.ts` — the 56 starter plays built as real scene data.
- First read: at most one `PathNode` per play has `firstRead: true`, always drawn in `FIRST_READ` (cyan-2) via `lineColor()`.

### Plans and gating
- `src/lib/plan.ts` owns every entitlement (`TIERS`, `gateSave`, `gateGrid`, `gateSize`, `gateSheets`, `gateTool`, `gateShare`, `cappedDpi`). UI and export both read gates from here — add new limits here, not in components. A `Gate` carries user-facing `reason`/`cta`.
- The account's plan lives in `profiles.plan` (default `beta`) and the API enforces what it can see: Vault size and public copies (`plays`), Season Grids (`call-sheets`), and monthly Griddy/photo use (`ai`), refusing with `{ code: "plan_limit" }` and the gate's own wording. `tier.ts` mirrors it in the browser (`syncPlan` after sign-in; `choosePlan` for the Account/Pricing pickers). During beta coaches switch plans themselves via `PUT /api/me/plan`; set `PLAN_SELF_SERVE=false` when billing takes over. Export sizes, sheets and locked tools happen in the browser, so they're client-side gates only.
- `lib/guard.ts` (`useCaptureGuard`) deters screenshots on paid diagrams; the real protection is watermark + DPI cap in `export.tsx`/`plan.ts`.

### Owner (All-Access Master)
- `netlify/security/owner.ts` decides who the owner is: confirmed Identity emails in its built-in list plus the `OWNER_EMAILS` env var (comma-separated). `api.ts` puts `owner` on the `Session`; `planOf` returns `TIERS.master` for the owner (no limits), `ensureProfile` keeps their `profiles.plan` at `master`, `choosePlan` refuses `master` and refuses the owner, and `spend` never cuts the owner off (it still counts). `master` is not in `PUBLIC_TIERS`. Never gate owner powers on anything the browser sends.

### Owner console (`/admin`)
- `pages/Admin.tsx` (tabs in `pages/admin/`) is hidden from non-owners by `useOwner()`, but the real gate is `me.owner` on `/api/admin/*` (`adminRoute` in `api.ts`; anyone else gets the plain 404). Logic lives in `netlify/admin/` (`admin.ts` users, CSV, audit, `WATCH` thresholds for the abuse flags; `visits.ts` visitor counter). Owner views of one coach's data and every change go through `audit()` into the append-only `audit_log`.
- Signup history = Identity `admin.listUsers` ∪ `profiles` ∪ `account_ledger` (written by `deleteAccount`: email, hashed phone, no plays). `profiles.lastActiveAt` is touched by `ensureProfile` at most every five minutes.
- Visitor counter: `useVisitCounter` (`lib/visits.ts`) beacons `POST /api/visit` (public route, before the phone gate) per page view and every 30 s of visible time; rows in `visits` hold no IP, cookie or user id (visitor = hash of device id + day). DNT/GPC send nothing; the owner's own visits and `/admin` are skipped. This is separate from the three `track()` events.

### Export
`lib/export.tsx`: `PrintDiagram` / `sceneToSvg` is the source for every export and print preview. `lib/printLook.ts` frames a diagram for its printed size (`fit: "play"` crops to the players and routes; `weight` makes lines and tokens heavier, `"auto"` picks it from the size so a 1-inch wristband box doesn't print hairlines; auto tokens never drop below 0.09 in and print as plain dots under 0.11 in, and route tags/text grow to at least 5.5 pt). `frameScene` returns `ptPerUnit`, which turns on print-only drawing: white rings on tokens and white casings under routes (`NodeLayer print`), and a field that leaves off markings too small to read and keeps the lite LOS at half route weight. Zoom never cuts the play off (`keepPlay` slides or grows the box back over every player, curve control point, route tag and text). Yard lines in every field view (`yardLines` in `lib/field.tsx`) run every 5 yards out from the line of scrimmage and carry their distance, so a route's depth reads off the card; print field `"yards"` (the card default) draws just those lines and the LOS. `placeDiagram` draws into jsPDF as vector paths via `svg2pdf.js` (lazy-loaded) when `gateVector` allows, otherwise a PNG at the plan's DPI. `playsToPdf` and the export preview share `pdfSlots`. Wristband cards are `lib/wristbands.ts` (card size: `BAND_SIZES` lists real wristband windows by maker plus custom; columns × rows; numbering incl. "A1, A2" card spots; header/border text with `{role}` `{card}` `{source}` `{count}`, paper or one card per page, cut marks) with `components/BandPreview.tsx` as the drag-to-reorder preview; `tightBoxes` (via `lettersFit` in `printLook.ts`) warns which boxes will print as plain dots, and every sheet carries a 1-inch scale bar so a coach can catch "Fit to page" printing; settings persist in `grid1ronvault.wristbands.v1`. One-click styles are `BAND_PRESETS` (Wristbands page: "Sideline 2×4", "Wristband bold") and `EXPORT_PRESETS` in `ExportDialog.tsx`; a preset is just a partial set of the same settings, so add new ones there. `PrintLook` also takes Playmaker-style `zoom`, `icons`, `lines` and `dots`. PowerPoint export is `lib/pptxExport.ts` (`pptxgenjs`, lazy-loaded); `lib/pptx.ts` is PowerPoint *import*. UI in `components/ExportDialog.tsx`.

### Player links and Griddy Quiz
- A coach shares a playbook from Playbooks → Players (`components/PlayerLink.tsx`): the browser sends a frozen snapshot (`toSnapshot`, `cleanSnapshot` and `SHARE_LIMITS` in `src/lib/share.ts`, re-checked by the function) to `POST /api/shares`, which stores it in `playbook_shares` behind a random token (one link per playbook, keyed by the coach's own playbook id in `source`; sharing again refreshes the plays and keeps the address). Gated by `gateShare`. The snapshot is deliberately a copy, so local-only playbooks and plays share the same way and a player never sees the coach's Vault.
- Players open `/team/:token` (`pages/Team.tsx`, no sign-in, no Shell, no Griddy launcher): `GET /api/shares/:token` and `POST /api/shares/:token/results` are the only public routes and sit before the sign-in and phone checks in `api.ts`. The page reuses `assignmentsFor` (their job spotlighted) and `lib/runPlay.ts` (animation). The Griddy Quiz (`lib/quiz.ts`, pure) builds "which route does the X run?" and "which play is this?" questions from the snapshot, so a coach writes nothing; scores go to `quiz_results` (capped per link, newest kept) and show in the coach's dialog. The letter and name a player picks are remembered in `grid1ronvault.team.v1`.

### League rule lines and talking points
- `lib/rules.ts` holds coach-editable rule distances (`RuleLines`: rush line yards, no-run zone yards; presets such as NFL FLAG 5-on-5), saved in `grid1ronvault.rules.v1`. `RuleLinesLayer` (`lib/field.tsx`) draws them over the field in the Designer, and on prints when `PrintLook.rules` is on (switch in the Export dialog and on the Wristbands page; prints use the saved distances whether or not the Designer overlay is on); the no-run zone shades from the goal line, so it shows on Red zone and Flag views. Distances are editable on purpose: leagues and federations differ, so don't hard-code a rulebook as fact.
- `lib/explain.ts` (`explainPlay`) turns a scene into plain-language talking points per player; the Inspector's "Write the talking points for me" appends them to Coaching notes.

### Game Day
- `/game/:id` (`pages/GameDay.tsx`, `lib/gameDay.ts`) reads a Season Grid on a phone at the sideline: situation chips come from the grid's own Down/Distance/Hash values (a blank cell means "any"), a tap shows the linked play big, "Call it" logs it, and Worked/Stopped marks feed per-call tallies. The log is per device (`grid1ronvault.game.v1`, last 200 calls per grid) and the screen is kept awake with the Wake Lock API where the browser has it. No Shell and no Griddy launcher on this route; styles are the `.gd-*` block in `team.css`.

### Roster
- `lib/roster.ts` keeps letter → player name and jersey number in `grid1ronvault.roster.v1` (this browser only). The Assignments page edits it ("Roster: who wears each letter"), titles each position sheet with the name, and "Print every player" renders one offensive sheet per page (`.asg-sheet`) then prints.

### Practice planner
- `/practice` (`pages/Practice.tsx`, `lib/practice.ts`): one script per browser (`grid1ronvault.practice.v1`) of timed periods, each with Vault plays (single or a whole playbook). "Print script" and "Print scout cards" (one diagram card per play, two per row) render only while printing, then return to the editor. Global print CSS now sets `.shell` to block so printed pages use the full paper width.

### Copy style
- `lib/styleCopy.ts`: Ctrl+Alt+C copies one element's look (colors, weight, size; never labels, points, first read or tags), Ctrl+Alt+V (or "Paste style" in the right-click menu) puts it on every selected element of the same kind and skips locked ones. The copied style is kept in `grid1ronvault.styleclip.v1`.

### Routing and shell
- `src/App.tsx` defines routes; `/build/:id` and `/grid/:id` are deep-linkable, so `netlify.toml` rewrites `/*` → `/index.html`. Placeholder routes come from `COMING_SOON` in `pages/ComingSoon.tsx`.
- When adding a route, also add it to `TITLES` and `NAMES` in `App.tsx` — `RouteChrome` sets `document.title` and announces the page via a live region.
- Signed-in pages wrap content in `components/Shell.tsx` (the shared side menu).
- Auth UI state: `lib/auth.tsx` (`AuthProvider`/`useAuth`). If Identity isn't enabled, `available` is false and the app stays local-only. Map Identity errors through `authMessage()`, never show raw error text.

## Conventions

- **Styling:** plain CSS. Design tokens live only in `src/styles/tokens.css`; `global.css` consumes them. **The Grid1ron Design canvas (https://claude.ai/artifact/6gfQeotou5QDBHLrA4P8vn) is the source of truth** for every screen, color, font and size; the GridIronVault design system artifact is a reference only, and the canvas wins where they differ. Change a value in tokens, not in component styles. Fonts: Saira Condensed, Barlow, IBM Plex Mono (Google Fonts, loaded in `index.html`).
- **Colors in scene data** are hex constants in `types.ts` (`PALETTE`, `FIRST_READ`, `STROKE_WEIGHTS`) and `presets.ts` (position colors: Q black · C cyan · X blue · Y red · Z green · H orange · S light purple), since they are serialised into saved plays and exports.
- **Copy:** user-facing text speaks to "coach", is specific and action-oriented, and never leaks raw library/server errors. `docs/copy-audit.md` records the standard and past fixes.
- **Accessibility:** WCAG 2.1 AA. Reuse `Modal` (focus trap, Escape, `aria-labelledby`), `Tooltip` (`aria-describedby`) and `Panel` (`aria-expanded`) rather than building new ones. `docs/accessibility.md` is the record of what was fixed and why.
- **Analytics:** only three events exist on purpose (`play_created`, `call_sheet_opened`, `play_exported`) — don't add more without a reason.
- **CSP:** `netlify.toml` sets a strict Content-Security-Policy (`script-src 'self'`, `connect-src 'self'`, fonts only from Google). New third-party scripts, fetches or fonts must be added there or they'll be blocked in production.
- `NETLIFY_NEXT_PLUGIN_SKIP=true` in `netlify.toml` is intentional (a leftover account-level Next.js plugin); keep it.
- Work lands in small phase-labelled PRs (e.g. "Phase 1: …") merged into `main`.
