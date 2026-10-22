import { useState } from "react";
import type { ReactNode } from "react";
import { ColorPicker } from "./ColorPicker";
import { Tooltip } from "./Tooltip";
import { colorName, letterColor, normalizeHex } from "../lib/colors";
import { BOLD_WIDTH, wristbandBold } from "../lib/bulkEdit";
import { PALETTE, STROKE_WEIGHTS } from "../lib/types";
import type { LineLook } from "../lib/scene";
import type { EndCap, LineCurve, LineStyle, PathNode, PlayerNode, Scene, SceneNode, TextNode } from "../lib/types";

type Props = {
  scene: Scene;
  selection: string[];
  onScene: (next: Scene, label?: string) => void;
  /** The next line: its ink, weight, and look (the tool's own look with the coach's changes on top). */
  color: string;
  width: number;
  look: Required<LineLook>;
  onColor: (hex: string) => void;
  onWidth: (w: number) => void;
  onLook: (patch: LineLook) => void;
  /** One player picked: send the coach to the Routes tab. */
  onRoutes: () => void;
};

const DASHES: { id: LineStyle; label: string }[] = [
  { id: "solid", label: "Solid" },
  { id: "dashed", label: "Dashed" },
  { id: "dotted", label: "Dotted" },
  { id: "motion", label: "Motion" },
];
const CURVES: { id: LineCurve; label: string; hint: string }[] = [
  { id: "straight", label: "Straight", hint: "Sharp cuts at every point you click." },
  { id: "spline", label: "Spline", hint: "A smooth curve through every point you click. Good for wheels, swings and fades." },
  { id: "bezier", label: "Bezier", hint: "Round handles on every point; drag them to bend each segment exactly." },
];
const ENDS: { id: EndCap; label: string }[] = [
  { id: "arrow", label: "Arrow" },
  { id: "tee", label: "T-block" },
  { id: "dot", label: "Dot" },
  { id: "none", label: "None" },
];
const PLAYER_SIZES = [
  { size: 30, label: "S" },
  { size: 36, label: "M" },
  { size: 44, label: "L" },
  { size: 52, label: "XL" },
];
const TEXT_SIZES = [14, 20, 28, 36];
const TEXT_WEIGHTS = [
  { weight: 400, label: "Regular" },
  { weight: 600, label: "Semi" },
  { weight: 800, label: "Heavy" },
];

/**
 * The Designer's one place for how things look. With nothing selected it sets
 * the next line; with lines, players or text selected it restyles them. Each
 * kind in the selection gets its own rows, so a mixed pick can be styled in one go.
 */
