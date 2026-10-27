import { fieldMarks, unitsPerYard } from "./field";
import { toWorld } from "./geometry";
import { linesOf } from "./assignments";
import type { RuleLines, RuleSet } from "./rules";
import { ruleSet } from "./rules";
import type { PathNode, PlayMeta, PlayerNode, Point, Scene } from "./types";

/**
 * The Rules check: reads the drawing itself (where players stand, which lines
 * cross the line of scrimmage, which end in a block) against the coach's rule
 * set. Pure, so the Designer's drawer and anything else can share it.
 *
 * Offense lines up below the line of scrimmage (larger y), defense above it.
 */

export type CheckStatus = "fail" | "warn" | "ok" | "skip";

export type RuleCheckItem = {
  id: "players" | "blocking" | "rush" | "qb-run" | "runs" | "no-run" | "motion" | "line";
  status: CheckStatus;
  title: string;
  detail: string;
  /** Nodes on this play the item is about, so the drawer can select them. */
  nodes: string[];
};

export type RuleCheck = { set: RuleSet; items: RuleCheckItem[]; fails: number; warns: number };

type Options = {
  /** The Vs defense under the play, if any: its defenders count for the rush and player checks. */
  underlay?: Scene | null;
  /** Yards from the line of scrimmage to the goal line, for fields that don't show one. */
  toGoal?: number | null;
};

