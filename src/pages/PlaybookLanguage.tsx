import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Shell } from "../components/Shell";
import { Icon } from "../components/Icon";
import { Modal } from "../components/Modal";
import { PlayThumb } from "../components/PlayThumb";
import { useStore } from "../lib/store";
import { useToast } from "../lib/toast";
import { exampleFor, playsUsing, type TermExample } from "../lib/termExamples";
import {
  SCOPE_LABEL,
  starterOriginal,
  STARTER_BY_ID,
  suggestTerms,
  termStore,
  TYPE_LABEL,
  usesOf,
  useTerms,
  type Term,
  type TermScope,
  type TermType,
} from "../lib/terms";
import "../styles/language.css";

type Draft = { id?: string; term: string; means: string; type: TermType; scope: TermScope; source?: string };
const blank = (term = "", type: TermType = "concept"): Draft => ({ term, means: "", type, scope: "you" });

const FILTERS: { id: "all" | TermType; label: string }[] = [
  { id: "all", label: "All" },
  { id: "concept", label: "Concepts" },
  { id: "formation", label: "Formations" },
  { id: "tag", label: "Tags" },
  { id: "gap", label: "Gaps & techniques" },
];

/**
 * Playbook language · your terms, from the Grid1ron Design canvas: the
 * coach's words for concepts, formations and tags — saved, edited, deleted,
 * and suggested from the words already used in the Vault.
 */
