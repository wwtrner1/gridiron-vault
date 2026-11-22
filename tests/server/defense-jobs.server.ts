import assert from "node:assert/strict";
import { test } from "node:test";
import { FRONTS, layoutDefense, mirrorDefense } from "../../src/lib/defense";
import { withoutDefense } from "../../src/lib/matchDefense";
import { planFor, setupScene } from "../../src/lib/playSetup";
import { OFFENSE_TOKENS } from "../../src/lib/presets";
import { DEFENDER_JOBS, clearDefender, giveAssignment, hasDefense } from "../../src/lib/quickDefense";
import { PRESSURES, applyPressure, rolesOf } from "../../src/lib/pressures";
import { checkRules } from "../../src/lib/ruleCheck";
import { explainPlay } from "../../src/lib/explain";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { NodeLayer } from "../../src/lib/render";
import { INK, build, byLabel, endOf, linesFor, paths, players, world } from "./blocking-fixture";
import type { PathNode, PlayerNode, Scene } from "../../src/lib/types";

/**
 * Defender assignments, the 4-2-5 and Wes's pressures (`lib/quickDefense.ts`,
 * `lib/pressures.ts`): who is sent where, what each line looks like to the
 * readers (rush solid, man dashed, drops dashed with a dot), and that a
 * pressure re-applied leaves nothing behind.
 */
const FRONT_LIST = ["4-2-5", "4-3", "4-4", "3-4", "5-2", "3-3"] as const;
const ink = { ...INK };
const defenders = (s: Scene) => players(s, "defense");
const lineOf = (s: Scene, d: PlayerNode): PathNode => {
  const own = linesFor(s, d);
  assert.equal(own.length, 1, `${d.label}@${Math.round(d.x)} has ${own.length} lines`);
  return own[0];
};

test("the 4-2-5 is a real front: four down, two backers, five defensive backs, with Wes's letters", () => {
  assert.ok((FRONTS as readonly string[]).includes("4-2-5"));
  for (const coverage of ["Cover 3", "Cover 1", "Cover 2", "Cover 4", "Man"] as const) {
    const scene = build({ front: "4-2-5", coverage });
    const d = defenders(scene);
    assert.equal(d.length, 11, `${coverage}: eleven defenders`);
    const labels = d.map((p) => p.label).sort().join("");
    assert.equal(labels, ["$", "B", "C", "C", "F", "M", "N", "R", "S", "T", "W"].sort().join(""), `${coverage}: B T N W, M S, $, C C, R, F`);
    const down = d.filter((p) => 420 - p.y <= 52);
    assert.ok(down.length >= 4, `${coverage}: the four down men stand on the line`);
  }
  const plan = planFor("Nickel 4-2-5");
  assert.equal(plan.side === "defense" && plan.front, "4-2-5");
  assert.ok(plan.side === "defense" && plan.exact);
});

test("New play setup lines the nickel up in the 4-2-5 against a scout offense", () => {
  const made = setupScene({ name: "t", personnel: "Nickel 4-2-5", formation: "Doubles", view: "half", pov: "offense", book: "", newBook: "" }, OFFENSE_TOKENS);
  assert.equal(defenders(made.scene).length, 11);
  assert.ok(made.scene.nodes.some((n) => n.kind === "player" && n.label === "$"));
  assert.match(made.status, /lined up/i);
  // Flipped, the strength goes left but the letters stay.
  const flipped = mirrorDefense(layoutDefense("4-2-5", "Cover 3", []));
  assert.equal(flipped.defenders.length, 11);
});