const letter = (p: PlayerNode) => p.label.trim().toUpperCase() || p.name;
const list = (words: string[]) => (words.length < 2 ? words.join("") : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const visiblePlayers = (scene: Scene) => scene.nodes.filter((n): n is PlayerNode => n.kind === "player" && !n.hidden && !n.ghostOf);

/** A line's points on the field, start first. */
const worldPoints = (line: PathNode): Point[] => line.points.map((p) => toWorld(line, p));

/** Solid lines are the ones a player runs after the snap; dashed and dotted ones are passes, coverage or reads. */
const isRun = (line: PathNode) => line.style === "solid" && line.endCap !== "tee" && line.startCap !== "tee";
const isBlock = (line: PathNode) => line.endCap === "tee" || line.startCap === "tee";

/** Shortest distance between two segments (they meet when it is 0). */
function segGap([a, b]: [Point, Point], [c, d]: [Point, Point]): number {
  const cross = (o: Point, p: Point, q: Point) => (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
  const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d);
  if (d1 * d2 < 0 && d3 * d4 < 0) return 0;
  const toSeg = (p: Point, s: Point, e: Point) => {
    const vx = e.x - s.x, vy = e.y - s.y;
    const len = vx * vx + vy * vy;
    const t = len ? Math.max(0, Math.min(1, ((p.x - s.x) * vx + (p.y - s.y) * vy) / len)) : 0;
    return Math.hypot(p.x - (s.x + t * vx), p.y - (s.y + t * vy));
  };
  return Math.min(toSeg(a, c, d), toSeg(b, c, d), toSeg(c, a, b), toSeg(d, a, b));
}

export function checkRules(scene: Scene, meta: Pick<PlayMeta, "playType">, rules: RuleLines, opts: Options = {}): RuleCheck {
  const set = ruleSet(rules.set);
  const perYard = unitsPerYard(scene.view);
  const los = scene.losY;
  // Half a yard of slack either way, so a token drawn on the line isn't read as across it.
  const slack = perYard ? perYard * 0.5 : 6;
  const yards = (units: number) => (perYard ? units / perYard : 0);
  const items: RuleCheckItem[] = [];

  const players = visiblePlayers(scene);
  const offense = players.filter((p) => p.side === "offense");
  const defense = players.filter((p) => p.side === "defense");
  // The Vs defense is drawn lined up on this play's line of scrimmage.
  const under = opts.underlay ?? null;
  const shift = under ? los - under.losY : 0;
  const underScene: Scene | null = under
    ? { ...under, losY: los, nodes: under.nodes.map((n) => ({ ...n, y: n.y + shift })) }
    : null;
  const underDefense = underScene ? visiblePlayers(underScene).filter((p) => p.side === "defense") : [];

  /* Players on the field */
  if (set.players) {
    const over = offense.length > set.players;
    const allDefense = defense.length ? defense : underDefense;
    const defOver = allDefense.length > set.players;
    const fromUnder = !defense.length && underDefense.length > 0;
    items.push({
      id: "players",
      status: over ? "fail" : defOver ? (fromUnder ? "warn" : "fail") : "ok",
      title: "Players on the field",
      detail: over
        ? `${plural(offense.length, "offensive player")} drawn; ${set.name} plays ${set.players} a side.`
        : defOver
          ? `${fromUnder ? "The Vs defense has" : "The defense has"} ${allDefense.length}; ${set.name} plays ${set.players} a side.`
          : `${offense.length} on offense${allDefense.length ? `, ${allDefense.length} on defense` : ""}. ${set.name} plays ${set.players} a side.`,
      nodes: over ? offense.map((p) => p.id) : defOver && !fromUnder ? defense.map((p) => p.id) : [],
    });
  }

  /* Blocking */
  const blockers = offense.filter((p) => linesOf(scene, p).some(isBlock));
  items.push(
    set.blocking
      ? { id: "blocking", status: "ok", title: "Blocking", detail: blockers.length ? `${list(blockers.map(letter))} ${blockers.length === 1 ? "blocks" : "block"}, which ${set.name} allows.` : "No blocks drawn.", nodes: [] }
      : {
          id: "blocking",
          status: blockers.length ? "fail" : "ok",
          title: "No blocking",
          detail: blockers.length
            ? `${list(blockers.map(letter))} ${blockers.length === 1 ? "has" : "have"} a block (a T-capped line). ${set.name} allows screening, not blocking: give ${blockers.length === 1 ? "him" : "them"} a route or a screen.`
            : "No blocks drawn.",
          nodes: blockers.flatMap((p) => [p.id, ...linesOf(scene, p).filter(isBlock).map((l) => l.id)]),
        },
  );

  /* Ball carriers: who takes the ball across the line */
  const qb = offense.find((p) => letter(p) === "Q");
  const crosses = (line: PathNode) => worldPoints(line).some((pt) => pt.y < los - slack);
  const qbLines = qb ? linesOf(scene, qb) : [];
  const reach = Math.max(26, (perYard || 14) * 2);
  // Where a player goes behind the line: his spot, then each leg of his lines that starts back there.
  const legsBehind = (p: PlayerNode, lines: PathNode[]): [Point, Point][] => [
    [{ x: p.x, y: p.y }, { x: p.x, y: p.y }],
    ...lines.flatMap((l) => {
      const pts = worldPoints(l);
      return pts.slice(1).map((b, i): [Point, Point] => [pts[i], b]).filter(([a]) => a.y > los - slack);
    }),
  ];
  const meets = (a: [Point, Point][], b: [Point, Point][]) => a.some((s) => b.some((t) => segGap(s, t) <= reach));
  // Who has the ball behind the line: the quarterback, then anyone whose path meets a ball holder's
  // (a handoff, a toss caught where a QB line ends, a reverse). Only on plays not marked as a pass,
  // so a back's swing route past the quarterback isn't read as a run.
  const holders = new Map<PlayerNode, [Point, Point][]>();
  if (qb) holders.set(qb, legsBehind(qb, qbLines.filter((l) => !isBlock(l) && l.style !== "motion")));
  if (meta.playType !== "pass") {
    for (let round = 0, grew = true; grew && round < 4; round++) {
      grew = false;
      for (const p of offense) {
        if (holders.has(p)) continue;
        const legs = legsBehind(p, linesOf(scene, p).filter((l) => !isBlock(l) && l.style !== "motion"));
        if ([...holders.values()].some((h) => meets(legs, h))) (holders.set(p, legs), (grew = true));
      }
    }
  }
  const carriers = offense.filter((p) => p !== qb && holders.has(p) && linesOf(scene, p).filter(isRun).some(crosses));
  const qbRuns = qb ? qbLines.filter((l) => isRun(l) && crosses(l)) : [];
  const qbCarries = qbRuns.length > 0 && carriers.length === 0;
  const runners = [...carriers, ...(qbCarries && qb ? [qb] : [])];
  const isRunPlay = runners.length > 0 || meta.playType === "run";
  const runNodes = [...runners.map((p) => p.id), ...carriers.flatMap((p) => linesOf(scene, p).filter(isRun).map((l) => l.id)), ...(qbCarries ? qbRuns.map((l) => l.id) : [])];
  const runWho = runners.length ? `${list(runners.map(letter))} ${runners.length === 1 ? "carries" : "carry"} the ball across the line` : "The play is marked as a run";

  /* Quarterback run */
  if (!set.qbRun && qb) {
    items.push({
      id: "qb-run",
      status: qbCarries ? "fail" : "ok",
      title: "Quarterback run",
      detail: qbCarries
        ? `Q runs past the line with no handoff or pitch drawn. In ${set.name} the quarterback can't run it himself: hand it off or throw it.`
        : qbRuns.length
          ? "Q crosses the line after handing off, which is fine."
          : "Q stays behind the line.",
      nodes: qbCarries ? [qb.id, ...qbRuns.map((l) => l.id)] : [],
    });
  }

  /* Run plays at all */
  if (!set.runs) {
    items.push({
      id: "runs",
      status: isRunPlay ? "fail" : "ok",
      title: "Pass plays only",
      detail: isRunPlay ? `${runWho}; ${set.name} has no run plays.` : "No run drawn.",
      nodes: isRunPlay ? runNodes : [],
    });
  }

  /* No-run zones */
  if (set.runs && rules.noRun > 0) {
    const marks = fieldMarks(scene.view);
    const toGoal = marks.goal !== null && perYard ? (los - marks.goal) / perYard : opts.toGoal ?? null;
    const toMid = set.midfieldNoRun && marks.midfield !== null && perYard && los > marks.midfield ? (los - marks.midfield) / perYard : null;
    if (toGoal === null) {
      items.push({
        id: "no-run",
        status: "skip",
        title: "No-run zone",
        detail: "This field has no goal line, so put the play on the Red zone or Flag 30×70 field, or enter how far the ball is from the goal line.",
        nodes: [],
      });
    } else {
      const inGoal = toGoal >= 0 && toGoal <= rules.noRun + 0.01;
      const inMid = toMid !== null && toMid <= rules.noRun + 0.01;
      const where = inGoal ? `${Math.round(toGoal)} yards from the goal line` : `${Math.round(toMid ?? 0)} yards from midfield`;
      items.push({
        id: "no-run",
        status: (inGoal || inMid) && isRunPlay ? "fail" : "ok",
        title: "No-run zone",
        detail:
          inGoal || inMid
            ? isRunPlay
              ? `The ball is ${where}, inside the ${rules.noRun}-yard no-run zone. ${runWho}: make it a pass.`
              : `The ball is ${where}, inside the no-run zone. No run is drawn, so it's legal.`
            : `The ball is ${Math.round(toGoal)} yards from the goal line${toMid !== null ? ` and ${Math.round(toMid)} from midfield` : ""}, outside the ${rules.noRun}-yard no-run zone${set.midfieldNoRun && marks.midfield !== null ? "s" : ""}.`,
        nodes: (inGoal || inMid) && isRunPlay ? runNodes : [],
      });
    }
  }

  /* Rushers */
  const rushersOf = (sc: Scene, men: PlayerNode[]) =>
    men
      .map((p) => ({ p, lines: linesOf(sc, p).filter((l) => l.style === "solid" && !l.closed && worldPoints(l).some((pt) => pt.y >= los - (perYard || 14))) }))
      .filter((r) => r.lines.length > 0);
  const rushers = [
    ...rushersOf(scene, defense).map((r) => ({ ...r, mine: true })),
    ...(underScene ? rushersOf(underScene, underDefense).map((r) => ({ ...r, mine: false })) : []),
  ];
  if (!set.rushing) {
    items.push({
      id: "rush",
      status: rushers.length ? (rushers.some((r) => r.mine) ? "fail" : "warn") : "ok",
      title: "No rush",
      detail: rushers.length ? `${list(rushers.map((r) => letter(r.p)))} ${rushers.length === 1 ? "rushes" : "rush"}${rushers.every((r) => !r.mine) ? " in the Vs defense" : ""}; ${set.name} has no pass rush.` : "No rushers drawn.",
      nodes: rushers.filter((r) => r.mine).flatMap((r) => [r.p.id, ...r.lines.map((l) => l.id)]),
    });
  } else if (rules.rush > 0) {
    if (!perYard) {
      items.push({ id: "rush", status: "skip", title: "Rush distance", detail: "The whiteboard has no yard lines, so rush distance can't be measured. Pick a field to check it.", nodes: [] });
    } else {
      const close = rushers.filter((r) => yards(los - r.p.y) < rules.rush - 0.5);
      items.push({
        id: "rush",
        status: close.length ? (close.every((r) => !r.mine) ? "warn" : "fail") : "ok",
        title: "Rush distance",
        detail: close.length
          ? `${close.map((r) => `${letter(r.p)} starts ${Math.max(0, Math.round(yards(los - r.p.y)))} yds off the ball`).join(", ")}${close.every((r) => !r.mine) ? " in the Vs defense" : ""}. Rushers must start ${rules.rush} yards back.`
          : rushers.length
            ? `${plural(rushers.length, "rusher")}, all ${rules.rush}+ yards off the ball.`
            : "No rushers drawn.",
        nodes: close.filter((r) => r.mine).flatMap((r) => [r.p.id, ...r.lines.map((l) => l.id)]),
      });
    }
  }

  /* Motion */
  const motion = offense
    .map((p) => ({ p, lines: linesOf(scene, p).filter((l) => l.style === "motion") }))
    .filter((m) => m.lines.length > 0);
  const forward = motion.filter((m) => m.lines.some((l) => {
    const pts = worldPoints(l);
    return pts.length > 1 && pts[0].y - pts[pts.length - 1].y > slack;
  }));
  items.push({
    id: "motion",
    status: motion.length > 1 || forward.length ? "fail" : "ok",
    title: "Motion",
    detail:
      motion.length > 1
        ? `${list(motion.map((m) => letter(m.p)))} are all in motion. Only one player may move at the snap.`
        : forward.length
          ? `${letter(forward[0].p)}'s motion heads toward the line. Motion has to run sideways or away from the line.`
          : motion.length
            ? `${letter(motion[0].p)} in motion, sideways or back. Legal.`
            : "No motion drawn.",
    nodes: (motion.length > 1 ? motion : forward).flatMap((m) => [m.p.id, ...m.lines.map((l) => l.id)]),
  });

  /* Seven on the line (tackle) */
  if (set.sevenOnLine && offense.length >= 7) {
    const onLine = offense.filter((p) => Math.abs(p.y - los) <= (perYard || 14) * 1.5 + p.size / 2);
    items.push({
      id: "line",
      status: onLine.length >= 7 ? "ok" : "warn",
      title: "Seven on the line",
      detail: onLine.length >= 7 ? `${onLine.length} players on the line of scrimmage.` : `Only ${onLine.length} players are up on the line; tackle rules need seven.`,
      nodes: [],
    });
  }

  const rank: Record<CheckStatus, number> = { fail: 0, warn: 1, skip: 2, ok: 3 };
  items.sort((a, b) => rank[a.status] - rank[b.status]);
  return { set, items, fails: items.filter((i) => i.status === "fail").length, warns: items.filter((i) => i.status === "warn").length };
}
