import { FieldBackground } from "../lib/field";
import { drawOrder, MarkerDefs, NodeLayer, strokeColors } from "../lib/render";
import type { Scene } from "../lib/types";
import { CANVAS_H, CANVAS_W } from "../lib/types";

/** Read-only diagram. Same renderer as the editor and the print pipeline. */
export function PlayThumb({ scene, label }: { scene: Scene; label?: string | null }) {
  const ordered = drawOrder(scene.nodes);
  return (
    <svg viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`} role="img" aria-label={label ? `${label} diagram` : "Play diagram"}>
      <MarkerDefs colors={strokeColors(scene.nodes)} />
      <FieldBackground view={scene.view} losY={scene.losY} />
      {ordered.map((n) => (
        <NodeLayer key={n.id} node={n} />
      ))}
    </svg>
  );
}
