import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { rememberWork } from "../lib/workTabs";
import { Shell } from "../components/Shell";
import { WorkTabs } from "../components/WorkTabs";
import { Icon } from "../components/Icon";
import { BandPreview } from "../components/BandPreview";
import { playNamed, useStore } from "../lib/store";
import type { SheetDoc } from "../lib/store";
import { useTier } from "../lib/tier";
import { cappedDpi, gateSheets, gateVector } from "../lib/plan";
import { useToast } from "../lib/toast";
import { track } from "../lib/track";
import { slug } from "../lib/export";
import { applyFormat, usePlayFormat } from "../lib/playFormat";
import { FIELD_OPTIONS, FIT_OPTIONS, ICON_STEPS, LINE_STEPS, WEIGHT_STEPS, ZOOM_STEPS, type PrintLook } from "../lib/printLook";
import { FormatPanel } from "../components/FormatPanel";
import {
  BAND_CUSTOM_LIMITS,
  BAND_GRIDS,
  BAND_PAPERS,
  BAND_SIZES,
  tightBoxes,
  boxCheck,
  cellType,
  callSheetRows,
  cardsPerPage,
  COACH_SHEETS,
  DEFAULT_BAND_LOOK,
  DEFAULT_NUMBERING,
  defaultBandText,
  duplicateNumbers,
  entryFromPlay,
  gridKey,
  NUMBER_SIZES,
  NUMBERING_MODES,
  numberEntries,
  wristbandSheets,
  type BandCopies,
  type BandEntry,
  type BandNumbering,
  type BandOptions,
  type CoachSheet,
  type BandPaperId,
  type BandSizeId,
  type CellShows,
  type NumberSize,
  type NumberStyle,
  BAND_PREFS_EVENT,
  BAND_PREFS_KEY,
  BAND_PRESETS,
  bestLayout,
} from "../lib/wristbands";
import type { StoredPlay } from "../lib/types";
import "../styles/wristbands.css";

type Source = { id: string; label: string; entries: BandEntry[] };

/** A Call Sheet's calls in order, numbered by its "#" column. */
function gridEntries(sheet: SheetDoc, plays: StoredPlay[]): BandEntry[] {
  const numCol = sheet.columns.find((c) => c.label.trim() === "#");
  const nameCol = sheet.columns.find((c) => /play/i.test(c.label));
  const cell = (r: SheetDoc["rows"][number], label: string) => {
    const col = sheet.columns.find((c) => c.label.trim().toLowerCase() === label);
    return (col && r.cells[col.id]?.trim()) || "";
  };
  return sheet.rows
    .map((r, i) => {
      const typed = (nameCol ? r.cells[nameCol.id]?.trim() : "") || "";
      // A linked row, or a typed name that matches one saved play, prints with its diagram.
      const play = (r.playId ? plays.find((p) => p.id === r.playId) : undefined) ?? playNamed(plays, typed);
      const name = play?.name || typed;
      // Formation and type come from the play, or from the grid's own Group and Run/Pass columns for a typed call.
      const typedType = /^y/i.test(cell(r, "run")) ? "run" : /^y/i.test(cell(r, "pass")) ? "pass" : "";
      return {
        number: (numCol && r.cells[numCol.id]?.trim()) || String(i + 1),
        name,
        scene: play?.scene ?? null,
        formation: play?.formation || cell(r, "group"),
        type: play?.playType || typedType,
      };
    })
    .filter((e) => e.name);
}

/** Card settings a coach sets once for the season, remembered in this browser. */
type BandPrefs = {
  grid: string;
  sizeId: BandSizeId;
  custom: { w: number; h: number };
  shows: CellShows;
  copies: BandCopies;
  look: PrintLook;
  numberSize: NumberSize;
  numberStyle: NumberStyle;
  header: BandOptions["header"];
  footer: string;
  paper: BandPaperId;
  cutMarks: boolean;
  numbering: BandNumbering;
  coachSheet: CoachSheet;
};

