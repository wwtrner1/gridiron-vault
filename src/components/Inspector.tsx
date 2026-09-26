import { useMemo, useState } from "react";
import { Panel } from "./Panel";
import { Icon } from "./Icon";
import { Tooltip } from "./Tooltip";
import { FIELD_VIEWS } from "../lib/field";
import { alignNodes, describe, distributeNodes, flipNodes, nextZ } from "../lib/scene";
import type { FieldView, PlayMeta, PathNode, Scene, SceneNode, ShapeNode, TextNode } from "../lib/types";
import { FORMATIONS, PALETTE, ROUTE_TREE, STROKE_WEIGHTS, uid } from "../lib/types";

type Props = {
  scene: Scene;
  selection: string[];
  meta: PlayMeta;
  onMeta: (patch: Partial<PlayMeta>) => void;
  onScene: (next: Scene, label?: string) => void;
  onSelection: (ids: string[]) => void;
};

const PLAY_TYPES: PlayMeta["playType"][] = ["pass", "run", "defense", "special"];

/** The colour currently on the selection, whichever field holds it. */
function strokeOf(node?: SceneNode | null) {
  if (!node) return undefined;
  return node.kind === "text" ? node.color : "stroke" in node ? node.stroke : undefined;
}

export function Inspector({ scene, selection, meta, onMeta, onScene, onSelection }: Props) {
  const [tagDraft, setTagDraft] = useState("");
  const selected = useMemo(() => scene.nodes.filter((n) => selection.includes(n.id)), [scene.nodes, selection]);
  const one = selected.length === 1 ? selected[0] : null;

  const patch = (changes: Partial<SceneNode> | ((n: SceneNode) => Partial<SceneNode>), label = "Edit") =>
    onScene(
      {
        ...scene,
        nodes: scene.nodes.map((n) =>
          selection.includes(n.id) ? ({ ...n, ...(typeof changes === "function" ? changes(n) : changes) } as SceneNode) : n,
        ),
      },
      label,
    );

  const addTag = (value: string) => {
    const tag = value.trim().toLowerCase();
    if (!tag || meta.tags.includes(tag)) return;
    onMeta({ tags: [...meta.tags, tag] });
    setTagDraft("");
  };

  return (
    <div className="insp">
      <Panel title="Play details" icon="board" defaultOpen>
        <label className="field">
          <span>Play name</span>
          <input
            className="input"
            value={meta.name}
            placeholder="Trips Right — Y Corner"
            onChange={(e) => onMeta({ name: e.target.value })}
          />
        </label>
        <label className="field">
          <span>Formation</span>
          <select className="select" value={meta.formation} onChange={(e) => onMeta({ formation: e.target.value })}>
            <option value="">Pick one</option>
            {FORMATIONS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
        <div className="field" role="group" aria-labelledby="play-type-label">
          <span id="play-type-label">Type</span>
          <div className="seg">
            {PLAY_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                className={meta.playType === t ? "is-on" : ""}
                aria-pressed={meta.playType === t}
                onClick={() => onMeta({ playType: t })}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        <label className="field">
          <span>Personnel</span>
          <input
            className="input"
            value={meta.personnel}
            placeholder="5-on-5, no rush"
            onChange={(e) => onMeta({ personnel: e.target.value })}
          />
        </label>
        <label className="field">
          <span>Coaching notes</span>
          <textarea
            className="textarea"
            value={meta.description}
            placeholder="Y reads the corner's hips. If he squats, break it off at eight."
            onChange={(e) => onMeta({ description: e.target.value })}
          />
          <p className="hint">These notes print under the diagram on letter and half-page exports.</p>
        </label>
        <div className="field">
          <span>Labels</span>
          <div className="chip-row">
            {meta.tags.map((t) => (
              <button
                key={t}
                type="button"
                className="chip is-on"
                onClick={() => onMeta({ tags: meta.tags.filter((x) => x !== t) })}
                title={`Remove the ${t} label`}
                aria-label={`Remove the ${t} label`}
              >
                {t} <Icon name="close" size={11} />
              </button>
            ))}
          </div>
          <input
            className="input"
            style={{ marginTop: 7 }}
            value={tagDraft}
            placeholder="Add a label and press Enter"
            aria-label="Add a label"
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag(tagDraft))}
          />
          <div className="chip-row" style={{ marginTop: 7 }}>
            {ROUTE_TREE.slice(0, 8).map((r) => (
              <button key={r} type="button" className="chip" onClick={() => addTag(r)}>
                {r}
              </button>
            ))}
          </div>
        </div>
        <label className="switch">
          <input type="checkbox" checked={meta.isPublic} onChange={(e) => onMeta({ isPublic: e.target.checked })} />
          Share this play in the public Vault
        </label>
      </Panel>

      <Panel title="Field" icon="grid" count={FIELD_VIEWS.find((v) => v.id === scene.view)?.label}>
        <div className="chip-row">
          {FIELD_VIEWS.map((v) => (
            <Tooltip key={v.id} title={v.label} hint={v.hint} side="top">
              <button
                type="button"
                className={`chip${scene.view === v.id ? " is-on" : ""}`}
                onClick={() => onScene({ ...scene, view: v.id as FieldView }, "Field view")}
              >
                {v.label}
              </button>
            </Tooltip>
          ))}
        </div>
        <label className="field" style={{ marginTop: 12 }}>
          <span>Line of scrimmage</span>
          <input
            type="range"
            className="range"
            min={90}
            max={600}
            value={scene.losY}
            onChange={(e) => onScene({ ...scene, losY: Number(e.target.value) })}
          />
        </label>
        {scene.pivot && (
          <button type="button" className="btn btn-ghost btn-sm btn-block" onClick={() => onScene({ ...scene, pivot: null }, "Clear pivot")}>
            <Icon name="pivot" size={14} /> Clear pivot point
          </button>
        )}
      </Panel>

      {selected.length === 0 ? (
        <div className="insp-sect">
          <p>Properties</p>
          <p className="hint">
            Nothing selected. Click an element on the field, or drag a box across several to edit them together.
          </p>
        </div>
      ) : (
        <Panel title={selected.length === 1 ? describe(selected[0]) : `${selected.length} elements`} icon="cursor">
          {one?.kind === "player" && (
            <>
              <div className="row">
                <label className="field">
                  <span>Label</span>
                  <input className="input" value={one.label} maxLength={3} onChange={(e) => patch({ label: e.target.value.toUpperCase() } as Partial<SceneNode>, "Label")} />
                </label>
                <label className="field">
                  <span>Size</span>
                  <input
                    type="number"
                    className="input"
                    value={Math.round(one.size)}
                    min={16}
                    max={90}
                    onChange={(e) => patch({ size: Number(e.target.value) } as Partial<SceneNode>, "Size")}
                  />
                </label>
              </div>
              <p className="mini-label">Shape</p>
              <div className="chip-row">
                {(["circle", "square", "triangle", "diamond", "cross", "ball"] as const).map((s) => (
                  <button key={s} type="button" className={`chip${one.shape === s ? " is-on" : ""}`} onClick={() => patch({ shape: s } as Partial<SceneNode>, "Shape")}>
                    {s}
                  </button>
                ))}
              </div>
              <p className="mini-label">Fill</p>
              <div className="light-swatches">
                {PALETTE.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`swatch${one.fill === c ? " is-on" : ""}`}
                    style={{ background: c }}
                    aria-label={`Fill ${c}`}
                    onClick={() => patch({ fill: c, textColor: isDark(c) ? "#FFFFFF" : "#0B1524" } as Partial<SceneNode>, "Fill")}
                  />
                ))}
              </div>
            </>
          )}

          {one?.kind === "path" && (
            <PathFields
              node={one}
              patch={patch}
              onFirstRead={(on) =>
                onScene(
                  {
                    ...scene,
                    nodes: scene.nodes.map((n) =>
                      n.kind !== "path" ? n : n.id === one.id ? { ...n, firstRead: on } : on && n.firstRead ? { ...n, firstRead: false } : n,
                    ),
                  },
                  "First read",
                )
              }
            />
          )}
          {one?.kind === "shape" && <ShapeFields node={one} patch={patch} />}
          {one?.kind === "text" && <TextFields node={one} patch={patch} />}

          {selected.length > 1 && (
            <p className="hint">
              Editing {selected.length} elements at once. Colour and weight changes apply to all of them.
            </p>
          )}

          <p className="mini-label">Stroke colour</p>
          <div className="light-swatches">
            {PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                className={`swatch${strokeOf(one) === c ? " is-on" : ""}`}
                style={{ background: c }}
                aria-label={`Stroke ${c}`}
                aria-pressed={strokeOf(one) === c}
                onClick={() => patch((n) => (n.kind === "text" ? { color: c } : { stroke: c }) as Partial<SceneNode>, "Colour")}
              />
            ))}
          </div>
        </Panel>
      )}

      {selected.length > 0 && (
        <Panel title="Arrange" icon="align" defaultOpen={false}>
          <div className="chip-row">
            {(["left", "centerX", "right", "top", "centerY", "bottom"] as const).map((edge) => (
              <button key={edge} type="button" className="chip" onClick={() => onScene(alignNodes(scene, selection, edge), "Align")}>
                {edge.replace("centerX", "centre H").replace("centerY", "centre V")}
              </button>
            ))}
          </div>
          <div className="chip-row" style={{ marginTop: 7 }}>
            <button type="button" className="chip" onClick={() => onScene(distributeNodes(scene, selection, "x"), "Distribute")}>
              Space across
            </button>
            <button type="button" className="chip" onClick={() => onScene(distributeNodes(scene, selection, "y"), "Distribute")}>
              Space down
            </button>
            <button type="button" className="chip" onClick={() => onScene(flipNodes(scene, selection, "x"), "Flip")}>
              <Icon name="flip" size={12} /> Flip sides
            </button>
            <button type="button" className="chip" onClick={() => onScene(flipNodes(scene, selection, "y"), "Flip")}>
              Flip up/down
            </button>
          </div>
          <div className="chip-row" style={{ marginTop: 7 }}>
            <button
              type="button"
              className="chip"
              onClick={() => {
                const z = nextZ(scene);
                patch((n) => ({ z: z + selection.indexOf(n.id) }), "Bring to front");
              }}
            >
              <Icon name="front" size={12} /> To front
            </button>
            <button type="button" className="chip" onClick={() => patch({ z: -1 } as Partial<SceneNode>, "Send to back")}>
              <Icon name="back" size={12} /> To back
            </button>
            <button
              type="button"
              className="chip"
              onClick={() => {
                const group = uid("grp");
                patch({ groupId: group } as Partial<SceneNode>, "Group");
              }}
            >
              <Icon name="group" size={12} /> Group
            </button>
            <button type="button" className="chip" onClick={() => patch({ groupId: null } as Partial<SceneNode>, "Ungroup")}>
              <Icon name="ungroup" size={12} /> Ungroup
            </button>
          </div>
          <div className="chip-row" style={{ marginTop: 7 }}>
            <button type="button" className="chip" onClick={() => patch((n) => ({ locked: !n.locked }), "Lock")}>
              <Icon name="lock" size={12} /> Lock
            </button>
            <button type="button" className="chip" onClick={() => patch((n) => ({ hidden: !n.hidden }), "Hide")}>
              <Icon name="eye" size={12} /> Hide
            </button>
            <button
              type="button"
              className="chip"
              onClick={() => {
                onScene({ ...scene, nodes: scene.nodes.filter((n) => !selection.includes(n.id)) }, "Delete");
                onSelection([]);
              }}
            >
              <Icon name="trash" size={12} /> Delete
            </button>
          </div>
        </Panel>
      )}
    </div>
  );
}

