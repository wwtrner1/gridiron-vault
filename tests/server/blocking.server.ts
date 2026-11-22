import assert from "node:assert/strict";
import { test } from "node:test";
import { applyScheme, BLOCK_SCHEMES, schemePicks } from "../../src/lib/blockSchemes";
import { LINE_BLOCKS, SKILL_BLOCKS, blockOf, blocksFor, giveBlock } from "../../src/lib/quickBlocks";
import { blocksOnTap, giveQuickRoute, QUICK_ROUTES } from "../../src/lib/quickRoutes";
import { onUpright } from "../../src/lib/assignLine";
import { turnAround } from "../../src/lib/scene";
import { explainPlay } from "../../src/lib/explain";
import { INK, build, byLabel, endOf, linesFor, paths, players, world } from "./blocking-fixture";

/**
 * One-click blocks and whole-line schemes (`lib/quickBlocks.ts`,
 * `lib/blockSchemes.ts`): every block is a T-ended line glued to its player,
 * a scheme gives the whole line a block each, and the readers that classify a
 * block by its T (the rules check, the talking points) still see one.
 */
const FRONTS = ["4-3", "4-2-5", "3-4", "5-2"] as const;
const SCHEME_INK = { fallbackInk: "#222222", width: 3, z: 100 };

test("every lineman block ends in a T, is glued to the lineman and stays on the field", () => {
  const scene = build({ front: "4-3" });
  for (const id of LINE_BLOCKS.map((b) => b.id)) {
    for (const who of [byLabel(scene, "G", "offense", 0), byLabel(scene, "T", "offense", 1), byLabel(scene, "C")]) {
      for (const dir of [1, -1] as const) {
        const made = giveBlock(scene, who, id, { ...INK, dir });
        assert.ok(made, `${who.label} ${id} ${dir}`);
        assert.equal(made.path.endCap, "tee", `${who.label} ${id} must end in a T`);
        assert.equal(made.path.assignOf, who.id);
        assert.equal(made.path.stroke, INK.ink);
        const pts = world(made.path);
        assert.ok(pts.length >= 2);
        for (const p of pts) {
          assert.ok(p.x > 0 && p.x < 1040 && p.y > 0 && p.y < 660, `${who.label} ${id} leaves the field at ${p.x},${p.y}`);
        }
        const kind = blockOf(made.path);
        assert.equal(kind?.id, id, `${made.path.name} reads back as ${id}`);
      }
    }
  }
});

test("a skill player's blocks end in a T too, and the lists are the right ones", () => {
  const scene = build({ front: "4-3" });
  const y = byLabel(scene, "Y");
  const x = byLabel(scene, "X");
  const h = byLabel(scene, "H");
  for (const who of [x, y, h]) {
    for (const kind of SKILL_BLOCKS) {
      const made = giveBlock(scene, who, kind.id, { ...INK, dir: who.x < 520 ? -1 : 1 });
      if (!made) continue; // a block with nothing to aim at is declined, never half drawn
      assert.equal(made.path.endCap, "tee", `${who.label} ${kind.id}`);
    }
  }
  assert.equal(blocksFor(true), LINE_BLOCKS);
  assert.equal(blocksFor(false), SKILL_BLOCKS);
  assert.ok(LINE_BLOCKS.length >= 12);
  assert.equal(new Set(LINE_BLOCKS.map((b) => b.id)).size, LINE_BLOCKS.length);
  assert.ok(blocksOnTap(scene, byLabel(scene, "T", "offense", 0)));
  assert.ok(!blocksOnTap(scene, x));
});

test("a base block stops short of the man over the lineman and a combo is one line with a bend", () => {
  const scene = build({ front: "4-3" });
  const guard = byLabel(scene, "G", "offense", 1);
  const base = giveBlock(scene, guard, "base", { ...INK, dir: 1 });
  assert.ok(base?.target, "a base block names the defender it is aimed at");
  const target = base.target;
  const stop = endOf(base.path);
  const gap = Math.hypot(stop.x - target.x, stop.y - target.y);
  assert.ok(gap > 4 && gap < (target.size ?? 30) * 1.2, `T stops ${gap.toFixed(1)} units short of the defender`);

  const combo = giveBlock(scene, guard, "combo", { ...INK, dir: 1 });
  assert.ok(combo);
  assert.ok(combo.path.points.length >= 3, "a combo is one multi-point line, so Block for T can't drop half of it");
});

test("a new block replaces the route or block the player had, and only his", () => {
  const scene = build({ front: "4-3" });
  const tackle = byLabel(scene, "T", "offense", 1);
  const guard = byLabel(scene, "G", "offense", 1);
  const one = giveBlock(scene, tackle, "reach", { ...INK, dir: 1 })!;
  const two = giveBlock(one.scene, guard, "down", { ...INK, dir: 1 })!;
  const three = giveBlock(two.scene, tackle, "base", { ...INK, dir: 1 })!;
  assert.equal(linesFor(three.scene, tackle).length, 1, "the tackle has one block");
  assert.equal(linesFor(three.scene, tackle)[0].id, three.path.id);
  assert.equal(linesFor(three.scene, guard).length, 1, "the guard's block is untouched");
  assert.equal(paths(three.scene).length, 2);
  // A receiver given a route and then a block keeps no route.
  const z = byLabel(scene, "Z");
  const route = giveQuickRoute(scene, QUICK_ROUTES[0], z, { mirror: false, ink: "#1d7a50", width: 3, z: 50 });
  const blocked = giveBlock(route.scene, z, "stalk", { ...INK, dir: 1 })!;
  assert.deepEqual(linesFor(blocked.scene, z).map((l) => l.endCap), ["tee"]);
});

