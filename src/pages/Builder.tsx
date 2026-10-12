import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Icon } from "../components/Icon";
import { Tooltip } from "../components/Tooltip";
import { PlayCanvas, type DrawAids } from "../components/PlayCanvas";
import { Inspector } from "../components/Inspector";
import { ExportDialog } from "../components/ExportDialog";
import { Mark } from "../components/Shell";
import { TokenGlyph } from "../components/TokenGlyph";
import { FormationLibrary } from "../components/FormationLibrary";
import { RailGroup } from "../components/RailGroup";
import { RouteLibrary } from "../components/RouteLibrary";
import { FormatPanel } from "../components/FormatPanel";
import { RunPlay } from "../components/RunPlay";
import { applyFormat, formatStore, usePlayFormat } from "../lib/playFormat";
import { applyTile, MORE_TILES, FIVE_SET, OUR_TREE, playerAt, type Tile } from "../lib/routeLibrary";
import { DefenseLibrary } from "../components/DefenseLibrary";
import { PlayAssistant } from "../components/PlayAssistant";
import type { AssistantRead } from "../lib/assistant";
import { FIELD_VIEWS } from "../lib/field";
import { LINE_TOOLS, MODES, SHAPE_TOOLS, type ModeId, type ToolId } from "../lib/tools";
import {
  DEFENSE_TOKENS,
  emptyScene,
  makePlayer,
  type TokenPreset,
} from "../lib/presets";
import { cloneNodes, describe, nextZ, reconcileConnections } from "../lib/scene";
import { CANVAS_H, CANVAS_W, DEFAULT_STROKE, PALETTE, STROKE_WEIGHTS, uid } from "../lib/types";
import type { PlayMeta, PlayerNode, Scene, SceneNode, StoredPlay } from "../lib/types";
import { store, useStore } from "../lib/store";
import { api, toStoredPlay } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useTier } from "../lib/tier";
import { gateSave, gateTool } from "../lib/plan";
import { useToast } from "../lib/toast";
import { useCaptureGuard } from "../lib/guard";
import { track } from "../lib/track";
import { usePositionTokens } from "../lib/positions";
import { tokenFor, type Placed } from "../lib/formations";
import { defenseNodes, describeDefense, layoutDefense, type Coverage, type Front } from "../lib/defense";
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

const ANCHOR_ROW: Record<number, string> = { 0: "top", 0.5: "middle", 1: "bottom" };
const ANCHOR_COL: Record<number, string> = { 0: "left", 0.5: "centre", 1: "right" };

/* Tool rail, grouped and labelled as on the Grid1ron Design canvas. */
/** Tools that draw lines; the drawing bar shows while one is out. */
const DRAW_TOOLS: ToolId[] = ["line", "arc", "dashed", "block", "motion", "free", "pen"];

const RAIL_LINES: ToolId[] = ["line", "arc", "dashed", "block", "motion", "pen", "free", "connect", "pivot"];
const RAIL_SHAPES: ToolId[] = ["zone", "polygon", "text", "rect", "ellipse"];
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

