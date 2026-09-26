import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FieldBackground } from "../lib/field";
import { drawOrder, MarkerDefs, NodeLayer, strokeColors } from "../lib/render";
import { noteShowsOnHover } from "../lib/notes";
import {
  boxesOverlap,
  dist,
  motionPath,
  pathData,
  simplify,
  snap,
  toLocal,
  toWorld,
  worldBox,
} from "../lib/geometry";
import {
  cloneNodes,
  makePath,
  makeShape,
  makeText,
  nextZ,
  reconcileConnections,
  resolveSelection,
  selectionBox,
} from "../lib/scene";
import type { PathNode, Point, Scene, SceneNode } from "../lib/types";
import { CANVAS_H, CANVAS_W } from "../lib/types";
import type { ModeId, ToolId } from "../lib/tools";

const POLY_TOOLS: ToolId[] = ["line", "dashed", "block", "motion", "polygon", "zone", "pen"];
const SEL = "#16C8E8";

type Anchor = { ax: number; ay: number };

type Props = {
  scene: Scene;
  selection: string[];
  tool: ToolId;
  mode: ModeId | null;
  color: string;
  width: number;
  grid: number;
  anchor: Anchor;
  zoom: number;
  watermark?: string | null;
  onScene: (next: Scene, label?: string) => void;
  onSelection: (ids: string[]) => void;
  onToolDone: () => void;
  onStatus?: (text: string) => void;
};

type Drag =
  | { kind: "move"; start: Point; ids: string[]; origin: Map<string, Point> }
  | { kind: "marquee"; start: Point; additive: boolean }
  | {
      kind: "rotate";
      center: Point;
      startAngle: number;
      ids: string[];
      origin: Map<string, { x: number; y: number; rotation: number }>;
    }
  | {
      kind: "scale";
      anchor: Point;
      start: Point;
      ids: string[];
      lockX: boolean;
      lockY: boolean;
      origin: Map<string, { x: number; y: number; sx: number; sy: number }>;
    }
  | { kind: "free" }
  | { kind: "box"; start: Point; tool: "rect" | "ellipse"; square: boolean }
  | { kind: "vertex"; id: string; index: number }
  | { kind: "handle"; id: string; index: number };

