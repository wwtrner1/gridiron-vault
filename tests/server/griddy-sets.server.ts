import assert from "node:assert/strict";
import { test } from "node:test";
import { BLOCK_SCHEMES } from "../../src/lib/blockSchemes";
import { cleanOpenChange, editScene, planBulkEdit, restorePlayers, type BulkChange } from "../../src/lib/bulkEdit";
import { applySet, cleanSet, describeSet, SET_IDS, SET_LABELS, type SetChange } from "../../src/lib/bulkSets";
import { cleanDefenseCall, DEFENSE_FRONTS, GRIDDY_SYSTEM, GRIDDY_TOOLS } from "../../src/lib/griddy";
import { buildDefense } from "../../src/lib/griddyDefense";
import { DEFENSE_TOKENS, OFFENSE_TOKENS } from "../../src/lib/presets";
import { PRESSURES } from "../../src/lib/pressures";
import { LINE_BLOCKS, SKILL_BLOCKS } from "../../src/lib/quickBlocks";
import { DEFENDER_JOBS } from "../../src/lib/quickDefense";
import { turnAround } from "../../src/lib/pov";
import { build, paths, players } from "./blocking-fixture";
import type { StoredPlay, Scene } from "../../src/lib/types";

/**
 * Griddy's `apply_set` (`lib/bulkSets.ts`): what he may name, what a set does
 * to a scene through `editScene` and the card's plan, that Undo (`restorePlayers`)
 * leaves no lines behind and brings back the ones a set replaced, and the
 * pressure on a `draw_defense` call.
 */
const TOKENS = [...OFFENSE_TOKENS, ...DEFENSE_TOKENS];
const set = (c: Record<string, unknown>) => ({ op: "apply_set" as const, ...c }) as unknown as BulkChange;
const sigs = (s: Scene) => s.nodes.map((n) => JSON.stringify(n)).sort();
const ids = (s: Scene) => s.nodes.map((n) => n.id).sort();
const linesOnly = (s: Scene) => paths(s).filter((p) => !p.name.includes("motion"));

function stored(scene: Scene, id = "p1", name = "Doubles"): StoredPlay {
  return { id, name, formation: "Doubles", playType: "run", personnel: "11", tags: [], description: "", isPublic: false, remote: false, createdAt: "2026-01-01", updatedAt: "2026-01-01", scene } as unknown as StoredPlay;
}

test("Griddy can name every scheme, pressure, block and job the libraries have, and nothing else", () => {
  assert.deepEqual(SET_IDS.scheme, BLOCK_SCHEMES.map((s) => s.id));
  assert.deepEqual(SET_IDS.pressure, PRESSURES.map((p) => p.id));
  assert.deepEqual(SET_IDS.assign, DEFENDER_JOBS.map((j) => j.id));
  assert.deepEqual(new Set(SET_IDS.block), new Set([...LINE_BLOCKS, ...SKILL_BLOCKS].map((b) => b.id)));
  // Wes's eleven packages and eleven schemes, each in the words he uses.
  for (const name of ["SOB", "Go", "Mob", "Pinch Mow", "Missile", "Boom", "Extra", "Backer", "Sextra", "Swing", "Twist"]) assert.ok(SET_LABELS.pressure.some((p) => p.label === name), name);
  for (const name of ["Inside zone", "Outside zone", "Power", "Counter", "Trap", "Lead", "Split zone", "Draw", "Pin and pull", "Slide protection", "Man protection", "Screen"]) {
    assert.ok(SET_LABELS.scheme.some((s) => s.label.toLowerCase().startsWith(name.toLowerCase())), name);
  }
  // The tool's schema and the prompt carry the same lists, so they can't drift from the libraries.
  const bulk = GRIDDY_TOOLS.find((t) => t.name === "bulk_edit")!;
  const item = (bulk.input_schema.properties.changes as unknown as { items: { properties: Record<string, { enum?: string[]; description?: string }> } }).items.properties;
  assert.ok(item.op.enum!.includes("apply_set"));
  for (const id of [...SET_IDS.scheme, ...SET_IDS.pressure]) assert.ok(item.id.description!.includes(id), id);
  const defense = GRIDDY_TOOLS.find((t) => t.name === "draw_defense")!;
  assert.deepEqual((defense.input_schema.properties.pressure as unknown as { enum: string[] }).enum, SET_IDS.pressure);
  for (const label of SET_LABELS.pressure.map((p) => p.label)) assert.ok(GRIDDY_SYSTEM.includes(label), `the prompt names ${label}`);
  assert.match(GRIDDY_SYSTEM, /Gold Back/);
  assert.match(GRIDDY_SYSTEM, /apply_set/);
});