export function Builder() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { account } = useAuth();
  const tier = useTier();
  const plays = useStore((s) => s.plays);
  const offense = usePositionTokens();

  const existing = useMemo(() => plays.find((p) => p.id === id) ?? null, [plays, id]);

  const [scene, setScene] = useState<Scene>(() => existing?.scene ?? emptyScene());
  const [meta, setMeta] = useState<PlayMeta>(() => existing ?? blankMeta);
  const [selection, setSelection] = useState<string[]>([]);
  const [tool, setTool] = useState<ToolId>("select");
  const [mode, setMode] = useState<ModeId | null>(null);
  const [color, setColor] = useState(PALETTE[0]);
  const [width, setWidth] = useState(DEFAULT_STROKE);
  const [grid, setGrid] = useState(0);
  const [anchor, setAnchor] = useState({ ax: 0.5, ay: 0.5 });
  const [zoom, setZoom] = useState(0.86);
  // The field fits the stage (phone, iPad, laptop) until the coach picks a zoom himself.
  const [autoFit, setAutoFit] = useState(true);
  const stageRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = stageRef.current;
    if (!el || !autoFit) return;
    const fit = () => {
      const pad = 36;
      // Width only: the stage grows with the field, so its height would chase the zoom.
      const z = (el.clientWidth - pad) / CANVAS_W;
      setZoom(Math.max(0.25, Math.min(1.4, Math.floor(z * 100) / 100)));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [autoFit]);
  const [status, setStatus] = useState("Drop a formation, then draw the routes. Hover any tool to see how it works.");
  const [exporting, setExporting] = useState(false);
  const [sideOpen, setSideOpen] = useState(wideScreen);
  const [tray, setTray] = useState<"offense" | "defense" | null>("offense");
  const [lists, setLists] = useState<"formations" | "defense" | "layers" | null>(null);
  const [railOpen, setRailOpen] = useState(false);
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
    past.current = [];
    future.current = [];
    setDirty(false);
  }, [id, existing]);

  const sceneRefValue = useRef(scene);
  sceneRefValue.current = scene;

  const applyScene = useCallback((next: Scene, label?: string) => {
    if (label) {
      past.current = [...past.current.slice(-59), sceneRefValue.current];
      future.current = [];
      setStatus(label);
    }
    sceneRefValue.current = next;
    setScene(next);
    setDirty(true);
  }, []);

  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current = [sceneRefValue.current, ...future.current.slice(0, 59)];
    sceneRefValue.current = prev;
    setScene(prev);
    setStatus("Undone.");
  }, []);

  const redo = useCallback(() => {
    const [next, ...rest] = future.current;
    if (!next) return;
    future.current = rest;
    past.current = [...past.current, sceneRefValue.current];
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
  };

  const drawAssistant = (nodes: SceneNode[], read: AssistantRead) => {
    const group = uid("grp");
    const grouped = nodes.map((n) => ({ ...n, groupId: group }));
    applyScene({ ...scene, nodes: [...scene.nodes, ...grouped] }, `Assistant: ${read.name}`);
    setSelection(grouped.map((n) => n.id));
    setMeta((m) => ({ ...m, name: m.name || read.name, formation: m.formation || read.formation }));
    setStatus(`Drew ${read.name}. Drag, restyle or undo it like anything else.`);
  };

  const applyDefense = (set: { front: Front; coverage: Coverage; show: boolean }) => {
    // Line up on the ball: the center if there is one, else the middle of the field.
    const players = scene.nodes.filter((n): n is PlayerNode => n.kind === "player" && !n.hidden);
    const center = players.find((p) => p.side === "offense" && p.label === "C");
    const ball = { x: center?.x ?? CANVAS_W / 2, y: scene.losY };
    const offense = players.filter((p) => p.side === "offense");
    const hasLine = offense.some((p) => p.shape === "square" && !p.label);
    const receivers = offense
      .filter((p) => p.label && p.label !== "Q" && !(hasLine && p.label === "C"))
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
  };

  const pickTool = (next: ToolId) => {
    const gate = gateTool(tier, next);
    if (!gate.ok) {
      toast(gate.reason, true);
      return;
    }
    setTool(next);
    setMode(null);
  };

  const pickMode = (next: ModeId) => {
    setTool("select");
    setMode((m) => (m === next ? null : next));
  };

  const duplicateSelection = () => {
    if (!selection.length) return;
    const source = scene.nodes.filter((n) => selection.includes(n.id));
    const copies = cloneNodes(source, 26, 26).map((n, i) => ({ ...n, z: nextZ(scene) + i }));
    applyScene({ ...scene, nodes: [...scene.nodes, ...copies] }, "Duplicate");
    setSelection(copies.map((n) => n.id));
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
      if (meta_) return;

      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        deleteSelection();
        return;
      }
      if (e.key === "Escape") {
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
  }, [scene, selection, undo, redo, tier, tool, drawingTool]);

  /* ------------------------------------------------------------------- save */

  async function save() {
    if (!meta.name.trim()) {
      toast("Give the play a name first — that is what you will search for later.", true);
      return;
    }
    const isNew = !existing;
    if (isNew) {
      const gate = gateSave(tier, plays.length);
      if (!gate.ok) {
        toast(gate.reason, true);
        navigate("/pricing");
        return;
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
        if (stored.id !== record.id) store.removePlay(record.id);
        store.upsertPlay(stored);
        setDirty(false);
        toast("Saved to your Vault and your account.");
        if (!existing) navigate(`/build/${stored.id}`, { replace: true });
      } else {
        setDirty(false);
        toast("Saved in this browser. Sign in to keep it across devices.");
        if (!existing) navigate(`/build/${record.id}`, { replace: true });
      }
      track("play_created", { formation: record.formation, type: record.playType });
    } catch (error) {
      toast(error instanceof Error ? error.message : "The save did not reach the cloud. It is safe in this browser.", true);
      setDirty(false);
    } finally {
      setSaving(false);
    }
  }

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

  const giveTile = (tile: Tile, playerIds: string[]) => {
    const result = applyTile(scene, tile, playerIds, color, width, nextZ(scene));
    if ("error" in result) {
      toast(result.error, true);
      return;
    }
    applyScene(result.scene, tile.label);
    setStatus(result.message);
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
      if (!target) {
        toast(`Drop ${tile.label} right on a player.`, true);
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
          className="dz-top-btn only-narrow"
          onClick={() => setRailOpen((v) => !v)}
          aria-label="Drawing tools"
          aria-expanded={railOpen}
        >
          <Icon name="multiselect" size={15} />
        </button>
        <Link to="/" className="dz-brand">
          <Mark size={30} />
          <b>GridIronVault</b>
        </Link>
        <span className="dz-kicker">Play designer</span>
        <span className="dz-name">{meta.name.trim() || "Untitled play"}</span>

        <div className="dz-top-actions">
          <Tooltip title="Undo" hint="Steps back through everything you have drawn this session." shortcut="⌘Z" side="bottom">
            <button type="button" className="dz-top-btn" onClick={undo} disabled={!past.current.length}>
              Undo
            </button>
          </Tooltip>
          <Tooltip title="Redo" hint="Puts back the last thing you undid." shortcut="⇧⌘Z" side="bottom">
            <button type="button" className="dz-top-btn" onClick={redo} disabled={!future.current.length}>
              Redo
            </button>
          </Tooltip>
          <Tooltip title="Snap to grid" hint="Locks every drop point to a grid so tokens and routes line up exactly." side="bottom">
            <button
              type="button"
              className={`dz-top-btn${grid ? " is-on" : ""}`}
              onClick={() => setGrid((g) => (g ? 0 : 20))}
              aria-pressed={grid > 0}
            >
              {grid ? "Grid on" : "Grid off"}
            </button>
          </Tooltip>
          <select
            className="dz-top-select"
            value={scene.view}
            onChange={(e) => applyScene({ ...scene, view: e.target.value as Scene["view"] }, "Field view")}
            aria-label="Field"
          >
            {FIELD_VIEWS.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
          <label className="dz-zoom">
            <input
              type="range"
              min={25}
              max={140}
              value={Math.round(zoom * 100)}
              onChange={(e) => {
                setAutoFit(false);
                setZoom(Number(e.target.value) / 100);
              }}
              aria-label="Zoom"
            />
            <span>{Math.round(zoom * 100)}%</span>
          </label>
          <button type="button" className={`dz-top-btn${autoFit ? " is-on" : ""}`} aria-pressed={autoFit} onClick={() => setAutoFit(true)}>
            Fit
          </button>
          <button
            type="button"
            className={`dz-top-btn${sideOpen ? " is-on" : ""}`}
            onClick={() => setSideOpen((v) => !v)}
            aria-expanded={sideOpen}
            aria-controls="play-details"
          >
            Details
          </button>
          <button type="button" className="dz-top-btn" onClick={() => setRunning(true)}>
            Run play
          </button>
          <button type="button" className="dz-top-btn" onClick={() => setExporting(true)}>
            Export
          </button>
          {dirty || saving ? (
            <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save play"}
            </button>
          ) : (
            <span className="dz-saved" role="status">
              <Icon name="check" size={14} /> Saved
            </span>
          )}
          <Link to="/upload" className="btn btn-outline-dark btn-sm">
            <Icon name="upload" size={14} /> Upload
          </Link>
          <Link to="/tools" className="btn btn-outline-dark btn-sm">
            More tools
          </Link>
          <Link to="/vault" className="dz-back">
            Back to the Vault
          </Link>
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

      <div className={`dz-body${sideOpen ? "" : " is-side-closed"}`}>
        <aside className={`builder-rail${railOpen ? " is-open" : ""}`} aria-label="Drawing tools">
          <RailGroup id="modes" title="Modes">
            <div className="dz-grid">
              <Tooltip
                title="Select"
                hint="The default pointer. Click to pick an element, drag a box across several, drag to move them."
                shortcut="V"
              >
                <button
                  type="button"
                  className={`dz-btn${tool === "select" && !mode ? " is-on" : ""}`}
                  onClick={() => (setTool("select"), setMode(null))}
                  aria-pressed={tool === "select" && !mode}
                >
                  Select
                </button>
              </Tooltip>
              {MODES.map((m) => (
                <Tooltip key={m.id} title={m.title} hint={m.hint} shortcut={m.key}>
                  <button
                    type="button"
                    className={`dz-btn${mode === m.id ? " is-on" : ""}`}
                    onClick={() => pickMode(m.id)}
                    aria-pressed={mode === m.id}
                  >
                    {m.label}
                  </button>
                </Tooltip>
              ))}
            </div>
            {mode === "scale" && (
              <>
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
              </>
            )}
          </RailGroup>

          <RailGroup id="lines" title="Lines · Routes">
            <div className="dz-grid">
              {RAIL_LINES.map((id) => {
                const t = LINE_TOOLS.find((x) => x.id === id)!;
                const locked = !gateTool(tier, t.id).ok;
                return (
                  <Tooltip
                    key={t.id}
                    title={t.title}
                    hint={locked ? `${t.hint} — unlocks with any paid plan.` : t.hint}
                    shortcut={t.key}
                  >
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
              })}
            </div>
          </RailGroup>

          <RailGroup id="routes" title="Route library">
            <RouteLibrary onPick={(tile) => giveTile(tile, tileTargets(selection))} />
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

          <RailGroup id="ink" title="Ink · Weight" summary={<><i className="dz-ink" style={{ background: color }} aria-hidden="true" />{STROKE_WEIGHTS.indexOf(width) + 1 || width}px</>}>
            <div className="dz-grid">
              {RAIL_INKS.map((ink) => (
                <button
                  key={ink.color}
                  type="button"
                  className={`dz-btn${color === ink.color ? " is-on" : ""}`}
                  onClick={() => setColor(ink.color)}
                  aria-pressed={color === ink.color}
                  aria-label={`Draw in ${ink.name}`}
                >
                  <i className="dz-ink" style={{ background: ink.color }} aria-hidden="true" />
                  {ink.name}
                </button>
              ))}
              {STROKE_WEIGHTS.slice(0, 3).map((w, i) => (
                <Tooltip
                  key={w}
                  title={`${i + 1}px line`}
                  hint="Heavier lines read better on a wristband card; lighter lines suit install sheets."
                >
                  <button
                    type="button"
                    className={`dz-btn${width === w ? " is-on" : ""}`}
                    onClick={() => setWidth(w)}
                    aria-pressed={width === w}
                    aria-label={`Line weight ${i + 1}px`}
                  >
                    {i + 1}px
                  </button>
                </Tooltip>
              ))}
            </div>
          </RailGroup>

          <RailGroup id="shapes" title="Shapes · Zones">
            <div className="dz-grid">
              {RAIL_SHAPES.map((id) => {
                const t = SHAPE_TOOLS.find((x) => x.id === id)!;
                const locked = !gateTool(tier, t.id).ok;
                return (
                  <Tooltip
                    key={t.id}
                    title={t.title}
                    hint={locked ? `${t.hint} — unlocks with any paid plan.` : t.hint}
                    shortcut={t.key}
                  >
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
              })}
            </div>
          </RailGroup>

          <RailGroup id="players" title="Offense · Defense">
            <div className="dz-grid">
              {(["offense", "defense"] as const).map((side) => (
                <button
                  key={side}
                  type="button"
                  className={`dz-btn${tray === side ? " is-on" : ""}`}
                  onClick={() => setTray((t) => (t === side ? null : side))}
                  aria-expanded={tray === side}
                  aria-controls="dz-token-tray"
                >
                  {side === "offense" ? "Offense" : "Defense"}
                </button>
              ))}
            </div>
            {tray && (
              <div className="dz-tray" id="dz-token-tray">
                {(tray === "offense" ? offense : DEFENSE_TOKENS).map((t) => (
                  <Tooltip
                    key={t.code}
                    title={t.title}
                    hint={`${t.hint} Click to drop it on the field, or drag it where you want it.`}
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

          <RailGroup id="sets" title="Libraries · Layers">
            <div className="dz-grid dz-grid-3">
              {(["formations", "defense", "layers"] as const).map((list) => (
                <button
                  key={list}
                  type="button"
                  className={`dz-btn${lists === list ? " is-on" : ""}`}
                  onClick={() => setLists((l) => (l === list ? null : list))}
                  aria-expanded={lists === list}
                  aria-controls="dz-list-tray"
                >
                  {list === "formations" ? "Formations" : list === "defense" ? "Defense" : "Layers"}
                  {list === "layers" && scene.nodes.length > 0 && <b className="dz-count">{scene.nodes.length}</b>}
                </button>
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
        </aside>

        <main className="builder-main" id="main">
          <PlayAssistant scene={scene} tokens={offense} plays={plays} nextZ={nextZ(scene)} onDraw={drawAssistant} />
          {drawingTool && (
            <div className="dz-drawbar" role="toolbar" aria-label="Drawing tools">
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
                Exit drawing · <kbd>Esc</kbd>
              </button>
            </div>
          )}

          <div
            ref={stageRef}
            className="builder-stage"
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
              grid={grid}
              anchor={anchor}
              zoom={zoom}
              watermark={tier.watermark ? "GRIDIRONVAULT" : null}
              onScene={applyScene}
              onSelection={setSelection}
              onToolDone={() => setTool("select")}
              onStatus={setStatus}
              aids={aids}
              onPickNode={pickNode}
              onPickTool={(t) => (t === "select" ? (setTool("select"), setMode(null)) : pickTool(t))}
            />
          </div>

          <div className="dz-status">
            <span role="status" aria-live="polite">
              {status}
            </span>
            <span className="mono">
              {scene.nodes.length} elements · {selection.length} selected
            </span>
          </div>
        </main>

        <aside className={`builder-side${sideOpen ? " is-open" : ""}`} id="play-details" aria-label="Play details">
          <Inspector
            scene={scene}
            selection={selection}
            meta={meta}
            onMeta={(patch) => (setMeta((m) => ({ ...m, ...patch })), setDirty(true))}
            onScene={applyScene}
            onSelection={setSelection}
          />
        </aside>
      </div>

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
    </div>
  );
}

