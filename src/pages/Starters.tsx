import { useMemo, useState, Suspense } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Shell } from "../components/Shell";
import { Icon } from "../components/Icon";
import { Modal } from "../components/Modal";
import { PlayThumb } from "../components/PlayThumb";
import { Tooltip } from "../components/Tooltip";
import { lazyPage } from "../lib/lazyPage";
import { FREE_SAMPLE_NUMBERS, STARTERS, starterScene, type StarterSpec } from "../lib/starters";
import { bestAgainst, WHY_IT_WORKS } from "../lib/starterIntel";
import { explainPlay } from "../lib/explain";
import { gateSave } from "../lib/plan";
import { useTier } from "../lib/tier";
import { store, useStore } from "../lib/store";
import { useToast } from "../lib/toast";
import { uid } from "../lib/types";
import type { StoredPlay } from "../lib/types";

// PDF, PNG and PowerPoint code (jsPDF, svg2pdf, pptxgenjs and the print renderer) downloads when the coach opens Export.
const ExportDialog = lazyPage(() => import("../components/ExportDialog"), "ExportDialog");

const TYPES: { id: string; label: string }[] = [
  { id: "all", label: "Everything" },
  { id: "pass", label: "Pass" },
  { id: "run", label: "Run" },
  { id: "defense", label: "Defense" },
  { id: "special", label: "Teaching" },
];

const toPlay = (spec: StarterSpec, ownerName: string): StoredPlay => ({
  id: uid("play"),
  ownerName,
  name: spec.name,
  formation: spec.formation,
  playType: spec.playType,
  personnel: spec.personnel,
  description: spec.description,
  tags: ["starter", ...spec.tags],
  isPublic: false,
  fieldView: "half",
  scene: starterScene(spec),
  preview: "",
  saveCount: 0,
  updatedAt: new Date().toISOString(),
  remote: false,
});

