import { useState } from "react";
import { ColorPicker } from "./ColorPicker";
import { letterColor } from "../lib/colors";
import { TokenGlyph } from "./TokenGlyph";
import { positionKey, positionLegend, positionStore, usePositionTokens } from "../lib/positions";
import {
  applyPreset,
  blankPreset,
  dropPreset,
  presetLineColor,
  presetStore,
  usePlayerPresets,
  type PlayerPreset,
} from "../lib/playerPresets";
import { BLOCKS, PRESET_BLOCKS, PRESET_ROUTES, ROUTES } from "../lib/routes";
import { makePlayer, OFFENSE_TOKENS } from "../lib/presets";
import { CANVAS_W } from "../lib/types";
import type { Scene } from "../lib/types";
import type { TokenPreset } from "../lib/presets";

type Props = {
  scene: Scene;
  selection: string[];
  onScene: (next: Scene, label?: string) => void;
  onSelection: (ids: string[]) => void;
};

/** Outline and line color rows from the canvas editor; "+" opens the full picker. */
const OUTLINE_ROW = ["#0b1524", "#ffffff", "#16c8e8", "#d99a28", "#d4a017", "#f5d33b"];
const LINE_ROW = ["#0b1524", "#0fa8c4", "#d24b3e", "#1c567f", "#d4a017", "#f5d33b"];
const SHADE_ROW = ["transparent", "#e3f8fd", "#e8f3fb", "#fdf2dd", "#fbe8e6"];
const SHAPES: { id: PlayerPreset["shape"]; glyph: string; name: string }[] = [
  { id: "circle", glyph: "●", name: "Circle" },
  { id: "square", glyph: "■", name: "Square" },
  { id: "triangle", glyph: "▲", name: "Triangle" },
  { id: "cross", glyph: "✕", name: "Cross" },
];

/**
 * The "Player presets" panel from the Grid1ron Design canvas (Designer,
 * right panel): default position colors key, the coach's presets, and the
 * preset editor.
 */
export function PlayerPresets({ scene, selection, onScene, onSelection }: Props) {
  const presets = usePlayerPresets();
  const [editing, setEditing] = useState<PlayerPreset | null>(presets[0] ?? null);
  const selectedPlayers = scene.nodes.filter((n) => n.kind === "player" && selection.includes(n.id));

  const startNew = () => setEditing(blankPreset());
  // Coaches who saved presets before the full starter set existed get a one-tap way to add it.
  const missing = presetStore.missingSeeds();
  const isSaved = editing ? presets.some((p) => p.id === editing.id) : false;

  return (
    <div className="pp">
      <div className="pp-head">
        <p className="pp-lede">Build a player once — letter, shape, colors, lines and assignment — then drop it on any play.</p>
        <button type="button" className="btn btn-outline-dark btn-sm" onClick={startNew}>
          + New preset
        </button>
      </div>

      <PositionKey />

      <div className="pp-chips" role="list" aria-label="Your player presets">
        {presets.map((p) => (
          <div role="listitem" key={p.id}>
            <button
              type="button"
              className={`pp-chip${editing?.id === p.id ? " is-on" : ""}`}
              aria-pressed={editing?.id === p.id}
              onClick={() => setEditing(p)}
            >
              <TokenGlyph preset={asToken(p)} size={22} />
              {p.name}
            </button>
          </div>
        ))}
      </div>
      {missing.length > 0 && (
        <button type="button" className="pp-link pp-seeds" onClick={() => presetStore.addMissingSeeds()}>
          + Add the starter presets ({missing.map((p) => p.label).join(" ")})
        </button>
      )}
      <p className="pp-legend">These are starting points, not a limit: + New preset builds any position, offense or defense.</p>

      {editing && (
        <PresetEditor
          key={editing.id}
          preset={editing}
          saved={isSaved}
          selectedCount={selectedPlayers.length}
          onApply={(p) => {
            onScene(applyPreset(scene, selection, p), `${p.name} applied`);
          }}
          onDrop={(p) => {
            const at = { x: CANVAS_W / 2 + ((scene.nodes.length % 5) - 2) * 60, y: scene.losY + (p.side === "defense" ? -90 : 8) };
            const out = dropPreset(scene, p, at, () => makePlayer(OFFENSE_TOKENS[0], at.x, at.y));
            onScene(out.scene, `${p.name} dropped`);
            onSelection([out.playerId]);
          }}
          onSave={(p) => {
            presetStore.save(p);
            setEditing(p);
          }}
          onDelete={(id) => {
            presetStore.remove(id);
            setEditing(presetStore.get()[0] ?? null);
          }}
        />
      )}
    </div>
  );
}

