import { seat } from "./formations";
import { makePlayer, OFFENSE_TOKENS, DEFENSE_TOKENS } from "./presets";
import { makeShape, makeText } from "./scene";
import { baseNode, CANVAS_W, DEFAULT_STROKE, FIRST_READ, type EndCap, type LineStyle, type PathNode, type PlayerNode, type Scene, type SceneNode, type StoredPlay } from "./types";
import type { Term } from "./termsData";

/**
 * What a Playbook language term looks like on the field. Every starter term
 * has its own small teaching diagram drawn here (not a copy of a starter
 * play, so the plan limits on starters still hold); a coach's own term shows
 * the Vault play they picked as its example, else the first Vault play that
 * uses the word. Pure: the page and its tests read the same scenes.
 */

const LOS = 430;
const CX = CANVAS_W / 2;
/** A yard on the half field. */
const Y = 14.4;
const INK = "#0B1524";
const RUN = "#D24B3E";
const DEF = "#9e3428";
const GAP_FILL = "#16C8E8";
const MUTED = "#5b6b80";

const preset = (code: string) => [...OFFENSE_TOKENS, ...DEFENSE_TOKENS].find((t) => t.code === code)!;

type Draw = { nodes: SceneNode[]; z: number };
const start = (): Draw => ({ nodes: [], z: 100 });

/** An offense player `dy` units off the ball (0 = on the line). */
function off(d: Draw, code: string, x: number, dy = 0, label?: string): PlayerNode {
  const p = { ...makePlayer(preset(code), x, LOS + seat(dy)), z: 300 + d.nodes.length };
  if (label !== undefined) p.label = label;
  d.nodes.push(p);
  return p;
}

/** A lineman: a plain square with his letter. */
function lineman(d: Draw, x: number, label: string): PlayerNode {
  const p: PlayerNode = { ...makePlayer(preset("C"), x, LOS + seat(0)), label, fill: "#E4EAF1", stroke: INK, textColor: INK, z: 300 + d.nodes.length };
  d.nodes.push(p);
  return p;
}

/** A defender `depth` units off the ball (negative is up the field). */
function def(d: Draw, x: number, depth: number, label: string, job?: string): PlayerNode {
  const p: PlayerNode = { ...makePlayer(preset("LB"), x, LOS + depth), label, fill: "#D24B3E", stroke: DEF, z: 320 + d.nodes.length };
  if (job) p.job = job;
  d.nodes.push(p);
  return p;
}

type LineOpts = { color?: string; style?: LineStyle; end?: EndCap; read?: boolean };

/** A line from a player (or a point) through steps of [dx, dy]. */
function line(d: Draw, from: { x: number; y: number }, steps: [number, number][], o: LineOpts = {}): PathNode {
  const points = [{ x: 0, y: 0 }];
  let x = 0;
  let y = 0;
  for (const [dx, dy] of steps) {
    x += dx;
    y += dy;
    points.push({ x, y });
  }
  const node: PathNode = {
    ...baseNode({ x: from.x, y: from.y, z: d.z++, name: "Route" }),
    kind: "path",
    points,
    handles: {},
    style: o.style ?? "solid",
    curve: "straight",
    startCap: "none",
    endCap: o.end ?? "arrow",
    stroke: o.read ? FIRST_READ : o.color ?? INK,
    width: DEFAULT_STROKE,
    closed: false,
    fill: "none",
    fillOpacity: 0.16,
    fromId: null,
    toId: null,
  };
  if (o.read) node.firstRead = true;
  d.nodes.push(node);
  return node;
}

function label(d: Draw, x: number, y: number, text: string, color = MUTED, size = 16) {
  d.nodes.push({ ...makeText({ x, y }, text, color, d.z++), fontSize: size });
}

function shade(d: Draw, x: number, w = 38) {
  d.nodes.push({ ...makeShape("ellipse", { x, y: LOS - 14 }, w, 46, GAP_FILL, 50), fill: GAP_FILL, fillOpacity: 0.28, width: 1.6 });
}

