import { COVERAGES, FLAG_LOOKS, layoutDefense, layoutFlagDefense, OFF_LINE, tagCoverage } from "./defense";
import type { Coverage, DefenseLayout, FlagLook, Front } from "./defense";
import { routeWord } from "./explain";
import { fieldInset, unitsPerYard } from "./fieldUnits";
import { isLineman } from "./formations";
import { lookValue } from "./overlay";
import { buildTimeline } from "./runPlay";
import type { Track } from "./runPlay";
import type { FieldView, PathNode, PlayerNode, Point, Scene } from "./types";
import { CANVAS_W } from "./types";

/**
 * Coverage check: runs a coach's own play against a live defense and says who
 * gets open. Every receiver runs his drawn route; zone defenders drop to their
 * spot and squeeze the nearest receiver who enters it, man defenders trail
 * their man a step late, and rushers chase the quarterback. When the ball is
 * due out, each receiver's space to the nearest cover defender (in yards)
 * makes him open, tight or covered. Pure, so the Designer's check, the Vault's
 * Coverage report and anything else read the same numbers.
 *
 * It is a teaching model, not a physics engine: one speed per job, no
 * leverage or break technique. Good enough to show why Smash beats Cover 3
 * and a hitch dies against press man.
 */

export type Format = "5v5" | "7v7" | "11";

/** Steps per second of simulated time. */
const FPS = 30;
/** Yards per second, by job (youth speeds; the ratios are what matter). */
const SPEED = { route: 6, man: 5.85, zone: 5, rush: 4.4, lineRush: 0.8, qb: 3 };
/** Seconds before a defender reacts to the snap. */
const REACT = { zone: 0.15, man: 0.1, read: 0.45, deepRead: 0.6 };
/** How far behind his man a man defender trails, in seconds of the receiver's run. */
const TRAIL = 0.25;
/** A man defender who runs into another receiver (a rub, the heart of Mesh) loses speed: within this many yards, at this share of his speed. */
const RUB = { yards: 1.8, slow: 0.3, seconds: 0.45 };
/** Space, in yards, that makes a receiver open or tight. */
export const OPEN_YARDS = 2.5;
export const TIGHT_YARDS = 1.2;
/** How far an underneath zone defender will carry a receiver past his spot, in yards. */
const UNDER_DEPTH = 1.5;
/** An underneath defender lets a receiver go once he is this many yards past his spot. */
const PASS_OFF = 2;
/** Receivers short of this many yards downfield are checkdowns. */
export const CHECKDOWN_YARDS = 1;
/** A rusher this close to the quarterback (yards) has got home. */
const SACK_YARDS = 1.3;

export type Status = "open" | "tight" | "covered";
export const STATUS_COLOR: Record<Status, string> = { open: "#2E9E6B", tight: "#F2A63B", covered: "#D24B3E" };

export type Look = {
  id: string;
  /** Coach-facing name: "Cover 3", "4-3 Cover 1", "1 rush · Man". */
  name: string;
  /** The Vs defense overlay value that shows the same look on the field, when there is one. */
  overlay: string | null;
  layout: (receivers: { dx: number; dy: number }[], rushUnits: number) => DefenseLayout;
};

/** The base 11-man front the check lines up in. */
const FRONT: Front = "4-3";
const ELEVEN_NAMES: Record<Coverage, string> = { "Cover 3": "Cover 3", "Cover 1": "Cover 1", "Cover 2": "Cover 2", "Cover 4": "Cover 4 (quarters)", Man: "Cover 0 (man blitz)" };

const ELEVEN: Look[] = COVERAGES.map((c) => ({
  id: `11:${c}`,
  name: ELEVEN_NAMES[c],
  overlay: lookValue({ kind: "front", front: FRONT, coverage: c }),
  layout: (receivers) => layoutDefense(FRONT, c, receivers),
}));

const FIVE: Look[] = FLAG_LOOKS.map((l: FlagLook) => ({
  id: `5:${l}`,
  name: l,
  overlay: lookValue({ kind: "flag", look: l }),
  layout: (receivers, rushUnits) => layoutFlagDefense(l, rushUnits, receivers),
}));

