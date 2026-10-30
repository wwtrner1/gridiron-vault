import { FieldBackground } from "../lib/field";
import { CARD_LOOK, frameScene } from "../lib/printLook";
import { drawOrder, MarkerDefs, NodeLayer, strokeColors } from "../lib/render";
import type { Scene } from "../lib/types";
import { CANVAS_H, CANVAS_W } from "../lib/types";

/**
 * Read-only diagram. Same renderer as the editor and the print pipeline. With
 * `zoom` (its size on screen, in inches), it crops to the players and routes
 * and weights them like a printed card, so a small list thumbnail stays readable.
 */
export function PlayThumb({ scene, label, zoom }: { scene: Scene; label?: string | null; zoom?: { w: number; h: number } }) {
  const framed = zoom ? frameScene(scene, CARD_LOOK, zoom.w, zoom.h) : null;
  const shown = framed?.scene ?? scene;
  const box = framed?.box ?? { x: 0, y: 0, w: CANVAS_W, h: CANVAS_H };
  const ordered = drawOrder(shown.nodes);
  return (
    <svg viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`} role="img" aria-label={label ? `${label} diagram` : "Play diagram"}>
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
