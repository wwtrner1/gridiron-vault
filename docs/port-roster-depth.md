# Porting roster columns and the depth chart field view (LaxVault, Hoops, OnDeck)

GridIronVault shipped these on 2026-11-13 (Wes's notes 2 and 3). The other Vaults began as copies of this repo, so their roster and depth chart files have the same names. Port in this order.

## 1. Roster columns, your own fields, typing in the table

Copy as is (no football in them):
- `src/lib/rosterView.ts` (per-team view in `localStorage`, key `<sport>.rosterview.v1`; rename the key prefix to the Vault's own).
- `src/lib/rosterColumns.ts`. Change only `ROSTER_COLUMNS`: keep `player` fixed and the guardian, phone, email and sizes columns; swap the sport fields (lacrosse: stick hand, faceoff; basketball: height first, wingspan; baseball/softball: bats/throws, primary and secondary position).

Edit:
- `src/lib/teamHub.ts`: add `custom: Record<string, string>` to `PlayerInfo`, `custom: {}` to `emptyPlayer`, `CUSTOM_LIMITS`, `customName`, `cleanCustom` and `custom: cleanCustom(r.custom)` in `cleanPlayer`; `rosterCsv(players, customFields)`; `playersFromRows(rows, customFields)` with the `{ custom }` column. The API already stores `info` JSONB through `cleanPlayer`, so no migration.
- `src/pages/frontOffice/RosterTab.tsx`: the `view`/`columns`/`editCell` block, the toolbar's Columns and Edit in the table buttons, `ColumnsPanel`, `ReadCell`, `EditCell`, `CellInput`, the header hide buttons and the Remove field `Confirm`. `ReadCell`'s switch lists column ids: match the Vault's columns.
- `src/styles/frontOffice.css`: the "Roster columns and typing in the table" block.
- `src/lib/guides.ts`: the "Columns and Edit in the table" step.

## 2. Depth chart: On the field

- Copy `src/lib/depthField.ts` and replace the three role tables with the sport's spots (percent of the box, x across, y down):
  - Lacrosse (10 a side): G in the crease, 3 D around it, 3 middies at the midline, 3 A around the far crease; FOGO at the X on the midline. Units: offense (attack + middies), defense (D, LSM, G), special (man-up, man-down, faceoff).
  - Basketball (5): PG top of the key, SG and SF on the wings, PF and C on the blocks; a court picture instead of turf (change `.hub-field`'s background to a half court).
  - Baseball/softball (9): the diamond. P, C, 1B, 2B, SS, 3B, LF, CF, RF; units become defense, lineup (batting order list, no field) and pitchers. `LOS_Y` becomes the base path: draw a diamond in `.hub-field` instead of the line.
- `src/lib/teamHub.ts`: `DepthSlot.at` and its check in `cleanDepth`.
- `src/pages/frontOffice/DepthTab.tsx`: the `look` switch (List / On the field), `DepthField`, and the bench hint. Keep the token's words in `data-text` (drawn by CSS) so axe's label-content rule passes.
- CSS: the "Depth chart on the field" block.

## Tests
Copy `tests/roster-columns.spec.ts` and change the seeded players, spot names and the expected spot order (QB behind Center becomes, say, G inside the crease).
