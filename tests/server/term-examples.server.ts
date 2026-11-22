import assert from "node:assert/strict";
import { test } from "node:test";
import { CARD_LOOK, frameScene } from "../../src/lib/printLook";
import { glossaryScene } from "../../src/lib/termExamples";
import { BLOCKING_DIAGRAMS } from "../../src/lib/termExamplesBlocking";
import { BLOCK_GLOSSARY, DEFENSE_GLOSSARY, GAP_GLOSSARY, STARTER_GLOSSARY, TERM_LIMITS } from "../../src/lib/termsData";
import type { PathNode, PlayerNode, Scene, SceneNode, TextNode } from "../../src/lib/types";

/**
 * The starter glossary's own diagrams (`lib/termExamples.ts`), read the way
 * the Playbook language page draws them: nothing is drawn over a label, and
 * the two terms where a defender takes on a block (Spill, Contain) show that
 * block and which side of it he wins. The blocking and defensive-call terms
 * (`lib/termExamplesBlocking.ts`) are drawn by the Designer's own one-click
 * blocks, block schemes and pressures, so these tests also hold them to that:
 * every block is a T-ended line glued to a lineman, every call a line glued to
 * a defender, and no route tag is lost to print framing.
 */
type Point = { x: number; y: number };
type Box = { x: number; y: number; w: number; h: number };

/** The example dialog and the hover peek, in inches (`PlaybookLanguage.tsx`); the table thumbnail is too small to read a label on. */
const SIZES: [string, number, number][] = [
  ["dialog", 6, 3.6],
  ["peek", 3.2, 2.1],
];

const ids = [...STARTER_GLOSSARY, ...GAP_GLOSSARY, ...BLOCK_GLOSSARY, ...DEFENSE_GLOSSARY].map((t) => t.id);
const players = (nodes: SceneNode[]) => nodes.filter((n): n is PlayerNode => n.kind === "player");
const paths = (nodes: SceneNode[]) => nodes.filter((n): n is PathNode => n.kind === "path");
const texts = (nodes: SceneNode[]) => nodes.filter((n): n is TextNode => n.kind === "text");
const world = (l: PathNode): Point[] => l.points.map((p) => ({ x: l.x + p.x, y: l.y + p.y }));
const end = (l: PathNode) => world(l).at(-1)!;

/** The letters of a label as drawn: centred on its spot. */
const textBox = (t: TextNode): Box => {
  const w = t.text.length * t.fontSize * 0.56;
  return { x: t.x - w / 2, y: t.y - t.fontSize / 2, w, h: t.fontSize };
};

/** A player's job tag as `PlayerGlyph` draws it: above a defender, below an offense player. */
const jobBox = (p: PlayerNode): Box | null => {
  if (!p.job) return null;
  const size = Math.max(11, p.size * 0.4);
  const r = p.size / 2;
  const base = p.side === "defense" ? p.y - (r + 5) : p.y + r + Math.max(12, p.size * 0.42);
  const w = p.job.length * size * 0.5;
  return { x: p.x - w / 2, y: base - size * 0.8, w, h: size };
};

/** How near a line comes to a box, walking the line two units at a time. */
function gap(line: Point[], box: Box): number {
  let best = Infinity;
  for (let i = 0; i + 1 < line.length; i++) {
    const [a, b] = [line[i], line[i + 1]];
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 2));
    for (let s = 0; s <= steps; s++) {
      const x = a.x + ((b.x - a.x) * s) / steps;
      const y = a.y + ((b.y - a.y) * s) / steps;
      best = Math.min(best, Math.hypot(Math.max(box.x - x, 0, x - box.x - box.w), Math.max(box.y - y, 0, y - box.y - box.h)));
    }
  }
  return best;
}

const drawn = (id: string, w: number, h: number): Scene => {
  const scene = glossaryScene(id);
  assert.ok(scene, `${id} has a diagram`);
  return frameScene(scene, CARD_LOOK, w, h).scene;
};

test("no starter diagram draws a line over a label or leaves a label off", () => {
  assert.equal(ids.length, 65);
  for (const id of ids) {
    for (const [size, w, h] of SIZES) {
      const { nodes } = drawn(id, w, h);
      const at = `${id} in the ${size}`;
      const labels = texts(nodes);
      // Print framing hides a label that would sit on another; none may go missing.
      assert.deepEqual(labels.filter((t) => t.hidden).map((t) => t.text), [], `${at}: every label is shown`);
      // Print framing silently blanks a route tag that would sit on another label; none of the starters' may go.
      const before = new Map(paths(glossaryScene(id)!.nodes).flatMap((l) => (l.tag ? [[l.id, l.tag] as const] : [])));
      for (const line of paths(nodes)) if (before.has(line.id)) assert.equal(line.tag, before.get(line.id), `${at}: the tag "${before.get(line.id)}" is kept`);
      const tags = players(nodes).flatMap((p) => (p.job ? [{ text: p.job, box: jobBox(p)! }] : []));
      for (const line of paths(nodes)) {
        for (const label of [...labels.map((t) => ({ text: t.text, box: textBox(t) })), ...tags]) {
          const clear = gap(world(line), label.box) - line.width / 2;
          assert.ok(clear > 2, `${at}: a line runs over "${label.text}"`);
        }
      }
    }
  }
});