type PatchFn = (changes: Partial<SceneNode> | ((n: SceneNode) => Partial<SceneNode>), label?: string) => void;

function PathFields({ node, patch, onFirstRead }: { node: PathNode; patch: PatchFn; onFirstRead: (on: boolean) => void }) {
  return (
    <>
      <label className="switch">
        <input type="checkbox" checked={!!node.firstRead} onChange={(e) => onFirstRead(e.target.checked)} />
        First read (draws this route in cyan)
      </label>
      <p className="mini-label">Line weight</p>
      <div className="chip-row">
        {STROKE_WEIGHTS.map((w) => (
          <button key={w} type="button" className={`chip${node.width === w ? " is-on" : ""}`} onClick={() => patch({ width: w } as Partial<SceneNode>, "Weight")}>
            {w.toFixed(1)}
          </button>
        ))}
      </div>
      <p className="mini-label">Dash</p>
      <div className="chip-row">
        {(["solid", "dashed", "dotted", "motion"] as const).map((s) => (
          <button key={s} type="button" className={`chip${node.style === s ? " is-on" : ""}`} onClick={() => patch({ style: s } as Partial<SceneNode>, "Dash")}>
            {s}
          </button>
        ))}
      </div>
      <p className="mini-label">Curve</p>
      <div className="chip-row">
        {(["straight", "spline", "bezier"] as const).map((c) => (
          <button key={c} type="button" className={`chip${node.curve === c ? " is-on" : ""}`} onClick={() => patch({ curve: c } as Partial<SceneNode>, "Curve")}>
            {c === "bezier" ? "bezier nodes" : c}
          </button>
        ))}
      </div>
      <p className="mini-label">End caps</p>
      <div className="row">
        <label className="field">
          <span>Start</span>
          <select className="select" value={node.startCap} onChange={(e) => patch({ startCap: e.target.value } as Partial<SceneNode>, "Cap")}>
            {["none", "arrow", "tee", "dot", "chevron"].map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>End</span>
          <select className="select" value={node.endCap} onChange={(e) => patch({ endCap: e.target.value } as Partial<SceneNode>, "Cap")}>
            {["none", "arrow", "tee", "dot", "chevron"].map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
      </div>
      <label className="switch">
        <input type="checkbox" checked={node.closed} onChange={(e) => patch({ closed: e.target.checked } as Partial<SceneNode>, "Close shape")} />
        Close the shape and fill it
      </label>
      {node.closed && (
        <label className="field" style={{ marginTop: 9 }}>
          <span>Fill strength</span>
          <input
            type="range"
            className="range"
            min={0}
            max={80}
            value={Math.round(node.fillOpacity * 100)}
            onChange={(e) => patch({ fillOpacity: Number(e.target.value) / 100, fill: node.fill === "none" ? node.stroke : node.fill } as Partial<SceneNode>, "Fill")}
          />
        </label>
      )}
      {(node.fromId || node.toId) && <p className="hint">This line is joined to two tokens and follows them when they move.</p>}
    </>
  );
}

function ShapeFields({ node, patch }: { node: ShapeNode; patch: PatchFn }) {
  return (
    <>
      <div className="row">
        <label className="field">
          <span>Width</span>
          <input type="number" className="input" value={Math.round(node.w)} onChange={(e) => patch({ w: Number(e.target.value) } as Partial<SceneNode>, "Size")} />
        </label>
        <label className="field">
          <span>Height</span>
          <input type="number" className="input" value={Math.round(node.h)} onChange={(e) => patch({ h: Number(e.target.value) } as Partial<SceneNode>, "Size")} />
        </label>
      </div>
      <div className="chip-row">
        {(["rect", "ellipse", "polygon"] as const).map((s) => (
          <button key={s} type="button" className={`chip${node.shapeType === s ? " is-on" : ""}`} onClick={() => patch({ shapeType: s } as Partial<SceneNode>, "Shape")}>
            {s}
          </button>
        ))}
      </div>
      {node.shapeType === "polygon" && (
        <label className="field" style={{ marginTop: 9 }}>
          <span>Sides — {node.sides}</span>
          <input type="range" className="range" min={3} max={12} value={node.sides} onChange={(e) => patch({ sides: Number(e.target.value) } as Partial<SceneNode>, "Sides")} />
        </label>
      )}
      <label className="field" style={{ marginTop: 9 }}>
        <span>Fill strength</span>
        <input
          type="range"
          className="range"
          min={0}
          max={100}
          value={Math.round(node.fillOpacity * 100)}
          onChange={(e) => patch({ fillOpacity: Number(e.target.value) / 100 } as Partial<SceneNode>, "Fill")}
        />
      </label>
      <p className="mini-label">Fill colour</p>
      <div className="light-swatches">
        {PALETTE.map((c) => (
          <button key={c} type="button" className={`swatch${node.fill === c ? " is-on" : ""}`} style={{ background: c }} aria-label={`Fill ${c}`} aria-pressed={node.fill === c} onClick={() => patch({ fill: c } as Partial<SceneNode>, "Fill")} />
        ))}
      </div>
    </>
  );
}

function TextFields({ node, patch }: { node: TextNode; patch: PatchFn }) {
  return (
    <>
      <label className="field">
        <span>Text</span>
        <input className="input" value={node.text} onChange={(e) => patch({ text: e.target.value } as Partial<SceneNode>, "Text")} />
      </label>
      <div className="row">
        <label className="field">
          <span>Size</span>
          <input type="number" className="input" value={node.fontSize} min={9} max={72} onChange={(e) => patch({ fontSize: Number(e.target.value) } as Partial<SceneNode>, "Size")} />
        </label>
        <label className="field">
          <span>Weight</span>
          <select className="select" value={node.weight} onChange={(e) => patch({ weight: Number(e.target.value) } as Partial<SceneNode>, "Weight")}>
            <option value={400}>Regular</option>
            <option value={600}>Semibold</option>
            <option value={800}>Heavy</option>
          </select>
        </label>
      </div>
      <label className="switch">
        <input type="checkbox" checked={node.boxed} onChange={(e) => patch({ boxed: e.target.checked } as Partial<SceneNode>, "Boxed")} />
        Boxed callout
      </label>
    </>
  );
}

const isDark = (hex: string) => {
  const v = hex.replace("#", "");
  if (v.length !== 6) return false;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16));
  return (r * 299 + g * 587 + b * 114) / 1000 < 140;
};