const scene = (d: Draw): Scene => ({ version: 2, view: "half", width: CANVAS_W, height: 660, losY: LOS, pivot: null, nodes: d.nodes });

/* ------------------------------------------------------------- offense */

/** Center and quarterback, the ball for every passing diagram. */
function core(d: Draw) {
  return { c: off(d, "C", CX), q: off(d, "QB", CX, 60) };
}

const OFFENSE: Record<string, () => Draw> = {
  "glossary-flood": () => {
    const d = start();
    core(d);
    off(d, "X", 180);
    const y = off(d, "Y", 720, 30);
    const z = off(d, "Z", 860);
    const h = off(d, "RB", 580, 70);
    line(d, z, [[0, -10 * Y], [60, -6 * Y]]);
    line(d, y, [[0, -10 * Y], [120, 0]], { read: true });
    line(d, h, [[100, -2 * Y], [130, -Y]]);
    label(d, 990, LOS - 13 * Y, "Deep", MUTED, 14);
    label(d, 990, LOS - 9 * Y, "Middle", MUTED, 14);
    label(d, 990, LOS - 3 * Y, "Flat", MUTED, 14);
    return d;
  },
  "glossary-mesh": () => {
    const d = start();
    core(d);
    const x = off(d, "X", 300, 30);
    const y = off(d, "Y", 740, 30);
    off(d, "Z", 880);
    line(d, x, [[40, -4 * Y], [380, 0]], { read: true });
    line(d, y, [[-40, -5 * Y], [-380, 0]]);
    label(d, CX, LOS - 7 * Y, "Cross about 4 yards deep");
    return d;
  },
  "glossary-smash": () => {
    const d = start();
    core(d);
    off(d, "X", 180);
    const y = off(d, "Y", 720, 30);
    const z = off(d, "Z", 860);
    line(d, z, [[0, -5 * Y], [0, 14]], { read: true });
    line(d, y, [[0, -10 * Y], [100, -5 * Y]]);
    return d;
  },
  "glossary-scissors": () => {
    const d = start();
    core(d);
    off(d, "X", 180);
    const y = off(d, "Y", 720, 30);
    const z = off(d, "Z", 860);
    line(d, z, [[0, -10 * Y], [-110, -7 * Y]]);
    line(d, y, [[0, -10 * Y], [130, -7 * Y]], { read: true });
    return d;
  },
  "glossary-dagger": () => {
    const d = start();
    core(d);
    off(d, "X", 180);
    const y = off(d, "Y", 720, 30);
    const z = off(d, "Z", 860);
    line(d, z, [[0, -18 * Y]]);
    line(d, y, [[0, -14 * Y], [-220, 0]], { read: true });
    def(d, 640, -7 * Y, "L");
    return d;
  },
  "glossary-levels": () => {
    const d = start();
    core(d);
    off(d, "X", 180);
    const y = off(d, "Y", 720, 30);
    const z = off(d, "Z", 860);
    line(d, y, [[0, -5 * Y], [-200, 0]], { read: true });
    line(d, z, [[0, -12 * Y], [-300, 0]]);
    return d;
  },
  "glossary-trips-right": () => {
    const d = start();
    core(d);
    off(d, "X", 180);
    off(d, "RB", 640, 30);
    off(d, "Y", 740, 30);
    off(d, "Z", 870);
    label(d, 760, LOS + 100, "H · Y · Z right", MUTED, 14);
    return d;
  },
  "glossary-bunch": () => {
    const d = start();
    core(d);
    off(d, "X", 180);
    off(d, "Y", 760);
    off(d, "Z", 720, 40);
    off(d, "RB", 800, 40);
    return d;
  },
  "glossary-stack": () => {
    const d = start();
    core(d);
    off(d, "X", 180);
    off(d, "Z", 820);
    off(d, "Y", 820, 50);
    return d;
  },
  "glossary-twins": () => {
    const d = start();
    core(d);
    off(d, "X", 180);
    off(d, "Y", 720, 30);
    off(d, "Z", 860);
    return d;
  },
  "glossary-bubble": () => {
    const d = start();
    const { q } = core(d);
    off(d, "X", 180);
    const y = off(d, "Y", 720, 30);
    const z = off(d, "Z", 860);
    line(d, y, [[30, 26], [60, 8], [50, -12]], { read: true });
    line(d, z, [[0, -2 * Y]], { end: "tee" });
    line(d, q, [[180, -10]], { style: "dashed", color: "#F2A63B" });
    return d;
  },
  "glossary-motion": () => {
    const d = start();
    core(d);
    off(d, "X", 180);
    const z = off(d, "Z", 860, 30);
    off(d, "Y", 720, 30);
    line(d, z, [[-320, 0]], { style: "motion" });
    label(d, 700, LOS + 100, "Before the snap", MUTED, 14);
    return d;
  },
};