export function PlayCanvas({
  scene,
  selection,
  tool,
  mode,
  color,
  width,
  grid,
  anchor,
  zoom,
  watermark,
  onScene,
  onSelection,
  onToolDone,
  onStatus,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const sceneRef = useRef(scene);
  sceneRef.current = scene;

  const [draft, setDraft] = useState<Point[]>([]);
  const [ghost, setGhost] = useState<Point | null>(null);
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [freehand, setFreehand] = useState<Point[]>([]);
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const ordered = useMemo(() => drawOrder(scene.nodes), [scene.nodes]);
  const selected = useMemo(() => scene.nodes.filter((n) => selection.includes(n.id)), [scene.nodes, selection]);
  const selBox = useMemo(() => selectionBox(scene, selection), [scene, selection]);
  const markerColors = useMemo(() => [...strokeColors(scene.nodes), color, SEL], [scene.nodes, color]);

  const say = useCallback((text: string) => onStatus?.(text), [onStatus]);

  const point = useCallback(
    (e: { clientX: number; clientY: number }): Point => {
      const r = svgRef.current?.getBoundingClientRect();
      if (!r) return { x: 0, y: 0 };
      return {
        x: ((e.clientX - r.left) / r.width) * CANVAS_W,
        y: ((e.clientY - r.top) / r.height) * CANVAS_H,
      };
    },
    [],
  );

  const snapped = useCallback((p: Point): Point => ({ x: snap(p.x, grid), y: snap(p.y, grid) }), [grid]);

  /* ---------------------------------------------------------------- drawing */

  const commitPoly = useCallback(
    (pts: Point[]) => {
      if (pts.length < 2) {
        setDraft([]);
        return;
      }
      const origin = pts[0];
      const local = pts.map((p) => ({ x: p.x - origin.x, y: p.y - origin.y }));
      const node = makePath(tool, origin, local, color, width, nextZ(sceneRef.current));
      onScene({ ...sceneRef.current, nodes: [...sceneRef.current.nodes, node] }, `Draw ${node.name}`);
      onSelection([node.id]);
      setDraft([]);
      setGhost(null);
      say(`${node.name} drawn. Press Escape to drop the tool, or keep clicking to draw another.`);
    },
    [tool, color, width, onScene, onSelection, say],
  );

  const finishDraft = useCallback(() => {
    if (draft.length) commitPoly(draft);
  }, [draft, commitPoly]);

  /* ------------------------------------------------------------ drag starts */

  const beginMove = (ids: string[], start: Point) => {
    const origin = new Map<string, Point>();
    for (const n of sceneRef.current.nodes) if (ids.includes(n.id)) origin.set(n.id, { x: n.x, y: n.y });
    dragRef.current = { kind: "move", start, ids, origin };
  };

  const beginRotate = (ids: string[], start: Point) => {
    const bb = selectionBox(sceneRef.current, ids);
    const center = sceneRef.current.pivot ?? (bb ? { x: bb.x + bb.w / 2, y: bb.y + bb.h / 2 } : start);
    const origin = new Map<string, { x: number; y: number; rotation: number }>();
    for (const n of sceneRef.current.nodes)
      if (ids.includes(n.id)) origin.set(n.id, { x: n.x, y: n.y, rotation: n.rotation });
    dragRef.current = {
      kind: "rotate",
      center,
      startAngle: Math.atan2(start.y - center.y, start.x - center.x),
      ids,
      origin,
    };
    say(sceneRef.current.pivot ? "Spinning around your pivot point. Hold Shift for 15° steps." : "Hold Shift to snap to 15° steps.");
  };

  const beginScale = (ids: string[], start: Point, anchorPt: Point, lockX = false, lockY = false) => {
    const origin = new Map<string, { x: number; y: number; sx: number; sy: number }>();
    for (const n of sceneRef.current.nodes)
      if (ids.includes(n.id)) origin.set(n.id, { x: n.x, y: n.y, sx: n.scaleX, sy: n.scaleY });
    dragRef.current = { kind: "scale", anchor: anchorPt, start, ids, lockX, lockY, origin };
  };

  /* ------------------------------------------------------------- node input */

  const onNodeDown = (e: React.PointerEvent, node: SceneNode) => {
    if (node.locked || editing) return;
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const p = point(e);

    if (tool === "connect") {
      if (node.kind !== "player") {
        say("Auto-connect joins two player tokens. Click a token to start.");
        return;
      }
      if (!connectFrom) {
        setConnectFrom(node.id);
        say(`Started at ${node.name || node.label}. Click the second token to join them.`);
        return;
      }
      if (connectFrom === node.id) {
        setConnectFrom(null);
        return;
      }
      const link: PathNode = {
        ...makePath("connect", { x: 0, y: 0 }, [{ x: 0, y: 0 }, { x: 1, y: 0 }], color, width, nextZ(sceneRef.current)),
        fromId: connectFrom,
        toId: node.id,
      };
      onScene(reconcileConnections({ ...sceneRef.current, nodes: [...sceneRef.current.nodes, link] }), "Auto-connect");
      onSelection([link.id]);
      setConnectFrom(null);
      say("Connected. Move either token and the line follows.");
      return;
    }

    if (tool !== "select") return;

    const ids = resolveSelection(sceneRef.current, node.id, mode === "clickThrough");

    if (mode === "duplicate") {
      const source = sceneRef.current.nodes.filter((n) => ids.includes(n.id));
      const copies = cloneNodes(source);
      const z = nextZ(sceneRef.current);
      const stamped = copies.map((n, i) => ({ ...n, z: z + i }));
      const nextIds = stamped.map((n) => n.id);
      onScene({ ...sceneRef.current, nodes: [...sceneRef.current.nodes, ...stamped] }, "Duplicate");
      onSelection(nextIds);
      beginMove(nextIds, p);
      say("Copy pulled out. The original stayed put.");
      return;
    }

    if (mode === "rotate") {
      if (!selection.includes(node.id)) onSelection(ids);
      beginRotate(selection.includes(node.id) ? selection : ids, p);
      return;
    }

    if (mode === "scale") {
      const target = selection.includes(node.id) ? selection : ids;
      if (!selection.includes(node.id)) onSelection(ids);
      const bb = selectionBox(sceneRef.current, target);
      if (bb) beginScale(target, p, { x: bb.x + bb.w * anchor.ax, y: bb.y + bb.h * anchor.ay });
      say("Dragging scales away from the anchor you picked.");
      return;
    }

    const additive = mode === "multiSelect" || e.shiftKey;
    let nextIds: string[];
    if (additive) {
      const has = ids.every((id) => selection.includes(id));
      nextIds = has ? selection.filter((id) => !ids.includes(id)) : [...new Set([...selection, ...ids])];
      onSelection(nextIds);
      if (has) return;
    } else {
      nextIds = selection.includes(node.id) ? selection : ids;
      onSelection(nextIds);
    }
    beginMove(nextIds, p);
  };

  /* -------------------------------------------------------- surface  input */

  const onSurfaceDown = (e: React.PointerEvent) => {
    if (editing) {
      setEditing(null);
      return;
    }
    const raw = point(e);
    const p = snapped(raw);
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);

    if (tool === "select") {
      dragRef.current = { kind: "marquee", start: raw, additive: mode === "multiSelect" || e.shiftKey };
      setMarquee({ x: raw.x, y: raw.y, w: 0, h: 0 });
      return;
    }

    if (tool === "pivot") {
      onScene({ ...sceneRef.current, pivot: p }, "Pivot point");
      onToolDone();
      say("Pivot dropped. Rotate Mode now spins around it. Drop another anywhere to move it.");
      return;
    }

    if (tool === "text") {
      const node = makeText(p, "New label", "#0B1524", nextZ(sceneRef.current));
      onScene({ ...sceneRef.current, nodes: [...sceneRef.current.nodes, node] }, "Add text");
      onSelection([node.id]);
      setEditing(node.id);
      onToolDone();
      return;
    }

    if (tool === "free") {
      dragRef.current = { kind: "free" };
      setFreehand([raw]);
      return;
    }

    if (tool === "rect" || tool === "ellipse") {
      dragRef.current = { kind: "box", start: p, tool, square: e.shiftKey };
      setBox({ x: p.x, y: p.y, w: 0, h: 0 });
      return;
    }

    if (POLY_TOOLS.includes(tool)) {
      // Close a polygon by clicking back on the first point.
      if (draft.length > 2 && dist(p, draft[0]) < 14) {
        commitPoly([...draft, draft[0]]);
        return;
      }
      setDraft((d) => [...d, p]);
      setGhost(p);
      if (draft.length === 0)
        say("Click each turn in the line. Double-click or press Enter to finish, Escape to scrap it.");
      return;
    }
  };

  /* ------------------------------------------------------------ move  / up */

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      const raw = point(e);

      if (!d) {
        if (draft.length) setGhost(e.shiftKey ? axisLock(draft[draft.length - 1], snapped(raw)) : snapped(raw));
        return;
      }

      if (d.kind === "marquee") {
        setMarquee({
          x: Math.min(d.start.x, raw.x),
          y: Math.min(d.start.y, raw.y),
          w: Math.abs(raw.x - d.start.x),
          h: Math.abs(raw.y - d.start.y),
        });
        return;
      }

      if (d.kind === "free") {
        setFreehand((pts) => [...pts, raw]);
        return;
      }

      if (d.kind === "box") {
        const end = snapped(raw);
        let w = end.x - d.start.x;
        let h = end.y - d.start.y;
        if (d.square || e.shiftKey) {
          const m = Math.max(Math.abs(w), Math.abs(h));
          w = Math.sign(w || 1) * m;
          h = Math.sign(h || 1) * m;
        }
        setBox({ x: Math.min(d.start.x, d.start.x + w), y: Math.min(d.start.y, d.start.y + h), w: Math.abs(w), h: Math.abs(h) });
        return;
      }

      if (d.kind === "move") {
        let dx = raw.x - d.start.x;
        let dy = raw.y - d.start.y;
        if (e.shiftKey) {
          if (Math.abs(dx) > Math.abs(dy)) dy = 0;
          else dx = 0;
        }
        const next = {
          ...sceneRef.current,
          nodes: sceneRef.current.nodes.map((n) => {
            const o = d.origin.get(n.id);
            if (!o) return n;
            return { ...n, x: snap(o.x + dx, grid), y: snap(o.y + dy, grid) };
          }),
        };
        onScene(reconcileConnections(next));
        return;
      }

      if (d.kind === "rotate") {
        const angle = Math.atan2(raw.y - d.center.y, raw.x - d.center.x);
        let deg = ((angle - d.startAngle) * 180) / Math.PI;
        if (e.shiftKey) deg = Math.round(deg / 15) * 15;
        const r = (deg * Math.PI) / 180;
        const next = {
          ...sceneRef.current,
          nodes: sceneRef.current.nodes.map((n) => {
            const o = d.origin.get(n.id);
            if (!o) return n;
            const px = o.x - d.center.x;
            const py = o.y - d.center.y;
            return {
              ...n,
              x: d.center.x + px * Math.cos(r) - py * Math.sin(r),
              y: d.center.y + px * Math.sin(r) + py * Math.cos(r),
              rotation: o.rotation + deg,
            };
          }),
        };
        onScene(reconcileConnections(next));
        return;
      }

      if (d.kind === "scale") {
        const sx0 = d.start.x - d.anchor.x;
        const sy0 = d.start.y - d.anchor.y;
        let fx = Math.abs(sx0) < 4 ? 1 : (raw.x - d.anchor.x) / sx0;
        let fy = Math.abs(sy0) < 4 ? 1 : (raw.y - d.anchor.y) / sy0;
        if (d.lockX) fx = 1;
        if (d.lockY) fy = 1;
        if (e.shiftKey) {
          const m = (Math.abs(fx) + Math.abs(fy)) / 2;
          fx = Math.sign(fx || 1) * m;
          fy = Math.sign(fy || 1) * m;
        }
        fx = clampScale(fx);
        fy = clampScale(fy);
        const next = {
          ...sceneRef.current,
          nodes: sceneRef.current.nodes.map((n) => {
            const o = d.origin.get(n.id);
            if (!o) return n;
            return {
              ...n,
              x: d.anchor.x + (o.x - d.anchor.x) * fx,
              y: d.anchor.y + (o.y - d.anchor.y) * fy,
              scaleX: o.sx * fx,
              scaleY: o.sy * fy,
            };
          }),
        };
        onScene(reconcileConnections(next));
        return;
      }

      if (d.kind === "vertex" || d.kind === "handle") {
        const node = sceneRef.current.nodes.find((n) => n.id === d.id);
        if (!node || node.kind !== "path") return;
        const local = toLocal(node, snapped(raw));
        const nodes = sceneRef.current.nodes.map((n) => {
          if (n.id !== d.id || n.kind !== "path") return n;
          if (d.kind === "vertex") {
            const points = n.points.map((pt, i) => (i === d.index ? local : pt));
            return { ...n, points };
          }
          const base = n.points[d.index];
          return { ...n, handles: { ...n.handles, [d.index]: { x: local.x - base.x, y: local.y - base.y } } };
        });
        onScene({ ...sceneRef.current, nodes });
      }
    };

    const onUp = () => {
      const d = dragRef.current;
      dragRef.current = null;

      if (!d) return;

      if (d.kind === "marquee") {
        const m = marquee;
        setMarquee(null);
        if (!m || m.w < 4 || m.h < 4) {
          if (!d.additive) onSelection([]);
          return;
        }
        const hits = sceneRef.current.nodes
          .filter((n) => !n.hidden && !n.locked && boxesOverlap(worldBox(n), m))
          .flatMap((n) => resolveSelection(sceneRef.current, n.id, mode === "clickThrough"));
        const unique = [...new Set(d.additive ? [...selection, ...hits] : hits)];
        onSelection(unique);
        say(`${unique.length} element${unique.length === 1 ? "" : "s"} selected.`);
        return;
      }

      if (d.kind === "free") {
        const pts = simplify(freehand, 2.6);
        setFreehand([]);
        if (pts.length > 1) commitPoly(pts);
        return;
      }

      if (d.kind === "box") {
        const b = box;
        setBox(null);
        if (!b || b.w < 6 || b.h < 6) return;
        const node = makeShape(
          d.tool,
          { x: b.x + b.w / 2, y: b.y + b.h / 2 },
          b.w,
          b.h,
          color,
          nextZ(sceneRef.current),
        );
        onScene({ ...sceneRef.current, nodes: [...sceneRef.current.nodes, node] }, "Add shape");
        onSelection([node.id]);
        onToolDone();
        return;
      }

      if (d.kind === "move" || d.kind === "rotate" || d.kind === "scale") {
        onScene(sceneRef.current, d.kind === "move" ? "Move" : d.kind === "rotate" ? "Rotate" : "Scale");
        return;
      }

      if (d.kind === "vertex" || d.kind === "handle") {
        onScene(sceneRef.current, d.kind === "vertex" ? "Move point" : "Curve");
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [
    box,
    color,
    commitPoly,
    draft,
    freehand,
    grid,
    marquee,
    mode,
    onScene,
    onSelection,
    onToolDone,
    point,
    say,
    selection,
    snapped,
    width,
  ]);

  /* --------------------------------------------------------------- keyboard */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      if (e.key === "Escape") {
        if (draft.length) {
          setDraft([]);
          setGhost(null);
          say("Line scrapped.");
        } else if (connectFrom) setConnectFrom(null);
        else if (editing) setEditing(null);
        else onToolDone();
      }
      if (e.key === "Enter" && draft.length) finishDraft();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [connectFrom, draft.length, editing, finishDraft, onToolDone, say]);

  /* ----------------------------------------------------------------- render */

  const drawing = POLY_TOOLS.includes(tool);
  const cursor =
    tool === "select"
      ? mode === "rotate"
        ? "grab"
        : mode === "duplicate"
          ? "copy"
          : "default"
      : tool === "text"
        ? "text"
        : "crosshair";

  const previewPts = ghost && draft.length ? [...draft, ghost] : draft;
  const showHandles = tool === "select" && selection.length > 0 && !dragRef.current;
  const soloPath = selected.length === 1 && selected[0].kind === "path" ? (selected[0] as PathNode) : null;

  return (
    <div className="stage-frame" style={{ width: CANVAS_W * zoom, height: CANVAS_H * zoom }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
        width={CANVAS_W * zoom}
        height={CANVAS_H * zoom}
        style={{ cursor }}
        onDoubleClick={() => (draft.length ? finishDraft() : undefined)}
      >
        <MarkerDefs colors={markerColors} />
        <FieldBackground view={scene.view} losY={scene.losY} />

        <rect
          x={0}
          y={0}
          width={CANVAS_W}
          height={CANVAS_H}
          fill="transparent"
          onPointerDown={onSurfaceDown}
        />

        {/* Grid overlay */}
        {grid > 0 && (
          <g pointerEvents="none" opacity={0.42}>
            {Array.from({ length: Math.floor(CANVAS_W / grid) }, (_, i) => (
              <line key={`gx${i}`} x1={(i + 1) * grid} x2={(i + 1) * grid} y1={0} y2={CANVAS_H} stroke="#C8D8E4" strokeWidth={0.5} />
            ))}
            {Array.from({ length: Math.floor(CANVAS_H / grid) }, (_, i) => (
              <line key={`gy${i}`} x1={0} x2={CANVAS_W} y1={(i + 1) * grid} y2={(i + 1) * grid} stroke="#C8D8E4" strokeWidth={0.5} />
            ))}
          </g>
        )}

        {ordered.map((node) => (
          <NodeLayer
            key={node.id}
            node={node}
            style={{ cursor: node.locked ? "not-allowed" : "move" }}
            onPointerDown={(e) => onNodeDown(e, node)}
            onDoubleClick={(e) => {
              e.stopPropagation();
              if (node.kind === "text") setEditing(node.id);
            }}
          >
            {node.kind === "player" && noteShowsOnHover(node) && <title>{`${node.label || node.name}: ${node.note}`}</title>}
          </NodeLayer>
        ))}

        {/* Selection outline + per-node marks */}
        {tool === "select" &&
          selected.map((n) => {
            const b = worldBox(n);
            return (
              <rect
                key={`sel-${n.id}`}
                x={b.x - 4}
                y={b.y - 4}
                width={b.w + 8}
                height={b.h + 8}
                fill="none"
                stroke={SEL}
                strokeWidth={1.4}
                strokeDasharray="5 4"
                pointerEvents="none"
              />
            );
          })}

        {/* Transform box with scale + rotate handles */}
        {showHandles && selBox && (
          <g>
            <rect
              x={selBox.x - 9}
              y={selBox.y - 9}
              width={selBox.w + 18}
              height={selBox.h + 18}
              fill="none"
              stroke={SEL}
              strokeWidth={1.6}
              pointerEvents="none"
            />
            {HANDLES.map((h) => {
              const hx = selBox.x - 9 + (selBox.w + 18) * h.ax;
              const hy = selBox.y - 9 + (selBox.h + 18) * h.ay;
              return (
                <rect
                  key={h.id}
                  x={hx - 5}
                  y={hy - 5}
                  width={10}
                  height={10}
                  rx={2}
                  fill="#fff"
                  stroke={SEL}
                  strokeWidth={1.8}
                  style={{ cursor: h.cursor }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    beginScale(
                      selection,
                      point(e),
                      { x: selBox.x + selBox.w * (1 - h.ax), y: selBox.y + selBox.h * (1 - h.ay) },
                      h.ax === 0.5,
                      h.ay === 0.5,
                    );
                  }}
                />
              );
            })}
            <line
              x1={selBox.x + selBox.w / 2}
              x2={selBox.x + selBox.w / 2}
              y1={selBox.y - 9}
              y2={selBox.y - 30}
              stroke={SEL}
              strokeWidth={1.6}
              pointerEvents="none"
            />
            <circle
              cx={selBox.x + selBox.w / 2}
              cy={selBox.y - 34}
              r={7}
              fill="#fff"
              stroke={SEL}
              strokeWidth={1.8}
              style={{ cursor: "grab" }}
              onPointerDown={(e) => {
                e.stopPropagation();
                beginRotate(selection, point(e));
              }}
            />
          </g>
        )}

        {/* Bezier nodes and vertices for a single selected line */}
        {soloPath && tool === "select" && (
          <g>
            {soloPath.points.map((pt, i) => {
              const w = toWorld(soloPath, pt);
              return (
                <rect
                  key={`v${i}`}
                  x={w.x - 4}
                  y={w.y - 4}
                  width={8}
                  height={8}
                  fill={SEL}
                  stroke="#fff"
                  strokeWidth={1.4}
                  style={{ cursor: "move" }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    dragRef.current = { kind: "vertex", id: soloPath.id, index: i };
                  }}
                />
              );
            })}
            {soloPath.curve === "bezier" &&
              soloPath.points.map((pt, i) => {
                const h = soloPath.handles[i] ?? { x: 26, y: 0 };
                const base = toWorld(soloPath, pt);
                const tipLocal = { x: pt.x + h.x, y: pt.y + h.y };
                const tip = toWorld(soloPath, tipLocal);
                return (
                  <g key={`h${i}`}>
                    <line x1={base.x} y1={base.y} x2={tip.x} y2={tip.y} stroke={SEL} strokeWidth={1} pointerEvents="none" />
                    <circle
                      cx={tip.x}
                      cy={tip.y}
                      r={5.5}
                      fill="#fff"
                      stroke={SEL}
                      strokeWidth={1.8}
                      style={{ cursor: "grab" }}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        dragRef.current = { kind: "handle", id: soloPath.id, index: i };
                      }}
                    />
                  </g>
                );
              })}
          </g>
        )}

        {/* Live previews */}
        {drawing && previewPts.length > 1 && (
          <path
            d={tool === "motion" ? motionPath(previewPts) : linePreview(previewPts, tool)}
            fill={tool === "zone" || tool === "polygon" ? color : "none"}
            fillOpacity={0.14}
            stroke={color}
            strokeWidth={width}
            strokeDasharray={tool === "dashed" || tool === "zone" ? `${width * 3} ${width * 2.2}` : undefined}
            strokeLinecap="round"
            pointerEvents="none"
            opacity={0.85}
          />
        )}
        {drawing &&
          draft.map((p, i) => (
            <circle key={`d${i}`} cx={p.x} cy={p.y} r={4} fill={i === 0 ? SEL : color} pointerEvents="none" />
          ))}

        {freehand.length > 1 && (
          <path
            d={freehand.map((p, i) => `${i ? "L" : "M"} ${p.x} ${p.y}`).join(" ")}
            fill="none"
            stroke={color}
            strokeWidth={width}
            strokeLinecap="round"
            pointerEvents="none"
          />
        )}

        {box && (
          <rect
            x={box.x}
            y={box.y}
            width={box.w}
            height={box.h}
            fill={color}
            fillOpacity={0.12}
            stroke={color}
            strokeWidth={width}
            pointerEvents="none"
          />
        )}

        {marquee && (
          <rect
            x={marquee.x}
            y={marquee.y}
            width={marquee.w}
            height={marquee.h}
            fill={SEL}
            fillOpacity={0.1}
            stroke={SEL}
            strokeWidth={1.2}
            strokeDasharray="4 3"
            pointerEvents="none"
          />
        )}

        {connectFrom && (() => {
          const n = scene.nodes.find((x) => x.id === connectFrom);
          return n ? <circle cx={n.x} cy={n.y} r={26} fill="none" stroke={SEL} strokeWidth={2.4} strokeDasharray="4 4" pointerEvents="none" /> : null;
        })()}

        {scene.pivot && (
          <g pointerEvents="none">
            <circle cx={scene.pivot.x} cy={scene.pivot.y} r={9} fill="none" stroke="#D24B3E" strokeWidth={2} />
            <line x1={scene.pivot.x - 15} x2={scene.pivot.x + 15} y1={scene.pivot.y} y2={scene.pivot.y} stroke="#D24B3E" strokeWidth={1.6} />
            <line x1={scene.pivot.x} x2={scene.pivot.x} y1={scene.pivot.y - 15} y2={scene.pivot.y + 15} stroke="#D24B3E" strokeWidth={1.6} />
          </g>
        )}

        {/* Scale-mode anchor marker */}
        {mode === "scale" && selBox && (
          <circle
            cx={selBox.x + selBox.w * anchor.ax}
            cy={selBox.y + selBox.h * anchor.ay}
            r={6}
            fill="#D24B3E"
            stroke="#fff"
            strokeWidth={2}
            pointerEvents="none"
          />
        )}

        {/* Inline text editing */}
        {editing && (() => {
          const n = scene.nodes.find((x) => x.id === editing);
          if (!n || n.kind !== "text") return null;
          return (
            <foreignObject x={n.x - 150} y={n.y - 18} width={300} height={36}>
              <input
                autoFocus
                defaultValue={n.text}
                aria-label="Label text"
                style={{
                  width: "100%",
                  height: 34,
                  textAlign: "center",
                  border: `2px solid ${SEL}`,
                  borderRadius: 6,
                  font: `700 ${n.fontSize}px Barlow, sans-serif`,
                }}
                onBlur={(e) => {
                  const text = e.target.value.trim();
                  onScene(
                    {
                      ...sceneRef.current,
                      nodes: sceneRef.current.nodes.map((x) =>
                        x.id === n.id && x.kind === "text" ? { ...x, text: text || "Label" } : x,
                      ),
                    },
                    "Edit text",
                  );
                  setEditing(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  if (e.key === "Escape") setEditing(null);
                }}
              />
            </foreignObject>
          );
        })()}
      </svg>

      {watermark && <div className="stage-watermark">{watermark}</div>}
    </div>
  );
}

