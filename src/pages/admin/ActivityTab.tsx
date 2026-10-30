import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import { ACTIVITY_LABELS, type ActivityKind } from "../../lib/activity";

export type ActivityRow = {
  id: string;
  ownerId?: string;
  email?: string | null;
  kind: string;
  browser: string;
  deviceHash: string;
  ipPrefix: string;
  place: string;
  detail: Record<string, string | number | boolean>;
  at: string;
};
type Total = { ownerId: string; email: string | null; kind: string; n: number };

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
const label = (k: string) => ACTIVITY_LABELS[k as ActivityKind] ?? k;
const CAPTURE = new Set(["screenshot_key", "print", "copy", "export"]);

/** What happened, in words: "Print Screen on /build", "wristband · 12 plays". */
function what(r: ActivityRow) {
  const d = r.detail ?? {};
  const bits = [d.how, d.kind, typeof d.count === "number" ? `${d.count} plays` : "", d.page ? `on ${d.page}` : ""].filter(Boolean);
  return bits.join(" · ");
}

/** One table for a coach's own activity and for everyone's (`showWho`). */
export function ActivityTable({ rows, showWho, onOpen }: { rows: ActivityRow[]; showWho?: boolean; onOpen?: (id: string) => void }) {
  if (!rows.length) return <p className="hint">Nothing recorded yet. Activity starts the first time they use the app after this update.</p>;
  return (
    <div className="adm-scroll">
      <table className="adm-table">
        <thead>
          <tr>
            <th>When</th>
            {showWho && <th>Coach</th>}
            <th>What</th>
            <th>Detail</th>
            <th>Browser</th>
            <th>Device</th>
            <th>IP (last part hidden)</th>
            <th>Place</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{when(r.at)}</td>
              {showWho && (
                <td>
                  {onOpen && r.ownerId ? (
                    <button type="button" className="adm-link" onClick={() => onOpen(r.ownerId!)}>
                      {r.email || r.ownerId}
                    </button>
                  ) : (
                    r.email || r.ownerId
                  )}
                </td>
              )}
              <td>
                <span className={`pill${CAPTURE.has(r.kind) ? " pill-amber" : ""}`}>{label(r.kind)}</span>
              </td>
              <td>{what(r)}</td>
              <td>{r.browser}</td>
              <td><code>{r.deviceHash ? r.deviceHash.slice(0, 6) : "—"}</code></td>
              <td><code>{r.ipPrefix || "—"}</code></td>
              <td>{r.place || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Every coach's sign-ins and capture signals, the coaches who capture most, and a lookup for a leaked PDF's trace code. */
export function ActivityTab({ onOpen }: { onOpen: (id: string) => void }) {
  const [kind, setKind] = useState<"all" | "access" | "capture">("all");
  const [days, setDays] = useState(7);
  const [data, setData] = useState<{ rows: ActivityRow[]; totals: Total[] } | null>(null);
  const [error, setError] = useState("");
  const [code, setCode] = useState("");
  const [found, setFound] = useState<string>("");

  useEffect(() => {
    setData(null);
    api
      .admin<{ rows: ActivityRow[]; totals: Total[] }>(`activity?kind=${kind}&days=${days}`)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Activity didn't load."));
  }, [kind, days]);

  const top = useMemo(() => {
    const by = new Map<string, { id: string; email: string; n: number; parts: Record<string, number> }>();
    for (const t of data?.totals ?? []) {
      const row = by.get(t.ownerId) ?? { id: t.ownerId, email: t.email ?? t.ownerId, n: 0, parts: {} };
      row.n += t.n;
      row.parts[t.kind] = t.n;
      by.set(t.ownerId, row);
    }
    return [...by.values()].sort((a, b) => b.n - a.n).slice(0, 10);
  }, [data]);

  async function lookup(e: React.FormEvent) {
    e.preventDefault();
    try {
      const r = await api.admin<{ account: { id: string; email: string; name: string } | null }>("trace", { method: "POST", body: JSON.stringify({ code }) });
      setFound(r.account ? `${r.account.email}${r.account.name ? ` (${r.account.name})` : ""}|${r.account.id}` : "none");
    } catch (err) {
      setFound(`error:${err instanceof Error ? err.message : "The lookup didn't run."}`);
    }
  }

  if (error) return <p className="adm-note adm-bad">{error}</p>;
  const [foundText, foundId] = found.split("|");

  return (
    <div className="adm">
      <p className="adm-note">
        What a browser can and can't see: a web page can't detect a screenshot taken by the operating system. Print Screen on Windows
        usually shows up, the Snipping Tool shortcut and Mac's Cmd+Shift+3/4/5 only sometimes, and phone screenshots, screen recorders,
        the Snipping Tool opened from the Start menu or a camera never do. Prints, copies and exports are reliable. Read every row as a
        hint, not proof.
      </p>

      <div className="adm-bar">
        <div className="chip-row" role="group" aria-label="Show">
          {(
            [
              ["all", "Everything"],
              ["access", "Sign-ins"],
              ["capture", "Screenshots, prints, copies, exports"],
            ] as const
          ).map(([k, l]) => (
            <button key={k} type="button" className={`chip${kind === k ? " is-on" : ""}`} aria-pressed={kind === k} onClick={() => setKind(k)}>
              {l}
            </button>
          ))}
        </div>
        <label className="field">
          <span className="sr-only">Days</span>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {[1, 7, 30, 90].map((n) => (
              <option key={n} value={n}>
                Last {n === 1 ? "day" : `${n} days`}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="adm-tops">
        <section className="card adm-card">
          <h3>Most captures, last {days === 1 ? "day" : `${days} days`}</h3>
          {top.length === 0 ? (
            <p className="hint">No prints, screenshot keys, copies or exports.</p>
          ) : (
            <ol className="adm-top">
              {top.map((t) => (
                <li key={t.id}>
                  <button type="button" className="adm-link" onClick={() => onOpen(t.id)}>
                    {t.email}
                  </button>
                  <small>{Object.entries(t.parts).map(([k, n]) => `${label(k)} ${n}`).join(" · ")}</small>
                  <b>{t.n}</b>
                </li>
              ))}
            </ol>
          )}
        </section>
        <section className="card adm-card">
          <h3>Find a PDF's owner</h3>
          <p className="hint">
            Every PDF a signed-in coach downloads carries a code like GV-1A2B3C4D5E in its Keywords (File → Properties in Acrobat or
            Chrome's PDF viewer). Paste it here to see whose account made it. Screenshots and photos of a page don't carry it.
          </p>
          <form className="adm-bar" onSubmit={lookup}>
            <label className="adm-search">
              <span className="sr-only">Trace code</span>
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="GV-…" />
            </label>
            <button type="submit" className="btn btn-primary btn-sm" disabled={!code.trim()}>
              Look up
            </button>
          </form>
          {found === "none" && <p className="hint">No current account has that code.</p>}
          {found.startsWith("error:") && <p className="adm-note adm-bad">{found.slice(6)}</p>}
          {foundId && (
            <p>
              <button type="button" className="adm-link" onClick={() => onOpen(foundId)}>
                {foundText}
              </button>
            </p>
          )}
        </section>
      </div>

      {data ? <ActivityTable rows={data.rows} showWho onOpen={onOpen} /> : <p className="hint">Loading activity…</p>}
    </div>
  );
}