/* ------------------------------------------------------- the line, 11-man */

/**
 * Blockers in the line diagrams stand a little wider than on the Designer's
 * field (64 units, not 50), so every gap keeps room for its letter: a printed
 * diagram leaves off labels that would overlap.
 */
const S = 64;
/** How far off a blocker's middle a shaded defender lines up. */
const SH = 20;

/** Center, guards, tackles and a tight end to the right; the quarterback under center. */
function line11(d: Draw, wing = false) {
  lineman(d, CX - 2 * S, "T");
  lineman(d, CX - S, "G");
  lineman(d, CX, "C");
  lineman(d, CX + S, "G");
  lineman(d, CX + 2 * S, "T");
  off(d, "Y", CX + 3 * S, 0, "Y");
  if (wing) off(d, "H", CX + 3.9 * S, 18, "W");
  off(d, "QB", CX, 40);
}

/** Gap middles, ball out: A, B, C each side, D and E to the tight end's side. */
const GAP_X: Record<string, number[]> = {
  A: [CX - S / 2, CX + S / 2],
  B: [CX - 1.5 * S, CX + 1.5 * S],
  C: [CX - 2.5 * S, CX + 2.5 * S],
  D: [CX + 3.5 * S],
  E: [CX + 4.4 * S],
};

function gapLetters(d: Draw, only?: string) {
  for (const [letter, xs] of Object.entries(GAP_X)) {
    if (letter === "E" && only !== "E") continue;
    for (const x of xs) label(d, x, LOS - 64, letter, only === letter ? INK : "#9aa7b8", 15);
  }
}

/** Where a defender lines up for each technique, strength right. */
const TECH_X: Record<string, number> = {
  "0": CX,
  "1": CX + SH,
  "2i": CX + S - SH,
  "2": CX + S,
  "3": CX + S + SH,
  "4i": CX + 2 * S - SH,
  "4": CX + 2 * S,
  "5": CX + 2 * S + SH,
  "6": CX + 3 * S,
  "7": CX + 3 * S - SH,
  "9": CX + 3 * S + SH,
};

