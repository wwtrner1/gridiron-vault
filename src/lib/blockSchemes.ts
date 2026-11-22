import { giveBlock } from "./quickBlocks";
import { coveredBy, readField, type Field } from "./fieldRead";
import { routeInk } from "./quickRoutes";
import type { PlayerNode, Scene } from "./types";

/**
 * Blocking schemes (Wes, 2026-11-22): the whole line's blocks in one click.
 * Each scheme gives every blocker the block his job calls for, read from the
 * defense on the field with the covered / uncovered rule (a lineman with a
 * defender over him is covered and blocks him, one with nobody over him is
 * uncovered and helps a covered neighbor, then climbs to a backer). With no
 * defense on the field the same blocks are drawn in their own shapes.
 *
 * Pure, on an upright scene. A play-side `dir` of +1 runs the scheme to the
 * right of the ball, -1 to the left.
 */
export type BlockScheme = {
  id: string;
  label: string;
  hint: string;
  /** What the scheme is, in the coach's words. */
  talk: string;
  group: "run" | "pass" | "screen";
  /** The scheme's little drawing in a 56×44 box: the line across the bottom and the play side's blocks. */
  icon: string;
};

const T = (x: number, y: number, tx: number, ty: number) => {
  const len = Math.hypot(tx - x, ty - y) || 1;
  const px = (-(ty - y) / len) * 5;
  const py = ((tx - x) / len) * 5;
  return `M${x} ${y} L${tx} ${ty} M${(tx - px).toFixed(1)} ${(ty - py).toFixed(1)} L${(tx + px).toFixed(1)} ${(ty + py).toFixed(1)}`;
};

export const BLOCK_SCHEMES: BlockScheme[] = [
  { id: "covered", label: "Covered / uncovered", hint: "Block the man over you; help a neighbor", talk: "covered linemen block the man over them; uncovered linemen double with a covered neighbor, then climb to the backer.", group: "run", icon: `${T(12, 40, 12, 24)} ${T(28, 40, 20, 18)} ${T(44, 40, 44, 24)}` },
  { id: "inside-zone", label: "Inside zone", hint: "Step play side, combo, climb", talk: "the line steps to the play side: covered linemen take the man over them, uncovered linemen combo to the backer, the backside scoops.", group: "run", icon: `${T(12, 40, 20, 24)} ${T(28, 40, 34, 24)} ${T(44, 40, 46, 24)}` },
  { id: "outside-zone", label: "Outside zone", hint: "Everyone reaches play side", talk: "everyone reaches to the play side and gets his head outside the defender, stretching the defense wide.", group: "run", icon: `${T(10, 40, 24, 22)} ${T(26, 40, 38, 22)} ${T(42, 40, 52, 22)}` },
  { id: "power", label: "Power", hint: "Down blocks, a guard kicks out", talk: "the play side blocks down, the backside guard pulls to kick out the end, and a back leads through to the backer.", group: "run", icon: `${T(18, 40, 12, 24)} ${T(34, 40, 28, 24)} M10 40 Q12 46 34 44 L46 24` },
  { id: "counter", label: "Counter", hint: "Two pull, play side down", talk: "the play side blocks down while the backside guard kicks out the end and the backside tackle leads through to the backer.", group: "run", icon: `${T(34, 40, 28, 24)} M10 40 Q12 46 34 44 L46 24 M6 40 Q8 47 30 46 L50 14` },
  { id: "trap", label: "Trap", hint: "Guard pulls across", talk: "the backside guard pulls across and traps the first defender past the center while the line blocks the men over it.", group: "run", icon: `${T(34, 40, 34, 24)} M12 40 Q14 46 26 44 L36 24` },
  { id: "iso", label: "Lead / Iso", hint: "Fullback leads the hole", talk: "the line blocks the man over it or climbs, and a back leads through the hole to the first backer.", group: "run", icon: `${T(12, 40, 12, 24)} ${T(28, 40, 28, 14)} ${T(44, 40, 44, 24)}` },
  { id: "split-zone", label: "Split zone", hint: "Zone with a cutoff", talk: "inside zone for the line, and a tight end or back slices across to cut off the backside end.", group: "run", icon: `${T(14, 40, 22, 24)} ${T(30, 40, 38, 24)} M48 40 L22 32 L8 24` },
  { id: "draw", label: "Draw", hint: "Show pass, then run", talk: "the line sets back like a pass, then turns to run block once the rush has run past.", group: "run", icon: "M12 40 L14 34 M28 40 L30 34 M44 40 L46 34" },
  { id: "pin-pull", label: "Pin and pull", hint: "Pin the end, a guard leads", talk: "the play-side tackle pins the end, the play-side guard pulls and leads around, the rest scoop to the play side.", group: "run", icon: `${T(34, 40, 42, 28)} M20 40 Q22 46 42 44 L50 22` },
  { id: "pass-slide", label: "Slide protection", hint: "Line slides one way", talk: "the line slides to one side and sets back, the back picks up the rusher on the other.", group: "pass", icon: "M12 40 Q14 36 18 38 M28 40 Q30 36 34 38 M44 40 Q46 36 50 38" },
  { id: "pass-man", label: "Man protection", hint: "Each blocks his man", talk: "every lineman blocks the man over him and sets back when nobody is, the backs pick up the extra rushers.", group: "pass", icon: `${T(12, 40, 12, 28)} M28 40 L30 34 ${T(44, 40, 44, 28)}` },
  { id: "screen", label: "Screen", hint: "Sell pass, release to lead", talk: "the play-side guard and tackle sell the pass for a count, then release to the screen and lead upfield; the rest set back.", group: "screen", icon: `M12 40 L14 34 M28 40 L30 34 M36 40 Q36 28 46 20 L50 12` },
];

