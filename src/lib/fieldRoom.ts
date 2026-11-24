import { toWorld, worldBox } from "./geometry";
import type { Lesson } from "./teach";
import type { Point, Scene, SceneNode } from "./types";
import { CANVAS_W } from "./types";

/** A drawn defender's radius in the Film Room (`LessonField`), before it grows. */
export const DEFENDER_R = 15;
/** Clear space kept between two tokens at the snap, in canvas units. */
export const TOKEN_GAP = 4;
/** Room past the outermost player, route or zone when a phone crops to the play. */
const EDGE = 34;

type Token = { at: Point; r: number };

/** Every token the lesson draws, where it stands at the snap. */
function tokensAtSnap(scene: Scene, lesson: Lesson): Token[] {
  const out: Token[] = [];
  for (const n of scene.nodes) {
    if (n.kind !== "player" || n.hidden || n.side === "defense") continue;
    const at = lesson.motion.offense.get(n.id)?.[0] ?? n;
    // The dark field rings each token a little outside its edge (`fr-ring`), so that ring is its edge here.
    out.push({ at, r: n.size * Math.abs(n.scaleX || 1) * 0.55 });
  }
  lesson.result.defenders.forEach((d, i) => out.push({ at: lesson.motion.defense[i]?.[0] ?? d.start, r: DEFENDER_R }));
  return out;
}

/**
 * How much the tokens may grow on a phone without touching: the most `want`
 * that keeps `TOKEN_GAP` between every two players at the snap (an 11-man line
 * sits shoulder to shoulder, so it gets less than a 5v5 spread). Never below
 * 1, the size they are drawn on a big screen; tokens a coach drew on top of
 * each other stay as drawn.
 */
export function tokenGrow(scene: Scene, lesson: Lesson, want: number): number {
  if (want <= 1) return want;
  const tokens = tokensAtSnap(scene, lesson);
  let grow = want;
  for (let i = 0; i < tokens.length; i++)
    for (let j = i + 1; j < tokens.length; j++) {
      const a = tokens[i];
      const b = tokens[j];
      const room = (Math.hypot(a.at.x - b.at.x, a.at.y - b.at.y) - TOKEN_GAP) / (a.r + b.r);
      if (room >= 1) grow = Math.min(grow, room);
    }
  return Math.max(1, grow);
}

/**
 * The stretch of the field a phone shows, left to right: everything the
 * lesson ever puts on the field (players through the whole play, their
 * routes) plus a margin, never wider than `[lo, hi]` (the picture
 * cut just outside the sidelines). A narrow screen spends its width on the
 * play, so the players stand further apart.
 */
export function playSpan(scene: Scene, lesson: Lesson, lo = 0, hi = CANVAS_W, grow = 1): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  const take = (x: number, r = 0) => {
    if (!Number.isFinite(x)) return;
    min = Math.min(min, x - r);
    max = Math.max(max, x + r);
  };
  for (const track of lesson.motion.offense.values()) for (const p of track) take(p.x, 18 * grow);
  for (const track of lesson.motion.defense) for (const p of track) take(p.x, DEFENDER_R * grow);
  // Zones may run off the edge: the players and their routes are what the picture is for.
  for (const n of scene.nodes) {
    if (n.hidden || n.kind === "player") continue;
    const b = worldBox(n);
    take(b.x);
    take(b.x + b.w);
  }
  if (!Number.isFinite(min)) return [lo, hi];
  return [Math.max(lo, min - EDGE), Math.min(hi, max + EDGE)];
}

/**
 * How a phone held upright opens the play up: the box (everyone within
 * `BOX` of the ball) is drawn `ACROSS` times wider, the field outside it
 * squeezed to keep the same width, and everything is drawn `DEEP` times
 * further from the line of scrimmage, since an upright phone has height to
 * spare. An 11-man line and the front over it stop sitting shoulder to
 * shoulder. Display only: the play, its grades and its clock are untouched.
 */
export const SPREAD = { box: 130, across: 1.25, deep: 1.3 };

export type Spread = {
  scene: Scene;
  lesson: Lesson;
  /** A canvas x or y where the spread picture draws it. */
  x: (x: number) => number;
  y: (y: number) => number;
};

/** Where the ball is: the center, else the quarterback, else the middle of the field. */
function ballX(scene: Scene): number {
  const by = (l: string) => scene.nodes.find((n) => n.kind === "player" && !n.hidden && n.side !== "defense" && n.label.trim().toUpperCase() === l);
  return (by("C") ?? by("Q"))?.x ?? CANVAS_W / 2;
}

/**
 * The play redrawn for an upright phone (`SPREAD`), between `lo` and `hi`
 * across (the picture's own edges, which stay where they are).
 */
export function spreadLesson(scene: Scene, lesson: Lesson, lo: number, hi: number): Spread {
  const mid = ballX(scene);
  const room = Math.min(mid - lo, hi - mid);
  // The box can't open wider than the field leaves room for; a play wider than its box stays as drawn.
  const box = Math.min(SPREAD.box, room / SPREAD.across - 1);
  const k = box > 0 ? SPREAD.across : 1;
  const x = (v: number) => {
    const dx = v - mid;
    if (Math.abs(dx) <= box) return mid + dx * k;
    const edge = dx > 0 ? hi : lo;
    const from = mid + Math.sign(dx) * box;
    const to = mid + Math.sign(dx) * box * k;
    if ((dx > 0 && v >= edge) || (dx < 0 && v <= edge)) return v;
    return to + ((v - from) * (edge - to)) / (edge - from);
  };
  const los = scene.losY;
  const y = (v: number) => los + (v - los) * SPREAD.deep;
  const pt = (p: Point): Point => ({ x: x(p.x), y: y(p.y) });
  // How wide one unit across is drawn near `v`, for zone widths.
  const slope = (v: number) => (x(v + 1) - x(v - 1)) / 2;

  const nodes = scene.nodes.map((n): SceneNode => {
    if (n.kind === "path") {
      // Into the world, spread there, and back as a line with no turn or stretch of its own.
      const points = n.points.map((p) => pt(toWorld(n, p)));
      const handles: Record<number, Point> = {};
      for (const [i, h] of Object.entries(n.handles ?? {})) {
        const p = n.points[Number(i)];
        if (!p) continue;
        const end = pt(toWorld(n, { x: p.x + h.x, y: p.y + h.y }));
        handles[Number(i)] = { x: end.x - points[Number(i)].x, y: end.y - points[Number(i)].y };
      }
      return { ...n, x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, points, handles };
    }
    return { ...n, ...pt(n) };
  });
  const result = lesson.result;
  const defenders = result.defenders.map((d) => ({
    ...d,
    start: pt(d.start),
    landmark: d.landmark && pt(d.landmark),
    reach: d.reach && d.landmark && { rx: d.reach.rx * slope(d.landmark.x), ry: d.reach.ry * SPREAD.deep },
  }));
  const rows = result.rows.map((r) => ({ ...r, end: pt(r.end) }));
  const target = result.target && (rows.find((r) => r.id === result.target!.id) ?? result.target);
  const spread: Lesson = {
    ...lesson,
    result: { ...result, defenders, rows, target },
    motion: {
      offense: new Map([...lesson.motion.offense].map(([id, track]) => [id, track.map(pt)])),
      defense: lesson.motion.defense.map((track) => track.map(pt)),
    },
  };
  return { scene: { ...scene, nodes }, lesson: spread, x, y };
}