export function Starters() {
  const tier = useTier();
  const toast = useToast();
  const navigate = useNavigate();
  const plays = useStore((s) => s.plays);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [formation, setFormation] = useState("all");
  const [picked, setPicked] = useState<number[]>([]);
  const [preview, setPreview] = useState<StarterSpec | null>(null);
  const [exporting, setExporting] = useState(false);

  const formations = useMemo(
    () => ["all", ...[...new Set(STARTERS.map((s) => s.formation))]],
    [],
  );

  const locked = (spec: StarterSpec) => tier.id === "free" && !FREE_SAMPLE_NUMBERS.includes(spec.n);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return STARTERS.filter((s) => {
      if (type !== "all" && s.playType !== type) return false;
      if (formation !== "all" && s.formation !== formation) return false;
      if (!q) return true;
      return `${s.name} ${s.formation} ${s.description} ${s.tags.join(" ")}`.toLowerCase().includes(q);
    });
  }, [query, type, formation]);

  const toggle = (n: number) =>
    setPicked((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]));

  const copyOne = (spec: StarterSpec) => {
    const gate = gateSave(tier, plays.length);
    if (!gate.ok) {
      toast(gate.reason);
      return null;
    }
    const play = toPlay(spec, "GridIronVault starters");
    store.upsertPlay(play);
    return play;
  };

  const openInDesigner = (spec: StarterSpec) => {
    const play = copyOne(spec);
    if (play) navigate(`/build/${play.id}`);
  };

  const copyPicked = () => {
    let added = 0;
    for (const n of picked) {
      const spec = STARTERS.find((s) => s.n === n);
      if (!spec || locked(spec)) continue;
      const gate = gateSave(tier, plays.length + added);
      if (!gate.ok) {
        toast(gate.reason);
        break;
      }
      store.upsertPlay(toPlay(spec, "GridIronVault starters"));
      added += 1;
    }
    if (added) {
      toast(`${added} ${added === 1 ? "play" : "plays"} copied into your Vault.`);
      setPicked([]);
    }
  };

  const pickedPlays = useMemo(
    () =>
      picked
        .map((n) => STARTERS.find((s) => s.n === n))
        .filter((s): s is StarterSpec => Boolean(s) && !locked(s!))
        .map((s) => toPlay(s, "GridIronVault starters")),
    [picked, tier.id],
  );

  return (
    <Shell
      title="Starter plays"
      actions={
        <>
          <Link to="/vault" className="btn btn-quiet btn-sm">
            <Icon name="board" size={15} /> Your Vault
          </Link>
          <Link to="/build" className="btn btn-primary btn-sm">
            <Icon name="plus" size={15} /> Draw your own
          </Link>
        </>
      }
    >
      <div className="page-head">
        <div>
          <h2>Starter plays</h2>
          <p>
            Fifty-six plays redrawn for GridIronVault — the route tree, ten formations with three plays each,
            nine run concepts and five coverage shells. Copy any of them into your Vault and change
            whatever you want. They are yours after that.
          </p>
        </div>
        <div className="head-stats">
          <div className="stat">
            <b>{STARTERS.length}</b>
            <span>Plays</span>
          </div>
          <div className="stat">
            <b>{formations.length - 1}</b>
            <span>Formations</span>
          </div>
          <div className="stat">
            <b>{plays.length}</b>
            <span>In your Vault</span>
          </div>
        </div>
      </div>

      <div className="filters">
        <div className="search-box">
          <Icon name="search" size={15} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search plays, formations or labels"
            aria-label="Search starter plays"
          />
          {query && (
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => setQuery("")}>
              Clear
            </button>
          )}
        </div>
        <select className="select" value={formation} onChange={(e) => setFormation(e.target.value)} aria-label="Formation">
          {formations.map((f) => (
            <option key={f} value={f}>
              {f === "all" ? "All formations" : f}
            </option>
          ))}
        </select>
        <div className="chip-row" role="group" aria-label="Filter by play type">
          {TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`chip${type === t.id ? " is-on" : ""}`}
              onClick={() => setType(t.id)}
              aria-pressed={type === t.id}
            >
              {t.label}
            </button>
          ))}
        </div>
        <span className="filter-count">{visible.length} shown</span>
      </div>

      {tier.id === "free" && (
        <div className="lock-note">
          <Icon name="lock" size={15} />
          <div>
            <b>Five starter plays are open on Sideline.</b>
            <span>
              The other {STARTERS.length - FREE_SAMPLE_NUMBERS.length} — every formation, the run game and
              all five coverages — come with Head Coach.
            </span>
          </div>
          <Link to="/pricing" className="btn btn-primary btn-sm">
            See plans
          </Link>
        </div>
      )}

      {visible.length === 0 ? (
        <div className="empty">
          <Icon name="search" size={30} />
          <h3>No starter play matches that</h3>
          <p>Try a formation name like Trips, a concept like flood, or clear the filters.</p>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setQuery("");
              setType("all");
              setFormation("all");
            }}
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="play-grid">
          {visible.map((spec) => {
            const isLocked = locked(spec);
            return (
              <article className={`play-card${isLocked ? " is-locked" : ""}`} key={spec.n}>
                <label className="play-pick">
                  <input
                    type="checkbox"
                    checked={picked.includes(spec.n)}
                    onChange={() => toggle(spec.n)}
                    disabled={isLocked}
                    aria-label={`Select ${spec.name}`}
                  />
                </label>
                <button
                  type="button"
                  className="play-thumb"
                  onClick={() => setPreview(spec)}
                  aria-label={`Preview ${spec.name}`}
                >
                  <PlayThumb scene={starterScene(spec)} label={spec.name} />
                  {isLocked && (
                    <span className="thumb-lock">
                      <Icon name="lock" size={18} />
                      <span className="sr-only">Locked on your plan</span>
                    </span>
                  )}
                </button>
                <div className="play-meta">
                  <h3>{spec.name}</h3>
                  <p>{spec.formation}</p>
                  <div className="play-tags">
                    <span className={`pill pill-${spec.playType}`}>{spec.playType}</span>
                    <b className="play-num">{String(spec.n).padStart(2, "0")}</b>
                  </div>
                </div>
                <div className="play-actions">
                  <Tooltip title="Copy to your Vault" hint="Makes an editable copy you own. The starter stays untouched.">
                    <button
                      type="button"
                      className="btn btn-quiet btn-sm"
                      disabled={isLocked}
                      onClick={() => {
                        if (copyOne(spec)) toast(`${spec.name} copied into your Vault.`);
                      }}
                      aria-label={`Copy ${spec.name} to your Vault`}
                    >
                      <Icon name="copy" size={14} /> Copy
                    </button>
                  </Tooltip>
                  <Tooltip title="Open in the designer" hint="Copies it first, then loads it so you can redraw the routes.">
                    <button
                      type="button"
                      className="btn btn-dark btn-sm"
                      disabled={isLocked}
                      onClick={() => openInDesigner(spec)}
                      aria-label={`Edit ${spec.name} in the designer`}
                    >
                      <Icon name="cursor" size={14} /> Edit
                    </button>
                  </Tooltip>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {picked.length > 0 && (
        <div className="bulk-bar" role="group" aria-label="Selected starter plays">
          <span className="sr-only" role="status" aria-live="polite">
            {picked.length} starter play{picked.length === 1 ? "" : "s"} selected
          </span>
          <span aria-hidden="true">
            <b>{picked.length}</b> selected
          </span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={copyPicked}>
            <Icon name="copy" size={15} /> Copy to Vault
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setExporting(true)}>
            <Icon name="print" size={15} /> Export or print
          </button>
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => setPicked([])}>
            Clear
          </button>
        </div>
      )}

      {preview && (
        <Modal
          title={preview.name}
          onClose={() => setPreview(null)}
          wide
          footer={
            <>
              <button type="button" className="btn btn-quiet" onClick={() => setPreview(null)}>
                Close
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={locked(preview)}
                onClick={() => {
                  if (copyOne(preview)) toast(`${preview.name} copied into your Vault.`);
                  setPreview(null);
                }}
              >
                Copy to Vault
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={locked(preview)}
                onClick={() => openInDesigner(preview)}
              >
                Open in designer
              </button>
            </>
          }
        >
          <div className="preview-body">
            <div className="preview-art">
              <PlayThumb scene={starterScene(preview)} label={preview.name} />
            </div>
            <dl className="preview-facts">
              <div>
                <dt>Formation</dt>
                <dd>{preview.formation}</dd>
              </div>
              <div>
                <dt>Type</dt>
                <dd>{preview.playType}</dd>
              </div>
              <div>
                <dt>Personnel</dt>
                <dd>{preview.personnel}</dd>
              </div>
              <div>
                <dt>Card</dt>
                <dd>{String(preview.n).padStart(2, "0")} of {STARTERS.length}</dd>
              </div>
            </dl>
            <p className="preview-note">{preview.description}</p>
            <StarterIntel spec={preview} />
            <div className="play-tags">
              {preview.tags.map((t) => (
                <span className="chip" key={t}>
                  {t}
                </span>
              ))}
            </div>
          </div>
        </Modal>
      )}

      {exporting && (
        <Suspense fallback={null}>
          <ExportDialog
            plays={pickedPlays}
            tier={tier}
            onClose={() => setExporting(false)}
            onUpgrade={() => navigate("/pricing")}
            onDone={(kind) => toast(`${pickedPlays.length} ${pickedPlays.length === 1 ? "play" : "plays"} exported as ${kind.toUpperCase()}.`)}
          />
        </Suspense>
      )}
    </Shell>
  );
}

