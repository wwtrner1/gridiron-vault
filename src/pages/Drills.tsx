import { cloneElement, useEffect, useId, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Shell } from "../components/Shell";
import { Icon } from "../components/Icon";
import { Modal } from "../components/Modal";
import { DrillField } from "../components/DrillField";
import { PlayThumb } from "../components/PlayThumb";
import { PracticeTabs } from "../components/PracticeTabs";
import { Tooltip } from "../components/Tooltip";
import {
  DRILL_CATEGORIES,
  DRILL_LIMITS,
  SEED_DRILLS,
  allDrills,
  cleanDrill,
  copyOf,
  drillText,
  loadDrills,
  saveDrills,
  type Drill,
  type DrillCategory,
  type DrillSide,
} from "../lib/drills";
import { filmEmbed, filmYoutubeId } from "../lib/filmNotes";
import { addDrillToScript, hasSavedScript, loadScript, PRACTICE_SYNCED_EVENT } from "../lib/practice";
import { useStore } from "../lib/store";
import { useToast } from "../lib/toast";
import "../styles/drills.css";

const SIDES: { id: DrillSide | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "offense", label: "Offense" },
  { id: "defense", label: "Defense" },
  { id: "both", label: "Both sides" },
];

/**
 * The Drill Vault: built-in drills and the coach's own, each with a diagram
 * that animates, the steps, the coaching points and film. A drill goes into a
 * period of the practice script from here or from the Practice page.
 */
