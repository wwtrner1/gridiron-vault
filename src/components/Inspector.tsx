import { useEffect, useMemo, useRef, useState } from "react";
import { Panel } from "./Panel";
import { Icon } from "./Icon";
import { Tooltip } from "./Tooltip";
import { ColorPicker } from "./ColorPicker";
import { PlayerPresets } from "./PlayerPresets";
import { FIELD_VIEWS } from "../lib/field";
import { TAG_MAX } from "../lib/render";
import { explainPlay } from "../lib/explain";
import { ruleSet, type RuleLines } from "../lib/rules";
import { checkRules } from "../lib/ruleCheck";
import { RulesCheck } from "./RulesCheck";
import { OpponentFront, type OpponentChoices } from "./OpponentFront";
import { knownPersonnel, personnelGroups } from "../lib/personnel";
import { alignNodes, describe, distributeNodes, flipNodes, nextZ, sendToBack } from "../lib/scene";
import type { FieldView, PlayMeta, PathNode, Scene, SceneNode, ShapeNode, TextNode } from "../lib/types";
import { FORMATIONS, ROUTE_TREE, uid } from "../lib/types";

type Props = {
  scene: Scene;
  selection: string[];
  meta: PlayMeta;
  onMeta: (patch: Partial<PlayMeta>) => void;
  onScene: (next: Scene, label?: string) => void;
  onSelection: (ids: string[]) => void;
  rules: RuleLines;
  onRules: (next: RuleLines) => void;
  /** The Vs defense under the play (a saved play or a stock look), for the Rules check. */
  underlay: Scene | null;
  opponent: OpponentChoices;
  /** Move the play to another field, routes kept to the yard. */
  onField: (view: FieldView) => void;
};

const PLAY_TYPES: PlayMeta["playType"][] = ["pass", "run", "defense", "special"];
const CUSTOM = "__custom";