test("the schemes put a block on every blocker, in his color, every one ending in a T", () => {
  for (const front of FRONTS) {
    const scene = build({ front });
    for (const scheme of BLOCK_SCHEMES) {
      for (const dir of [1, -1] as const) {
        const done = applyScheme(scene, scheme.id, { ...SCHEME_INK, dir });
        assert.ok(done, `${scheme.id} against ${front} ${dir}`);
        const linemen = players(scene, "offense").filter((p) => /^(T|G|C)$/.test(p.label));
        for (const lineman of linemen) {
          const own = linesFor(done.scene, lineman);
          assert.equal(own.length, 1, `${scheme.id}: ${lineman.label}@${Math.round(lineman.x)} has exactly one block`);
          assert.equal(own[0].endCap, "tee");
        }
        for (const pick of done.picks) assert.equal(blockOf(linesFor(done.scene, pick.player)[0])?.id, pick.block);
        // No route is left behind or drawn by a scheme.
        assert.ok(paths(done.scene).every((l) => l.endCap === "tee"), `${scheme.id} drew something that isn't a block`);
      }
    }
  }
});

test("power and counter pull the backside guard to the play side, inside zone doesn't pull anyone", () => {
  const scene = build({ front: "4-3" });
  const leftGuard = byLabel(scene, "G", "offense", 0);
  const rightGuard = byLabel(scene, "G", "offense", 1);
  const picksOf = (id: string, dir: 1 | -1) => new Map(schemePicks(scene, id, dir).map((p) => [p.player.id, p.block]));
  assert.equal(picksOf("power", 1).get(leftGuard.id), "pull-kick", "play right: the left guard pulls");
  assert.equal(picksOf("power", -1).get(rightGuard.id), "pull-kick", "play left: the right guard pulls");
  const done = applyScheme(scene, "power", { ...SCHEME_INK, dir: 1 })!;
  const pull = endOf(linesFor(done.scene, leftGuard)[0]);
  assert.ok(pull.x > leftGuard.x + 60, `the puller ends well to the right (${Math.round(pull.x)} from ${Math.round(leftGuard.x)})`);
  const zone = picksOf("inside-zone", 1);
  for (const [, block] of zone) assert.ok(!block.startsWith("pull"), "inside zone has no puller");
});

test("covered and uncovered: a lineman with a man over him blocks him, one without doubles or climbs", () => {
  const scene = build({ front: "4-3" });
  const picks = schemePicks(scene, "covered", 1);
  const by = new Map(picks.map((p) => [p.player.id, p.block]));
  const center = byLabel(scene, "C");
  // The 4-3's 1 technique is shaded on the center's weak shoulder: the center is covered, the 3 technique covers the strong guard.
  assert.equal(by.get(center.id), "base");
  const line = picks.filter((p) => /^(T|G|C)$/.test(p.player.label));
  const covered = line.filter((p) => p.block === "base").length;
  const uncovered = line.filter((p) => p.block === "combo" || p.block === "climb").length;
  assert.equal(covered + uncovered, 5, "each of the five linemen is either covered or not");
  assert.ok(uncovered >= 1 && covered >= 3);
  // With no defense on the field the generic shape is still drawn.
  const empty = build();
  const generic = applyScheme(empty, "inside-zone", { ...SCHEME_INK, dir: 1 });
  assert.ok(generic && generic.picks.length >= 5);
});

test("5-on-5 and 7-on-7 have no linemen to scheme", () => {
  const flag = build({ game: "5v5", personnel: "11", formation: "Doubles" });
  assert.deepEqual(schemePicks(flag, "inside-zone", 1), []);
  assert.equal(applyScheme(flag, "inside-zone", { ...SCHEME_INK, dir: 1 }), null);
});

test("a scheme on a field drawn from the defense's end is the same play turned round, to the side the coach sees", () => {
  const upright = build({ front: "4-2-5" });
  const turned = turnAround(upright);
  assert.equal(turned.pov, "defense");
  // "Right" on the coach's screen is left on the upright field, so the direction flips with the field.
  const viaTurned = onUpright(turned, 1, (flat, dir) => applyScheme(flat, "inside-zone", { ...SCHEME_INK, dir }));
  const direct = applyScheme(upright, "inside-zone", { ...SCHEME_INK, dir: -1 })!;
  assert.ok(viaTurned);
  assert.equal(viaTurned.scene.pov, "defense", "the field stays turned");
  const sig = (s: typeof direct.scene) => paths(s).map((l) => `${l.name}:${Math.round(endOf(l).x)},${Math.round(endOf(l).y)}`).sort();
  assert.deepEqual(sig(viaTurned.scene), sig(turnAround(direct.scene)));
  assert.equal(onUpright(upright, 1, (flat, dir) => ({ scene: flat, dir }))?.dir, 1, "an upright field passes straight through");
});

test("the talking points name the block instead of just saying he blocks", () => {
  const scene = build({ front: "4-3" });
  const guard = byLabel(scene, "G", "offense", 0);
  const made = giveBlock(scene, guard, "pull-kick", { ...INK, dir: 1 })!;
  const text = JSON.stringify(explainPlay(made.scene));
  assert.match(text, /pulls and kicks out/i);
});