type Spot = { dx: number; dy: number; label: string };
type Zone7 = { dx: number; dy: number; rx: number; ry: number };
const zone7 = (dx: number, dy: number, rx: number, ry: number): Zone7 => ({ dx, dy, rx, ry });

/** 7-on-7 passing: seven in coverage and no rush. */
export function layoutSeven(kind: "Cover 1" | "Cover 2" | "Cover 3" | "Man", receivers: { dx: number; dy: number }[]): DefenseLayout {
  const out: DefenseLayout = { defenders: [], zones: [], lines: [] };
  const zoneMan = (spot: Spot, zone: Zone7) => {
    out.defenders.push({ ...spot, job: "zone" });
    out.zones.push(zone);
    out.lines.push({ from: out.defenders.length - 1, to: { dx: zone.dx, dy: zone.dy }, kind: "drop" });
  };
  const manUp = (spots: Spot[]) => {
    const start = out.defenders.length;
    spots.forEach((s) => out.defenders.push({ ...s, job: "man" }));
    const left = new Set(spots.map((_, i) => start + i));
    for (const r of [...receivers].sort((a, b) => Math.abs(b.dx) - Math.abs(a.dx))) {
      let best = -1;
      let bestD = Infinity;
      for (const i of left) {
        const d = Math.abs(out.defenders[i].dx - r.dx);
        if (d < bestD) (bestD = d), (best = i);
      }
      if (best < 0) break;
      left.delete(best);
      out.lines.push({ from: best, to: r, kind: "man" });
    }
    // Spare men sit underneath in the middle as a robber.
    for (const i of left) {
      out.defenders[i].job = "zone";
      const z = zone7(0, -130, 120, 40);
      out.zones.push(z);
      out.lines.push({ from: i, to: { dx: z.dx, dy: z.dy }, kind: "drop" });
    }
  };
  const press: Spot[] = [
    { dx: -400, dy: -40, label: "C" },
    { dx: 400, dy: -40, label: "C" },
    { dx: -200, dy: -60, label: "N" },
    { dx: 200, dy: -60, label: "N" },
    { dx: -60, dy: -90, label: "M" },
    { dx: 60, dy: -90, label: "W" },
  ];
  if (kind === "Man") {
    manUp([...press, { dx: 0, dy: -150, label: "S" }]);
  } else if (kind === "Cover 1") {
    zoneMan({ dx: 0, dy: -210, label: "FS" }, zone7(0, -280, 220, 56));
    manUp(press);
  } else if (kind === "Cover 2") {
    zoneMan({ dx: -230, dy: -200, label: "S" }, zone7(-230, -270, 225, 56));
    zoneMan({ dx: 230, dy: -200, label: "S" }, zone7(230, -270, 225, 56));
    [zone7(-400, -110, 105, 39), zone7(-200, -125, 95, 39), zone7(0, -130, 90, 39), zone7(200, -125, 95, 39), zone7(400, -110, 105, 39)].forEach((z, i) =>
      zoneMan({ dx: z.dx, dy: i === 0 || i === 4 ? -40 : -80, label: i === 0 || i === 4 ? "C" : i === 2 ? "M" : "N" }, z),
    );
  } else {
    [zone7(-340, -265, 150, 52), zone7(0, -280, 150, 52), zone7(340, -265, 150, 52)].forEach((z, i) =>
      zoneMan({ dx: z.dx === 0 ? 0 : Math.sign(z.dx) * 400, dy: i === 1 ? -200 : -70, label: i === 1 ? "FS" : "C" }, z),
    );
    [zone7(-300, -120, 110, 39), zone7(-100, -128, 100, 39), zone7(100, -128, 100, 39), zone7(300, -120, 110, 39)].forEach((z, i) =>
      zoneMan({ dx: z.dx, dy: -80, label: i === 0 || i === 3 ? "N" : i === 1 ? "M" : "W" }, z),
    );
  }
  return tagCoverage(out);
}

const SEVEN: Look[] = (["Cover 1", "Cover 2", "Cover 3", "Man"] as const).map((k) => ({
  id: `7:${k}`,
  name: k === "Man" ? "Cover 0 (all man)" : k,
  overlay: null,
  layout: (receivers) => layoutSeven(k, receivers),
}));