export function Inspector({ scene, selection, meta, onMeta, onScene, onSelection, rules, onRules, underlay, opponent, onField }: Props) {
  const [tagDraft, setTagDraft] = useState("");
  // Personnel is picked from the list; "Custom…" (or a saved value the list doesn't have) opens a text box.
  const [customPersonnel, setCustomPersonnel] = useState(false);
  const knownChoice = knownPersonnel(meta.personnel);
  const personnelChoice = customPersonnel || (meta.personnel.trim() && !knownChoice) ? CUSTOM : (knownChoice ?? "");
  const selected = useMemo(() => scene.nodes.filter((n) => selection.includes(n.id)), [scene.nodes, selection]);
  const one = selected.length === 1 ? selected[0] : null;

  // One panel for what you're working on: Selection while something is picked, Play (name, field) when nothing is.
  // The coach can still switch by hand; it flips back whenever the field goes from empty to picked or the reverse.
  const hasSelection = selection.length > 0;
  const [tab, setTab] = useState<"selection" | "play">(hasSelection ? "selection" : "play");
  // "Show me on the field" picks players from the Rules check; the drawer stays on the check.
  const keepTab = useRef(false);
  useEffect(() => {
    if (keepTab.current) keepTab.current = false;
    else setTab(hasSelection ? "selection" : "play");
  }, [hasSelection]);

  // Rules check, read from the drawing (and the Vs defense under it).
  const [toGoal, setToGoal] = useState<number | null>(null);
  const check = useMemo(() => checkRules(scene, meta, rules, { underlay, toGoal }), [scene, meta, rules, underlay, toGoal]);
  const set = ruleSet(rules.set);

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
      <div className="insp-tabs" role="tablist" aria-label="Designer panel">
        <button type="button" role="tab" id="insp-tab-selection" aria-selected={tab === "selection"} aria-controls="insp-pane" className={tab === "selection" ? "is-on" : ""} onClick={() => setTab("selection")}>
          Selection{hasSelection && <b className="insp-tab-count">{selection.length}</b>}
        </button>
        <button type="button" role="tab" id="insp-tab-play" aria-selected={tab === "play"} aria-controls="insp-pane" className={tab === "play" ? "is-on" : ""} onClick={() => setTab("play")}>
          Play{check.fails > 0 && <b className="insp-tab-count insp-tab-alert" aria-label={`${check.fails} rule problems`}>{check.fails}</b>}
        </button>
      </div>
      <div id="insp-pane" role="tabpanel" aria-labelledby={`insp-tab-${tab}`}>
      {tab === "play" && (
      <>
      <Panel title="Play intel" icon="board" defaultOpen>
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
        <div className="field">
          <span id="play-personnel-label">Personnel</span>
          <select
            className="select"
            aria-labelledby="play-personnel-label"
            value={personnelChoice}
            onChange={(e) => {
              const v = e.target.value;
              setCustomPersonnel(v === CUSTOM);
              onMeta({ personnel: v === CUSTOM ? (knownChoice ? "" : meta.personnel) : v });
            }}
          >
            <option value="">Pick one</option>
            {personnelGroups(meta.playType).map((g) => (
              <optgroup key={g.id} label={g.label}>
                {g.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </optgroup>
            ))}
            <option value={CUSTOM}>Custom…</option>
          </select>
          {personnelChoice === CUSTOM && (
            <input
              className="input"
              style={{ marginTop: 6 }}
              value={meta.personnel}
              aria-label="Custom personnel"
              placeholder="Type your own grouping"
              autoFocus={customPersonnel}
              onChange={(e) => onMeta({ personnel: e.target.value })}
            />
          )}
        </div>
        <div className="field">
          <span>Field</span>
          <div className="chip-row">
            {FIELD_VIEWS.map((v) => (
              <Tooltip key={v.id} title={v.label} hint={v.hint} side="top">
                <button type="button" className={`chip${scene.view === v.id ? " is-on" : ""}`} aria-pressed={scene.view === v.id} onClick={() => onField(v.id)}>
                  {v.label}
                </button>
              </Tooltip>
            ))}
          </div>
          <p className="hint">Routes keep their depth in yards when the field changes. Hash marks, yard-line contrast and snap to grid live in Extras → Field controls at the top.</p>
          <label className="field" style={{ marginTop: 10, marginBottom: 0 }}>
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
            <button type="button" className="btn btn-ghost btn-sm btn-block" style={{ marginTop: 8 }} onClick={() => onScene({ ...scene, pivot: null }, "Clear pivot")}>
              <Icon name="pivot" size={14} /> Clear pivot point
            </button>
          )}
        </div>
        <label className="field">
          <span>Coaching notes</span>
          <textarea
            className="textarea"
            value={meta.description}
            placeholder="Y reads the corner's hips. If he squats, break it off at eight."
            onChange={(e) => onMeta({ description: e.target.value })}
          />
          <p className="hint">These notes print under the diagram on letter and half-page exports.</p>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              const words = explainPlay(scene);
              if (words) onMeta({ description: meta.description.trim() ? `${meta.description.trim()}\n\n${words}` : words });
            }}
            disabled={!explainPlay(scene)}
          >
            <Icon name="sparkle" size={14} /> Write the talking points for me
          </button>
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

      <Panel title="Opponent front" icon="user" count={opponent.showing ?? undefined}>
        <OpponentFront {...opponent} flag={!set.sevenOnLine} />
      </Panel>

      <Panel title="Rules check" icon="check" count={check.fails ? `${check.fails} to fix` : check.warns ? `${check.warns} to check` : "Legal"}>
        <RulesCheck
          check={check}
          rules={rules}
          onRules={onRules}
          toGoal={toGoal}
          onToGoal={setToGoal}
          onShow={(ids) => {
            keepTab.current = selection.length === 0;
            onSelection(ids);
          }}
        />
      </Panel>
      </>
      )}

      {tab === "selection" && (
      <>
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
              <label className="field">
                <span>Label</span>
                <input className="input" value={one.label} maxLength={3} onChange={(e) => patch({ label: e.target.value.toUpperCase() } as Partial<SceneNode>, "Label")} />
              </label>
              <p className="mini-label">Shape</p>
              <div className="chip-row">
                {(["circle", "square", "triangle", "diamond", "cross", "ball"] as const).map((s) => (
                  <button key={s} type="button" className={`chip${one.shape === s ? " is-on" : ""}`} onClick={() => patch({ shape: s } as Partial<SceneNode>, "Shape")}>
                    {s}
                  </button>
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

          {one?.kind === "shape" && (
            <>
              <p className="mini-label">Outline color</p>
              <ColorPicker label="Outline" value={one.stroke} onChange={(c) => patch({ stroke: c } as Partial<SceneNode>, "Color")} />
            </>
          )}
          {selected.some((n) => n.kind !== "shape") && (
            <p className="hint">Color, weight, dash, curve and size are in the Style card under the tools on the left.</p>
          )}
        </Panel>
      )}

      {hasSelection && (
      <Panel title="Player presets" icon="user">
        <PlayerPresets scene={scene} selection={selection} onScene={onScene} onSelection={onSelection} />
      </Panel>
      )}

      {one?.kind === "player" && (
      <Panel title="Player notes" icon="text">
        {one?.kind === "player" ? (
          <div className="pn">
            <p className="pn-who">
              <span className="pn-token" style={{ background: one.fill, color: one.textColor }} aria-hidden="true">
                {one.label}
              </span>
              {one.label || one.name} selected
            </p>
            <textarea
              className="textarea"
              rows={3}
              aria-label={`Notes for ${one.label || one.name}`}
              placeholder="Read the flat defender. If he sinks, sit down at 4 yards and face the QB."
              value={one.note ?? ""}
              onChange={(e) => patch({ note: e.target.value } as Partial<SceneNode>, "Player note")}
            />
            <label className="switch">
              <input
                type="checkbox"
                checked={one.noteHover !== false}
                onChange={(e) => patch({ noteHover: e.target.checked } as Partial<SceneNode>, "Player note")}
              />
              Show on hover in the Designer
            </label>
            <label className="switch">
              <input
                type="checkbox"
                checked={one.notePrint !== false}
                onChange={(e) => patch({ notePrint: e.target.checked } as Partial<SceneNode>, "Player note")}
              />
              Print under the diagram
            </label>
            <label className="switch">
              <input
                type="checkbox"
                checked={one.noteWristband === true}
                onChange={(e) => patch({ noteWristband: e.target.checked } as Partial<SceneNode>, "Player note")}
              />
              Add to this player’s wristband card
            </label>
          </div>
        ) : (
          <p className="hint">Select one player on the field to write a note for them.</p>
        )}
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
            <button type="button" className="chip" onClick={() => onScene(sendToBack(scene, selection), "Send to back")}>
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
      </>
      )}
      </div>
    </div>
  );
}

type PatchFn = (changes: Partial<SceneNode> | ((n: SceneNode) => Partial<SceneNode>), label?: string) => void;

function PathFields({ node, patch, onFirstRead }: { node: PathNode; patch: PatchFn; onFirstRead: (on: boolean) => void }) {
  return (
    <>
      <label className="field">
        <span>{node.closed ? "Zone tag" : "Route tag"}</span>
        <input
          className="input"
          id="route-tag"
          value={node.tag ?? ""}
          maxLength={TAG_MAX}
          list="route-tag-ideas"
          placeholder={node.closed ? "Hook, Deep 1/3, Flat" : "Post, 12 yds, Hot, Option"}
          onChange={(e) => patch({ tag: e.target.value || undefined } as Partial<SceneNode>, "Route tag")}
        />
        <datalist id="route-tag-ideas">
          {[...ROUTE_TREE, "Hot", "Option", "Read 1", "Read 2", "Check down", "Hook", "Curl/Flat", "Deep 1/3", "Deep 1/2"].map((r) => (
            <option key={r} value={r} />
          ))}
        </datalist>
        <p className="hint">Prints at the end of the line and moves with it.</p>
      </label>
      <label className="switch">
        <input type="checkbox" checked={!!node.firstRead} onChange={(e) => onFirstRead(e.target.checked)} />
        First read (draws this route in cyan)
      </label>
      <div className="row">
        <label className="field">
          <span>Start cap</span>
          <select className="select" value={node.startCap} onChange={(e) => patch({ startCap: e.target.value } as Partial<SceneNode>, "Cap")}>
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
      {node.fromId && node.toId ? (
        <p className="hint">This line is joined to two players and follows them when they move.</p>
      ) : node.fromId ? (
        <p className="hint">This route starts on a player and moves with him.</p>
      ) : null}
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
      <p className="mini-label">Fill color</p>
      <ColorPicker label="Fill" value={node.fill} onChange={(c) => patch({ fill: c } as Partial<SceneNode>, "Fill")} />
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
      <label className="switch">
        <input type="checkbox" checked={node.boxed} onChange={(e) => patch({ boxed: e.target.checked } as Partial<SceneNode>, "Boxed")} />
        Boxed callout
      </label>
    </>
  );
}