test("each job draws the line the readers expect: rush solid, man dashed, drops dashed with a dot, hit zigzags", () => {
  const scene = build({ front: "4-2-5" });
  const t = byLabel(scene, "T", "defense");
  const m = byLabel(scene, "M", "defense");
  const c = byLabel(scene, "C", "defense", 0);
  const shapeOf = (d: PlayerNode, job: string, o: Partial<Parameters<typeof giveAssignment>[3]> = {}) => {
    const made = giveAssignment(scene, d, job, { dir: 1, ...ink, ...o });
    assert.ok(made, `${d.label} ${job}`);
    return made.path;
  };
  for (const job of ["rush", "a-gap", "b-gap", "c-gap", "slant", "loop", "contain", "peel", "hit"]) {
    const line = shapeOf(job === "hit" || job === "peel" ? m : t, job);
    assert.equal(line.style, "solid", `${job} is a solid line, so the Rules check counts it as a rush`);
    assert.notEqual(line.endCap, "tee", `${job} is not a block`);
    assert.equal(line.assignOf, (job === "hit" || job === "peel" ? m : t).id);
  }
  const hit = shapeOf(m, "hit");
  assert.equal(hit.zigzag, true);
  assert.equal(hit.tag, "HIT");
  assert.equal(shapeOf(m, "peel").tag, "PEEL");
  const man = giveAssignment(scene, c, "man", { dir: 1, ...ink });
  assert.ok(man?.target, "man coverage names the receiver he trails");
  assert.equal(man.path.style, "dashed", "man lines must be dashed: a solid defender line near the line counts as a rusher");
  assert.equal(man.scene.nodes.find((n) => n.id === c.id && n.kind === "player" && (n as PlayerNode).job)?.kind, "player");
  for (const job of DEFENDER_JOBS.filter((j) => j.group === "coverage" && !j.needsTarget)) {
    const line = shapeOf(m, job.id);
    assert.equal(line.style, "dashed", `${job.id} drop is dashed`);
    assert.equal(line.endCap, "dot", `${job.id} drop ends in a dot`);
    assert.ok(line.points.length >= 2);
  }
});

test("a rush from the defense's side reaches the quarterback side of the line and never crosses the field", () => {
  const scene = build({ front: "4-3" });
  for (const d of defenders(scene).filter((p) => 420 - p.y <= 52)) {
    for (const job of ["rush", "a-gap", "b-gap"]) {
      const made = giveAssignment(scene, d, job, { dir: 1, ...ink })!;
      const end = endOf(made.path);
      assert.ok(end.y > scene.losY - 20, `${d.label} ${job} gets across the line`);
      for (const p of world(made.path)) assert.ok(p.x > 0 && p.x < 1040 && p.y < 660);
    }
  }
});

test("a new assignment replaces the old line and the drop's zone, and clearing removes the tag", () => {
  const scene = build({ front: "4-3", coverage: "Cover 3", zones: true });
  const w = byLabel(scene, "W", "defense");
  const zonesBefore = scene.nodes.filter((n) => n.kind === "shape" && /zone/i.test(n.name)).length;
  assert.ok(zonesBefore > 0, "the library draws shaded zones for the drops");
  const first = giveAssignment(scene, w, "b-gap", { dir: 1, ...ink })!;
  const second = giveAssignment(first.scene, w, "man", { dir: 1, ...ink })!;
  assert.equal(linesFor(second.scene, w).length, 1);
  assert.equal(lineOf(second.scene, w).style, "dashed");
  const cleared = clearDefender(second.scene, w);
  assert.equal(linesFor(cleared, w).length, 0);
  assert.equal((cleared.nodes.find((n) => n.id === w.id) as PlayerNode).job, undefined);
});

test("every pressure against every front gives each defender exactly one job and one line", () => {
  for (const front of FRONT_LIST) {
    const scene = build({ front });
    assert.ok(hasDefense(scene));
    for (const p of PRESSURES) {
      for (const gold of ["back", "free"] as const) {
        const done = applyPressure(scene, p.id, { gold, width: 3, z: 100 });
        assert.ok(!("error" in done), `${p.id} vs ${front}: ${"error" in done ? done.error : ""}`);
        const d = defenders(done.scene);
        for (const def of d) {
          assert.equal(linesFor(done.scene, def).length, 1, `${p.id} vs ${front}: ${def.label}@${Math.round(def.x)}`);
          assert.ok(def.job === undefined || typeof def.job === "string");
        }
        for (const def of defenders(done.scene)) assert.ok(def.job, `${p.id} vs ${front}: ${def.label} has his job under his token`);
        assert.ok(done.rushers.length >= 3, `${p.id} vs ${front} sends ${done.rushers.length}`);
        // Every line is the player's, nothing is orphaned, and nobody's line is a block.
        const owners = new Set(defenders(done.scene).map((x) => x.id));
        for (const l of paths(done.scene)) {
          assert.ok(l.assignOf && owners.has(l.assignOf), `${p.id} vs ${front}: ${l.name} belongs to a defender`);
          assert.notEqual(l.endCap, "tee");
        }
      }
    }
  }
});