export const LOOKS: Record<Format, Look[]> = { "5v5": FIVE, "7v7": SEVEN, "11": ELEVEN };
export const FORMAT_NAME: Record<Format, string> = { "5v5": "5-on-5 flag", "7v7": "7-on-7", "11": "11-man" };
/** When the ball is due out, by format (seconds after the snap). */
export const THROW_AT: Record<Format, number> = { "5v5": 2, "7v7": 2.4, "11": 2.4 };

const offenseOf = (scene: Scene) =>
  scene.nodes.filter((n): n is PlayerNode => n.kind === "player" && !n.hidden && !n.ghostOf && n.side === "offense");

export const isQb = (p: PlayerNode) => p.label.toUpperCase() === "Q" || /quarterback/i.test(p.name);

/** The format a play is drawn for: a line means 11-man, otherwise by head count. */
export function formatOf(scene: Scene): Format {
  const offense = offenseOf(scene);
  if (offense.length >= 9 || offense.some(isLineman)) return "11";
  return offense.length >= 6 ? "7v7" : "5v5";
}

/** Canvas units per yard, across and up the field, for a view (the whiteboard reads as the half field). */
export function yardScale(view: FieldView): { x: number; y: number } {
  const v = view === "blank" ? "half" : view;
  const wide = v === "flag" ? 30 : 160 / 3;
  return { x: (CANVAS_W - fieldInset(v) * 2) / wide, y: unitsPerYard(v) };
}

export type SimDefender = { label: string; job: "rush" | "zone" | "man"; start: Point; landmark?: Point; reach?: { rx: number; ry: number }; deep?: boolean; manOf?: string; lineman?: boolean };

export type Row = { id: string; label: string; read: number; route: string; sep: number; status: Status; /** Yards past the line of scrimmage at the throw. */ depth: number; /** Where the drawn route ends, for the read-order badge. */ end: Point };
export type Result = {
  look: Look;
  defenders: SimDefender[];
  /** Frame k is time k / FPS; positions in canvas units. */
  offense: Map<string, Point[]>;
  defense: Point[][];
  rows: Row[];
  /** The throw: the first open receiver in read order, else the one with the most space. */
  target: Row | null;
  throwAt: number;
  /** When a rusher got home, if before the throw. */
  sackAt: number | null;
  /** 0–8ish: how good the best early read is (space, discounted by read number). */
  score: number;
  duration: number;
};

/** The coach's own tag on the route, else what the drawing looks like ("corner", "slant"). */
function routeName(scene: Scene, who: PlayerNode, path: PathNode | undefined): string {
  const t = path?.tag?.trim();
  if (t && !/^\d+\s*(yds?|yards?)?$/i.test(t)) return t;
  if (!path) return "route";
  return routeWord(scene.view === "blank" ? { ...scene, view: "half" } : scene, who, path, who.y >= scene.losY ? 1 : -1)?.word ?? "route";
}

/** Where a track's runner is after `yards` of running, in canvas units, walking the drawn line. */
function along(track: Track, scale: { x: number; y: number }, yards: number): Point {
  let left = Math.max(0, yards);
  for (let i = 0; i < track.lengths.length; i++) {
    const a = track.pts[i];
    const b = track.pts[i + 1];
    const seg = Math.hypot((b.x - a.x) / scale.x, (b.y - a.y) / scale.y);
    if (left <= seg || i === track.lengths.length - 1) {
      const k = seg ? Math.min(1, left / seg) : 1;
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
    }
    left -= seg;
  }
  return track.pts[track.pts.length - 1];
}

/** Yards between two canvas points. */
const yardsApart = (a: Point, b: Point, s: { x: number; y: number }) => Math.hypot((a.x - b.x) / s.x, (a.y - b.y) / s.y);

/** Moves `from` toward `to` by at most `yards`, stopping `stop` yards short. */
function step(from: Point, to: Point, yards: number, stop: number, s: { x: number; y: number }): Point {
  const dx = (to.x - from.x) / s.x;
  const dy = (to.y - from.y) / s.y;
  const d = Math.hypot(dx, dy);
  if (d <= stop || d < 1e-6) return from;
  const k = Math.min(yards, d - stop) / d;
  return { x: from.x + dx * k * s.x, y: from.y + dy * k * s.y };
}

