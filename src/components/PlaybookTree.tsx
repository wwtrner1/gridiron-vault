import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "./Icon";
import { store, useStore, type LocalPlaybook } from "../lib/store";
import { treeState, useTreeOpen } from "../lib/treeState";
import { useToast } from "../lib/toast";
import { gatePlaybook } from "../lib/plan";
import { useTier } from "../lib/tier";
import { uid, type StoredPlay } from "../lib/types";

type Props = {
  /** The play open in the Designer, highlighted wherever it is filed. */
  activePlayId?: string | null;
  /** The playbook it was opened from (?book=), so that folder is the one that opens. */
  activeBookId?: string | null;
  /** Opens a link. The Designer passes one that saves unsaved changes first. */
  onOpen?: (href: string) => void;
  /** Called after a link is opened (the phone menu closes itself). */
  onNavigate?: () => void;
  /** An id for the heading, so two trees on one page don't clash. */
  idPrefix?: string;
  /** Hides the "Your playbooks" heading (still read out) where the panel already has one. */
  quietTitle?: boolean;
};

const UNFILED = "unfiled";
const DRAG_TYPE = "application/x-gridironvault-play";

const BADGE: Record<StoredPlay["playType"], { letter: string; name: string }> = {
  pass: { letter: "P", name: "Pass" },
  run: { letter: "R", name: "Run" },
  defense: { letter: "D", name: "Defense" },
  special: { letter: "S", name: "Special teams" },
};

type FolderRow = { kind: "folder"; key: string; book: LocalPlaybook | null; name: string; color: string; plays: StoredPlay[] };
type PlayRow = { kind: "play"; key: string; folder: string; play: StoredPlay };
type Row = FolderRow | PlayRow;

const matches = (p: StoredPlay, q: string) => `${p.name} ${p.formation} ${p.tags.join(" ")}`.toLowerCase().includes(q);

/**
 * The playbook tree: every playbook as a folder with its plays inside, plus
 * Unfiled. Folders open and close (remembered in this browser), a play opens
 * in the Designer, dragging a play onto a folder files it there, and the
 * keyboard works as a tree should (arrows, Home/End, Enter).
 */
