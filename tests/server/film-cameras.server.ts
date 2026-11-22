import assert from "node:assert/strict";
import { test } from "node:test";
import { FIELD_CAMERAS, FILM_CAMERAS, FILM_CAMERA_NAME, PREVIEW_CAMERAS, cameraOn, cleanCameraPick } from "../../src/lib/film3d";
import type { FixedCamera } from "../../src/lib/film3d";
import { ORBIT_START, inPicture, momentOf, resolveCamera, shotFor } from "../../src/lib/filmCameras";
import type { Rig, V3 } from "../../src/lib/filmCameras";

/**
 * The Film Room's 3D cameras (`lib/filmCameras.ts`): every camera has a name,
 * the end-zone, sideline and top-down cameras keep every player in the picture
 * on a wide screen and a phone, the QB cam rides with the quarterback and
 * swings to the ball, and a saved pick is checked.
 */
const players: [number, number][] = [
  [0, -0.5], [0, -5.5], [-19, -0.5], [18, -0.5], [9, -1.2], // the offense: center, quarterback, two wide, a slot
  [-19, 6], [18, 6], [0, 5], [-8, 12], [8, 12], // the defense
];
const rig = (over: Partial<Rig> = {}): Rig => ({
  aspect: 16 / 9,
  side: "offense",
  snap: { x0: -19, x1: 18, z0: -5.5, z1: 12 },
  play: { x0: -21, x1: 22, z0: -8, z1: 24 },
  halfField: 80 / 3,
  qb: { x: 0, z: -5.5 },
  follow: null,
  ball: null,
  pass: true,
  orbit: { ...ORBIT_START },
  eye: { yaw: 0, pitch: 0 },
  tall: 1.3,
  ...over,
});
const feet = (p: [number, number]): V3 => [p[0], 0, p[1]];
const head = (p: [number, number]): V3 => [p[0], 2.6, p[1]];

test("every camera has a name, and each screen offers the ones that make sense on it", () => {
  for (const c of FILM_CAMERAS) assert.ok(FILM_CAMERA_NAME[c].length > 2, c);
  assert.equal(FILM_CAMERAS.length, 12);
  assert.ok(!PREVIEW_CAMERAS.includes("auto") && PREVIEW_CAMERAS.includes("modular"));
  assert.ok(!FIELD_CAMERAS.includes("auto") && !FIELD_CAMERAS.includes("modular") && FIELD_CAMERAS.includes("qb"));
  assert.equal(cameraOn(FIELD_CAMERAS, "auto"), "behind");
  assert.equal(cameraOn(FIELD_CAMERAS, "qb"), "qb");
});

test("the cameras that show the whole play keep every player in the picture, wide screen or phone", () => {
  for (const aspect of [2.4, 16 / 9, 4 / 3, 0.9]) {
    for (const side of ["offense", "defense"] as const) {
      for (const kind of ["behind", "wide", "all22", "sideline", "coach", "overhead"] as FixedCamera[]) {
        const shot = shotFor(kind, rig({ aspect, side }));
        // Behind the offense frames the snap; the others hold the whole play, its deepest corners included.
        const box = rig().play;
        const corners: [number, number][] = kind === "behind" ? [] : [[box.x0, box.z0], [box.x1, box.z0], [box.x0, box.z1], [box.x1, box.z1]];
        for (const p of [...players, ...corners]) {
          for (const at of [feet(p), head(p)]) {
            const s = inPicture(shot, aspect, at);
            assert.ok(s && Math.abs(s.x) <= 1.02 && Math.abs(s.y) <= 1.02, `${kind} from the ${side}'s end at ${aspect.toFixed(2)}: ${p} lands at ${s?.x.toFixed(2)}, ${s?.y.toFixed(2)}`);
          }
        }
      }
    }
  }
});

test("Behind the offense sits low and close: under 20 yards up, the line of scrimmage in the lower half", () => {
  const shot = shotFor("behind", rig());
  assert.ok(shot.pos[1] < 20 && shot.pos[2] < 0, String(shot.pos));
  const los = inPicture(shot, 16 / 9, [0, 0, 0])!;
  assert.ok(los.y < 0.2 && los.y > -0.8, String(los.y));
  // From the defense's end it stands past the secondary, looking back.
  const back = shotFor("behind", rig({ side: "defense" }));
  assert.ok(back.pos[2] > 12 && back.look[2] < back.pos[2]);
});

