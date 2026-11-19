import { useEffect, useMemo, useRef, useState } from "react";
import { FieldBackground } from "../../lib/field";
import { drawOrder, MarkerDefs, NodeLayer, strokeColors } from "../../lib/render";
import { ballAt, buildTimeline, positionsAt } from "../../lib/runPlay";
import { STARTERS, starterScene } from "../../lib/starters";
import { CANVAS_H, CANVAS_W } from "../../lib/types";

const HERO_PLAY = STARTERS.find((s) => s.n === 16)!;
/** Seconds the play waits at the line before each snap, and holds after the catch. */
const WAIT = 1.4;
const HOLD = 1.6;

/**
 * The home page's example play, split out so the starter plays aren't in the
 * first download. It runs itself on a loop (the same timeline as Run play)
 * while it is on screen; a visitor who asked for less motion gets the drawing.
 */
export function HeroPlay() {
  const scene = useMemo(() => starterScene(HERO_PLAY), []);
  const tl = useMemo(() => buildTimeline(scene), [scene]);
  const ordered = useMemo(() => drawOrder(scene.nodes), [scene]);
  const svg = useRef<SVGSVGElement>(null);
  const [t, setT] = useState(0);

  useEffect(() => {
    const el = svg.current;
    if (!el || typeof matchMedia !== "function" || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const loop = WAIT + tl.duration + HOLD;
    let raf = 0;
    let last = 0;
    let clock = 0;
    let seen = typeof IntersectionObserver === "undefined";
    const tick = (now: number) => {
      // A tab left in the background comes back where it stopped, not a minute ahead.
      clock = (clock + Math.min(0.1, last ? (now - last) / 1000 : 0)) % loop;
      last = now;
      const u = clock - WAIT;
      // Off the snap a player builds speed over the first few steps instead of starting flat out.
      setT(u <= 0 ? 0 : Math.min(tl.duration, u < 0.5 ? u * u : u - 0.25));
      raf = requestAnimationFrame(tick);
    };
    const start = () => {
      if (!raf) {
        last = 0;
        raf = requestAnimationFrame(tick);
      }
    };
    const stop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };
    if (seen) start();
    const io =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver((entries) => {
            seen = entries.some((e) => e.isIntersecting);
            if (seen) start();
            else stop();
          });
    io?.observe(el);
    return () => {
      stop();
      io?.disconnect();
    };
  }, [tl]);

  const at = positionsAt(scene, tl, t);
  const ball = ballAt(tl, at, t);
  return (
    <svg ref={svg} viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`} role="img" aria-label={`${HERO_PLAY.name} — ${HERO_PLAY.description} diagram`}>
      <MarkerDefs colors={strokeColors(scene.nodes)} />
      <FieldBackground view={scene.view} losY={scene.losY} />
      {ordered.map((n) => {
        if (n.kind !== "player") return <NodeLayer key={n.id} node={n} />;
        const p = at.get(n.id) ?? n;
        return <NodeLayer key={n.id} node={{ ...n, x: p.x, y: p.y }} />;
      })}
      {ball && <ellipse cx={ball.x} cy={ball.y} rx={11} ry={7} fill="#7A5230" stroke="#41290F" strokeWidth={2} />}
    </svg>
  );
}
