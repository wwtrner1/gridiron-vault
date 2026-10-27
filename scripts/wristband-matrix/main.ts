/**
 * Browser half of the size matrix: builds a wristband PDF for each case with
 * the app's own code and hands the bytes back to run.mjs. Not shipped in the app.
 */
import { checkBands, expectedCardPages, expectedPageSize } from "../../src/lib/bandCheck";
import { BAND_PRESETS, bestLayout, BAND_SIZES, DEFAULT_BAND_LOOK, defaultBandText, entriesFromPlays, numberEntries, wristbandSheets, type BandOptions } from "../../src/lib/wristbands";
import { STARTERS, starterMeta, starterScene } from "../../src/lib/starters";
import type { StoredPlay } from "../../src/lib/types";

const plays = STARTERS.slice(0, 16).map((s, i) => ({ ...starterMeta(s), id: `s${i}`, scene: starterScene(s) }) as unknown as StoredPlay);

type Case = { id: string; size: string; grid: string; preset?: string; paper?: BandOptions["paper"]; plays?: number; num?: BandOptions["numberSize"] };
const CASES: Case[] = [
  { id: "teen-8up-sheet", size: "large", grid: "4x2" },
  { id: "teen-single-pages", size: "large", grid: "3x2", paper: "card" },
  { id: "sideline-2x4", size: "large", grid: "4x2", preset: "sideline" },
  { id: "bold-3x2", size: "large", grid: "3x2", preset: "bold" },
  { id: "flag-4x3", size: "flag", grid: "4x3" },
  { id: "flag-3x2", size: "flag", grid: "3x2" },
  { id: "youth-3x2", size: "fpc-youth", grid: "3x2" },
  { id: "adult-4x3", size: "fpc-adult", grid: "4x3" },
  { id: "midtn-3x2", size: "custom", grid: "3x2" },
  // "Best for this card" on each real window, so a change to the rule shows up on paper.
  { id: "best-flag", size: "flag", grid: "best" },
  { id: "best-teen", size: "large", grid: "best" },
  { id: "best-youth", size: "fpc-youth", grid: "best" },
  { id: "best-adult", size: "fpc-adult", grid: "best" },
  // Large numbers in small boxes: the strip shrinks with the box so the play keeps its room.
  { id: "youth-4x3-large", size: "fpc-youth", grid: "4x3", num: "l" },
  { id: "teen-4x3-large", size: "large", grid: "4x3", num: "l" },
  { id: "adult-5x2-large", size: "fpc-adult", grid: "5x2", num: "l" },
];

function build(c: Case): { opts: BandOptions; entries: ReturnType<typeof entriesFromPlays> } {
  const size = c.id.startsWith("midtn") ? { w: 4.45, h: 2.45 } : BAND_SIZES.find((s) => s.id === c.size)!;
  const best = c.grid === "best" ? bestLayout(size) : null;
  const [cols, rows] = (best?.grid ?? c.grid).split("x").map(Number);
  const preset = best?.prefs ?? BAND_PRESETS.find((p) => p.id === c.preset)?.prefs;
  const opts: BandOptions = {
    card: { w: size.w, h: size.h },
    grid: { cols, rows },
    shows: preset?.shows ?? { diagram: true, name: false, numberOnly: false },
    look: preset?.look ?? DEFAULT_BAND_LOOK,
    numberSize: c.num ?? preset?.numberSize ?? "m",
    numberStyle: preset?.numberStyle ?? "band",
    header: preset?.header ?? { show: true, ...defaultBandText },
    footer: "",
    paper: c.paper ?? "letter",
    cutMarks: true,
    copies: { qb: 1, center: 0, coach: 0 },
    coachSheet: "list",
    source: "Matrix",
    watermark: null,
    dpi: 300,
    vector: true,
  };
  const entries = numberEntries(entriesFromPlays(plays.slice(0, c.plays ?? 16)), { mode: "spot", start: 1 }, cols * rows);
  return { opts, entries };
}

(window as any).runCase = async (id: string) => {
  const c = CASES.find((x) => x.id === id)!;
  const { opts, entries } = build(c);
  const doc = await wristbandSheets(entries, opts);
  const b64 = doc.output("datauristring").split(",")[1];
  return { b64, issues: checkBands(entries, opts), pages: expectedCardPages(entries, opts), page: expectedPageSize(opts), card: opts.card };
};
(window as any).caseIds = CASES.map((c) => c.id);
(window as any).ready = true;
