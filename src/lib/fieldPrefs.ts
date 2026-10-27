import { useSyncExternalStore } from "react";

/**
 * Field Controls: how the coach likes the field drawn and how drawing snaps,
 * remembered per browser. The canvas, thumbnails, Run play and every export
 * read the same values, so what the coach sees is what prints.
 */
export type HashStyle = "hs" | "college" | "pro" | "none";
export type FieldContrast = "soft" | "standard" | "high";
export type FieldPrefs = {
  /** Snap-to-grid spacing in canvas units; 0 is off. */
  grid: number;
  /** How close (canvas units) a click must land to a player to start or end on him. */
  snapRadius: number;
  hashes: HashStyle;
  contrast: FieldContrast;
};

/**
 * Hash marks as a share of the field's width from each sideline: high school
 * 53'4", college 60', pro 70'9" in from a 160-foot-wide field.
 */
export const HASHES: { id: HashStyle; label: string; at: number; hint: string }[] = [
  { id: "hs", label: "High school", at: 53.33 / 160, hint: "53 ft 4 in from each sideline, splitting the field in thirds." },
  { id: "college", label: "College", at: 60 / 160, hint: "60 ft from each sideline." },
  { id: "pro", label: "Pro", at: 70.75 / 160, hint: "70 ft 9 in from each sideline, close to the middle." },
  { id: "none", label: "None", at: 0, hint: "No hash marks, for flag fields and teaching diagrams." },
];

export const CONTRASTS: { id: FieldContrast; label: string; hint: string }[] = [
  { id: "soft", label: "Soft", hint: "Faint yard lines, so the play is all that stands out. Saves toner." },
  { id: "standard", label: "Standard", hint: "The usual GridIronVault field." },
  { id: "high", label: "High", hint: "Darker yard lines and numbers for projectors, phones in sunlight and faded printers." },
];

export const GRID_SIZES: { value: number; label: string }[] = [
  { value: 0, label: "Off" },
  { value: 10, label: "Fine" },
  { value: 20, label: "Medium" },
  { value: 40, label: "Coarse" },
];

export const SNAP_RADII: { value: number; label: string }[] = [
  { value: 14, label: "Tight" },
  { value: 26, label: "Normal" },
  { value: 44, label: "Wide" },
];

export const DEFAULT_FIELD_PREFS: FieldPrefs = { grid: 0, snapRadius: 26, hashes: "hs", contrast: "standard" };

const KEY = "grid1ronvault.field.v1";

const pick = <T,>(value: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(value as T) ? (value as T) : fallback);

/** Holds unknown or stale values to the choices on offer. */
export function cleanFieldPrefs(raw: unknown): FieldPrefs {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<FieldPrefs>;
  const d = DEFAULT_FIELD_PREFS;
  return {
    grid: pick(r.grid, GRID_SIZES.map((g) => g.value), d.grid),
    snapRadius: pick(r.snapRadius, SNAP_RADII.map((s) => s.value), d.snapRadius),
    hashes: pick(r.hashes, HASHES.map((h) => h.id), d.hashes),
    contrast: pick(r.contrast, CONTRASTS.map((c) => c.id), d.contrast),
  };
}

function read(): FieldPrefs {
  try {
    return cleanFieldPrefs(JSON.parse(localStorage.getItem(KEY) ?? "null"));
  } catch {
    return DEFAULT_FIELD_PREFS;
  }
}

let state = read();
const listeners = new Set<() => void>();

export const fieldPrefsStore = {
  get: () => state,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  set(patch: Partial<FieldPrefs>) {
    state = cleanFieldPrefs({ ...state, ...patch });
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* storage blocked: the choice still holds this session */
    }
    listeners.forEach((l) => l());
  },
};

/** The coach's field controls; also safe inside renderToStaticMarkup for exports. */
export const useFieldPrefs = () => useSyncExternalStore(fieldPrefsStore.subscribe, fieldPrefsStore.get, fieldPrefsStore.get);