/** A preset drawn as a key/chip token. */
function asToken(p: PlayerPreset): TokenPreset {
  return {
    code: p.id,
    label: p.label,
    title: p.name,
    hint: "",
    shape: p.shape,
    fill: p.shape === "cross" ? "none" : p.fill,
    stroke: p.outline,
    textColor: p.shape === "cross" ? p.outline : letterColor(p.fill),
    side: p.side,
  };
}

function PresetEditor({
  preset,
  saved,
  selectedCount,
  onApply,
  onDrop,
  onSave,
  onDelete,
}: {
  preset: PlayerPreset;
  saved: boolean;
  selectedCount: number;
  onApply: (p: PlayerPreset) => void;
  onDrop: (p: PlayerPreset) => void;
  onSave: (p: PlayerPreset) => void;
  onDelete: (id: string) => void;
}) {
  const [d, setD] = useState<PlayerPreset>(preset);
  const [more, setMore] = useState<"outline" | "line" | null>(null);
  const set = (patch: Partial<PlayerPreset>) => setD((x) => ({ ...x, ...patch }));
  const changed = JSON.stringify(d) !== JSON.stringify(preset);

  return (
    <div className="pp-editor">
      <div className="pp-editor-head">
        <span>Edit preset · {d.name}</span>
        <span className="pp-mono">Preview</span>
      </div>
      <PresetPreview p={d} />

      <label className="pp-field">
        <span className="pp-sub">Preset name</span>
        <input className="input" value={d.name} maxLength={40} onChange={(e) => set({ name: e.target.value })} />
      </label>

      <div className="pp-grid2">
        <label className="pp-field">
          <span className="pp-sub">Position</span>
          <input
            className="input pp-letter"
            aria-label="Position letter"
            value={d.label}
            maxLength={2}
            onChange={(e) => set({ label: e.target.value.toUpperCase() })}
          />
        </label>
        <div className="pp-field" role="group" aria-label="Shape">
          <span className="pp-sub">Shape</span>
          <Seg
            value={d.shape}
            options={SHAPES.map((s) => ({ id: s.id, label: s.glyph, name: s.name }))}
            onChange={(shape) => set({ shape })}
          />
        </div>
      </div>

      {d.shape !== "cross" && (
        <div className="pp-field">
          <span className="pp-sub">Fill color</span>
          <ColorPicker
            label="Preset fill"
            value={d.fill}
            onChange={(fill) => set({ fill, outline: d.outline === d.fill ? fill : d.outline })}
          />
        </div>
      )}

      <div className="pp-field">
        <span className="pp-sub">{d.shape === "cross" ? "Mark color" : "Outline color"}</span>
        <SwatchRow label="Preset outline" colors={OUTLINE_ROW} value={d.outline} onPick={(outline) => set({ outline })} onMore={() => setMore(more === "outline" ? null : "outline")} />
        {more === "outline" && <ColorPicker label="Preset outline" value={d.outline} onChange={(outline) => set({ outline })} />}
      </div>

      {d.shape !== "cross" && (
        <>
          <div className="pp-field" role="group" aria-label="Outline style">
            <span className="pp-sub">Outline style</span>
            <Seg
              value={d.outlineStyle}
              options={[
                { id: "solid", label: "Solid" },
                { id: "dash", label: "Dash" },
                { id: "none", label: "None" },
              ]}
              onChange={(outlineStyle) => set({ outlineStyle })}
            />
          </div>
          <div className="pp-field">
            <span className="pp-sub">Shade color · area under player</span>
            <div className="pp-swatches">
              {SHADE_ROW.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`cp-swatch${d.shade === c ? " is-on" : ""}${c === "transparent" ? " is-none" : ""}`}
                  style={c === "transparent" ? undefined : { background: c }}
                  aria-label={c === "transparent" ? "No shade" : `Shade ${c}`}
                  aria-pressed={d.shade === c}
                  onClick={() => set({ shade: c })}
                />
              ))}
            </div>
          </div>
        </>
      )}

      <div className="pp-grid2">
        <div className="pp-field" role="group" aria-label="Line weight">
          <span className="pp-sub">Line weight</span>
          <Seg
            value={String(d.lineWeight)}
            options={["1", "2", "3"].map((w) => ({ id: w, label: w }))}
            onChange={(w) => set({ lineWeight: Number(w) as 1 | 2 | 3 })}
          />
        </div>
        <div className="pp-field" role="group" aria-label="Line end">
          <span className="pp-sub">Line end</span>
          <Seg
            value={d.lineEnd}
            options={[
              { id: "arrow", label: "Arrow" },
              { id: "tee", label: "T-bar" },
              { id: "none", label: "None" },
            ]}
            onChange={(lineEnd) => set({ lineEnd })}
          />
        </div>
      </div>

      <div className="pp-field" role="group" aria-label="Line style">
        <span className="pp-sub">Line style</span>
        <Seg
          value={d.lineStyle}
          options={[
            { id: "solid", label: "Solid" },
            { id: "dashed", label: "Dashed" },
            { id: "dotted", label: "Dotted" },
            { id: "motion", label: "Motion" },
          ]}
          onChange={(lineStyle) => set({ lineStyle })}
        />
      </div>

      <div className="pp-field">
        <span className="pp-sub">Line color</span>
        <SwatchRow label="Preset line" colors={LINE_ROW} value={d.lineColor} onPick={(lineColor) => set({ lineColor })} onMore={() => setMore(more === "line" ? null : "line")} />
        {more === "line" && <ColorPicker label="Preset line" value={d.lineColor} onChange={(lineColor) => set({ lineColor })} />}
      </div>

      <div className="pp-field" role="group" aria-label="Assignment">
        <span className="pp-sub">Assignment</span>
        <Seg
          value={d.assignment}
          options={[
            { id: "route", label: "Route" },
            { id: "block", label: "Blocking" },
          ]}
          onChange={(assignment) => set({ assignment, lineEnd: assignment === "block" ? "tee" : "arrow" })}
        />
      </div>
      <div className="pp-grid2">
        <label className="pp-field">
          <span className="pp-sub">Route</span>
          <select className="select" aria-label="Route" value={d.route} disabled={d.assignment !== "route"} onChange={(e) => set({ route: e.target.value })}>
            {PRESET_ROUTES.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <label className="pp-field">
          <span className="pp-sub">Block (if allowed)</span>
          <select className="select" aria-label="Block" value={d.block} disabled={d.assignment !== "block"} onChange={(e) => set({ block: e.target.value })}>
            {PRESET_BLOCKS.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="switch">
        <input type="checkbox" checked={d.firstRead} disabled={d.assignment !== "route"} onChange={(e) => set({ firstRead: e.target.checked })} />
        Mark as first read
      </label>

      <div className="pp-actions">
        <button
          type="button"
          className="btn btn-outline-dark btn-sm"
          disabled={selectedCount === 0}
          title={selectedCount === 0 ? "Select one or more players on the field first" : undefined}
          onClick={() => onApply(d)}
        >
          Apply to selected{selectedCount > 0 ? ` (${selectedCount})` : ""}
        </button>
        <button type="button" className="btn btn-outline-dark btn-sm" onClick={() => onDrop(d)}>
          Drop on field
        </button>
        <button type="button" className="btn btn-primary btn-sm" disabled={saved && !changed} onClick={() => onSave(d)}>
          {saved ? (changed ? "Save preset" : "Saved") : "Save preset"}
        </button>
      </div>
      {saved && (
        <button type="button" className="pp-reset" onClick={() => onDelete(d.id)}>
          Delete this preset
        </button>
      )}
    </div>
  );
}