const PREFS_KEY = BAND_PREFS_KEY;
const DEFAULT_PREFS: BandPrefs = {
  grid: "4x2",
  sizeId: "flag",
  custom: { w: 4.5, h: 2.5 },
  shows: { diagram: true, name: true, numberOnly: false },
  copies: { qb: 2, center: 1, coach: 1 },
  look: DEFAULT_BAND_LOOK,
  numberSize: "m",
  numberStyle: "tab",
  header: { show: true, ...defaultBandText },
  footer: "",
  paper: "letter",
  cutMarks: false,
  numbering: DEFAULT_NUMBERING,
  coachSheet: "list",
};

function loadPrefs(): BandPrefs {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "null");
    return saved ? { ...DEFAULT_PREFS, ...saved } : DEFAULT_PREFS;
  } catch {
    return DEFAULT_PREFS;
  }
}

/**
 * Wristbands · print builder, from the Grid1ron Design canvas: pick the
 * plays, set the card up, drag the calls into order, print. Numbers match the
 * Call Sheet.
 */
export function Wristbands() {
  const plays = useStore((s) => s.plays);
  const sheets = useStore((s) => s.sheets);
  const playbooks = useStore((s) => s.playbooks);
  const tier = useTier();
  const toast = useToast();
  const headerInput = useRef<HTMLInputElement>(null);

  const sources = useMemo<Source[]>(
    () => [
      ...sheets.map((s) => ({ id: `grid:${s.id}`, label: `Call Sheet · ${s.name}`, entries: gridEntries(s, plays) })),
      ...playbooks.map((b) => ({
        id: `book:${b.id}`,
        label: `Playbook · ${b.name}`,
        entries: b.playIds
          .map((id) => plays.find((p) => p.id === id))
          .filter((p): p is StoredPlay => !!p)
          .map((p, i) => entryFromPlay(p, String(i + 1))),
      })),
    ],
    [sheets, playbooks, plays],
  );

  // "Wristbands" on a Call Sheet opens straight onto that grid.
  const [params] = useSearchParams();
  const [sourceId, setSourceId] = useState<string>(() => {
    const asked = params.get("source");
    return (asked && sources.some((s) => s.id === asked) ? asked : sources[0]?.id) ?? "hand";
  });
  // The work tabs follow the playbook or Call Sheet the cards come from.
  useEffect(() => {
    if (sourceId.startsWith("book:")) rememberWork({ bookId: sourceId.slice(5) });
    else if (sourceId.startsWith("grid:")) rememberWork({ sheetId: sourceId.slice(5) });
  }, [sourceId]);
  const [picked, setPicked] = useState<string[]>([]);
  const [prefs, setPrefs] = useState<BandPrefs>(loadPrefs);
  const [printing, setPrinting] = useState(false);
  const [actualSize, setActualSize] = useState(false);
  // Print order as indexes into the source's entries; reset when the source changes.
  const [order, setOrder] = useState<{ key: string; list: number[] } | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      // Private windows can refuse storage; the settings still work for this visit.
    }
  }, [prefs]);

  useEffect(() => {
    const reload = () => setPrefs(loadPrefs());
    window.addEventListener(BAND_PREFS_EVENT, reload);
    return () => window.removeEventListener(BAND_PREFS_EVENT, reload);
  }, []);

  const set = (patch: Partial<BandPrefs>) => setPrefs((p) => ({ ...p, ...patch }));
  // A preset shows as on while every setting it sets is still as it left it.
  const presetOn = (pre: (typeof BAND_PRESETS)[number]) =>
    (Object.keys(pre.prefs) as (keyof typeof pre.prefs)[]).every((k) => JSON.stringify(prefs[k]) === JSON.stringify(pre.prefs[k]));
  const setLook = (patch: Partial<PrintLook>) => setPrefs((p) => ({ ...p, look: { ...p.look, ...patch } }));

  // "Apply game-day format" (canvas): print every play in the saved play format; the plays themselves don't change.
  const { format, parts } = usePlayFormat();
  const [gameDay, setGameDay] = useState(false);

  const source = sources.find((s) => s.id === sourceId);
  const raw: BandEntry[] = source
    ? source.entries
    : picked
        .map((id) => plays.find((p) => p.id === id))
        .filter((p): p is StoredPlay => !!p)
        .map((p, i) => entryFromPlay(p, String(i + 1)));
  const formatted: BandEntry[] =
    gameDay && format && parts.length ? raw.map((e) => (e.scene ? { ...e, scene: applyFormat(e.scene, format, parts) } : e)) : raw;
  const orderKey = `${sourceId}:${source ? "" : picked.join(",")}:${raw.length}`;
  const list = order?.key === orderKey ? order.list : formatted.map((_, i) => i);
  const moved = order?.key === orderKey;

  function move(from: number, to: number) {
    if (to < 0 || to >= list.length) return;
    const next = [...list];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setOrder({ key: orderKey, list: next });
  }

  const sourceName = source ? source.label.replace(/^[^·]+·\s*/, "") : "Hand-picked";
  const grid = BAND_GRIDS.find((g) => gridKey(g) === prefs.grid) ?? BAND_GRIDS[5];
  const perCard = grid.cols * grid.rows;
  // Numbers are worked out on the print order, so they follow a box when it's dragged.
  const entries = numberEntries(
    list.map((i) => formatted[i]),
    prefs.numbering,
    perCard,
  );
  const dupes = duplicateNumbers(entries);
  const sheetRows = callSheetRows(entries, perCard);
  const cards = Math.max(1, Math.ceil(entries.length / perCard));
  const preset = BAND_SIZES.find((b) => b.id === prefs.sizeId) ?? BAND_SIZES[0];
  const clampIn = (v: number) => Math.min(BAND_CUSTOM_LIMITS.max, Math.max(BAND_CUSTOM_LIMITS.min, v || BAND_CUSTOM_LIMITS.min));
  const card = preset.id === "custom" ? { w: clampIn(prefs.custom.w), h: clampIn(prefs.custom.h) } : { w: preset.w, h: preset.h };
  const best = bestLayout(card);
  const bestOn = (Object.keys(best.prefs) as (keyof typeof best.prefs)[]).every((k) => JSON.stringify(prefs[k]) === JSON.stringify(best.prefs[k]));
  const gate = gateSheets(tier);
  const vector = gateVector(tier).ok;

  const options: BandOptions = {
    card,
    grid,
    shows: prefs.shows,
    look: prefs.look,
    numberSize: prefs.numberSize,
    numberStyle: prefs.numberStyle,
    header: prefs.header,
    footer: prefs.footer,
    paper: prefs.paper,
    cutMarks: prefs.cutMarks,
    copies: prefs.copies,
    coachSheet: prefs.coachSheet,
    source: sourceName,
    watermark: tier.watermark ? "GRIDIRONVAULT" : null,
    dpi: cappedDpi(tier, 600),
    vector,
  };
  const tight = tightBoxes(entries, options);
  const boxes = boxCheck(options);
  const type = cellType(options);
  const printed = cards * (prefs.copies.qb + prefs.copies.center);
  const pages = prefs.paper === "card" ? printed : Math.ceil(printed / cardsPerPage(options));

  async function print(sheetOnly = false) {
    if (!gate.ok || !entries.length) return;
    setPrinting(true);
    try {
      // The call sheet on its own is the coach copy with no wristband cards.
      const opts = sheetOnly ? { ...options, copies: { qb: 0, center: 0, coach: 1 } } : options;
      const doc = await wristbandSheets(entries, opts);
      doc.save(`${slug(`${sheetOnly ? "call-sheet" : "wristbands"}-${sourceName}`)}.pdf`);
      track("play_exported", { kind: sheetOnly ? "call_sheet" : "wristband" });
      toast(
        sheetOnly
          ? "Call sheet downloaded. Its numbers match the wristband cards as they're set up now."
          : "Wristband cards downloaded. Print at 100% scale (Actual size), then cut along the borders.",
      );
    } catch {
      toast("The wristband PDF could not be built. Try again, or pick fewer plays.");
    } finally {
      setPrinting(false);
    }
  }

  const setNumbering = (patch: Partial<BandNumbering>) => setPrefs((p) => ({ ...p, numbering: { ...p.numbering, ...patch } }));

  const setCopy = (k: keyof BandCopies, v: number) =>
    setPrefs((p) => ({ ...p, copies: { ...p.copies, [k]: Math.max(0, Math.min(10, v)) } }));

  return (
    <Shell
      title="Wristbands"
      tabs={<WorkTabs current="wristbands" />}
      actions={
        <Link to="/grid" className="btn btn-ghost btn-sm">
          <Icon name="table" size={15} /> Call Sheet
        </Link>
      }
    >
      <div className="wb">
        <div className="wb-head">
          <div>
            <p className="eyebrow">Print</p>
            <h2>Wristbands</h2>
            <p className="wb-lede">
              Pick the plays, set up the card, then drag the calls into order. Numbers match your Call Sheet so the call from
              the sideline is the box on the wrist.
            </p>
          </div>
          <div className="wb-head-actions">
            <button type="button" className="btn btn-ghost" onClick={() => print(true)} disabled={printing || !entries.length || !gate.ok}>
              <Icon name="table" size={15} /> Download call sheet
            </button>
            <button type="button" className="btn btn-primary" onClick={() => print()} disabled={printing || !entries.length || !gate.ok}>
              <Icon name="print" size={15} /> {printing ? "Building cards…" : "Print cards"}
            </button>
          </div>
        </div>
        {!gate.ok && (
          <p className="wb-gate" role="note">
            {gate.reason}{" "}
            <Link to="/pricing">{gate.cta}</Link>
          </p>
        )}

        <div className="wb-body">
          <div className="wb-controls card">
            <div className="wb-field" role="group" aria-labelledby="wb-presets">
              <span id="wb-presets">One-click styles</span>
              <div className="chip-row">
                {BAND_PRESETS.map((pre) => (
                  <button
                    key={pre.id}
                    type="button"
                    className={`chip${presetOn(pre) ? " is-on" : ""}`}
                    aria-pressed={presetOn(pre)}
                    title={pre.hint}
                    onClick={() => set(pre.prefs)}
                  >
                    {pre.label}
                  </button>
                ))}
                <button
                  type="button"
                  className={`chip${bestOn ? " is-on" : ""}`}
                  aria-pressed={bestOn}
                  title={best.why}
                  onClick={() => set(best.prefs)}
                >
                  Best for this card
                </button>
              </div>
              <p className="wb-note">
                Pick a style, then fine-tune anything below. Your card size stays as it is. Best for this card: {best.why}.
              </p>
            </div>

            <label className="wb-field">
              <span>Pull plays from</span>
              <select className="select" value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
                {sources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
                <option value="hand">Pick plays by hand</option>
              </select>
            </label>

            {sourceId === "hand" && (
              <div className="wb-pick" role="group" aria-label="Plays to print">
                {plays.length === 0 && <p className="hint">Your Vault is empty. Draw a play or copy a starter first.</p>}
                {plays.map((p) => (
                  <label key={p.id} className="switch">
                    <input
                      type="checkbox"
                      checked={picked.includes(p.id)}
                      onChange={(e) => setPicked((l) => (e.target.checked ? [...l, p.id] : l.filter((x) => x !== p.id)))}
                    />
                    {p.name || "Untitled play"}
                  </label>
                ))}
              </div>
            )}

            <div className="wb-field" role="group" aria-labelledby="wb-numbering">
              <span id="wb-numbering">Numbering</span>
              <div className="chip-row">
                {NUMBERING_MODES.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className={`chip${prefs.numbering.mode === m.id ? " is-on" : ""}`}
                    aria-pressed={prefs.numbering.mode === m.id}
                    title={m.hint}
                    onClick={() => setNumbering({ mode: m.id })}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              {prefs.numbering.mode !== "source" && prefs.numbering.mode !== "spot" && (
                <label className="wb-sub">
                  {prefs.numbering.mode === "card" ? "First card starts at" : "Start at"}
                  <input
                    className="input"
                    type="number"
                    min={prefs.numbering.mode === "card" ? 1 : 0}
                    max={999}
                    value={prefs.numbering.start}
                    onChange={(e) => setNumbering({ start: Math.max(0, Math.min(999, Math.floor(Number(e.target.value)) || 0)) })}
                  />
                </label>
              )}
              <p className="wb-note">
                {NUMBERING_MODES.find((m) => m.id === prefs.numbering.mode)?.hint}
                {entries.length > 0 && ` Your calls run ${sheetRows[0]?.number} to ${sheetRows[sheetRows.length - 1]?.number}.`}
              </p>
              {dupes.length > 0 && (
                <p className="wb-warn" role="alert">
                  {dupes.length === 1 ? `Number ${dupes[0]} is` : `Numbers ${dupes.slice(0, 5).join(", ")}${dupes.length > 5 ? "…" : ""} are`} on
                  more than one box. Fix the # column in your Call Sheet, or pick "1, 2, 3 in print order" or "By card".
                </p>
              )}
            </div>

            <div className="wb-field" role="group" aria-labelledby="wb-card-size">
              <span id="wb-card-size">Card size</span>
              <select
                className="select"
                aria-labelledby="wb-card-size"
                value={prefs.sizeId}
                onChange={(e) => set({ sizeId: e.target.value as BandSizeId })}
              >
                {BAND_SIZES.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.id === "custom" ? "Custom: type my window size" : `${b.label} · ${b.w.toFixed(2)} × ${b.h.toFixed(2)} in`}
                  </option>
                ))}
              </select>
              {preset.id === "custom" && (
                <div className="wb-dims">
                  <label>
                    Width
                    <input
                      className="input"
                      type="number"
                      step={0.05}
                      min={BAND_CUSTOM_LIMITS.min}
                      max={BAND_CUSTOM_LIMITS.max}
                      value={prefs.custom.w}
                      onChange={(e) => set({ custom: { ...prefs.custom, w: Number(e.target.value) } })}
                    />
                  </label>
                  <span aria-hidden="true">×</span>
                  <label>
                    Height
                    <input
                      className="input"
                      type="number"
                      step={0.05}
                      min={BAND_CUSTOM_LIMITS.min}
                      max={BAND_CUSTOM_LIMITS.max}
                      value={prefs.custom.h}
                      onChange={(e) => set({ custom: { ...prefs.custom, h: Number(e.target.value) } })}
                    />
                  </label>
                  <span>in</span>
                </div>
              )}
              <p className="wb-note">{preset.note}</p>
            </div>

            <div className="wb-field" role="group" aria-labelledby="wb-grid">
              <span id="wb-grid">Plays per card (columns × rows)</span>
              <div className="chip-row">
                {BAND_GRIDS.map((g) => (
                  <button
                    key={gridKey(g)}
                    type="button"
                    className={`chip${gridKey(g) === gridKey(grid) ? " is-on" : ""}`}
                    aria-pressed={gridKey(g) === gridKey(grid)}
                    aria-label={`${g.cols * g.rows} plays, ${g.cols} across and ${g.rows} down`}
                    onClick={() => set({ grid: gridKey(g) })}
                  >
                    {g.cols * g.rows} <small>{g.cols}×{g.rows}</small>
                  </button>
                ))}
              </div>
              <p className="wb-note">
                Each box prints {(card.w / grid.cols).toFixed(2)} × {((card.h - (prefs.header.show ? 0.2 : 0) - (prefs.footer.trim() ? 0.16 : 0)) / grid.rows).toFixed(2)} in.
                {card.w / grid.cols < 1.2 && " That's tight for a diagram; fewer plays per card prints bigger."}
              </p>
              {!boxes.readable && (
                <p className="wb-warn" role="status">
                  Each diagram gets {boxes.art.w.toFixed(2)} × {boxes.art.h.toFixed(2)} in, too small to draw a play clearly. Drawings are scaled down
                  with the box, but a box this short stays crowded.{" "}
                  {boxes.better ? (
                    <>
                      {boxes.better.cols}×{boxes.better.rows} gives {boxes.better.art.w.toFixed(2)} × {boxes.better.art.h.toFixed(2)} in and{" "}
                      {boxes.better.cols * boxes.better.rows} plays a card.{" "}
                      <button type="button" className="link" onClick={() => set({ grid: gridKey(boxes.better!) })}>
                        Use {boxes.better.cols}×{boxes.better.rows}
                      </button>
                    </>
                  ) : (
                    "Pick a bigger card size to fit more plays."
                  )}
                </p>
              )}
              {tight.length > 0 && (
                <p className="wb-warn" role="status">
                  {tight.length === 1 ? `Box ${tight[0]} is` : `Boxes ${tight.slice(0, 6).join(", ")}${tight.length > 6 ? "…" : ""} are`} too
                  small to letter the players, so {tight.length === 1 ? "it prints" : "they print"} as colored dots. Pick fewer plays per card or a
                  bigger card to keep the letters.
                </p>
              )}
            </div>

            <div className="wb-field" role="group" aria-labelledby="wb-look">
              <span id="wb-look">Diagram</span>
              <div className="chip-row">
                {FIT_OPTIONS.map((f) => (
                  <button key={f.id} type="button" className={`chip${prefs.look.fit === f.id ? " is-on" : ""}`} aria-pressed={prefs.look.fit === f.id} title={f.hint} onClick={() => setLook({ fit: f.id })}>
                    {f.label}
                  </button>
                ))}
              </div>
              <label className="wb-sub">
                Line and player weight
                <select
                  className="select"
                  value={String(prefs.look.weight)}
                  onChange={(e) => setLook({ weight: e.target.value === "auto" ? "auto" : Number(e.target.value) })}
                >
                  {WEIGHT_STEPS.map((w) => (
                    <option key={String(w)} value={String(w)}>
                      {w === "auto" ? "Auto, sized for the box" : w === 1 ? "As drawn (1×)" : `${w}× heavier`}
                    </option>
                  ))}
                </select>
              </label>
              <label className="wb-sub">
                Field
                <select className="select" value={prefs.look.field} onChange={(e) => setLook({ field: e.target.value as PrintLook["field"] })}>
                  {FIELD_OPTIONS.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </label>
              {(
                [
                  ["Zoom", "zoom", ZOOM_STEPS.map((z) => ({ value: z, label: `${Math.round(z * 100)}%` }))],
                  ["Player icons", "icons", ICON_STEPS],
                  ["Route lines", "lines", LINE_STEPS],
                ] as const
              ).map(([title, key, steps]) => (
                <div key={key} className="wb-sub" role="group" aria-label={title}>
                  {title}
                  <div className="chip-row">
                    {steps.map((st) => {
                      const on = (prefs.look[key] ?? 1) === st.value;
                      return (
                        <button key={st.value} type="button" className={`chip${on ? " is-on" : ""}`} aria-pressed={on} onClick={() => setLook({ [key]: st.value })}>
                          {st.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              <label className="switch">
                <input type="checkbox" checked={!!prefs.look.dots} onChange={(e) => setLook({ dots: e.target.checked })} />
                Solid dots, no letters
              </label>
              <label className="switch">
                <input type="checkbox" checked={!!prefs.look.depths} onChange={(e) => setLook({ depths: e.target.checked })} />
                Yards at each route break
              </label>
              <label className="switch">
                <input type="checkbox" checked={!!prefs.look.rules} onChange={(e) => setLook({ rules: e.target.checked })} />
                League rush line and no-run zone
              </label>
            </div>

            <div className="wb-field" role="group" aria-labelledby="wb-shows">
              <span id="wb-shows">Each box shows</span>
              <label className="switch">
                <input type="checkbox" checked={prefs.shows.diagram && !prefs.shows.numberOnly} disabled={prefs.shows.numberOnly} onChange={(e) => set({ shows: { ...prefs.shows, diagram: e.target.checked } })} />
                Diagram
              </label>
              <label className="switch">
                <input type="checkbox" checked={prefs.shows.name} onChange={(e) => set({ shows: { ...prefs.shows, name: e.target.checked } })} />
                Play name
              </label>
              <label className="switch">
                <input type="checkbox" checked={prefs.shows.numberOnly} onChange={(e) => set({ shows: { ...prefs.shows, numberOnly: e.target.checked } })} />
                Number only (no diagram)
              </label>
              <label className="wb-sub">
                Number style
                <select className="select" value={prefs.numberStyle} onChange={(e) => set({ numberStyle: e.target.value as NumberStyle })}>
                  <option value="tab">Dark tab, name beside it</option>
                  <option value="band">Gray strip across the top</option>
                </select>
              </label>
              <label className="wb-sub">
                Number size
                <select className="select" value={prefs.numberSize} onChange={(e) => set({ numberSize: e.target.value as NumberSize })}>
                  {(Object.keys(NUMBER_SIZES) as NumberSize[]).map((k) => (
                    <option key={k} value={k}>
                      {k === "s" ? "Small" : k === "m" ? "Medium" : "Large"} ({NUMBER_SIZES[k]} pt)
                    </option>
                  ))}
                </select>
              </label>
              {type.numPt < NUMBER_SIZES[prefs.numberSize] && (
                <p className="wb-note">
                  Numbers print at {Math.round(type.numPt * 10) / 10} pt in these boxes, so the strip never crowds out the play.
                </p>
              )}
            </div>

            <div className="wb-field" role="group" aria-labelledby="wb-text">
              <span id="wb-text">Header and border text</span>
              <label className="switch">
                <input type="checkbox" checked={prefs.header.show} onChange={(e) => set({ header: { ...prefs.header, show: e.target.checked } })} />
                Print a header band
              </label>
              {prefs.header.show && (
                <>
                  <label className="wb-sub">
                    Header, left
                    <input ref={headerInput} className="input" value={prefs.header.left} onChange={(e) => set({ header: { ...prefs.header, left: e.target.value } })} />
                  </label>
                  <label className="wb-sub">
                    Header, right
                    <input className="input" value={prefs.header.right} onChange={(e) => set({ header: { ...prefs.header, right: e.target.value } })} />
                  </label>
                </>
              )}
              <label className="wb-sub">
                Bottom border
                <input className="input" placeholder="e.g. Mid TN Blue · Fall 2026" value={prefs.footer} onChange={(e) => set({ footer: e.target.value })} />
              </label>
              <p className="wb-note">
                {"{role}"} prints QB or Center, {"{card}"} the card letter, {"{source}"} the grid or playbook name and {"{count}"} the
                number of plays.{" "}
                <button type="button" className="btn btn-quiet btn-sm" onClick={() => set({ header: { ...prefs.header, ...defaultBandText } })}>
                  Reset header
                </button>
              </p>
            </div>

            <div className="wb-field" role="group" aria-labelledby="wb-paper">
              <span id="wb-paper">Paper</span>
              <select className="select" aria-labelledby="wb-paper" value={prefs.paper} onChange={(e) => set({ paper: e.target.value as BandPaperId })}>
                {BAND_PAPERS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.id === "card" ? "One card per page (print shop, card stock)" : `${p.label} sheet, ${p.w} × ${p.h} in`}
                  </option>
                ))}
              </select>
              {prefs.paper !== "card" && (
                <label className="switch">
                  <input type="checkbox" checked={prefs.cutMarks} onChange={(e) => set({ cutMarks: e.target.checked })} />
                  Corner cut marks
                </label>
              )}
            </div>

            <div className="wb-field" role="group" aria-labelledby="wb-copies">
              <span id="wb-copies">Copies</span>
              {(
                [
                  ["qb", "QB wristbands"],
                  ["center", "Center wristbands"],
                  ["coach", "Coach sheet"],
                ] as const
              ).map(([k, label]) => (
                <div key={k} className="wb-copy">
                  <span>{label}</span>
                  <button type="button" onClick={() => setCopy(k, prefs.copies[k] - 1)} aria-label={`Fewer ${label}`}>
                    −
                  </button>
                  <b aria-live="polite">×{prefs.copies[k]}</b>
                  <button type="button" onClick={() => setCopy(k, prefs.copies[k] + 1)} aria-label={`More ${label}`}>
                    +
                  </button>
                </div>
              ))}
              <label className="wb-sub">
                Coach sheet prints
                <select className="select" value={prefs.coachSheet} onChange={(e) => set({ coachSheet: e.target.value as CoachSheet })}>
                  {COACH_SHEETS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.id === "list"
                        ? "Call list: number, play, formation, type, card"
                        : c.id === "diagrams"
                          ? "Diagrams: every call with its picture and notes"
                          : "Both: the call list, then the diagrams"}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="wb-field">
              <label className="switch">
                <input type="checkbox" checked={gameDay && !!format} disabled={!format} onChange={(e) => setGameDay(e.target.checked)} />
                Apply game-day format
              </label>
              {format ? (
                gameDay && <FormatPanel />
              ) : (
                <p className="wb-note">Save a play's format in the Designer (Saved play format) to print every card in the same look.</p>
              )}
            </div>
          </div>

          <div className="wb-preview">
            {entries.length === 0 ? (
              <div className="empty">
                <Icon name="wristband" size={40} />
                <h3>No plays to print yet</h3>
                <p>
                  {sources.length === 0
                    ? "Build a Call Sheet or a playbook, or pick plays by hand from your Vault."
                    : "This source has no calls with a play name. Pick another, or pick plays by hand."}
                </p>
                <Link to="/grid" className="btn btn-ghost">
                  Open the Call Sheet
                </Link>
              </div>
            ) : (
              <>
                <div className="wb-preview-bar">
                  <p className="eyebrow">Print preview</p>
                  <label className="switch">
                    <input type="checkbox" checked={actualSize} onChange={(e) => setActualSize(e.target.checked)} />
                    Actual size
                  </label>
                  {moved && (
                    <button type="button" className="btn btn-quiet btn-sm" onClick={() => setOrder(null)}>
                      <Icon name="undo" size={13} /> Original order
                    </button>
                  )}
                </div>
                <p className="wb-note">Drag a box to move the call, or use the arrows. Click the header to edit its text.</p>
                <BandPreview
                  entries={entries}
                  options={options}
                  actualSize={actualSize}
                  onMove={move}
                  onEditHeader={() => headerInput.current?.focus()}
                />
                <p className="wb-summary">
                  {entries.length} {entries.length === 1 ? "play" : "plays"} · {cards} {cards === 1 ? "card" : "cards"} · prints {printed}{" "}
                  wristband {printed === 1 ? "card" : "cards"} on {pages} {pages === 1 ? "page" : "pages"}
                  {prefs.copies.coach ? `, plus ${prefs.copies.coach} coach ${prefs.copies.coach === 1 ? "sheet" : "sheets"}` : ""}.
                  {vector ? " Diagrams print as sharp vector lines." : ` Diagrams print at ${options.dpi} DPI.`}
                  {entries.some((e) => !e.scene) && " Calls without a linked play print as a number."}
                </p>

                <section className="wb-sheet" aria-labelledby="wb-sheet-title">
                  <div className="wb-preview-bar">
                    <p className="eyebrow" id="wb-sheet-title">
                      Coach's call sheet
                    </p>
                    <button type="button" className="btn btn-quiet btn-sm" onClick={() => print(true)} disabled={printing || !gate.ok}>
                      <Icon name="download" size={13} /> Download
                    </button>
                  </div>
                  <div className="wb-sheet-scroll">
                    <table className="wb-sheet-table">
                      <thead>
                        <tr>
                          <th scope="col">#</th>
                          <th scope="col">Play</th>
                          <th scope="col">Formation</th>
                          <th scope="col">Type</th>
                          <th scope="col">Card</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sheetRows.map((r, i) => (
                          <tr key={`${r.spot}-${i}`} className={dupes.includes(r.number) ? "is-dupe" : undefined}>
                            <td className="wb-sheet-num">{r.number}</td>
                            <td>{r.name}</td>
                            <td>{r.formation || "—"}</td>
                            <td>{r.type || "—"}</td>
                            <td className="wb-sheet-spot">{r.spot}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </>
            )}
          </div>
        </div>
      </div>
    </Shell>
  );
}
