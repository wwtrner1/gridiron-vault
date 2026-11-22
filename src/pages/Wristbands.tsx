import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { onboarding } from "../lib/onboarding";
import { Link, useSearchParams } from "react-router-dom";
import { rememberWork } from "../lib/workTabs";
import { Shell } from "../components/Shell";
import { WorkTabs } from "../components/WorkTabs";
import { Icon } from "../components/Icon";
import { BandPreview } from "../components/BandPreview";
import { Modal } from "../components/Modal";
import { Panel, PanelGroup } from "../components/Panel";
import { PlayThumb } from "../components/PlayThumb";
import { lazyPage } from "../lib/lazyPage";
import { playNamed, store, useStore } from "../lib/store";
import type { SheetDoc } from "../lib/store";
import { useTier } from "../lib/tier";
import { cappedDpi, gateSheets, gateVector } from "../lib/plan";
import { useToast } from "../lib/toast";
import { track } from "../lib/track";
import { slug } from "../lib/export";
import { applyFormat, usePlayFormat } from "../lib/playFormat";
import { FIELD_OPTIONS, FIT_OPTIONS, ICON_STEPS, LINE_STEPS, WEIGHT_STEPS, ZOOM_STEPS, matchLook, type PrintLook } from "../lib/printLook";
import { FormatPanel } from "../components/FormatPanel";
import {
  BAND_COLOR_PRESETS,
  BAND_CUSTOM_LIMITS,
  BAND_GRIDS,
  bandCutOffs,
  bandPalette,
  diagramBox,
  BAND_PAPERS,
  BAND_SIZES,
  tightBoxes,
  boxCheck,
  cellType,
  callSheetRows,
  cardsPerPage,
  COACH_SHEETS,
  duplicateNumbers,
  entryFromPlay,
  gridByKey,
  gridKey,
  gridLabel,
  perCardOf,
  NUMBER_SIZES,
  NUMBERING_MODES,
  numberEntries,
  wristbandSheets,
  type BandColors,
  type BandCopies,
  type BandEntry,
  type BandNumbering,
  type BandOptions,
  type CoachSheet,
  type BandPaperId,
  type BandSizeId,
  type NumberSize,
  type NumberStyle,
  type NumberInk,
  type CardBorder,
  BAND_PRESETS,
  bestLayout,
  DEFAULT_SHEET_PRINT,
  ONE_PAGE_MAX,
  SHEET_COLUMNS,
  sheetColumns,
  type SheetPrint,
} from "../lib/wristbands";
import {
  BAND_PREFS_EVENT,
  canonical,
  cleanSetupName,
  restoreSetup,
  SETUP_LIMITS,
  setupsStore,
  useBandSetups,
  withoutSetup,
  withSetup,
} from "../lib/bandSetups";
import { HOUSE_PREFS, HOUSE_SETUP, loadPrefs, reloadPrefs, savePrefsIfChanged, withDefaults, type BandPrefs } from "../lib/bandPrefs";
import { addPlaysToSource, removeFromSource, saveScene, sourceKey, sourceKind } from "../lib/bandPlays";
import { fixCutOffs } from "../lib/cutFix";
import { useAuth } from "../lib/auth";
import type { Scene, StoredPlay } from "../lib/types";
import { hasBrand, useBrand } from "../lib/brand";
import "../styles/wristbands.css";

// The print preview (and PDF.js behind it) loads only when a coach opens it.
const PdfPreview = lazyPage(() => import("../components/PrintPreview"), "PdfPreview");

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
        personnel: play?.personnel,
        notes: play?.description,
        playId: play?.id,
        rowId: r.id,
      };
    })
    .filter((e) => e.name);
}

/** Print order, kept as the calls' own ids so adding or taking off a play never scrambles it. */
type Order = { source: string; keys: string[] };

/** One step the page's Undo can go back to. */
type Snap = { prefs: BandPrefs; order: Order | null; sourceId: string; picked: string[] };
const HISTORY_MAX = 60;

const sameJson = (a: unknown, b: unknown) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

const COACH_SHEET_LABEL = Object.fromEntries(COACH_SHEETS.map((c) => [c.id, c.label])) as Record<CoachSheet, string>;