test("a pressure over the Defense library's own zones and lines leaves one line each and no stale zones", () => {
  for (const coverage of ["Cover 3", "Cover 1", "Man"] as const) {
    const scene = build({ front: "4-2-5", coverage, zones: true });
    const done = applyPressure(scene, "boom", { width: 3, z: 100 });
    assert.ok(!("error" in done));
    for (const d of defenders(done.scene)) assert.equal(linesFor(done.scene, d).length, 1, `${coverage}: ${d.label} has one line`);
    assert.equal(paths(done.scene).length, 11, `${coverage}: no line of the old coverage is left`);
    assert.equal(done.scene.nodes.filter((n) => n.kind === "shape" && /zone/i.test(n.name)).length, 0, `${coverage}: zones of replaced drops are gone`);
  }
});

test("pressures send the right players in the 4-2-5", () => {
  const scene = build({ front: "4-2-5" });
  const sent = (id: string) => {
    const done = applyPressure(scene, id, { width: 3, z: 100 });
    assert.ok(!("error" in done));
    return done.rushers.map((d) => d.label).sort().join("");
  };
  const roles = rolesOf(scene);
  assert.equal(roles.three?.label, "T");
  assert.equal(roles.nose?.label, "N");
  assert.equal(roles.nickel?.label, "$");
  assert.equal(roles.rover?.label, "R");
  // Five-man: the down four and one backer. SOB sends the backer away from the 3 technique, Go the one to him.
  assert.equal(sent("sob"), ["B", "M", "N", "T", "W"].sort().join(""));
  assert.equal(sent("go"), ["B", "S", "N", "T", "W"].sort().join(""));
  assert.equal(sent("mob"), ["B", "N", "S", "T", "W"].sort().join(""));
  // Six-man: both backers go.
  for (const id of ["missile", "boom", "extra"]) assert.equal(sent(id), ["B", "M", "N", "S", "T", "W"].sort().join(""), id);
  // Twist: four rush and the nose loops.
  assert.equal(sent("twist"), ["B", "N", "T", "W"].sort().join(""));
  const sob = applyPressure(scene, "sob", { width: 3, z: 100 });
  assert.ok(!("error" in sob));
  const away = byLabel(sob.scene, "M", "defense");
  assert.ok(away.x < 520, "M is the backer away from the 3 technique");
  assert.match(String(away.job), /B gap/);
  // The three technique on the right slants into the A gap on Mob.
  const mob = applyPressure(scene, "mob", { width: 3, z: 100 });
  assert.ok(!("error" in mob));
  const three = byLabel(mob.scene, "T", "defense");
  const slant = endOf(lineOf(mob.scene, three));
  assert.ok(Math.abs(slant.x - 520) < 60, "the 3 technique's slant ends in the A gap, near the ball");
});

test("Wes's tags land on the lines: HIT, PEEL, SWAP, READ HOLE", () => {
  const scene = build({ front: "4-2-5" });
  const tags = (id: string) => {
    const done = applyPressure(scene, id, { width: 3, z: 100 });
    assert.ok(!("error" in done));
    return paths(done.scene).map((l) => l.tag).filter(Boolean).sort();
  };
  assert.deepEqual(tags("sextra").filter((t) => t === "HIT" || t === "PEEL"), ["HIT", "PEEL", "PEEL"]);
  assert.ok(tags("swing").includes("SWAP"));
  const twist = tags("twist");
  assert.ok(twist.includes("SWAP") && twist.includes("READ HOLE"));
  const sextra = applyPressure(scene, "sextra", { width: 3, z: 100 });
  assert.ok(!("error" in sextra));
  assert.ok(paths(sextra.scene).some((l) => l.zigzag), "the hit line is the zigzag");
});