export function Drills() {
  const [saved, setSaved] = useState(loadDrills);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<DrillCategory | "all">("all");
  const [side, setSide] = useState<DrillSide | "all">("all");
  const [favOnly, setFavOnly] = useState(false);
  const [params, setParams] = useSearchParams();
  const [editing, setEditing] = useState<(Drill & { diagramFrom?: string }) | null>(null);
  const toast = useToast();

  // The account's copy arrived (sign-in on a new device): read it again.
  useEffect(() => {
    const reload = () => setSaved(loadDrills());
    window.addEventListener(PRACTICE_SYNCED_EVENT, reload);
    return () => window.removeEventListener(PRACTICE_SYNCED_EVENT, reload);
  }, []);

  const drills = useMemo(() => allDrills(saved.custom), [saved.custom]);
  const open = drills.find((d) => d.id === params.get("drill")) ?? null;
  const setOpen = (d: Drill | null) => {
    const next = new URLSearchParams(params);
    if (d) next.set("drill", d.id);
    else next.delete("drill");
    setParams(next, { replace: true });
  };

  const persist = (change: (s: typeof saved) => typeof saved) =>
    setSaved((prev) => {
      const next = change(prev);
      saveDrills(next);
      return next;
    });
  const favs = new Set(saved.favorites);
  const toggleFav = (d: Drill) =>
    persist((s) => ({
      ...s,
      favorites: s.favorites.includes(d.id) ? s.favorites.filter((x) => x !== d.id) : [...s.favorites, d.id],
      favoritesAt: new Date().toISOString(),
    }));

  const words = q.trim().toLowerCase();
  const shown = drills.filter(
    (d) =>
      (cat === "all" || d.category === cat) &&
      (side === "all" || d.side === side || (side !== "both" && d.side === "both")) &&
      (!favOnly || favs.has(d.id)) &&
      (!words || drillText(d).includes(words)),
  );

  const saveDrill = (raw: Drill & { diagramFrom?: string }) => {
    const d = cleanDrill({ ...raw, updatedAt: new Date().toISOString() });
    if (!d) return false;
    const exists = saved.custom.some((x) => x.id === d.id);
    persist((s) => ({ ...s, custom: exists ? s.custom.map((x) => (x.id === d.id ? d : x)) : [d, ...s.custom].slice(0, DRILL_LIMITS.custom) }));
    setEditing(null);
    toast(exists ? `${d.name} saved.` : `${d.name} is in your Drill Vault.`);
    setOpen(d);
    return true;
  };

  return (
    <Shell
      title="Drill Vault"
      tabs={<PracticeTabs current="drills" />}
      actions={
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setEditing(blankDrill())}>
          <Icon name="plus" size={15} /> New drill
        </button>
      }
    >
      <section className="dr-hero" aria-label="About the Drill Vault">
        <div>
          <p className="dr-eyebrow">Practice · Drill Vault</p>
          <h2>Drills that run on the screen</h2>
          <p>
            {SEED_DRILLS.length} drills to start, every one with a diagram that plays, the steps, the coaching points and film. Add your own, then drop
            any drill into a period of tonight's practice.
          </p>
        </div>
        <dl className="dr-stats">
          <div><dt>Drills</dt><dd>{drills.length}</dd></div>
          <div><dt>Yours</dt><dd>{saved.custom.length}</dd></div>
          <div><dt>Starred</dt><dd>{saved.favorites.length}</dd></div>
        </dl>
      </section>

      <div className="dr-filters">
        <label className="dr-search">
          <Icon name="search" size={16} />
          <input className="input" type="search" placeholder="Find a drill, a skill or equipment" aria-label="Find a drill" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <div className="chip-row" role="group" aria-label="Position group">
          <button type="button" className={`chip${cat === "all" ? " is-on" : ""}`} aria-pressed={cat === "all"} onClick={() => setCat("all")}>Every group</button>
          {DRILL_CATEGORIES.map((c) => (
            <button key={c} type="button" className={`chip${cat === c ? " is-on" : ""}`} aria-pressed={cat === c} onClick={() => setCat(c)}>{c}</button>
          ))}
        </div>
        <div className="chip-row" role="group" aria-label="Side of the ball">
          {SIDES.map((s) => (
            <button key={s.id} type="button" className={`chip${side === s.id ? " is-on" : ""}`} aria-pressed={side === s.id} onClick={() => setSide(s.id)}>{s.label}</button>
          ))}
          <button type="button" className={`chip${favOnly ? " is-on" : ""}`} aria-pressed={favOnly} onClick={() => setFavOnly((v) => !v)}>★ Starred</button>
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="empty empty-sm">
          <h3>No drill matches</h3>
          <p>Try fewer words, another group, or write this one yourself.</p>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setEditing({ ...blankDrill(), name: q.trim().slice(0, DRILL_LIMITS.name) })}>
            <Icon name="plus" size={15} /> New drill
          </button>
        </div>
      ) : (
        <ul className="dr-grid" aria-label="Drills">
          {shown.map((d) => (
            <li key={d.id} className="dr-card">
              {/* The picture opens the drill too; the Open button below is the one for keyboards and screen readers. */}
              <button type="button" className="dr-card-open" onClick={() => setOpen(d)} tabIndex={-1} aria-hidden="true">
                <DrillPicture drill={d} />
              </button>
              <div className="dr-card-body">
                <div className="dr-card-top">
                  <span className={`dr-cat dr-cat-${slug(d.category)}`}>{d.category}</span>
                  {d.custom && <span className="pill pill-cyan">Yours</span>}
                  <button type="button" className={`dr-star${favs.has(d.id) ? " is-on" : ""}`} aria-pressed={favs.has(d.id)} aria-label={`Star ${d.name}`} onClick={() => toggleFav(d)}>★</button>
                </div>
                <h3>{d.name}</h3>
                <p className="dr-meta">
                  <span>{d.minutes} min</span>
                  {d.players && <span>{d.players}</span>}
                  {d.video && <span>▶ Film</span>}
                </p>
                <div className="dr-card-actions">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(d)} aria-label={`Open ${d.name}`}>Open</button>
                  <AddToPractice drill={d} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <DrillDetail
          drill={open}
          onClose={() => setOpen(null)}
          onCopy={() => {
            setEditing(copyOf(open));
            setOpen(null);
          }}
          onEdit={() => {
            setEditing({ ...open });
            setOpen(null);
          }}
          onDelete={() => {
            const gone = open;
            const at = saved.custom.findIndex((x) => x.id === gone.id);
            // The tombstone keeps another device from bringing it back.
            persist((s) => ({
              ...s,
              custom: s.custom.filter((x) => x.id !== gone.id),
              deleted: [{ id: gone.id, at: new Date().toISOString() }, ...(s.deleted ?? []).filter((t) => t.id !== gone.id)],
            }));
            setOpen(null);
            toast(`${gone.name} deleted.`, false, {
              label: "Undo",
              run: () =>
                persist((s) => {
                  if (s.custom.some((x) => x.id === gone.id)) return s;
                  // Saved again now, so it outranks the delete on every device.
                  const back = { ...gone, updatedAt: new Date().toISOString() };
                  return { ...s, custom: [...s.custom.slice(0, at), back, ...s.custom.slice(at)], deleted: (s.deleted ?? []).filter((t) => t.id !== gone.id) };
                }),
            });
          }}
        />
      )}
      {editing && <DrillEditor drill={editing} onCancel={() => setEditing(null)} onSave={saveDrill} />}
    </Shell>
  );
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z]+/g, "-");