export type SimOptions = { throwAt?: number; rushYards?: number; extra?: number };

/** Runs one play against one look. */
export function simulate(scene: Scene, look: Look, opts: SimOptions = {}): Result {
  const format = formatOf(scene);
  const scale = yardScale(scene.view);
  const throwAt = opts.throwAt ?? THROW_AT[format];
  const duration = throwAt + (opts.extra ?? 1);
  const frames = Math.round(duration * FPS);
  const tl = buildTimeline(scene);
  const offense = offenseOf(scene);
  const hasLine = offense.some(isLineman);
  const paths = new Map(scene.nodes.filter((n): n is PathNode => n.kind === "path").map((p) => [p.id, p]));
  const trackOf = new Map(tl.tracks.map((t) => [t.playerId, t]));
  const qb = offense.find(isQb) ?? null;
  const center = offense.find((p) => p.label === "C");
  const ball = { x: center?.x ?? qb?.x ?? CANVAS_W / 2, y: scene.losY };

  // Who can catch it: anyone with a route who isn't the quarterback, a lineman, the 11-man center, or a blocker.
  const eligible = offense.filter((p) => {
    if (p === qb || isLineman(p) || (hasLine && p.label === "C")) return false;
    const t = trackOf.get(p.id);
    if (!t) return false;
    return paths.get(t.pathId)?.endCap !== "tee";
  });
  const receivers = offense.filter((p) => p !== qb && !isLineman(p) && !(hasLine && p.label === "C"));

  // Offense, frame by frame. Backs leave a beat late; the quarterback drops if no drop is drawn.
  const off = new Map<string, Point[]>();
  for (const p of offense) {
    const t = trackOf.get(p.id);
    const delay = /^(H|RB|F|B)$/i.test(p.label) && p.y > scene.losY + 2 * scale.y ? 0.15 : 0;
    const drop = format === "11" ? 3 : 1.5;
    const pts: Point[] = [];
    for (let k = 0; k <= frames; k++) {
      const time = k / FPS;
      if (t) pts.push(along(t, scale, (time - delay) * (p === qb ? SPEED.qb : SPEED.route)));
      else if (p === qb) pts.push({ x: p.x, y: p.y + Math.min(1, time / 0.5) * drop * scale.y });
      else if (isLineman(p) || (hasLine && p.label === "C")) pts.push({ x: p.x, y: p.y - Math.min(1, time / 0.3) * 0.5 * scale.y });
      else pts.push({ x: p.x, y: p.y });
    }
    off.set(p.id, pts);
  }

  // Line the defense up on the ball, then give each defender his job.
  const offsets = receivers.map((p) => ({ dx: p.x - ball.x, dy: p.y - ball.y, id: p.id }));
  const rushUnits = (opts.rushYards ?? 7) * scale.y;
  const layout = look.layout(offsets, rushUnits);
  // Stock looks are drawn in half-field units; keep their depth in yards and their width as a share of the field.
  const kx = (CANVAS_W / 2 - fieldInset(scene.view === "blank" ? "half" : scene.view)) / (CANVAS_W / 2 - fieldInset("half"));
  const ky = scale.y / unitsPerYard("half");
  const place = (dx: number, dy: number): Point => ({ x: ball.x + dx * kx, y: ball.y + dy * ky });
  const defenders: SimDefender[] = layout.defenders.map((d) => ({
    label: d.label,
    job: d.job,
    start: d.job === "rush" && format === "5v5" ? { x: ball.x + d.dx * kx, y: ball.y + d.dy } : place(d.dx, d.dy),
    lineman: d.job === "rush" && d.dy >= OFF_LINE && hasLine,
  }));
  for (const line of layout.lines) {
    const d = defenders[line.from];
    if (!d) continue;
    if (line.kind === "drop") {
      d.job = "zone";
      d.landmark = place(line.to.dx, line.to.dy);
      const z = layout.zones.find((zz) => zz.dx === line.to.dx && zz.dy === line.to.dy);
      d.reach = { rx: (z?.rx ?? 110) * 1.15 * kx, ry: Math.max((z?.ry ?? 40) * 2.4 * ky, 6 * scale.y) };
      d.deep = line.to.dy < -200;
    } else if (line.kind === "man") {
      d.job = "man";
      const r = offsets.find((o) => o.dx === line.to.dx && o.dy === line.to.dy);
      d.manOf = r?.id;
      // Man defenders line up on their man, a cushion off and a step inside, whatever spot the stock look drew.
      const man = r && receivers.find((p) => p.id === r.id);
      if (man) d.start = { x: man.x + Math.sign(ball.x - man.x) * 0.8 * scale.x, y: Math.min(man.y, scene.losY) - (format === "5v5" ? 5 : 4) * scale.y };
    }
  }
  // A zone defender with no drop line (the 11-man underneath set covers them all) holds his spot.
  for (const d of defenders) if (d.job === "zone" && !d.landmark) (d.landmark = d.start), (d.reach = { rx: 110 * kx, ry: 6 * scale.y });

  const def: Point[][] = [defenders.map((d) => d.start)];
  const qbPts = qb ? off.get(qb.id)! : null;
  const dt = 1 / FPS;
  let sackAt: number | null = null;
  const picked = defenders.map(() => 0);
  for (let k = 1; k <= frames; k++) {
    const time = k * dt;
    const prev = def[k - 1];
    const now = prev.map((at, i) => {
      const d = defenders[i];
      if (d.job === "rush") {
        if (!qbPts) return at;
        const next = step(at, qbPts[k], (d.lineman ? SPEED.lineRush : SPEED.rush) * dt, 0.9, scale);
        if (sackAt === null && !d.lineman && yardsApart(next, qbPts[k], scale) <= SACK_YARDS) sackAt = time;
        return next;
      }
      if (d.job === "man") {
        const pts = d.manOf ? off.get(d.manOf) : null;
        if (!pts || time < REACT.man) return at;
        const seen = pts[Math.max(0, k - Math.round(TRAIL * FPS))];
        // Running into another receiver costs him a beat to fight through the traffic.
        const traffic =
          receivers.some((r) => r.id !== d.manOf && yardsApart(at, off.get(r.id)![k], scale) < RUB.yards) ||
          prev.some((o, j) => j !== i && defenders[j].job === "man" && yardsApart(at, o, scale) < RUB.yards);
        if (traffic) picked[i] = time + RUB.seconds;
        return step(at, { x: seen.x, y: seen.y - 0.5 * scale.y }, SPEED.man * (time < picked[i] ? RUB.slow : 1) * dt, 0, scale);
      }
      if (time < REACT.zone || !d.landmark) return at;
      // Squeeze the receiver nearest the zone's middle, staying on top of him if deep.
      let goal = d.landmark;
      let best = Infinity;
      if (time >= (d.deep ? REACT.deepRead : REACT.read)) for (const r of eligible) {
        const p = off.get(r.id)![k];
        // Underneath defenders pass a receiver off to the deep zone once he is past them.
        if (!d.deep && p.y < d.landmark.y - PASS_OFF * scale.y) continue;
        const ex = (p.x - d.landmark.x) / d.reach!.rx;
        const ey = (p.y - d.landmark.y) / d.reach!.ry;
        const inside = ex * ex + ey * ey;
        if (inside < 1 && inside < best) {
          best = inside;
          goal = d.deep
            ? { x: d.landmark.x + (p.x - d.landmark.x) * 0.8, y: Math.min(p.y - 1.5 * scale.y, d.landmark.y + (p.y - d.landmark.y) * 0.8) }
            : { x: d.landmark.x + (p.x - d.landmark.x) * 0.75, y: Math.max(d.landmark.y - UNDER_DEPTH * scale.y, d.landmark.y + (p.y - d.landmark.y) * 0.5) };
        }
      }
      return step(at, goal, SPEED.zone * dt, 0, scale);
    });
    def.push(now);
  }

  // Read order: the first read, then deep to short.
  const fk = Math.min(frames, Math.round(throwAt * FPS));
  const depth = (p: PlayerNode) => Math.min(...off.get(p.id)!.map((q) => q.y));
  const first = eligible.find((p) => paths.get(trackOf.get(p.id)!.pathId)?.firstRead);
  const ordered = [...(first ? [first] : []), ...eligible.filter((p) => p !== first).sort((a, b) => depth(a) - depth(b))];
  const cover = defenders.map((_, i) => i).filter((i) => defenders[i].job !== "rush");
  const rows: Row[] = ordered.map((p, i) => {
    const at = off.get(p.id)![fk];
    const sep = cover.length ? Math.min(...cover.map((j) => yardsApart(at, def[fk][j], scale))) : 9;
    const status: Status = sep >= OPEN_YARDS ? "open" : sep >= TIGHT_YARDS ? "tight" : "covered";
    return { id: p.id, label: p.label || p.name || "?", read: i + 1, route: routeName(scene, p, paths.get(trackOf.get(p.id)!.pathId)), sep, status, depth: (scene.losY - at.y) / scale.y, end: trackOf.get(p.id)!.pts[trackOf.get(p.id)!.pts.length - 1] };
  });
  // The throw: the first open receiver past the line in read order, then any open checkdown, then the most space.
  const target =
    rows.find((r) => r.status === "open" && r.depth >= CHECKDOWN_YARDS) ?? rows.find((r) => r.status === "open") ?? [...rows].sort((a, b) => b.sep - a.sep)[0] ?? null;
  const pressured = sackAt !== null && sackAt <= throwAt;
  // Space matters more downfield: an open swing behind the line is a checkdown, not a win.
  const gain = (r: Row) => (r.depth >= 5 ? 1 : r.depth >= 2 ? 0.8 : 0.5);
  const score = rows.slice(0, 4).reduce((m, r, i) => Math.max(m, Math.min(r.sep, 8) * (1 - 0.12 * i) * gain(r)), 0) * (pressured ? 0.5 : 1);
  return { look, defenders, offense: off, defense: def, rows, target, throwAt, sackAt: pressured ? sackAt : null, score, duration };
}