test("Gold Back puts the rover on the back; Gold Free leaves him free in the deep middle", () => {
  const scene = build({ front: "4-2-5" });
  const back = applyPressure(scene, "sob", { gold: "back", width: 3, z: 100 });
  const free = applyPressure(scene, "sob", { gold: "free", width: 3, z: 100 });
  assert.ok(!("error" in back) && !("error" in free));
  const rover = (s: Scene) => byLabel(s, "R", "defense");
  const rb = lineOf(back.scene, rover(back.scene));
  assert.equal(rb.style, "dashed");
  assert.match(rb.name, /man on/i);
  assert.match(rb.name, /H|S/, "he takes a back");
  const rf = lineOf(free.scene, rover(free.scene));
  assert.equal(rf.endCap, "dot", "free is a zone drop");
  // Behind a pressure the deepest leftover is the free player.
  assert.ok(defenders(back.scene).some((d) => /deep/i.test(String(d.job))), "the leftover deepest man is the free player");
  // Twist is the one with a backer reading the hole.
  const twist = applyPressure(scene, "twist", { width: 3, z: 100 });
  assert.ok(!("error" in twist));
  assert.ok(defenders(twist.scene).some((d) => /hole/i.test(String(d.job))), "a backer is the hole player behind a Twist");
});

test("applying a pressure twice, or after another, leaves no orphaned lines, and the defense can still be removed", () => {
  const scene = build({ front: "4-2-5" });
  const a = applyPressure(scene, "sob", { width: 3, z: 100 });
  assert.ok(!("error" in a));
  const b = applyPressure(a.scene, "sextra", { width: 3, z: 200 });
  assert.ok(!("error" in b));
  const c = applyPressure(b.scene, "sextra", { width: 3, z: 300 });
  assert.ok(!("error" in c));
  assert.equal(paths(c.scene).length, 11, "one line per defender after three pressures");
  assert.equal(c.scene.nodes.length, b.scene.nodes.length);
  const gone = withoutDefense(c.scene);
  assert.equal(gone.removed, 11);
  assert.equal(paths(gone.scene).length, 0, "no line is left behind when the defense goes");
  assert.equal(defenders(gone.scene).length, 0);
  assert.equal(players(gone.scene, "offense").length, players(scene, "offense").length);
});

test("a pressure is declined with a coach's reason when there is nothing to send", () => {
  const none = build();
  const r = applyPressure(none, "sob", { width: 3, z: 100 });
  assert.ok("error" in r);
  assert.match(r.error, /defense/i);
  const unknown = applyPressure(build({ front: "4-3" }), "nope", { width: 3, z: 100 });
  assert.ok("error" in unknown);
});

test("the Rules check counts a rusher's solid line and leaves a man line alone", () => {
  const scene = build({ front: "4-3" });
  const t = byLabel(scene, "T", "defense");
  const c = byLabel(scene, "C", "defense", 0);
  const meta = { playType: "defense" } as never;
  const rules = { on: true, rush: 7, noRun: 5, set: "nfl-flag" };
  const rushItem = (s: Scene) => checkRules(s, meta, rules).items.find((i) => i.id === "rush")!;
  const man = giveAssignment(scene, c, "man", { dir: 1, ...ink })!;
  assert.match(rushItem(man.scene).detail, /No rushers drawn/, "a dashed man line is coverage, not a rush");
  const rush = giveAssignment(scene, t, "rush", { dir: 1, ...ink })!;
  assert.doesNotMatch(rushItem(rush.scene).detail, /No rushers drawn/, "a solid arrow from a lineman is a rush");
});

test("zigzag, tags and the pull lines render", () => {
  const scene = build({ front: "4-2-5" });
  const done = applyPressure(scene, "sextra", { width: 3, z: 100 });
  assert.ok(!("error" in done));
  const hit = paths(done.scene).find((l) => l.zigzag)!;
  const markup = renderToStaticMarkup(createElement("svg", null, createElement(NodeLayer, { node: hit })));
  assert.match(markup, /<path[^>]* d="M/);
  // A zigzag has many more corners than the straight two-point line it replaces.
  const d = /\sd="([^"]+)"/.exec(markup)![1];
  assert.ok((d.match(/L/g) ?? []).length >= 4, "the hit line zigzags");
  const plain = renderToStaticMarkup(createElement("svg", null, createElement(NodeLayer, { node: { ...hit, zigzag: false } })));
  assert.ok((/\sd="([^"]+)"/.exec(plain)![1].match(/L/g) ?? []).length < 4);
});

test("the talking points name each defender's job, and a coach-set tag survives a pressure only when replaced", () => {
  const scene = build({ front: "4-2-5" });
  const done = applyPressure(scene, "go", { width: 3, z: 100 });
  assert.ok(!("error" in done));
  const text = explainPlay(done.scene);
  assert.match(text, /S: A gap\./);
});