const blankDrill = (): Drill & { diagramFrom?: string } => ({
  id: "",
  name: "",
  category: "Team & conditioning",
  side: "both",
  minutes: 5,
  players: "",
  equipment: [],
  setup: "",
  steps: [],
  points: [],
  custom: true,
});

/** The drill's diagram: its own, else the Vault play it points at, else a plain field note. */
function DrillPicture({ drill, playing = false }: { drill: Drill; playing?: boolean }) {
  const play = useStore((s) => (drill.playId ? s.plays.find((p) => p.id === drill.playId) : undefined));
  if (drill.diagram) return <DrillField diagram={drill.diagram} playing={playing} label={`${drill.name} diagram`} />;
  if (play) return <PlayThumb scene={play.scene} label={`${drill.name} diagram`} />;
  return (
    <div className="dr-nodiagram" role="img" aria-label={`${drill.name}: no diagram yet`}>
      <Icon name="board" size={26} />
      <span>No diagram yet</span>
    </div>
  );
}

/** "Add to practice": a list of the script's periods; picking one files the drill there. */
function AddToPractice({ drill }: { drill: Drill }) {
  const toast = useToast();
  const [script, setScript] = useState(loadScript);
  const periods = script.periods;
  useEffect(() => {
    const reload = () => setScript(loadScript());
    window.addEventListener(PRACTICE_SYNCED_EVENT, reload);
    return () => window.removeEventListener(PRACTICE_SYNCED_EVENT, reload);
  }, []);
  return (
    <select
      className="select select-sm dr-add"
      aria-label={`Add ${drill.name} to a practice period`}
      value=""
      onFocus={() => {
        // Keep the ids the list shows unless the script was saved since.
        if (hasSavedScript()) setScript(loadScript());
      }}
      onChange={(e) => {
        const p = periods.find((x) => x.id === e.target.value);
        if (!p) return;
        setScript(addDrillToScript(p.id, drill.id, script));
        toast(`${drill.name} added to ${p.title}.`);
      }}
    >
      <option value="">Add to practice…</option>
      {periods.map((p) => (
        <option key={p.id} value={p.id}>{p.title} ({p.minutes} min)</option>
      ))}
    </select>
  );
}

