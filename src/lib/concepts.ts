/**
 * The five textbook pass concepts, drawn fresh the way a coach would draw
 * them: 2×2 or trips sets with the slots about seven yards off the ball and
 * routes measured in yards. They are teaching diagrams of our own, never
 * copies of the starter plays, so the Concept Library can be open to anyone
 * without giving the paid library away. `npm run coverage:concepts` grades
 * the same scenes with the Coverage check.
 */
import { setupScene } from "./playSetup";
import { OFFENSE_TOKENS } from "./presets";
import { makePath } from "./scene";
import { yardScale } from "./coverage";
import { isLineman } from "./formations";
import type { FieldView, PathNode, PlayerNode, Scene } from "./types";

type Leg = [number, number]; // yards: x toward the near sideline, y upfield
const ROUTES: Record<string, Leg[]> = {
  go: [[0, 16]],
  seam: [[0.5, 16]],
  hitch: [[0, 5], [-0.3, 4.5]],
  corner: [[0, 9], [5, 16]],
  out: [[0, 8], [6, 8]],
  flat: [[4, 1], [8, 2]],
  drag: [[0, 2], [-14, 3]],
  mesh: [[0, 4], [-14, 4.5]],
  mesh2: [[0, 5], [-14, 5.5]],
  stick: [[0, 5], [-1, 5]],
  post: [[0, 8], [-5, 15]],
};
type Role = "outR" | "slotR" | "outL" | "slotL" | "back";

export type Concept = {
  id: string;
  name: string;
  /** One sentence a coach would say to a player. */
  why: string;
  /** What the defense has to choose between. */
  read: string;
  routes: Partial<Record<Role, string>>;
  /** The coverages it was built to beat. */
  beats: string[];
};

export const CONCEPTS: Concept[] = [
  {
    id: "smash",
    name: "Smash",
    why: "A short hitch under a corner route puts one defender in a bind.",
    read: "Watch the cornerback. If he sits on the hitch, throw the corner route behind him. If he sinks, the hitch is free.",
    routes: { outR: "hitch", slotR: "corner", outL: "hitch", slotL: "corner", back: "flat" },
    beats: ["Cover 2", "Cover 3"],
  },
  {
    id: "flood",
    name: "Flood",
    why: "Three receivers at three depths on one side, where a zone has only two defenders.",
    read: "Read it deep to short. The out route in the middle level is usually the one left alone.",
    routes: { outR: "go", slotR: "out", back: "flat", outL: "post", slotL: "drag" },
    beats: ["Cover 3"],
  },
  {
    id: "mesh",
    name: "Mesh",
    why: "Two receivers cross so close together that the men covering them run into each other.",
    read: "Against man, throw to the crosser who comes out of the traffic a step ahead of his defender.",
    routes: { outR: "go", outL: "go", slotR: "mesh", slotL: "mesh2", back: "flat" },
    beats: ["Cover 1"],
  },
  {
    id: "four-verts",
    name: "Four Verts",
    why: "Send every receiver straight up the field: more deep routes than the defense has deep defenders.",
    read: "Find the deep middle defender. Throw the seam he turns away from.",
    routes: { outR: "go", outL: "go", slotR: "seam", slotL: "seam", back: "flat" },
    beats: ["Cover 3"],
  },
  {
    id: "stick",
    name: "Stick",
    why: "A quick sit route next to a flat route. The flat defender can only take one.",
    read: "Watch the flat defender. If he runs with the flat route, throw the stick. If he stays, throw the flat.",
    routes: { outR: "go", slotR: "stick", back: "flat", outL: "go", slotL: "stick" },
    beats: ["Cover 3"],
  },
];

export type ConceptSet = { id: "5" | "7" | "11"; label: string; personnel: string; formation: string; view: FieldView };
export const CONCEPT_SETS: ConceptSet[] = [
  { id: "11", label: "11-man", personnel: "10 personnel", formation: "Shotgun Spread", view: "half" },
  { id: "7", label: "7v7", personnel: "7v7 offense", formation: "Doubles", view: "half" },
  { id: "5", label: "5v5", personnel: "5-on-5 offense", formation: "Trips Right", view: "flag" },
];

/**
 * What anyone can watch without a plan (Wes, 2026-11-18): three concepts, each against
 * one defensive scheme. The other concepts and the other defenses open with a plan
 * that opens the whole library (`Tier.allStarters`).
 */
export const PUBLIC_CONCEPTS = ["smash", "flood", "mesh"];
export const PUBLIC_LOOK = "Cover 3";
export const conceptOpen = (whole: boolean, id: string) => whole || PUBLIC_CONCEPTS.includes(id);

export const conceptById = (id: string | null) => CONCEPTS.find((c) => c.id === id);
export const conceptSet = (id: string | null) => CONCEPT_SETS.find((s) => s.id === id);

/** The concept drawn for one game: a real scene, the same kind the Designer saves. */
export function conceptScene(set: ConceptSet, concept: Concept): Scene {
  const { scene } = setupScene({ name: concept.name, personnel: set.personnel, formation: set.formation, view: set.view, pov: "offense", book: "", newBook: "" }, OFFENSE_TOKENS);
  const sc = yardScale(scene.view);
  const players = scene.nodes.filter((n): n is PlayerNode => n.kind === "player" && n.side === "offense");
  const hasLine = players.some(isLineman);
  const qb = players.find((p) => p.label === "Q");
  const ball = players.find((p) => p.label === "C")?.x ?? 520;
  const rec = players.filter((p) => p !== qb && !isLineman(p) && !(hasLine && p.label === "C"));
  const backs = rec.filter((p) => p.y > scene.losY + 4 * sc.y);
  const wide = rec.filter((p) => !backs.includes(p));
  const role = new Map<PlayerNode, Role>();
  for (const side of [1, -1]) {
    const s = wide.filter((p) => (p.x - ball) * side > 0).sort((a, b) => Math.abs(b.x - ball) - Math.abs(a.x - ball));
    if (s[0]) role.set(s[0], side > 0 ? "outR" : "outL");
    if (s[1]) role.set(s[1], side > 0 ? "slotR" : "slotL");
  }
  const back = backs[0] ?? rec.find((p) => !role.has(p));
  if (back) role.set(back, "back");
  // 5v5: the center plays the back's part, and the receiver left over is the slot on the other side,
  // so Mesh still has its two crossers and Flood its drag.
  const spare = rec.find((p) => !role.has(p));
  if (spare && ![...role.values()].includes("slotL")) role.set(spare, "slotL");
  for (const [p, r] of role) {
    if (r === "slotR" || r === "slotL") p.x = ball + (r === "slotR" ? 1 : -1) * 7 * sc.x;
    const name = concept.routes[r];
    if (!name) continue;
    const out = r === "back" ? 1 : p.x >= ball ? 1 : -1;
    const pts = [{ x: 0, y: 0 }, ...ROUTES[name].map(([x, y]) => ({ x: x * out * sc.x, y: -y * sc.y }))];
    const path: PathNode = { ...makePath("line", { x: p.x, y: p.y }, pts, "#0B1524", 3, 0), fromId: p.id, tag: name.replace(/\d$/, "") };
    scene.nodes.push(path);
  }
  return scene;
}
