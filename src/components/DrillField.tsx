import { useEffect, useId, useMemo, useRef, useState } from "react";
import { drillLegs, drillLength, spotsAt, type DrillDiagram, type MoveStyle, type Spot } from "../lib/drills";

const U = 20; // drawing units per yard

const DASH: Record<MoveStyle, string | undefined> = {
  run: undefined,
  back: "10 7",
  throw: "3 6",
  block: undefined,
  shuffle: "14 5 3 5",
};

type Pt = [number, number];

/** Where a label sits along a line, and the angle that keeps it reading left to right. */
function labelSpot(pts: Pt[]): { x: number; y: number; deg: number } {
  let best = 1;
  let len = -1;
  for (let i = 1; i < pts.length; i++) {
    const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (l > len) { len = l; best = i; }
  }
  const [a, b] = [pts[best - 1], pts[best]];
  let deg = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
  if (deg > 90) deg -= 180;
  if (deg < -90) deg += 180;
  // Off the line a touch, so the words never sit on the dashes.
  const nx = -(b[1] - a[1]) / (len || 1);
  const ny = (b[0] - a[0]) / (len || 1);
  return { x: ((a[0] + b[0]) / 2 + nx * 0.7) * U, y: ((a[1] + b[1]) / 2 + ny * 0.7) * U, deg };
}

const poly = (pts: Pt[]) => pts.map(([x, y]) => `${x * U},${y * U}`).join(" ");

/**
 * A drill's diagram on a patch of field. Lines are always drawn, so the still
 * picture and the print read on their own; with `playing` the players, coach
 * and ball run their moves on the drill's clock and loop.
 */
export function DrillField({ diagram, playing = false, label, onTime }: { diagram: DrillDiagram; playing?: boolean; label: string; onTime?: (t: number, length: number) => void }) {
  const id = useId().replace(/:/g, "");
  const legs = useMemo(() => drillLegs(diagram), [diagram]);
  const length = useMemo(() => drillLength(diagram), [diagram]);
  const [t, setT] = useState(0);
  const started = useRef(0);
  const timeCb = useRef(onTime);
  timeCb.current = onTime;

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    started.current = performance.now() - t * 1000;
    const tick = (now: number) => {
      const s = ((now - started.current) / 1000) % length;
      setT(s);
      timeCb.current?.(s, length);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // t is read once when play starts, so a pause resumes where it stopped.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, length]);

  const at = spotsAt(diagram, playing || t > 0 ? t : 0, legs);
  const W = diagram.w * U;
  const H = diagram.h * U;
  const lines: { pts: Pt[]; style: MoveStyle; text?: string; key: string; guide?: boolean }[] = [
    ...(diagram.guides ?? []).map((g, i) => ({ pts: [g.from, ...g.path] as Pt[], style: g.style, text: g.label, key: `g${i}`, guide: true })),
    ...legs.map((l, i) => ({ pts: l.pts, style: l.move.style, text: l.move.label, key: `m${i}` })),
  ];

  return (
    <svg className="dr-field" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} preserveAspectRatio="xMidYMid meet">
      <defs>
        <marker id={`${id}-a`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" className="dr-head" />
        </marker>
      </defs>
      <rect width={W} height={H} className="dr-turf" />
      {Array.from({ length: Math.floor(diagram.h / 5) + 1 }, (_, i) => H - i * 5 * U - 2 * U)
        .filter((y) => y > 0)
        .map((y) => <line key={y} x1={0} x2={W} y1={y} y2={y} className="dr-yard" />)}
      {Array.from({ length: diagram.h }, (_, i) => i * U + U / 2).map((y) => (
        <line key={`h${y}`} x1={W - 1.6 * U} x2={W - 0.8 * U} y1={y} y2={y} className="dr-hash" />
      ))}

      {lines.map((l) => {
        const s = l.text ? labelSpot(l.pts) : null;
        const block = l.style === "block";
        const last = l.pts[l.pts.length - 1];
        const prev = l.pts[l.pts.length - 2] ?? last;
        const ang = Math.atan2(last[1] - prev[1], last[0] - prev[0]);
        return (
          <g key={l.key} className={`dr-line dr-${l.style}${l.guide ? " is-guide" : ""}`}>
            <polyline points={poly(l.pts)} fill="none" strokeDasharray={DASH[l.style]} markerEnd={block || l.style === "back" && l.guide ? undefined : `url(#${id}-a)`} />
            {block && (
              <line
                x1={last[0] * U - Math.sin(ang) * 10}
                y1={last[1] * U + Math.cos(ang) * 10}
                x2={last[0] * U + Math.sin(ang) * 10}
                y2={last[1] * U - Math.cos(ang) * 10}
              />
            )}
            {s && (
              <text x={s.x} y={s.y} transform={`rotate(${s.deg} ${s.x} ${s.y})`} className="dr-label" textAnchor="middle" dominantBaseline="middle">
                {l.text}
              </text>
            )}
          </g>
        );
      })}

      {diagram.spots.filter((s) => s.kind !== "ball").map((s) => <SpotGlyph key={s.id} spot={s} at={at.get(s.id)} />)}
      {diagram.spots.filter((s) => s.kind === "ball").map((s) => <SpotGlyph key={s.id} spot={s} at={at.get(s.id)} />)}
    </svg>
  );
}

function SpotGlyph({ spot, at }: { spot: Spot; at?: Pt }) {
  const [x, y] = (at ?? [spot.x, spot.y]).map((v) => v * U);
  switch (spot.kind) {
    case "cone":
      return (
        <g className="dr-cone">
          <path d={`M${x - 8},${y + 8} L${x},${y - 11} L${x + 8},${y + 8} z`} />
          {spot.label && <text x={x} y={y - 16} textAnchor="middle" className="dr-cone-label">{spot.label}</text>}
        </g>
      );
    case "ball":
      return (
        <g className="dr-ball" transform={`translate(${x} ${y}) rotate(-35)`}>
          <ellipse rx={9} ry={5.5} />
          <line x1={-3} x2={3} y1={0} y2={0} />
        </g>
      );
    case "bag":
      return <rect className="dr-bag" x={x - 16} y={y - 6} width={32} height={12} rx={6} />;
    case "def": {
      const w = Math.max(30, (spot.label?.length ?? 1) * 11 + 10);
      return (
        <g className="dr-def">
          <rect x={x - w / 2} y={y - 15} width={w} height={30} rx={3} />
          <text x={x} y={y + 1} textAnchor="middle" dominantBaseline="middle">{spot.label}</text>
        </g>
      );
    }
    default:
      return (
        <g className={spot.kind === "coach" ? "dr-coach" : "dr-off"}>
          <circle cx={x} cy={y} r={16} />
          <text x={x} y={y + 1} textAnchor="middle" dominantBaseline="middle">{spot.label}</text>
        </g>
      );
  }
}