export const blockScheme = (id: string): BlockScheme | undefined => BLOCK_SCHEMES.find((s) => s.id === id);

export type Pick = { player: PlayerNode; block: string; dir: 1 | -1 };

/** Who is on which side of the ball for a play going `dir`, nearest the center first. */
function sides(f: Field, dir: 1 | -1) {
  const away = (p: PlayerNode) => Math.abs(p.x - f.ball) >= 4;
  const play = f.ol.filter((p) => away(p) && dir * (p.x - f.ball) > 0).sort((a, b) => Math.abs(a.x - f.ball) - Math.abs(b.x - f.ball));
  const back = f.ol.filter((p) => away(p) && dir * (p.x - f.ball) < 0).sort((a, b) => Math.abs(a.x - f.ball) - Math.abs(b.x - f.ball));
  const center = f.center ?? f.ol.find((p) => !away(p)) ?? null;
  const teOn = (side: 1 | -1) => f.tes.filter((p) => side * (p.x - f.ball) > 0);
  return { play, back, center, tePlay: teOn(dir), teBack: teOn((-dir) as 1 | -1) };
}

/**
 * The block every blocker gets in a scheme: [player, block id]. Nothing for a
 * play with no line (5-on-5 and 7-on-7 have no linemen to scheme).
 */