function DrillDetail({ drill, onClose, onCopy, onEdit, onDelete }: { drill: Drill; onClose: () => void; onCopy: () => void; onEdit: () => void; onDelete: () => void }) {
  const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const [playing, setPlaying] = useState(!reduce);
  const [film, setFilm] = useState(false);
  useEffect(() => setFilm(false), [drill.id]);
  const yt = drill.video ? filmYoutubeId(drill.video) : null;
  const isSearch = !!drill.video && /youtube\.com\/results/.test(drill.video);
  const animates = !!drill.diagram;

  return (
    <Modal
      title={drill.name}
      onClose={onClose}
      wide
      footer={
        <>
          <AddToPractice drill={drill} />
          <span className="spacer" />
          {drill.custom ? (
            <>
              <button type="button" className="btn btn-ghost btn-sm" onClick={onDelete}>Delete</button>
              <button type="button" className="btn btn-primary btn-sm" onClick={onEdit}>Edit drill</button>
            </>
          ) : (
            <button type="button" className="btn btn-primary btn-sm" onClick={onCopy}>Copy and make it mine</button>
          )}
        </>
      }
    >
      <div className="dr-detail">
        <div className="dr-detail-pic">
          {film && yt ? (
            <iframe
              className="dr-film"
              src={filmEmbed(yt, 0, window.location.origin)}
              title={`${drill.name} film`}
              allow="encrypted-media; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <DrillPicture drill={drill} playing={playing} />
          )}
          <div className="dr-detail-bar">
            {animates && !film && (
              <button type="button" className="btn btn-ghost btn-sm" aria-pressed={playing} onClick={() => setPlaying((v) => !v)}>
                {playing ? "Pause" : "Play the drill"}
              </button>
            )}
            {yt && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFilm((v) => !v)}>
                {film ? "Show the diagram" : "Watch the film here"}
              </button>
            )}
            {drill.video && (
              <a className="btn btn-ghost btn-sm" href={drill.video} target="_blank" rel="noopener noreferrer">
                {isSearch ? "Find film on YouTube" : "Open the film"} <span className="sr-only">(opens a new tab)</span>
              </a>
            )}
            <Legend />
          </div>
        </div>
        <div className="dr-detail-text">
          <p className="dr-meta">
            <span className={`dr-cat dr-cat-${slug(drill.category)}`}>{drill.category}</span>
            <span>{drill.minutes} min</span>
            {drill.players && <span>{drill.players}</span>}
            <span>{drill.side === "both" ? "Offense and defense" : drill.side === "offense" ? "Offense" : "Defense"}</span>
          </p>
          {drill.equipment.length > 0 && (
            <p className="dr-equip"><b>You need:</b> {drill.equipment.join(" · ")}</p>
          )}
          {drill.setup && (
            <>
              <h3>Setup</h3>
              <p>{drill.setup}</p>
            </>
          )}
          {drill.steps.length > 0 && (
            <>
              <h3>Run it</h3>
              <ol>{drill.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
            </>
          )}
          {drill.points.length > 0 && (
            <>
              <h3>Coaching points</h3>
              <ul className="dr-points">{drill.points.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </>
          )}
          {isSearch && <p className="dr-fine">The film link searches YouTube for this drill, so it always finds current clips. Paste your own video into your copy.</p>}
        </div>
      </div>
    </Modal>
  );
}

function Legend() {
  return (
    <ul className="dr-legend" aria-label="Line key">
      <li><i className="k-run" />Sprint</li>
      <li><i className="k-back" />Backpedal</li>
      <li><i className="k-shuffle" />Shuffle</li>
      <li><i className="k-throw" />Ball</li>
    </ul>
  );
}

type Draft = { name: string; category: DrillCategory; side: DrillSide; minutes: string; players: string; equipment: string; setup: string; steps: string; points: string; video: string; picture: string };

