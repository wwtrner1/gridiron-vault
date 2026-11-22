import assert from "node:assert/strict";
import { test } from "node:test";
import { CARD_LOOK, frameScene } from "../../src/lib/printLook";
import { glossaryScene } from "../../src/lib/termExamples";
import { GAP_GLOSSARY, STARTER_GLOSSARY } from "../../src/lib/termsData";
import type { PathNode, PlayerNode, Scene, SceneNode, TextNode } from "../../src/lib/types";

/**
 * The starter glossary's own diagrams (`lib/termExamples.ts`), read the way
 * the Playbook language page draws them: nothing is drawn over a label, and
 * the two terms where a defender takes on a block (Spill, Contain) show that
 * block and which side of it he wins.
 */
type Point = { x: number; y: number };
type Box = { x: number; y: number; w: number; h: number };

/** The example dialog and the hover peek, in inches (`PlaybookLanguage.tsx`); the table thumbnail is too small to read a label on. */
const SIZES: [string, number, number][] = [
  ["dialog", 6, 3.6],
  ["peek", 3.2, 2.1],
];

const ids = [...STARTER_GLOSSARY, ...GAP_GLOSSARY].map((t) => t.id);
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
  assert.equal(ids.length, 33);
  for (const id of ids) {
    for (const [size, w, h] of SIZES) {
      const { nodes } = drawn(id, w, h);
      const at = `${id} in the ${size}`;
      const labels = texts(nodes);
      // Print framing hides a label that would sit on another; none may go missing.
      assert.deepEqual(labels.filter((t) => t.hidden).map((t) => t.text), [], `${at}: every label is shown`);
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
