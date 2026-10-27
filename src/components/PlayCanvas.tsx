import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FieldBackground, RuleLinesLayer } from "../lib/field";
import { ruleSet, type RuleLines } from "../lib/rules";
import { DepthLayer, drawOrder, MarkerDefs, NodeLayer, strokeColors } from "../lib/render";
import { noteShowsOnHover } from "../lib/notes";
import {
  boxesOverlap,
  dist,
  motionPath,
  pathData,
  simplify,
  snap,
  straighten,
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
import type { LineLook } from "../lib/scene";
import type { PathNode, Point, Scene, SceneNode } from "../lib/types";
import { CANVAS_H, CANVAS_W } from "../lib/types";
import type { ModeId, ToolId } from "../lib/tools";

const POLY_TOOLS: ToolId[] = ["line", "arc", "dashed", "block", "motion", "polygon", "zone", "pen"];
/** Line tools that can also be drawn by pressing and dragging out the whole route. */
const STROKE_TOOLS: ToolId[] = ["line", "dashed", "block", "motion", "pen"];

/** Drawing aids from the canvas's drawing bar. */
export type DrawAids = { snap: boolean; ortho: boolean; polar: boolean };
const NO_AIDS: DrawAids = { snap: false, ortho: false, polar: false };

/** Tools offered on a right-click of the empty field. */
const MENU_TOOLS: { id: ToolId; label: string }[] = [
  { id: "select", label: "Select" },
  { id: "line", label: "Route arrow" },
  { id: "arc", label: "3-point arc" },
  { id: "dashed", label: "Dashed" },
  { id: "block", label: "Block" },
  { id: "motion", label: "Motion" },
  { id: "free", label: "Freehand" },
  { id: "text", label: "Text" },
];
const SEL = "#0EA2BE";

type Anchor = { ax: number; ay: number };

type Props = {
  scene: Scene;
  selection: string[];
  tool: ToolId;
  mode: ModeId | null;
  color: string;
  width: number;
  /** The Style card's dash, curve and end for the next line, on top of the tool's own look. */
  look?: LineLook;
  grid: number;
  /** Show the yards past the line of scrimmage at each route break. */
  depths?: boolean;
  /** The league's rule lines drawn over the field. */
  rules?: RuleLines;
  anchor: Anchor;
  zoom: number;
  watermark?: string | null;
  onScene: (next: Scene, label?: string) => void;
  onSelection: (ids: string[]) => void;
  /** Back to Select: `placed` after something was drawn or dropped (the Designer may keep the tool out), else Esc. */
  onToolDone: (placed?: boolean) => void;
  onStatus?: (text: string) => void;
  aids?: DrawAids;
  /** How close a click must land to a player for Snap to start or end on him. */
  snapRadius?: number;
  /** The node actually clicked, even when its whole group gets selected. */
  onPickNode?: (id: string) => void;
  /** Picks a tool from the right-click menu. */
  onPickTool?: (tool: ToolId) => void;
  /** What a long press or right-click on a player or line offers (Duplicate, Delete…). */
  nodeActions?: MenuAction[];
  /** Extra items for the empty-field menu (Select all…). */
  fieldActions?: MenuAction[];
  /** Two-finger pinch, Ctrl+scroll or a trackpad pinch: zoom by `factor` around a screen point. */
  onZoom?: (factor: number, focal: { clientX: number; clientY: number }) => void;
  /** Two-finger drag: move the view by this many screen pixels. */
  onPan?: (dx: number, dy: number) => void;
  /** Double-tap on the empty field. */
  onDoubleTap?: (focal: { clientX: number; clientY: number }) => void;
  /**
   * A route tile loaded from the library with nobody picked: the next click
   * places it, on the player clicked or (null) on the empty field there.
   */
  stamp?: { label: string; place: (at: Point, playerId: string | null) => void } | null;
  /** Input that did nothing, for coach tips. */
  onSignal?: (signal: CanvasSignal) => void;
  /** How many points the line being drawn has, so touch screens can show Finish. */
  onDraftChange?: (points: number) => void;
  /** Lets the toolbar finish, step back or scrap the line being drawn. */
  controlRef?: React.MutableRefObject<CanvasControl | null>;
  /** Another play drawn faded under this one ("Vs defense"), lined up on the line of scrimmage. Not clickable. */
  underlay?: Scene | null;
};

/** `section` heads a run of items; `on` marks a current choice (true/false) so the item reads as a checkable option. */
export type MenuAction = { id: string; label: string; run: (at?: Point) => void; danger?: boolean; section?: string; on?: boolean };
export type CanvasSignal = { kind: "emptyTap" | "emptyBox" | "lockedPress"; touch: boolean };
export type CanvasControl = { finish: () => void; undoPoint: () => void; scrap: () => void; cancel: () => void };

/** True on phones and tablets, where a finger needs bigger grab areas than a mouse. */
function useCoarsePointer() {
  const [coarse, setCoarse] = useState(() => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    const on = () => setCoarse(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return coarse;
}

const LONG_PRESS_MS = 500;
const TAP_SLOP = 10;

type Drag =
  | { kind: "move"; start: Point; ids: string[]; origin: Map<string, Point> }
  | { kind: "marquee"; start: Point; additive: boolean; touch: boolean; hadSelection: boolean }
  | { kind: "pan"; start: { x: number; y: number }; last: { x: number; y: number }; moved: boolean; hadSelection: boolean }
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
  look,
  grid,
  depths,
  rules,
  anchor,
  zoom,
  watermark,
  onScene,
  onSelection,
  onToolDone,
  onStatus,
  aids = NO_AIDS,
  snapRadius = 26,
  onPickTool,
  onPickNode,
  nodeActions,
  fieldActions,
  onZoom,
  onPan,
  onDoubleTap,
  onSignal,
  onDraftChange,
  controlRef,
  underlay,
  stamp,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const sceneRef = useRef(scene);
  sceneRef.current = scene;
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const coarse = useCoarsePointer();

  /*
   * Fingers. One finger draws, moves and selects exactly like a mouse. A
   * second finger turns the touch into a pinch/pan of the view and takes back
   * whatever the first finger had started, so zooming never nudges a player.
   */
  /** A line-tool press that may turn into a drawn-by-hand route if the finger moves. */
  const stroke = useRef<{ start: Point; client: { x: number; y: number }; drawing: boolean } | null>(null);
  /** The pointer driving the current drag; other pointers are ignored until it lifts. */
  const activePointer = useRef<number | null>(null);
  /** The scene and selection as they were when the current press began. */
  const pressStart = useRef<{ scene: Scene; selection: string[]; at: number } | null>(null);
  /** The line points as they were before the last tap, so a pinch can take that tap back. */
  const draftBefore = useRef<{ pts: Point[]; at: number } | null>(null);
  const longPress = useRef<{ timer: number; x: number; y: number } | null>(null);
  const lastTap = useRef<{ at: number; x: number; y: number } | null>(null);

  const [draft, setDraft] = useState<Point[]>([]);
  const [ghost, setGhost] = useState<Point | null>(null);
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [freehand, setFreehand] = useState<Point[]>([]);
  const [hovered, setHovered] = useState<string | null>(null);
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const ordered = useMemo(() => drawOrder(scene.nodes), [scene.nodes]);
  const selected = useMemo(() => scene.nodes.filter((n) => selection.includes(n.id)), [scene.nodes, selection]);
  const selBox = useMemo(() => selectionBox(scene, selection), [scene, selection]);
  const markerColors = useMemo(
    () => [...strokeColors(scene.nodes), ...(underlay ? strokeColors(underlay.nodes) : []), color, SEL],
    [scene.nodes, underlay, color],
  );

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

  // The player a line starts on, so the line stays glued to him.
  const startPlayer = useRef<string | null>(null);
  /** The tool menu (empty field) or the element menu (a player or line), placed in frame pixels. */
  const [menu, setMenu] = useState<(Point & { node: boolean; at: Point }) | null>(null);
  const lastPointerType = useRef("mouse");

  /**
   * Opens a menu where the press or click happened. It is fixed to the screen,
   * not the field, so a small field on a phone never clips it.
   */
  const openMenu = useCallback(
    (clientX: number, clientY: number, node: boolean) => {
      setMenu({
        x: Math.max(8, Math.min(clientX, window.innerWidth - 188)),
        y: Math.max(8, Math.min(clientY, window.innerHeight - 300)),
        node,
        // Where on the field the menu was opened, for "Paste here".
        at: point({ clientX, clientY }),
      });
    },
    [point],
  );

  /**
   * Where a drawing click lands: on a player's center with Snap on, else on
   * the grid; then square to the last point (Ortho, or Shift) or to the
   * nearest 45° (Polar).
   */
  const aim = useCallback(
    (raw: Point, from: Point | null, shift = false): { p: Point; player: string | null } => {
      if (aids.snap) {
        let best: SceneNode | null = null;
        let bestD = snapRadius;
        for (const n of sceneRef.current.nodes)
          if (n.kind === "player" && !n.hidden) {
            const d = dist(raw, n);
            if (d < bestD) {
              bestD = d;
              best = n;
            }
          }
        if (best) return { p: { x: best.x, y: best.y }, player: best.id };
      }
      let p = snapped(raw);
      if (from && (aids.ortho || shift)) p = axisLock(from, p);
      else if (from && aids.polar) p = polarLock(from, p);
      return { p, player: null };
    },
    [aids.snap, aids.ortho, aids.polar, snapped, snapRadius],
  );

  /* ---------------------------------------------------------------- drawing */

  const commitPoly = useCallback(
    (pts: Point[]) => {
      if (pts.length < 2) {
        setDraft([]);
        return;
      }
      const origin = pts[0];
      const local = pts.map((p) => ({ x: p.x - origin.x, y: p.y - origin.y }));
      const made = makePath(tool, origin, local, color, width, nextZ(sceneRef.current));
      // Zones and polygons are areas, so the line look only shapes open lines.
      const node = { ...made, ...(made.closed ? {} : look), fromId: startPlayer.current };
      startPlayer.current = null;
      onScene({ ...sceneRef.current, nodes: [...sceneRef.current.nodes, node] }, `Draw ${node.name}`);
      onSelection([node.id]);
      setDraft([]);
      setGhost(null);
      say(
        lastPointerType.current === "mouse"
          ? `${node.name} drawn. Keep clicking to draw another, or press Escape when you're done.`
          : `${node.name} drawn. Keep tapping to draw another, or tap Select when you're done.`,
      );
      onToolDone(true);
    },
    [tool, color, width, look, onScene, onSelection, say, onToolDone],
  );

  const finishDraft = useCallback(() => {
    if (draft.length) commitPoly(draft);
  }, [draft, commitPoly]);

  const draftRef = useRef(draft);
  draftRef.current = draft;
  /** Finish button, long press or double-tap: end the line where it is. */
  const finishLine = () => {
    const pts = draftRef.current;
    if (tool === "arc" && pts.length < 3) {
      setDraft([]);
      setGhost(null);
      say("A 3-point arc needs three taps: where it starts, a point it passes through, and where it ends. Start again from the first one.");
      return;
    }
    commitPoly(pts);
  };

  useEffect(() => onDraftChange?.(draft.length), [draft.length, onDraftChange]);
  if (controlRef)
    controlRef.current = {
      finish: finishLine,
      undoPoint: () => {
        setDraft((d) => d.slice(0, -1));
        setGhost(null);
      },
      scrap: () => {
        setDraft([]);
        setGhost(null);
        startPlayer.current = null;
        say("Line scrapped.");
      },
      cancel: () => {
        cancelGesture();
        setMenu(null);
      },
    };

  /* ------------------------------------------------------------ drag starts */

  const beginMove = (ids: string[], start: Point) => {
    const origin = new Map<string, Point>();
    for (const n of sceneRef.current.nodes) if (ids.includes(n.id)) origin.set(n.id, { x: n.x, y: n.y });
    // Lines that start on a moving player go with him (one-ended lines; auto-connect lines re-fit themselves).
    const moving = new Set(ids);
    for (const n of sceneRef.current.nodes)
      if (n.kind === "path" && !n.toId && !origin.has(n.id) && ((n.fromId && moving.has(n.fromId)) || (n.assignOf && moving.has(n.assignOf))))
        origin.set(n.id, { x: n.x, y: n.y });
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

  const clearLongPress = () => {
    if (!longPress.current) return;
    window.clearTimeout(longPress.current.timer);
    longPress.current = null;
  };

  /**
   * Takes back whatever the current press started (a move, a box, a line
   * point), as if the finger had never touched down. Used when a second finger
   * turns the touch into a pinch, and before a long-press menu opens.
   */
  const cancelGesture = () => {
    dragRef.current = null;
    stroke.current = null;
    activePointer.current = null;
    clearLongPress();
    setMarquee(null);
    setFreehand([]);
    setBox(null);
    const start = pressStart.current;
    pressStart.current = null;
    if (start && Date.now() - start.at < 1500) {
      if (sceneRef.current !== start.scene) onScene(start.scene);
      const sel = selectionRef.current;
      if (sel.length !== start.selection.length || sel.some((id, i) => id !== start.selection[i])) onSelection(start.selection);
    }
    const before = draftBefore.current;
    draftBefore.current = null;
    if (before && Date.now() - before.at < 1500) {
      setDraft(before.pts);
      setGhost(null);
      if (!before.pts.length) startPlayer.current = null;
    }
  };

  /** A press is starting: note how things were, and watch for a long press from a finger or pen. */
  const beginPress = (e: React.PointerEvent, onLong?: () => void) => {
    lastPointerType.current = e.pointerType;
    activePointer.current = e.pointerId;
    pressStart.current = { scene: sceneRef.current, selection: selectionRef.current, at: Date.now() };
    draftBefore.current = null;
    clearLongPress();
    if (e.pointerType === "mouse" || !onLong) return;
    longPress.current = {
      x: e.clientX,
      y: e.clientY,
      timer: window.setTimeout(() => {
        longPress.current = null;
        onLong();
      }, LONG_PRESS_MS),
    };
  };

  /** Two quick taps in the same spot from a finger. */
  const isDoubleTap = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse") return false;
    const now = Date.now();
    const prev = lastTap.current;
    const hit = !!prev && now - prev.at < 320 && Math.hypot(e.clientX - prev.x, e.clientY - prev.y) < 30;
    lastTap.current = hit ? null : { at: now, x: e.clientX, y: e.clientY };
    return hit;
  };

  /* ------------------------------------------------------------- node input */

  const onNodeDown = (e: React.PointerEvent, node: SceneNode) => {
    if (editing || e.button === 2) return;
    // While drawing, a click on a player (or anything) adds a point there.
    if (POLY_TOOLS.includes(tool)) {
      e.stopPropagation();
      addPoint(e);
      return;
    }
    if (node.locked) {
      if (tool === "select") onSignal?.({ kind: "lockedPress", touch: e.pointerType !== "mouse" });
      return;
    }
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const p = point(e);
    if (tool !== "select") lastPointerType.current = e.pointerType;

    if (tool === "connect") {
      if (node.kind !== "player") {
        say("Auto-connect joins two players. Click a player to start.");
        return;
      }
      if (!connectFrom) {
        setConnectFrom(node.id);
        say(`Started at ${node.name || node.label}. Click the second player to join them.`);
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
      say("Connected. Move either player and the line follows.");
      onToolDone(true);
      return;
    }

    if (tool !== "select") return;

    // A loaded route tile goes to the player clicked (or, on a line or shape, to that spot).
    if (stamp) {
      stamp.place(node.kind === "player" ? { x: node.x, y: node.y } : p, node.kind === "player" ? node.id : null);
      return;
    }

    // Holding a finger on a player or line opens its menu (Duplicate, Delete…), the touch right-click.
    const at = { x: e.clientX, y: e.clientY };
    beginPress(e, () => {
      cancelGesture();
      onSelection(resolveSelection(sceneRef.current, node.id, false));
      if (nodeActions?.length) openMenu(at.x, at.y, true);
    });

    onPickNode?.(node.id);
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
      // A second press on a player whose formation is already selected picks just
      // that player, so a coach can drag one receiver without moving the set.
      const groupSelected =
        node.kind === "player" && ids.length > 1 && selection.length === ids.length && ids.every((id) => selection.includes(id));
      nextIds = groupSelected ? [node.id] : selection.includes(node.id) ? selection : ids;
      onSelection(nextIds);
      if (groupSelected) say(`Moving ${node.label || node.name || "this player"} by itself. To move the whole formation, click the field first, then drag any player.`);
    }
    beginMove(nextIds, p);
  };

  /* -------------------------------------------------------- surface  input */

  const onSurfaceDown = (e: React.PointerEvent) => {
    // Right-click is handled by the context menu (finish the line, or the tool menu).
    if (e.button === 2) return;
    setMenu(null);
    if (editing) {
      setEditing(null);
      return;
    }
    const raw = point(e);
    const p = snapped(raw);
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);

    if (tool === "select" && stamp) {
      stamp.place(p, null);
      return;
    }
    if (tool === "select") {
      if (isDoubleTap(e)) {
        onDoubleTap?.({ clientX: e.clientX, clientY: e.clientY });
        return;
      }
      // Holding a finger on the empty field opens the tool menu, the touch right-click.
      const at = { x: e.clientX, y: e.clientY };
      beginPress(e, onPickTool ? () => (cancelGesture(), openMenu(at.x, at.y, false)) : undefined);
      // A finger dragged across empty field moves the view; the selection box is for
      // Multi-select mode (or "Select with a box" in the press-and-hold menu).
      if (e.pointerType !== "mouse" && mode !== "multiSelect") {
        dragRef.current = { kind: "pan", start: at, last: at, moved: false, hadSelection: selection.length > 0 };
        return;
      }
      dragRef.current = {
        kind: "marquee",
        start: raw,
        additive: mode === "multiSelect" || e.shiftKey,
        touch: e.pointerType !== "mouse",
        hadSelection: selection.length > 0,
      };
      setMarquee({ x: raw.x, y: raw.y, w: 0, h: 0 });
      return;
    }

    if (!POLY_TOOLS.includes(tool)) beginPress(e);

    if (tool === "pivot") {
      onScene({ ...sceneRef.current, pivot: p }, "Pivot point");
      onToolDone(true);
      say("Pivot dropped. Rotate Mode now spins around it. Drop another anywhere to move it.");
      return;
    }

    if (tool === "text") {
      const node = makeText(p, "New label", "#0B1524", nextZ(sceneRef.current));
      onScene({ ...sceneRef.current, nodes: [...sceneRef.current.nodes, node] }, "Add text");
      onSelection([node.id]);
      setEditing(node.id);
      onToolDone(true);
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

    if (POLY_TOOLS.includes(tool)) addPoint(e);
  };

  /** One click of a line tool: snap it, then add it to the line being drawn. */
  const addPoint = (e: React.PointerEvent) => {
    if (e.button === 2) return;
    // A finger double-tap ends the line, since iPhones and iPads don't send a double-click.
    if (isDoubleTap(e) && draft.length >= 2 && tool !== "arc") {
      commitPoly(draft);
      return;
    }
    // Holding the finger down ends the line on that point; held before the first point, it opens the tool menu.
    const at = { x: e.clientX, y: e.clientY };
    const before = draft;
    beginPress(e, () => {
      activePointer.current = null;
      if (before.length) finishLine();
      else if (onPickTool) {
        cancelGesture();
        openMenu(at.x, at.y, false);
      }
    });
    draftBefore.current = { pts: before, at: Date.now() };
    const last = draft.length ? draft[draft.length - 1] : null;
    const { p, player } = aim(point(e), last, e.shiftKey);
    // Close a polygon by clicking back on the first point.
    if (draft.length > 2 && dist(p, draft[0]) < 14) {
      commitPoly([...draft, draft[0]]);
      return;
    }
    if (!draft.length) {
      startPlayer.current = player;
      // If the finger (or mouse) keeps moving from here, the route is drawn by hand instead of tap by tap.
      if (STROKE_TOOLS.includes(tool)) stroke.current = { start: p, client: { x: e.clientX, y: e.clientY }, drawing: false };
    }
    if (tool === "arc" && draft.length === 2) {
      commitPoly([draft[0], draft[1], p]);
      return;
    }
    setDraft((d) => [...d, p]);
    setGhost(p);
    if (draft.length === 0)
      say(
        e.pointerType === "mouse"
          ? tool === "arc"
            ? "Now click a point the curve passes through, then where it ends."
            : "Click each turn in the line. Double-click, press Enter or right-click to finish; Escape scraps it."
          : tool === "arc"
            ? "Now tap a point the curve passes through, then where it ends."
            : "Tap each turn in the route. Double-tap the last point, hold it, or tap Finish line to end it.",
      );
  };

  /* ------------------------------------------------------------ move  / up */

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const lp = longPress.current;
      if (lp && Math.hypot(e.clientX - lp.x, e.clientY - lp.y) > TAP_SLOP) clearLongPress();
      // Only the finger (or mouse) that started the drag drives it.
      if (activePointer.current !== null && e.pointerId !== activePointer.current) return;
      const d = dragRef.current;
      const raw = point(e);

      // One finger on the empty field moves the view, the way a map does.
      if (d?.kind === "pan") {
        const dx = e.clientX - d.last.x;
        const dy = e.clientY - d.last.y;
        if (!d.moved && Math.hypot(e.clientX - d.start.x, e.clientY - d.start.y) > TAP_SLOP) d.moved = true;
        if (d.moved) onPan?.(dx, dy);
        d.last = { x: e.clientX, y: e.clientY };
        return;
      }

      // Pressing on a player with a line tool and dragging draws the route by hand.
      const st = stroke.current;
      if (!d && st && activePointer.current === e.pointerId) {
        if (!st.drawing && Math.hypot(e.clientX - st.client.x, e.clientY - st.client.y) > 14) {
          st.drawing = true;
          clearLongPress();
          setFreehand([st.start]);
        }
        if (st.drawing) {
          setFreehand((pts) => [...pts, raw]);
          return;
        }
      }

      if (!d) {
        if (draft.length) setGhost(aim(raw, draft[draft.length - 1], e.shiftKey).p);
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

    const onUp = (e: PointerEvent) => {
      clearLongPress();
      if (activePointer.current !== null && e.pointerId !== activePointer.current) return;
      activePointer.current = null;
      const d = dragRef.current;
      dragRef.current = null;

      // A drawn-by-hand route: straighten the finger's path into clean legs and finish it.
      const st = stroke.current;
      stroke.current = null;
      if (st?.drawing) {
        // Wobble under about 7 screen pixels is a shaky finger, not a cut in the route.
        const pts = straighten([st.start, ...freehand.slice(1)], Math.max(8, 7 / zoom));
        setFreehand([]);
        if (pts.length > 1 && dist(pts[0], pts[pts.length - 1]) > 12) commitPoly(pts);
        else {
          setDraft([]);
          setGhost(null);
        }
        return;
      }

      if (!d) return;

      if (d.kind === "pan") {
        if (d.moved) return;
        // A tap, not a drag: clears the selection like a click on the empty field.
        onSelection([]);
        if (!d.hadSelection) onSignal?.({ kind: "emptyTap", touch: true });
        return;
      }

      if (d.kind === "marquee") {
        const m = marquee;
        setMarquee(null);
        if (!m || m.w < 4 || m.h < 4) {
          if (!d.additive) onSelection([]);
          if (!d.hadSelection) onSignal?.({ kind: "emptyTap", touch: d.touch });
          return;
        }
        const hits = sceneRef.current.nodes
          .filter((n) => !n.hidden && !n.locked && boxesOverlap(worldBox(n), m))
          .flatMap((n) => resolveSelection(sceneRef.current, n.id, mode === "clickThrough"));
        const unique = [...new Set(d.additive ? [...selection, ...hits] : hits)];
        onSelection(unique);
        say(`${unique.length} element${unique.length === 1 ? "" : "s"} selected.`);
        if (!hits.length && d.touch) onSignal?.({ kind: "emptyBox", touch: true });
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
        onToolDone(true);
        return;
      }

      if (d.kind === "move" || d.kind === "rotate" || d.kind === "scale") {
        // A tap that only selected something is not a step to undo.
        const changed = !pressStart.current || sceneRef.current !== pressStart.current.scene;
        if (changed) onScene(sceneRef.current, d.kind === "move" ? "Move" : d.kind === "rotate" ? "Rotate" : "Scale");
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
    aim,
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
    onPan,
    onZoom,
    onSignal,
    point,
    say,
    selection,
    snapped,
    width,
    zoom,
  ]);

  /* ------------------------------------------- pinch, trackpad and Ctrl+scroll */

  /* Two-finger pinch and pan are handled by the designer page for the whole field area
     (see Builder), which takes back this canvas's press through controlRef.cancel. */
  const onFrameDownCapture = (e: React.PointerEvent) => {
    lastPointerType.current = e.pointerType;
  };

  const zoomRef = useRef(onZoom);
  zoomRef.current = onZoom;
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    // A laptop trackpad pinch arrives as Ctrl+scroll in Chrome and Edge.
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      zoomRef.current?.(Math.exp(-e.deltaY * 0.01), { clientX: e.clientX, clientY: e.clientY });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => () => clearLongPress(), []);

  /* --------------------------------------------------------------- keyboard */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      if (e.key === "Escape") {
        if (menu) setMenu(null);
        else if (draft.length) {
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
  }, [connectFrom, draft.length, editing, finishDraft, menu, onToolDone, say]);

  /** Right-click: finish the line being drawn, or open the tool menu on the empty field. */
  const onContext = (e: React.MouseEvent) => {
    e.preventDefault();
    // A finger's long press opens its own menu (Android sends this event as well).
    if (lastPointerType.current !== "mouse") return;
    if (draft.length) {
      if (tool === "arc" && draft.length < 3) {
        setDraft([]);
        setGhost(null);
        say("A 3-point arc needs three clicks. Start again from where the route begins.");
        return;
      }
      finishDraft();
      return;
    }
    if (!onPickTool) return;
    openMenu(e.clientX, e.clientY, false);
  };

  /** Right-click on a player or line: its menu (Duplicate, Delete…) instead of the tool menu. */
  const onNodeContext = (e: React.MouseEvent, node: SceneNode) => {
    if (tool !== "select" || draft.length || node.locked || !nodeActions?.length) return;
    e.preventDefault();
    e.stopPropagation();
    if (lastPointerType.current !== "mouse") return;
    if (!selection.includes(node.id)) onSelection(resolveSelection(sceneRef.current, node.id, mode === "clickThrough"));
    openMenu(e.clientX, e.clientY, true);
  };

  /* ----------------------------------------------------------------- render */

  const drawing = POLY_TOOLS.includes(tool);
  const cursor =
    tool === "select"
      ? stamp
        ? "crosshair"
        : mode === "rotate"
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
  // What the selection belongs to, drawn so a coach can see what will move together:
  // the whole group framed and labelled, or one player picked out of a group, and the
  // routes glued to any selected player.
  const groupInfo = (() => {
    if (tool !== "select" || !selected.length) return null;
    const gid = selected[0].groupId;
    if (!gid || !selected.every((n) => n.groupId === gid)) return null;
    const members = scene.nodes.filter((n) => n.groupId === gid && !n.hidden);
    const box = selectionBox(scene, members.map((n) => n.id));
    if (!box) return null;
    const whole = members.length === selected.length;
    if (!whole && selected.length !== 1) return null;
    const players = members.filter((n) => n.kind === "player").length;
    return { box, whole, label: whole ? `GROUP · ${players || members.length} ${players ? "PLAYERS" : "ITEMS"}` : "ONE PICKED FROM A GROUP" };
  })();
  const selectedPlayerIds = new Set(selected.filter((n) => n.kind === "player").map((n) => n.id));
  const linkedPaths =
    tool === "select" && selectedPlayerIds.size
      ? scene.nodes.filter(
          (n): n is PathNode =>
            n.kind === "path" && !n.hidden && !selection.includes(n.id) && ((!!n.fromId && selectedPlayerIds.has(n.fromId)) || (!!n.assignOf && selectedPlayerIds.has(n.assignOf))),
        )
      : [];
  const tagSize = Math.max(11, Math.min(30, 12 / zoom));

  // Invisible finger-sized reach around the small handles, kept small enough
  // on a tight selection that it never covers the players inside it.
  const fingerReach = coarse && selBox ? Math.max(0, Math.min(22 / zoom, 30, 9 + Math.min(selBox.w, selBox.h) / 4)) : 0;
  const pointReach = coarse ? Math.min(20 / zoom, 22) : 0;

  return (
    <div
      ref={frameRef}
      className="stage-frame"
      style={{ width: CANVAS_W * zoom, height: CANVAS_H * zoom }}
      onPointerDownCapture={onFrameDownCapture}
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
        width={CANVAS_W * zoom}
        height={CANVAS_H * zoom}
        style={{ cursor }}
        onDoubleClick={() => (draft.length ? finishDraft() : undefined)}
        onContextMenu={onContext}
      >
        <MarkerDefs colors={markerColors} />
        <FieldBackground view={scene.view} losY={scene.losY} />
        {rules?.on && <RuleLinesLayer view={scene.view} losY={scene.losY} rush={rules.rush} noRun={rules.noRun} midfield={ruleSet(rules.set).midfieldNoRun} />}

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

        {underlay && (
          <g pointerEvents="none" opacity={0.36} transform={`translate(0 ${scene.losY - underlay.losY})`} aria-hidden="true">
            {drawOrder(underlay.nodes).map((node) => (
              <NodeLayer key={`under-${node.id}`} node={node} />
            ))}
          </g>
        )}

        {ordered.map((node) => (
          <NodeLayer
            key={node.id}
            node={node}
            style={{ cursor: node.locked ? "not-allowed" : "move" }}
            onPointerDown={(e) => onNodeDown(e, node)}
            onContextMenu={(e) => onNodeContext(e, node)}
            onDoubleClick={(e) => {
              e.stopPropagation();
              if (node.kind === "text") setEditing(node.id);
            }}
          >
            {node.kind === "player" && noteShowsOnHover(node) && <title>{`${node.label || node.name}: ${node.note}`}</title>}
          </NodeLayer>
        ))}

        {depths && <DepthLayer scene={scene} />}

        {/* Players: a grab area bigger than the token (about 18px on screen, but never far past the token so neighbours stay separate)
            and a ring on hover, so a coach can see what they are about to move. */}
        {tool === "select" &&
          ordered.map((node) => {
            if (node.kind !== "player" || node.hidden) return null;
            const b = worldBox(node);
            const cx = b.x + b.w / 2;
            const cy = b.y + b.h / 2;
            const half = Math.max(b.w, b.h) / 2;
            const isHover = hovered === node.id && !dragRef.current;
            return (
              <g key={`grab-${node.id}`}>
                {isHover && (
                  <circle cx={cx} cy={cy} r={half + 5} fill={SEL} fillOpacity={0.12} stroke={SEL} strokeWidth={2} pointerEvents="none" />
                )}
                <circle
                  cx={cx}
                  cy={cy}
                  // A fingertip covers about 44px, so touch screens get a wider reach than a mouse.
                  r={coarse ? Math.min(Math.max(half + 8, 22 / zoom), half + 20) : Math.min(Math.max(half + 6, 18 / zoom), half + 12)}
                  fill="transparent"
                  style={{ cursor: node.locked ? "not-allowed" : "move" }}
                  onPointerEnter={(e) => e.pointerType === "mouse" && setHovered(node.id)}
                  onPointerLeave={() => setHovered((h) => (h === node.id ? null : h))}
                  onPointerDown={(e) => onNodeDown(e, node)}
                  onContextMenu={(e) => onNodeContext(e, node)}
                >
                  <title>{noteShowsOnHover(node) ? `${node.label || node.name}: ${node.note}` : `Drag to move ${node.label || node.name || "this player"}`}</title>
                </circle>
              </g>
            );
          })}

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

        {/* Routes that move with the selected player(s) */}
        {linkedPaths.map((p) => (
          <NodeLayer key={`link-${p.id}`} node={{ ...p, stroke: SEL, width: p.width + 7, firstRead: false }} opacity={0.32} pointerEvents="none" />
        ))}

        {/* The group the selection belongs to */}
        {groupInfo && (
          <g pointerEvents="none">
            <rect
              x={groupInfo.box.x - 16}
              y={groupInfo.box.y - 16}
              width={groupInfo.box.w + 32}
              height={groupInfo.box.h + 32}
              rx={10}
              fill={groupInfo.whole ? SEL : "none"}
              fillOpacity={0.05}
              stroke={groupInfo.whole ? SEL : "#7d8fa3"}
              strokeWidth={groupInfo.whole ? 2 : 1.4}
              strokeDasharray={groupInfo.whole ? "10 6" : "4 5"}
            />
            <g transform={`translate(${groupInfo.box.x - 16} ${Math.max(0, groupInfo.box.y - 16 - tagSize * 1.7)})`}>
              <rect width={groupInfo.label.length * tagSize * 0.62 + tagSize} height={tagSize * 1.6} rx={tagSize * 0.3} fill={groupInfo.whole ? SEL : "#7d8fa3"} />
              <text x={tagSize * 0.5} y={tagSize * 1.12} fontSize={tagSize} fontWeight={700} fill="#0B1524" fontFamily="'IBM Plex Mono', monospace">
                {groupInfo.label}
              </text>
            </g>
          </g>
        )}

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
              const grab = (e: React.PointerEvent) => {
                e.stopPropagation();
                beginPress(e);
                beginScale(
                  selection,
                  point(e),
                  { x: selBox.x + selBox.w * (1 - h.ax), y: selBox.y + selBox.h * (1 - h.ay) },
                  h.ax === 0.5,
                  h.ay === 0.5,
                );
              };
              return (
                <g key={h.id} style={{ cursor: h.cursor }}>
                  <rect x={hx - 5} y={hy - 5} width={10} height={10} rx={2} fill="#fff" stroke={SEL} strokeWidth={1.8} onPointerDown={grab} />
                  {/* Side handles are skipped for fingers on small selections, where they would crowd the corners. */}
                  {fingerReach > 0 && (h.ax !== 0.5 && h.ay !== 0.5 ? true : Math.min(selBox.w, selBox.h) > fingerReach * 3) && (
                    <circle cx={hx} cy={hy} r={fingerReach} fill="transparent" onPointerDown={grab} />
                  )}
                </g>
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
              r={Math.max(7, pointReach)}
              fill="transparent"
              style={{ cursor: "grab" }}
              onPointerDown={(e) => {
                e.stopPropagation();
                beginPress(e);
                beginRotate(selection, point(e));
              }}
            />
            <circle cx={selBox.x + selBox.w / 2} cy={selBox.y - 34} r={7} fill="#fff" stroke={SEL} strokeWidth={1.8} pointerEvents="none" />
          </g>
        )}

        {/* Bezier nodes and vertices for a single selected line */}
        {soloPath && tool === "select" && (
          <g>
            {soloPath.points.map((pt, i) => {
              // A start glued to a player has no handle, so clicking the player still moves him.
              if (i === 0 && (soloPath.fromId || soloPath.assignOf)) return null;
              const w = toWorld(soloPath, pt);
              const grab = (e: React.PointerEvent) => {
                e.stopPropagation();
                beginPress(e);
                dragRef.current = { kind: "vertex", id: soloPath.id, index: i };
              };
              return (
                <g key={`v${i}`} style={{ cursor: "move" }}>
                  {pointReach > 0 && <circle cx={w.x} cy={w.y} r={pointReach} fill="transparent" onPointerDown={grab} />}
                  <rect x={w.x - 4} y={w.y - 4} width={8} height={8} fill={SEL} stroke="#fff" strokeWidth={1.4} onPointerDown={grab} />
                </g>
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
                      r={Math.max(5.5, pointReach)}
                      fill="transparent"
                      style={{ cursor: "grab" }}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        beginPress(e);
                        dragRef.current = { kind: "handle", id: soloPath.id, index: i };
                      }}
                    />
                    <circle cx={tip.x} cy={tip.y} r={5.5} fill="#fff" stroke={SEL} strokeWidth={1.8} pointerEvents="none" />
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
            strokeDasharray={
              (look?.style ?? (tool === "dashed" || tool === "zone" ? "dashed" : "solid")) === "dashed"
                ? `${width * 3} ${width * 2.2}`
                : look?.style === "dotted"
                  ? `0 ${width * 2}`
                  : undefined
            }
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

        {/* Which guide is shaping the line, beside the cursor (canvas: "45° POLAR") */}
        {drawing && ghost && draft.length > 0 && (aids.ortho || aids.polar) && (
          <g pointerEvents="none" transform={`translate(${Math.min(ghost.x + 14, CANVAS_W - 96)} ${Math.max(ghost.y - 30, 6)})`}>
            <rect width={aids.ortho ? 58 : 82} height={20} rx={3} fill="#0B1524" />
            <text x={8} y={14} fontFamily="'IBM Plex Mono', monospace" fontSize={11} fill={SEL}>
              {aids.ortho ? "ORTHO" : "45° POLAR"}
            </text>
          </g>
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

      {menu && (
        <>
          {/* A tap anywhere else closes the menu without doing anything. */}
          <div className="stage-menu-scrim" onPointerDown={() => setMenu(null)} aria-hidden="true" />
          {menu.node && nodeActions?.length ? (
            <div
              className="stage-menu is-wide"
              role="menu"
              aria-label="Selected element"
              style={{ left: menu.x, top: menu.y, maxHeight: `calc(100dvh - ${menu.y}px - 8px)` }}
            >
              {nodeActions.map((a, i) => (
                <Fragment key={a.id}>
                  {a.section && a.section !== nodeActions[i - 1]?.section && (
                    <div className="stage-menu-head" role="presentation">
                      {a.section}
                    </div>
                  )}
                  <button
                    type="button"
                    role={a.on === undefined ? "menuitem" : "menuitemcheckbox"}
                    aria-checked={a.on}
                    className={`${a.danger ? "is-danger" : ""}${a.on ? " is-on" : ""}`}
                    autoFocus={i === 0}
                    onClick={() => {
                      setMenu(null);
                      a.run(menu.at);
                    }}
                  >
                    {a.on !== undefined && <span className="stage-menu-tick" aria-hidden="true">{a.on ? "✓" : ""}</span>}
                    {a.label}
                  </button>
                </Fragment>
              ))}
            </div>
          ) : onPickTool ? (
            <div className="stage-menu" role="menu" aria-label="Tools" style={{ left: menu.x, top: menu.y }}>
              {MENU_TOOLS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={tool === t.id}
                  className={tool === t.id ? "is-on" : ""}
                  autoFocus={tool === t.id}
                  onClick={() => {
                    setMenu(null);
                    onPickTool(t.id);
                  }}
                >
                  {t.label}
                </button>
              ))}
              {fieldActions?.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  role="menuitem"
                  className="is-extra"
                  onClick={() => {
                    setMenu(null);
                    a.run(menu.at);
                  }}
                >
                  {a.label}
                </button>
              ))}
            </div>
          ) : null}
        </>
      )}

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

/** Keeps the length but turns the segment to the nearest 45°. */
const polarLock = (from: Point, to: Point): Point => {
  const len = Math.hypot(to.x - from.x, to.y - from.y);
  const step = Math.PI / 4;
  const a = Math.round(Math.atan2(to.y - from.y, to.x - from.x) / step) * step;
  return { x: from.x + Math.cos(a) * len, y: from.y + Math.sin(a) * len };
};

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
    curve: tool === "zone" || tool === "free" || tool === "arc" ? "spline" : "straight",
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
