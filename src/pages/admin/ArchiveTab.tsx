import { useCallback, useEffect, useState } from "react";
import { Confirm } from "../../components/Confirm";
import { PlayThumb } from "../../components/PlayThumb";
import { api } from "../../lib/api";
import type { Scene } from "../../lib/types";

type Row = {
  playId: string;
  ownerId: string;
  ownerName: string;
  ownerEmail: string;
  name: string;
  playType: string;
  source: string;
  scene: Scene;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
type Page = { plays: Row[]; total: number; page: number; pageSize: number; bySource: Record<string, number> };
type Purge = { scope: "play" | "coach" | "older" | "deleted" | "all"; playId?: string; ownerId?: string; label: string };

const SOURCES = [
  { id: "", label: "All" },
  { id: "created", label: "Created" },
  { id: "scanned", label: "Scanned" },
  { id: "imported", label: "Imported" },
  { id: "copied", label: "Copied" },
];

/**
 * Every play coaches have put on their accounts, shared or not, kept when they
 * delete it (netlify/admin/archive.ts). Viewing a coach's plays and every
 * purge go in the audit log. Plays kept only in a browser never reach it.
 */
export function ArchiveTab({ onOpen }: { onOpen: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [source, setSource] = useState("");
  const [owner, setOwner] = useState<{ id: string; label: string } | null>(null);
  const [deleted, setDeleted] = useState(false);
  const [page, setPage] = useState(0);
  const [data, setData] = useState<Page | null>(null);
  const [error, setError] = useState("");
  const [purge, setPurge] = useState<Purge | null>(null);
  const [days, setDays] = useState("180");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");

  const load = useCallback(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    if (source) p.set("source", source);
    if (owner) p.set("owner", owner.id);
    if (deleted) p.set("deleted", "1");
    if (page) p.set("page", String(page));
    setError("");
    api
      .admin<Page>(`archive?${p}`)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "The archive didn't load."));
  }, [q, source, owner, deleted, page]);

  useEffect(() => {
    const t = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  async function run() {
    if (!purge) return;
    setBusy(true);
    try {
      const body: Record<string, unknown> = { scope: purge.scope };
      if (purge.playId) body.playId = purge.playId;
      if (purge.ownerId) body.ownerId = purge.ownerId;
      if (purge.scope === "older") body.days = Number(days);
      if (purge.scope === "all") body.confirm = typed;
      const r = await api.admin<{ purged: number }>("archive/purge", { method: "POST", body: JSON.stringify(body) });
      setDone(`${r.purged} archived ${r.purged === 1 ? "play" : "plays"} purged. Coaches' own plays are untouched.`);
      setPurge(null);
      setTyped("");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That purge didn't go through.");
      setPurge(null);
    } finally {
      setBusy(false);
    }
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  return (
    <div className="adm-arch">
      <p className="hint" style={{ margin: 0 }}>
        A copy of every play coaches create, scan, import or copy to their accounts, shared or not. It stays here when a coach deletes the
        play and goes when they delete their account. Purging removes only these copies, never a coach's own plays.
      </p>
      <div className="adm-bar">
        <input className="input adm-search" type="search" aria-label="Search the archive" placeholder="Play name, coach or email" value={q} onChange={(e) => (setQ(e.target.value), setPage(0))} />
        <div className="chip-row" role="group" aria-label="Where the play came from">
          {SOURCES.map((s) => (
            <button key={s.id} type="button" className={`chip${source === s.id ? " is-on" : ""}`} aria-pressed={source === s.id} onClick={() => (setSource(s.id), setPage(0))}>
              {s.label}
              {s.id && data?.bySource[s.id] ? ` · ${data.bySource[s.id]}` : ""}
            </button>
          ))}
        </div>
        <label className="adm-check">
          <input type="checkbox" checked={deleted} onChange={(e) => (setDeleted(e.target.checked), setPage(0))} /> Deleted by the coach
        </label>
      </div>
      <div className="adm-bar">
        {owner && (
          <>
            <span className="pill pill-cyan">Coach: {owner.label}</span>
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => setOwner(null)}>
              All coaches
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPurge({ scope: "coach", ownerId: owner.id, label: `every archived play from ${owner.label}` })}>
              Purge this coach's copies
            </button>
          </>
        )}
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPurge({ scope: "deleted", label: "every play coaches have already deleted" })}>
          Purge plays coaches deleted
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPurge({ scope: "older", label: "plays not changed in" })}>
          Purge older plays…
        </button>
        <button type="button" className="btn btn-danger btn-sm" onClick={() => setPurge({ scope: "all", label: "the whole archive" })}>
          Empty the archive…
        </button>
      </div>

      {done && (
        <p className="adm-note" role="status">
          {done}
        </p>
      )}
      {error && <p className="adm-note adm-bad">{error}</p>}
      {!data && !error && <p className="hint">Loading the archive…</p>}
      {data && (
        <>
          <p className="hint" role="status" style={{ margin: 0 }}>
            {data.total} {data.total === 1 ? "play" : "plays"}
            {pages > 1 && ` · page ${data.page + 1} of ${pages}`}
          </p>
          <div className="adm-arch-grid">
            {data.plays.map((p) => (
              <article key={p.playId} className="card adm-arch-card">
                <div className="adm-arch-art">
                  <PlayThumb scene={p.scene} label={p.name} lazy />
                </div>
                <h3>{p.name || "Untitled play"}</h3>
                <p className="hint">
                  {p.source} · {p.playType} · {new Date(p.updatedAt).toLocaleDateString()}
                  {p.deletedAt && <span className="pill pill-amber">Deleted by coach</span>}
                </p>
                <p className="hint">
                  <button type="button" className="adm-link" onClick={() => (setOwner({ id: p.ownerId, label: p.ownerEmail || p.ownerName || p.ownerId }), setPage(0))}>
                    {p.ownerEmail || p.ownerName || "A coach"}
                  </button>
                </p>
                <div className="adm-bar">
                  <button type="button" className="btn btn-quiet btn-sm" onClick={() => onOpen(p.ownerId)}>
                    Open coach
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPurge({ scope: "play", playId: p.playId, label: `"${p.name || "Untitled play"}"` })}>
                    Purge
                  </button>
                </div>
              </article>
            ))}
            {data.plays.length === 0 && <p className="hint">Nothing in the archive matches.</p>}
          </div>
          {pages > 1 && (
            <div className="adm-bar">
              <button type="button" className="btn btn-ghost btn-sm" disabled={page === 0} onClick={() => setPage((n) => n - 1)}>
                Newer
              </button>
              <button type="button" className="btn btn-ghost btn-sm" disabled={page + 1 >= pages} onClick={() => setPage((n) => n + 1)}>
                Older
              </button>
            </div>
          )}
        </>
      )}

      {purge && (
        <Confirm
          title="Purge from the archive?"
          action="Purge"
          danger
          busy={busy}
          onConfirm={run}
          onClose={() => (setPurge(null), setTyped(""))}
        >
          {purge.scope === "older" ? (
            <label className="up-field">
              <span>Purge archived plays not changed in this many days</span>
              <input className="input" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, "").slice(0, 4))} />
            </label>
          ) : (
            <p>This purges {purge.label} from the archive. It can't be undone. Coaches keep their own plays.</p>
          )}
          {purge.scope === "all" && (
            <label className="up-field">
              <span>Type PURGE to empty the whole archive</span>
              <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} />
            </label>
          )}
        </Confirm>
      )}
    </div>
  );
}
