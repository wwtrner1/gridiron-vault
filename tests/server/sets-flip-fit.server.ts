import assert from "node:assert/strict";
import { test } from "node:test";
import { fieldInset } from "../../src/lib/field";
import { zigzagPath } from "../../src/lib/geometry";
import { applyFormat, captureFormat } from "../../src/lib/playFormat";
import { PRESSURES, applyPressure } from "../../src/lib/pressures";
import { DEFENDER_JOBS, giveAssignment } from "../../src/lib/quickDefense";
import { LINE_BLOCKS, SKILL_BLOCKS, giveBlock } from "../../src/lib/quickBlocks";
import { blockFromMenu, clearSets, jobFromMenu, schemeFromPanel } from "../../src/lib/quickSets";
import { jobFor } from "../../src/lib/teach";
import { lessonInk } from "../../src/components/LessonField";
import { CANVAS_W } from "../../src/lib/types";
import type { PathNode, PlayerNode, Scene } from "../../src/lib/types";
import { INK, build, byLabel, endOf, linesFor, paths, players, world } from "./blocking-fixture";

/**
 * What the review of the one-click blocks, assignments and pressures found:
 * Flip has to change the line (and only be offered where it does), a kick-out
 * goes to the end man on the line under any shell, a drop stays on the field,
 * a pressure says what it can't fit, and the readers that share the scene
 * (Film Room, Apply format, the talking points) treat a defender's line right.
 */
const defenders = (s: Scene) => players(s, "defense");
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const plainHint = (status: string) => /Flip changes the side; drag a point to adjust\.$/.test(status);

test("Flip changes the line for every side job, on every defender in the front", () => {
  for (const front of ["4-3", "4-2-5"] as const) {
    const scene = build({ front, coverage: "Cover 3" });
    for (const d of defenders(scene)) {
      for (const job of DEFENDER_JOBS.filter((j) => j.flips && j.id !== "deep-third")) {
        const right = jobFromMenu(scene, d, job.id, 1, INK);
        const left = jobFromMenu(scene, d, job.id, -1, INK);
        assert.ok(right && left, `${front} ${d.label} ${job.id}`);
        assert.ok(right.flips, `${front} ${d.label}@${Math.round(d.x)} ${job.id}: Flip is offered`);
        assert.ok(plainHint(right.status), `${front} ${d.label} ${job.id}: the status mentions Flip`);
        assert.ok(dist(endOf(right.path), endOf(left.path)) > 8, `${front} ${d.label}@${Math.round(d.x)} ${job.id}: the other side ends somewhere else`);
      }
    }
  }
});

test("Flip is not offered where it would change nothing", () => {
  const scene = build({ front: "4-3", coverage: "Cover 3" });
  const m = byLabel(scene, "M", "defense");
  const sOutside = byLabel(scene, "E", "defense", 0);
  for (const job of ["rush", "peel", "hit", "hook", "hole", "robber", "deep-middle", "spy"]) {
    const made = jobFromMenu(scene, m, job, 1, INK)!;
    assert.equal(made.flips, false, `${job} reads the same from both sides`);
    assert.match(made.status, /Drag a point to adjust\.$/);
    assert.doesNotMatch(made.status, /Flip/);
  }
  // A middle-third drop mirrors onto itself for a player who stands in the middle third, and only there.
  assert.equal(jobFromMenu(scene, sOutside, "deep-third", 1, INK)!.flips, false);
  const corner = byLabel(scene, "C", "defense", 0);
  assert.equal(jobFromMenu(scene, corner, "deep-third", 1, INK)!.flips, true);
});