function Seg<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string; name?: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="seg seg-sm">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          className={value === o.id ? "is-on" : ""}
          aria-pressed={value === o.id}
          aria-label={o.name}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function SwatchRow({ label, colors, value, onPick, onMore }: { label: string; colors: string[]; value: string; onPick: (c: string) => void; onMore: () => void }) {
  return (
    <div className="pp-swatches">
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          className={`cp-swatch${value.toLowerCase() === c ? " is-on" : ""}`}
          style={{ background: c }}
          aria-label={`${label} ${c}`}
          aria-pressed={value.toLowerCase() === c}
          onClick={() => onPick(c)}
        />
      ))}
      <button type="button" className="cp-swatch is-more" aria-label={`${label}: more colors`} onClick={onMore}>
        +
      </button>
    </div>
  );
}

/** A small field slice showing the player and its line, as the canvas preview does. */
function PresetPreview({ p }: { p: PlayerPreset }) {
  const line = presetLineColor(p);
  const w = [0, 1.6, 2.2, 2.9][p.lineWeight];
  const dash = p.lineStyle === "dashed" ? "6 4" : p.lineStyle === "dotted" ? "1.5 3.5" : undefined;
  // The real route or block shape, for a receiver on the right (outs to the right, ins to the left).
  const segs = (p.assignment === "block" ? BLOCKS[p.block] : ROUTES[p.route]) ?? ROUTES.go;
  const pts = [{ x: 0, y: 0 }];
  for (const [dx, dy] of segs) pts.push({ x: pts[pts.length - 1].x + dx, y: pts[pts.length - 1].y + dy });
  const k = Math.min(0.3, 60 / Math.max(1, ...pts.map((q) => Math.abs(q.y))), 90 / Math.max(1, ...pts.map((q) => Math.abs(q.x))));
  const P = pts.map((q) => ({ x: 110 + q.x * k, y: 70 + q.y * k }));
  const d =
    p.lineStyle === "motion"
      ? "M110 70 q8 -8 16 0 t16 0 t16 0 t16 0 L190 30"
      : P.map((q, i) => `${i ? "L" : "M"}${q.x.toFixed(1)} ${q.y.toFixed(1)}`).join(" ");
  const tip = p.lineStyle === "motion" ? { x: 190, y: 30 } : P[P.length - 1];
  const prev = p.lineStyle === "motion" ? { x: 174, y: 40 } : P[P.length - 2];
  const ang = Math.atan2(tip.y - prev.y, tip.x - prev.x);
  const head = (a: number) => `${(tip.x + Math.cos(a) * 9).toFixed(1)},${(tip.y + Math.sin(a) * 9).toFixed(1)}`;
  const arrow = `${tip.x.toFixed(1)},${tip.y.toFixed(1)} ${head(ang + Math.PI - 0.45)} ${head(ang + Math.PI + 0.45)}`;
  const tee = [head(ang + Math.PI / 2), head(ang - Math.PI / 2)].map((s) => s.split(",").map(Number));
  const t = asToken(p);
  return (
    <svg className="pp-preview" viewBox="0 0 220 96" role="img" aria-label={`Preview of ${p.name}`}>
      <rect width="220" height="96" fill="#ffffff" />
      <line x1="0" y1="78" x2="220" y2="78" stroke="#0b1524" strokeWidth="1" strokeDasharray="5 4" />
      <path d={d} fill="none" stroke={line} strokeWidth={w} strokeDasharray={dash} strokeLinecap="round" strokeLinejoin="round" />
      {p.lineEnd === "arrow" && p.assignment === "route" && <polygon points={arrow} fill={line} />}
      {(p.lineEnd === "tee" || p.assignment === "block") && p.lineEnd !== "none" && (
        <line x1={tee[0][0]} y1={tee[0][1]} x2={tee[1][0]} y2={tee[1][1]} stroke={line} strokeWidth={w + 0.6} strokeLinecap="round" />
      )}
      {p.shade !== "transparent" && p.shape !== "cross" && <circle cx="110" cy="70" r="15" fill={p.shade} />}
      <g transform="translate(110 70)">
        {p.shape === "circle" && <circle r="9.5" fill={t.fill} stroke={p.outlineStyle === "none" ? "none" : t.stroke} strokeWidth="1.6" strokeDasharray={p.outlineStyle === "dash" ? "3 2" : undefined} />}
        {p.shape === "square" && <rect x="-9.5" y="-9.5" width="19" height="19" rx="2" fill={t.fill} stroke={p.outlineStyle === "none" ? "none" : t.stroke} strokeWidth="1.6" strokeDasharray={p.outlineStyle === "dash" ? "3 2" : undefined} />}
        {p.shape === "triangle" && <polygon points="0,-10 9.5,8 -9.5,8" fill={t.fill} stroke={p.outlineStyle === "none" ? "none" : t.stroke} strokeWidth="1.6" />}
        {p.shape === "cross" && (
          <g stroke={p.outline} strokeWidth="3" strokeLinecap="round">
            <line x1="-7" y1="-7" x2="7" y2="7" />
            <line x1="7" y1="-7" x2="-7" y2="7" />
          </g>
        )}
        {p.shape !== "cross" && (
          <text textAnchor="middle" dominantBaseline="central" fontSize="11" fontWeight="700" fill={t.textColor} fontFamily="'Saira Condensed', 'Arial Narrow', sans-serif">
            {p.label}
          </text>
        )}
      </g>
    </svg>
  );
}