const HANDLES = [
  { id: "nw", ax: 0, ay: 0, cursor: "nwse-resize" },
  { id: "n", ax: 0.5, ay: 0, cursor: "ns-resize" },
  { id: "ne", ax: 1, ay: 0, cursor: "nesw-resize" },
  { id: "e", ax: 1, ay: 0.5, cursor: "ew-resize" },
  { id: "se", ax: 1, ay: 1, cursor: "nwse-resize" },
  { id: "s", ax: 0.5, ay: 1, cursor: "ns-resize" },
  { id: "sw", ax: 0, ay: 1, cursor: "nesw-resize" },
  { id: "w", ax: 0, ay: 0.5, cursor: "ew-resize" },
];

const clampScale = (v: number) => {
  const s = Math.max(0.08, Math.min(8, Math.abs(v)));
  return v < 0 ? -s : s;
};

const axisLock = (from: Point, to: Point): Point =>
  Math.abs(to.x - from.x) > Math.abs(to.y - from.y) ? { x: to.x, y: from.y } : { x: from.x, y: to.y };

function linePreview(pts: Point[], tool: ToolId): string {
  const closed = tool === "polygon" || tool === "zone";
  const stub: PathNode = {
    id: "preview",
    kind: "path",
    x: 0,
    y: 0,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    z: 0,
    groupId: null,
    locked: false,
    hidden: false,
    name: "",
    points: pts,
    handles: {},
    style: "solid",
    curve: tool === "zone" || tool === "free" ? "spline" : "straight",
    startCap: "none",
    endCap: "none",
    stroke: "#000",
    width: 2,
    closed,
    fill: "none",
    fillOpacity: 0.1,
    fromId: null,
    toId: null,
  };
  return pathData(stub);
}
