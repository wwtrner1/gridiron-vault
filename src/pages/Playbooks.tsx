import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Shell } from "../components/Shell";
import { Icon } from "../components/Icon";
import { Modal } from "../components/Modal";
import { PlayThumb } from "../components/PlayThumb";
import { Tooltip } from "../components/Tooltip";
import { ExportDialog } from "../components/ExportDialog";
import { PlayerLink } from "../components/PlayerLink";
import { WorkTabs } from "../components/WorkTabs";
import { store, useStore, type LocalPlaybook } from "../lib/store";
import { useTier } from "../lib/tier";
import { useToast } from "../lib/toast";
import { uid } from "../lib/types";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { rememberWork } from "../lib/workTabs";

const COLORS = [
  { hex: "#16C8E8", name: "Cyan" },
  { hex: "#2E9E6B", name: "Green" },
  { hex: "#F2A63B", name: "Amber" },
  { hex: "#D24B3E", name: "Red" },
  { hex: "#7A6BD2", name: "Purple" },
  { hex: "#2E7DBE", name: "Blue" },
  { hex: "#0B1524", name: "Navy" },
];

type Draft = { id: string | null; name: string; description: string; color: string; isPublic: boolean };

const blankDraft = (): Draft => ({ id: null, name: "", description: "", color: COLORS[0].hex, isPublic: false });

