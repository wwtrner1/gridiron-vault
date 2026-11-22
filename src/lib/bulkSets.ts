import { BLOCK_SCHEMES, blockScheme } from "./blockSchemes";
import { PRESSURES, pressure, type Gold } from "./pressures";
import { LINE_BLOCKS, SKILL_BLOCKS, blockKind } from "./quickBlocks";
import { DEFENDER_JOBS, defenderJob } from "./quickDefense";
import { blockFromMenu, defaultDir, jobFromMenu, pressureFromPanel, schemeFromPanel, type Dir } from "./quickSets";
import { routeInk } from "./quickRoutes";
import { DEFAULT_STROKE, PALETTE } from "./types";
import type { PlayerNode, Scene, SceneNode } from "./types";

/**
 * Wes's blocking schemes, pressures and one-click blocks and assignments as a
 * Griddy change (`bulk_edit` op `apply_set`): "run Boom on my 4-2-5", "block
 * this inside zone to the right", "have the left guard pull and kick out",
 * "give the Mike the A gap". Griddy only names the set; the library draws it
 * the way the Designer's panels do, so the card's preview, the write and the
 * Undo all run the same code.
 *
 * Directions are the coach's screen, left or right; a play drawn from the
 * defense's end is turned round and back by the library (`onUpright`). A play
 * that can't take the set (no line to block with, no defense to pressure, no
 * such player) is skipped with the reason in the coach's words, never half drawn.
 */
export const SET_KINDS = ["scheme", "pressure", "block", "assign"] as const;
export type SetKind = (typeof SET_KINDS)[number];
export type SetSide = "left" | "right";

export type SetChange = {
  op: "apply_set";
  kind: SetKind;
  /** The scheme, pressure, block or defender job in the library (`SET_IDS`). */
  id: string;
  /** scheme, block, assign: which way, on the coach's screen. A scheme runs right unless told; a block or drop goes toward his own side. */
  dir?: SetSide;
  /** pressure: the rover's job, when the coach says (else the package's own). */
  gold?: Gold;
  /** block, assign: the player's letter (a blocker's, or a defender's). */
  letter?: string;
  /** block, assign: the left or right one when the letter is on the field twice (T, G, E, C). */
  which?: SetSide;
  /** assign with Man: the receiver's letter. */
  man?: string;
};

/** What the libraries offer, listed once here so the tool schema, the prompt and the checks can't drift from them. */
export const SET_IDS: Record<SetKind, string[]> = {
  scheme: BLOCK_SCHEMES.map((s) => s.id),
  pressure: PRESSURES.map((p) => p.id),
  block: [...new Set([...LINE_BLOCKS, ...SKILL_BLOCKS].map((b) => b.id))],
  assign: DEFENDER_JOBS.map((j) => j.id),
};
export const SET_LABELS: Record<SetKind, { id: string; label: string }[]> = {
  scheme: BLOCK_SCHEMES.map((s) => ({ id: s.id, label: s.label })),
  pressure: PRESSURES.map((p) => ({ id: p.id, label: p.label })),
  block: [...new Map([...LINE_BLOCKS, ...SKILL_BLOCKS].map((b) => [b.id, { id: b.id, label: b.label }])).values()],
  assign: DEFENDER_JOBS.map((j) => ({ id: j.id, label: j.label })),
};

const slug = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const pick = <T extends string>(v: unknown, list: readonly T[]): T | undefined => (list.includes(v as T) ? (v as T) : undefined);
const letterOf = (v: unknown) => String(v ?? "").trim().toUpperCase();
const LETTER = /^[A-Z0-9]{1,3}$/;

/** The library id for what Griddy sent, matched loosely ("Inside Zone", "pinch_mow"); undefined when the library has no such thing. */
function idIn(kind: SetKind, raw: unknown): string | undefined {
  const want = slug(String(raw ?? ""));
  if (!want) return undefined;
  return SET_LABELS[kind].find((x) => slug(x.id) === want)?.id ?? SET_LABELS[kind].find((x) => slug(x.label) === want)?.id;
}

/**
 * An `apply_set` change as Griddy sent it, checked: an id the library hasn't,
 * a block or drop with no player named and a direction that isn't left or
 * right are all dropped rather than guessed. Null when nothing usable is left.
 */