test("what Griddy sends is checked: loose names match, an id the library hasn't is dropped, a block needs its player", () => {
  assert.deepEqual(cleanSet({ kind: "scheme", id: "Inside Zone", dir: "left" }), { op: "apply_set", kind: "scheme", id: "inside-zone", dir: "left" });
  assert.deepEqual(cleanSet({ kind: "pressure", id: "pinch_mow", gold: "back", dir: "left" }), { op: "apply_set", kind: "pressure", id: "pinch-mow", gold: "back" });
  assert.deepEqual(cleanSet({ id: "boom" }), { op: "apply_set", kind: "pressure", id: "boom" }, "the kind is read from an id only one list has");
  assert.equal(cleanSet({ id: "trap" }), null, "trap is a scheme and a block, so the kind is needed");
  assert.equal(cleanSet({ kind: "scheme", id: "trap" })?.id, "trap");
  assert.equal(cleanSet({ kind: "scheme", id: "flea-flicker" }), null);
  assert.equal(cleanSet({ kind: "pressure", id: "boom", gold: "sideways" })?.gold, undefined);
  assert.equal(cleanSet({ kind: "scheme", id: "power", dir: "up" })?.dir, undefined);
  assert.equal(cleanSet({ kind: "block", id: SET_IDS.block[0] }), null, "a block with no player named");
  assert.equal(cleanSet({ kind: "block", id: SET_IDS.block[0], letter: "not a letter!" }), null);
  const guard = cleanSet({ kind: "block", id: SET_IDS.block[0], letter: " g ", which: "left", dir: "right", gold: "back", man: "X" })!;
  assert.deepEqual(guard, { op: "apply_set", kind: "block", id: SET_IDS.block[0], letter: "G", dir: "right", which: "left" });
  assert.equal(cleanSet({ kind: "assign", id: "man", letter: "C", man: "x" })?.man, "X");
  assert.equal(cleanSet({ kind: "assign", id: "man", letter: "C", man: "?!?" })?.man, undefined);
  assert.equal("man" in (cleanSet({ kind: "assign", id: SET_IDS.assign.find((j) => j !== "man")!, letter: "C", man: "X" }) as object), false);
  // The same check runs where open changes are cleaned.
  assert.deepEqual(cleanOpenChange({ op: "apply_set", kind: "scheme", id: "Power" }), { op: "apply_set", kind: "scheme", id: "power" });
  assert.equal(cleanOpenChange({ op: "apply_set", kind: "scheme", id: "nope" }), null);
});

test("the card says what a set is in the coach's words", () => {
  assert.equal(describeSet({ op: "apply_set", kind: "scheme", id: "inside-zone", dir: "right" }), "Inside zone to the right");
  assert.equal(describeSet({ op: "apply_set", kind: "scheme", id: "power" }), "Power to the right");
  assert.equal(describeSet({ op: "apply_set", kind: "scheme", id: "pass-slide" }), "Slide protection", "no side for a pass protection");
  assert.equal(describeSet({ op: "apply_set", kind: "pressure", id: "boom" }), "Boom pressure");
  assert.equal(describeSet({ op: "apply_set", kind: "pressure", id: "boom", gold: "back" }), "Boom pressure, rover takes the back");
  assert.equal(describeSet({ op: "apply_set", kind: "pressure", id: "boom", gold: "free" }), "Boom pressure, rover is free");
});

