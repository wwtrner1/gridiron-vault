import { playSpan, spreadLesson, tokenGrow } from "../lib/fieldRoom";
import { useMemo } from "react";
import { luminance } from "../lib/brand";
import { STATUS_COLOR } from "../lib/coverage";
import { DEFENSE_INK } from "../lib/defense";
import { fieldInset, yardLines } from "../lib/field";
import { drawOrder, MarkerDefs, NodeLayer, strokeColors } from "../lib/render";
import { pointAt } from "../lib/motion";
import { buildTimeline } from "../lib/runPlay";
import { linesOf } from "../lib/assignments";
import { linesFor } from "../lib/teach";
import type { Lesson, TeachStep } from "../lib/teach";
import { CANVAS_H, CANVAS_W } from "../lib/types";
import type { Scene, SceneNode } from "../lib/types";

export const LESSON_FPS = 30;
const FPS = LESSON_FPS;
const BALL_FLIGHT = 0.5;
/** Ink for the coach's black lines and labels on the dark field. */
const DARK_INK = "#E9F0F6";
const DARK_DEFENSE = "#FF8A7A";
/** How much heavier a route is drawn while the lesson is teaching it. */
const BOLD = 1.6;

const isDarkInk = (hex: string) => {
  try {
    return /^#[0-9a-f]{6}$/i.test(hex) && luminance(hex) < 0.12;
  } catch {
    return false;
  }
};

/** A player color strong enough to carry a route on the dark field (not the black Q or a white token). */
const bright = (hex: string) => {
  try {
    const l = luminance(hex);
    return /^#[0-9a-f]{6}$/i.test(hex) && l > 0.06 && l < 0.8;
  } catch {
    return false;
  }
};
/** The color mixed a third of the way to white, so a deep blue or red still reads on navy. */
const lift = (hex: string) => "#" + [1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * 0.66 + 255 * 0.34).toString(16).padStart(2, "0")).join("");

/** The coach's drawing with its black ink turned light, so it reads on the dark field. Colors the coach chose stay. */
function onDark(n: SceneNode): SceneNode {
  if (n.kind === "path") return isDarkInk(n.stroke) ? { ...n, stroke: DARK_INK } : n;
  if (n.kind === "shape") return isDarkInk(n.stroke) ? { ...n, stroke: DARK_INK } : n;
  if (n.kind === "text") return isDarkInk(n.color) ? { ...n, color: DARK_INK } : n;
  return n;
}

/**
 * The coach's drawing as the lesson shows it: offense and ink only, in draw order. On the dark field
 * black ink turns light and a black route wears its player's color. The 3D view uses the same picture.
 */
export function lessonInk(scene: Scene, dark: boolean): SceneNode[] {
  // On the dark field a black route wears its player's color (a bright one), so each route reads as his at a glance.
  const owner = new Map<string, string>();
  if (dark)
    for (const pl of scene.nodes)
      if (pl.kind === "player" && pl.side !== "defense" && bright(pl.fill)) for (const l of linesOf(scene, pl)) if (!owner.has(l.id)) owner.set(l.id, pl.fill);
  // A route that only starts on its player (a starter play's) is his too, the way Run play reads it.
  if (dark)
    for (const tr of buildTimeline(scene).tracks) {
      const pl = scene.nodes.find((x) => x.id === tr.playerId);
      if (pl?.kind === "player" && pl.side !== "defense" && bright(pl.fill) && !owner.has(tr.pathId)) owner.set(tr.pathId, pl.fill);
    }
  return drawOrder(scene.nodes.filter((n) => !(n.kind === "player" && n.side === "defense"))).map((n) => {
    if (!dark) return n;
    const fill = owner.get(n.id);
    return n.kind === "path" && fill && !n.firstRead && isDarkInk(n.stroke) ? { ...n, stroke: lift(fill) } : onDark(n);
  });
}

/** The field's colors written out, for a picture drawn away from the page's stylesheet (the video export). */
const STANDALONE: Record<"dark" | "light", string> = {
  dark: `.fr-turf{fill:#0f1c30}.fr-side{stroke:#294564;stroke-width:2}.fr-yard{stroke:#294564;stroke-width:1.4}.fr-num{fill:#7f9ab3;font-size:14px;font-weight:600}.fr-los{stroke:#3fd3ee;stroke-width:3}.fr-mark{opacity:.22}.fr-zone{fill:rgba(63,211,238,.2);stroke:#3fd3ee;stroke-width:3;stroke-dasharray:10 7}.fr-zone.is-deep{fill:rgba(255,210,63,.2);stroke:#ffd23f}.fr-zone-tag{fill:#eafaff;font-size:19px;font-weight:800;letter-spacing:.05em;paint-order:stroke;stroke:#0f1c30;stroke-width:4px;stroke-linejoin:round}.fr-zone-tag.is-deep{fill:#ffe38a}.fr-ring{fill:none;stroke:rgba(255,255,255,.55);stroke-width:1.5}text{font-family:system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif}`,
  light: `.fr-turf{fill:#fff}.fr-side{stroke:#d5dee7;stroke-width:2}.fr-yard{stroke:#d5dee7;stroke-width:1.4}.fr-num{fill:#5d7287;font-size:14px;font-weight:600}.fr-los{stroke:#0b1524;stroke-width:3}.fr-mark{opacity:.1}.fr-zone{fill:rgba(210,236,250,.9);stroke:#12629a;stroke-width:3;stroke-dasharray:10 7}.fr-zone.is-deep{fill:rgba(255,236,170,.9);stroke:#9a6a00}.fr-zone-tag{fill:#0d4a75;font-size:19px;font-weight:800;letter-spacing:.05em;paint-order:stroke;stroke:#fff;stroke-width:4px;stroke-linejoin:round}.fr-zone-tag.is-deep{fill:#6b4a00}text{font-family:system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif}`,
};