/** A look is beaten when someone is open past the line of scrimmage before the rush gets home. */
export const wins = (r: Result) => r.sackAt === null && r.rows.some((row) => row.status === "open" && row.depth >= CHECKDOWN_YARDS);

/** One color for a look: open when beaten, tight when only a checkdown or a tight window is there, covered otherwise. */
export function grade(r: Result): Status {
  if (wins(r)) return "open";
  if (r.sackAt !== null || !r.rows.length) return "covered";
  return r.rows.some((row) => row.status !== "covered") ? "tight" : "covered";
}

/** The play against every look for its format, plus the headline. */
export type Report = { format: Format; results: Result[]; beats: number; best: Result | null; worst: Result | null };

export function checkAll(scene: Scene, opts: SimOptions = {}): Report {
  const format = formatOf(scene);
  const results = LOOKS[format].map((l) => simulate(scene, l, { ...opts, extra: 0 }));
  const beats = results.filter(wins).length;
  const sorted = [...results].sort((a, b) => b.score - a.score);
  return { format, results, beats, best: sorted[0] ?? null, worst: sorted[sorted.length - 1] ?? null };
}

/** True when a play has at least one receiver with a route to check. */
export const hasRoutes = (scene: Scene) => simulate(scene, LOOKS[formatOf(scene)][0], { extra: 0 }).rows.length > 0;

/** "4.2" or "10+" yards. */
export const yards = (n: number) => (n >= 10 ? "10+" : n.toFixed(1));

/** One coach-facing sentence for a result. */
export function verdict(r: Result): string {
  const t = r.target;
  if (!t) return "Nobody has a route yet. Draw a route for a receiver, then check it.";
  const at = r.throwAt.toFixed(1);
  const sack = r.sackAt !== null ? ` The rush gets home at ${r.sackAt.toFixed(1)} s, so the ball has to come out sooner or someone stays in to block.` : "";
  if (t.status === "open" && t.depth < CHECKDOWN_YARDS)
    return `Only the checkdown is open: ${t.label} on the ${t.route} behind the line, ${yards(t.sep)} yds of space at ${at} s against ${r.look.name}. Nobody is clean downfield.${sack}`;
  if (t.status === "open") return `Throw to ${t.label} on the ${t.route}: read ${t.read}, ${yards(t.sep)} yds of space at ${at} s against ${r.look.name}.${sack}`;
  return `Nobody is clean at ${at} s against ${r.look.name}. Best look is ${t.label} (${yards(t.sep)} yds, ${t.status}).${sack}`;
}