test("a scheme draws a block for the blockers and says so; a pressure draws the rush, and neither moves a player", () => {
  const offense = build();
  const before = players(offense).map((p) => `${p.id}@${p.x},${p.y}`);
  const zone = editScene(offense, [set({ kind: "scheme", id: "inside-zone", dir: "right" })], TOKENS);
  assert.deepEqual(zone.skipped, []);
  assert.ok(zone.players >= 5, `${zone.players} blocks`);
  assert.match(zone.notes[0], /^Inside zone to the right: /);
  assert.doesNotMatch(zone.notes[0], /Click any|drag a point/, "no hint about the Designer's panels on a card");
  assert.deepEqual(players(zone.scene).map((p) => `${p.id}@${p.x},${p.y}`), before);
  assert.ok(linesOnly(zone.scene).length >= 5);

  const stacked = build({ front: "4-2-5", coverage: "Cover 1" });
  const boom = editScene(stacked, [set({ kind: "pressure", id: "boom" })], TOKENS);
  assert.deepEqual(boom.skipped, []);
  assert.ok(boom.players >= 6, `${boom.players} defenders changed`);
  assert.match(boom.notes[0], /^Boom: .+ rush \(\d+\)/);
  assert.ok(paths(boom.scene).length > paths(stacked).length);
});

