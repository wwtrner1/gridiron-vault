import { useSyncExternalStore } from "react";

/**
 * The Designer's color picker palettes, from the Grid1ron Design canvas
 * (Designer artboard, preset editor), plus the coach's saved team colors
 * and recently used colors, kept in this browser.
 */
export type NamedColor = { name: string; hex: string };

export const BRAND_COLORS: NamedColor[] = [
  { name: "Cyan", hex: "#16c8e8" },
  { name: "White", hex: "#ffffff" },
  { name: "Ink", hex: "#0b1524" },
  { name: "Amber", hex: "#d99a28" },
  { name: "Red", hex: "#d24b3e" },
  { name: "Violet", hex: "#7a6bd2" },
];

export const TEAM_COLORS: NamedColor[] = [
  { name: "Gold", hex: "#d4a017" },
  { name: "Yellow", hex: "#f5d33b" },
  { name: "Orange", hex: "#f28c28" },
  { name: "Green", hex: "#2e9e6b" },
  { name: "Forest", hex: "#1f7a4d" },
  { name: "Royal blue", hex: "#1e4fd8" },
  { name: "Navy", hex: "#0b2a5b" },
  { name: "Maroon", hex: "#6b1d2e" },
  { name: "Purple", hex: "#5b2a86" },
  { name: "Silver", hex: "#8a8f98" },
  { name: "Black", hex: "#2b2b2b" },
  { name: "Brown", hex: "#8b5a2b" },
];

const RECENT_MAX = 6;
const KEY = "grid1ronvault.colors.v1";

type ColorState = { saved: NamedColor[]; recent: string[] };
const empty: ColorState = { saved: [], recent: [] };

function read(): ColorState {
  if (typeof localStorage === "undefined") return empty;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...empty, ...(JSON.parse(raw) as ColorState) } : empty;
  } catch {
    return empty;
  }
}

let state = read();
const listeners = new Set<() => void>();

function commit(next: ColorState) {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage blocked — colors still work for this session */
  }
  listeners.forEach((l) => l());
}

/** Lower-case #rrggbb, or null if the text is not a hex color. */
export function normalizeHex(input: string): string | null {
  let v = input.trim().replace(/^#/, "").toLowerCase();
  if (/^[0-9a-f]{3}$/.test(v)) v = v.replace(/./g, (c) => c + c);
  return /^[0-9a-f]{6}$/.test(v) ? `#${v}` : null;
}

/** The name a coach sees for a color: palette or saved name, else the hex. */
export function colorName(hex: string): string {
  const h = normalizeHex(hex) ?? hex;
  return (
    [...BRAND_COLORS, ...TEAM_COLORS, ...state.saved].find((c) => c.hex === h)?.name ?? h.toUpperCase()
  );
}

export const colorStore = {
  get: () => state,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  /** Remember a color the coach just used (most recent first). */
  use(hex: string) {
    const h = normalizeHex(hex);
    if (!h) return;
    commit({ ...state, recent: [h, ...state.recent.filter((c) => c !== h)].slice(0, RECENT_MAX) });
  },
  /** Add a custom color to the team colors. Palette colors are already there. */
  saveTeamColor(hex: string, name?: string) {
    const h = normalizeHex(hex);
    if (!h || [...BRAND_COLORS, ...TEAM_COLORS, ...state.saved].some((c) => c.hex === h)) return;
    commit({ ...state, saved: [...state.saved, { name: name?.trim() || h.toUpperCase(), hex: h }] });
  },
};

export function useColors(): ColorState {
  return useSyncExternalStore(colorStore.subscribe, colorStore.get, colorStore.get);
}

/* ---- Contrast (WCAG) ---- */

function luminance(hex: string) {
  const h = normalizeHex(hex) ?? "#000000";
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** White or ink for a letter on this fill, whichever reads better. */
export function letterColor(fill: string): string {
  return contrast(fill, "#ffffff") >= contrast(fill, "#0b1524") ? "#FFFFFF" : "#0B1524";
}
