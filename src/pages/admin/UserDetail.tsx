import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { PUBLIC_TIERS } from "../../lib/plan";
import { useToast } from "../../lib/toast";

type Detail = {
  profile: { id: string; email: string; displayName: string; plan: string; phone: string | null; phoneVerifiedAt: string | null; createdAt: string | null; lastActiveAt: string | null } | null;
  identity: { email?: string; confirmedAt?: string; createdAt?: string; lastSignInAt?: string; provider?: string } | null;
  plays: { id: string; name: string; playType: string; formation: string; isPublic: boolean; updatedAt: string | null }[];
  playbooks: { id: string; name: string; plays: number; updatedAt: string | null }[];
  sheets: { id: string; name: string; updatedAt: string | null }[];
  trash: { id: string; kind: string; name: string; deletedAt: string | null; restoredAt: string | null }[];
  devices: { label: string; lastSeen: string | null }[];
  usage: { day: string; kind: string; count: number }[];
  history: { id: string; actorEmail: string; action: string; at: string; detail: Record<string, unknown> }[];
  trashDays: number;
};

const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—");
const KIND: Record<string, string> = { play: "Play", playbook: "Playbook", call_sheet: "Call Sheet" };

/** One coach: what they have, what they deleted lately, and the buttons to put it back. Every open and every change is logged. */
export function UserDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const toast = useToast();
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(() => {
    api.admin<Detail>(`users/${id}`).then(setD).catch((e) => setError(e instanceof Error ? e.message : "That coach didn't load."));
  }, [id]);
  useEffect(() => {
    setD(null);
    load();
  }, [load]);

  async function restore(trashId: string, name: string) {
    setBusy(trashId);
    try {
      await api.admin(`trash/${trashId}/restore`, { method: "POST", body: "{}" });
      toast(`Restored “${name}”.`);
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "That didn't restore.", true);
    } finally {
      setBusy("");
    }
  }

  async function exportAll() {
    setBusy("export");
    try {
      const data = await api.admin<unknown>(`users/${id}/export`);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      a.download = `gridironvault-coach-${id.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      toast(e instanceof Error ? e.message : "The export didn't download.", true);
    } finally {
      setBusy("");
    }
  }

  async function changePlan(plan: string) {
    setBusy("plan");
    try {
      await api.admin(`users/${id}/plan`, { method: "POST", body: JSON.stringify({ plan }) });
      toast(`Plan set to ${plan}.`);
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "The plan didn't change.", true);
    } finally {
      setBusy("");
    }
  }

  if (error) return <p className="adm-note adm-bad">{error}</p>;
  if (!d) return <p className="hint">Opening that coach…</p>;
  const p = d.profile;
  const usageDays = [...new Set(d.usage.map((u) => u.day))];

  return (
    <div className="adm">
      <div className="adm-bar">
        <button type="button" className="btn btn-quiet btn-sm" onClick={onBack}>← Back to the list</button>
        <b>{p?.email ?? d.identity?.email ?? id}</b>
        <button type="button" className="btn btn-primary btn-sm" disabled={busy === "export"} onClick={exportAll}>Download all their data (JSON)</button>
      </div>
      <p className="hint">Opening a coach and every change below is written to the audit log.</p>

      <section className="card adm-card">
        <h3>Account</h3>
        <dl className="acct-facts">
          <div><dt>Name</dt><dd>{p?.displayName || "—"}</dd></div>
          <div><dt>Signed up</dt><dd>{when(d.identity?.createdAt ?? p?.createdAt)}</dd></div>
          <div><dt>Email confirmed</dt><dd>{d.identity ? (d.identity.confirmedAt ? when(d.identity.confirmedAt) : "No") : "Not in sign-in provider"}</dd></div>
          <div><dt>Last sign-in</dt><dd>{when(d.identity?.lastSignInAt)}</dd></div>
          <div><dt>Last active</dt><dd>{when(p?.lastActiveAt)}</dd></div>
          <div><dt>Phone</dt><dd>{p?.phone ? `${p.phone}${p.phoneVerifiedAt ? " (verified)" : ""}` : "None"}</dd></div>
          <div><dt>Devices</dt><dd>{d.devices.length ? d.devices.map((v) => v.label || "Device").join(", ") : "None"}</dd></div>
        </dl>
        {p && p.plan !== "master" && (
          <label className="field">
            <span>Plan</span>
            <select value={p.plan} disabled={busy === "plan"} onChange={(e) => changePlan(e.target.value)}>
              {["beta", ...PUBLIC_TIERS.map((t) => t.id)].map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
        )}
      </section>

      <section className="card adm-card">
        <h3>Deleted in the last {d.trashDays} days</h3>
        {d.trash.length === 0 ? <p className="hint">Nothing deleted lately. Plays, playbooks and Call Sheets a coach deletes show up here for {d.trashDays} days.</p> : (
          <table className="adm-table">
            <thead><tr><th>What</th><th>Name</th><th>Deleted</th><th></th></tr></thead>
            <tbody>
              {d.trash.map((t) => (
                <tr key={t.id}>
                  <td>{KIND[t.kind] ?? t.kind}</td><td>{t.name || "Untitled"}</td><td>{when(t.deletedAt)}</td>
                  <td>{t.restoredAt ? <span className="pill pill-green">Restored</span> : <button type="button" className="btn btn-sm" disabled={busy === t.id} onClick={() => restore(t.id, t.name)}>Restore</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <div className="adm-tops">
        <section className="card adm-card">
          <h3>Plays ({d.plays.length})</h3>
          <ol className="adm-top">{d.plays.slice(0, 40).map((x) => <li key={x.id}><span>{x.name}</span><small>{x.playType}</small></li>)}</ol>
          {d.plays.length > 40 && <p className="hint">Showing 40. The JSON download has them all.</p>}
        </section>
        <section className="card adm-card">
          <h3>Playbooks ({d.playbooks.length})</h3>
          <ol className="adm-top">{d.playbooks.map((x) => <li key={x.id}><span>{x.name}</span><b>{x.plays}</b></li>)}</ol>
          <h3>Call Sheets ({d.sheets.length})</h3>
          <ol className="adm-top">{d.sheets.map((x) => <li key={x.id}><span>{x.name}</span></li>)}</ol>
        </section>
        <section className="card adm-card">
          <h3>Usage, last 14 days</h3>
          {usageDays.length === 0 ? <p className="hint">No AI use.</p> : (
            <ol className="adm-top">{usageDays.map((day) => <li key={day}><span>{day}</span><b>{d.usage.filter((u) => u.day === day).map((u) => `${u.kind} ${u.count}`).join(" · ")}</b></li>)}</ol>
          )}
        </section>
      </div>

      <section className="card adm-card">
        <h3>Admin history for this coach</h3>
        {d.history.length === 0 ? <p className="hint">No earlier admin actions.</p> : (
          <ol className="adm-top">{d.history.map((h) => <li key={h.id}><span>{h.action.replace(/_/g, " ")} · {h.actorEmail}</span><small>{when(h.at)}</small></li>)}</ol>
        )}
      </section>
    </div>
  );
}