/**
 * One frame of a lesson: the flat, top-down field at `t` seconds after the
 * snap, dressed for the step. The Film Room draws it on the page; the video
 * export draws the same picture `standalone`, with its colors written in.
 */
export function LessonField({
  scene: drawn,
  lesson: modeled,
  step,
  t,
  who,
  dark,
  logo,
  grow = 1,
  crop = false,
  spread = false,
  ball: showBall = false,
  label,
  standalone,
}: {
  scene: Scene;
  lesson: Lesson;
  step: TeachStep;
  /** The play's clock, in seconds after the snap. */
  t: number;
  /** The letter "Your job" is showing. */
  who: string;
  dark: boolean;
  /** The team logo, faint at midfield. */
  logo?: string;
  /** Token size, larger on a phone. */
  grow?: number;
  /** Cut the picture to just outside the sidelines, so a narrow screen spends its width on the field. */
  crop?: boolean;
  /** On an upright phone (with `crop`): open the box up and draw the play deeper (`spreadLesson`), so players stand apart. */
  spread?: boolean;
  /** Draw the throw on any step, not only The read (the Designer's Preview runs the whole play as one). */
  ball?: boolean;
  label?: string;
  standalone?: boolean;
}) {
  // A phone keeps to the play's own width, opens it up when held upright, and grows the tokens only as far as they stay apart.
  const phone = crop && !standalone;
  const view = useMemo(() => {
    const inset0 = fieldInset(drawn.view === "blank" ? "half" : drawn.view);
    const cut0 = Math.max(0, inset0 - 40);
    const [x0, x1] = phone ? playSpan(drawn, modeled, cut0, CANVAS_W - cut0, grow) : [0, CANVAS_W];
    const sp = phone && spread ? spreadLesson(drawn, modeled, x0, x1) : null;
    const scene = sp?.scene ?? drawn;
    const lesson = sp?.lesson ?? modeled;
    return { scene, lesson, x0, x1, y: sp?.y ?? ((v: number) => v), size: phone ? tokenGrow(scene, lesson, grow) : grow };
  }, [drawn, modeled, phone, spread, grow]);
  const { scene, lesson, x0, x1, size } = view;
  const fy = view.y;
  const { result, motion } = lesson;
  // Between the model's frames, so the picture moves at the screen's rate (and stays smooth at half speed).
  const now = Math.min(t, result.duration);
  const id = step.id;
  const mine = useMemo(() => new Set(id === "job" ? linesFor(drawn, who).map((l) => l.id) : []), [drawn, who, id]);
  const nodes = useMemo(() => lessonInk(scene, dark), [scene, dark]);
  const inkOpacity = (n: SceneNode) => (id === "call" ? 1 : id === "job" ? (mine.has(n.id) ? 1 : 0.14) : id === "look" || id === "zones" ? 0.3 : 0.8);
  // Routes are drawn heavy once the lesson is about them, so they read from the back of the room.
  const heavy = (n: SceneNode): SceneNode => (n.kind === "path" && (id === "call" || id === "snap" || id === "read" || (id === "job" && mine.has(n.id))) ? { ...n, width: n.width * BOLD } : n);
  const thrown = (id === "read" || showBall) && t >= result.throwAt;
  const statusOf = new Map(id === "read" ? result.rows.map((r) => [r.id, r.status]) : []);
  const showZones = id !== "job";
  const zoneTags = id === "zones";
  const inset = fieldInset(scene.view === "blank" ? "half" : scene.view);
  const lines = yardLines(scene.view, scene.losY);
  const defInk = dark ? DARK_DEFENSE : DEFENSE_INK;

  let ball: { x: number; y: number } | null = null;
  if (thrown && result.target) {
    const qbId = [...result.offense.keys()].find((pid) => {
      const n = scene.nodes.find((x) => x.id === pid);
      return n?.kind === "player" && n.label.toUpperCase() === "Q";
    });
    const from = qbId ? pointAt(motion.offense.get(qbId)!, result.throwAt, FPS) : null;
    const to = pointAt(motion.offense.get(result.target.id) ?? [], now, FPS);
    const p = Math.min(1, (t - result.throwAt) / BALL_FLIGHT);
    if (from && to) ball = { x: from.x + (to.x - from.x) * p, y: from.y + (to.y - from.y) * p - Math.sin(Math.PI * p) * 26 };
  }

  return (
    <svg viewBox={`${x0} ${fy(0)} ${x1 - x0} ${fy(CANVAS_H) - fy(0)}`} role="img" aria-label={label} data-grow={size.toFixed(3)} xmlns={standalone ? "http://www.w3.org/2000/svg" : undefined} width={standalone ? CANVAS_W : undefined} height={standalone ? CANVAS_H : undefined}>
      {standalone && <style>{STANDALONE[dark ? "dark" : "light"]}</style>}
      <MarkerDefs colors={strokeColors(nodes)} />
      <rect className="fr-turf" x={0} y={fy(0)} width={CANVAS_W} height={fy(CANVAS_H) - fy(0)} />
      <line className="fr-side" x1={inset} y1={fy(0)} x2={inset} y2={fy(CANVAS_H)} />
      <line className="fr-side" x1={CANVAS_W - inset} y1={fy(0)} x2={CANVAS_W - inset} y2={fy(CANVAS_H)} />
      {lines.map((l) => (
        <g key={l.y}>
          <line className="fr-yard" x1={inset} y1={fy(l.y)} x2={CANVAS_W - inset} y2={fy(l.y)} />
          {l.yards % 10 === 0 && l.y < scene.losY && (
            <text className="fr-num" x={Math.max(inset, x0) + 10} y={fy(l.y) - 5}>
              {l.yards}
            </text>
          )}
        </g>
      ))}
      <line className="fr-los" x1={inset} y1={scene.losY} x2={CANVAS_W - inset} y2={scene.losY} />
      {logo && <image className="fr-mark" href={logo} x={CANVAS_W / 2 - 70} y={Math.max(20, scene.losY - 330)} width={140} height={140} preserveAspectRatio="xMidYMid meet" />}

      {showZones &&
        result.defenders.map((d, di) =>
          d.landmark && d.reach ? (
            <g key={`z${di}`} opacity={zoneTags ? 1 : 0.45}>
              <ellipse className={lesson.jobs[di]?.deep ? "fr-zone is-deep" : "fr-zone"} cx={d.landmark.x} cy={d.landmark.y} rx={d.reach.rx / 1.15} ry={d.reach.ry / 2.4} />
              {zoneTags && (
                <text className={lesson.jobs[di]?.deep ? "fr-zone-tag is-deep" : "fr-zone-tag"} x={d.landmark.x} y={d.landmark.y + 6} textAnchor="middle">
                  {lesson.jobs[di].job.toUpperCase()}
                </text>
              )}
            </g>
          ) : null,
        )}

      {nodes.map((n) => {
        if (n.kind !== "player") return <NodeLayer key={n.id} node={heavy(n)} opacity={inkOpacity(n)} className={n.kind === "path" && n.firstRead && id === "call" ? "fr-first" : undefined} />;
        const p = pointAt(motion.offense.get(n.id) ?? [], now, FPS) ?? n;
        const s = thrown ? statusOf.get(n.id) : undefined;
        const dim = id === "job" && n.label.trim().toUpperCase() !== who;
        return (
          <g key={n.id} opacity={dim ? 0.3 : 1}>
            {s && <circle cx={p.x} cy={p.y} r={n.size * 0.95 * size} fill="none" stroke={STATUS_COLOR[s]} strokeWidth={6} />}
            {dark && <circle className="fr-ring" cx={p.x} cy={p.y} r={n.size * 0.6 * size} />}
            <NodeLayer node={{ ...n, x: p.x, y: p.y, scaleX: n.scaleX * size, scaleY: n.scaleY * size }} />
          </g>
        );
      })}

      {id === "read" &&
        result.rows.map((r) => (
          <g key={`r${r.id}`} aria-hidden="true">
            <circle cx={r.end.x} cy={r.end.y - 20} r={10} fill="#F2B705" stroke="#0B1524" strokeWidth={1.5} />
            <text x={r.end.x} y={r.end.y - 16} textAnchor="middle" fontSize={12} fontWeight={700} fill="#0B1524" fontFamily="'IBM Plex Mono', monospace">
              {r.read}
            </text>
          </g>
        ))}

      {result.defenders.map((d, di) => {
        const p = pointAt(motion.defense[di] ?? [], now, FPS) ?? d.start;
        return (
          <g key={`d${di}`} aria-hidden="true" opacity={id === "job" ? 0.35 : 1} data-defender={d.label}>
            <circle cx={p.x} cy={p.y} r={15 * size} fill={dark ? "#2A1717" : "#fff"} stroke={defInk} strokeWidth={2.6} />
            <text x={p.x} y={p.y + 4.5 * size} textAnchor="middle" fontSize={13 * size} fontWeight={700} fill={defInk} fontFamily="'Barlow', sans-serif">
              {d.label}
            </text>
          </g>
        );
      })}
      {ball && <ellipse cx={ball.x} cy={ball.y} rx={11} ry={7} fill="#B07A45" stroke="#41290F" strokeWidth={2} />}
    </svg>
  );
}