test("a play that can't take the set is skipped with the reason, never half drawn", () => {
  const five = build({ game: "5v5", personnel: "5v5", formation: "Trips Right" });
  const noLine = editScene(five, [set({ kind: "scheme", id: "inside-zone" })], TOKENS);
  assert.equal(noLine.players, 0);
  assert.match(noLine.skipped[0], /needs offensive linemen/);
  assert.deepEqual(ids(noLine.scene), ids(five));

  const offense = build();
  const noDefense = editScene(offense, [set({ kind: "pressure", id: "boom" })], TOKENS);
  assert.equal(noDefense.players, 0);
  assert.match(noDefense.skipped[0], /no defense on the field/);
  assert.match(noDefense.skipped[0], /Ask me to draw a defense first/, "points at Griddy, not at a library he can't press");
  assert.deepEqual(sigs(noDefense.scene), sigs(offense));

  const nobody = editScene(offense, [set({ kind: "block", id: SET_IDS.block[0], letter: "W" })], TOKENS);
  assert.match(nobody.skipped[0], /There's no W on the offense/);
  const twice = editScene(offense, [set({ kind: "block", id: SET_IDS.block[0], letter: "G" })], TOKENS);
  assert.match(twice.skipped[0], /Say the left one or the right one/);
});

test("the same set twice on one play changes nothing the second time, and draws the same nodes either way", () => {
  const offense = build();
  const one = editScene(offense, [set({ kind: "scheme", id: "power", dir: "left" })], TOKENS);
  const again = editScene(offense, [set({ kind: "scheme", id: "power", dir: "left" })], TOKENS);
  // The card previews on one copy and then draws on the field: Undo finds the field's lines by the preview's ids.
  assert.deepEqual(ids(one.scene), ids(again.scene));
  assert.ok(ids(one.scene).some((id) => id.startsWith("set-")));
  assert.equal(new Set(ids(one.scene)).size, one.scene.nodes.length, "no node id twice");
  const twice = editScene(one.scene, [set({ kind: "scheme", id: "power", dir: "left" })], TOKENS);
  assert.equal(twice.players, 0);
  assert.match(twice.skipped[0], /already on the field/);
  assert.deepEqual(sigs(twice.scene), sigs(one.scene));
});

test("Undo takes a set's lines off, and puts back the lines a later set replaced", () => {
  const offense = build();
  const first = editScene(offense, [set({ kind: "scheme", id: "inside-zone", dir: "right" })], TOKENS).scene;
  const second = editScene(first, [set({ kind: "scheme", id: "power", dir: "left" })], TOKENS).scene;
  assert.notDeepEqual(sigs(second), sigs(first));
  // The second set took the blockers' lines over; Undo puts the first set's back, exactly.
  assert.deepEqual(sigs(restorePlayers(second, first, second)), sigs(first));
  assert.deepEqual(sigs(restorePlayers(first, offense, first)), sigs(offense));
  // And a coach who drew something else since keeps it.
  const extra = { ...first.nodes.find((n) => n.kind === "path")!, id: "mine", name: "mine" };
  const kept = restorePlayers({ ...first, nodes: [...first.nodes, extra] }, offense, first);
  assert.deepEqual(ids(kept), [...ids(offense), "mine"].sort());

  const defense = build({ front: "4-3", coverage: "Cover 3", zones: true });
  const sent = editScene(defense, [set({ kind: "pressure", id: "sob" })], TOKENS).scene;
  const swung = editScene(sent, [set({ kind: "pressure", id: "go" })], TOKENS).scene;
  assert.deepEqual(sigs(restorePlayers(swung, sent, swung)), sigs(sent), "a pressure re-applied replaces the first, and Undo brings it back");
  assert.deepEqual(sigs(restorePlayers(sent, defense, sent)), sigs(defense), "and the library's own drops and tags are back after the last Undo");
});

test("a play drawn from the defense's end takes the set turned round and back, and only the set's nodes change", () => {
  const upright = build({ front: "4-2-5", coverage: "Cover 3" });
  const turned: Scene = turnAround(upright);
  const done = editScene(turned, [set({ kind: "pressure", id: "boom" })], TOKENS);
  assert.equal(done.scene.pov, "defense");
  assert.deepEqual(done.skipped, []);
  // Every node it left alone is the very same node, so a turned-round play isn't "changed" by rounding noise.
  const was = new Map(turned.nodes.map((n) => [n.id, n]));
  const touched = done.scene.nodes.filter((n) => was.get(n.id) !== n);
  assert.ok(touched.length > 0);
  assert.ok(touched.length < done.scene.nodes.length, "not every node counts as changed");
  assert.ok(done.players < done.scene.nodes.length);
  assert.deepEqual(sigs(restorePlayers(done.scene, turned, done.scene)), sigs(turned));
});

test("the plan counts the plays a set can go on and names the ones it can't", () => {
  const eleven = stored(build(), "a", "Doubles 11");
  const flag = stored(build({ game: "5v5", personnel: "5v5", formation: "Trips Right" }), "b", "Trips 5v5");
  const plan = planBulkEdit({ scope: { kind: "vault" }, changes: [set({ kind: "scheme", id: "outside-zone", dir: "left" })] }, [eleven, flag], [], TOKENS);
  assert.deepEqual(plan.targets.map((t) => t.before.id), ["a"]);
  assert.ok(plan.targets[0].players >= 5);
  assert.match(plan.targets[0].notes[0], /^Outside zone to the left: /);
  assert.equal(plan.skips.length, 1);
  assert.equal(plan.skips[0].id, "b");
  assert.equal(plan.skips[0].name, "Trips 5v5");
  assert.match(plan.skips[0].reason, /offensive linemen/);
  // Applied, the card's write is the plan's scene, and a set already on the play is a skip, not a change.
  const redo = planBulkEdit({ scope: { kind: "vault" }, changes: [set({ kind: "scheme", id: "outside-zone", dir: "left" })] }, [plan.targets[0].after, flag], [], TOKENS);
  assert.deepEqual(redo.targets, []);
  assert.match(redo.skips.find((s) => s.id === "a")!.reason, /already on the field/);
  // Undo for a Vault play is its earlier scene, which carries none of the set's lines.
  assert.equal(linesOnly(plan.targets[0].before.scene).length, 0);
});

test("one blocker's block and one defender's job go through the Designer's menu code, in the coach's words", () => {
  const scene = build({ front: "4-2-5", coverage: "Cover 3" });
  const kick = applySet(scene, { op: "apply_set", kind: "block", id: "pull-kick", letter: "G", which: "left" });
  assert.ok(!("skip" in kick), "skip" in kick ? kick.skip : "");
  assert.equal(kick.label, "Pull and kick out");
  assert.match(kick.status, /^G pulls and kicks out/);
  assert.equal(kick.changed.length, 1);
  assert.equal(paths(kick.scene).filter((l) => l.endCap === "tee").length, 1, "a block ends in a T");

  const gap = applySet(scene, { op: "apply_set", kind: "assign", id: "a-gap", letter: "M" });
  assert.ok(!("skip" in gap), "skip" in gap ? gap.skip : "");
  assert.match(gap.status, /^M blitzes the A gap/);
  assert.equal(players(gap.scene, "defense").find((d) => d.label === "M")?.job, "A gap");

  const man = applySet(scene, { op: "apply_set", kind: "assign", id: "man", letter: "C", which: "left", man: "X" });
  assert.ok(!("skip" in man), "skip" in man ? man.skip : "");
  assert.equal(man.status, "C covers X man to man.");
  const nobody = applySet(scene, { op: "apply_set", kind: "assign", id: "man", letter: "C", which: "left", man: "W" });
  assert.ok("skip" in nobody && /can't cover W/.test(nobody.skip), "a receiver who isn't there");
  // The Undo that goes with them: the line goes, the tag with it.
  assert.deepEqual(sigs(restorePlayers(gap.scene, scene, gap.scene)), sigs(scene));
});

test("a draw_defense call can carry a pressure, but only in 11-man, and the front can be the 4-2-5", () => {
  assert.ok((DEFENSE_FRONTS as readonly string[]).includes("4-2-5"));
  const call = cleanDefenseCall({ coverage: "Cover 1", front: "4-2-5", pressure: "Boom", gold: "free" }, "11")!;
  assert.equal(call.pressure, "boom");
  assert.equal(call.gold, "free");
  assert.equal(call.front, "4-2-5");
  assert.match(call.name, /Boom/);
  assert.equal(cleanDefenseCall({ coverage: "Cover 1", pressure: "boom" }, "5v5")!.pressure, undefined);
  assert.equal(cleanDefenseCall({ coverage: "Cover 1", pressure: "no-such" }, "11")!.pressure, undefined);
  assert.equal(cleanDefenseCall({ coverage: "Cover 1", gold: "back" }, "11")!.gold, undefined, "gold means nothing without a pressure");
});

test("a pressure on a defense Griddy calls rushes the front and leaves the open play's own players and lines alone", () => {
  const field = build({ front: "4-3", coverage: "Cover 3" });
  const call = cleanDefenseCall({ coverage: "Cover 1", front: "4-2-5", pressure: "boom" }, "11")!;
  const built = buildDefense(call, field, TOKENS, 100);
  assert.match(built.rush ?? "", /^Boom: .+ rush \(\d+\)/);
  assert.match(built.look, /Boom$/);
  const defenders = built.nodes.filter((n) => n.kind === "player");
  assert.equal(defenders.length, 11);
  assert.ok(defenders.every((n) => n.kind === "player" && n.side === "defense"), "no offense comes back with it");
  const lines = built.nodes.filter((n) => n.kind === "path");
  assert.ok(lines.length >= 6);
  const mine = new Set(field.nodes.map((n) => n.id));
  assert.ok(built.nodes.every((n) => !mine.has(n.id)), "none of the field's own nodes is returned or replaced");
  // Without the pressure the same call draws the library's coverage look only.
  const plain = buildDefense({ ...call, pressure: undefined }, field, TOKENS, 100);
  assert.equal(plain.rush, undefined);
  assert.notEqual(plain.look, built.look);
  // Drawn from the defense's end, the whole thing is turned round with the play: the defenders stand on the near side of the line.
  const turned = buildDefense(call, turnAround(field), TOKENS, 100);
  assert.match(turned.rush ?? "", /^Boom:/);
  const standing = (b: typeof built) => b.nodes.filter((n) => n.kind === "player").map((n) => n.y);
  assert.ok(standing(built).every((y) => y < field.losY), "upright: the defense is up the field");
  assert.ok(standing(turned).every((y) => y > field.losY), "turned round: the defense is below the line");
  // A front without the player a package sends says so, and the rest of the package still runs.
  const short = buildDefense({ ...call, front: "3-4", pressure: "pinch-mow", coverage: "Cover 3" }, build(), TOKENS, 100);
  assert.ok(short.notes.some((n) => /Pinch Mow has no player to send here/.test(n)), short.notes.join(" "));
  assert.match(short.rush ?? "", /^Pinch Mow: /);
  assert.equal(short.nodes.filter((n) => n.kind === "player").length, 11);
});