export function cleanSet(c: Record<string, unknown>): SetChange | null {
  let kind = pick(c.kind, SET_KINDS);
  // A missing kind is read from the id when only one list has it ("boom"); "trap" and "screen" are in two, so those need the kind.
  if (!kind) {
    const hits = SET_KINDS.filter((k) => idIn(k, c.id));
    if (hits.length !== 1) return null;
    kind = hits[0];
  }
  const id = idIn(kind, c.id);
  if (!id) return null;
  const dir = pick(c.dir, ["left", "right"] as const);
  const which = pick(c.which, ["left", "right"] as const);
  if (kind === "scheme") return { op: "apply_set", kind, id, ...(dir ? { dir } : {}) };
  if (kind === "pressure") {
    const gold = pick(c.gold, ["back", "free"] as const);
    return { op: "apply_set", kind, id, ...(gold ? { gold } : {}) };
  }
  const letter = letterOf(c.letter);
  if (!LETTER.test(letter)) return null;
  const man = letterOf(c.man);
  return {
    op: "apply_set",
    kind,
    id,
    letter,
    ...(dir ? { dir } : {}),
    ...(which ? { which } : {}),
    ...(kind === "assign" && id === "man" && LETTER.test(man) ? { man } : {}),
  };
}

/** These schemes have no side to run to: the status and the chip don't say one. */
const NO_SIDE = new Set(["covered", "draw", "screen", "pass-slide", "pass-man"]);
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** The change in the coach's words, for the card's chip: "Inside zone to the right", "Boom pressure", "G Pull and kick out". */
export function describeSet(c: SetChange): string {
  if (c.kind === "scheme") return `${blockScheme(c.id)?.label ?? c.id}${NO_SIDE.has(c.id) ? "" : ` to the ${c.dir ?? "right"}`}`;
  if (c.kind === "pressure") return `${pressure(c.id)?.label ?? c.id} pressure${c.gold ? `, rover ${c.gold === "back" ? "takes the back" : "is free"}` : ""}`;
  const who = `${c.which ? `${c.which === "left" ? "Left" : "Right"} ` : ""}${c.letter ?? "?"}`;
  if (c.kind === "block") return `${who}: ${blockKind(c.id)?.label ?? c.id}${c.dir ? ` ${c.dir}` : ""}`;
  return `${who}: ${defenderJob(c.id)?.label ?? c.id}${c.man ? ` on ${c.man}` : ""}${c.dir && c.id !== "man" ? ` ${c.dir}` : ""}`;
}

export type SetMade = { scene: Scene; status: string; label: string; changed: string[] } | { skip: string };

/** A number rounded for comparing nodes: turning a play round and back moves a coordinate by a rounding error, which isn't a change. Neither is a layer (`z`): drawing the same set again lays the same lines one layer higher. */
const round = (k: string, v: unknown) => (k === "z" ? undefined : typeof v === "number" ? Math.round(v * 1000) / 1000 : v);
const sig = (n: SceneNode) => JSON.stringify(n, round);

const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
};

/**
 * Lines and zones the libraries drew get ids from what they are (a line is its
 * owner's block or job; the rest by content), so drawing the same set on the
 * same play twice makes the same nodes. The card previews the set on a copy of
 * the play and then draws it on the field, and Undo finds the field's lines by
 * the preview's ids. A line that replaces an earlier one of the same kind keeps
 * its id, so it reads as changed, and Undo puts the old one back.
 */
function steady(before: SceneNode[], nodes: SceneNode[]): SceneNode[] {
  const had = new Set(before.map((n) => n.id));
  const used = new Set(nodes.filter((n) => had.has(n.id)).map((n) => n.id));
  return nodes.map((n) => {
    if (had.has(n.id)) return n;
    const key = hash(n.kind === "path" && n.assignOf ? `p|${n.assignOf}|${n.name}|${n.endCap ?? ""}|${n.style ?? ""}` : JSON.stringify({ ...n, id: "", groupId: "" }, round));
    let id = `set-${key}`;
    for (let i = 1; used.has(id); i++) id = `set-${key}-${i}`;
    used.add(id);
    return { ...n, id };
  });
}

/**
 * The scene a library call made, with every node it left alone put back as it
 * was (so a turned-round play doesn't count as changed), and the ids of the
 * nodes it added, changed or removed.
 */
