import assert from "node:assert/strict";
import { test } from "node:test";
import { CONCEPTS, CONCEPT_SETS, conceptScene } from "../../src/lib/concepts";
import { SPREAD, playSpan, spreadLesson, tokenGrow } from "../../src/lib/fieldRoom";
import { buildLesson, defaultLook } from "../../src/lib/teach";

/**
 * The Film Room on an upright phone (`lib/fieldRoom.ts`): the picture keeps
 * to the play, the box opens up and the play is drawn deeper, and the tokens
 * grow only as far as they stay apart.
 */
const lessons = CONCEPT_SETS.flatMap((set) =>
  CONCEPTS.map((c) => {
    const scene = conceptScene(set, c);
    return { name: `${set.id} ${c.id}`, scene, lesson: buildLesson(scene, c.name, defaultLook(scene), "X") };
  }),
);

test("the spread keeps the picture's edges, keeps everything in order, and opens the box", () => {
  for (const { name, scene, lesson } of lessons) {
    const [lo, hi] = playSpan(scene, lesson, 0, 1040, 1.5);
    const sp = spreadLesson(scene, lesson, lo, hi);
    assert.equal(Math.round(sp.x(lo)), Math.round(lo), name);
    assert.equal(Math.round(sp.x(hi)), Math.round(hi), name);
    for (let v = lo; v < hi - 5; v += 5) assert.ok(sp.x(v + 5) > sp.x(v), `${name}: across stays in order at ${v}`);
    assert.equal(sp.y(scene.losY), scene.losY, name);
    assert.equal(sp.y(scene.losY - 100), scene.losY - 100 * SPREAD.deep, name);
    // Every player is drawn inside the picture, and the grades are the model's own.
    for (const track of sp.lesson.motion.offense.values()) for (const p of track) assert.ok(p.x >= lo - 1 && p.x <= hi + 1, name);
    assert.deepEqual(
      sp.lesson.result.rows.map((r) => r.status),
      lesson.result.rows.map((r) => r.status),
      name,
    );
  }
});

test("tokens grow on a phone only while they stay apart", () => {
  for (const { name, scene, lesson } of lessons) {
    const [lo, hi] = playSpan(scene, lesson, 0, 1040, 1.5);
    const sp = spreadLesson(scene, lesson, lo, hi);
    const flat = tokenGrow(scene, lesson, 1.5);
    const open = tokenGrow(sp.scene, sp.lesson, 1.5);
    assert.ok(flat >= 1 && flat <= 1.5, name);
    // An upright phone's spread picture has more room than the flat one, never less.
    assert.ok(open >= flat - 1e-9, `${name}: ${open} < ${flat}`);
  }
  // The 11-man line gets room it didn't have before.
  const line = lessons.find((l) => l.name.startsWith("11 flood"))!;
  const [lo, hi] = playSpan(line.scene, line.lesson, 0, 1040, 1.5);
  const sp = spreadLesson(line.scene, line.lesson, lo, hi);
  assert.ok(tokenGrow(sp.scene, sp.lesson, 1.5) > 1.25);
  assert.equal(tokenGrow(line.scene, line.lesson, 1), 1);
});
