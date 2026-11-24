import { useSyncExternalStore } from "react";
import { OFFENSE_TOKENS, type TokenPreset } from "./presets";
import { brandStore } from "./brand";
import { colorName, letterColor, normalizeHex } from "./colors";

/**
 * Default position colors, as the Designer's "Edit defaults" leaves them.
 * The canvas defaults live in presets.ts; a coach's changes are kept in this
 * browser and apply to every player dropped in the Designer (tray and
 * formations). Starter plays keep the canvas colors.
 *
 * Player look history (Wes, 2026-11-21): recoloring a lettered offense
 * player in the Designer saves that letter's color here, and the fills ride
 * to the account in the team brand (`TeamBrand.letterColors`), so the next
 * player of that letter comes out the same on every device.
 */
export type PositionOverride = { fill?: string; shape?: "circle" | "square" };

/** Canvas legend names for the default colors. */
const DEFAULT_NAMES: Record<string, string> = {
  Q: "black",
  C: "cyan",
  X: "blue",
  Y: "red",
  Z: "green",
  H: "orange",
  S: "light purple",
};

const KEY = "grid1ronvault.positions.v1";
type State = Record<string, PositionOverride>;

function read(): State {
  if (typeof localStorage === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as State;
  } catch {
    return {};
  }
}

let state: State = read();
let tokens = build(state);
const listeners = new Set<() => void>();

/** The positions a coach can recolor: the lettered offense tokens (not the ball). */
const POSITIONS = OFFENSE_TOKENS.filter((t) => t.side === "offense" && t.label);

function build(s: State): TokenPreset[] {
  return OFFENSE_TOKENS.map((t) => {
    const o = s[t.label];
    if (!o || t.side !== "offense") return t;
    const fill = o.fill ?? t.fill;
    return {
      ...t,
      fill,
      stroke: fill,
      textColor: o.fill ? letterColor(fill) : t.textColor,
      shape: o.shape ?? t.shape,
    };
  });
}

function commit(next: State) {
  state = next;
  tokens = build(state);
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage blocked — defaults still apply this session */
  }
  listeners.forEach((l) => l());
}

/** The fills the coach chose, letter → hex, as the account keeps them. */
function fills(s: State): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(s)) if (v.fill) out[k] = v.fill.toUpperCase();
  return out;
}
const same = (a: Record<string, string>, b: Record<string, string>) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());

function toAccount(next: State) {
  try {
    brandStore.set({ letterColors: fills(next) });
  } catch {
    /* storage full — the colors still apply in this browser */
  }
}

// Another device's colors arriving through the brand replace this browser's (shapes stay).
brandStore.subscribe(() => {
  const remote = brandStore.get().letterColors;
  if (!remote || same(remote, fills(state))) return;
  const next: State = {};
  for (const [k, v] of Object.entries(state)) if (v.shape) next[k] = { shape: v.shape };
  for (const [k, fill] of Object.entries(remote)) next[k] = { ...next[k], fill };
  commit(next);
});

export const positionStore = {
  get: () => tokens,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  set(label: string, patch: PositionOverride) {
    const fill = patch.fill ? normalizeHex(patch.fill) ?? undefined : undefined;
    commit({ ...state, [label]: { ...state[label], ...patch, ...(fill ? { fill } : {}) } });
    if (fill) toAccount(state);
  },
  reset() {
    commit({});
    toAccount(state);
  },
  /** The color a letter was last given in the Designer, if the coach changed it. */
  fillOf: (label: string) => state[label]?.fill,
  isCustom: () => Object.keys(state).length > 0,
};

/** Offense tokens with the coach's default position colors applied. */
export function usePositionTokens(): TokenPreset[] {
  return useSyncExternalStore(positionStore.subscribe, positionStore.get, positionStore.get);
}

/** The recolorable positions, in canvas order (Q C X Y Z H S). */
export function positionKey(all: TokenPreset[]): TokenPreset[] {
  return POSITIONS.map((p) => all.find((t) => t.code === p.code) ?? p);
}

/** "Q black · C cyan · …" — the canvas legend, naming custom colors too. */
export function positionLegend(all: TokenPreset[]): string {
  return positionKey(all)
    .map((t) => {
      const original = POSITIONS.find((p) => p.code === t.code);
      const name =
        original && normalizeHex(original.fill) === normalizeHex(t.fill)
          ? DEFAULT_NAMES[t.label]
          : colorName(t.fill).toLowerCase();
      return `${t.label} ${name}`;
    })
    .join(" · ");
}
