import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Icon } from "../components/Icon";
import { Tooltip } from "../components/Tooltip";
import { PlayCanvas } from "../components/PlayCanvas";
import { Inspector } from "../components/Inspector";
import { ExportDialog } from "../components/ExportDialog";
import { Mark } from "../components/Shell";
import { TokenGlyph } from "../components/TokenGlyph";
import { FormationLibrary } from "../components/FormationLibrary";
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
import type { PlayMeta, Scene, StoredPlay } from "../lib/types";
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
const RAIL_LINES: ToolId[] = ["line", "dashed", "block", "motion", "pen", "free", "connect", "pivot"];
const RAIL_SHAPES: ToolId[] = ["zone", "polygon", "text", "rect", "ellipse"];
const RAIL_LABEL: Partial<Record<ToolId, string>> = {
  line: "Solid",
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
  const [status, setStatus] = useState("Drop a formation, then draw the routes. Hover any tool to see how it works.");
  const [exporting, setExporting] = useState(false);
  const [sideOpen, setSideOpen] = useState(wideScreen);
  const [tray, setTray] = useState<"offense" | "defense" | null>("offense");
  const [lists, setLists] = useState<"formations" | "layers" | null>(null);
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
  }, [scene, selection, undo, redo, tier]);

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

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
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
          <b>Grid1ronVault</b>
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
              min={40}
              max={140}
              value={Math.round(zoom * 100)}
              onChange={(e) => setZoom(Number(e.target.value) / 100)}
              aria-label="Zoom"
            />
            <span>{Math.round(zoom * 100)}%</span>
          </label>
          <button
            type="button"
            className={`dz-top-btn${sideOpen ? " is-on" : ""}`}
            onClick={() => setSideOpen((v) => !v)}
            aria-expanded={sideOpen}
            aria-controls="play-details"
          >
            Details
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

      <div className={`dz-body${sideOpen ? "" : " is-side-closed"}`}>
        <aside className={`builder-rail${railOpen ? " is-open" : ""}`} aria-label="Drawing tools">
          <section className="dz-group" aria-labelledby="dz-modes">
            <h2 id="dz-modes">Modes</h2>
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
          </section>

          <section className="dz-group" aria-labelledby="dz-lines">
            <h2 id="dz-lines">Lines · Routes</h2>
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
          </section>

          <section className="dz-group" aria-labelledby="dz-ink">
            <h2 id="dz-ink">Ink · Weight</h2>
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
          </section>

          <section className="dz-group" aria-labelledby="dz-shapes">
            <h2 id="dz-shapes">Shapes · Zones</h2>
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
          </section>

          <section className="dz-group" aria-labelledby="dz-players">
            <h2 id="dz-players">Offense · Defense</h2>
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
          </section>

          <section className="dz-group" aria-labelledby="dz-sets">
            <h2 id="dz-sets">Formations · Layers</h2>
            <div className="dz-grid">
              {(["formations", "layers"] as const).map((list) => (
                <button
                  key={list}
                  type="button"
                  className={`dz-btn${lists === list ? " is-on" : ""}`}
                  onClick={() => setLists((l) => (l === list ? null : list))}
                  aria-expanded={lists === list}
                  aria-controls="dz-list-tray"
                >
                  {list === "formations" ? "Formations" : "Layers"}
                  {list === "layers" && scene.nodes.length > 0 && <b className="dz-count">{scene.nodes.length}</b>}
                </button>
              ))}
            </div>
            {lists === "formations" && <FormationLibrary tokens={offense} onDrop={applyFormation} />}
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
          </section>
        </aside>

        <main className="builder-main" id="main">
          <div
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
              watermark={tier.watermark ? "GRID1RONVAULT" : null}
              onScene={applyScene}
              onSelection={setSelection}
              onToolDone={() => setTool("select")}
              onStatus={setStatus}
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