function PositionKey() {
  const tokens = usePositionTokens();
  const key = positionKey(tokens);
  const [editing, setEditing] = useState(false);
  const [active, setActive] = useState(key[0]?.label ?? "Q");
  const current = key.find((t) => t.label === active) ?? key[0];

  return (
    <div className="pp-key">
      <div className="pp-key-head">
        <span>Default position colors</span>
        <button type="button" className="pp-link" onClick={() => setEditing((v) => !v)} aria-expanded={editing}>
          {editing ? "Done" : "Edit defaults"}
        </button>
      </div>

      <div className="pp-key-tokens" role={editing ? "radiogroup" : undefined} aria-label={editing ? "Position to edit" : undefined}>
        {key.map((t) =>
          editing ? (
            <button
              key={t.code}
              type="button"
              role="radio"
              aria-checked={t.label === current.label}
              aria-label={`${t.title} (${t.label})`}
              className={`pp-key-token${t.label === current.label ? " is-on" : ""}`}
              onClick={() => setActive(t.label)}
            >
              <TokenGlyph preset={t} size={24} />
            </button>
          ) : (
            <span key={t.code} className="pp-key-token" title={t.title}>
              <TokenGlyph preset={t} size={24} />
            </span>
          ),
        )}
      </div>
      <p className="pp-legend">{positionLegend(tokens)}</p>

      {editing && current && (
        <div className="pp-edit">
          <p className="pp-edit-title">
            {current.title} · {current.label}
          </p>
          <span className="pp-sub">Shape</span>
          <div className="seg">
            {(["circle", "square"] as const).map((s) => (
              <button
                key={s}
                type="button"
                className={current.shape === s ? "is-on" : ""}
                aria-pressed={current.shape === s}
                onClick={() => positionStore.set(current.label, { shape: s })}
              >
                {s}
              </button>
            ))}
          </div>
          <span className="pp-sub">Color</span>
          <ColorPicker
            label={`${current.label} color`}
            value={current.fill}
            onChange={(c) => positionStore.set(current.label, { fill: c })}
          />
          <p className="pp-note">New players you drop in the Designer use these colors. Plays you already drew keep theirs.</p>
          <button type="button" className="pp-reset" onClick={() => positionStore.reset()}>
            Reset to the GridIronVault defaults
          </button>
        </div>
      )}
    </div>
  );
}