export function PlaybookTree({ activePlayId = null, activeBookId = null, onOpen, onNavigate, idPrefix = "pbt", quietTitle = false }: Props) {
  const plays = useStore((s) => s.plays);
  const books = useStore((s) => s.playbooks);
  const open = useTreeOpen();
  const navigate = useNavigate();
  const toast = useToast();
  const tier = useTier();
  const [query, setQuery] = useState("");
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [dropOn, setDropOn] = useState<string | null>(null);
  const treeRef = useRef<HTMLUListElement>(null);

  const q = query.trim().toLowerCase();

  const folders = useMemo<FolderRow[]>(() => {
    const byId = new Map(plays.map((p) => [p.id, p]));
    const filed = new Set(books.flatMap((b) => b.playIds));
    const list: FolderRow[] = books.map((b) => ({
      kind: "folder",
      key: b.id,
      book: b,
      name: b.name,
      color: b.color,
      plays: b.playIds.map((id) => byId.get(id)).filter((p): p is StoredPlay => !!p),
    }));
    const unfiled = plays.filter((p) => !filed.has(p.id)).sort((a, b) => a.name.localeCompare(b.name));
    if (unfiled.length) list.push({ kind: "folder", key: UNFILED, book: null, name: "Unfiled", color: "", plays: unfiled });
    if (!q) return list;
    // While filtering, a folder shows the plays that match, or all of them when its own name matches.
    return list
      .map((f) => (f.name.toLowerCase().includes(q) ? f : { ...f, plays: f.plays.filter((p) => matches(p, q)) }))
      .filter((f) => f.plays.length || f.name.toLowerCase().includes(q));
  }, [plays, books, q]);

  const isOpen = (key: string) => (q ? true : open.has(key));

  // The rows the keyboard walks through, top to bottom, as they show.
  const rows = useMemo<Row[]>(
    () =>
      folders.flatMap((f) => [
        f as Row,
        ...(isOpen(f.key) ? f.plays.map((p): Row => ({ kind: "play", key: `${f.key}/${p.id}`, folder: f.key, play: p })) : []),
      ]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [folders, open, q],
  );

  // Open the folder the active play lives in, so the highlight is always in view.
  useEffect(() => {
    if (!activePlayId) return;
    const home =
      books.find((b) => b.id === activeBookId && b.playIds.includes(activePlayId)) ?? books.find((b) => b.playIds.includes(activePlayId));
    if (home) treeState.set(home.id, true);
    else if (plays.some((p) => p.id === activePlayId)) treeState.set(UNFILED, true);
    // Only when the coach moves to another play, not on every store change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePlayId, activeBookId]);

  const activeKey = (() => {
    if (!activePlayId) return null;
    const own = rows.find((r) => r.kind === "play" && r.play.id === activePlayId && r.folder === activeBookId);
    return (own ?? rows.find((r) => r.kind === "play" && r.play.id === activePlayId))?.key ?? null;
  })();
  const tabKey = rows.some((r) => r.key === focusKey) ? focusKey : (activeKey ?? rows[0]?.key ?? null);

  const focusRow = (key: string) => {
    setFocusKey(key);
    requestAnimationFrame(() => treeRef.current?.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`)?.focus());
  };

  const go = (href: string) => {
    if (onOpen) onOpen(href);
    else navigate(href);
    onNavigate?.();
  };
  const openPlay = (row: PlayRow) => go(`/build/${row.play.id}${row.folder !== UNFILED ? `?book=${row.folder}` : ""}`);

  /** The folder a new play goes in: the one the coach is on in the tree, else the active play's. */
  const targetFolder = () => {
    const row = rows.find((r) => r.key === tabKey);
    const key = row ? (row.kind === "folder" ? row.key : row.folder) : null;
    return books.find((b) => b.id === key) ?? null;
  };
  const newPlay = (book: LocalPlaybook | null) => go(book ? `/build?book=${book.id}` : "/build");

  const createFolder = () => {
    const name = newName.trim();
    setCreating(false);
    setNewName("");
    if (!name) return;
    const gate = gatePlaybook(tier, books.length);
    if (!gate.ok) {
      toast(gate.reason, true);
      return;
    }
    const book: LocalPlaybook = { id: uid("book"), name, description: "", color: "#16C8E8", isPublic: false, playIds: [] };
    store.upsertPlaybook(book);
    treeState.set(book.id, true);
    setQuery("");
    toast(`${name} created. Drag plays onto it, or add a new one with its +.`);
    focusRow(book.id);
  };

  const fileInto = (bookId: string, playId: string) => {
    const book = store.get().playbooks.find((b) => b.id === bookId);
    const play = plays.find((p) => p.id === playId);
    if (!book || !play) return;
    if (book.playIds.includes(playId)) {
      toast(`${play.name} is already in ${book.name}.`);
      return;
    }
    store.upsertPlaybook({ ...book, playIds: [...book.playIds, playId] });
    treeState.set(book.id, true);
    toast(`${play.name} added to ${book.name}. It stays in its other playbooks too.`);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).closest("input, button")) return;
    const at = rows.findIndex((r) => r.key === tabKey);
    const row = rows[at];
    if (!row) return;
    const move = (i: number) => rows[i] && focusRow(rows[i].key);
    switch (e.key) {
      case "ArrowDown":
        move(at + 1);
        break;
      case "ArrowUp":
        move(at - 1);
        break;
      case "Home":
        move(0);
        break;
      case "End":
        move(rows.length - 1);
        break;
      case "ArrowRight":
        if (row.kind !== "folder") return;
        if (!isOpen(row.key)) treeState.set(row.key, true);
        else if (rows[at + 1]?.kind === "play") move(at + 1);
        break;
      case "ArrowLeft":
        if (row.kind === "folder") {
          if (isOpen(row.key) && !q) treeState.set(row.key, false);
        } else focusRow(row.folder);
        break;
      case "Enter":
      case " ":
        if (row.kind === "folder") {
          if (!q) treeState.toggle(row.key);
        } else openPlay(row);
        break;
      case "*": {
        // Opens every folder, as Windows Explorer and VS Code do.
        treeState.setAll(
          folders.map((f) => f.key),
          true,
        );
        break;
      }
      default:
        return;
    }
    e.preventDefault();
  };

  const allOpen = folders.length > 0 && folders.every((f) => open.has(f.key));
  const total = plays.length;

  return (
    <section className="pbt" aria-labelledby={`${idPrefix}-title`}>
      <div className="pbt-head">
        <p id={`${idPrefix}-title`} className={quietTitle ? "sr-only" : undefined}>
          Your playbooks
        </p>
        {quietTitle && <span className="pbt-spacer" />}
        <button
          type="button"
          className="pbt-tool"
          onClick={() => newPlay(targetFolder())}
          title={targetFolder() ? `New play in ${targetFolder()!.name}` : "New play"}
          aria-label={targetFolder() ? `New play in ${targetFolder()!.name}` : "New play"}
        >
          <Icon name="plus" size={14} />
        </button>
        <button
          type="button"
          className="pbt-tool"
          onClick={() => setCreating(true)}
          title="New playbook"
          aria-label="New playbook"
        >
          <Icon name="folder" size={14} />
        </button>
        {folders.length > 0 && !q && (
          <button
            type="button"
            className="pbt-tool"
            onClick={() =>
              treeState.setAll(
                folders.map((f) => f.key),
                !allOpen,
              )
            }
            title={allOpen ? "Close every folder" : "Open every folder"}
            aria-label={allOpen ? "Close every folder" : "Open every folder"}
          >
            <Icon name="chevron" size={14} className={allOpen ? "is-up" : ""} />
          </button>
        )}
      </div>

      {total > 8 && (
        <div className="pbt-find">
          <Icon name="search" size={13} />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setQuery("");
              if (e.key === "ArrowDown" && rows[0]) {
                e.preventDefault();
                focusRow(rows[0].key);
              }
            }}
            placeholder="Find a play"
            aria-label="Find a play in your playbooks"
          />
        </div>
      )}

      {creating && (
        <form
          className="pbt-new"
          onSubmit={(e) => {
            e.preventDefault();
            createFolder();
          }}
        >
          <Icon name="folder" size={14} />
          <input
            autoFocus
            value={newName}
            maxLength={80}
            onChange={(e) => setNewName(e.target.value)}
            onBlur={createFolder}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setNewName("");
                setCreating(false);
              }
            }}
            placeholder="Name it, then Enter"
            aria-label="New playbook name"
          />
        </form>
      )}

      {folders.length === 0 ? (
        <p className="pbt-empty">
          {q ? `No play matches "${query.trim()}".` : total ? "Make a playbook and drag plays onto it." : "Plays you save show up here, filed by playbook."}
        </p>
      ) : (
        <ul className="pbt-tree" role="tree" aria-labelledby={`${idPrefix}-title`} ref={treeRef} onKeyDown={onKeyDown}>
          {folders.map((f) => {
            const expanded = isOpen(f.key);
            const isBook = !!f.book;
            return (
              <li
                key={f.key}
                role="treeitem"
                aria-expanded={expanded}
                aria-label={`${f.name}, ${f.plays.length} play${f.plays.length === 1 ? "" : "s"}`}
                data-key={f.key}
                tabIndex={tabKey === f.key ? 0 : -1}
                onFocus={(e) => e.target === e.currentTarget && setFocusKey(f.key)}
                className="pbt-item"
              >
                <div
                  className={`pbt-row pbt-folder${dropOn === f.key ? " is-drop" : ""}`}
                  onClick={() => {
                    setFocusKey(f.key);
                    if (!q) treeState.toggle(f.key);
                  }}
                  onDragOver={(e) => {
                    if (!isBook || !e.dataTransfer.types.includes(DRAG_TYPE)) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "copy";
                    setDropOn(f.key);
                  }}
                  onDragLeave={() => setDropOn((k) => (k === f.key ? null : k))}
                  onDrop={(e) => {
                    setDropOn(null);
                    const id = e.dataTransfer.getData(DRAG_TYPE);
                    if (isBook && id) {
                      e.preventDefault();
                      fileInto(f.key, id);
                    }
                  }}
                >
                  <Icon name="chevron" size={12} className={`pbt-caret${expanded ? " is-open" : ""}`} />
                  {isBook ? (
                    <span className="pbt-dot" style={{ background: f.color }} aria-hidden="true" />
                  ) : (
                    <Icon name="folder" size={13} className="pbt-unfiled" />
                  )}
                  <span className="pbt-name">{f.name}</span>
                  <b className="pbt-count" aria-hidden="true">
                    {f.plays.length}
                  </b>
                  {f.book && (
                    <button
                      type="button"
                      tabIndex={-1}
                      className="pbt-add"
                      onClick={(e) => {
                        e.stopPropagation();
                        newPlay(f.book);
                      }}
                      title={`New play in ${f.name}`}
                      aria-label={`New play in ${f.name}`}
                    >
                      <Icon name="plus" size={12} />
                    </button>
                  )}
                </div>
                {expanded && (
                  <ul role="group">
                    {f.plays.length === 0 && <li className="pbt-none" role="none">Empty. Drag a play here.</li>}
                    {f.plays.map((p) => {
                      const key = `${f.key}/${p.id}`;
                      const badge = BADGE[p.playType] ?? BADGE.pass;
                      const active = p.id === activePlayId;
                      return (
                        <li
                          key={key}
                          role="treeitem"
                          data-key={key}
                          aria-selected={active}
                          aria-current={key === activeKey ? "page" : undefined}
                          aria-label={`${p.name}, ${badge.name}`}
                          tabIndex={tabKey === key ? 0 : -1}
                          onFocus={() => setFocusKey(key)}
                          className={`pbt-item pbt-row pbt-play${active ? " is-active" : ""}`}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData(DRAG_TYPE, p.id);
                            e.dataTransfer.effectAllowed = "copy";
                          }}
                          onClick={() => openPlay({ kind: "play", key, folder: f.key, play: p })}
                          title={p.formation ? `${p.name} · ${p.formation}` : p.name}
                        >
                          <span className={`pbt-badge pill-${p.playType}`} aria-hidden="true">
                            {badge.letter}
                          </span>
                          <span className="pbt-name">{p.name}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
