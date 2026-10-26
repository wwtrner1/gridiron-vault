import { useSyncExternalStore } from "react";
import type { FieldView, PathNode, PlayerNode, Scene, StoredPlay } from "./types";

/**
 * Saved play format, from the Grid1ron Design canvas (Designer · assistant,
 * tools…): copy one play's look — colors, token fills, letters, line style,
 * field — onto other plays. The format is captured from a source play and
 * kept, so it still works if that play is later deleted.
 */
export type FormatPart = "colors" | "fills" | "letters" | "lines" | "field";

export const FORMAT_PARTS: { id: FormatPart; label: string; hint: string }[] = [
  { id: "colors", label: "Colors", hint: "Each player's route color." },
  { id: "fills", label: "Player fills", hint: "Fill, outline, shape and shade of each position." },
  { id: "letters", label: "Letters", hint: "Letter color and player size." },
  { id: "lines", label: "Line style", hint: "Line weight, solid or dashed, and line ends." },
  { id: "field", label: "Field", hint: "Field view and where the line of scrimmage sits." },
];

type TokenLook = Pick<PlayerNode, "fill" | "stroke" | "shape" | "outlineStyle" | "shade" | "textColor" | "size">;
type LineLook = Pick<PathNode, "stroke" | "width" | "style" | "endCap">;

export type PlayFormat = {
  sourceId: string;
  sourceName: string;
  /** Looks by player letter (upper case); "*" is the fallback for letters the source doesn't have. */
  tokens: Record<string, TokenLook>;
  lines: Record<string, LineLook>;
  view: FieldView;
  losY: number;
};

/** The player a line belongs to: the one it is glued or assigned to, else the one it starts on. */
function ownerOf(line: PathNode, players: PlayerNode[]): PlayerNode | undefined {
  const id = line.assignOf ?? line.fromId;
  if (id) {
    const p = players.find((x) => x.id === id);
    if (p) return p;
  }
  return players.find((p) => Math.hypot(p.x - line.x, p.y - line.y) < 30);
}

export function captureFormat(play: Pick<StoredPlay, "id" | "name" | "scene">): PlayFormat {
  const players = play.scene.nodes.filter((n): n is PlayerNode => n.kind === "player");
  const paths = play.scene.nodes.filter((n): n is PathNode => n.kind === "path" && !n.closed);
  const tokens: PlayFormat["tokens"] = {};
  for (const p of players) {
    const key = p.label.toUpperCase() || (p.side === "defense" ? "DEF" : "OFF");
    tokens[key] ??= { fill: p.fill, stroke: p.stroke, shape: p.shape, outlineStyle: p.outlineStyle, shade: p.shade, textColor: p.textColor, size: p.size };
  }
  const lines: PlayFormat["lines"] = {};
  for (const l of paths) {
    const owner = ownerOf(l, players);
    const look = { stroke: l.stroke, width: l.width, style: l.style, endCap: l.endCap };
    if (owner?.label) lines[owner.label.toUpperCase()] ??= look;
    lines["*"] ??= look;
  }
  return { sourceId: play.id, sourceName: play.name || "Untitled play", tokens, lines, view: play.scene.view, losY: play.scene.losY };
}

/** The scene with the chosen parts of the format applied; nothing else changes. */
export function applyFormat(scene: Scene, f: PlayFormat, parts: FormatPart[]): Scene {
  const on = new Set(parts);
  const players = scene.nodes.filter((n): n is PlayerNode => n.kind === "player");
  const shift = on.has("field") ? f.losY - scene.losY : 0;
  const nodes = scene.nodes.map((n) => {
    let next = shift ? { ...n, y: n.y + shift } : n;
    if (n.kind === "player") {
      const look = f.tokens[n.label.toUpperCase()];
      if (look) {
        if (on.has("fills")) next = { ...next, fill: look.fill, stroke: look.stroke, shape: look.shape, outlineStyle: look.outlineStyle, shade: look.shade } as PlayerNode;
        if (on.has("letters")) next = { ...next, textColor: look.textColor, size: look.size } as PlayerNode;
      }
    }
    if (n.kind === "path" && !n.closed) {
      const owner = ownerOf(n, players);
      const look = (owner?.label && f.lines[owner.label.toUpperCase()]) || f.lines["*"];
      if (look) {
        // The first read keeps its own color; it is how the QB's read shows on every card.
        if (on.has("colors") && !n.firstRead) next = { ...next, stroke: look.stroke } as PathNode;
        if (on.has("lines")) next = { ...next, width: look.width, style: n.style === "motion" ? n.style : look.style, endCap: n.endCap === "tee" ? "tee" : look.endCap } as PathNode;
      }
    }
    return next;
  });
  return { ...scene, nodes, ...(on.has("field") ? { view: f.view, losY: f.losY } : {}) };
}

/* ------------------------------------------------------------- the store */

const KEY = "grid1ronvault.playFormat.v1";
type State = { format: PlayFormat | null; parts: FormatPart[] };
const ALL: FormatPart[] = FORMAT_PARTS.map((p) => p.id);

function read(): State {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "null") as State | null;
    return s?.format ? { format: s.format, parts: s.parts?.length ? s.parts : ALL } : { format: null, parts: ALL };
  } catch {
    return { format: null, parts: ALL };
  }
}

let state = read();
const listeners = new Set<() => void>();
const commit = (next: State) => {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage blocked — the format still holds this session */
  }
  listeners.forEach((l) => l());
};

/** The coach's saved game-day format, remembered in this browser. */
export const formatStore = {
  get: () => state,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  saveFrom: (play: Pick<StoredPlay, "id" | "name" | "scene">) => commit({ ...state, format: captureFormat(play) }),
  setParts: (parts: FormatPart[]) => commit({ ...state, parts }),
  clear: () => commit({ ...state, format: null }),
};

export const usePlayFormat = () => useSyncExternalStore(formatStore.subscribe, formatStore.get, formatStore.get);