function settle(before: SceneNode[], after: SceneNode[]): { nodes: SceneNode[]; changed: string[] } {
  const was = new Map(before.map((n) => [n.id, n] as const));
  const changed: string[] = [];
  const nodes = after.map((n) => {
    const old = was.get(n.id);
    if (old && sig(old) === sig(n)) return old;
    changed.push(n.id);
    return n;
  });
  const kept = new Set(after.map((n) => n.id));
  for (const n of before) if (!kept.has(n.id)) changed.push(n.id);
  return { nodes, changed };
}

/** The Designer's panels end a status with a hint about their own buttons; a card has none of them. */
const plain = (status: string) => status.replace(/ (Click any (blocker|defender) to change his (block|job)\.|Flip changes the side; drag a point to adjust\.)$/, "");

/** Plain words for the libraries' refusals, pointing at Griddy where the Designer's panels point at a library. */
const forGriddy = (reason: string) => reason.replace("Drop one from the Defense library first.", "Ask me to draw a defense first, or drop one from the Defense library.");

/** The one player a letter names, on the coach's screen: the only one, else the left or right one he said. */
function playerFor(scene: Scene, side: "offense" | "defense", letter: string, which?: SetSide): PlayerNode | { skip: string } {
  const here = scene.nodes.filter((n): n is PlayerNode => n.kind === "player" && n.side === side && !n.hidden && !n.ghostOf);
  const found = here.filter((p) => p.label.trim().toUpperCase() === letter).sort((a, b) => a.x - b.x);
  const team = side === "offense" ? "offense" : "defense";
  if (!found.length) {
    const letters = [...new Set(here.map((p) => p.label.trim()).filter(Boolean))];
    return { skip: `There's no ${letter} on the ${team}${letters.length ? ` (${letters.join(", ")})` : ""}.` };
  }
  if (found.length === 1) return found[0];
  if (which) return which === "left" ? found[0] : found[found.length - 1];
  return { skip: `There are ${found.length} ${letter}s on the ${team}. Say the left one or the right one.` };
}

const zAbove = (scene: Scene) => scene.nodes.reduce((m, n) => Math.max(m, n.z), 0) + 1;

/** Puts the set on a scene; the lines and tags are the library's own, drawn in the Designer's usual weight above everything else. */
export function applySet(scene: Scene, c: SetChange): SetMade {
  const z = zAbove(scene);
  const width = DEFAULT_STROKE;
  const dir: Dir = c.dir === "left" ? -1 : 1;
  const finish = (made: { scene: Scene; status: string; label: string }): SetMade => {
    const { nodes, changed } = settle(scene.nodes, steady(scene.nodes, made.scene.nodes));
    return changed.length ? { scene: { ...scene, nodes }, status: plain(made.status), label: made.label, changed } : { skip: `${made.label} is already on the field.` };
  };

  if (c.kind === "scheme") {
    const done = schemeFromPanel(scene, c.id, dir, { ink: PALETTE[0], width, z });
    return "error" in done ? { skip: forGriddy(done.error) } : finish(done);
  }
  if (c.kind === "pressure") {
    const done = pressureFromPanel(scene, c.id, c.gold ?? null, { width, z });
    return "error" in done ? { skip: forGriddy(done.error) } : finish(done);
  }
  if (c.kind === "block") {
    const kind = blockKind(c.id);
    const who = playerFor(scene, "offense", c.letter ?? "", c.which);
    if ("skip" in who) return who;
    const made = blockFromMenu(scene, who, c.id, c.dir ? dir : defaultDir(scene, who), { ink: routeInk(who, PALETTE[0]), width, z });
    return made ? finish(made) : { skip: `${who.label} can't ${lower(kind?.label ?? c.id)} here: there's nothing for the block to aim at. Try another block, or put a defense on the field.` };
  }
  const job = defenderJob(c.id);
  const who = playerFor(scene, "defense", c.letter ?? "", c.which);
  if ("skip" in who) return who;
  let target: PlayerNode | null = null;
  if (c.man) {
    const t = playerFor(scene, "offense", c.man);
    if ("skip" in t) return { skip: `${who.label} can't cover ${c.man}: ${lower(t.skip)}` };
    target = t;
  }
  const made = jobFromMenu(scene, who, c.id, c.dir ? dir : defaultDir(scene, who), { ink: PALETTE[0], width, z }, target);
  return made ? finish(made) : { skip: `${who.label} can't take ${job?.label ?? c.id} here.${job?.needsTarget ? " Say which receiver he has." : ""}` };
}
