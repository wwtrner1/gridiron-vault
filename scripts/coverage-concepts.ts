/**
 * Grades the five textbook concepts with the Coverage check model and says
 * whether each still beats the coverage it was built to beat. Run it after
 * touching src/lib/coverage.ts: `npm run coverage:concepts`.
 *
 * Plays are built the way a coach draws them: 2×2 sets with the slots about
 * seven yards off the ball, routes measured in yards.
 */
import { setupScene } from "../src/lib/playSetup";
import { OFFENSE_TOKENS } from "../src/lib/presets";
import { makePath } from "../src/lib/scene";
import { checkAll, wins, yardScale, yards } from "../src/lib/coverage";
import { isLineman } from "../src/lib/formations";
import type { FieldView, PathNode, PlayerNode, Scene } from "../src/lib/types";

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
const CONCEPTS: Record<string, { routes: Partial<Record<Role, string>>; beats: string[] }> = {
  Smash: { routes: { outR: "hitch", slotR: "corner", outL: "hitch", slotL: "corner", back: "flat" }, beats: ["Cover 2", "Cover 3"] },
  Flood: { routes: { outR: "go", slotR: "out", back: "flat", outL: "post", slotL: "drag" }, beats: ["Cover 3"] },
  Mesh: { routes: { outR: "go", outL: "go", slotR: "mesh", slotL: "mesh2", back: "flat" }, beats: ["Cover 1"] },
  "Four Verts": { routes: { outR: "go", outL: "go", slotR: "seam", slotL: "seam", back: "flat" }, beats: ["Cover 3"] },
  Stick: { routes: { outR: "go", slotR: "stick", back: "flat", outL: "go", slotL: "stick" }, beats: ["Cover 3"] },
};
const SETS: { label: string; personnel: string; formation: string; view: FieldView }[] = [
  { label: "11-man", personnel: "10 personnel", formation: "Shotgun Spread", view: "half" },
  { label: "7v7", personnel: "7v7 offense", formation: "Doubles", view: "half" },
  { label: "5v5", personnel: "5-on-5 offense", formation: "Trips Right", view: "flag" },
];

function build(set: (typeof SETS)[number], concept: string): Scene {
  const { scene } = setupScene({ name: concept, personnel: set.personnel, formation: set.formation, view: set.view, book: "", newBook: "" }, OFFENSE_TOKENS);
  const sc = yardScale(scene.view);
  const players = scene.nodes.filter((n): n is PlayerNode => n.kind === "player" && n.side === "offense");
  const hasLine = players.some(isLineman);
  const qb = players.find((p) => p.label === "Q");
  const ball = players.find((p) => p.label === "C")?.x ?? 520;
  const rec = players.filter((p) => p !== qb && !isLineman(p) && !(hasLine && p.label === "C"));
  const backs = rec.filter((p) => p.y > scene.losY + 2.5 * sc.y);
  const wide = rec.filter((p) => !backs.includes(p));
  const role = new Map<PlayerNode, Role>();
  for (const side of [1, -1]) {
    const s = wide.filter((p) => (p.x - ball) * side > 0).sort((a, b) => Math.abs(b.x - ball) - Math.abs(a.x - ball));
    if (s[0]) role.set(s[0], side > 0 ? "outR" : "outL");
    if (s[1]) role.set(s[1], side > 0 ? "slotR" : "slotL");
  }
  const back = backs[0] ?? rec.find((p) => !role.has(p));
  if (back) role.set(back, "back");
  for (const [p, r] of role) {
    if (r === "slotR" || r === "slotL") p.x = ball + (r === "slotR" ? 1 : -1) * 7 * sc.x;
    const name = CONCEPTS[concept].routes[r];
    if (!name) continue;
    const out = r === "back" ? 1 : p.x >= ball ? 1 : -1;
    const pts = [{ x: 0, y: 0 }, ...ROUTES[name].map(([x, y]) => ({ x: x * out * sc.x, y: -y * sc.y }))];
    const path: PathNode = { ...makePath("line", { x: p.x, y: p.y }, pts, "#0B1524", 3, 0), fromId: p.id, tag: name };
    scene.nodes.push(path);
  }
  return scene;
}

let failed = 0;
for (const set of SETS) {
  console.log(`\n${set.label} (${set.formation})`);
  for (const concept of Object.keys(CONCEPTS)) {
    const report = checkAll(build(set, concept));
    const cells = report.results.map((r) => `${r.look.name.replace(/ \(.*\)/, "")}: ${wins(r) ? "beats" : "no"}${r.target ? ` (${r.target.label} ${r.target.route} ${yards(r.target.sep)})` : ""}`);
    // 5v5 flag has no Cover 1: its man look plays the same role.
    const named = (name: string, b: string) => name.endsWith(b) || (b === "Cover 1" && name.endsWith("Man"));
    const misses = CONCEPTS[concept].beats.filter((b) => !report.results.some((r) => named(r.look.name, b) && wins(r)));
    if (misses.length) failed++;
    console.log(`  ${misses.length ? "MISS" : " ok "} ${concept.padEnd(10)} ${cells.join(" | ")}${misses.length ? `  ← should beat ${misses.join(", ")}` : ""}`);
  }
}
if (failed) {
  console.log(`\n${failed} concept${failed === 1 ? "" : "s"} no longer beat their coverage.`);
  process.exitCode = 1;
}
