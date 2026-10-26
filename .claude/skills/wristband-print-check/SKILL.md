---
name: wristband-print-check
description: Check wristband PDF output at every card size after changing lib/wristbands.ts, printLook.ts, field.tsx or export.tsx.
---

# Wristband print check

Wristband cards are judged by whether a player can read them at real size, so
look at the output at real size, never on screen zoom.

1. `npm ci` if `node_modules` is missing, then `npm run bands:matrix` (add `-- --out <dir>` to choose where files go; default `out/wristband-matrix/`, git-ignored).
2. It builds one PDF per case with the app's own `wristbandSheets` (teen 8-up, single cards, Sideline 2×4, Wristband bold, NFL Flag 4×3 and 3×2, Youth, Adult, Mid TN Blue custom 4.45×2.45) and checks page count and page size against `expectedCardPages` / `expectedPageSize` in `src/lib/bandCheck.ts`. Exit code 1 means a case failed.
3. `!` lines are the same warnings coaches see (box too small, players printing as plain dots). They are expected on cramped grids such as Flag 4×3; a new `!` on a case that was clean is a regression.
4. Open the 200 dpi PNGs it writes (`<case>-1.png`) and look at routes, tags, number strips and the 1-inch scale bar. If the bar is not 1 inch on a printout, the printer scaled the page.
5. Labelled plays (Route Tree 0–5, first starters) are the overlap test: no two route tags or text labels should touch in a box. Printed labels never go below 5.5 pt, so `dropCrowdedTags` in `printLook.ts` leaves off the later ones that would cover an earlier label.
6. Add a case in `scripts/wristband-matrix/main.ts` when a new card size or preset ships.

Needs Playwright with Chromium (global at `/opt/node22/lib/node_modules/playwright` in cloud sessions) and poppler (`pdfinfo`, `pdftoppm`).
