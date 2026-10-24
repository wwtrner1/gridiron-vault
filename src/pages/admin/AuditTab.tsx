import { useEffect, useState } from "react";
import { api } from "../../lib/api";

type Entry = { id: string; actorEmail: string; action: string; targetId: string; detail: Record<string, unknown>; at: string };

/** Every owner action, newest first. Append-only: nothing here can be edited from the app. */
export function AuditTab() {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api.admin<{ entries: Entry[] }>("audit").then((r) => setEntries(r.entries)).catch((e) => setError(e instanceof Error ? e.message : "The log didn't load."));
  }, []);
  if (error) return <p className="adm-note adm-bad">{error}</p>;
  if (!entries) return <p className="hint">Loading the audit log…</p>;
  return (
    <div className="adm-scroll">
      <table className="adm-table">
        <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Target</th><th>Detail</th></tr></thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id}>
              <td>{new Date(e.at).toLocaleString()}</td>
              <td>{e.actorEmail}</td>
              <td>{e.action.replace(/_/g, " ")}</td>
              <td><code>{e.targetId || "—"}</code></td>
              <td><code>{Object.keys(e.detail).length ? JSON.stringify(e.detail) : ""}</code></td>
            </tr>
          ))}
          {entries.length === 0 && <tr><td colSpan={5}>No admin actions yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
