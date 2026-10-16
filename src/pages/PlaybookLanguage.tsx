import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Shell } from "../components/Shell";
import { Icon } from "../components/Icon";
import { useStore } from "../lib/store";
import {
  SCOPE_LABEL,
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
          <form className="card lang-form" onSubmit={(e) => (e.preventDefault(), save())} aria-label={draft.id ? `Edit ${draft.term}` : "New term"}>
            <h3>{draft.id ? `Edit “${draft.term}”` : "Teach a new term"}</h3>
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
                  <th scope="row">{t.term}</th>
                  <td>{t.means}</td>
                  <td>
                    <span className="pill pill-type">{TYPE_LABEL[t.type]}</span>
                  </td>
                  <td className="lang-muted">
                    {t.source}
                    {t.source !== "Starter glossary" && ` · ${new Date(`${t.added}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`}
                  </td>
                  <td className="mono">{usesOf(t.term, plays)}×</td>
                  <td className="lang-muted">{SCOPE_LABEL[t.scope]}</td>
                  <td className="lang-acts">
                    <button type="button" className="btn btn-quiet btn-sm" onClick={() => edit(t)} aria-label={`Edit ${t.term}`}>
                      Edit
                    </button>
                    <button type="button" className="btn btn-quiet btn-sm" onClick={() => termStore.remove(t.id)} aria-label={`Delete ${t.term}`}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="lang-note">
          Your terms are used for you and your staff. A term joins the shared glossary only as a suggestion once many coaches use it
          the same way, and it never overrides your own meaning.
        </p>
      </div>
    </Shell>
  );
}