test("a block offers Flip only when the other side is different", () => {
  const scene = build({ front: "4-3", coverage: "Cover 3" });
  const guard = byLabel(scene, "G", "offense", 0);
  for (const id of ["base", "climb", "down", "scoop", "hinge"]) {
    const made = blockFromMenu(scene, guard, id, 1, INK)!;
    assert.equal(made.flips, false, `${id} from a guard reads the same both ways`);
    assert.doesNotMatch(made.status, /Flip/);
  }
  for (const id of ["reach", "combo", "pull-kick", "pull-lead", "trap", "fold", "pass-set", "screen"]) {
    const made = blockFromMenu(scene, guard, id, 1, INK)!;
    assert.equal(made.flips, true, `${id} goes to a side`);
    assert.ok(plainHint(made.status), id);
  }
  const center = byLabel(scene, "C", "offense");
  assert.equal(blockFromMenu(scene, center, "down", 1, INK)!.flips, true, "the center's down block has a side");
  for (const id of ["base", "stalk", "lead", "pass-pro"]) {
    assert.equal(blockFromMenu(scene, byLabel(scene, "Y"), id, 1, INK)!.flips, false, `${id} from a tight end`);
  }
});

test("a kick-out or slice goes to the end man on the line under every shell, never to a corner", () => {
  for (const coverage of ["Cover 3", "Cover 1", "Cover 2", "Cover 4", "Man"] as const) {
    const scene = build({ front: "4-3", coverage });
    const ends = defenders(scene).filter((d) => d.label === "E");
    const nearEnd = (p: { x: number; y: number }) => Math.min(...ends.map((e) => dist(p, { x: e.x, y: e.y })));
    const power = schemeFromPanel(scene, "power", 1, INK);
    assert.ok(!("error" in power), `${coverage} power`);
    const guard = power.scene.nodes
      .filter((n): n is PathNode => n.kind === "path" && n.endCap === "tee")
      .map((l) => ({ l, owner: power.scene.nodes.find((n) => n.id === l.assignOf) as PlayerNode }))
      .filter(({ l, owner }) => owner.label === "G" && /pull|kick/i.test(`${l.name} ${l.tag ?? ""}`));
    assert.ok(guard.length > 0, `${coverage}: the pulling guard's block`);
    for (const { l } of guard) assert.ok(nearEnd(endOf(l)) < 90, `${coverage}: the pull ends at the end man, not the corner (x ${Math.round(endOf(l).x)})`);
    const split = schemeFromPanel(scene, "split-zone", 1, INK);
    assert.ok(!("error" in split), `${coverage} split zone`);
    const slice = paths(split.scene).filter((l) => /slice/i.test(l.name));
    for (const l of slice) assert.ok(nearEnd(endOf(l)) < 90, `${coverage}: the slice cuts off the backside end (x ${Math.round(endOf(l).x)})`);
    // A crack goes to a backer or safety, never to a lineman on the line.
    const z = byLabel(scene, "Z");
    const crack = giveBlock(scene, z, "crack", { ...INK, dir: 1 })!;
    assert.ok(crack.path.points.length >= 2, `${coverage}: Z's crack is drawn`);
    // With nobody in range inside him the line is still drawn, aimed at no one.
    if (crack.target) assert.ok(!["E", "N", "T", "C"].includes(crack.target.label), `${coverage}: Z's crack is aimed at ${crack.target.label}@${Math.round(crack.target.x)}`);
  }
});

test("a drop stays inside the sideline on every field, the flag field included", () => {
  for (const view of ["half", "full", "flag", "redzone"] as const) {
    const scene = { ...build({ front: "4-3", coverage: "Cover 3" }), view };
    const inset = fieldInset(view);
    for (const d of defenders(scene)) {
      for (const job of ["flat", "curl", "deep-third", "deep-half", "deep-quarter", "contain"]) {
        const made = jobFromMenu(scene, d, job, d.x < CANVAS_W / 2 ? -1 : 1, INK);
        assert.ok(made, `${view} ${d.label} ${job}`);
        for (const p of world(made.path).slice(1)) assert.ok(p.x >= inset - 0.5 && p.x <= CANVAS_W - inset + 0.5, `${view} ${d.label} ${job}: x ${Math.round(p.x)} is outside the sideline at ${inset}`);
      }
    }
  }
});

test("the hole job is a real drop for any defender, even one already standing there", () => {
  const scene = build({ front: "4-3", coverage: "Cover 3" });
  for (const d of defenders(scene)) {
    const made = jobFromMenu(scene, d, "hole", 1, INK)!;
    const w = world(made.path);
    assert.ok(w.length >= 2, `${d.label} hole has a line`);
    assert.ok(dist(w[0], endOf(made.path)) > 10, `${d.label}@${Math.round(d.x)},${Math.round(d.y)} hole is more than a dot`);
  }
});