export function Playbooks() {
  const { account } = useAuth();
  const tier = useTier();
  const toast = useToast();
  const navigate = useNavigate();
  const plays = useStore((s) => s.plays);
  const books = useStore((s) => s.playbooks);

  const [draft, setDraft] = useState<Draft | null>(null);
  // The Playbook work tab (?book=) opens straight onto the playbook the coach is working in.
  const [params] = useSearchParams();
  const [openBook, setOpenBookState] = useState<string | null>(() => {
    const asked = params.get("book");
    return asked && books.some((b) => b.id === asked) ? asked : null;
  });
  const setOpenBook = (id: string | null) => {
    setOpenBookState(id);
    if (id) rememberWork({ bookId: id });
  };
  const [adding, setAdding] = useState<string | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);
  const [linking, setLinking] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const playsById = useMemo(() => new Map(plays.map((p) => [p.id, p])), [plays]);
  const current = books.find((b) => b.id === openBook) ?? null;
  const exportBook = books.find((b) => b.id === exporting) ?? null;
  const linkBook = books.find((b) => b.id === linking) ?? null;

  const unfiled = useMemo(() => {
    const filed = new Set(books.flatMap((b) => b.playIds));
    return plays.filter((p) => !filed.has(p.id));
  }, [plays, books]);

  const save = async () => {
    if (!draft) return;
    const name = draft.name.trim();
    if (!name) {
      toast("Give the playbook a name first.");
      return;
    }
    const existing = draft.id ? books.find((b) => b.id === draft.id) : null;
    const book: LocalPlaybook = {
      id: draft.id ?? uid("book"),
      name,
      description: draft.description.trim(),
      color: draft.color,
      isPublic: draft.isPublic,
      playIds: existing?.playIds ?? [],
    };
    store.upsertPlaybook(book);
    setDraft(null);
    toast(existing ? `${name} updated.` : `${name} created. Add plays to it next.`);
  };

  const setPlays = (book: LocalPlaybook, playIds: string[]) =>
    store.upsertPlaybook({ ...book, playIds });

  const remove = (book: LocalPlaybook) => {
    store.removePlaybook(book.id);
    if (openBook === book.id) setOpenBook(null);
    toast(`${book.name} deleted. The plays inside it are still in your Vault.`);
  };

  const addable = useMemo(() => {
    const book = books.find((b) => b.id === adding);
    if (!book) return [];
    const q = query.trim().toLowerCase();
    return plays.filter((p) => {
      if (book.playIds.includes(p.id)) return false;
      if (!q) return true;
      return `${p.name} ${p.formation} ${p.tags.join(" ")}`.toLowerCase().includes(q);
    });
  }, [adding, books, plays, query]);

  return (
    <Shell
      title="Playbooks"
      tabs={<WorkTabs current="playbook" />}
      actions={
        <>
          <Link to="/vault" className="btn btn-quiet btn-sm">
            <Icon name="board" size={15} /> The Vault
          </Link>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setDraft(blankDraft())}>
            <Icon name="plus" size={15} /> New playbook
          </button>
        </>
      }
    >
      <div className="page-head">
        <div>
          <h2>Playbooks</h2>
          <p>
            Group plays into books the way you actually install them — by week, by level, by situation.
            A play can live in more than one book, and deleting a book never deletes the plays.
          </p>
        </div>
        <div className="head-stats">
          <div className="stat">
            <b>{books.length}</b>
            <span>Playbooks</span>
          </div>
          <div className="stat">
            <b>{plays.length}</b>
            <span>Plays</span>
          </div>
          <div className="stat">
            <b>{unfiled.length}</b>
            <span>Unfiled</span>
          </div>
        </div>
      </div>

      {books.length === 0 ? (
        <div className="empty">
          <Icon name="folder" size={30} />
          <h3>No playbooks yet</h3>
          <p>
            Start with one called <b>Week 1 install</b> and drop your first four plays in it. Most coaches
            end up with three or four books a season.
          </p>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setDraft(blankDraft())}>
            Create your first playbook
          </button>
        </div>
      ) : (
        <div className="book-grid">
          {books.map((book) => (
            <article className="book" key={book.id} style={{ ["--book" as string]: book.color }}>
              <div className="book-spine" />
              <div className="book-body">
                <div className="book-head">
                  <h3>{book.name}</h3>
                  <span className="pill">{book.playIds.length} plays</span>
                </div>
                <p>{book.description || "No description yet."}</p>
                <div className="book-strip">
                  {book.playIds.slice(0, 4).map((id) => {
                    const play = playsById.get(id);
                    return play ? (
                      <span className="book-chip" key={id}>
                        <PlayThumb scene={play.scene} label={play.name} />
                      </span>
                    ) : null;
                  })}
                  {book.playIds.length === 0 && <span className="book-empty">Empty — add plays to it.</span>}
                </div>
                <div className="book-actions">
                  <button
                    type="button"
                    className="btn btn-quiet btn-sm"
                    onClick={() => setOpenBook(book.id)}
                    aria-label={`Open ${book.name}`}
                  >
                    <Icon name="eye" size={14} /> Open
                  </button>
                  <button
                    type="button"
                    className="btn btn-quiet btn-sm"
                    onClick={() => {
                      setAdding(book.id);
                      setQuery("");
                    }}
                    aria-label={`Add plays to ${book.name}`}
                  >
                    <Icon name="plus" size={14} /> Add plays
                  </button>
                  <Link to={`/assignments?book=${book.id}`} className="btn btn-quiet btn-sm" aria-label={`Assignments in ${book.name}`}>
                    <Icon name="user" size={14} /> Assignments
                  </Link>
                  <Tooltip title="Export the whole book" hint="Prints every play in this book as one PDF packet or wristband run.">
                    <button
                      type="button"
                      className="btn btn-quiet btn-sm"
                      disabled={book.playIds.length === 0}
                      onClick={() => setExporting(book.id)}
                      aria-label={`Export or print ${book.name}`}
                    >
                      <Icon name="print" size={14} /> Print
                    </button>
                  </Tooltip>
                  <Tooltip title="Player link" hint="One link and QR code that opens this book on your players' phones, with their job on every play and the Griddy Quiz.">
                    <button
                      type="button"
                      className="btn btn-quiet btn-sm"
                      disabled={book.playIds.length === 0}
                      onClick={() => setLinking(book.id)}
                      aria-label={`Player link for ${book.name}`}
                    >
                      <Icon name="link" size={14} /> Players
                    </button>
                  </Tooltip>
                  <button
                    type="button"
                    className="btn btn-quiet btn-sm"
                    onClick={() =>
                      setDraft({
                        id: book.id,
                        name: book.name,
                        description: book.description,
                        color: book.color,
                        isPublic: book.isPublic,
                      })
                    }
                    aria-label={`Rename ${book.name}`}
                  >
                    <Icon name="pencil" size={14} /> Rename
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={() => remove(book)}
                    aria-label={`Delete ${book.name}`}
                  >
                    <Icon name="trash" size={14} /> Delete
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {unfiled.length > 0 && (
        <section className="unfiled">
          <h3>
            Not in a playbook yet <span className="pill">{unfiled.length}</span>
          </h3>
          <div className="unfiled-row">
            {unfiled.slice(0, 12).map((p) => (
              <button
                type="button"
                className="unfiled-card"
                key={p.id}
                onClick={() => navigate(`/build/${p.id}`)}
              >
                <PlayThumb scene={p.scene} label={p.name} />
                <span>{p.name}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {draft && (
        <Modal
          title={draft.id ? "Rename playbook" : "New playbook"}
          onClose={() => setDraft(null)}
          footer={
            <>
              <button type="button" className="btn btn-quiet" onClick={() => setDraft(null)}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={save}>
                {draft.id ? "Save changes" : "Create playbook"}
              </button>
            </>
          }
        >
          <label className="field">
            <span>Playbook name</span>
            <input
              className="input"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="Week 1 install"
              autoFocus
            />
            <small className="hint">Name it after when you use it, not what is in it.</small>
          </label>
          <label className="field">
            <span>Description</span>
            <textarea
              className="textarea"
              rows={3}
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              placeholder="Base pass game plus two run answers. Install Tuesday."
            />
          </label>
          <div className="field">
            <span id="spine-colour">Spine colour</span>
            <div className="light-swatches" role="radiogroup" aria-labelledby="spine-colour">
              {COLORS.map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  role="radio"
                  aria-checked={draft.color === c.hex}
                  className={`swatch${draft.color === c.hex ? " is-on" : ""}`}
                  style={{ background: c.hex }}
                  onClick={() => setDraft({ ...draft, color: c.hex })}
                  aria-label={c.name}
                />
              ))}
            </div>
          </div>
          <label className="switch">
            <input
              type="checkbox"
              checked={draft.isPublic}
              onChange={(e) => setDraft({ ...draft, isPublic: e.target.checked })}
              disabled={!tier.share}
            />
            <span>
              Share this book
              <small>
                {tier.share
                  ? "Other coaches can find it and copy plays out of it."
                  : "Sharing unlocks on Head Coach and above."}
              </small>
            </span>
          </label>
        </Modal>
      )}

      {current && (
        <Modal
          title={current.name}
          onClose={() => setOpenBook(null)}
          wide
          footer={
            <>
              <button type="button" className="btn btn-quiet" onClick={() => setOpenBook(null)}>
                Close
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={current.playIds.length === 0}
                onClick={() => {
                  setExporting(current.id);
                  setOpenBook(null);
                }}
              >
                Export this book
              </button>
            </>
          }
        >
          {current.playIds.length === 0 ? (
            <div className="empty empty-sm">
              <Icon name="folder" size={26} />
              <h3>This book is empty</h3>
              <p>Add plays from your Vault and they show up here in install order.</p>
            </div>
          ) : (
            <ol className="book-list">
              {current.playIds.map((id, i) => {
                const play = playsById.get(id);
                if (!play) return null;
                return (
                  <li key={id}>
                    <b>{String(i + 1).padStart(2, "0")}</b>
                    <span className="book-list-thumb">
                      <PlayThumb scene={play.scene} label={play.name} />
                    </span>
                    <div>
                      <h3>{play.name}</h3>
                      <p>
                        {play.formation} · {play.playType}
                      </p>
                    </div>
                    <div className="book-list-actions">
                      <Tooltip title="Move up" hint="Reorders the install sheet and the printed packet." side="top">
                        <button
                          type="button"
                          className="btn btn-quiet btn-sm"
                          disabled={i === 0}
                          onClick={() => {
                            const next = [...current.playIds];
                            [next[i - 1], next[i]] = [next[i], next[i - 1]];
                            setPlays(current, next);
                          }}
                          aria-label={`Move ${play.name} up`}
                        >
                          ↑
                        </button>
                      </Tooltip>
                      <Tooltip title="Move down" hint="Reorders the install sheet and the printed packet." side="top">
                        <button
                          type="button"
                          className="btn btn-quiet btn-sm"
                          disabled={i === current.playIds.length - 1}
                          onClick={() => {
                            const next = [...current.playIds];
                            [next[i + 1], next[i]] = [next[i], next[i + 1]];
                            setPlays(current, next);
                          }}
                          aria-label={`Move ${play.name} down`}
                        >
                          ↓
                        </button>
                      </Tooltip>
                      <button
                        type="button"
                        className="btn btn-quiet btn-sm"
                        onClick={() => navigate(`/build/${play.id}?book=${current.id}`)}
                        aria-label={`Edit ${play.name}`}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn btn-quiet btn-sm"
                        onClick={() => setPlays(current, current.playIds.filter((p) => p !== id))}
                        aria-label={`Remove ${play.name} from this book`}
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </Modal>
      )}

      {adding && (
        <Modal
          title="Add plays to this book"
          onClose={() => setAdding(null)}
          wide
          footer={
            <button type="button" className="btn btn-primary" onClick={() => setAdding(null)}>
              Done
            </button>
          }
        >
          <div className="search-box">
            <Icon name="search" size={15} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search your Vault"
              aria-label="Search your plays"
              autoFocus
            />
          </div>
          {addable.length === 0 ? (
            <div className="empty empty-sm">
              <Icon name="check" size={26} />
              <h3>Nothing left to add</h3>
              <p>Every matching play is already in this book. Draw a new one or clear the search.</p>
            </div>
          ) : (
            <div className="add-grid">
              {addable.map((p) => {
                const book = books.find((b) => b.id === adding)!;
                return (
                  <button
                    type="button"
                    className="add-card"
                    key={p.id}
                    onClick={() => {
                      setPlays(book, [...book.playIds, p.id]);
                      toast(`${p.name} added to ${book.name}.`);
                    }}
                    aria-label={`Add ${p.name} to ${book.name}`}
                  >
                    <PlayThumb scene={p.scene} label={p.name} />
                    <b>{p.name}</b>
                    <small>{p.formation}</small>
                  </button>
                );
              })}
            </div>
          )}
        </Modal>
      )}

      {linkBook && (
        <PlayerLink
          book={linkBook}
          plays={linkBook.playIds.map((id) => playsById.get(id)).filter((p): p is NonNullable<typeof p> => Boolean(p))}
          tier={tier}
          signedIn={!!account}
          onUpgrade={() => navigate("/pricing")}
          onClose={() => setLinking(null)}
        />
      )}

      {exportBook && (
        <ExportDialog
          plays={exportBook.playIds.map((id) => playsById.get(id)).filter((p): p is NonNullable<typeof p> => Boolean(p))}
          tier={tier}
          onClose={() => setExporting(null)}
          onUpgrade={() => navigate("/pricing")}
          onDone={(kind) => toast(`${exportBook.name} exported as ${kind.toUpperCase()}.`)}
        />
      )}
    </Shell>
  );
}
