import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Icon } from "../components/Icon";
import { Tooltip } from "../components/Tooltip";
import { PlayCanvas, type CanvasControl, type CanvasSignal, type DrawAids, type MenuAction } from "../components/PlayCanvas";
import { CoachTip } from "../components/CoachTip";
import { ToolsGuide, type GuideTool } from "../components/ToolsGuide";
import { DesignerTour, tourSeen } from "../components/DesignerTour";
import { RAIL_GROUPS, useToolPrefs } from "../lib/toolPrefs";
import { coachTips, useTipsEnabled } from "../lib/coachTips";
import { Inspector } from "../components/Inspector";
import { ExportDialog } from "../components/ExportDialog";
import { Mark } from "../components/Shell";
import { TokenGlyph } from "../components/TokenGlyph";
import { FormationLibrary } from "../components/FormationLibrary";
import { PlaySetup } from "../components/PlaySetup";
import { PlaybookTree } from "../components/PlaybookTree";
import { RAIL_TABS, RailGroup, railStore, useRailTab, type RailTab } from "../components/RailGroup";
import { StyleCard } from "../components/StyleCard";
import { FloatingToolbar, READS, type ReadId } from "../components/FloatingToolbar";
import { RouteLibrary } from "../components/RouteLibrary";
import { FormatPanel } from "../components/FormatPanel";
import { RunPlay } from "../components/RunPlay";
import { applyFormat, formatStore, usePlayFormat } from "../lib/playFormat";
import { applyTile, exchangeLine, MORE_TILES, FIVE_SET, OUR_TREE, placeTile, playerAt, type Tile } from "../lib/routeLibrary";
import { copyNodes, hasClipboard, pasteNodes } from "../lib/clipboard";
import { DefenseLibrary } from "../components/DefenseLibrary";
import { GriddyComposer, useGriddyDrawer } from "../components/Griddy";
import type { AssistantRead } from "../lib/assistant";
import { FIELD_VIEWS } from "../lib/field";
import { LINE_TOOLS, MODES, SHAPE_TOOLS, type ModeId, type ToolId } from "../lib/tools";
import {
  DEFENSE_TOKENS,
  emptyScene,
  makePlayer,
  type TokenPreset,
} from "../lib/presets";
import {
  addGhost,
  bendAroundPlayers,
  canReshape,
  cleanUpPaths,
  cloneNodes,
  describe,
  extendToSideline,
  flipNodes,
  nextZ,
  reconcileConnections,
  removeGhost,
  reshapeAll,
  sendToBack,
  smoothPaths,
  snapPathsToPlayers,
  stopAtLos,
  straightenPaths,
  toolLook,
  type LineLook,
} from "../lib/scene";
import { CANVAS_H, CANVAS_W, DEFAULT_STROKE, PALETTE, STROKE_WEIGHTS, uid } from "../lib/types";
import type { PathNode, PlayMeta, PlayerNode, Point, Scene, SceneNode, StoredPlay } from "../lib/types";
import { store, useStore } from "../lib/store";
import { lookName, lookScene, overlayStore, parseLook, useOverlay } from "../lib/overlay";
import { unitsPerYard } from "../lib/field";
import { convertField } from "../lib/fieldConvert";
import { editScene, swapSides } from "../lib/bulkEdit";
import { savePlays } from "../lib/griddyVault";
import { loadRules, saveRules, type RuleLines } from "../lib/rules";
import { useFieldPrefs } from "../lib/fieldPrefs";
import { FieldControls } from "../components/FieldControls";
import { api, toStoredPlay } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useTier } from "../lib/tier";
import { gateSave, gateTool } from "../lib/plan";
import { useToast } from "../lib/toast";
import { copyStyle, pasteStyle, styleClip } from "../lib/styleCopy";
import { useCaptureGuard } from "../lib/guard";
import { track } from "../lib/track";
import { usePositionTokens } from "../lib/positions";
import { isLineman, tokenFor, type Placed } from "../lib/formations";
import { defenseNodes, describeDefense, layoutDefense, type Coverage, type Front } from "../lib/defense";
import { fileNewPlay, fileTarget, lastChoice, rememberChoice, setSetupWanted, setupScene, setupWanted, type FileTarget, type SetupChoice } from "../lib/playSetup";
import { loadWork, rememberWork, workTabs } from "../lib/workTabs";
import { WorkTabs } from "../components/WorkTabs";
import { letterColor } from "../lib/colors";
import "../styles/designer.css";

const blankMeta: PlayMeta = {
  name: "",
  formation: "",
  playType: "pass",
  personnel: "",
  description: "",
  tags: [],
  isPublic: false,
};

const HANDOFF = MORE_TILES.find((t) => t.id === "handoff")!;
const PITCH = MORE_TILES.find((t) => t.id === "pitch")!;

const ANCHOR_ROW: Record<number, string> = { 0: "top", 0.5: "middle", 1: "bottom" };
const ANCHOR_COL: Record<number, string> = { 0: "left", 0.5: "centre", 1: "right" };

/* Tool rail, grouped and labelled as on the Grid1ron Design canvas. */
/** Tools that draw lines; the drawing bar shows while one is out. */
const DRAW_TOOLS: ToolId[] = ["line", "arc", "dashed", "block", "motion", "free", "pen"];

const RAIL_LINES: ToolId[] = ["line", "arc", "dashed", "block", "motion", "pen", "free", "connect", "pivot"];
const RAIL_SHAPES: ToolId[] = ["zone", "polygon", "text", "rect", "ellipse"];
/** Line tools whose look the Style card can change before drawing. */
const LOOK_TOOLS: ToolId[] = [...DRAW_TOOLS, "connect"];
const MODE_LABEL: Partial<Record<ModeId, string>> = { multiSelect: "Multi", clickThrough: "Click-thru" };
const RAIL_LABEL: Partial<Record<ToolId, string>> = {
  line: "Solid",
  arc: "3-pt arc",
  dashed: "Dashed",
  block: "Block",
  motion: "Motion",
  pen: "Bezier",
  free: "Freehand",
  connect: "Connect",
  pivot: "Pivot",
  zone: "Zone",
  polygon: "Polygon",
  text: "Text",
  rect: "Rectangle",
  ellipse: "Ellipse",
};
const RAIL_INKS = [
  { name: "Ink", color: "#0B1524" },
  { name: "Cyan", color: "#16C8E8" },
  { name: "Red", color: "#D24B3E" },
];

/** The details panel starts open on screens wide enough to show it beside the field. */
const wideScreen = () => typeof window !== "undefined" && window.matchMedia("(min-width: 1181px)").matches;
/** Phones and small tablets, where the tools live in a sheet that slides up from the bottom. */
const sheetScreen = () => typeof window !== "undefined" && window.matchMedia("(max-width: 900px)").matches;

const ZOOM_MIN = 0.25;
/** Auto-fit grows the field only when there is at least this much more room (see the fit effect). */
const AUTOFIT_GROW_SLACK = 0.02;
const ZOOM_MAX = 3;

/** Whether the tools sheet stays up after a pick, remembered per browser. */
const KEEP_OPEN_KEY = "grid1ronvault.toolsKeepOpen.v1";
const readKeepOpen = () => {
  try {
    return localStorage.getItem(KEEP_OPEN_KEY) === "1";
  } catch {
    return false;
  }
};

/**
 * Which side panels the coach tucked away to give the field more room, per browser.
 * `rail` is the tools panel (wherever it sits docked); `side` is the Selection/Play
 * panel, remembered only on screens wide enough to dock it.
 */
const PANELS_KEY = "grid1ronvault.panels.v1";
type PanelPrefs = { rail: boolean; side: boolean };
const readPanels = (): PanelPrefs => {
  try {
    const raw = JSON.parse(localStorage.getItem(PANELS_KEY) ?? "{}") as Partial<PanelPrefs>;
    return { rail: raw.rail !== false, side: raw.side !== false };
  } catch {
    return { rail: true, side: true };
  }
};
const savePanels = (patch: Partial<PanelPrefs>) => {
  try {
    localStorage.setItem(PANELS_KEY, JSON.stringify({ ...readPanels(), ...patch }));
  } catch {
    /* storage blocked — the choice still holds this visit */
  }
};

/** What undoing the same step three times usually means, and the fix. */
const UNDO_TIPS: Record<string, string> = {
  Move: "To move one player out of a formation, tap him once to pick the set, then press him again to pick only him. To move the whole set, tap the empty field first.",
  "Add shape": "Shapes draw from corner to corner as you drag. Drag farther for a bigger one, or pick Select to stop adding them.",
  Rotate: "Rotate spins around the middle of the selection, or around your pivot point if you dropped one. Pick Pivot in Tools to choose the spot.",
  Scale: "Scale grows away from the anchor dot. Pick Scale at the top of Tools and choose a different anchor dot, or drag a corner handle instead.",
  Duplicate: "Duplicate mode copies whatever you press. Tap Select to go back to moving things.",
};