test("a pressure says when the front isn't a four-man line, and the counts follow the front", () => {
  for (const front of ["4-3", "4-4", "4-2-5"] as const) {
    const scene = build({ front });
    for (const p of PRESSURES) {
      const done = applyPressure(scene, p.id, { width: 3, z: 100 });
      assert.ok(!("error" in done), `${p.id} vs ${front}`);
      assert.equal(done.rushers.length, p.count, `${p.id} vs ${front} sends ${p.count}`);
      assert.ok(!done.notes.some((n) => /down linemen/.test(n)), `${p.id} vs ${front}: a four-man line needs no warning`);
    }
  }
  for (const front of ["3-4", "3-3"] as const) {
    const scene = build({ front });
    for (const p of PRESSURES) {
      const done = applyPressure(scene, p.id, { width: 3, z: 100 });
      assert.ok(!("error" in done), `${p.id} vs ${front}`);
      assert.ok(done.notes.some((n) => /This front has 3 down linemen/.test(n)), `${p.id} vs ${front}: told it is a three-man line`);
    }
  }
  const five = build({ front: "5-2" });
  for (const p of PRESSURES) {
    const done = applyPressure(five, p.id, { width: 3, z: 100 });
    assert.ok(!("error" in done), `${p.id} vs 5-2`);
    assert.ok(done.notes.some((n) => /This front has 5 down linemen/.test(n)), `${p.id} vs 5-2: told it is a five-man line`);
  }
});

test("Twist: the nose loops around the 3 technique and ends in the B gap beside him", () => {
  const scene = build({ front: "4-2-5" });
  const done = applyPressure(scene, "twist", { width: 3, z: 100 });
  assert.ok(!("error" in done));
  const nose = byLabel(done.scene, "N", "defense");
  const three = byLabel(done.scene, "T", "defense");
  const line = linesFor(done.scene, nose)[0];
  assert.equal(line.tag, "SWAP");
  const end = endOf(line);
  // The B gap is between the guard and the tackle on the 3 technique's side, so the nose ends past the A gap, on the 3 technique's side of the ball.
  const ball = CANVAS_W / 2;
  assert.ok(Math.sign(end.x - ball) === Math.sign(three.x - ball), `the nose ends on the 3 technique's side (x ${Math.round(end.x)})`);
  assert.ok(Math.abs(end.x - three.x) < 70, `and within a gap of him (x ${Math.round(end.x)} against ${Math.round(three.x)})`);
});

test("Clear all assignments takes tags off a defense that has no lines, and says it did", () => {
  const tagsOnly = build({ front: "4-3", tags: true });
  assert.equal(paths(tagsOnly).length, 0);
  assert.ok(defenders(tagsOnly).every((d) => d.job), "the library's technique and gap tags are under each token");
  const cleared = clearSets(tagsOnly, "defense");
  assert.equal(cleared.removed, 11, "every tag counts as one thing cleared");
  assert.ok(defenders(cleared.scene).every((d) => !d.job));
  const withLines = applyPressure(build({ front: "4-3" }), "sob", { width: 3, z: 100 });
  assert.ok(!("error" in withLines));
  const both = clearSets(withLines.scene, "defense");
  assert.equal(paths(both.scene).length, 0);
  assert.ok(both.removed >= 11);
  assert.equal(clearSets(build({ front: "4-3", tags: false }), "defense").removed, 0, "nothing to clear says so");
});

test("the Film Room draws the offense and leaves a defender's line off the field with the defender", () => {
  const scene = applyPressure(build({ front: "4-3" }), "sob", { width: 3, z: 100 });
  assert.ok(!("error" in scene));
  const man = giveAssignment(scene.scene, byLabel(scene.scene, "C", "defense", 0), "man", { dir: 1, ...INK })!;
  const ids = new Set(defenders(man.scene).map((d) => d.id));
  assert.ok(paths(man.scene).some((l) => l.assignOf && ids.has(l.assignOf)), "the scene has defender lines");
  for (const dark of [false, true]) {
    const ink = lessonInk(man.scene, dark);
    assert.ok(!ink.some((n) => n.kind === "path" && n.assignOf && ids.has(n.assignOf)), `no defender line is drawn (dark ${dark})`);
    assert.equal(ink.filter((n) => n.kind === "player").length, 11, "the offense stays");
  }
});