/**
 * The two terms where a defender takes on a block show that block: an offense
 * player's T-ended line stops on the defender (or where his own T-ended line
 * stops), so the picture says what the offense did to create the technique.
 */
test("Spill and Contain show the block the defender takes on", () => {
  for (const id of ["glossary-spill", "glossary-contain"]) {
    const scene = glossaryScene(id);
    assert.ok(scene, `${id} has a diagram`);
    const lines = paths(scene.nodes).filter((l) => l.endCap === "tee");
    const owner = (l: PathNode) => players(scene.nodes).find((p) => p.x === l.x && p.y === l.y);
    const blocks = lines.filter((l) => owner(l)?.side === "offense");
    const holds = lines.filter((l) => owner(l)?.side === "defense");
    assert.ok(blocks.length >= 1, `${id}: an offense player blocks`);
    assert.equal(holds.length, 1, `${id}: the defender's own line ends in a T`);
    const defender = owner(holds[0])!;
    const meets = blocks.some((b) => {
      const to = end(b);
      return Math.hypot(to.x - defender.x, to.y - defender.y) <= 30 || Math.hypot(to.x - end(holds[0]).x, to.y - end(holds[0]).y) <= 24;
    });
    assert.ok(meets, `${id}: the block ends on the defender`);
  }
});

const BLOCKS = BLOCK_GLOSSARY.map((t) => t.id);
const CALLS = DEFENSE_GLOSSARY.map((t) => t.id);
const ownerOf = (scene: Scene, l: PathNode) => players(scene.nodes).find((p) => p.id === l.assignOf);

test("the blocking and defensive-call terms are all drawn by their own file, with real wording and one name each", () => {
  assert.deepEqual([...BLOCKING_DIAGRAMS].sort(), [...BLOCKS, ...CALLS].sort(), "a diagram for every new term and nothing else");
  const names = [...STARTER_GLOSSARY, ...GAP_GLOSSARY, ...BLOCK_GLOSSARY, ...DEFENSE_GLOSSARY].map((t) => t.term.trim().toLowerCase());
  assert.equal(new Set(names).size, names.length, "no two starter terms share a name");
  assert.equal(new Set(ids).size, ids.length, "no two starter terms share an id");
  // The seeded list is capped at 200 ids; Griddy only reads the first 80 terms, so the new ones come after the old.
  assert.ok(ids.length <= 200, "every starter id fits the seeded list");
  assert.deepEqual(ids.slice(0, 33), [...STARTER_GLOSSARY, ...GAP_GLOSSARY].map((t) => t.id), "the older starters keep their places");
  for (const t of [...BLOCK_GLOSSARY, ...DEFENSE_GLOSSARY]) {
    assert.ok(t.means.length > 20 && t.means.length <= TERM_LIMITS.means, `${t.term}: a meaning of one or two plain sentences`);
    assert.ok(t.term.length <= TERM_LIMITS.term && !/[/()]/.test(t.term), `${t.term}: a name that makes a clean id`);
    assert.equal(t.id, `glossary-${t.term.toLowerCase().replace(/\s+/g, "-")}`);
  }
});

test("each block term shows T-ended blocks glued to offense players", () => {
  for (const id of BLOCKS) {
    const scene = glossaryScene(id)!;
    const blocks = paths(scene.nodes).filter((l) => l.endCap === "tee");
    assert.ok(blocks.length >= 1, `${id}: a block is drawn`);
    for (const b of blocks) {
      const who = ownerOf(scene, b);
      assert.equal(who?.side, "offense", `${id}: the block belongs to an offense player`);
      assert.ok(b.points.length >= 2 && b.points.every((p) => Number.isFinite(p.x + p.y)), `${id}: a real line`);
    }
    // Wes's blockers are linemen (and the tight end); the only other line is a ball carrier's run.
    for (const l of paths(scene.nodes).filter((l) => l.endCap !== "tee")) assert.equal(l.name, "Run", `${id}: ${l.name} isn't a block or a run`);
    assert.ok(players(scene.nodes).some((p) => p.side === "defense"), `${id}: there is a defense to block`);
  }
});

test("each defensive call shows lines glued to defenders, and the 4-2-5 shows all eleven", () => {
  for (const id of CALLS.filter((c) => c !== "glossary-4-2-5")) {
    const scene = glossaryScene(id)!;
    const lines = paths(scene.nodes);
    assert.ok(lines.length >= 1, `${id}: a call is drawn`);
    for (const l of lines) assert.equal(ownerOf(scene, l)?.side, "defense", `${id}: "${l.name}" belongs to a defender`);
  }
  const front = glossaryScene("glossary-4-2-5")!;
  const defense = players(front.nodes).filter((p) => p.side === "defense");
  assert.equal(defense.length, 11);
  assert.equal(defense.filter((p) => p.job).length, 11, "every defender wears his job");
  // The pressures count their rushers the way their names do: a five-man call sends five.
  const rushers = (id: string) => {
    const scene = glossaryScene(id)!;
    return new Set(paths(scene.nodes).filter((l) => l.style === "solid").map((l) => l.assignOf)).size;
  };
  for (const id of ["glossary-sob", "glossary-go", "glossary-mob", "glossary-pinch-mow"]) assert.equal(rushers(id), 5, `${id}: a five-man pressure`);
  for (const id of ["glossary-missile", "glossary-boom", "glossary-extra"]) assert.equal(rushers(id), 6, `${id}: a six-man pressure`);
});
