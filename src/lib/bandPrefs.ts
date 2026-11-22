/**
 * The Wristbands page's settings: what a coach gets on a first visit, how the
 * browser's copy is read, and how a change reaches the account.
 *
 * Wes, 2026-11-22: the "Gridiron-Vault" setup is the default for coaches. It is
 * the card he built (a 3-window 4.75 × 2.50 in band, three plays across and two
 * down, the G and GRIDDY in the header, red / blue / green numbers on a gray
 * strip, bold black edge, GRIDIRON-VAULT.COM underneath), so a coach opens the
 * page on a card that is ready to print. A coach who has already changed
 * anything keeps what they set; the page only switches a browser whose settings
 * are still exactly the old defaults. Their own saved setups are never touched.
 *
 * Every change a coach makes is also stamped onto the account's copy
 * (`setupsStore.setCurrent`), so the next device opens on it.
 */
import { setupsStore } from "./bandSetups";
import { BAND_PREFS_EVENT, BAND_PREFS_KEY, canonical } from "./bandSetupsData";
import {
  BAND_PRESETS,
  DEFAULT_BAND_LOOK,
  DEFAULT_NUMBERING,
  DEFAULT_SHEET_PRINT,
  defaultBandText,
  type BandColors,
  type BandCopies,
  type BandNumbering,
  type BandOptions,
  type BandPaperId,
  type BandSizeId,
  type CardBorder,
  type CellShows,
  type CoachSheet,
  type NumberInk,
  type NumberSize,
  type NumberStyle,
  type SheetPrint,
} from "./wristbands";
import type { PrintLook } from "./printLook";

/** Card settings a coach sets once for the season, remembered on the account. */
export type BandPrefs = {
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
  /** The coach printout: title, columns and extras. */
  sheet: SheetPrint;
  /** Every box at one scale: players, routes and yard lines print the same size in each. */
  sameSize: boolean;
  /** The coach's card colors; null follows team branding or the GridIronVault look. */
  colors: Partial<BandColors> | null;
  /** Numbers in one color, or each card's numbers in its own color. */
  numberInk: NumberInk;
  /** Thin card edge, or the Play card's bold black one. */
  border: CardBorder;
};

/** What the page opened on before the Gridiron-Vault setup became the default. Older saved setups load over these. */
export const LEGACY_PREFS: BandPrefs = {
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
  sheet: DEFAULT_SHEET_PRINT,
  sameSize: false,
  colors: null,
  numberInk: "one",
  border: "thin",
};

/** The built-in setup in the Saved setups list: id and name. Not stored on the account, so it can't be deleted or go stale. */
export const HOUSE_SETUP = { id: "gridiron-vault", name: "Gridiron-Vault" } as const;

/** The Gridiron-Vault setup, and the default for a coach who has not set anything up. */
export const HOUSE_PREFS: BandPrefs = {
  ...LEGACY_PREFS,
  grid: "3x2",
  sizeId: "large",
  shows: { diagram: true, name: false, numberOnly: false },
  numberSize: "l",
  numberStyle: "band",
  numberInk: "card",
  border: "bold",
  header: { show: true, left: "GRIDDY", right: "WIN THE GAME", mark: true },
  footer: "GRIDIRON-VAULT.COM",
  numbering: { ...DEFAULT_NUMBERING, mode: "order", start: 1 },
};

/** Saved settings (this browser's or a saved setup) over the old defaults, so a setting added later is never missing. */
export function withDefaults(saved: Partial<BandPrefs>): BandPrefs {
  return { ...LEGACY_PREFS, ...saved, sheet: { ...DEFAULT_SHEET_PRINT, ...(saved.sheet ?? {}) } };
}

const same = (a: unknown, b: unknown) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

/** The settings this browser holds: none, or still exactly the old defaults, is the Gridiron-Vault setup. */
export function resolvePrefs(saved: Partial<BandPrefs> | null): BandPrefs {
  if (!saved || typeof saved !== "object") return HOUSE_PREFS;
  const full = withDefaults(saved);
  return same(full, LEGACY_PREFS) ? HOUSE_PREFS : full;
}

/**
 * Settings this browser holds that the account's copy doesn't carry yet: the
 * coach changed the card before settings followed the account, and nothing has
 * stamped them since. Null when there are none, when they are only the old
 * defaults, or when they are already what `than` (the account's) says. The
 * sync uses it to hand them to the account, or keep them as a saved setup,
 * rather than let a newer copy replace them unseen.
 */
export function ownSettings(than?: Record<string, unknown>): BandPrefs | null {
  const saved = readStored();
  if (!saved || typeof saved !== "object") return null;
  const full = withDefaults(saved);
  if (same(full, LEGACY_PREFS)) return null;
  return than && same(full, withDefaults(than as Partial<BandPrefs>)) ? null : full;
}

function readStored(): Partial<BandPrefs> | null {
  try {
    return JSON.parse(localStorage.getItem(BAND_PREFS_KEY) ?? "null");
  } catch {
    return null;
  }
}

/** The settings last read from or written to this browser's copy, so only a real change is sent to the account. */
let held = "";
const key = (p: unknown) => JSON.stringify(canonical(p));

/** On opening the page. */
export function loadPrefs(): BandPrefs {
  const p = resolvePrefs(readStored());
  held = key(p);
  return p;
}

/**
 * Read the browser's copy again after something else changed it. `fromAccount`
 * is the sync bringing in settings the coach set on another device: they are
 * already on the account, so they aren't sent back as a new change.
 */
export function reloadPrefs(fromAccount: boolean): BandPrefs {
  const p = resolvePrefs(readStored());
  if (fromAccount) held = key(p);
  return p;
}

/** Keep the settings in this browser and on the account. False when this browser refused the write (the account still gets them). */
function commit(p: BandPrefs): boolean {
  held = key(p);
  let stored = true;
  try {
    localStorage.setItem(BAND_PREFS_KEY, JSON.stringify(p));
  } catch {
    stored = false; // Private windows can refuse storage; the settings still work for this visit.
  }
  setupsStore.setCurrent(p as unknown as Record<string, unknown>);
  return stored;
}

/** The page's effect: keep what the coach set in this browser and on the account, and say nothing when nothing changed. */
export function savePrefsIfChanged(p: BandPrefs) {
  if (key(p) !== held) commit(p);
}

/** Sets the Wristbands page to a one-click card layout (Griddy's wristband change); false if storage is blocked. */
export function chooseBandPreset(id: string): boolean {
  const preset = BAND_PRESETS.find((p) => p.id === id);
  if (!preset) return false;
  const stored = commit({ ...resolvePrefs(readStored()), ...preset.prefs });
  // The Wristbands page, if it's open behind Griddy's panel, picks the new layout up.
  window.dispatchEvent(new Event(BAND_PREFS_EVENT));
  return stored;
}