test("a player is told his block in the second person, in good English", () => {
  const scene = build({ front: "4-3", coverage: "Cover 3" });
  const guard = byLabel(scene, "G", "offense", 0);
  const check = (s: Scene, label: string, id: string) => {
    const text = jobFor(s, label);
    assert.match(text, new RegExp(`^${label}, you [a-z]+ `), `${id}: ${text}`);
    assert.doesNotMatch(text, /\b(he|his|him)\b/, `${id}: ${text}`);
    assert.doesNotMatch(text, /:/, `${id}: ${text}`);
    const verb = new RegExp(`^${label}, you ([a-z]+)`).exec(text)![1];
    assert.ok(!/s$/.test(verb), `${id}: "${verb}" should be the base verb in "${text}"`);
    return text;
  };
  for (const b of LINE_BLOCKS) check(blockFromMenu(scene, guard, b.id, 1, INK)!.scene, "G", b.id);
  for (const b of SKILL_BLOCKS) check(blockFromMenu(scene, byLabel(scene, "Y"), b.id, 1, INK)!.scene, "Y", b.id);
  assert.match(check(blockFromMenu(scene, guard, "pull-kick", 1, INK)!.scene, "G", "pull-kick"), /^G, you pull and kick out the end man on the line\.$/);
  assert.match(check(blockFromMenu(scene, guard, "fold", 1, INK)!.scene, "G", "fold"), /fold behind your neighbor and block the man the neighbor leaves\./);
});

test("Apply format paints routes and blocks, and leaves a defender's man line dashed with its own end", () => {
  const offense = build({ formation: "Doubles" });
  const x = byLabel(offense, "X");
  const first = giveAssignment(build({ front: "4-3" }), byLabel(build({ front: "4-3" }), "C", "defense", 0), "man", { dir: 1, ...INK })!.path;
  const withRoute: Scene = {
    ...offense,
    nodes: [
      ...offense.nodes,
      { ...first, id: "route", name: "X go", x: x.x, y: x.y, points: [{ x: 0, y: -120 }], stroke: "#cc0000", width: 6, style: "solid", endCap: "arrow", assignOf: x.id },
    ],
  };
  const format = captureFormat({ id: "src", name: "Source", scene: withRoute });
  const scene = build({ front: "4-3", coverage: "Cover 3" });
  const c = byLabel(scene, "C", "defense", 0);
  const man = giveAssignment(scene, c, "man", { dir: 1, ...INK })!;
  const before = linesFor(man.scene, c)[0];
  const after = linesFor(applyFormat(man.scene, format, ["colors", "fills", "letters", "lines", "field"]), c)[0];
  assert.equal(after.style, before.style, "still dashed");
  assert.equal(after.endCap, before.endCap, "still ends the way a man line does");
  assert.equal(after.stroke, before.stroke);
  assert.equal(after.width, before.width);
  // A route still takes the look.
  const painted = applyFormat(withRoute, format, ["colors", "lines"]).nodes.find((n) => n.id === "route") as PathNode;
  assert.equal(painted.stroke, "#cc0000");
});

test("a zigzag ends on a short straight run, so its arrowhead points along the line", () => {
  const up = zigzagPath([{ x: 100, y: 300 }, { x: 100, y: 200 }]);
  const pts = [...up.matchAll(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]) }));
  assert.ok(pts.length >= 5, "it still zigzags");
  const [a, b] = pts.slice(-2);
  assert.ok(Math.abs(a.x - b.x) < 0.01, "the last segment runs along the line, not across a tooth");
  assert.equal(b.y, 200);
  assert.ok(pts.slice(1, -2).some((p) => Math.abs(p.x - 100) > 3), "the teeth are off the axis");
  // A short line is a straight run, and never starts or ends wrong.
  const short = zigzagPath([{ x: 0, y: 0 }, { x: 0, y: -6 }]);
  assert.match(short, /^M 0.00 0.00/);
  assert.match(short, /L 0.00 -6.00$/);
});