function DrillEditor({ drill, onCancel, onSave }: { drill: Drill & { diagramFrom?: string }; onCancel: () => void; onSave: (d: Drill & { diagramFrom?: string }) => boolean }) {
  const plays = useStore((s) => s.plays);
  const [f, setF] = useState<Draft>({
    name: drill.name,
    category: drill.category,
    side: drill.side,
    minutes: String(drill.minutes),
    players: drill.players,
    equipment: drill.equipment.join(", "),
    setup: drill.setup,
    steps: drill.steps.join("\n"),
    points: drill.points.join("\n"),
    video: drill.video ?? "",
    picture: drill.playId ? `play:${drill.playId}` : drill.diagramFrom ? `seed:${drill.diagramFrom}` : drill.diagram ? "keep" : "",
  });
  const [error, setError] = useState("");
  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.name.trim()) return setError("Give the drill a name, coach.");
    if (f.video.trim() && !/^https:\/\//i.test(f.video.trim())) return setError("Film links start with https:// (YouTube, Hudl or any page).");
    const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
    const seed = f.picture.startsWith("seed:") ? f.picture.slice(5) : undefined;
    const playId = f.picture.startsWith("play:") ? f.picture.slice(5) : undefined;
    onSave({
      ...drill,
      id: drill.id || "",
      name: f.name,
      category: f.category,
      side: f.side,
      minutes: Number(f.minutes) || 5,
      players: f.players,
      equipment: f.equipment.split(",").map((x) => x.trim()).filter(Boolean),
      setup: f.setup,
      steps: lines(f.steps),
      points: lines(f.points),
      video: f.video.trim() || undefined,
      playId,
      diagramFrom: seed,
      diagram: f.picture === "keep" ? drill.diagram : undefined,
    });
  };

  return (
    <Modal
      title={drill.id ? `Edit ${drill.name}` : "New drill"}
      onClose={onCancel}
      wide
      footer={
        <>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
          <button type="submit" form="dr-form" className="btn btn-primary btn-sm">Save drill</button>
        </>
      }
    >
      <form id="dr-form" className="dr-form" onSubmit={submit} noValidate>
        <FieldTip label="Drill name" tip="What your players call it, so it reads the same on the script.">
          <input className="input" value={f.name} maxLength={DRILL_LIMITS.name} onChange={set("name")} autoFocus />
        </FieldTip>
        <div className="dr-form-row">
          <FieldTip label="Position group" tip="Where it shows in the Drill Vault's filters.">
            <select className="select" value={f.category} onChange={set("category")}>
              {DRILL_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </FieldTip>
          <FieldTip label="Side of the ball" tip="Offense, defense or both.">
            <select className="select" value={f.side} onChange={set("side")}>
              <option value="offense">Offense</option>
              <option value="defense">Defense</option>
              <option value="both">Both sides</option>
            </select>
          </FieldTip>
          <FieldTip label="Minutes" tip="How long it usually runs in a period.">
            <input className="input" type="number" min={1} max={60} value={f.minutes} onChange={set("minutes")} />
          </FieldTip>
        </div>
        <div className="dr-form-row">
          <FieldTip label="Players" tip='How it is run, e.g. "2 lines" or "pairs".'>
            <input className="input" value={f.players} maxLength={60} onChange={set("players")} />
          </FieldTip>
          <FieldTip label="Equipment" tip="Separate items with commas: 4 cones, 2 balls.">
            <input className="input" value={f.equipment} onChange={set("equipment")} />
          </FieldTip>
        </div>
        <FieldTip label="Setup" tip="Where the cones, lines and coach go before the first rep.">
          <textarea className="textarea" value={f.setup} maxLength={DRILL_LIMITS.text} onChange={set("setup")} />
        </FieldTip>
        <FieldTip label="Steps (one per line)" tip="What happens on each rep, in order.">
          <textarea className="textarea" value={f.steps} onChange={set("steps")} />
        </FieldTip>
        <FieldTip label="Coaching points (one per line)" tip="What you're watching for and saying.">
          <textarea className="textarea" value={f.points} onChange={set("points")} />
        </FieldTip>
        <div className="dr-form-row">
          <FieldTip label="Film link" tip="A YouTube or Hudl link. YouTube links play right in the drill.">
            <input className="input" type="url" inputMode="url" placeholder="https://www.youtube.com/watch?v=…" value={f.video} onChange={set("video")} />
          </FieldTip>
          <FieldTip label="Diagram" tip="Use a built-in drill's animated diagram, or a play you drew in the Designer.">
            <select className="select" value={f.picture} onChange={set("picture")}>
              <option value="">No diagram</option>
              {drill.diagram && !drill.diagramFrom && <option value="keep">Keep this drill's diagram</option>}
              <optgroup label="Built-in drill diagrams">
                {SEED_DRILLS.map((d) => <option key={d.id} value={`seed:${d.id}`}>{d.name}</option>)}
              </optgroup>
              {plays.length > 0 && (
                <optgroup label="A play from your Vault">
                  {plays.map((p) => <option key={p.id} value={`play:${p.id}`}>{p.name}</option>)}
                </optgroup>
              )}
            </select>
          </FieldTip>
        </div>
        <p className="dr-fine">
          Want your own diagram? <Link to="/build" state={{ skipSetup: true }}>Draw it in the Designer</Link>, save it, then pick it here.
        </p>
        {error && <p className="form-error" role="alert">{error}</p>}
      </form>
    </Modal>
  );
}

/** A labelled field with an ⓘ that pops up what the field is for. */
export function FieldTip({ label, tip, group = false, children }: { label: string; tip: string; group?: boolean; children: React.ReactElement<{ id?: string }> }) {
  const id = useId();
  return (
    <div className="field dr-fieldtip">
      <span>
        {group ? <span className="dr-fieldtip-name">{label}</span> : <label htmlFor={id}>{label}</label>}
        <Tooltip title={label} hint={tip} side="top">
          <button type="button" className="tip-i" aria-label={`About ${label}`}>i</button>
        </Tooltip>
      </span>
      {group ? children : cloneElement(children, { id })}
    </div>
  );
}