/** Why it works, what it beats (from the Coverage check for pass plays) and who does what. */
function StarterIntel({ spec }: { spec: StarterSpec }) {
  const best = useMemo(() => bestAgainst(spec), [spec]);
  const jobs = useMemo(() => explainPlay(starterScene(spec)).split("\n").filter(Boolean), [spec]);
  const why = WHY_IT_WORKS[spec.n];
  return (
    <div className="starter-intel">
      {why && (
        <section>
          <h4>Why it works</h4>
          <p>{why}</p>
        </section>
      )}
      {(best.looks.length > 0 || best.words || best.format) && (
        <section>
          <h4>Best against</h4>
          {best.looks.length > 0 && (
            <div className="play-tags">
              {best.looks.map((l) => (
                <span className="pill pill-pass" key={l}>
                  {l}
                </span>
              ))}
            </div>
          )}
          {best.format && !best.looks.length && <p>Nothing in the {best.format} looks yet. Copy it and adjust the routes in the Coverage check.</p>}
          {best.words && <p>{best.words}</p>}
          {best.format && <p className="hint">From the Coverage check: the play run against every {best.format} look. A teaching model, not a promise.</p>}
        </section>
      )}
      {jobs.length > 0 && (
        <section>
          <h4>Who does what</h4>
          <ul>
            {jobs.map((j, i) => (
              <li key={i}>{j}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