export function StyleCard({ scene, selection, onScene, color, width, look, onColor, onWidth, onLook, onRoutes }: Props) {
  const selected = scene.nodes.filter((n) => selection.includes(n.id));
  const paths = selected.filter((n): n is PathNode => n.kind === "path");
  const players = selected.filter((n): n is PlayerNode => n.kind === "player");
  const texts = selected.filter((n): n is TextNode => n.kind === "text");
  const others = selected.length - paths.length - players.length - texts.length;
  const next = selected.length === 0;

  /** Changes every selected node of one kind. */
  const restyle = <K extends SceneNode["kind"]>(kind: K, changes: (n: Extract<SceneNode, { kind: K }>) => Partial<SceneNode>, label: string) =>
    onScene(
      {
        ...scene,
        nodes: scene.nodes.map((n) =>
          selection.includes(n.id) && n.kind === kind ? ({ ...n, ...changes(n as Extract<SceneNode, { kind: K }>) } as SceneNode) : n,
        ),
      },
      label,
    );

  const line = paths[0];
  const lineColor = next ? color : line?.stroke;
  const lineWidth = next ? width : line?.width;
  const lineLook = next ? look : { style: line?.style, curve: line?.curve, endCap: line?.endCap };
  const setLine = (patch: Partial<PathNode>, label: string) => (next ? null : restyle("path", () => patch, label));

  const target = next
    ? "Next line"
    : [count(paths.length, "line"), count(players.length, "player"), count(texts.length, "label")].filter(Boolean).join(" · ") ||
      `${selected.length} selected`;

  const bold = () => {
    if (next) return onWidth(BOLD_WIDTH);
    onScene(
      {
        ...scene,
        // The same Wristband bold Griddy applies across a playbook.
        nodes: scene.nodes.map((n) => (selection.includes(n.id) ? wristbandBold(n) : n)),
      },
      "Wristband bold",
    );
  };

  return (
    <section className="dz-style" aria-labelledby="dz-style-title">
      <header className="dz-style-head">
        <h3 id="dz-style-title">Style</h3>
        <span className="dz-style-target" aria-live="polite">
          {target}
        </span>
      </header>

      {(next || paths.length > 0) && (
        <>
          <Row label="Color">
            <Swatches
              label={next ? "Next line" : "Line"}
              value={lineColor}
              onPick={(c) => (next ? onColor(c) : setLine({ stroke: c }, "Color"))}
            />
          </Row>
          <Row label="Weight">
            <div className="dz-seg dz-seg-4">
              {STROKE_WEIGHTS.map((w, i) => (
                <button
                  key={w}
                  type="button"
                  className={lineWidth === w ? "is-on" : ""}
                  aria-pressed={lineWidth === w}
                  aria-label={`Line weight ${i + 1}${i === STROKE_WEIGHTS.length - 1 ? ", boldest" : ""}`}
                  onClick={() => (next ? onWidth(w) : setLine({ width: w }, "Weight"))}
                >
                  <i style={{ height: Math.round(w) }} aria-hidden="true" />
                </button>
              ))}
            </div>
          </Row>
          <Row label="Dash">
            <Chips
              items={DASHES}
              value={lineLook.style}
              onPick={(style) => (next ? onLook({ style }) : setLine({ style }, "Dash"))}
            />
          </Row>
          <Row label="Curve">
            <Chips
              items={CURVES}
              value={lineLook.curve}
              onPick={(curve) => (next ? onLook({ curve }) : setLine({ curve }, "Curve"))}
            />
          </Row>
          <Row label="End">
            <Chips
              items={ENDS}
              value={lineLook.endCap}
              onPick={(endCap) => (next ? onLook({ endCap }) : setLine({ endCap }, "End"))}
            />
          </Row>
        </>
      )}

      {players.length > 0 && (
        <>
          <Row label="Player">
            <Swatches
              label="Player fill"
              value={players[0].fill}
              onPick={(c) =>
                restyle(
                  "player",
                  (n) => ({
                    fill: c,
                    textColor: letterColor(c),
                    // Outlines follow the fill (canvas default) unless the coach set their own.
                    stroke: n.stroke.toLowerCase() === n.fill.toLowerCase() ? c : n.stroke,
                  }),
                  "Fill",
                )
              }
            />
          </Row>
          <Row label="Letter">
            <Swatches label="Letter" value={players[0].textColor} onPick={(c) => restyle("player", () => ({ textColor: c }), "Letter color")} />
          </Row>
          <Row label="Size">
            <Chips
              items={PLAYER_SIZES.map((s) => ({ id: s.size, label: s.label }))}
              value={players[0].size}
              onPick={(size) => restyle("player", () => ({ size }), "Size")}
            />
          </Row>
          {players.length === 1 && paths.length === 0 && (
            <button type="button" className="dz-style-link" onClick={onRoutes}>
              Give {players[0].label || "this player"} a route →
            </button>
          )}
        </>
      )}

      {texts.length > 0 && (
        <>
          <Row label="Font">
            <Swatches label="Font" value={texts[0].color} onPick={(c) => restyle("text", () => ({ color: c }), "Text color")} />
          </Row>
          <Row label="Size">
            <Chips
              items={TEXT_SIZES.map((s) => ({ id: s, label: String(s) }))}
              value={texts[0].fontSize}
              onPick={(fontSize) => restyle("text", () => ({ fontSize }), "Size")}
            />
          </Row>
          <Row label="Weight">
            <Chips
              items={TEXT_WEIGHTS.map((w) => ({ id: w.weight, label: w.label }))}
              value={texts[0].weight}
              onPick={(weight) => restyle("text", () => ({ weight }), "Weight")}
            />
          </Row>
        </>
      )}

      {others > 0 && paths.length + players.length + texts.length === 0 && (
        <p className="dz-note">Shapes keep their fill and outline in Play details on the right.</p>
      )}

      {(next || paths.length + players.length + texts.length > 0) && (
        <Tooltip title="Wristband bold" hint="The heaviest lines, larger players and heavy labels, so the play still reads on a 4-inch wristband card.">
          <button type="button" className="dz-btn dz-style-bold" onClick={bold}>
            Wristband bold
          </button>
        </Tooltip>
      )}
    </section>
  );
}

function count(n: number, word: string) {
  return n ? `${n} ${word}${n === 1 ? "" : "s"}` : "";
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="dz-style-row" role="group" aria-label={label}>
      <span className="dz-style-label" aria-hidden="true">
        {label}
      </span>
      {children}
    </div>
  );
}

function Chips<T extends string | number>({ items, value, onPick }: { items: { id: T; label: string; hint?: string }[]; value: T | undefined; onPick: (id: T) => void }) {
  return (
    <div className={`dz-seg dz-seg-${items.length}`}>
      {items.map((it) => {
        const button = (
          <button key={it.id} type="button" className={value === it.id ? "is-on" : ""} aria-pressed={value === it.id} onClick={() => onPick(it.id)}>
            {it.label}
          </button>
        );
        return it.hint ? (
          <Tooltip key={it.id} title={it.label} hint={it.hint}>
            {button}
          </Tooltip>
        ) : (
          button
        );
      })}
    </div>
  );
}

/** The GridIronVault ink colors in one row; "More" opens the full picker (team colors, recent, any hex). */
function Swatches({ label, value, onPick }: { label: string; value: string | undefined; onPick: (hex: string) => void }) {
  const [more, setMore] = useState(false);
  const current = normalizeHex(value ?? "") ?? "";
  const custom = current !== "" && !PALETTE.some((p) => p.toLowerCase() === current.toLowerCase());
  return (
    <div className="dz-swatches">
      <div className="dz-swatch-row">
        {PALETTE.map((hex) => {
          const on = hex.toLowerCase() === current.toLowerCase();
          return (
            <button
              key={hex}
              type="button"
              className={`cp-swatch${on ? " is-on" : ""}`}
              style={{ background: hex }}
              title={colorName(hex)}
              aria-label={`${label} ${colorName(hex)}`}
              aria-pressed={on}
              onClick={() => onPick(hex)}
            />
          );
        })}
        <button
          type="button"
          className={`dz-swatch-more${custom ? " is-on" : ""}`}
          style={custom ? { background: current } : undefined}
          aria-expanded={more}
          aria-label={`More ${label.toLowerCase()} colors`}
          onClick={() => setMore((m) => !m)}
        >
          {custom ? "" : "+"}
        </button>
      </div>
      {more && <ColorPicker label={label} value={current} onChange={onPick} />}
    </div>
  );
}
