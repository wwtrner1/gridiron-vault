import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Icon } from "../components/Icon";
import { Panel } from "../components/Panel";
import { Tooltip } from "../components/Tooltip";
import { PlayCanvas } from "../components/PlayCanvas";
import { Inspector } from "../components/Inspector";
import { ExportDialog } from "../components/ExportDialog";
import { Mark } from "../components/Shell";
import { FIELD_VIEWS } from "../lib/field";
import { LINE_TOOLS, MODES, SHAPE_TOOLS, type ModeId, type ToolId } from "../lib/tools";
import {
  DEFENSE_TOKENS,
  FORMATION_PRESETS,
  OFFENSE_TOKENS,
  buildFormation,
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

export function Builder() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { account } = useAuth();
  const tier = useTier();
  const plays = useStore((s) => s.plays);

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
  const [sideOpen, setSideOpen] = useState(false);
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

  const applyFormation = (preset: (typeof FORMATION_PRESETS)[number]) => {
    const nodes = buildFormation(preset, scene.losY);
    applyScene({ ...scene, nodes: [...scene.nodes, ...nodes] }, `${preset.name} set`);
    setSelection(nodes.map((n) => n.id));
    if (!meta.formation) setMeta((m) => ({ ...m, formation: preset.name }));
    setStatus(preset.note);
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
    const preset = [...OFFENSE_TOKENS, ...DEFENSE_TOKENS].find((t) => t.code === code);
    const svg = (e.currentTarget as HTMLElement).querySelector("svg");
    if (!preset || !svg) return;
    const r = svg.getBoundingClientRect();
    placeToken(preset, {
      x: ((e.clientX - r.left) / r.width) * CANVAS_W,
      y: ((e.clientY - r.top) / r.height) * CANVAS_H,
    });
  };

  return (
    <div className="builder">
      <h1 className="sr-only">Play designer — {meta.name.trim() || "untitled play"}</h1>

      <aside className={`builder-rail${railOpen ? " is-open" : ""}`} aria-label="Drawing tools">
        <Link to="/vault" className="rail-brand">
          <Mark size={26} />
          <span>
            <b>Grid1ronVault</b>
            <small>PLAY DESIGNER</small>
          </span>
        </Link>

        <Panel title="Modes" icon="cursor" count={activeMode ? activeMode.label : "off"}>
          <div className="tool-row">
            <Tooltip
              title="Select"
              hint="The default pointer. Click to pick an element, drag a box across several, drag to move them."
              shortcut="V"
            >
              <button
                type="button"
                className={`tool-wide${tool === "select" && !mode ? " is-on" : ""}`}
                onClick={() => (setTool("select"), setMode(null))}
                aria-pressed={tool === "select" && !mode}
              >
                <Icon name="cursor" size={15} />
                <span>Select</span>
              </button>
            </Tooltip>
            {MODES.map((m) => (
              <Tooltip key={m.id} title={m.title} hint={m.hint} shortcut={m.key}>
                <button
                  type="button"
                  className={`tool-wide${mode === m.id ? " is-on" : ""}`}
                  onClick={() => pickMode(m.id)}
                  aria-pressed={mode === m.id}
                >
                  <Icon name={m.icon} size={15} />
                  <span>{m.label}</span>
                </button>
              </Tooltip>
            ))}
          </div>
          {mode === "scale" && (
            <>
              <p className="mini-label">Fixed anchor</p>
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
              <p className="hint" style={{ color: "#8FA6BB" }}>
                The dot you pick stays put while the rest scales away from it.
              </p>
            </>
          )}
        </Panel>

        <Panel title="Lines & routes" icon="arrow" count={LINE_TOOLS.length}>
          <div className="tool-grid">
            {LINE_TOOLS.map((t) => {
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
                    className={`tool-btn${tool === t.id ? " is-on" : ""}${locked ? " is-locked" : ""}`}
                    onClick={() => pickTool(t.id)}
                    aria-label={locked ? `${t.title} — locked` : t.title}
                    aria-pressed={tool === t.id}
                  >
                    <Icon name={locked ? "lock" : t.icon} size={17} />
                    <i>{t.key}</i>
                  </button>
                </Tooltip>
              );
            })}
          </div>
          <p className="mini-label">Ink</p>
          <div className="swatches">
            {PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                className={`swatch${color === c ? " is-on" : ""}`}
                style={{ background: c }}
                onClick={() => setColor(c)}
                aria-label={`Draw in ${c}`}
                aria-pressed={color === c}
              />
            ))}
          </div>
          <p className="mini-label">Weight</p>
          <div className="tool-grid tool-grid-3" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
            {STROKE_WEIGHTS.map((w) => (
              <Tooltip
                key={w}
                title={`${w.toFixed(1)} pt line`}
                hint="Heavier lines read better on a wristband card; lighter lines suit install sheets."
              >
                <button
                  type="button"
                  className={`tool-btn${width === w ? " is-on" : ""}`}
                  onClick={() => setWidth(w)}
                  aria-label={`Line weight ${w}`}
                  aria-pressed={width === w}
                >
                  <svg width="20" height="20" viewBox="0 0 20 20">
                    <line x1="3" y1="10" x2="17" y2="10" stroke="currentColor" strokeWidth={w} strokeLinecap="round" />
                  </svg>
                </button>
              </Tooltip>
            ))}
          </div>
        </Panel>

        <Panel title="Shapes & zones" icon="zone" count={SHAPE_TOOLS.length} defaultOpen={false}>
          <div className="tool-grid">
            {SHAPE_TOOLS.map((t) => {
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
                    className={`tool-btn${tool === t.id ? " is-on" : ""}${locked ? " is-locked" : ""}`}
                    onClick={() => pickTool(t.id)}
                    aria-label={locked ? `${t.title} — locked` : t.title}
                    aria-pressed={tool === t.id}
                  >
                    <Icon name={locked ? "lock" : t.icon} size={17} />
                    {t.key && <i>{t.key}</i>}
                  </button>
                </Tooltip>
              );
            })}
          </div>
        </Panel>

        <Panel title="Offense" icon="user" count={OFFENSE_TOKENS.length}>
          <div className="tool-grid">
            {OFFENSE_TOKENS.map((t) => (
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
        </Panel>

        <Panel title="Defense" icon="board" count={DEFENSE_TOKENS.length}>
          <div className="tool-grid">
            {DEFENSE_TOKENS.map((t) => (
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
        </Panel>

        <Panel title="Formations" icon="grid" count={FORMATION_PRESETS.length} defaultOpen={false}>
          <div className="tool-row">
            {FORMATION_PRESETS.map((p) => (
              <Tooltip
                key={p.name}
                title={p.name}
                hint={`${p.note} Drops every token grouped, so you can move the whole set at once.`}
              >
                <button type="button" className="tool-wide" onClick={() => applyFormation(p)}>
                  <Icon name="board" size={14} />
                  <span>{p.name}</span>
                </button>
              </Tooltip>
            ))}
          </div>
        </Panel>

        <Panel title="Layers" icon="group" count={scene.nodes.length} defaultOpen={false} dense>
          {scene.nodes.length === 0 && (
            <p className="hint" style={{ color: "#8FA6BB" }}>
              Nothing on the field yet.
            </p>
          )}
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
        </Panel>
      </aside>

      <main className="builder-main" id="main">
        <div className="builder-bar" role="toolbar" aria-label="Play actions">
          <button
            type="button"
            className="btn btn-ghost btn-sm only-narrow"
            onClick={() => setRailOpen((v) => !v)}
            aria-label="Drawing tools"
            aria-expanded={railOpen}
          >
            <Icon name="multiselect" size={15} />
          </button>
          <Tooltip title="Undo" hint="Steps back through everything you have drawn this session." shortcut="⌘Z" side="bottom">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={undo}
              disabled={!past.current.length}
              aria-label="Undo"
            >
              <Icon name="undo" size={16} />
            </button>
          </Tooltip>
          <Tooltip title="Redo" hint="Puts back the last thing you undid." shortcut="⇧⌘Z" side="bottom">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={redo}
              disabled={!future.current.length}
              aria-label="Redo"
            >
              <Icon name="redo" size={16} />
            </button>
          </Tooltip>
          <span className="sep" />
          <Tooltip
            title="Snap to grid"
            hint="Locks every drop point to a grid so tokens and routes line up exactly."
            side="bottom"
          >
            <button
              type="button"
              className={`btn btn-ghost btn-sm${grid ? " btn-dark" : ""}`}
              onClick={() => setGrid((g) => (g ? 0 : 20))}
              aria-pressed={grid > 0}
            >
              <Icon name="grid" size={15} /> {grid ? "Grid on" : "Grid off"}
            </button>
          </Tooltip>
          <Tooltip
            title="Duplicate selection"
            hint="Copies whatever is selected and offsets it slightly."
            shortcut="⌘D"
            side="bottom"
          >
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={duplicateSelection}
              disabled={!selection.length}
              aria-label="Duplicate"
            >
              <Icon name="duplicate" size={15} />
            </button>
          </Tooltip>
          <Tooltip
            title="Group"
            hint="Locks the selection together so it moves as one. Click-Through Mode still reaches inside."
            shortcut="⌘G"
            side="bottom"
          >
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={groupSelection}
              disabled={selection.length < 2}
              aria-label="Group"
            >
              <Icon name="group" size={15} />
            </button>
          </Tooltip>
          <Tooltip title="Delete" hint="Removes the selection. Undo brings it straight back." shortcut="Del" side="bottom">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={deleteSelection}
              disabled={!selection.length}
              aria-label="Delete"
            >
              <Icon name="trash" size={15} />
            </button>
          </Tooltip>
          <span className="sep" />
          <select
            className="select"
            style={{ width: 128, height: 30 }}
            value={scene.view}
            onChange={(e) => applyScene({ ...scene, view: e.target.value as Scene["view"] }, "Field view")}
            aria-label="Field view"
          >
            {FIELD_VIEWS.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
          <div className="row" style={{ width: 120, alignItems: "center", gap: 6 }}>
            <input
              type="range"
              className="range"
              min={40}
              max={140}
              value={Math.round(zoom * 100)}
              onChange={(e) => setZoom(Number(e.target.value) / 100)}
              aria-label="Zoom"
            />
            <span className="mono" style={{ fontSize: 11, color: "var(--muted)", flex: "none" }}>
              {Math.round(zoom * 100)}%
            </span>
          </div>
          <span className="spacer" style={{ marginLeft: "auto" }} />
          <button
            type="button"
            className="btn btn-ghost btn-sm only-mid"
            onClick={() => setSideOpen((v) => !v)}
            aria-expanded={sideOpen}
          >
            <Icon name="board" size={15} /> Details
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setExporting(true)}>
            <Icon name="download" size={15} /> Export
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={saving}>
            <Icon name="save" size={15} /> {saving ? "Saving…" : dirty ? "Save play" : "Saved"}
          </button>
        </div>

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

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "0 14px",
            height: 34,
            background: "#fff",
            borderTop: "1px solid var(--border)",
            fontSize: 12.5,
            color: "var(--muted)",
          }}
        >
          <Icon name="sparkle" size={13} />
          <span role="status" aria-live="polite">
            {status}
          </span>
          <span style={{ marginLeft: "auto" }} className="mono">
            {scene.nodes.length} elements · {selection.length} selected
          </span>
        </div>
      </main>

      <aside className={`builder-side${sideOpen ? " is-open" : ""}`} aria-label="Play details">
        <Inspector
          scene={scene}
          selection={selection}
          meta={meta}
          onMeta={(patch) => (setMeta((m) => ({ ...m, ...patch })), setDirty(true))}
          onScene={applyScene}
          onSelection={setSelection}
        />
      </aside>

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

function TokenGlyph({ preset }: { preset: TokenPreset }) {
  const r = 11;
  return (
    <svg width="26" height="26" viewBox="-14 -14 28 28" aria-hidden="true">
      {preset.shape === "circle" && <circle r={r} fill={preset.fill} stroke={preset.stroke} strokeWidth={2} />}
      {preset.shape === "square" && (
        <rect x={-r} y={-r} width={r * 2} height={r * 2} rx={2} fill={preset.fill} stroke={preset.stroke} strokeWidth={2} />
      )}
      {preset.shape === "diamond" && (
        <polygon points={`0,${-r} ${r},0 0,${r} ${-r},0`} fill={preset.fill} stroke={preset.stroke} strokeWidth={2} />
      )}
      {preset.shape === "triangle" && (
        <polygon points={`0,${-r} ${r},${r * 0.8} ${-r},${r * 0.8}`} fill={preset.fill} stroke={preset.stroke} strokeWidth={2} />
      )}
      {preset.shape === "ball" && <ellipse rx={r} ry={r * 0.62} fill={preset.fill} stroke={preset.stroke} strokeWidth={2} />}
      {preset.shape === "cross" && (
        <g stroke={preset.stroke} strokeWidth={3} strokeLinecap="round">
          <line x1={-8} y1={-8} x2={8} y2={8} />
          <line x1={8} y1={-8} x2={-8} y2={8} />
        </g>
      )}
      {preset.shape !== "cross" && preset.label && (
        <text
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={12}
          fontWeight={700}
          fill={preset.textColor}
          fontFamily="'Saira Condensed', 'Arial Narrow', sans-serif"
        >
          {preset.label}
        </text>
      )}
    </svg>
  );
}