test("QB cam rides behind the quarterback and swings to the ball once it is thrown", () => {
  const still = shotFor("qb", rig());
  assert.ok(still.pos[2] < -5.5 - 8 && still.pos[1] > 6, String(still.pos));
  const qb = inPicture(still, 16 / 9, [0, 1.3, -5.5])!;
  assert.ok(Math.abs(qb.x) < 0.3 && qb.y < 0, `the quarterback is low in the middle: ${qb.x}, ${qb.y}`);
  // He rolls right (toward -x on this field) and the camera goes with him.
  const rolled = shotFor("qb", rig({ qb: { x: -6, z: -7 } }));
  assert.ok(rolled.pos[0] < -3 && rolled.pos[2] <= still.pos[2] + 0.01, String(rolled.pos));
  const ball = { x: 16, y: 3, z: 14 };
  const thrown = shotFor("qb", rig({ ball }));
  assert.ok(thrown.look[0] > 10, "it looks toward the ball");
  const seen = inPicture(thrown, 16 / 9, [ball.x, ball.y, ball.z])!;
  assert.ok(Math.abs(seen.x) < 0.5 && Math.abs(seen.y) < 0.6, `the ball is in the picture: ${seen.x}, ${seen.y}`);
  assert.deepEqual(shotFor("qb", rig({ ball, pass: false })).look, still.look);
  // A play with no quarterback falls back to the end-zone camera.
  assert.deepEqual(shotFor("qb", rig({ qb: null })), shotFor("behind", rig({ qb: null })));
});

test("the riding cameras stay with their player, and the helmet turns", () => {
  const follow = { x: 18, z: 4, hx: 0, hz: 1, offense: true };
  const zoom = shotFor("zoom", rig({ follow }));
  assert.ok(zoom.pos[2] < follow.z && zoom.look[2] > follow.z);
  const eyes = shotFor("eyes", rig({ follow }));
  assert.ok(Math.hypot(eyes.pos[0] - follow.x, eyes.pos[2] - follow.z) < 0.5 && eyes.pos[1] > 2);
  assert.ok(eyes.look[2] > follow.z + 5, "he looks where he is headed");
  // +x is the left of the screen, so a turn to the right swings the look toward -x.
  const right = shotFor("eyes", rig({ follow, eye: { yaw: 0.6, pitch: 0 } }));
  assert.ok(right.look[0] < eyes.look[0]);
  const defender = shotFor("eyes", rig({ follow: { x: 0, z: 5, hx: 0, hz: -1, offense: false, eyes: { x: 0, z: -5.5 } } }));
  assert.ok(defender.look[2] < 5, "a defender looks back at the quarterback");
  assert.deepEqual(shotFor("zoom", rig()), shotFor("behind", rig()));
  const free = shotFor("free", rig());
  const closer = shotFor("free", rig({ orbit: { ...ORBIT_START, r: 20 } }));
  assert.ok(Math.hypot(...closer.pos) < Math.hypot(...free.pos));
});

test("Follow the lesson goes by the step, and A camera for each moment by the play's clock", () => {
  assert.deepEqual(resolveCamera("auto", "look", "pre"), { shot: "wide", tag: "auto:look" });
  assert.deepEqual(resolveCamera("auto", "read", "air"), { shot: "qb", tag: "auto:read" });
  assert.deepEqual(resolveCamera("auto", "job", "pre"), { shot: "zoom", tag: "auto:job" });
  assert.deepEqual(resolveCamera("overhead", "read", "air"), { shot: "overhead", tag: "overhead" });
  assert.equal(momentOf(0, 2, 0.5, true), "pre");
  assert.equal(momentOf(1, 2, 0.5, true), "drop");
  assert.equal(momentOf(2.2, 2, 0.5, true), "air");
  assert.equal(momentOf(2.8, 2, 0.5, true), "post");
  assert.equal(momentOf(2.8, 2, 0.5, false), "drop", "a step that draws no throw never leaves the dropback");
  assert.deepEqual(["pre", "drop", "air", "post"].map((m) => resolveCamera("modular", "snap", m as "pre").tag), ["modular:pre", "modular:drop", "modular:air", "modular:post"]);
});

test("a saved camera pick is checked", () => {
  assert.deepEqual(cleanCameraPick({ camera: "qb", side: "defense", pass: false, junk: 1 }), { camera: "qb", side: "defense", pass: false });
  assert.deepEqual(cleanCameraPick({ camera: "eyes" }), { camera: "eyes", side: "offense", pass: true });
  assert.equal(cleanCameraPick({ camera: "drone" }), undefined);
  assert.equal(cleanCameraPick("qb"), undefined);
  assert.equal(cleanCameraPick(null), undefined);
});
