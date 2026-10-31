import { useEffect, useRef, useState } from "react";
import { FieldBackground } from "../lib/field";
import { CARD_LOOK, frameScene } from "../lib/printLook";
import { drawOrder, MarkerDefs, NodeLayer, strokeColors } from "../lib/render";
import type { Scene } from "../lib/types";
import { CANVAS_H, CANVAS_W } from "../lib/types";

/**
 * Read-only diagram. Same renderer as the editor and the print pipeline. With
 * `zoom` (its size on screen, in inches), it crops to the players and routes
 * and weights them like a printed card, so a small list thumbnail stays readable.
 * `decorative` hides it from screen readers, for a thumb inside a button that
 * already names the play (its yard numbers would otherwise join the name).
 * `lazy` draws the diagram only once it nears the screen (a long grid such as
 * Starters would otherwise build every field and route up front).
 */
export function PlayThumb({
  scene,
  label,
  zoom,
  decorative = false,
  lazy = false,
}: {
  scene: Scene;
  label?: string | null;
  zoom?: { w: number; h: number };
  decorative?: boolean;
  lazy?: boolean;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const [near, setNear] = useState(!lazy || typeof IntersectionObserver === "undefined");
  useEffect(() => {
    if (near || !ref.current) return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setNear(true), { rootMargin: "600px 0px" });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [near]);
  const framed = zoom ? frameScene(scene, CARD_LOOK, zoom.w, zoom.h) : null;
  const shown = framed?.scene ?? scene;
  const box = framed?.box ?? { x: 0, y: 0, w: CANVAS_W, h: CANVAS_H };
  const ordered = drawOrder(shown.nodes);
  const a11y = decorative ? { "aria-hidden": true } : { role: "img", "aria-label": label ? `${label} diagram` : "Play diagram" };
  if (!near) return <svg ref={ref} viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`} {...a11y} />;
  return (
    <svg ref={ref} viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`} {...a11y}>
      <MarkerDefs colors={strokeColors(shown.nodes)} />
      <FieldBackground
        view={scene.view}
        losY={scene.losY}
        yards={!!framed}
        weight={framed?.weight}
        ptPerUnit={framed?.ptPerUnit}
        frame={framed ? box : undefined}
      />
      {ordered.map((n) => (
        <NodeLayer key={n.id} node={n} print={!!framed} />
      ))}
    </svg>
  );
}