function gapDiagram(id: string): Draw | null {
  const gap = /^glossary-([a-e])-gap$/.exec(id);
  if (gap) {
    const letter = gap[1].toUpperCase();
    const d = start();
    line11(d, letter === "E");
    for (const x of GAP_X[letter]) shade(d, x, 44);
    gapLetters(d, letter);
    return d;
  }
  const tech = /^glossary-(\d+i?)-technique$/.exec(id);
  if (tech) {
    const n = tech[1];
    const d = start();
    line11(d);
    gapLetters(d);
    def(d, TECH_X[n], -40, n);
    return d;
  }
  const d = start();
  switch (id) {
    case "glossary-one-gap": {
      line11(d);
      gapLetters(d, "B");
      shade(d, GAP_X.B[1], 44);
      const t = def(d, TECH_X["3"], -40, "3");
      line(d, t, [[8, 34]], { color: DEF });
      return d;
    }
    case "glossary-two-gap": {
      line11(d);
      gapLetters(d);
      shade(d, GAP_X.B[1], 44);
      shade(d, GAP_X.C[1], 44);
      const t = def(d, TECH_X["4"], -40, "4");
      line(d, t, [[-26, 30]], { color: DEF });
      line(d, t, [[26, 30]], { color: DEF });
      return d;
    }
    case "glossary-contain": {
      line11(d);
      const h = off(d, "RB", CX, 90, "H");
      const e = def(d, CX + 4.4 * S, -50, "E", "Contain");
      line(d, h, [[3.6 * S, -40], [-40, -70]], { color: RUN });
      line(d, e, [[-20, 50]], { color: DEF, end: "tee" });
      label(d, CX + 2.6 * S, LOS - 130, "Turned back inside", MUTED, 14);
      return d;
    }
    case "glossary-spill": {
      line11(d);
      gapLetters(d, "B");
      const h = off(d, "RB", CX, 90, "H");
      const lb = def(d, GAP_X.B[1], -96, "M", "Spill");
      line(d, lb, [[0, 80]], { color: DEF, end: "tee" });
      line(d, h, [[1.5 * S, -50], [2.4 * S, -20], [30, -80]], { color: RUN });
      label(d, CX + 4.4 * S, LOS - 130, "Bounced wide", MUTED, 14);
      return d;
    }
    case "glossary-hole-numbers": {
      line11(d);
      const holes: [number, string][] = [
        [CX - 3.5 * S, "7"],
        [CX - 2.5 * S, "5"],
        [CX - 1.5 * S, "3"],
        [CX - S / 2, "1"],
        [CX + S / 2, "2"],
        [CX + 1.5 * S, "4"],
        [CX + 2.5 * S, "6"],
        [CX + 3.5 * S, "8"],
      ];
      for (const [x, n] of holes) label(d, x, LOS - 50, n, INK, 22);
      return d;
    }
  }
  return null;
}

/** The starter glossary's own diagram for a starter term id, or null for a coach's own term. */
export function glossaryScene(id: string): Scene | null {
  const build = OFFENSE[id];
  const d = build ? build() : gapDiagram(id);
  return d ? scene(d) : null;
}

/** Every starter term id that has a diagram (all of them; the test holds the list to it). */
export const GLOSSARY_DIAGRAMS = Object.keys(OFFENSE);

const norm = (s: string) => s.trim().toLowerCase();

/** Vault plays that use a term in their name, formation or labels, best match first (name, then formation, then labels). */
export function playsUsing(term: string, plays: StoredPlay[]): StoredPlay[] {
  const t = norm(term);
  if (!t) return [];
  const re = new RegExp(`(^|[^a-z0-9])${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^a-z0-9])`);
  const score = (p: StoredPlay) => (re.test(p.name.toLowerCase()) ? 0 : re.test((p.formation ?? "").toLowerCase()) ? 1 : 2);
  return plays.filter((p) => re.test([p.name, p.formation, ...p.tags].join(" · ").toLowerCase())).sort((a, b) => score(a) - score(b));
}

export type TermExample = {
  scene: Scene;
  /** Where the picture came from, said to the coach. */
  caption: string;
  kind: "picked" | "glossary" | "vault";
  playId?: string;
};

/**
 * The picture for a term: the play the coach picked, else the glossary's own
 * diagram (a renamed starter term keeps it, since it follows the id), else
 * the first Vault play that uses the word. Null when there is nothing to show.
 */
export function exampleFor(t: Term, plays: StoredPlay[]): TermExample | null {
  const picked = t.exampleId ? plays.find((p) => p.id === t.exampleId) : undefined;
  if (picked) return { scene: picked.scene, caption: `Your example: ${picked.name}`, kind: "picked", playId: picked.id };
  const glossary = glossaryScene(t.id);
  if (glossary) return { scene: glossary, caption: "Starter glossary diagram", kind: "glossary" };
  const used = playsUsing(t.term, plays)[0];
  if (used) return { scene: used.scene, caption: `From your Vault: ${used.name}`, kind: "vault", playId: used.id };
  return null;
}