/**
 * Wristbands · print builder, from the Grid1ron Design canvas: pick the
 * plays, set the card up, drag the calls into order, print. Numbers match the
 * Call Sheet. The left panel is a single-open accordion, every section closed
 * to start (Wes, 2026-11-21 and 2026-11-22).
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
  const [preview, setPreview] = useState<null | "cards" | "sheet">(null);
  const brand = useBrand();
  // Real inches by default, so the screen never shows a card bigger and easier to read than the one that prints.
  const [actualSize, setActualSize] = useState(true);
  // Print order as the calls' ids; reset when the source changes.
  const [order, setOrder] = useState<Order | null>(null);
  // The left panel's open section: none to start, one at a time.
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [fixing, setFixing] = useState(false);

  // Every change is kept in this browser and stamped on the account's copy (see bandPrefs), so the next device opens on it.
  useEffect(() => {
    savePrefsIfChanged(prefs);
  }, [prefs]);

  // Undo and Redo: every change to the settings, the call order or the plays printed is one step.
  // Typing in a box counts as one step until the coach pauses.
  const history = useRef<{ past: Snap[]; future: Snap[]; last: Snap; at: number; skip: boolean } | null>(null);
  if (!history.current) history.current = { past: [], future: [], last: { prefs, order, sourceId, picked }, at: 0, skip: false };
  const [, redraw] = useState(0);
  useEffect(() => {
    // Griddy's one-click layout (the coach's own step, so Undo can take it back), or the sync bringing in settings
    // the coach set on another device or putting the default look back after a sign-out.
    const reload = (e: Event) => {
      const fromAccount = !!(e as CustomEvent<{ account?: boolean } | undefined>).detail?.account;
      const next = reloadPrefs(fromAccount);
      if (fromAccount) {
        // The account's settings are the new starting point, not a step the coach took. Undo must never put the
        // older ones back, because the page would send them up again as the newest copy.
        const h = history.current!;
        h.past = [];
        h.future = [];
        h.last = { ...h.last, prefs: next };
        redraw((n) => n + 1);
      }
      setPrefs(next);
    };
    window.addEventListener(BAND_PREFS_EVENT, reload);
    return () => window.removeEventListener(BAND_PREFS_EVENT, reload);
  }, []);
  useEffect(() => {
    const h = history.current!;
    const snap: Snap = { prefs, order, sourceId, picked };
    const same = snap.prefs === h.last.prefs && snap.order === h.last.order && snap.sourceId === h.last.sourceId && snap.picked === h.last.picked;
    if (same) return;
    if (h.skip) {
      h.skip = false;
      h.last = snap;
      return;
    }
    const now = Date.now();
    const el = document.activeElement;
    const typing =
      (el instanceof HTMLInputElement && ["text", "number", "search"].includes(el.type)) || el instanceof HTMLTextAreaElement;
    if (!(typing && now - h.at < 1000 && h.past.length)) {
      h.past.push(h.last);
      if (h.past.length > HISTORY_MAX) h.past.shift();
    }
    h.future = [];
    h.last = snap;
    h.at = typing ? now : 0;
    redraw((n) => n + 1);
  }, [prefs, order, sourceId, picked]);
  const restore = (snap: Snap) => {
    history.current!.skip = true;
    setPrefs(snap.prefs);
    setOrder(snap.order);
    setSourceId(snap.sourceId);
    setPicked(snap.picked);
    redraw((n) => n + 1);
  };
  function undo() {
    const h = history.current!;
    const prev = h.past.pop();
    if (!prev) return;
    h.future.push(h.last);
    restore(prev);
  }
  function redo() {
    const h = history.current!;
    const next = h.future.pop();
    if (!next) return;
    h.past.push(h.last);
    restore(next);
  }
  const canUndo = history.current.past.length > 0;
  const canRedo = history.current.future.length > 0;
  const undoRef = useRef({ undo, redo });
  undoRef.current = { undo, redo };
  useEffect(() => {
    // Ctrl+Z / Ctrl+Shift+Z (or Ctrl+Y) on the page; a text box keeps its own undo.
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.closest("input, textarea, select, [contenteditable='true']") || t.closest("[role='dialog']"))) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) undoRef.current.undo();
      else if ((k === "z" && e.shiftKey) || k === "y") undoRef.current.redo();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Saved setups: the settings under a name, on the account (BandSetupSync) so every device has them.
  // Gridiron-Vault is built in: it is what a coach starts on, and it can't be deleted.
  const { account } = useAuth();
  const setupsDoc = useBandSetups();
  const setups = setupsDoc.setups;
  const [setupName, setSetupName] = useState("");
  const [setupPick, setSetupPick] = useState("");
  const keepSetups = (doc: typeof setupsDoc) => {
    if (!setupsStore.set(doc) && !account)
      toast("This browser wouldn't keep your setups (a private window can refuse). Sign in to keep them on your account.", true);
  };
  function saveSetup() {
    const name = cleanSetupName(setupName);
    if (!name) {
      toast("Give the setup a name first, coach, like \"Varsity Friday\".", true);
      return;
    }
    const replacing = setups.some((s) => s.name.toLowerCase() === name.toLowerCase());
    const next = withSetup(setupsDoc, name, prefs as unknown as Record<string, unknown>);
    if (!next) {
      toast(`You have ${SETUP_LIMITS.count} saved setups. Delete one to save another.`, true);
      return;
    }
    keepSetups(next);
    setSetupPick(next.setups[0].id);
    setSetupName("");
    const where = account ? "on your account, on any device" : "in this browser until you sign in";
    toast(replacing ? `Updated "${name}" with these settings, ${where}.` : `Saved "${name}" ${where}. Load it any time from Saved setups.`);
  }
  function loadSetup() {
    if (setupPick === HOUSE_SETUP.id) {
      setPrefs(HOUSE_PREFS);
      toast(`Loaded ${HOUSE_SETUP.name}. Undo puts your last settings back.`);
      return;
    }
    const s = setups.find((x) => x.id === setupPick);
    if (!s) return;
    setPrefs(withDefaults(s.prefs as Partial<BandPrefs>));
    toast(`Loaded "${s.name}". Undo puts your last settings back.`);
  }
  function deleteSetup() {
    const s = setups.find((x) => x.id === setupPick);
    if (!s) return;
    keepSetups(withoutSetup(setupsDoc, s.id));
    setSetupPick("");
    toast(`Deleted "${s.name}".`, false, {
      label: "Undo",
      run: () => {
        keepSetups(restoreSetup(setupsStore.get(), s));
        setSetupPick(s.id);
      },
    });
  }
  // The setup these settings match, for the closed section's summary.
  const activeSetup = sameJson(prefs, HOUSE_PREFS)
    ? HOUSE_SETUP.name
    : (setups.find((s) => sameJson(withDefaults(s.prefs as Partial<BandPrefs>), prefs))?.name ?? null);

  const set = (patch: Partial<BandPrefs>) => setPrefs((p) => ({ ...p, ...patch }));
  const setSheet = (patch: Partial<SheetPrint>) => setPrefs((p) => ({ ...p, sheet: { ...p.sheet, ...patch } }));
  const shownCols = sheetColumns(prefs.sheet);
  // A preset shows as on while every setting it sets is still as it left it.
  const presetOn = (pre: (typeof BAND_PRESETS)[number]) =>
    (Object.keys(pre.prefs) as (keyof typeof pre.prefs)[]).every((k) => sameJson(prefs[k], pre.prefs[k]));
  const setLook = (patch: Partial<PrintLook>) => setPrefs((p) => ({ ...p, look: { ...p.look, ...patch } }));

  // "Apply game-day format" (canvas): print every play in the saved play format; the plays themselves don't change.
  const { format, parts } = usePlayFormat();
  const [gameDay, setGameDay] = useState(false);

  const source = sources.find((s) => s.id === sourceId);
  const kind = source ? sourceKind(sourceId) : "hand";
  const raw: BandEntry[] = source
    ? source.entries
    : picked
        .map((id) => plays.find((p) => p.id === id))
        .filter((p): p is StoredPlay => !!p)
        .map((p, i) => entryFromPlay(p, String(i + 1)));
  const formatted: BandEntry[] =
    gameDay && format && parts.length ? raw.map((e) => (e.scene ? { ...e, scene: applyFormat(e.scene, format, parts) } : e)) : raw;
  // Each call's own id (its Call Sheet row, else its play), so a custom order survives plays coming and going.
  const rawKeys = (() => {
    const seen = new Map<string, number>();
    return raw.map((e, i) => {
      const base = e.rowId ?? e.playId ?? `#${i}`;
      const n = seen.get(base) ?? 0;
      seen.set(base, n + 1);
      return n ? `${base}~${n}` : base;
    });
  })();
  const natural = formatted.map((_, i) => i);
  const customOrder = order?.source === sourceId ? order.keys : null;
  const list = (() => {
    if (!customOrder) return natural;
    const byKey = new Map(rawKeys.map((k, i) => [k, i]));
    const used = new Set<number>();
    const first = customOrder.flatMap((k) => {
      const i = byKey.get(k);
      if (i === undefined || used.has(i)) return [];
      used.add(i);
      return [i];
    });
    return [...first, ...natural.filter((i) => !used.has(i))];
  })();
  const moved = list.some((v, i) => v !== i);

  function move(from: number, to: number) {
    if (to < 0 || to >= list.length) return;
    const next = [...list];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setOrder({ source: sourceId, keys: next.map((i) => rawKeys[i]) });
  }

  const sourceName = source ? source.label.replace(/^[^·]+·\s*/, "") : "Hand-picked";
  const grid = gridByKey(prefs.grid) ?? gridByKey("4x2")!;
  const perCard = perCardOf(grid);
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
  const bestOn = (Object.keys(best.prefs) as (keyof typeof best.prefs)[]).every((k) => sameJson(prefs[k], best.prefs[k]));
  const gate = gateSheets(tier);
  const vector = gateVector(tier).ok;

  const sized = { card, grid, header: prefs.header, footer: prefs.footer, numberSize: prefs.numberSize };
  const art = diagramBox(sized);
  // "Same size in every box": one scale for the whole set, so the PDF and the preview both draw every play alike.
  const scenes = entries.flatMap((e) => (e.scene ? [e.scene] : []));
  const matched = useRef<{ key: unknown[]; look: PrintLook } | null>(null);
  const key = [prefs.sameSize, prefs.look, art.w, art.h, ...scenes];
  if (!matched.current || matched.current.key.length !== key.length || key.some((k, i) => k !== matched.current!.key[i]))
    matched.current = { key, look: prefs.sameSize ? matchLook(scenes, prefs.look, art.w, art.h) : prefs.look };
  const look = matched.current.look;
  const options: BandOptions = {
    card,
    grid,
    shows: prefs.shows,
    look,
    numberSize: prefs.numberSize,
    numberStyle: prefs.numberStyle,
    header: prefs.header,
    footer: prefs.footer,
    paper: prefs.paper,
    cutMarks: prefs.cutMarks,
    copies: prefs.copies,
    coachSheet: prefs.coachSheet,
    sheet: prefs.sheet,
    source: sourceName,
    watermark: tier.watermark ? "GRIDIRONVAULT" : null,
    dpi: cappedDpi(tier, 600),
    vector,
    colors: prefs.colors,
    numberInk: prefs.numberInk,
    border: prefs.border,
  };
  const palette = bandPalette(options, brand);
  const setColor = (k: keyof BandColors, v: string) => setPrefs((p) => ({ ...p, colors: { ...(p.colors ?? {}), [k]: v } }));
  const colorPresetOn = (c: BandColors | null) => sameJson(prefs.colors ?? null, c);
  const tight = tightBoxes(entries, options);
  const cuts = bandCutOffs(entries, options);
  const cutAt = new Map(cuts.map((c) => [c.index, c]));
  const boxes = boxCheck(options);
  const type = cellType(options);
  const printed = cards * (prefs.copies.qb + prefs.copies.center);
  const pages = prefs.paper === "card" ? printed : Math.ceil(printed / cardsPerPage(options));

  // Print and Download both open the print preview first: the real PDF, page by page.
  const build = (sheetOnly: boolean) => () =>
    // The call sheet on its own is the coach copy with no wristband cards.
    wristbandSheets(entries, sheetOnly ? { ...options, copies: { qb: 0, center: 0, coach: 1 } } : options);
  function exported(sheetOnly: boolean, how: "download" | "print") {
    track("play_exported", { kind: sheetOnly ? "call_sheet" : "wristband" });
    if (!sheetOnly) onboarding.mark("wristband");
    toast(
      sheetOnly
        ? `Call sheet ${how === "print" ? "sent to the printer" : "downloaded"}. Its numbers match the wristband cards as they're set up now.`
        : how === "print"
          ? "Wristband cards sent to the printer. Keep the scale at 100% (Actual size), then cut along the borders."
          : "Wristband cards downloaded. Print at 100% scale (Actual size), then cut along the borders.",
    );
  }

  // Changing the plays behind the cards: a playbook's list, a Call Sheet's rows, or the hand-picked list.
  const editFor = (index: number): string | null => {
    const id = entries[index]?.playId;
    if (!id || !plays.some((p) => p.id === id)) return null;
    return kind === "book" ? `/build/${id}?book=${sourceKey(sourceId)}` : `/build/${id}`;
  };

  function removeAt(index: number) {
    const e = entries[index];
    if (!e) return;
    if (kind === "hand") {
      if (!e.playId) return;
      const id = e.playId;
      const at = picked.indexOf(id);
      setPicked((l) => l.filter((x) => x !== id));
      toast(`Took "${e.name}" off the cards.`, false, {
        label: "Undo",
        run: () => setPicked((l) => (l.includes(id) ? l : [...l.slice(0, Math.max(0, at)), id, ...l.slice(Math.max(0, at))])),
      });
      return;
    }
    const res = removeFromSource(sourceId, { playId: e.playId, rowId: e.rowId });
    if (!res) {
      toast(`"${e.name}" was already off ${sourceName}.`, true);
      return;
    }
    toast(
      kind === "book"
        ? `Took "${e.name}" off the playbook ${sourceName}. It stays in your Vault.`
        : `Took "${e.name}" off the Call Sheet ${sourceName}. The play stays in your Vault.`,
      false,
      { label: "Undo", run: res.undo },
    );
  }

  function addPlay(p: StoredPlay) {
    if (kind === "hand") setPicked((l) => (l.includes(p.id) ? l : [...l, p.id]));
    else if (!addPlaysToSource(sourceId, [p])) {
      toast(`"${p.name || "That play"}" is already on ${sourceName}.`, true);
      return;
    }
    toast(`Added "${p.name || "Untitled play"}" to ${kind === "hand" ? "the cards" : sourceName}.`);
  }
  const have = new Set(raw.map((e) => e.playId).filter(Boolean));
  const q = query.trim().toLowerCase();
  const addable = adding
    ? plays.filter((p) => !have.has(p.id) && (!q || `${p.name} ${p.formation} ${p.tags.join(" ")}`.toLowerCase().includes(q)))
    : [];
  const drawHref = kind === "book" ? `/build?book=${sourceKey(sourceId)}` : "/build";

  /**
   * Pull what the print check flags back onto the field (Wes, 2026-11-22: auto
   * adjust the error). Only the drawing's edges move, in the saved play, and
   * the toast's Undo puts each drawing back as it was.
   */
  async function fixCuts(ids: string[]) {
    if (fixing) return;
    setFixing(true);
    try {
      const undoList: { id: string; scene: Scene }[] = [];
      const left: string[] = [];
      let movedParts = 0;
      for (const id of ids) {
        const play = store.get().plays.find((p) => p.id === id);
        if (!play) continue;
        const fix = fixCutOffs(play.scene, options.look, art.w, art.h);
        if (!fix.changed) {
          if (!fix.clean) left.push(play.name || "Untitled play");
          continue;
        }
        undoList.push({ id, scene: play.scene });
        await saveScene(play, fix.scene, !!account);
        movedParts += fix.changed;
        if (!fix.clean) left.push(play.name || "Untitled play");
      }
      if (!undoList.length && !left.length) {
        toast("Nothing to move in the saved drawing. If Apply game-day format is on, turn it off and look again.", true);
        return;
      }
      const head = undoList.length
        ? `Pulled ${movedParts} ${movedParts === 1 ? "piece" : "pieces"} back onto the field in ${undoList.length} ${undoList.length === 1 ? "play" : "plays"}.`
        : "";
      const tail = left.length ? ` Still cut off in ${left.join(", ")}: open ${left.length === 1 ? "it" : "them"} in the Designer.` : " Only the edges moved.";
      toast(
        `${head}${tail}`.trim(),
        !undoList.length,
        undoList.length
          ? {
              label: "Undo",
              run: () => {
                for (const u of undoList) {
                  const p = store.get().plays.find((x) => x.id === u.id);
                  if (p) void saveScene(p, u.scene, !!account);
                }
              },
            }
          : undefined,
      );
    } finally {
      setFixing(false);
    }
  }
  const cutIds = [...new Set(cuts.map((c) => c.playId).filter((x): x is string => !!x))];
  const cutHeading = cuts.length === 1 ? "1 box will print with something cut off" : `${cuts.length} boxes will print with something cut off`;
  const cutList = (live: boolean) => (
    <ul>
      {cuts.slice(0, 8).map((c) => {
        const href = editFor(c.index);
        return (
          <li key={`${c.number}-${c.name}`}>
            <b>
              {c.number} · {c.name}:
            </b>{" "}
            {c.parts.join(", ")}
            {live && c.playId && (
              <>
                {" "}
                <button type="button" className="link" onClick={() => void fixCuts([c.playId!])} disabled={fixing}>
                  Fix it
                </button>
                {href && (
                  <>
                    {" · "}
                    <Link className="link" to={href}>
                      Edit in the Designer
                    </Link>
                  </>
                )}
              </>
            )}
          </li>
        );
      })}
      {cuts.length > 8 && <li>and {cuts.length - 8} more</li>}
    </ul>
  );
  const cutWarning = cuts.length > 0 && (
    <div className="pp-warn" role="status">
      <b>{cutHeading}.</b> A player or route sits past the edge of the field.{" "}
      {cutIds.length > 0 && (
        <button type="button" className="btn btn-primary btn-sm wb-fix-all" onClick={() => void fixCuts(cutIds)} disabled={fixing}>
          Fix all
        </button>
      )}{" "}
      Fix pulls just those pieces back on and moves nothing else. Or turn on Whole field and zoom out.
      {cutList(true)}
    </div>
  );
  // The print preview can't change the plays, so it gets the same warning as words.
  const cutNote = cuts.length > 0 && (
    <div className="pp-warn" role="status">
      <b>{cutHeading}.</b> Close this preview and press Fix all on the Wristbands page to pull them back on, or pull them back in the Designer.
      {cutList(false)}
    </div>
  );

  const setNumbering = (patch: Partial<BandNumbering>) => setPrefs((p) => ({ ...p, numbering: { ...p.numbering, ...patch } }));

  const setCopy = (k: keyof BandCopies, v: number) =>
    setPrefs((p) => ({ ...p, copies: { ...p.copies, [k]: Math.max(0, Math.min(10, v)) } }));

  // What each closed section says about its settings.
  const paper = BAND_PAPERS.find((p) => p.id === prefs.paper);
  const shownHint = prefs.shows.numberOnly
    ? "Number only"
    : [prefs.shows.diagram && "Diagram", prefs.shows.name && "Name"].filter(Boolean).join(" + ") || "Nothing";
  const colorSet = BAND_COLOR_PRESETS.find((c) => colorPresetOn(c.colors));
  const colorsHint = !colorSet ? "Custom" : colorSet.id === "auto" && brand.prints && hasBrand(brand) ? "Team colors" : colorSet.label;
  const gridAlert = !boxes.readable || tight.length > 0 ? "Boxes too small to read" : undefined;
  const playsAlert = cuts.length ? `${cuts.length} ${cuts.length === 1 ? "box" : "boxes"} will print cut off` : undefined;
  const numberAlert = dupes.length ? "The same number is on more than one box" : undefined;

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
            <div className="wb-undo" role="group" aria-label="Undo and redo" data-tour="wb-undo">
              <button type="button" className="btn btn-ghost btn-sm" onClick={undo} disabled={!canUndo} title="Undo the last change (Ctrl+Z)">
                <Icon name="undo" size={14} /> Undo
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">
                <Icon name="redo" size={14} /> Redo
              </button>
            </div>
            <button type="button" className="btn btn-ghost" onClick={() => setPreview("sheet")} disabled={!entries.length || !gate.ok}>
              <Icon name="table" size={15} /> Call sheet
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setPreview("cards")} disabled={!entries.length || !gate.ok} data-tour="wb-print">
              <Icon name="print" size={15} /> Print cards
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
            <PanelGroup open={openSection} onOpenChange={setOpenSection}>

              <Panel id="start" title="Playbook & saved setups" hint={`${sourceName} · ${activeSetup ?? "your own settings"}`}>
                <label className="wb-field" data-tour="wb-source">
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

                <div className="wb-field wb-setups" role="group" aria-labelledby="wb-setups" data-tour="wb-setups">
                  <span id="wb-setups">Saved setups</span>
                  <div className="wb-setup-row">
                    <select className="select" aria-label="Setup to load" value={setupPick} onChange={(e) => setSetupPick(e.target.value)}>
                      <option value="">Pick a setup to load</option>
                      <optgroup label="Built in">
                        <option value={HOUSE_SETUP.id}>{HOUSE_SETUP.name} (built in)</option>
                      </optgroup>
                      {setups.length > 0 && (
                        <optgroup label="Yours">
                          {setups.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={loadSetup} disabled={!setupPick}>
                      Load
                    </button>
                    <button
                      type="button"
                      className="btn btn-quiet btn-sm"
                      onClick={deleteSetup}
                      disabled={!setupPick || setupPick === HOUSE_SETUP.id}
                      aria-label="Delete the picked setup"
                    >
                      <Icon name="trash" size={13} /> Delete
                    </button>
                  </div>
                  <div className="wb-setup-row">
                    <input
                      className="input"
                      aria-label="Name for these settings"
                      placeholder="Name these settings, e.g. Varsity Friday"
                      maxLength={SETUP_LIMITS.name}
                      value={setupName}
                      onChange={(e) => setSetupName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          saveSetup();
                        }
                      }}
                    />
                    <button type="button" className="btn btn-primary btn-sm" onClick={saveSetup}>
                      <Icon name="save" size={13} /> Save setup
                    </button>
                  </div>
                  <p className="wb-note">
                    {HOUSE_SETUP.name} is the built-in card new coaches start on: 3 plays across and 2 down, the G and GRIDDY in the header,
                    colored numbers on a gray strip, a bold black edge. Saving keeps every card and call sheet setting under a name.{" "}
                    {account
                      ? "Saved to your account, so it loads on any device you sign in on."
                      : "Signed out, it waits in this browser and moves to your account when you sign in."}{" "}
                    The plays aren't saved with it, so one setup works for any playbook. Same name again updates it.
                  </p>
                </div>
              </Panel>

              <Panel
                id="plays"
                title="Plays on the cards"
                count={entries.length}
                alert={playsAlert}
                hint={entries.length ? `${entries.length} ${entries.length === 1 ? "play" : "plays"} · ${cards} ${cards === 1 ? "card" : "cards"}` : "None yet"}
              >
                <div className="wb-field" role="group" aria-label="Plays on the cards">
                  <p className="wb-note">
                    {kind === "book"
                      ? "Take a play off this playbook, add another, or open one in the Designer. A play you take off stays in your Vault."
                      : kind === "grid"
                        ? "Take a call off this Call Sheet, add another, or open its play in the Designer. The play stays in your Vault."
                        : "The plays you picked by hand. Take one off, add another, or open one in the Designer."}
                  </p>
                  {cuts.length > 0 && (
                    <p className="wb-warn" role="status">
                      {cutHeading}.{" "}
                      {cutIds.length > 0 && (
                        <button type="button" className="link" onClick={() => void fixCuts(cutIds)} disabled={fixing}>
                          Fix all
                        </button>
                      )}
                    </p>
                  )}
                  {entries.length === 0 ? (
                    <p className="wb-note">Nothing is on the cards yet. Add plays below.</p>
                  ) : (
                    <ol className="wb-plays">
                      {entries.map((e, i) => {
                        const cut = cutAt.get(i);
                        const href = editFor(i);
                        return (
                          <li key={`${e.rowId ?? e.playId ?? "call"}-${i}`} className={cut ? "is-cut" : undefined}>
                            <b className="wb-plays-num">{e.number}</b>
                            <span className="wb-plays-name">
                              {e.name}
                              {cut && <em>Cut off: {cut.parts.join(", ")}</em>}
                              {!e.scene && <em>No linked play: prints as a number</em>}
                            </span>
                            {cut?.playId && (
                              <button type="button" className="btn btn-quiet btn-sm" onClick={() => void fixCuts([cut.playId!])} disabled={fixing} aria-label={`Fix the cut-off in ${e.name}`}>
                                Fix
                              </button>
                            )}
                            {href && (
                              <Link to={href} className="btn btn-quiet btn-sm" aria-label={`Open ${e.name} in the Designer`} title="Edit this play in the Designer">
                                <Icon name="pencil" size={13} />
                              </Link>
                            )}
                            <button type="button" className="btn btn-quiet btn-sm" onClick={() => removeAt(i)} aria-label={`Take ${e.name} off the cards`} title="Take this play off the cards">
                              <Icon name="close" size={13} />
                            </button>
                          </li>
                        );
                      })}
                    </ol>
                  )}
                  <div className="wb-plays-add">
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAdding(true)}>
                      <Icon name="plus" size={13} /> Add plays
                    </button>
                    <Link to={drawHref} className="btn btn-ghost btn-sm">
                      <Icon name="pencil" size={13} /> Draw a new play
                    </Link>
                  </div>
                </div>
              </Panel>

              <Panel id="styles" title="One-click styles" hint={BAND_PRESETS.find(presetOn)?.label ?? (bestOn ? "Best for this card" : "Your own mix")}>
                <div className="wb-field" role="group" aria-label="One-click styles">
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
              </Panel>

              <Panel id="numbering" title="Numbering" hint={NUMBERING_MODES.find((m) => m.id === prefs.numbering.mode)?.label} alert={numberAlert}>
                <div className="wb-field" role="group" aria-label="Numbering">
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
              </Panel>

              <Panel id="size" title="Card size" hint={preset.id === "custom" ? `${card.w.toFixed(2)} × ${card.h.toFixed(2)} in` : `${preset.label} · ${card.w.toFixed(2)} × ${card.h.toFixed(2)} in`}>
                <div className="wb-field" role="group" aria-label="Card size">
                <select
                  className="select"
                  aria-label="Card size"
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
              </Panel>

              <Panel id="grid" title="Plays per card" hint={`${perCardOf(grid)} plays · ${gridLabel(grid)}`} alert={gridAlert}>
                <div className="wb-field" role="group" aria-label="Plays per card (columns × rows)">
                <div className="chip-row">
                  {BAND_GRIDS.map((g) => (
                    <button
                      key={gridKey(g)}
                      type="button"
                      className={`chip${gridKey(g) === gridKey(grid) ? " is-on" : ""}`}
                      aria-pressed={gridKey(g) === gridKey(grid)}
                      aria-label={`${perCardOf(g)} ${gridLabel(g)}: ${perCardOf(g)} plays, ${
                        perCardOf(g) < g.cols * g.rows ? `${gridLabel(g).replace(" + ", " over ")}, the short row centred` : `${g.cols} across and ${g.rows} down`
                      }`}
                      onClick={() => set({ grid: gridKey(g) })}
                    >
                      {perCardOf(g)} <small>{gridLabel(g)}</small>
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
                        {gridLabel(boxes.better)} gives {boxes.better.art.w.toFixed(2)} × {boxes.better.art.h.toFixed(2)} in and{" "}
                        {perCardOf(boxes.better)} plays a card.{" "}
                        <button type="button" className="link" onClick={() => set({ grid: gridKey(boxes.better!) })}>
                          Use {gridLabel(boxes.better)}
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
              </Panel>

              <Panel id="look" title="Diagram" hint={`${FIT_OPTIONS.find((f) => f.id === prefs.look.fit)?.label ?? "Diagram"}${prefs.sameSize ? " · same size" : ""}`}>
                <div className="wb-field" role="group" aria-label="Diagram">
                <div className="chip-row">
                  {FIT_OPTIONS.map((f) => (
                    <button key={f.id} type="button" className={`chip${prefs.look.fit === f.id ? " is-on" : ""}`} aria-pressed={prefs.look.fit === f.id} title={f.hint} onClick={() => setLook({ fit: f.id })}>
                      {f.label}
                    </button>
                  ))}
                </div>
                <label className="switch" data-tour="wb-same">
                  <input type="checkbox" checked={prefs.sameSize} onChange={(e) => set({ sameSize: e.target.checked })} />
                  Same size in every box
                </label>
                <p className="wb-note">
                  {prefs.sameSize
                    ? "Players, routes and yard lines print the same size on every play. The widest play sets how much field each box shows."
                    : "Each play fills its own box, so players and routes can differ a little from box to box. Turn this on to match them."}
                </p>
                {prefs.sameSize && prefs.look.fit === "play" && (
                  <label className="switch">
                    <input type="checkbox" checked={!!prefs.look.lineUp} onChange={(e) => setLook({ lineUp: e.target.checked })} />
                    Line up the line of scrimmage in every box
                  </label>
                )}
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
                    ["Field size (zoom), every box", "zoom", ZOOM_STEPS.map((z) => ({ value: z, label: `${Math.round(z * 100)}%` }))],
                    ["Player icons, every box", "icons", ICON_STEPS],
                    ["Route lines, every box", "lines", LINE_STEPS],
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
              </Panel>

              <Panel id="shows" title="Each box shows" hint={shownHint}>
                <div className="wb-field" role="group" aria-label="Each box shows">
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
                  Number color
                  <select className="select" value={prefs.numberInk} onChange={(e) => set({ numberInk: e.target.value as NumberInk })}>
                    <option value="one">One color on every card</option>
                    <option value="card">A color per card (red, blue, green…)</option>
                  </select>
                </label>
                <label className="wb-sub">
                  Card edge
                  <select className="select" value={prefs.border} onChange={(e) => set({ border: e.target.value as CardBorder })}>
                    <option value="thin">Thin line</option>
                    <option value="bold">Bold black edge</option>
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
              </Panel>

              <Panel id="colors" title="Card colors" hint={colorsHint}>
                <div className="wb-field" role="group" aria-label="Card colors" data-tour="wb-colors">
                <div className="chip-row">
                  {BAND_COLOR_PRESETS.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className={`chip wb-swatch-chip${colorPresetOn(c.colors) ? " is-on" : ""}`}
                      aria-pressed={colorPresetOn(c.colors)}
                      onClick={() => set({ colors: c.colors })}
                    >
                      <i aria-hidden="true" style={{ background: c.colors?.head ?? bandPalette({ colors: null, numberStyle: prefs.numberStyle, header: prefs.header }, brand).head }} />
                      {c.id === "auto" && brand.prints && hasBrand(brand) ? "Team colors" : c.label}
                    </button>
                  ))}
                </div>
                <div className="wb-colors">
                  {(
                    [
                      ["head", "Header"],
                      ["headText", "Header words"],
                      ["tab", prefs.numberStyle === "band" ? "Number strip" : "Number tab"],
                      ["tabText", "Numbers"],
                      ["line", "Border and lines"],
                    ] as const
                  ).map(([k, label]) => (
                    <label key={k} className="wb-color">
                      <input type="color" value={palette[k].toLowerCase()} onChange={(e) => setColor(k, e.target.value.toUpperCase())} />
                      {label}
                    </label>
                  ))}
                </div>
                <p className="wb-note">
                  Pick a set, then change any color. The preview and the printout use the same colors. Light colors save ink.
                </p>
                </div>
              </Panel>

              <Panel id="text" title="Header and border text" hint={prefs.header.show ? `${prefs.header.left} · ${prefs.header.right}`.replace(/^ · | · $/g, "") : "No header band"}>
                <div className="wb-field" role="group" aria-label="Header and border text">
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
                    <label className="switch">
                      <input type="checkbox" checked={!!prefs.header.mark} onChange={(e) => set({ header: { ...prefs.header, mark: e.target.checked } })} />
                      GridIronVault G beside the header words
                    </label>
                    {prefs.header.mark && brand.prints && hasBrand(brand) && (
                      <p className="wb-note">Your team logo is on the header, so the G stays off. Turn team prints off on My team to bring it back.</p>
                    )}
                  </>
                )}
                <label className="wb-sub">
                  Bottom border
                  <input className="input" placeholder="e.g. Mid TN Blue · Fall 2026" value={prefs.footer} onChange={(e) => set({ footer: e.target.value })} />
                </label>
                <p className="wb-note">
                  {"{role}"} prints QB or Center, {"{card}"} the card letter, {"{source}"} the grid or playbook name and {"{count}"} the
                  number of plays.{" "}
                  <button type="button" className="btn btn-quiet btn-sm" onClick={() => set({ header: { ...HOUSE_PREFS.header } })}>
                    Reset header
                  </button>
                </p>
                </div>
              </Panel>

              <Panel id="paper" title="Paper" hint={paper ? (paper.id === "card" ? paper.label : `${paper.label}${prefs.cutMarks ? " · cut marks" : ""}`) : ""}>
                <div className="wb-field" role="group" aria-label="Paper">
                <select className="select" aria-label="Paper" value={prefs.paper} onChange={(e) => set({ paper: e.target.value as BandPaperId })}>
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
              </Panel>

              <Panel id="copies" title="Copies" hint={`QB ×${prefs.copies.qb} · Center ×${prefs.copies.center} · Coach ×${prefs.copies.coach}`}>
                <div className="wb-field" role="group" aria-label="Copies">
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
                </div>
              </Panel>

              <Panel id="callsheet" title="Coach's call sheet" hint={COACH_SHEET_LABEL[prefs.coachSheet]}>
                <div className="wb-field" role="group" aria-label="Coach's call sheet" data-tour="wb-callsheet">
                <label className="wb-sub">
                  Prints
                  <select className="select" aria-label="Call sheet prints" value={prefs.coachSheet} onChange={(e) => set({ coachSheet: e.target.value as CoachSheet })}>
                    {COACH_SHEETS.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.id === "list"
                          ? "Call list: the columns below"
                          : c.id === "diagrams"
                            ? "Diagrams: every call with its picture, 8 a page"
                            : c.id === "both"
                              ? "Both: the call list, then the diagrams"
                              : "One page with diagrams: every call on one sheet"}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="wb-sub">
                  Title
                  <input
                    className="input"
                    value={prefs.sheet.title}
                    maxLength={80}
                    onChange={(e) => setSheet({ title: e.target.value })}
                    placeholder={DEFAULT_SHEET_PRINT.title}
                  />
                </label>
                <div className="wb-sub" role="group" aria-label="Columns on the call sheet">
                  <span>Show on the sheet</span>
                  <div className="chip-row">
                    {SHEET_COLUMNS.map((c) => {
                      const on = c.id === "number" || prefs.sheet.columns.includes(c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          className={`chip${on ? " is-on" : ""}`}
                          aria-pressed={on}
                          disabled={c.id === "number"}
                          title={c.id === "number" ? "The number always prints, so a call can be found." : undefined}
                          onClick={() =>
                            setSheet({
                              columns: on ? prefs.sheet.columns.filter((x) => x !== c.id) : SHEET_COLUMNS.map((x) => x.id).filter((x) => x === c.id || prefs.sheet.columns.includes(x)),
                            })
                          }
                        >
                          {c.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <label className="switch">
                  <input type="checkbox" checked={prefs.sheet.date} onChange={(e) => setSheet({ date: e.target.checked })} />
                  Today's date by the title
                </label>
                <label className="switch">
                  <input type="checkbox" checked={prefs.sheet.playerNotes} onChange={(e) => setSheet({ playerNotes: e.target.checked })} />
                  Player notes under the diagrams
                </label>
                <label className="wb-sub">
                  Blank lines for game-day notes
                  <input
                    className="input"
                    type="number"
                    min={0}
                    max={40}
                    value={prefs.sheet.blankRows}
                    onChange={(e) => setSheet({ blankRows: Math.max(0, Math.min(40, Math.floor(Number(e.target.value)) || 0)) })}
                  />
                </label>
                <p className="wb-note">
                  {"{source}"}, {"{team}"} and {"{count}"} fill in the title. Play, Formation, Type and Card spot also label each diagram. One page fits
                  up to {ONE_PAGE_MAX} calls, sized to fill the sheet.{" "}
                  <button type="button" className="btn btn-quiet btn-sm" onClick={() => set({ sheet: DEFAULT_SHEET_PRINT })}>
                    Reset call sheet
                  </button>
                </p>
                </div>
              </Panel>

              <Panel id="format" title="Game-day format" hint={gameDay && format ? "On" : "Off"}>
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
              </Panel>

            </PanelGroup>
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
                  <p className="eyebrow">Card layout</p>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPreview("cards")} disabled={!gate.ok} data-tour="wb-preview">
                    <Icon name="eye" size={14} /> Print preview
                  </button>
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
                <p className="wb-note">
                  Drag a box to move the call, or use the arrows. Hover a box for its pencil (open the play in the Designer) and X (take it off
                  the cards). Click the header to edit its text. Print preview shows every page exactly as the PDF prints it.
                </p>
                {cutWarning}
                <BandPreview
                  entries={entries}
                  options={options}
                  actualSize={actualSize}
                  onMove={move}
                  onEditHeader={() => {
                    setOpenSection("text");
                    window.setTimeout(() => headerInput.current?.focus(), 0);
                  }}
                  onRemove={removeAt}
                  editHref={editFor}
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
                      {prefs.coachSheet === "onepage" ? " · prints on one page with diagrams" : prefs.coachSheet === "diagrams" ? " · prints as diagrams" : ""}
                    </p>
                    <button type="button" className="btn btn-quiet btn-sm" onClick={() => setPreview("sheet")} disabled={!gate.ok}>
                      <Icon name="print" size={13} /> Preview and print
                    </button>
                  </div>
                  <div className="wb-sheet-scroll" tabIndex={0} role="region" aria-label="Coach's call sheet, scrolls sideways when it is wider than the screen">
                    <table className="wb-sheet-table">
                      <thead>
                        <tr>
                          {shownCols.map((c) => (
                            <th key={c.id} scope="col">
                              {c.id === "spot" ? "Card" : c.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sheetRows.map((r, i) => (
                          <tr key={`${r.spot}-${i}`} className={dupes.includes(r.number) ? "is-dupe" : undefined}>
                            {shownCols.map((c) => (
                              <td
                                key={c.id}
                                className={c.id === "number" ? "wb-sheet-num" : c.id === "spot" ? "wb-sheet-spot" : c.id === "notes" ? "wb-sheet-notes" : undefined}
                              >
                                {c.id === "notes" ? <span className="wb-clamp">{r.notes}</span> : r[c.id] || "—"}
                              </td>
                            ))}
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
      {adding && (
        <Modal
          title="Add plays to the cards"
          onClose={() => {
            setAdding(false);
            setQuery("");
          }}
          wide
          footer={
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setAdding(false);
                setQuery("");
              }}
            >
              Done
            </button>
          }
        >
          <p className="wb-note">
            {kind === "book"
              ? `Each play goes on the end of the playbook ${sourceName}.`
              : kind === "grid"
                ? `Each play fills the next blank row on the Call Sheet ${sourceName}, or a new row at the bottom.`
                : "Each play goes on the end of your hand-picked cards."}
          </p>
          <div className="search-box">
            <Icon name="search" size={15} />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your Vault" aria-label="Search your plays" autoFocus />
          </div>
          {addable.length === 0 ? (
            <div className="empty empty-sm">
              <Icon name="check" size={26} />
              <h3>Nothing left to add</h3>
              <p>Every matching play is already on the cards. Draw a new one or clear the search.</p>
            </div>
          ) : (
            <div className="add-grid">
              {addable.map((p) => (
                <button type="button" className="add-card" key={p.id} onClick={() => addPlay(p)} aria-label={`Add ${p.name || "Untitled play"} to the cards`}>
                  <PlayThumb scene={p.scene} decorative />
                  <b>{p.name || "Untitled play"}</b>
                  <small>{p.formation}</small>
                </button>
              ))}
            </div>
          )}
        </Modal>
      )}
      {preview && (
        <Suspense fallback={null}>
          <PdfPreview
            title={preview === "sheet" ? `Call sheet · ${sourceName}` : `Wristbands · ${sourceName}`}
            build={build(preview === "sheet")}
            filename={`${slug(`${preview === "sheet" ? "call-sheet" : "wristbands"}-${sourceName}`)}.pdf`}
            note={preview === "cards" ? "Print at Actual size (100%), then cut along the borders." : undefined}
            warnings={preview === "cards" ? cutNote : undefined}
            onDone={(how) => exported(preview === "sheet", how)}
            onClose={() => setPreview(null)}
          />
        </Suspense>
      )}
    </Shell>
  );
}