export function schemePicks(scene: Scene, id: string, dir: 1 | -1): Pick[] {
  const f = readField(scene);
  if (!f.ol.length) return [];
  const s = sides(f, dir);
  const cov = coveredBy(f);
  const covered = (p: PlayerNode) => !!cov[f.ol.indexOf(p)];
  const picks: Pick[] = [];
  const give = (p: PlayerNode | null | undefined, block: string, d: 1 | -1 = dir) => {
    if (p && !picks.some((x) => x.player.id === p.id)) picks.push({ player: p, block, dir: d });
  };
  const neighborCovered = (p: PlayerNode): 1 | -1 | 0 => {
    const i = f.ol.indexOf(p);
    const towardPlay = dir > 0 ? i + 1 : i - 1;
    const other = dir > 0 ? i - 1 : i + 1;
    if (f.ol[towardPlay] && covered(f.ol[towardPlay])) return dir;
    if (f.ol[other] && covered(f.ol[other])) return (-dir) as 1 | -1;
    return 0;
  };
  /** Covered: the man over him. Uncovered: combo with a covered neighbor (play side first), else climb. */
  const rule = (p: PlayerNode) => {
    if (covered(p)) return give(p, "base");
    const n = neighborCovered(p);
    return n ? give(p, "combo", n) : give(p, "climb");
  };
  const firstBack = f.backs[0];
  const skillWide = f.wide;

  switch (id) {
    case "covered":
      f.ol.forEach(rule);
      f.tes.forEach((p) => give(p, "base"));
      break;
    case "inside-zone":
      s.play.forEach(rule);
      if (s.center) give(s.center, covered(s.center) ? "base" : "combo");
      s.back.forEach((p) => (covered(p) ? give(p, "base") : give(p, "scoop", dir)));
      s.tePlay.forEach((p) => give(p, "base"));
      s.teBack.forEach((p) => give(p, "base"));
      skillWide.forEach((p) => give(p, "stalk"));
      break;
    case "outside-zone":
      f.ol.forEach((p) => give(p, "reach", dir));
      f.tes.forEach((p) => give(p, "reach", dir));
      skillWide.forEach((p) => give(p, "stalk"));
      break;
    case "power": {
      const puller = s.back[0];
      s.play.forEach((p) => give(p, "down"));
      give(s.center, "base");
      give(puller, "pull-kick");
      s.back.slice(1).forEach((p) => give(p, "hinge"));
      s.tePlay.forEach((p) => give(p, "down"));
      s.teBack.forEach((p) => give(p, "base"));
      give(firstBack, "lead");
      skillWide.forEach((p) => give(p, "stalk"));
      break;
    }
    case "counter": {
      const [g, t] = [s.back[0], s.back[1]];
      s.play.forEach((p) => give(p, "down"));
      give(s.center, "base");
      give(g, "pull-kick");
      give(t, "pull-lead");
      s.back.slice(2).forEach((p) => give(p, "hinge"));
      s.tePlay.forEach((p) => give(p, "down"));
      skillWide.forEach((p) => give(p, "stalk"));
      break;
    }
    case "trap": {
      const puller = s.back[0];
      s.play.forEach((p) => give(p, "base"));
      give(s.center, "scoop", dir);
      give(puller, "trap");
      s.back.slice(1).forEach((p) => give(p, "base"));
      f.tes.forEach((p) => give(p, "base"));
      skillWide.forEach((p) => give(p, "stalk"));
      break;
    }
    case "iso":
      f.ol.forEach(rule);
      f.tes.forEach((p) => give(p, "base"));
      give(firstBack, "lead");
      skillWide.forEach((p) => give(p, "stalk"));
      break;
    case "split-zone": {
      s.play.forEach(rule);
      if (s.center) give(s.center, covered(s.center) ? "base" : "combo");
      s.back.forEach((p) => (covered(p) ? give(p, "base") : give(p, "scoop", dir)));
      s.tePlay.forEach((p) => give(p, "base"));
      give(s.teBack[0] ?? firstBack, "slice");
      skillWide.forEach((p) => give(p, "stalk"));
      break;
    }
    case "draw":
      f.ol.forEach((p) => give(p, "pass-set"));
      f.tes.forEach((p) => give(p, "pass-pro"));
      break;
    case "pin-pull": {
      const guard = s.play[0];
      const tackle = s.play[1];
      give(guard, "pull-lead");
      give(tackle, "reach");
      s.play.slice(2).forEach((p) => give(p, "reach"));
      give(s.center, "scoop", dir);
      s.back.forEach((p) => give(p, "scoop", dir));
      s.tePlay.forEach((p) => give(p, "reach"));
      skillWide.forEach((p) => give(p, "stalk"));
      break;
    }
    case "pass-slide":
      f.ol.forEach((p) => give(p, "pass-set"));
      f.tes.forEach((p) => give(p, "pass-pro"));
      f.backs.forEach((p) => give(p, "pass-pro"));
      break;
    case "pass-man":
      f.ol.forEach((p) => (covered(p) ? give(p, "base") : give(p, "pass-set")));
      f.tes.forEach((p) => give(p, "pass-pro"));
      f.backs.forEach((p) => give(p, "pass-pro"));
      break;
    case "screen": {
      const out = new Set([s.play[0]?.id, s.play[1]?.id]);
      f.ol.forEach((p) => (out.has(p.id) ? give(p, "screen") : give(p, "pass-set")));
      f.tes.forEach((p) => give(p, "pass-pro"));
      break;
    }
    default:
      return [];
  }
  return picks;
}

/** Draws a scheme: every pick's block, in his own color, replacing the lines he had. */
export function applyScheme(scene: Scene, id: string, o: { dir: 1 | -1; fallbackInk: string; width: number; z: number }): { scene: Scene; picks: Pick[] } | null {
  const picks = schemePicks(scene, id, o.dir);
  if (!picks.length) return null;
  let next = scene;
  let z = o.z;
  const done: Pick[] = [];
  for (const pick of picks) {
    const p = next.nodes.find((n): n is PlayerNode => n.kind === "player" && n.id === pick.player.id);
    if (!p) continue;
    const made = giveBlock(next, p, pick.block, { ink: routeInk(p, o.fallbackInk), width: o.width, z: z++, dir: pick.dir });
    if (!made) continue;
    next = made.scene;
    done.push(pick);
  }
  return done.length ? { scene: next, picks: done } : null;
}
