import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFENSE_TOKENS, OFFENSE_TOKENS } from "../../src/lib/presets";
import { personnelGroups } from "../../src/lib/personnel";
import { defaultFormation, planFor, setupScene, type SetupChoice } from "../../src/lib/playSetup";
import { downfield, framePoint, inUpright, toFrame, turnAround, upright } from "../../src/lib/pov";
import { applyPatch, diffScene } from "../../src/lib/live";
import { routeSummary } from "../../src/lib/explain";
import { checkRules } from "../../src/lib/ruleCheck";
import { RULE_PRESETS } from "../../src/lib/rules";
import { giveQuickRoute, leftSide, quickPoints, QUICK_ROUTES } from "../../src/lib/quickRoutes";
import { applyFormat, captureFormat } from "../../src/lib/playFormat";
import type { FieldView, PlayerNode, Scene } from "../../src/lib/types";

/**
 * Drawing from the defense's end (`lib/pov.ts`): the play turns half a circle about the middle of the card on every field,
 * the defense sits at the bottom, and the code written for the offense-up frame reads a turned play the same way.
 *
 *   npm run test:server
 */
const TOKENS = [...OFFENSE_TOKENS, ...DEFENSE_TOKENS];
const VIEWS: FieldView[] = ["half", "full", "redzone", "flag", "blank"];
const choice = (personnel: string, view: FieldView, pov: SetupChoice["pov"]): SetupChoice => ({ name: "t", personnel, formation: defaultFormation(personnel), view, pov, book: "", newBook: "" });

const players = (s: Scene) => s.nodes.filter((n): n is PlayerNode => n.kind === "player" && n.side !== ("ball" as never));
const near = (a: number, b: number, why: string) => assert.ok(Math.abs(a - b) < 1e-6, `${why}: ${a} vs ${b}`);

test("turning twice puts every field back, and a turned play knows it is turned", () => {
  for (const view of VIEWS) {
    const s = setupScene(choice("11 personnel", view, "offense"), TOKENS).scene;
    const t = turnAround(s);
    assert.equal(t.pov, "defense", view);
    near(t.losY, s.height - s.losY, `${view} losY`);
    assert.equal(upright(t).pov, undefined, view);
    const back = turnAround(t);
    assert.equal(back.pov, undefined, view);
    assert.equal(back.nodes.length, s.nodes.length, view);
    near(back.losY, s.losY, `${view} back losY`);
    s.nodes.forEach((n, i) => {
      near(back.nodes[i].x, n.x, `${view} x`);
      near(back.nodes[i].y, n.y, `${view} y`);
      assert.equal(back.nodes[i].scaleX, n.scaleX, view);
    });
    assert.equal(downfield(s), -1);
    assert.equal(downfield(t), 1);
    // A point and its frame are each other's inverse.
    const p = framePoint(t, { x: 100, y: 200 });
    assert.deepEqual(framePoint(t, p), { x: 100, y: 200 });
  }
});

test("an edit written for the offense-up frame lands in the turned play's own frame", () => {
  const s = setupScene(choice("11 personnel", "half", "defense"), TOKENS).scene;
  const moved = inUpright(s, (u) => ({ ...u, nodes: u.nodes.map((n) => ({ ...n, y: n.y + 30 })) }));
  assert.equal(moved.pov, "defense");
  // 30 units further from the line in the upright frame is 30 units the other way on the turned card.
  s.nodes.forEach((n, i) => near(moved.nodes[i].y, n.y - 30, "y"));
  assert.deepEqual(toFrame(s, [])[0], undefined);
});