export function Builder() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { account } = useAuth();
  const tier = useTier();
  const plays = useStore((s) => s.plays);
  const playbooks = useStore((s) => s.playbooks);
  const sheets = useStore((s) => s.sheets);
  const [params] = useSearchParams();
  const location = useLocation();
  const offense = usePositionTokens();

  const existing = useMemo(() => plays.find((p) => p.id === id) ?? null, [plays, id]);

  const [scene, setScene] = useState<Scene>(() => existing?.scene ?? emptyScene());
  const [meta, setMeta] = useState<PlayMeta>(() => existing ?? blankMeta);
  /*
   * New Play setup: a fresh /build opens with name, personnel, field and
   * playbook, unless the coach turned it off or came here to have Griddy draw.
   */
  const askSetup = () => {
    const state = location.state as { skipSetup?: boolean; setup?: boolean } | null;
    const ask = state?.setup || (!state?.skipSetup && setupWanted());
    return ask ? lastChoice(params.get("book"), playbooks) : null;
  };
  const [setup, setSetup] = useState<SetupChoice | null>(() => (id ? null : askSetup()));
  const [setupOn, setSetupOn] = useState(setupWanted);
  /** The playbook a new play goes in on its first save, picked in the setup. */
  const fileIn = useRef<FileTarget | null>(null);
  const [selection, setSelection] = useState<string[]>([]);
  const [tool, setTool] = useState<ToolId>("select");
  /**
   * A route tile loaded onto the cursor (see `pickTile`) for one placement;
   * `giver` is who has the ball, once a handoff or pitch has its first click.
   */
  const [armed, setArmed] = useState<{ tile: Tile; giver: string | null } | null>(null);
  const [mode, setMode] = useState<ModeId | null>(null);
  const [color, setColor] = useState(PALETTE[0]);
  const [width, setWidth] = useState(DEFAULT_STROKE);
  // The Style card's dash, curve and end for the next line. Picking a tool starts again from that tool's look.
  const [lookOverride, setLookOverride] = useState<LineLook>({});
  const look = { ...toolLook(tool), ...lookOverride };
  // Snap-to-grid and the field markings live in Field Controls, remembered per browser.
  const { grid, snapRadius } = useFieldPrefs();
  const [fieldOpen, setFieldOpen] = useState(false);
  // The league's rule lines (rush line, no-run zone), remembered per browser.
  const [rules, setRulesState] = useState(loadRules);
  const setRules = (next: RuleLines) => (saveRules(next), setRulesState(next));
  // Route depths on the canvas, remembered per browser.
  const [depths, setDepths] = useState(() => {
    try {
      return localStorage.getItem("grid1ronvault.depths.v1") === "1";
    } catch {
      return false;
    }
  });
  const toggleDepths = () =>
    setDepths((d) => {
      try {
        localStorage.setItem("grid1ronvault.depths.v1", d ? "0" : "1");
      } catch {
        /* storage blocked — the choice still holds this session */
      }
      return !d;
    });
  const [anchor, setAnchor] = useState({ ax: 0.5, ay: 0.5 });
  const [zoom, setZoom] = useState(0.86);
  // The field fits the stage (phone, iPad, laptop) until the coach picks a zoom himself.
  const [autoFit, setAutoFit] = useState(true);
  const stageRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const fitZoom = useRef(0.86);
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const fit = () => {
      const cs = getComputedStyle(el);
      const pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) || 36;
      // Width only: the stage grows with the field, so its height would chase the zoom.
      const z = (el.clientWidth - pad) / CANVAS_W;
      fitZoom.current = Math.max(ZOOM_MIN, Math.min(1.4, Math.floor(z * 100) / 100));
      // A scrollbar showing up narrows the stage a little, which shrinks the field, which
      // hides the scrollbar and widens the stage again. Growing by a hair is not worth
      // that loop, so only shrink exactly and grow once the room is clearly there.
      if (autoFit) setZoom((now) => (fitZoom.current > now && fitZoom.current - now <= AUTOFIT_GROW_SLACK ? now : fitZoom.current));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [autoFit]);

  /*
   * Zoom around a point (two fingers, Ctrl+scroll, a double-tap, the + and −
   * buttons): the spot under the fingers stays under the fingers. The view
   * scrolls in the stage sideways and in the column up and down.
   */
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const focal = useRef<{ fx: number; fy: number; clientX: number; clientY: number } | null>(null);
  const nudge = useCallback((dx: number, dy: number) => {
    const stage = stageRef.current;
    const main = mainRef.current;
    if (!stage) return;
    const beforeX = stage.scrollLeft;
    const beforeY = stage.scrollTop;
    stage.scrollLeft += dx;
    stage.scrollTop += dy;
    const leftX = dx - (stage.scrollLeft - beforeX);
    const leftY = dy - (stage.scrollTop - beforeY);
    if (main) {
      main.scrollLeft += leftX;
      main.scrollTop += leftY;
    }
  }, []);
  const zoomTo = useCallback((next: number, at?: { clientX: number; clientY: number }) => {
    const svg = stageRef.current?.querySelector(".stage-frame svg");
    const r = svg?.getBoundingClientRect();
    const z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, next));
    if (Math.abs(z - zoomRef.current) < 0.001) return;
    if (r && r.width) {
      const s = stageRef.current!.getBoundingClientRect();
      const p = at ?? { clientX: s.left + s.width / 2, clientY: s.top + Math.min(s.height, window.innerHeight - s.top) / 2 };
      focal.current = { fx: (p.clientX - r.left) / r.width, fy: (p.clientY - r.top) / r.height, clientX: p.clientX, clientY: p.clientY };
    }
    zoomRef.current = z;
    setAutoFit(false);
    setZoom(z);
    coachTips.acted();
  }, []);
  const zoomBy = useCallback((factor: number, at?: { clientX: number; clientY: number }) => zoomTo(zoomRef.current * factor, at), [zoomTo]);
  const panBy = useCallback((dx: number, dy: number) => nudge(-dx, -dy), [nudge]);
  useLayoutEffect(() => {
    const f = focal.current;
    focal.current = null;
    const r = stageRef.current?.querySelector(".stage-frame svg")?.getBoundingClientRect();
    if (!f || !r) return;
    nudge(r.left + f.fx * r.width - f.clientX, r.top + f.fy * r.height - f.clientY);
  }, [zoom, nudge]);
  /*
   * Two fingers anywhere on the field area zoom and move the play, never the page.
   * The second finger takes back whatever the first had started on the canvas.
   */
  const fingers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; mid: { x: number; y: number } } | null>(null);
  const onStageDownCapture = (e: React.PointerEvent) => {
    if (e.pointerType !== "touch") return;
    // The first finger of a fresh touch clears anything a lost "up" left behind.
    if (e.isPrimary) {
      fingers.current.clear();
      pinch.current = null;
    }
    fingers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (fingers.current.size < 2) return;
    e.stopPropagation();
    e.preventDefault();
    canvasControl.current?.cancel();
    const [a, b] = [...fingers.current.values()];
    pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
  };
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "touch" || !fingers.current.has(e.pointerId)) return;
      fingers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const was = pinch.current;
      if (!was || fingers.current.size < 2) return;
      const [a, b] = [...fingers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      nudge(was.mid.x - mid.x, was.mid.y - mid.y);
      if (Math.abs(dist / was.dist - 1) > 0.002) zoomTo(zoomRef.current * (dist / was.dist), { clientX: mid.x, clientY: mid.y });
      pinch.current = { dist, mid };
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      fingers.current.delete(e.pointerId);
      // The view holds still until every finger is up, so the last one can't start a drag.
      if (fingers.current.size === 0) pinch.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [nudge, zoomTo]);

  /*
   * While the designer is open the browser's own page zoom stays out of the way,
   * so a pinch never zooms the toolbars instead of the play (the play has its own
   * zoom, and − Fit + buttons). The page zoom comes back when the coach leaves.
   */
  useEffect(() => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    const before = meta?.content;
    // Resets a page that was already zoomed in, and stops iOS zooming into text boxes.
    if (meta) meta.content = "width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover";
    const stopPageZoom = (e: Event) => e.preventDefault();
    const stopTwoFinger = (e: TouchEvent) => {
      if (e.touches.length > 1) e.preventDefault();
    };
    // Mac Safari's trackpad pinch arrives as gesture events: zoom the play with it.
    let last = 1;
    const onGestureStart = (e: Event) => {
      e.preventDefault();
      last = 1;
    };
    const onGestureChange = (e: Event) => {
      e.preventDefault();
      if (fingers.current.size) return; // fingers on a touch screen are handled above
      const g = e as Event & { scale: number; clientX: number; clientY: number };
      zoomBy(g.scale / last, { clientX: g.clientX, clientY: g.clientY });
      last = g.scale;
    };
    document.addEventListener("gesturestart", onGestureStart, { passive: false });
    document.addEventListener("gesturechange", onGestureChange, { passive: false });
    document.addEventListener("gestureend", stopPageZoom, { passive: false });
    document.addEventListener("touchmove", stopTwoFinger, { passive: false });
    return () => {
      if (meta && before) meta.content = before;
      document.removeEventListener("gesturestart", onGestureStart);
      document.removeEventListener("gesturechange", onGestureChange);
      document.removeEventListener("gestureend", stopPageZoom);
      document.removeEventListener("touchmove", stopTwoFinger);
    };
  }, [zoomBy]);

  /** Double-tap: in close on that spot, or back out to the whole field. */
  const doubleTapZoom = useCallback(
    (at: { clientX: number; clientY: number }) => {
      if (zoomRef.current > fitZoom.current * 1.3) setAutoFit(true);
      else zoomTo(Math.max(fitZoom.current * 2.2, 1), at);
    },
    [zoomTo],
  );
  const [status, setStatus] = useState("Drop a formation, then draw the routes. Hover any tool to see how it works.");
  const [exporting, setExporting] = useState(false);
  const [sideOpen, setSideOpen] = useState(() => wideScreen() && readPanels().side);
  const [tray, setTray] = useState<"offense" | "defense" | null>("offense");
  const [lists, setLists] = useState<"formations" | "defense" | "layers" | null>(null);
  const [railOpen, setRailOpen] = useState(false);
  /** The docked tools panel tucked against the left edge (tablets and up; phones use the sheet). */
  const [railShown, setRailShown] = useState(() => readPanels().rail);
  useEffect(() => savePanels({ rail: railShown }), [railShown]);
  useEffect(() => {
    if (wideScreen()) savePanels({ side: sideOpen });
  }, [sideOpen]);
  /** Opens the tools wherever they live: the sheet on a phone, the docked panel elsewhere. */
  const showRail = () => {
    setRailOpen(true);
    setRailShown(true);
  };
  const panelsShown = railShown || (wideScreen() && sideOpen);
  /** Ctrl+\ and the field menu: tuck both panels away for the whole field, or bring them back. */
  const togglePanels = () => {
    const show = !panelsShown;
    setRailShown(show);
    setSideOpen(show && wideScreen());
  };
  const [keepOpen, setKeepOpen] = useState(readKeepOpen);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreBtn = useRef<HTMLButtonElement>(null);
  // Escape closes Extras before the Designer's own Escape (clear selection) sees it.
  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setMoreOpen(false);
      moreBtn.current?.focus();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [moreOpen]);
  const [draftPoints, setDraftPoints] = useState(0);
  const canvasControl = useRef<CanvasControl | null>(null);
  const tipsOn = useTipsEnabled();
  /** After a pick on a phone the tools sheet steps aside so the field is free, unless the coach pinned it. */
  const picked = () => {
    if (sheetScreen() && !keepOpen) setRailOpen(false);
  };
  const toggleKeepOpen = () =>
    setKeepOpen((k) => {
      try {
        localStorage.setItem(KEEP_OPEN_KEY, k ? "0" : "1");
      } catch {
        /* storage blocked — the choice still holds this session */
      }
      return !k;
    });
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const past = useRef<Scene[]>([]);
  const future = useRef<Scene[]>([]);
  const loadedId = useRef<string | undefined>(id);

  useCaptureGuard(tier.watermark);

  // Swap the canvas when the route points at a different play.
  useEffect(() => {
    if (loadedId.current === id) return;
    loadedId.current = id;
    setScene(existing?.scene ?? emptyScene());
    setMeta(existing ?? blankMeta);
    setSelection([]);
    if (!id) {
      fileIn.current = null;
      setSetup(askSetup());
    } else setSetup(null);
    past.current = [];
    future.current = [];
    pastLabels.current = [];
    futureLabels.current = [];
    setDirty(false);
  }, [id, existing]);

  const sceneRefValue = useRef(scene);
  sceneRefValue.current = scene;

  // What each undo step was called, so coach tips can spot the same step undone again and again.
  const pastLabels = useRef<string[]>([]);
  const futureLabels = useRef<string[]>([]);

  const applyScene = useCallback((next: Scene, label?: string) => {
    if (label) {
      past.current = [...past.current.slice(-59), sceneRefValue.current];
      pastLabels.current = [...pastLabels.current.slice(-59), label];
      future.current = [];
      futureLabels.current = [];
      setStatus(label);
      coachTips.acted();
    }
    sceneRefValue.current = next;
    setScene(next);
    setDirty(true);
  }, []);

  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    const label = pastLabels.current.pop();
    futureLabels.current = [label ?? "", ...futureLabels.current.slice(0, 59)];
    future.current = [sceneRefValue.current, ...future.current.slice(0, 59)];
    sceneRefValue.current = prev;
    setScene(prev);
    setStatus(label ? `Undid ${label.toLowerCase()}.` : "Undone.");
    coachTips.undid(label, (l) => {
      const key = Object.keys(UNDO_TIPS).find((k) => l === k || l.startsWith(`${k} `));
      return key ? { id: "undoLoop", title: `${key} not landing right?`, text: UNDO_TIPS[key] } : null;
    });
  }, []);

  const redo = useCallback(() => {
    const [next, ...rest] = future.current;
    if (!next) return;
    future.current = rest;
    past.current = [...past.current, sceneRefValue.current];
    const [label = "", ...restLabels] = futureLabels.current;
    futureLabels.current = restLabels;
    pastLabels.current = [...pastLabels.current, label];
    sceneRefValue.current = next;
    setScene(next);
    setStatus("Redone.");
  }, []);

  /* ------------------------------------------------------------- placements */

  const placeToken = (preset: TokenPreset, at?: { x: number; y: number }) => {
    const spot = at ?? { x: CANVAS_W / 2 + (scene.nodes.length % 5) * 34 - 68, y: scene.losY - 46 };
    const node = { ...makePlayer(preset, spot.x, spot.y), z: nextZ(scene) };
    applyScene({ ...scene, nodes: [...scene.nodes, node] }, `${preset.title} added`);
    setSelection([node.id]);
    picked();
  };

  const applyFormation = (set: { name: string; note: string; placed: Placed[] }) => {
    const group = uid("grp");
    const z = nextZ(scene);
    const nodes = set.placed.map((p, i) => ({
      ...makePlayer(tokenFor(p, offense), CANVAS_W / 2 + p.dx, scene.losY + p.dy),
      groupId: group,
      z: z + i,
    }));
    applyScene({ ...scene, nodes: [...scene.nodes, ...nodes] }, `${set.name} set`);
    setSelection(nodes.map((n) => n.id));
    if (!meta.formation) setMeta((m) => ({ ...m, formation: set.name }));
    setStatus(set.note);
    picked();
  };

  const startSetup = (c: SetupChoice) => {
    rememberChoice(c);
    setSetupOn(setupWanted());
    const start = setupScene(c, offense);
    applyScene(start.scene, "New play setup");
    setSelection([]);
    setMeta({ ...blankMeta, ...start.meta });
    fileIn.current = fileTarget(c);
    setStatus(start.status);
    setSetup(null);
  };

  const drawAssistant = (nodes: SceneNode[], read: AssistantRead) => {
    setSetup(null);
    const group = uid("grp");
    const grouped = nodes.map((n) => ({ ...n, groupId: group }));
    applyScene({ ...scene, nodes: [...scene.nodes, ...grouped] }, `Griddy: ${read.name}`);
    setSelection(grouped.map((n) => n.id));
    setMeta((m) => ({ ...m, name: m.name || read.name, formation: m.formation || read.formation }));
    setStatus(`Drew ${read.name}. Drag, restyle or undo it like anything else.`);
  };
  useGriddyDrawer({
    scene,
    tokens: offense,
    meta,
    playId: existing?.id ?? null,
    onDraw: drawAssistant,
    // A Griddy bulk edit that includes the open play changes the field too, so the next save keeps it.
    onEdit: (edit, label) => applyScene(edit(sceneRefValue.current), label),
    onMeta: (patch) => setMeta((m) => ({ ...m, ...patch })),
  });

  // A new field keeps routes true to the yard (a 10-yard out stays 10 yards); Undo puts the old drawing back.
  const changeField = (view: Scene["view"]) => {
    if (view === scene.view) return;
    const move = convertField(scene, view);
    applyScene(move.scene, "Field view");
    const name = FIELD_VIEWS.find((v) => v.id === view)?.label ?? view;
    setStatus(
      !move.moved
        ? `${name}. The whiteboard has no yards, so the drawing stays as it is.`
        : move.clipped
          ? `${name}, routes kept to the yard. The play is taller than this field, so some lines run off it.`
          : move.slidYards
            ? `${name}, routes kept to the yard. The play slid ${Math.abs(move.slidYards)} yds ${move.slidYards < 0 ? "up" : "down"} to fit.`
            : `${name}, routes kept to the yard.`,
    );
  };

  const applyDefense = (set: { front: Front; coverage: Coverage; show: boolean }) => {
    // Line up on the ball: the center if there is one, else the middle of the field.
    const players = scene.nodes.filter((n): n is PlayerNode => n.kind === "player" && !n.hidden);
    const center = players.find((p) => p.side === "offense" && p.label === "C");
    const ball = { x: center?.x ?? CANVAS_W / 2, y: scene.losY };
    const offense = players.filter((p) => p.side === "offense");
    const hasLine = offense.some(isLineman);
    const receivers = offense
      .filter((p) => p.label && p.label !== "Q" && !isLineman(p) && !(hasLine && p.label === "C"))
      .map((p) => ({ dx: p.x - ball.x, dy: p.y - ball.y }));
    const layout = layoutDefense(set.front, set.coverage, receivers);
    const nodes = defenseNodes(layout, ball, set.show, nextZ(scene));
    applyScene({ ...scene, nodes: [...scene.nodes, ...nodes] }, `${set.front} ${set.coverage} set`);
    setSelection(nodes.map((n) => n.id));
    setStatus(
      set.coverage === "Man" || set.coverage === "Cover 1"
        ? receivers.length
          ? `${describeDefense(set.front, set.coverage, set.show)}.`
          : "No receivers on the play yet, so man defenders are placed without lines. Drop an offense first to draw them."
        : `${describeDefense(set.front, set.coverage, set.show)}.`,
    );
    picked();
  };

  const pickTool = (next: ToolId) => {
    const gate = gateTool(tier, next);
    if (!gate.ok) {
      toast(gate.reason, true);
      return;
    }
    setTool(next);
    setMode(null);
    setLookOverride({});
    picked();
    introduce(next);
  };

  /** A dash, curve or end picked with nothing selected: it shapes the next line, so a line tool comes out if none is. */
  const changeLook = (patch: LineLook) => {
    if (!LOOK_TOOLS.includes(tool)) pickTool("line");
    setLookOverride((o) => ({ ...o, ...patch }));
  };

  const pickMode = (next: ModeId) => {
    setTool("select");
    setMode((m) => (m === next ? null : next));
    picked();
    if (mode !== next) introduce(next);
  };

  /** The first time a coach picks a tool, a card says what it does and how to use it. */
  const introduce = (id: ToolId | ModeId) => {
    const t = [...LINE_TOOLS, ...SHAPE_TOOLS, ...MODES].find((x) => x.id === id);
    if (!t) return;
    const touch = window.matchMedia("(pointer: coarse)").matches;
    coachTips.show({
      id: `tool-${id}`,
      max: 1,
      title: RAIL_LABEL[t.id as ToolId] ?? t.label,
      text: touch ? t.hint.replace(/\bright-click\b/gi, "press and hold").replace(/\bclick/gi, (w) => (w[0] === "C" ? "Tap" : "tap")) : t.hint,
    });
  };

  const pickSelect = () => {
    setTool("select");
    setMode(null);
    picked();
  };

  const duplicateSelection = () => {
    if (!selection.length) return;
    const source = scene.nodes.filter((n) => selection.includes(n.id));
    const copies = cloneNodes(source, 26, 26).map((n, i) => ({ ...n, z: nextZ(scene) + i }));
    applyScene({ ...scene, nodes: [...scene.nodes, ...copies] }, "Duplicate");
    setSelection(copies.map((n) => n.id));
  };

  const copySelection = () => {
    const source = scene.nodes.filter((n) => selection.includes(n.id));
    if (!source.length) return;
    copyNodes(source);
    setStatus(`Copied ${source.length === 1 ? describe(source[0]) : `${source.length} elements`}. Paste here or on another play with Ctrl+V.`);
  };

  const copyLook = () => {
    const only = scene.nodes.find((n) => n.id === selection[0]);
    if (selection.length !== 1 || !only) {
      setStatus("Pick one player, line, shape or text to copy its style.");
      return;
    }
    copyStyle(only);
    setStatus(`Copied the style of ${describe(only)}. Pick others of the same kind and press Ctrl+Alt+V.`);
  };

  const pasteLook = () => {
    const clip = styleClip();
    if (!clip) {
      setStatus("No style copied yet. Pick one element and press Ctrl+Alt+C first.");
      return;
    }
    const done = pasteStyle(scene.nodes, selection, clip);
    if (!done.changed) {
      setStatus(`That style is for ${clip.kind === "text" ? "text" : `${clip.kind}s`}. Pick one or more to paste it on.`);
      return;
    }
    applyScene({ ...scene, nodes: done.nodes }, "Paste style");
    setStatus(`Pasted the style on ${done.changed === 1 ? "1 element" : `${done.changed} elements`}.`);
  };

  const cutSelection = () => {
    if (!selection.length) return;
    copySelection();
    applyScene({ ...scene, nodes: scene.nodes.filter((n) => !selection.includes(n.id)) }, "Cut");
    setSelection([]);
  };

  /** Pastes the clipboard, centred on `at` when the field's right-click menu asked for it. */
  const pasteClipboard = (at?: Point) => {
    const pasted = pasteNodes(scene, at);
    if (!pasted) {
      setStatus("Nothing copied yet. Pick a player or route and press Ctrl+C first.");
      return;
    }
    applyScene(pasted.scene, "Paste");
    setTool("select");
    setMode(null);
    setSelection(pasted.ids);
    setStatus(`Pasted ${pasted.ids.length === 1 ? "1 element" : `${pasted.ids.length} elements`}. Drag to place it.`);
  };

  const groupSelection = () => {
    if (selection.length < 2) return;
    const group = uid("grp");
    applyScene({ ...scene, nodes: scene.nodes.map((n) => (selection.includes(n.id) ? { ...n, groupId: group } : n)) }, "Grouped");
  };

  const deleteSelection = () => {
    if (!selection.length) return;
    applyScene({ ...scene, nodes: scene.nodes.filter((n) => !selection.includes(n.id)) }, "Deleted");
    setSelection([]);
  };

  const ungroupSelection = () => {
    applyScene({ ...scene, nodes: scene.nodes.map((n) => (selection.includes(n.id) ? { ...n, groupId: null } : n)) }, "Ungroup");
  };

  const lockSelection = () => {
    if (!selection.length) return;
    applyScene({ ...scene, nodes: scene.nodes.map((n) => (selection.includes(n.id) ? { ...n, locked: true } : n)) }, "Lock");
    setSelection([]);
    setStatus("Locked in place. To unlock, open Tools → Sets → Layers, pick it, then Details → Arrange → Lock.");
  };

  const selectAll = () => setSelection(scene.nodes.filter((n) => !n.locked && !n.hidden).map((n) => n.id));

  // What a long press or right-click on the field offers, and what the touch selection bar shows.
  const selectedNodes = scene.nodes.filter((n) => selection.includes(n.id));
  const groupActions: (MenuAction & { short: string })[] = [
    ...(selection.length > 1 && !selectedNodes.every((n) => n.groupId && n.groupId === selectedNodes[0].groupId)
      ? [{ id: "group", label: "Group", short: "Group", run: groupSelection }]
      : []),
    ...(selectedNodes.some((n) => n.groupId) ? [{ id: "ungroup", label: "Ungroup", short: "Ungroup", run: ungroupSelection }] : []),
  ];
  const patchSelected = (changes: Partial<SceneNode>, label: string) =>
    applyScene({ ...scene, nodes: scene.nodes.map((n) => (selection.includes(n.id) ? ({ ...n, ...changes } as SceneNode) : n)) }, label);
  const allPaths = selectedNodes.length > 0 && selectedNodes.every((n) => n.kind === "path");
  const paths = allPaths ? (selectedNodes as PathNode[]) : [];
  const players = selectedNodes.filter((n): n is PlayerNode => n.kind === "player");
  const setFirstRead = (on: boolean) =>
    applyScene(
      {
        ...scene,
        nodes: scene.nodes.map((n) =>
          n.kind !== "path" ? n : n.id === paths[0].id ? { ...n, firstRead: on } : on && n.firstRead ? { ...n, firstRead: false } : n,
        ),
      },
      "First read",
    );
  // The floating toolbar's read colors and weights restyle the selected lines, or set the next line when none are.
  const selectedLines = selectedNodes.filter((n): n is PathNode => n.kind === "path");
  const pickRead = (id: ReadId) => {
    const read = READS.find((r) => r.id === id)!;
    if (!selectedLines.length) {
      setColor(read.color);
      if (!LOOK_TOOLS.includes(tool)) pickTool("line");
      return;
    }
    const ids = selectedLines.map((n) => n.id);
    applyScene(
      {
        ...scene,
        nodes: scene.nodes.map((n) => {
          if (n.kind !== "path") return n;
          // One first read per play: it goes on the first selected line and comes off every other.
          if (id === "first") return n.id === ids[0] ? { ...n, firstRead: true } : n.firstRead ? { ...n, firstRead: false } : n;
          return ids.includes(n.id) ? { ...n, stroke: read.color, firstRead: false } : n;
        }),
      },
      read.label,
    );
  };
  // The floating tools' color row: colors whatever is picked (lines, player fills, labels), else the next line.
  const selectedPlayers = selectedNodes.filter((n) => n.kind === "player");
  const selectedTexts = selectedNodes.filter((n) => n.kind === "text");
  const floatTarget = selectedNodes.length
    ? [
        [selectedLines.length, "line"],
        [selectedPlayers.length, "player"],
        [selectedTexts.length, "label"],
      ]
        .filter(([n]) => n)
        .map(([n, w]) => `${n} ${w}${n === 1 ? "" : "s"}`)
        .join(" · ") || `${selectedNodes.length} selected`
    : "Next line";
  const floatInk = (() => {
    const first = selectedNodes.find((n) => n.kind === "path") ?? selectedNodes.find((n) => n.kind === "player" || n.kind === "text");
    if (first?.kind === "path") return first.stroke;
    if (first?.kind === "player") return first.fill;
    if (first?.kind === "text") return first.color;
    return color;
  })();
  const pickColor = (hex: string) => {
    if (!selectedNodes.length) {
      setColor(hex);
      return;
    }
    applyScene(
      {
        ...scene,
        nodes: scene.nodes.map((n): SceneNode => {
          if (!selection.includes(n.id)) return n;
          // A first read always draws in cyan, so a new color takes the first-read mark off, as the read picks do.
          if (n.kind === "path") return { ...n, stroke: hex, firstRead: false };
          // Outlines follow the fill unless the coach set their own (same as the Style card).
          if (n.kind === "player") return { ...n, fill: hex, textColor: letterColor(hex), stroke: n.stroke.toLowerCase() === n.fill.toLowerCase() ? hex : n.stroke };
          if (n.kind === "text") return { ...n, color: hex };
          return n;
        }),
      },
      "Color",
    );
  };
  const pickWeight = (w: number) => (selectedLines.length ? patchSelectedLines({ width: w }, "Weight") : setWidth(w));
  const patchSelectedLines = (changes: Partial<PathNode>, label: string) =>
    applyScene({ ...scene, nodes: scene.nodes.map((n) => (n.kind === "path" && selection.includes(n.id) ? { ...n, ...changes } : n)) }, label);
  const bringToFront = () => {
    const z = nextZ(scene);
    applyScene({ ...scene, nodes: scene.nodes.map((n) => (selection.includes(n.id) ? { ...n, z: z + selection.indexOf(n.id) } : n)) }, "Bring to front");
  };
  const snapToPlayer = () => {
    const { scene: next, snapped } = snapPathsToPlayers(scene, selection);
    if (!snapped.length) {
      setStatus("No player close enough to that route's start. Drag it nearer a player, then try again.");
      return;
    }
    applyScene(next, "Snap to player");
    setStatus(`Snapped to ${[...new Set(snapped)].join(", ")}. The route now moves with ${snapped.length === 1 ? "him" : "them"}.`);
  };
  const reshape = (op: (s: Scene, ids: string[]) => Scene, label: string) => {
    applyScene(op(scene, selection), label);
    setStatus(`${label}. Undo puts the line back the way you drew it.`);
  };
  // Snaps for the picked lines: each says what it did, or why nothing changed.
  const snapLines = (op: (s: Scene, ids: string[]) => { scene: Scene; count: number }, label: string, done: string, none: string) => {
    const { scene: next, count } = op(scene, selection);
    if (!count) {
      setStatus(none);
      return;
    }
    applyScene(next, label);
    setStatus(`${done.replace("{n}", count === 1 ? "1 line" : `${count} lines`)} Undo puts ${count === 1 ? "it" : "them"} back.`);
  };
  // The whole play at once: every hand-drawn line tidied the way it was drawn, or all smoothed / all straightened.
  const cleanUpLines = () => {
    const { scene: next, count } = cleanUpPaths(scene);
    if (!count) {
      setStatus("Every line on this play is already clean.");
      return;
    }
    applyScene(next, "Clean up lines");
    setStatus(`Cleaned up ${count} ${count === 1 ? "line" : "lines"}: curves smoothed, routes cut sharp. Undo puts them back.`);
  };
  const hasLines = canReshape(scene, scene.nodes.map((n) => n.id));
  const reshapeEvery = (how: "smooth" | "straight") => {
    applyScene(reshapeAll(scene, how), how === "smooth" ? "Smooth all lines" : "Straighten all lines");
    setStatus(`${how === "smooth" ? "Smoothed" : "Straightened"} every line on the play. Undo puts them back.`);
  };
  // Anyone can hand off or pitch: the player right-clicked has the ball, the next click is who gets it.
  const giver = players.length === 1 ? players[0] : null;
  // Right-click (or press and hold) on something already picked: what you can do to it, grouped by kind.
  const nodeActions: MenuAction[] = [
    ...(allPaths
      ? [
          ...(["solid", "dashed", "dotted", "motion"] as const).map((s) => ({
            id: `style-${s}`,
            section: "Line style",
            label: s[0].toUpperCase() + s.slice(1),
            on: paths.every((p) => p.style === s),
            run: () => patchSelected({ style: s } as Partial<SceneNode>, "Line style"),
          })),
          ...(["Thin", "Medium", "Thick"] as const).map((label, i) => ({
            id: `weight-${i}`,
            section: "Weight",
            label,
            on: paths.every((p) => p.width === STROKE_WEIGHTS[i]),
            run: () => patchSelected({ width: STROKE_WEIGHTS[i] } as Partial<SceneNode>, "Weight"),
          })),
          ...RAIL_INKS.map((ink) => ({
            id: `ink-${ink.name}`,
            section: "Color",
            label: ink.name,
            on: paths.every((p) => p.stroke.toLowerCase() === ink.color.toLowerCase()),
            run: () => patchSelected({ stroke: ink.color } as Partial<SceneNode>, "Color"),
          })),
          {
            id: "arrow",
            section: "Ends",
            label: "Arrow at the end",
            on: paths.every((p) => p.endCap === "arrow"),
            run: () => patchSelected({ endCap: paths.every((p) => p.endCap === "arrow") ? "none" : "arrow" } as Partial<SceneNode>, "End cap"),
          },
          ...(paths.length === 1
            ? [{ id: "first-read", section: "Ends", label: "First read", on: !!paths[0].firstRead, run: () => setFirstRead(!paths[0].firstRead) }]
            : []),
          ...(paths.length === 1
            ? [
                {
                  id: "tag",
                  section: "Ends",
                  label: paths[0].tag ? "Edit the route tag" : "Add a route tag",
                  run: () => {
                    setSideOpen(true);
                    setTimeout(() => document.getElementById("route-tag")?.focus(), 60);
                  },
                },
              ]
            : []),
          ...(paths.some((p) => !p.closed && !p.toId && !p.fromId && !p.assignOf)
            ? [{ id: "snap-player", section: "Clean up", label: "Snap to nearest player", run: snapToPlayer }]
            : []),
          ...(canReshape(scene, selection)
            ? [
                { id: "smooth", section: "Clean up", label: "Smooth into a curve", run: () => reshape(smoothPaths, "Smoothed") },
                { id: "straighten", section: "Clean up", label: "Straighten into clean cuts", run: () => reshape(straightenPaths, "Straightened") },
              ]
            : []),
          ...(paths.some((p) => !p.closed && !p.toId)
            ? [
                {
                  id: "to-sideline",
                  section: "Snap",
                  label: "Extend to the sideline",
                  run: () =>
                    snapLines(
                      extendToSideline,
                      "Extend to sideline",
                      "Ran {n} on to the sideline.",
                      "Nothing to extend: a route has to be heading toward a sideline, not straight up the field.",
                    ),
                },
                {
                  id: "stop-los",
                  section: "Snap",
                  label: "Stop at the line of scrimmage",
                  run: () =>
                    snapLines(stopAtLos, "Stop at the line", "Cut {n} off at the line of scrimmage.", "That line doesn't cross the line of scrimmage, so there's nothing to cut."),
                },
                {
                  id: "bend",
                  section: "Snap",
                  label: "Bend around players",
                  run: () =>
                    snapLines(bendAroundPlayers, "Bend around players", "Bent {n} around the players in the way.", "That line doesn't run through anyone. Nothing to bend."),
                },
              ]
            : []),
        ]
      : []),
    ...(players.length
      ? [
          {
            id: "draw-route",
            section: "Player",
            label: "Draw a route from here",
            run: () => {
              pickTool("line");
              setStatus("Click along the route, then press Enter to finish.");
            },
          },
          {
            id: "route-library",
            section: "Player",
            label: "Pick from the route library",
            run: () => {
              railStore.open("routes");
              showRail();
            },
          },
          ...(giver
            ? [
                { id: "handoff", section: "Player", label: `Hand off from ${giver.label || "here"}`, run: () => armExchange(HANDOFF, giver.id) },
                { id: "pitch", section: "Player", label: `Pitch from ${giver.label || "here"}`, run: () => armExchange(PITCH, giver.id) },
              ]
            : []),
          { id: "note", section: "Player", label: "Add a note", run: () => setSideOpen(true) },
          ...(players.length === 1 && !players[0].ghostOf
            ? scene.nodes.some((n) => n.kind === "player" && n.ghostOf === players[0].id)
              ? [
                  {
                    id: "ghost-off",
                    section: "Player",
                    label: "Remove the pre-snap spot",
                    run: () => {
                      applyScene(removeGhost(scene, players[0].id), "Remove pre-snap spot");
                      setStatus("Pre-snap spot removed. Undo brings it back.");
                    },
                  },
                ]
              : [
                  {
                    id: "ghost",
                    section: "Player",
                    label: "Show where he lines up pre-snap",
                    run: () => {
                      const { scene: next, ghostId } = addGhost(scene, players[0].id);
                      if (!ghostId) return;
                      applyScene(next, "Pre-snap spot");
                      setSelection([ghostId]);
                      setStatus(`Drag the faded ${players[0].label || "player"} to where he lines up before the snap. The dotted line follows.`);
                    },
                  },
                ]
            : []),
          ...(players.length === 1 && players[0].label.trim()
            ? [
                {
                  id: "assignments",
                  section: "Player",
                  label: `${players[0].label.trim().toUpperCase()} on every play`,
                  run: async () => {
                    if (dirty && !(await save())) return;
                    navigate(`/assignments?${homeBook ? `book=${homeBook.id}&` : "book=vault&"}player=${encodeURIComponent(players[0].label.trim())}`);
                  },
                },
              ]
            : []),
        ]
      : []),
    { id: "copy", section: "Edit", label: "Copy", run: copySelection },
    { id: "cut", section: "Edit", label: "Cut", run: cutSelection },
    { id: "duplicate", section: "Edit", label: "Duplicate", run: duplicateSelection },
    ...(selection.length === 1 ? [{ id: "copy-style", section: "Edit", label: "Copy style", run: copyLook }] : []),
    ...(styleClip() ? [{ id: "paste-style", section: "Edit", label: "Paste style", run: pasteLook }] : []),
    ...groupActions.map((g) => ({ ...g, section: "Edit" })),
    { id: "front", section: "Edit", label: "Bring to front", run: bringToFront },
    { id: "back", section: "Edit", label: "Send to back", run: () => applyScene(sendToBack(scene, selection), "Send to back") },
    { id: "flip", section: "Edit", label: "Flip left/right", run: () => applyScene(flipNodes(scene, selection, "x"), "Flip") },
    { id: "lock", section: "Edit", label: "Lock in place", run: lockSelection },
    { id: "details", section: "Edit", label: "Edit details", run: () => setSideOpen(true) },
    { id: "delete", section: "Edit", label: "Delete", run: deleteSelection, danger: true },
  ];
  // The bar under a thumb leads with the moves made most and keeps every label short.
  const barActions: (MenuAction & { short: string })[] = [
    { id: "duplicate", label: "Duplicate", short: "Duplicate", run: duplicateSelection },
    { id: "delete", label: "Delete", short: "Delete", run: deleteSelection, danger: true },
    { id: "details", label: "Edit details", short: "Details", run: () => setSideOpen(true) },
    ...groupActions,
    { id: "lock", label: "Lock in place", short: "Lock", run: lockSelection },
  ];
  const fieldActions: MenuAction[] = [
    ...(armed ? [{ id: "put-away", label: `Put away ${armed.tile.label}`, run: () => putAway() }] : []),
    ...(hasClipboard() ? [{ id: "paste", label: "Paste here", run: (at?: Point) => pasteClipboard(at) }] : []),
    { id: "all", label: "Select all", run: selectAll },
    {
      id: "box",
      label: "Select with a box",
      run: () => {
        setTool("select");
        setMode("multiSelect");
        setStatus("Drag a box around what you want to select. Tap Select when you're done.");
      },
    },
    ...(hasLines
      ? [
          { id: "clean-all", label: "Clean up all lines", run: cleanUpLines },
          { id: "smooth-all", label: "Smooth all lines", run: () => reshapeEvery("smooth") },
          { id: "straight-all", label: "Straighten all lines", run: () => reshapeEvery("straight") },
        ]
      : []),
    ...(existing ? [{ id: "flip-copy", label: "Flip and save as a new play", run: () => void flipToCopy() }] : []),
    { id: "fit", label: "Fit the field to the screen", run: () => setAutoFit(true) },
    ...(sheetScreen() ? [] : [{ id: "panels", label: panelsShown ? "Hide the side panels" : "Show the side panels", run: togglePanels }]),
  ];

  /* ----------------------------------------------------------- coach tips */

  const openLayers = () => {
    railStore.open("sets");
    setLists("layers");
    showRail();
  };
  const onSignal = useCallback((s: CanvasSignal) => {
    if (s.kind === "emptyTap")
      coachTips.emptyTap({
        id: "emptyTaps",
        title: "Nothing to pick there",
        text: s.touch
          ? "Tapping empty field only clears the selection. To draw a route, tap Route in the bar below. To add players, open Tools → Players. Press and hold the field for the tool menu."
          : "Clicking empty field only clears the selection. Pick a line tool on the left (or press L) to draw, or drag players in from the Players tab. Right-click the field for the tool menu.",
        action: sheetScreen() ? { label: "Open Tools", run: () => setRailOpen(true) } : undefined,
      });
    if (s.kind === "lockedPress")
      coachTips.lockedPress({
        id: "locked",
        title: "That one is locked",
        text: "Locked elements can't be moved or picked on the field, so nothing gets bumped by accident. To unlock it, pick it in Layers, then open Details → Arrange → Lock.",
        action: { label: "Show Layers", run: openLayers },
      });
    if (s.kind === "emptyBox")
      coachTips.emptyBox({
        id: "oneFingerPan",
        title: "Moving around the field?",
        text: "In Multi-select, one finger draws a selection box. To move around instead, tap Select: then one finger on empty field moves the view, and a pinch zooms.",
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fingers can't double-click, so a route left hanging gets a reminder of how to finish it.
  useEffect(() => {
    if (draftPoints < 2 || !window.matchMedia("(pointer: coarse)").matches) return;
    const t = window.setTimeout(
      () =>
        coachTips.show({
          id: "finishLine",
          title: "Done with that route?",
          text: "Tap Finish line above the field, double-tap the last point, or press and hold it. Undo point takes back the last tap.",
        }),
      7000,
    );
    return () => window.clearTimeout(t);
  }, [draftPoints]);

  // First visit: the walkthrough opens by itself once, after the New play setup; More and the Tools guide bring it back.
  const [tourOpen, setTourOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const setupShowing = !!setup;
  useEffect(() => {
    if (tourSeen() || setupShowing) return;
    const t = window.setTimeout(() => setTourOpen(true), 700);
    return () => window.clearTimeout(t);
  }, [setupShowing]);
  const prefs = useToolPrefs();
  const shown = (id: ToolId | ModeId) => !prefs.hiddenTools.includes(id);
  const hiddenCount = prefs.hiddenGroups.length + prefs.hiddenTools.length;
  const railTabNow = useRailTab();
  // A tab whose groups are all hidden in the Tools guide leaves the strip.
  const tabs = RAIL_TABS.filter((t) =>
    Object.entries(RAIL_GROUPS).some(([g, tab]) => tab === t.id && !prefs.hiddenGroups.includes(g as keyof typeof RAIL_GROUPS)),
  );
  const railTab: RailTab = tabs.some((t) => t.id === railTabNow) ? railTabNow : (tabs[0]?.id ?? "players");
  /** Arrow keys move between tabs, as WAI-ARIA tabs do. */
  const onTabKey = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const i = tabs.findIndex((t) => t.id === railTab);
    const next = tabs[(i + step + tabs.length) % tabs.length];
    railStore.show(next.id);
    document.getElementById(`dz-tab-${next.id}`)?.focus();
  };
  const toolButton = (t: (typeof LINE_TOOLS)[number]) => {
    const locked = !gateTool(tier, t.id).ok;
    return (
      <Tooltip key={t.id} title={t.title} hint={locked ? `${t.hint} — unlocks with any paid plan.` : t.hint} shortcut={t.key}>
        <button
          type="button"
          className={`dz-btn${tool === t.id ? " is-on" : ""}${locked ? " is-locked" : ""}`}
          onClick={() => pickTool(t.id)}
          aria-label={locked ? `${t.title} — locked` : t.title}
          aria-pressed={tool === t.id}
        >
          {locked && <Icon name="lock" size={12} />}
          {RAIL_LABEL[t.id] ?? t.label}
        </button>
      </Tooltip>
    );
  };
  const guideTools: Record<string, GuideTool[]> = {
    modes: MODES.map((m) => ({ id: m.id, label: m.label, hint: m.hint })),
    lines: RAIL_LINES.map((id) => {
      const t = LINE_TOOLS.find((x) => x.id === id)!;
      return { id, label: RAIL_LABEL[id] ?? t.label, hint: t.hint };
    }),
    shapes: RAIL_SHAPES.map((id) => {
      const t = SHAPE_TOOLS.find((x) => x.id === id)!;
      return { id, label: RAIL_LABEL[id] ?? t.label, hint: t.hint };
    }),
  };

  /* ----------------------------------------------------------- drawing bar */

  // Snap, Ortho and Polar from the canvas drawing bar, remembered per browser.
  const [aids, setAids] = useState<DrawAids>(() => {
    try {
      return { snap: true, ortho: false, polar: false, ...JSON.parse(localStorage.getItem("grid1ronvault.drawAids.v1") ?? "{}") };
    } catch {
      return { snap: true, ortho: false, polar: false };
    }
  });
  const toggleAid = (key: keyof DrawAids) =>
    setAids((a) => {
      // Ortho and Polar both shape the angle, so only one is on at a time.
      const next = { ...a, [key]: !a[key], ...(key === "ortho" && !a.ortho ? { polar: false } : {}), ...(key === "polar" && !a.polar ? { ortho: false } : {}) };
      try {
        localStorage.setItem("grid1ronvault.drawAids.v1", JSON.stringify(next));
      } catch {
        /* storage blocked — the choice still holds this session */
      }
      return next;
    });
  const drawingTool = DRAW_TOOLS.includes(tool);

  /* -------------------------------------------------------------- shortcuts */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      // A dialog (New play setup, export…) keeps its keys to itself.
      if (el?.closest?.(".modal-back")) return;
      const meta_ = e.metaKey || e.ctrlKey;

      if (meta_ && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
        return;
      }
      if (meta_ && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
        return;
      }
      if (meta_ && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicateSelection();
        return;
      }
      if (meta_ && e.altKey && e.code === "KeyC") {
        e.preventDefault();
        copyLook();
        return;
      }
      if (meta_ && e.altKey && e.code === "KeyV") {
        e.preventDefault();
        pasteLook();
        return;
      }
      if (meta_ && e.key.toLowerCase() === "c" && selection.length) {
        e.preventDefault();
        copySelection();
        return;
      }
      if (meta_ && e.key.toLowerCase() === "x" && selection.length) {
        e.preventDefault();
        cutSelection();
        return;
      }
      if (meta_ && e.key.toLowerCase() === "v") {
        e.preventDefault();
        pasteClipboard();
        return;
      }
      if (meta_ && e.key.toLowerCase() === "g") {
        e.preventDefault();
        groupSelection();
        return;
      }
      if (meta_ && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setSelection(scene.nodes.map((n) => n.id));
        return;
      }
      if (meta_ && e.code === "Backslash" && !sheetScreen()) {
        e.preventDefault();
        togglePanels();
        return;
      }
      if (meta_) return;

      if (e.key === "[" || e.key === "]" || e.key === "PageUp" || e.key === "PageDown") {
        e.preventDefault();
        void goPlayRef.current(e.key === "[" || e.key === "PageUp" ? -1 : 1);
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        deleteSelection();
        return;
      }
      if (e.key === "Escape") {
        if (armed) putAway();
        setTool("select");
        setMode(null);
        return;
      }
      if (e.key === "v" || e.key === "V") {
        setTool("select");
        setMode(null);
        return;
      }

      // The drawing bar's letters, while a line tool is out (S is Scale otherwise).
      if (drawingTool) {
        const k = e.key.toLowerCase();
        if (k === "s" || k === "o" || k === "p") {
          toggleAid(k === "s" ? "snap" : k === "o" ? "ortho" : "polar");
          return;
        }
      }
      if (e.key === "l" || e.key === "L") {
        pickTool("line");
        return;
      }
      if (e.key === "f" || e.key === "F") {
        pickTool("free");
        return;
      }

      const modeHit = MODES.find((m) => m.key.toLowerCase() === e.key.toLowerCase());
      if (modeHit) {
        pickMode(modeHit.id);
        return;
      }
      const toolHit = [...LINE_TOOLS, ...SHAPE_TOOLS].find((t) => t.key && t.key.toLowerCase() === e.key.toLowerCase());
      if (toolHit) pickTool(toolHit.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, selection, undo, redo, tier, tool, drawingTool, armed, railShown, sideOpen]);

  /* ------------------------------------------------------------------- save */

  async function save(): Promise<boolean> {
    if (!meta.name.trim()) {
      toast("Give the play a name first — that is what you will search for later.", true);
      return false;
    }
    const isNew = !existing;
    if (isNew) {
      const gate = gateSave(tier, plays.length);
      if (!gate.ok) {
        toast(gate.reason, true);
        navigate("/pricing");
        return false;
      }
    }
    setSaving(true);
    const clean = reconcileConnections(scene);
    const record: StoredPlay = {
      ...meta,
      id: existing?.id ?? uid("play"),
      ownerName: account?.name ?? "You",
      fieldView: clean.view,
      scene: clean,
      preview: "",
      saveCount: existing?.saveCount ?? 0,
      updatedAt: new Date().toISOString(),
      remote: false,
    };
    store.upsertPlay(record);
    // A new play goes in the playbook picked in the setup, else the one it was started from (the tree's +, ?book=).
    const fromBook = isNew ? playbooks.find((b) => b.id === params.get("book")) : undefined;
    const target: FileTarget | null = isNew ? (fileIn.current ?? (fromBook ? { id: fromBook.id } : null)) : null;
    const filed = target && fileNewPlay(record.id, target);
    const bookQuery = filed ? `?book=${filed.id}` : "";

    try {
      if (account) {
        const payload = {
          name: record.name,
          formation: record.formation,
          playType: record.playType,
          personnel: record.personnel,
          description: record.description,
          tags: record.tags,
          fieldView: record.fieldView,
          scene: record.scene,
          isPublic: record.isPublic,
        };
        const res = existing?.remote ? await api.updatePlay(record.id, payload) : await api.createPlay(payload);
        const stored = toStoredPlay(res.play);
        if (stored.id !== record.id) store.replacePlayId(record.id, stored.id);
        store.upsertPlay(stored);
        if (target) fileNewPlay(stored.id, target);
        fileIn.current = null;
        setDirty(false);
        toast(`Saved to your Vault${filed ? ` in ${filed.name}` : ""} and your account.`);
        if (!existing) navigate(`/build/${stored.id}${bookQuery}`, { replace: true });
      } else {
        fileIn.current = null;
        setDirty(false);
        toast(`Saved in this browser${filed ? ` in ${filed.name}` : ""}. Sign in to keep it across devices.`);
        if (!existing) navigate(`/build/${record.id}${bookQuery}`, { replace: true });
      }
      track("play_created", { formation: record.formation, type: record.playType });
    } catch (error) {
      toast(error instanceof Error ? error.message : "The save did not reach the cloud. It is safe in this browser.", true);
      setDirty(false);
    } finally {
      setSaving(false);
    }
    return true;
  }

  /*
   * Previous / next play: steps through the playbook the coach opened this
   * play from (?book=), else the first playbook it's in, else the whole Vault
   * A to Z. Unsaved changes are saved first so nothing is lost on the way.
   */
  const homeBook = useMemo(
    () =>
      existing
        ? playbooks.find((b) => b.id === params.get("book") && b.playIds.includes(existing.id)) ??
          playbooks.find((b) => b.playIds.includes(existing.id))
        : undefined,
    [existing, playbooks, params],
  );
  const lineup = useMemo(() => {
    if (!existing) return null;
    const book = homeBook;
    const ids = book
      ? book.playIds.filter((pid) => plays.some((p) => p.id === pid))
      : [...plays].sort((a, b) => a.name.localeCompare(b.name)).map((p) => p.id);
    const at = ids.indexOf(existing.id);
    return at < 0 || ids.length < 2 ? null : { book, ids, at };
  }, [existing, homeBook, plays]);

  // The work tabs come back to this play, in this playbook.
  useEffect(() => {
    if (existing) rememberWork(homeBook ? { playId: existing.id, bookId: homeBook.id } : { playId: existing.id });
  }, [existing?.id, homeBook?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /*
   * Flip the whole play left to right and save it as a new play ("Trips
   * Right" becomes "Trips Left"), filed in the same playbook right after the
   * original. The original is saved first if it has changes.
   */
  const flipToCopy = async () => {
    if (!existing) {
      toast("Save this play first, then flip a copy of it.", true);
      return;
    }
    const gate = gateSave(tier, plays.length);
    if (!gate.ok) {
      toast(gate.reason, true);
      return;
    }
    if (dirty && !(await save())) return;
    const original = existing.id;
    const swapped = swapSides(meta.name.trim());
    const copy: StoredPlay = {
      ...meta,
      id: uid("play"),
      name: swapped === meta.name.trim() ? `${meta.name.trim()} (flipped)` : swapped,
      formation: swapSides(meta.formation),
      isPublic: false,
      ownerName: account?.name ?? "You",
      fieldView: scene.view,
      scene: editScene(reconcileConnections(scene), [{ op: "mirror" }], offense).scene,
      preview: "",
      saveCount: 0,
      updatedAt: new Date().toISOString(),
      remote: false,
    };
    const [saved] = await savePlays([copy], { playbook: homeBook?.name ?? null, signedIn: !!account });
    if (homeBook) {
      const book = store.get().playbooks.find((b) => b.id === homeBook.id);
      const at = book ? book.playIds.indexOf(original) : -1;
      if (book && at >= 0) {
        const ids = book.playIds.filter((pid) => pid !== saved.id);
        ids.splice(at + 1, 0, saved.id);
        store.upsertPlaybook({ ...book, playIds: ids, updatedAt: new Date().toISOString() });
      }
    }
    toast(`Saved ${saved.name}${homeBook ? ` in ${homeBook.name}` : ""}. You're on the flipped copy now.`);
    navigate(`/build/${saved.id}${homeBook ? `?book=${homeBook.id}` : ""}`);
  };
  /** Extras → New play: a fresh field with the setup, even when the coach turned it off for the rail button. */
  const newPlay = () => {
    if (dirty && !window.confirm("Start a new play? This one has changes you haven't saved.")) return;
    if (id) {
      navigate("/build", { state: { setup: true } });
      return;
    }
    applyScene(emptyScene(), "New play");
    setMeta(blankMeta);
    setSelection([]);
    fileIn.current = null;
    setDirty(false);
    setSetup(lastChoice(params.get("book"), playbooks));
  };
  const stepName = (step: 1 | -1) => {
    if (!lineup) return "";
    const n = lineup.ids.length;
    return plays.find((p) => p.id === lineup.ids[(lineup.at + step + n) % n])?.name ?? "";
  };
  const goPlay = async (step: 1 | -1) => {
    if (!lineup || saving) return;
    if (dirty && !(await save())) return;
    const n = lineup.ids.length;
    const next = lineup.ids[(lineup.at + step + n) % n];
    navigate(`/build/${next}${lineup.book ? `?book=${lineup.book.id}` : ""}`);
  };
  const goPlayRef = useRef(goPlay);
  goPlayRef.current = goPlay;
  /** The Plays tab: unsaved changes are saved first, as stepping to the next play does. */
  const openFromTree = async (href: string) => {
    if (saving) return;
    if (dirty && !(await save())) return;
    navigate(href);
  };

  // Vs defense: a saved defense (or any play) faded under this one.
  const overlayKey = existing?.id ?? "draft";
  const overlayId = useOverlay(overlayKey);
  const savedUnder = overlayId ? plays.find((p) => p.id === overlayId && p.id !== existing?.id) ?? null : null;
  // A stock look from the Opponent front is built around this play's offense, with a flag rusher on the rush line.
  const underLook = parseLook(overlayId);
  const lookUnits = (rules.rush || 7) * (unitsPerYard(scene.view) || 14.4);
  const lookUnder = useMemo(() => (underLook ? lookScene(scene, underLook, lookUnits) : null), [overlayId, scene.nodes, scene.losY, lookUnits]); // eslint-disable-line react-hooks/exhaustive-deps
  const underPlay = savedUnder ?? (underLook && lookUnder ? { id: overlayId!, name: lookName(underLook), scene: lookUnder } : null);
  const overlayChoices = useMemo(() => {
    const others = plays.filter((p) => p.id !== existing?.id).sort((a, b) => a.name.localeCompare(b.name));
    return { defenses: others.filter((p) => p.playType === "defense"), rest: others.filter((p) => p.playType !== "defense") };
  }, [plays, existing?.id]);
  const pickOverlay = (pid: string) => {
    overlayStore.set(overlayKey, pid || null);
    const look = parseLook(pid);
    const picked = look ? lookName(look) : plays.find((p) => p.id === pid)?.name;
    setStatus(picked ? `Showing ${picked} under this play. It's only a guide: it won't print or save into the play.` : "Defense overlay off.");
  };
  const overlaySelect = (className: string) => (
    <select className={className} value={underPlay?.id ?? ""} onChange={(e) => pickOverlay(e.target.value)} aria-label="Show a defense under this play">
      <option value="">Vs defense: none</option>
      {underLook && underPlay && <option value={underPlay.id}>Vs {underPlay.name}</option>}
      {overlayChoices.defenses.length > 0 && (
        <optgroup label="Defenses">
          {overlayChoices.defenses.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </optgroup>
      )}
      {overlayChoices.rest.length > 0 && (
        <optgroup label="Other plays">
          {overlayChoices.rest.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );

  /* ----------------------------------------------------------------- render */

  const activeMode = MODES.find((m) => m.id === mode);
  const exportables = [{ ...meta, scene }];

  const [running, setRunning] = useState(false);

  // Saved play format (canvas): save this play's look, or give this play the saved look.
  const playFormat = usePlayFormat();
  const saveFormat = () => {
    formatStore.saveFrom({ id: existing?.id ?? "draft", name: meta.name.trim() || "This play", scene });
    setStatus(`Saved the format of ${meta.name.trim() || "this play"}. Use it from the Vault or Wristbands too.`);
  };
  const useFormat = () => {
    if (!playFormat.format || !playFormat.parts.length) return;
    applyScene(applyFormat(scene, playFormat.format, playFormat.parts), "Apply format");
    setStatus(`Gave this play the ${playFormat.format.sourceName} format. Undo puts it back.`);
  };

  // The player last clicked: clicking one player of a dropped formation selects the whole
  // group, but a route tile should go to the player the coach pointed at. The pick is tied
  // to the selection that click made, so Select all or a drag box afterwards still means
  // everyone they chose.
  const lastPicked = useRef<{ id: string; selection: string[]; settling: boolean } | null>(null);
  useEffect(() => {
    // The click's own selection update lands here; anything later leaves the pick behind.
    if (lastPicked.current?.settling) lastPicked.current.selection = selection;
  }, [selection]);
  const pickNode = (id: string) => {
    const pick = { id, selection, settling: true };
    lastPicked.current = pick;
    setTimeout(() => (pick.settling = false), 0);
  };
  const tileTargets = (ids: string[]) => {
    const pick = lastPicked.current;
    if (!pick || pick.selection !== ids || !ids.includes(pick.id)) return ids;
    const chosen = scene.nodes.filter((n) => ids.includes(n.id));
    const oneGroup = chosen.length > 1 && chosen.every((n) => n.groupId && n.groupId === chosen[0].groupId);
    return oneGroup ? [pick.id] : ids;
  };

  /**
   * A route tile clicked with nobody picked is loaded onto the cursor for
   * one placement: a click on a player gives it to him, a click on the field
   * drops it there, and either way the cursor is back on Select. To repeat
   * it, right-click it and copy and paste. Handoff and Pitch dropped on the
   * field draw the mark there; a click on a player first starts it from him,
   * and the next click says who gets it.
   */
  const putAway = () => {
    setArmed(null);
    setStatus("Route put away.");
  };
  const isExchange = (tile: Tile) => tile.kind === "handoff" || tile.kind === "pitch";
  const armExchange = (tile: Tile, giverId: string) => {
    const from = scene.nodes.find((n) => n.id === giverId);
    setArmed({ tile, giver: giverId });
    setTool("select");
    setMode(null);
    picked();
    setStatus(`${tile.label} from ${(from?.kind === "player" && from.label) || "that player"}. Now click who gets it, or a spot on the field. Esc cancels.`);
  };
  const dropTile = (tile: Tile, at: Point) => {
    const result = placeTile(scene, tile, at, color, width, nextZ(scene));
    if ("error" in result) {
      toast(result.error, true);
      return false;
    }
    applyScene(result.scene, tile.label);
    setSelection(result.ids);
    setStatus(result.message);
    return true;
  };
  const pickTile = (tile: Tile) => {
    const targets = tileTargets(selection).filter((id) => scene.nodes.some((n) => n.id === id && n.kind === "player"));
    if (isExchange(tile)) {
      // One player picked has the ball; otherwise the next click places it.
      if (targets.length === 1) return armExchange(tile, targets[0]);
    } else if (targets.length) {
      setArmed(null);
      giveTile(tile, targets);
      return;
    }
    if (armed?.tile.id === tile.id) {
      putAway();
      return;
    }
    setArmed({ tile, giver: null });
    setTool("select");
    setMode(null);
    picked();
    setStatus(
      isExchange(tile)
        ? `${tile.label} loaded. Click the field to drop it there, or click the player with the ball and then who gets it.`
        : `${tile.label} loaded. Click a player to give it to him, or click the field to drop it there.`,
    );
  };
  const stampTile = (at: Point, playerId: string | null) => {
    if (!armed) return;
    const { tile, giver } = armed;
    if (isExchange(tile)) {
      if (!giver) {
        if (playerId) {
          armExchange(tile, playerId);
          return;
        }
        if (dropTile(tile, at)) setArmed(null);
        return;
      }
      const result = exchangeLine(scene, tile, giver, { playerId, at }, color, width, nextZ(scene));
      if ("error" in result) {
        toast(result.error, true);
        return;
      }
      applyScene(result.scene, tile.label);
      setStatus(result.message);
      setArmed(null);
      return;
    }
    // One placement, then back to Select whether or not it landed.
    setArmed(null);
    if (playerId) giveTile(tile, [playerId]);
    else dropTile(tile, at);
  };
  // Another tool puts a loaded route away.
  useEffect(() => {
    if (tool !== "select") setArmed(null);
  }, [tool]);

  /** Gives the tile's job to these players; false when it couldn't (the coach is told why). */
  const giveTile = (tile: Tile, playerIds: string[]) => {
    const result = applyTile(scene, tile, playerIds, color, width, nextZ(scene));
    if ("error" in result) {
      toast(result.error, true);
      return false;
    }
    applyScene(result.scene, tile.label);
    setStatus(result.message);
    picked();
    return true;
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const tileId = e.dataTransfer.getData("text/grid1ronvault-route");
    if (tileId) {
      const tile = [...OUR_TREE, ...FIVE_SET, ...MORE_TILES].find((t) => t.id === tileId);
      const svg = (e.currentTarget as HTMLElement).querySelector("svg");
      if (!tile || !svg) return;
      const r = svg.getBoundingClientRect();
      const target = playerAt(scene, {
        x: ((e.clientX - r.left) / r.width) * CANVAS_W,
        y: ((e.clientY - r.top) / r.height) * CANVAS_H,
      });
      const at = { x: ((e.clientX - r.left) / r.width) * CANVAS_W, y: ((e.clientY - r.top) / r.height) * CANVAS_H };
      if (isExchange(tile) && target) {
        // Dropped on a player: he has the ball, and the next click says who gets it.
        armExchange(tile, target.id);
        return;
      }
      if (!target) {
        dropTile(tile, at);
        return;
      }
      setSelection([target.id]);
      giveTile(tile, [target.id]);
      return;
    }
    const code = e.dataTransfer.getData("text/grid1ronvault-token");
    if (!code) return;
    const preset = [...offense, ...DEFENSE_TOKENS].find((t) => t.code === code);
    const svg = (e.currentTarget as HTMLElement).querySelector("svg");
    if (!preset || !svg) return;
    const r = svg.getBoundingClientRect();
    placeToken(preset, {
      x: ((e.clientX - r.left) / r.width) * CANVAS_W,
      y: ((e.clientY - r.top) / r.height) * CANVAS_H,
    });
  };

  return (
    <div className="builder dz">
      <h1 className="sr-only">Play designer — {meta.name.trim() || "untitled play"}</h1>

      <header className="dz-top" role="toolbar" aria-label="Play actions">
        <button
          type="button"
          className={`dz-top-btn dz-sheet-only${railOpen ? " is-on" : ""}`}
          onClick={() => setRailOpen((v) => !v)}
          aria-expanded={railOpen}
          aria-controls="dz-tools"
        >
          <Icon name="multiselect" size={15} /> Tools
        </button>
        <Link to="/" className="dz-brand">
          <Mark size={30} />
          <b>GridIronVault</b>
        </Link>
        <span className="dz-kicker">Play designer</span>
        <span className="dz-name">{meta.name.trim() || "Untitled play"}</span>
        {lineup && (
          <div className="dz-step" role="group" aria-label={`Plays in ${lineup.book ? lineup.book.name : "your Vault"}`}>
            <Tooltip title="Previous play" hint={`Opens ${stepName(-1)}. Unsaved changes are saved first.`} shortcut="[" side="bottom">
              <button type="button" className="dz-top-btn dz-step-btn" onClick={() => void goPlay(-1)} disabled={saving} aria-label={`Previous play: ${stepName(-1)}`}>
                <Icon name="prev" size={15} />
              </button>
            </Tooltip>
            <span className="dz-step-count">
              {lineup.at + 1} / {lineup.ids.length}
            </span>
            <Tooltip title="Next play" hint={`Opens ${stepName(1)}. Unsaved changes are saved first.`} shortcut="]" side="bottom">
              <button type="button" className="dz-top-btn dz-step-btn" onClick={() => void goPlay(1)} disabled={saving} aria-label={`Next play: ${stepName(1)}`}>
                <Icon name="next" size={15} />
              </button>
            </Tooltip>
          </div>
        )}

        <WorkTabs current="designer" tone="dark" onGo={(href) => void openFromTree(href)} />

        <div className="dz-top-actions">
          <label className="dz-zoom">
            <input
              type="range"
              min={ZOOM_MIN * 100}
              max={ZOOM_MAX * 100}
              value={Math.round(zoom * 100)}
              onChange={(e) => zoomTo(Number(e.target.value) / 100)}
              aria-label="Zoom"
            />
            <span>{Math.round(zoom * 100)}%</span>
          </label>
          <div className="dz-zoom-btns dz-short-only" role="group" aria-label="Zoom">
            <ZoomButtons zoom={zoom} autoFit={autoFit} onZoom={zoomBy} onFit={() => setAutoFit(true)} />
          </div>
          <Tooltip title="Fit" hint="Sizes the field to fill the screen again after zooming. Ctrl + scroll or a trackpad pinch zooms." side="bottom">
            <button type="button" className={`dz-top-btn dz-fit${autoFit ? " is-on" : ""}`} aria-pressed={autoFit} onClick={() => setAutoFit(true)}>
              Fit
            </button>
          </Tooltip>
          <Tooltip title="Play details" hint="Name, formation, tags and notes for the play, plus the settings of whatever you have selected." side="bottom">
            <button
              type="button"
              className={`dz-top-btn dz-wide${sideOpen ? " is-on" : ""}`}
              onClick={() => setSideOpen((v) => !v)}
              aria-expanded={sideOpen}
              aria-controls="play-details"
            >
              Details
            </button>
          </Tooltip>
          <Tooltip title="Run play" hint="Animates every route from the snap, and can sit beside game film to check timing." side="bottom">
            <button type="button" className="dz-top-btn dz-wide" onClick={() => setRunning(true)}>
              Run play
            </button>
          </Tooltip>
          <Tooltip title="Export" hint="Download the play as a picture or PDF, or print it as a wristband card." side="bottom">
            <button type="button" className="dz-top-btn dz-wide" onClick={() => setExporting(true)}>
              Export
            </button>
          </Tooltip>
          {dirty || saving ? (
            <Tooltip title="Save play" hint="Keeps it in your Vault. Signed in, it also goes to your account so it's on every device." side="bottom">
              <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={saving}>
                {saving ? "Saving…" : "Save play"}
              </button>
            </Tooltip>
          ) : (
            <span className="dz-saved" role="status">
              <Icon name="check" size={14} /> Saved
            </span>
          )}
          {/* Extras: undo, field, Vs defense, upload and the rest, in one drop-down so the bar has room for the tabs. */}
          <div className="dz-more">
            <Tooltip title="Extras" hint="Undo and redo, route depths, clean up, the field, field controls, Vs defense, upload, more tools and help." side="bottom">
              <button
                type="button"
                ref={moreBtn}
                className={`dz-top-btn${moreOpen ? " is-on" : ""}${depths || underPlay ? " has-dot" : ""}`}
                onClick={() => setMoreOpen((v) => !v)}
                aria-expanded={moreOpen}
                aria-controls="dz-more-menu"
                aria-haspopup="menu"
              >
                Extras <Icon name="chevron" size={13} />
              </button>
            </Tooltip>
            {moreOpen && (
              <>
                <div className="stage-menu-scrim" onPointerDown={() => setMoreOpen(false)} aria-hidden="true" />
                <div
                  className="dz-more-menu"
                  id="dz-more-menu"
                  role="menu"
                  aria-label="Extras"
                  onClick={(e) => (e.target as HTMLElement).closest("button, a") && setMoreOpen(false)}
                >
                  <p className="dz-more-head" role="presentation">Edit</p>
                  <div className="dz-more-pair" role="group" aria-label="Undo and redo">
                    <button type="button" role="menuitem" onClick={undo} disabled={!past.current.length}>
                      <Icon name="undo" size={15} /> Undo <kbd>⌘Z</kbd>
                    </button>
                    <button type="button" role="menuitem" onClick={redo} disabled={!future.current.length}>
                      <Icon name="redo" size={15} /> Redo <kbd>⇧⌘Z</kbd>
                    </button>
                  </div>
                  <button type="button" role="menuitem" onClick={cleanUpLines} disabled={!hasLines}>
                    <Icon name="sparkle" size={15} /> Clean up lines
                  </button>
                  <button type="button" role="menuitemcheckbox" aria-checked={depths} onClick={toggleDepths}>
                    Route depths: {depths ? "on" : "off"}
                  </button>
                  <button type="button" role="menuitem" onClick={selectAll}>
                    Select all
                  </button>

                  <p className="dz-more-head" role="presentation">Field</p>
                  <label className="dz-more-field" onClick={(e) => e.stopPropagation()}>
                    <span>Field</span>
                    <select
                      className="dz-top-select"
                      value={scene.view}
                      onChange={(e) => changeField(e.target.value as Scene["view"])}
                    >
                      {FIELD_VIEWS.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={`dz-more-field${underPlay ? " is-on" : ""}`} onClick={(e) => e.stopPropagation()}>
                    <span>Vs defense</span>
                    {overlaySelect("dz-top-select")}
                  </label>
                  <button type="button" role="menuitem" onClick={() => setFieldOpen(true)}>
                    Field controls: grid, hashes, rule lines
                  </button>

                  <p className="dz-more-head" role="presentation">Play</p>
                  <button type="button" role="menuitem" className="is-wide-dup" onClick={() => setSideOpen(true)}>
                    Play details
                  </button>
                  <button type="button" role="menuitem" className="is-wide-dup" onClick={() => setRunning(true)}>
                    Run play
                  </button>
                  <button type="button" role="menuitem" className="is-wide-dup" onClick={() => setExporting(true)}>
                    Export · print · wristband
                  </button>
                  <button type="button" role="menuitem" onClick={newPlay}>
                    New play…
                  </button>
                  <button
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={setupOn}
                    onClick={() => {
                      setSetupWanted(!setupOn);
                      setSetupOn(!setupOn);
                    }}
                  >
                    New play setup: {setupOn ? "on" : "off"}
                  </button>
                  <button type="button" role="menuitem" onClick={() => void flipToCopy()}>
                    Flip and save as a new play
                  </button>

                  <p className="dz-more-head" role="presentation">Go to</p>
                  {workTabs(loadWork(), playbooks, sheets, new Set(plays.map((p) => p.id)))
                    .filter((t) => t.id !== "designer")
                    .map((t) => (
                      <button key={t.id} type="button" role="menuitem" className="is-tabs-dup" onClick={() => void openFromTree(t.href)}>
                        {t.label}
                      </button>
                    ))}
                  <button type="button" role="menuitem" onClick={() => void openFromTree("/upload")}>
                    <Icon name="upload" size={15} /> Upload a whiteboard photo
                  </button>
                  <button type="button" role="menuitem" onClick={() => void openFromTree("/tools")}>
                    More tools
                  </button>
                  <button type="button" role="menuitem" onClick={() => void openFromTree("/vault")}>
                    Back to the Vault
                  </button>

                  <p className="dz-more-head" role="presentation">Help</p>
                  <button type="button" role="menuitem" onClick={() => setGuideOpen(true)}>
                    Your tools: show or hide{hiddenCount ? ` (${hiddenCount} hidden)` : ""}
                  </button>
                  <button type="button" role="menuitem" onClick={() => setTourOpen(true)}>
                    How the designer works
                  </button>
                  <button type="button" role="menuitemcheckbox" aria-checked={tipsOn} onClick={() => coachTips.setEnabled(!tipsOn)}>
                    Coach tips: {tipsOn ? "on" : "off"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {running && (
        <RunPlay
          scene={scene}
          name={meta.name}
          onFilm={(film) => applyScene({ ...scene, film }, "Film")}
          onClose={() => setRunning(false)}
        />
      )}

      <div className={`dz-body${sideOpen ? "" : " is-side-closed"}${railShown ? "" : " is-rail-closed"}`}>
        {/* Edge tabs: tuck either panel against its side for more field, and pull it back out. */}
        <button
          type="button"
          className={`dz-edge dz-edge-left${railShown ? "" : " is-closed"}`}
          onClick={() => setRailShown((v) => !v)}
          aria-expanded={railShown}
          aria-controls="dz-tools"
          aria-label={railShown ? "Hide the tools panel" : "Show the tools panel"}
          title={`${railShown ? "Hide" : "Show"} tools (Ctrl+\\ hides or shows both panels)`}
        >
          <Icon name="chevron" size={14} />
          {!railShown && <span>Tools</span>}
        </button>
        <button
          type="button"
          className={`dz-edge dz-edge-right${sideOpen ? "" : " is-closed"}`}
          onClick={() => setSideOpen((v) => !v)}
          aria-expanded={sideOpen}
          aria-controls="play-details"
          aria-label={sideOpen ? "Hide the play panel" : "Show the play panel"}
          title={`${sideOpen ? "Hide" : "Show"} Selection and Play (Ctrl+\\ hides or shows both panels)`}
        >
          <Icon name="chevron" size={14} />
          {!sideOpen && <span>Play</span>}
        </button>
        <aside className={`builder-rail${railOpen ? " is-open" : ""}`} id="dz-tools" aria-label="Drawing tools">
          <div className="dz-sheet-head">
            <span className="dz-sheet-grip" aria-hidden="true" />
            <h2>Tools</h2>
            <button type="button" className="dz-sheet-help" onClick={() => setTourOpen(true)} aria-label="How the designer works">
              ?
            </button>
            <label className="dz-keep">
              <input type="checkbox" checked={keepOpen} onChange={toggleKeepOpen} />
              Keep open
            </label>
            <button type="button" className="dz-top-btn is-on" onClick={() => setRailOpen(false)}>
              Done
            </button>
          </div>

          {/* Modes: how a press on the field behaves. Always in view, whichever tab is open. */}
          <div className="dz-modes" role="toolbar" aria-label="Modes">
            <Tooltip title="Select" hint="The default pointer. Click to pick an element, drag a box across several, drag to move them." shortcut="V">
              <button
                type="button"
                className={`dz-btn${tool === "select" && !mode ? " is-on" : ""}`}
                onClick={pickSelect}
                aria-pressed={tool === "select" && !mode}
              >
                Select
              </button>
            </Tooltip>
            {!prefs.hiddenGroups.includes("modes") &&
              MODES.filter((m) => shown(m.id)).map((m) => (
                <Tooltip key={m.id} title={m.title} hint={m.hint} shortcut={m.key}>
                  <button
                    type="button"
                    className={`dz-btn${mode === m.id ? " is-on" : ""}`}
                    onClick={() => pickMode(m.id)}
                    aria-pressed={mode === m.id}
                  >
                    {MODE_LABEL[m.id] ?? m.label}
                  </button>
                </Tooltip>
              ))}
          </div>
          {mode === "scale" && (
            <div className="dz-anchor">
              <p className="dz-sub">Fixed anchor</p>
              <div className="anchor-grid">
                {[0, 0.5, 1].flatMap((ay) =>
                  [0, 0.5, 1].map((ax) => (
                    <button
                      key={`${ax}-${ay}`}
                      type="button"
                      className={`anchor-dot${anchor.ax === ax && anchor.ay === ay ? " is-on" : ""}`}
                      onClick={() => setAnchor({ ax, ay })}
                      aria-label={`Anchor at ${ANCHOR_ROW[ay]} ${ANCHOR_COL[ax]}`}
                      aria-pressed={anchor.ax === ax && anchor.ay === ay}
                    />
                  )),
                )}
              </div>
              <p className="dz-note">The dot you pick stays put while the rest scales away from it.</p>
            </div>
          )}

          <div className="dz-tabs" role="tablist" aria-label="Tool sets">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`dz-tab-${t.id}`}
                aria-selected={railTab === t.id}
                aria-controls="dz-tabpanel"
                tabIndex={railTab === t.id ? 0 : -1}
                className={`${railTab === t.id ? "is-on" : ""}${t.id === "plays" ? " is-icon" : ""}`}
                onClick={() => railStore.show(t.id)}
                onKeyDown={onTabKey}
                aria-label={t.id === "plays" ? "Plays: your playbooks" : undefined}
                title={t.id === "plays" ? "Your playbooks" : undefined}
              >
                {t.id === "plays" ? <Icon name="folder" size={15} /> : t.label}
              </button>
            ))}
          </div>

          <div className="dz-tabpanel" role="tabpanel" id="dz-tabpanel" aria-labelledby={`dz-tab-${railTab}`}>
            {railTab === "draw" && (
              <>
                <RailGroup id="lines" title="Lines">
                  <div className="dz-grid">{RAIL_LINES.filter(shown).map((id) => toolButton(LINE_TOOLS.find((x) => x.id === id)!))}</div>
                </RailGroup>
                <RailGroup id="shapes" title="Shapes · Zones">
                  <div className="dz-grid">{RAIL_SHAPES.filter(shown).map((id) => toolButton(SHAPE_TOOLS.find((x) => x.id === id)!))}</div>
                </RailGroup>
              </>
            )}

            {railTab === "routes" && (
              <RailGroup id="routes" title="Route library">
                <RouteLibrary onPick={pickTile} armed={armed?.tile.id ?? null} />
              </RailGroup>
            )}

            {railTab === "players" && (
              <RailGroup id="players" title="Offense · Defense">
                <div className="dz-grid">
                  {(["offense", "defense"] as const).map((side) => (
                    <Tooltip
                      key={side}
                      title={side === "offense" ? "Offense players" : "Defense players"}
                      hint={`Shows the ${side} players below. Tap or click one to drop it on the field, or drag it to a spot.`}
                    >
                      <button
                        type="button"
                        className={`dz-btn${tray === side ? " is-on" : ""}`}
                        onClick={() => setTray((t) => (t === side ? null : side))}
                        aria-expanded={tray === side}
                        aria-controls="dz-token-tray"
                      >
                        {side === "offense" ? "Offense" : "Defense"}
                      </button>
                    </Tooltip>
                  ))}
                </div>
                {tray && (
                  <div className="dz-tray" id="dz-token-tray">
                    {(tray === "offense" ? offense : DEFENSE_TOKENS).map((t) => (
                      <Tooltip
                        key={t.code}
                        title={t.title}
                        hint={`${t.hint} Tap or click to drop it on the field, or drag it where you want it.`}
                      >
                        <button
                          type="button"
                          className="token-btn"
                          draggable
                          onDragStart={(e) => e.dataTransfer.setData("text/grid1ronvault-token", t.code)}
                          onClick={() => placeToken(t)}
                          aria-label={t.title}
                        >
                          <TokenGlyph preset={t} />
                        </button>
                      </Tooltip>
                    ))}
                  </div>
                )}
              </RailGroup>
            )}

            {railTab === "sets" && (
              <>
                <RailGroup id="sets" title="Libraries · Layers">
                  <div className="dz-grid dz-grid-3">
                    {(["formations", "defense", "layers"] as const).map((list) => (
                      <Tooltip
                        key={list}
                        title={list === "formations" ? "Formation library" : list === "defense" ? "Defense library" : "Layers"}
                        hint={
                          list === "formations"
                            ? "Pick 5v5, 7v7 or 11-man and a formation, and the whole offense drops in at once."
                            : list === "defense"
                              ? "Pick a front and a coverage, and the defense lines up against the offense on the field."
                              : "Everything on the field as a list. Pick locked or hidden items here, since they can't be picked on the field."
                        }
                      >
                        <button
                          type="button"
                          className={`dz-btn${lists === list ? " is-on" : ""}`}
                          onClick={() => setLists((l) => (l === list ? null : list))}
                          aria-expanded={lists === list}
                          aria-controls="dz-list-tray"
                        >
                          {list === "formations" ? "Formations" : list === "defense" ? "Defense" : "Layers"}
                          {list === "layers" && scene.nodes.length > 0 && <b className="dz-count">{scene.nodes.length}</b>}
                        </button>
                      </Tooltip>
                    ))}
                  </div>
                  {lists === "formations" && <FormationLibrary tokens={offense} onDrop={applyFormation} />}
                  {lists === "defense" && <DefenseLibrary onDrop={applyDefense} />}
                  {lists === "layers" && (
                    <div className="dz-list" id="dz-list-tray">
                      {scene.nodes.length === 0 && <p className="dz-note">Nothing on the field yet.</p>}
                      {[...scene.nodes]
                        .sort((a, b) => b.z - a.z)
                        .map((n) => (
                          <button
                            key={n.id}
                            type="button"
                            className={`layer-item${selection.includes(n.id) ? " is-on" : ""}`}
                            onClick={() => setSelection([n.id])}
                            aria-pressed={selection.includes(n.id)}
                          >
                            <Icon
                              name={n.kind === "player" ? "user" : n.kind === "path" ? "arrow" : n.kind === "text" ? "text" : "rect"}
                              size={13}
                            />
                            <span>{describe(n)}</span>
                            {n.locked && <Icon name="lock" size={12} />}
                            {n.hidden && <Icon name="eye" size={12} />}
                          </button>
                        ))}
                    </div>
                  )}
                </RailGroup>
                <RailGroup id="format" title="Saved play format">
                  <FormatPanel dark>
                    <div className="pf-acts">
                      <button type="button" className="dz-btn" onClick={saveFormat}>
                        Save this play's format
                      </button>
                      <button type="button" className="dz-btn is-on" onClick={useFormat} disabled={!playFormat.format || !playFormat.parts.length}>
                        Apply to this play
                      </button>
                    </div>
                  </FormatPanel>
                </RailGroup>
              </>
            )}

            {railTab === "plays" && (
              <RailGroup id="plays" title="Your playbooks">
                <PlaybookTree idPrefix="dz-tree" activePlayId={existing?.id ?? null} activeBookId={params.get("book")} onOpen={openFromTree} quietTitle />
              </RailGroup>
            )}
          </div>

          <div className="dz-rail-foot">
            <span>{hiddenCount ? `${hiddenCount} hidden.` : "Too many tools?"}</span>
            <button type="button" onClick={() => setGuideOpen(true)}>
              {hiddenCount ? "Show or hide tools" : "Hide the ones you don't use"}
            </button>
            <button type="button" onClick={() => setTourOpen(true)}>
              How it works
            </button>
          </div>

          {/* Pinned to the foot of the rail: every color, weight, dash, curve and end in one place. */}
          <StyleCard
            scene={scene}
            selection={selection}
            onScene={applyScene}
            color={color}
            width={width}
            look={look}
            onColor={setColor}
            onWidth={setWidth}
            onLook={changeLook}
            onRoutes={() => {
              railStore.show("routes");
              showRail();
            }}
          />
        </aside>

        <main className="builder-main" id="main" ref={mainRef}>
          <GriddyComposer variant="bar" />
          {drawingTool && (
            <div className="dz-drawbar" role="toolbar" aria-label="Drawing tools">
              {draftPoints > 0 && (
                <div className="dz-drawbar-line" role="group" aria-label="Line being drawn">
                  <button type="button" className="is-on" onClick={() => canvasControl.current?.finish()} disabled={draftPoints < 2}>
                    <Icon name="check" size={14} /> Finish line <kbd>Enter</kbd>
                  </button>
                  <button type="button" onClick={() => canvasControl.current?.undoPoint()}>
                    <Icon name="undo" size={14} /> Undo point
                  </button>
                  <button type="button" onClick={() => canvasControl.current?.scrap()}>
                    <Icon name="close" size={14} /> Scrap
                  </button>
                </div>
              )}
              {(
                [
                  ["select", "Select", "V"],
                  ["line", "Line", "L"],
                  ["arc", "3-point arc", "A"],
                ] as const
              ).map(([id, label, key]) => (
                <button
                  key={id}
                  type="button"
                  className={tool === id ? "is-on" : ""}
                  aria-pressed={tool === id}
                  onClick={() => (id === "select" ? (setTool("select"), setMode(null)) : pickTool(id))}
                >
                  {label} <kbd>{key}</kbd>
                </button>
              ))}
              <span className="dz-drawbar-sep" aria-hidden="true" />
              {(
                [
                  ["snap", "Snap", "S"],
                  ["ortho", "Ortho", "O"],
                  ["polar", "Polar", "P"],
                ] as const
              ).map(([id, label, key]) => (
                <button key={id} type="button" className={aids[id] ? "is-on" : ""} aria-pressed={aids[id]} onClick={() => toggleAid(id)}>
                  {label} <kbd>{key}</kbd>
                </button>
              ))}
              <span className="dz-drawbar-sep" aria-hidden="true" />
              <button type="button" className={tool === "free" ? "is-on" : ""} aria-pressed={tool === "free"} onClick={() => pickTool("free")}>
                Freehand <kbd>F</kbd>
              </button>
              <button type="button" className="dz-drawbar-exit" onClick={() => (setTool("select"), setMode(null))}>
                Exit drawing<span className="dz-kbd-only"> · </span><kbd>Esc</kbd>
              </button>
            </div>
          )}

          {/* Phones and tablets have no Delete key or right-click, so the selection gets its own bar. */}
          {tool === "select" && selection.length > 0 && (
            <div className="dz-selbar" role="toolbar" aria-label="Selected elements">
              <span className="dz-selbar-count">{selection.length} selected</span>
              {barActions.map((a) => (
                <button key={a.id} type="button" className={a.danger ? "is-danger" : ""} onClick={() => a.run()} aria-label={a.label}>
                  {a.short}
                </button>
              ))}
              <button type="button" className="dz-selbar-done" onClick={() => setSelection([])}>
                Done
              </button>
            </div>
          )}

          <div className="dz-stage-wrap">
            <div
              ref={stageRef}
              className="builder-stage"
              onPointerDownCapture={onStageDownCapture}
              onDrop={onDrop}
              onDragOver={(e) => e.preventDefault()}
              role="group"
              aria-label="Play canvas"
            >
              <PlayCanvas
                scene={scene}
                selection={selection}
                tool={tool}
                mode={mode}
                color={color}
                width={width}
                look={lookOverride}
                grid={grid}
                depths={depths}
                rules={rules}
                anchor={anchor}
                zoom={zoom}
                watermark={tier.watermark ? "GRIDIRONVAULT" : null}
                onScene={applyScene}
                onSelection={setSelection}
                onToolDone={(placed) => {
                  // One placement and the tool goes back to Select; copy and paste repeats it.
                  setTool("select");
                  if (placed) setStatus("Back to Select. Right-click it to copy and paste another.");
                }}
                onStatus={setStatus}
                aids={aids}
                snapRadius={snapRadius}
                onPickNode={pickNode}
                onPickTool={(t) => (t === "select" ? (setTool("select"), setMode(null)) : pickTool(t))}
                nodeActions={nodeActions}
                fieldActions={fieldActions}
                onZoom={zoomBy}
                onPan={panBy}
                onDoubleTap={doubleTapZoom}
                onSignal={onSignal}
                onDraftChange={setDraftPoints}
                controlRef={canvasControl}
                underlay={underPlay?.scene ?? null}
                stamp={armed ? { label: armed.tile.label, place: stampTile } : null}
              />
            </div>
            <FloatingToolbar
              tool={tool}
              onTool={(t) => (t === "select" ? pickSelect() : pickTool(t))}
              color={selectedLines.length ? selectedLines[0].stroke : color}
              firstRead={!!selectedLines[0]?.firstRead}
              onRead={pickRead}
              width={selectedLines.length ? selectedLines[0].width : width}
              onWidth={pickWeight}
              ink={floatInk}
              onColor={pickColor}
              onUndo={undo}
              onRedo={redo}
              canUndo={past.current.length > 0}
              canRedo={future.current.length > 0}
              target={floatTarget}
            />
          </div>

          <div className="dz-status">
            <span role="status" aria-live="polite">
              {status}
            </span>
            {underPlay && (
              <span className="dz-vs-chip">
                Vs {underPlay.name}
                <button type="button" onClick={() => pickOverlay("")} aria-label={`Hide ${underPlay.name}`}>
                  <Icon name="close" size={12} />
                </button>
              </span>
            )}
            <span className="mono">
              {scene.nodes.length} elements · {selection.length} selected
            </span>
          </div>
        </main>

        {/* Phones: the thumb bar. Tools opens the sheet; the rest are the moves made most. */}
        <nav className="dz-dock" aria-label="Quick tools">
          <button type="button" className={railOpen ? "is-on" : ""} onClick={() => setRailOpen((v) => !v)} aria-expanded={railOpen} aria-controls="dz-tools">
            <Icon name="multiselect" size={18} />
            <span>Tools</span>
          </button>
          <button type="button" className={tool === "select" && !mode ? "is-on" : ""} onClick={pickSelect} aria-pressed={tool === "select" && !mode}>
            <Icon name="cursor" size={18} />
            <span>Select</span>
          </button>
          <button
            type="button"
            className={tool === "line" ? "is-on" : ""}
            onClick={() => (tool === "line" ? pickSelect() : pickTool("line"))}
            aria-pressed={tool === "line"}
          >
            <Icon name="arrow" size={18} />
            <span>Route</span>
          </button>
          <button
            type="button"
            onClick={() => {
              railStore.open("players");
              setTray((t) => t ?? "offense");
              setRailOpen(true);
              // After the sheet has slid up, bring the player tokens into view.
              window.setTimeout(() => document.getElementById("dz-token-tray")?.scrollIntoView({ block: "center", behavior: "smooth" }), 280);
            }}
          >
            <Icon name="user" size={18} />
            <span>Players</span>
          </button>
          <div className="dz-dock-zoom" role="group" aria-label="Zoom">
            <ZoomButtons zoom={zoom} autoFit={autoFit} onZoom={zoomBy} onFit={() => setAutoFit(true)} />
          </div>
        </nav>

        <aside className={`builder-side${sideOpen ? " is-open" : ""}`} id="play-details" aria-label="Play details">
          <div className="dz-side-head">
            <h2>Play details</h2>
            <button type="button" className="dz-top-btn is-on" onClick={() => setSideOpen(false)}>
              Done
            </button>
          </div>
          <Inspector
            key={id ?? "new"}
            scene={scene}
            selection={selection}
            meta={meta}
            onMeta={(patch) => (setMeta((m) => ({ ...m, ...patch })), setDirty(true))}
            onScene={applyScene}
            onSelection={setSelection}
            rules={rules}
            onRules={setRules}
            underlay={underPlay?.scene ?? null}
            opponent={{
              value: underPlay?.id ?? null,
              showing: underPlay?.name ?? null,
              defenses: overlayChoices.defenses,
              rest: overlayChoices.rest,
              onPick: pickOverlay,
            }}
            onField={changeField}
          />
        </aside>
      </div>

      {setup && (
        <PlaySetup
          initial={setup}
          books={playbooks}
          tokens={offense}
          onStart={startSetup}
          onSkip={() => {
            setSetupOn(setupWanted());
            setSetup(null);
          }}
        />
      )}
      {fieldOpen && (
        <FieldControls rules={rules} onRules={setRules} snapPlayers={aids.snap} onSnapPlayers={() => toggleAid("snap")} onClose={() => setFieldOpen(false)} />
      )}

      {exporting && (
        <ExportDialog
          plays={exportables}
          tier={tier}
          onClose={() => setExporting(false)}
          onUpgrade={() => navigate("/pricing")}
          onDone={(kind) => {
            track("play_exported", { kind });
            toast("Export downloaded. Check your browser's downloads folder.");
          }}
        />
      )}

      <CoachTip />
      {guideOpen && (
        <ToolsGuide
          tools={guideTools}
          onClose={() => setGuideOpen(false)}
          onTour={() => (setGuideOpen(false), setTourOpen(true))}
        />
      )}
      {tourOpen && <DesignerTour onClose={() => setTourOpen(false)} />}
    </div>
  );
}

/** − · Fit · + for screens without a mouse wheel; the % shows the current zoom. */
function ZoomButtons({
  zoom,
  autoFit,
  onZoom,
  onFit,
}: {
  zoom: number;
  autoFit: boolean;
  onZoom: (factor: number) => void;
  onFit: () => void;
}) {
  return (
    <>
      <button type="button" onClick={() => onZoom(1 / 1.25)} disabled={zoom <= ZOOM_MIN + 0.001} aria-label="Zoom out">
        <b aria-hidden="true">−</b>
      </button>
      <button type="button" className={autoFit ? "is-on" : ""} onClick={onFit} aria-pressed={autoFit} aria-label={`Fit the field to the screen (now ${Math.round(zoom * 100)}%)`}>
        <span>{autoFit ? "Fit" : `${Math.round(zoom * 100)}%`}</span>
      </button>
      <button type="button" onClick={() => onZoom(1.25)} disabled={zoom >= ZOOM_MAX - 0.001} aria-label="Zoom in">
        <b aria-hidden="true">+</b>
      </button>
    </>
  );
}