export function PlaybookLanguage() {
  const { terms, ignored } = useTerms();
  const plays = useStore((s) => s.plays);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | TermType>("all");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const [peek, setPeek] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const toast = useToast();
  const examples = useMemo(() => new Map(terms.map((t) => [t.id, exampleFor(t, plays)])), [terms, plays]);
  const missing = termStore.missingStarters();
  const opened = open ? terms.find((t) => t.id === open) : undefined;
  /** The term being edited as it is saved, so the form keeps its name while the coach retypes it. */
  const editing = draft?.id ? terms.find((t) => t.id === draft.id) : undefined;

  function remove(t: Term) {
    const at = terms.findIndex((x) => x.id === t.id);
    termStore.remove(t.id);
    toast(`“${t.term}” deleted.`, false, { label: "Undo", run: () => termStore.restore(t, at) });
  }

  const suggestions = useMemo(() => suggestTerms(plays, terms, ignored), [plays, terms, ignored]);
  const top = suggestions[0];
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const addedThisMonth = terms.filter((t) => t.source !== "Starter glossary" && t.added.startsWith(month)).length;
  const shared = terms.filter((t) => t.scope === "staff").length;

  const shown = terms.filter((t) => {
    if (filter !== "all" && t.type !== filter) return false;
    const q = query.trim().toLowerCase();
    return !q || `${t.term} ${t.means}`.toLowerCase().includes(q);
  });

  function save() {
    if (!draft) return;
    if (!draft.term.trim()) return setError("Give the term a name — the word you say on the sideline.");
    if (!draft.means.trim()) return setError("Say what it means, so Griddy draws it your way.");
    const dupe = terms.find((t) => t.term.trim().toLowerCase() === draft.term.trim().toLowerCase() && t.id !== draft.id);
    if (dupe) return setError(`“${dupe.term}” is already in your terms. Edit that one instead.`);
    termStore.save(draft);
    setDraft(null);
    setError("");
  }

  const edit = (t: Term) => (setDraft({ id: t.id, term: t.term, means: t.means, type: t.type, scope: t.scope, source: t.source }), setError(""));

  return (
    <Shell
      title="Playbook language"
      actions={
        <>
          <Link to="/vault" className="btn btn-ghost btn-sm">
            <Icon name="folder" size={15} /> The Vault
          </Link>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => (setDraft(blank()), setError(""))}>
            <Icon name="plus" size={15} /> Teach a new term
          </button>
        </>
      }
    >
      <div className="lang">
        <div className="lang-head">
          <p className="eyebrow">The Vault</p>
          <h2>Playbook language</h2>
          <p className="lang-lede">
            Your words for concepts, formations and tags. Griddy reads them with every message and draws your plays your
            way. Review, rename or delete them here.
          </p>
        </div>

        <div className="lang-stats">
          <div className="card stat">
            <b>{terms.length}</b>
            <span>Terms</span>
          </div>
          <div className="card stat">
            <b>{addedThisMonth}</b>
            <span>Added this month</span>
          </div>
          <div className="card stat">
            <b>{shared}</b>
            <span>Shared with staff</span>
          </div>
        </div>

        {top && !draft && (
          <div className="lang-suggest" role="status">
            <Icon name="sparkle" size={18} />
            <div>
              <b>
                New term seen in {top.count} plays: “{top.word}”
              </b>
              <p>You use it in your play names or labels. Save it with what it means, so every coach on your staff reads it the same way.</p>
            </div>
            <div className="lang-suggest-acts">
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => termStore.ignore(top.word)}>
                Ignore
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => (setDraft({ ...blank(top.word, top.type), source: "From your Vault" }), setError(""))}>
                Save term
              </button>
            </div>
          </div>
        )}

        {draft && (
          <form className="card lang-form" onSubmit={(e) => (e.preventDefault(), save())} aria-label={editing ? `Edit ${editing.term}` : "New term"}>
            <h3>{editing ? `Edit “${editing.term}”` : "Teach a new term"}</h3>
            <div className="lang-form-grid">
              <label className="field">
                <span>Term</span>
                <input className="input" value={draft.term} onChange={(e) => setDraft({ ...draft, term: e.target.value })} placeholder="Sail" autoFocus />
              </label>
              <label className="field">
                <span>Type</span>
                <select className="select" value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as TermType })}>
                  <option value="concept">Concept</option>
                  <option value="formation">Formation</option>
                  <option value="tag">Tag</option>
                  <option value="gap">Gap & technique</option>
                </select>
              </label>
              <label className="field">
                <span>Who uses it</span>
                <select className="select" value={draft.scope} onChange={(e) => setDraft({ ...draft, scope: e.target.value as TermScope })}>
                  <option value="you">Just you</option>
                  <option value="staff">You + staff</option>
                  {draft.scope === "shared" && <option value="shared">Shared glossary</option>}
                </select>
              </label>
            </div>
            <label className="field">
              <span>Means</span>
              <input className="input" value={draft.means} onChange={(e) => setDraft({ ...draft, means: e.target.value })} placeholder="Z go · Y 10-yard out · H flat" />
            </label>
            {draft.id && STARTER_BY_ID.has(draft.id) && (
              <p className="lang-starter-note">
                A starter term, yours to change. Rename it to the word your staff says and Griddy reads your word; its diagram stays with it.
                {(() => {
                  const seed = STARTER_BY_ID.get(draft.id!)!;
                  return seed.term !== draft.term || seed.means !== draft.means || seed.type !== draft.type ? (
                    <button
                      type="button"
                      className="btn btn-quiet btn-sm"
                      onClick={() => setDraft({ ...draft, term: seed.term, means: seed.means, type: seed.type })}
                    >
                      Back to the starter wording (“{seed.term}”)
                    </button>
                  ) : null;
                })()}
              </p>
            )}
            {error && (
              <p className="error-line" role="alert">
                {error}
              </p>
            )}
            <div className="lang-form-acts">
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => (setDraft(null), setError(""))}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary btn-sm">
                Save term
              </button>
            </div>
          </form>
        )}

        <div className="filters">
          <div className="search-box">
            <Icon name="search" size={16} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your terms — Scissors, Flood, Bunch" aria-label="Search terms" />
          </div>
          <div className="tab-row lang-filter" role="group" aria-label="Show">
            {FILTERS.map((f) => (
              <button key={f.id} type="button" className={filter === f.id ? "is-on" : ""} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="card lang-table-wrap">
          <table className="lang-table">
            <caption className="sr-only">Your playbook terms</caption>
            <thead>
              <tr>
                <th scope="col">Term</th>
                <th scope="col">Means</th>
                <th scope="col">Type</th>
                <th scope="col">From</th>
                <th scope="col">Used</th>
                <th scope="col">Scope</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 && (
                <tr>
                  <td colSpan={7} className="lang-empty">
                    No terms match that. Clear the search, or teach a new term.
                  </td>
                </tr>
              )}
              {shown.map((t) => (
                <tr key={t.id}>
                  <th scope="row">
                    <div className="lang-term">
                      <ExampleThumb
                        term={t}
                        example={examples.get(t.id) ?? null}
                        peeking={peek === t.id}
                        onPeek={(on) => setPeek(on ? t.id : null)}
                        onOpen={() => (setPeek(null), setOpen(t.id))}
                      />
                      <span>{t.term}</span>
                    </div>
                  </th>
                  <td>{t.means}</td>
                  <td>
                    <span className="pill pill-type">{TYPE_LABEL[t.type]}</span>
                  </td>
                  <td className="lang-muted">
                    {t.source}
                    {starterOriginal(t) && " · edited"}
                    {t.source !== "Starter glossary" && ` · ${new Date(`${t.added}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`}
                  </td>
                  <td className="mono">{usesOf(t.term, plays)}×</td>
                  <td className="lang-muted">{SCOPE_LABEL[t.scope]}</td>
                  <td className="lang-acts">
                    <button type="button" className="btn btn-quiet btn-sm" onClick={() => edit(t)} aria-label={`Edit ${t.term}`}>
                      Edit
                    </button>
                    <button type="button" className="btn btn-quiet btn-sm" onClick={() => remove(t)} aria-label={`Delete ${t.term}`}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {missing.length > 0 && (
          <div className="lang-restore">
            <span>
              {missing.length} starter {missing.length === 1 ? "term is" : "terms are"} off your list.
            </span>
            <button
              type="button"
              className="btn btn-quiet btn-sm"
              onClick={() => {
                const n = termStore.bringBackStarters();
                toast(`${n} starter ${n === 1 ? "term" : "terms"} back on your list.`);
              }}
            >
              Bring back the starter terms
            </button>
          </div>
        )}
        <p className="lang-note">
          Your terms are used for you and your staff. A term joins the shared glossary only as a suggestion once many coaches use it
          the same way, and it never overrides your own meaning.
        </p>
      </div>
      {opened && (
        <ExampleDialog
          term={opened}
          example={examples.get(opened.id) ?? null}
          onClose={() => setOpen(null)}
          onEdit={() => (setOpen(null), edit(opened))}
        />
      )}
    </Shell>
  );
}

/**
 * The small picture beside a term. Hover or focus shows it large (a peek);
 * a click or tap opens the example dialog, where the coach picks their own.
 */
function ExampleThumb({
  term,
  example,
  peeking,
  onPeek,
  onOpen,
}: {
  term: Term;
  example: TermExample | null;
  peeking: boolean;
  onPeek: (on: boolean) => void;
  onOpen: () => void;
}) {
  if (!example)
    return (
      <button type="button" className="lang-thumb is-empty" onClick={onOpen} aria-label={`Add an example for ${term.term}`}>
        <Icon name="plus" size={14} />
      </button>
    );
  return (
    <span className="lang-thumb-wrap" onMouseEnter={() => onPeek(true)} onMouseLeave={() => onPeek(false)}>
      <button
        type="button"
        className="lang-thumb"
        onClick={onOpen}
        onFocus={() => onPeek(true)}
        onBlur={() => onPeek(false)}
        onKeyDown={(e) => e.key === "Escape" && peeking && (e.stopPropagation(), onPeek(false))}
        aria-label={`Show the ${term.term} example`}
      >
        <PlayThumb scene={example.scene} zoom={{ w: 0.9, h: 0.6 }} decorative lazy />
      </button>
      {peeking && (
        <span className="lang-peek" role="tooltip">
          <PlayThumb scene={example.scene} zoom={{ w: 3.2, h: 2.1 }} label={term.term} />
          <b>{term.term}</b>
          <span>{term.means}</span>
          <small>{example.caption}</small>
        </span>
      )}
    </span>
  );
}

/** A term's example, large, with a play from the Vault to pick as the coach's own. */
function ExampleDialog({ term, example, onClose, onEdit }: { term: Term; example: TermExample | null; onClose: () => void; onEdit: () => void }) {
  const plays = useStore((s) => s.plays);
  const using = useMemo(() => playsUsing(term.term, plays), [term.term, plays]);
  const rest = useMemo(() => plays.filter((p) => !using.includes(p)).sort((a, b) => a.name.localeCompare(b.name)), [plays, using]);
  const toast = useToast();
  const pick = (id: string) => {
    termStore.setExample(term.id, id || null);
    const play = plays.find((p) => p.id === id);
    toast(play ? `${play.name} now shows what “${term.term}” means.` : `“${term.term}” is back to its own example.`);
  };
  return (
    <Modal
      title={term.term}
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="btn btn-quiet btn-sm" onClick={onEdit}>
            <Icon name="pencil" size={15} /> Edit the term
          </button>
          {example?.playId && (
            <Link to={`/build/${example.playId}`} className="btn btn-ghost btn-sm">
              Open in the Designer
            </Link>
          )}
          <button type="button" className="btn btn-primary btn-sm" onClick={onClose}>
            Done
          </button>
        </>
      }
    >
      <div className="lang-example">
        <p className="lang-example-means">{term.means}</p>
        {example ? (
          <figure className="lang-example-fig">
            <PlayThumb scene={example.scene} zoom={{ w: 6, h: 3.6 }} label={`${term.term} example`} />
            <figcaption>{example.caption}</figcaption>
          </figure>
        ) : (
          <p className="lang-example-none">
            No picture yet. Pick a play from your Vault that shows “{term.term}”, and every coach on your staff sees the same thing.
          </p>
        )}
        <label className="field">
          <span>Show it with a play from your Vault</span>
          <select className="select" value={term.exampleId && plays.some((p) => p.id === term.exampleId) ? term.exampleId : ""} onChange={(e) => pick(e.target.value)}>
            <option value="">{STARTER_BY_ID.has(term.id) ? "The starter glossary diagram" : "The first play that uses the word"}</option>
            {using.length > 0 && (
              <optgroup label={`Plays that say “${term.term}”`}>
                {using.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </optgroup>
            )}
            {rest.length > 0 && (
              <optgroup label="Every other play">
                {rest.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </label>
        {plays.length === 0 && <p className="lang-muted">Your Vault is empty. Draw or copy a play first, then pick it here.</p>}
      </div>
    </Modal>
  );
}