test("a defensive personnel drawn from the defense's end puts the defense at the bottom of the card on every field", () => {
  const defensive = personnelGroups("defense")
    .flatMap((g) => g.options.map((o) => o.value))
    .filter((v) => planFor(v).side === "defense");
  assert.ok(defensive.length >= 10, `only ${defensive.length} defensive personnel found`);
  for (const personnel of defensive) {
    for (const view of VIEWS) {
      const { scene } = setupScene(choice(personnel, view, "defense"), TOKENS);
      const label = `${personnel} on ${view}`;
      assert.equal(scene.pov, "defense", label);
      const defenders = players(scene).filter((p) => p.side === "defense");
      const offense = players(scene).filter((p) => p.side === "offense");
      assert.ok(defenders.length >= 5, `${label}: ${defenders.length} defenders`);
      assert.ok(offense.length >= 5, `${label}: scout offense`);
      for (const d of defenders) assert.ok(d.y > scene.losY - 40, `${label}: defender ${d.label} at ${d.y} vs line ${scene.losY}`);
      for (const o of offense) assert.ok(o.y < scene.losY + 40, `${label}: offense ${o.label} at ${o.y} vs line ${scene.losY}`);
      const meanDef = defenders.reduce((a, p) => a + p.y, 0) / defenders.length;
      const meanOff = offense.reduce((a, p) => a + p.y, 0) / offense.length;
      assert.ok(meanDef > scene.losY && meanOff < scene.losY, `${label}: the defense is below the line, the offense above`);
      // Defenders are drawn at the offense's size, so a letter reads the same on either side.
      const sizes = new Set(offense.map((p) => p.size));
      for (const d of defenders) assert.ok(sizes.has(d.size), `${label}: defender size ${d.size}`);
    }
  }
});

test("the same defense drawn from the offense's end sits above the line", () => {
  const { scene } = setupScene(choice("Base 4-3", "half", "offense"), TOKENS);
  assert.equal(scene.pov, undefined);
  for (const d of players(scene).filter((p) => p.side === "defense")) assert.ok(d.y < scene.losY + 40, `defender ${d.label} at ${d.y}`);
});

test("one-click routes run toward the defense, whichever end the play is drawn from", () => {
  for (const pov of ["offense", "defense"] as const) {
    const { scene } = setupScene(choice("11 personnel", "half", pov), TOKENS);
    const x = players(scene).find((p) => p.side === "offense" && p.label === "X")!;
    const post = QUICK_ROUTES.find((r) => r.label === "Post")!;
    const pts = quickPoints(scene, post, x, false);
    const last = pts[pts.length - 1];
    const toward = scene.pov === "defense" ? 1 : -1;
    assert.ok(last.y * toward > 40, `${pov}: the post ends ${last.y} from the receiver`);
    const give = giveQuickRoute(scene, post, x, { mirror: false, ink: "#000", width: 3, z: 1 });
    assert.equal(give.path.assignOf, x.id);
  }
});

test("the same play reads the same from either end: route words, rules check and saved format line", () => {
  const upScene = setupScene(choice("11 personnel", "half", "offense"), TOKENS).scene;
  const x = players(upScene).find((p) => p.side === "offense" && p.label === "X")!;
  const withRoute = giveQuickRoute(upScene, QUICK_ROUTES.find((r) => r.label === "Post")!, x, { mirror: leftSide(x), ink: "#000", width: 3, z: 1 }).scene;
  const turned = turnAround(withRoute);
  assert.equal(routeSummary(turned), routeSummary(withRoute));
  assert.match(routeSummary(turned), /X post/);

  const rules = { rush: 7, noRun: 5, set: RULE_PRESETS[0].id } as Parameters<typeof checkRules>[2];
  const a = checkRules(withRoute, { playType: "pass" }, rules);
  const b = checkRules(turned, { playType: "pass" }, rules);
  assert.deepEqual(
    b.items.map((i) => [i.id, i.status]),
    a.items.map((i) => [i.id, i.status]),
  );

  // A format saved from either end carries the same line of scrimmage, and lands on the other end mirrored.
  const fmt = captureFormat({ id: "p", name: "p", scene: turned });
  near(fmt.losY, withRoute.losY, "saved line");
  const applied = applyFormat({ ...turned, losY: 300, nodes: turned.nodes.map((n) => ({ ...n, y: n.y + (300 - turned.losY) })) }, fmt, ["field"]);
  near(applied.losY, turned.losY, "turned line back where the format wants it");
});

test("a play turned by one coach turns for the others drawing it live", () => {
  const s = setupScene(choice("11 personnel", "half", "offense"), TOKENS).scene;
  const t = turnAround(s);
  const there = applyPatch(s, diffScene(s, t));
  assert.equal(there.pov, "defense");
  near(there.losY, t.losY, "line");
  const back = applyPatch(there, diffScene(t, s));
  assert.equal(back.pov, undefined);
  near(back.losY, s.losY, "line back");
});
