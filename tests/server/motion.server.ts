import assert from "node:assert/strict";
import { test } from "node:test";
import { CONCEPTS, CONCEPT_SETS, conceptScene } from "../../src/lib/concepts";
import { SIM_FPS, yardScale } from "../../src/lib/coverage";
import { pointAt, smoothTrack } from "../../src/lib/motion";
import { buildLesson, defaultLook } from "../../src/lib/teach";

/**
 * How players move in the Film Room (`lib/motion.ts`). The eased frames must
 * stay honest to the model's (under a yard off at any moment), start from
 * the stance, build speed off the snap instead of starting flat out, turn a
 * cut over several frames instead of one, and read between frames.
 */
const speedAt = (pts: { x: number; y: number }[], k: number) => Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y);
const turnAt = (pts: { x: number; y: number }[], k: number) => {
  const a = Math.atan2(pts[k].y - pts[k - 1].y, pts[k].x - pts[k - 1].x);
  const b = Math.atan2(pts[k + 1].y - pts[k].y, pts[k + 1].x - pts[k].x);
  return Math.abs(Math.atan2(Math.sin(b - a), Math.cos(b - a)));
};

test("eased frames stay close to the model, start from the stance and round every cut", () => {
  for (const set of CONCEPT_SETS) {
    for (const concept of CONCEPTS) {
      const scene = conceptScene(set, concept);
      const yard = yardScale(scene.view).y;
      const { result, motion } = buildLesson(scene, concept.name, defaultLook(scene), "");
      const tracks = [...result.offense].map(([id, raw]) => ({ raw, eased: motion.offense.get(id)! }));
      result.defenders.forEach((_, di) => tracks.push({ raw: result.defense.map((f) => f[di]), eased: motion.defense[di] }));
      for (const { raw, eased } of tracks) {
        assert.equal(eased.length, raw.length);
        assert.deepEqual(eased[0], raw[0]);
        let off = 0;
        let rawTurn = 0;
        let easedTurn = 0;
        for (let k = 1; k < raw.length - 1; k++) {
          off = Math.max(off, Math.hypot(eased[k].x - raw[k].x, eased[k].y - raw[k].y));
          if (speedAt(raw, k) > 0.5 && speedAt(raw, k + 1) > 0.5) rawTurn = Math.max(rawTurn, turnAt(raw, k));
          if (speedAt(eased, k) > 0.5 && speedAt(eased, k + 1) > 0.5) easedTurn = Math.max(easedTurn, turnAt(eased, k));
        }
        assert.ok(off < yard, `${set.label} ${concept.name}: ${(off / yard).toFixed(2)} yards off the model`);
        // A square cut in the model is spread over several frames on screen.
        if (rawTurn > 1) assert.ok(easedTurn < rawTurn * 0.6, `${set.label} ${concept.name}: a ${rawTurn.toFixed(2)} turn is still ${easedTurn.toFixed(2)}`);
      }
    }
  }
});

test("a player builds speed off the snap, and a spot between two frames is between them", () => {
  const pts = Array.from({ length: 31 }, (_, k) => ({ x: 100, y: 500 - k * 6 }));
  const eased = smoothTrack(pts, SIM_FPS);
  assert.ok(speedAt(eased, 1) < 3, "near full speed on the first frame");
  assert.ok(speedAt(eased, 2) > speedAt(eased, 1));
  assert.ok(Math.abs(speedAt(eased, 20) - 6) < 0.01);
  // Still going at the end: the last frame isn't a stop.
  assert.ok(Math.abs(speedAt(eased, 30) - 6) < 0.01);
  // Someone standing still never drifts.
  const still = smoothTrack(Array.from({ length: 10 }, () => ({ x: 5, y: 7 })), SIM_FPS)[6];
  assert.ok(Math.hypot(still.x - 5, still.y - 7) < 1e-6);
  const mid = pointAt(pts, 10.5 / SIM_FPS, SIM_FPS)!;
  assert.ok(Math.abs(mid.y - (500 - 63)) < 1e-6);
  assert.deepEqual(pointAt(pts, 99, SIM_FPS), pts[30]);
  assert.equal(pointAt([], 1, SIM_FPS), undefined);
});
