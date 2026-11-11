import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { PUBLIC_TIERS } from "../../lib/plan";
import { useToast } from "../../lib/toast";
import { Modal } from "../../components/Modal";
import { ActivityTable, type ActivityRow } from "./ActivityTab";

type Detail = {
  profile: { id: string; email: string; displayName: string; plan: string; phone: string | null; phoneVerifiedAt: string | null; createdAt: string | null; lastActiveAt: string | null; suspendedAt: string | null; suspendedReason: string; phoneSkipAt?: string | null; stripeSubscriptionId: string | null } | null;
  identity: { email?: string; confirmedAt?: string; createdAt?: string; lastSignInAt?: string; provider?: string } | null;
  plays: { id: string; name: string; playType: string; formation: string; isPublic: boolean; updatedAt: string | null }[];
  playbooks: { id: string; name: string; plays: number; updatedAt: string | null }[];
  sheets: { id: string; name: string; updatedAt: string | null }[];
  trash: { id: string; kind: string; name: string; deletedAt: string | null; restoredAt: string | null }[];
  devices: { label: string; lastSeen: string | null }[];
  usage: { day: string; kind: string; count: number }[];
  history: { id: string; actorEmail: string; action: string; at: string; detail: Record<string, unknown> }[];
  activity: ActivityRow[];
  trashDays: number;
};

const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—");
const KIND: Record<string, string> = { play: "Play", playbook: "Playbook", call_sheet: "Call Sheet" };

/** One coach: what they have, what they deleted lately, and the buttons to put it back. Every open and every change is logged. */
export function UserDetail({ id, onBack, onGone }: { id: string; onBack: () => void; onGone?: () => void }) {
  const toast = useToast();
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [asking, setAsking] = useState<"" | "suspend" | "delete">("");
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");
  const [stopBilling, setStopBilling] = useState(true);

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

  const BILLING: Record<string, string> = { none: "", cancelled: " Their subscription is cancelled.", kept: "", off: " Billing is off on this site, so cancel their plan in Stripe's Dashboard.", failed: "" };

  async function setAccess(on: boolean) {
    setBusy("access");
    try {
      const r = await api.admin<{ billing: string }>(`users/${id}/${on ? "suspend" : "unsuspend"}`, { method: "POST", body: JSON.stringify({ reason, cancelBilling: on && stopBilling }) });
      toast((on ? "Account switched off." : "Account switched back on.") + (BILLING[r.billing] ?? ""));
      setAsking("");
      setReason("");
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "That didn't change.", true);
    } finally {
      setBusy("");
    }
  }

  async function setPhoneSkip(on: boolean) {
    setBusy("phone");
    try {
      await api.admin(`users/${id}/phone-skip`, { method: "POST", body: JSON.stringify({ on }) });
      toast(on ? "This coach can now sign in with no phone code." : "This coach needs a phone code again.");
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "That didn't change.", true);
    } finally {
      setBusy("");
    }
  }

  async function remove() {
    setBusy("delete");
    try {
      const r = await api.admin<{ billing: string }>(`users/${id}/delete`, { method: "POST", body: JSON.stringify({ confirm: typed, reason }) });
      toast(`Account deleted.${BILLING[r.billing] ?? ""}`);
      setAsking("");
      onGone?.();
    } catch (e) {
      toast(e instanceof Error ? e.message : "The account wasn't deleted.", true);
    } finally {
      setBusy("");
    }
  }

  if (error) return <p className="adm-note adm-bad">{error}</p>;
  if (!d) return <p className="hint">Opening that coach…</p>;
  const p = d.profile;
  const email = p?.email ?? d.identity?.email ?? "";
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
          <div><dt>Status</dt><dd>{p?.suspendedAt ? `Switched off ${when(p.suspendedAt)}${p.suspendedReason ? ` · ${p.suspendedReason}` : ""}` : "Active"}</dd></div>
          <div><dt>Phone code</dt><dd>{p?.phoneSkipAt ? `Skipped since ${when(p.phoneSkipAt)}` : "Required when codes are on"}</dd></div>
          <div><dt>Subscription</dt><dd>{p?.stripeSubscriptionId ? "Paying through Stripe" : "None"}</dd></div>
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
        <h3>Phone code</h3>
        <p className="hint">
          Let this coach use the app with no mobile number and no texted device code, while codes stay on for everyone else.
          Use it for a coach whose number is already on another account or who can't get texts.
        </p>
        <div className="adm-bar">
          {p?.phoneSkipAt ? (
            <button type="button" className="btn btn-sm" disabled={busy === "phone"} onClick={() => setPhoneSkip(false)}>Require the phone code again</button>
          ) : (
            <button type="button" className="btn btn-primary btn-sm" disabled={busy === "phone"} onClick={() => setPhoneSkip(true)}>Skip the phone code</button>
          )}
        </div>
      </section>

      {p?.plan !== "master" && (
        <section className="card adm-card adm-danger">
          <h3>Access</h3>
          <p className="hint">
            Switching an account off keeps everything and refuses every signed-in call until you switch it back on. Deleting removes
            their plays, playbooks, Call Sheets, team, devices and sign-in for good (no 30-day trash), and cancels their subscription first.
          </p>
          <div className="adm-bar">
            {p?.suspendedAt ? (
              <button type="button" className="btn btn-sm" disabled={busy === "access"} onClick={() => setAccess(false)}>Switch back on</button>
            ) : (
              <button type="button" className="btn btn-sm" onClick={() => setAsking("suspend")}>Switch off…</button>
            )}
            <button type="button" className="btn btn-danger btn-sm" onClick={() => { setTyped(""); setAsking("delete"); }}>Delete account…</button>
          </div>
        </section>
      )}

      <section className="card adm-card">
        <h3>Sign-ins and capture activity</h3>
        <p className="hint">
          Sign-ins, app opens (one per device each half hour), prints, screenshot keys, copies and exports, newest first, kept 180 days.
          A screenshot key is a hint, not proof: a phone or the Snipping Tool opened from the Start menu never shows up.
        </p>
        <ActivityTable rows={d.activity} />
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

      {asking === "suspend" && (
        <Modal
          title="Switch this account off?"
          onClose={() => setAsking("")}
          footer={
            <>
              <button type="button" className="btn btn-quiet" onClick={() => setAsking("")}>Keep it on</button>
              <button type="button" className="btn btn-primary" disabled={busy === "access"} onClick={() => setAccess(true)}>Switch off</button>
            </>
          }
        >
          <p>{email || "This coach"} can't save, sync, use Griddy or open shared Front Office work until you switch it back on. Nothing is deleted.</p>
          <label className="field">
            <span>Reason (only you see it)</span>
            <input value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} placeholder="e.g. sharing one login across a league" />
          </label>
          {p?.stripeSubscriptionId && (
            <label className="check">
              <input type="checkbox" checked={stopBilling} onChange={(e) => setStopBilling(e.target.checked)} /> Also cancel their subscription now
            </label>
          )}
        </Modal>
      )}
      {asking === "delete" && (
        <Modal
          title="Delete this account for good?"
          onClose={() => setAsking("")}
          footer={
            <>
              <button type="button" className="btn btn-quiet" onClick={() => setAsking("")}>Cancel</button>
              <button
                type="button"
                className="btn btn-danger"
                disabled={busy === "delete" || !email || typed.trim().toLowerCase() !== email.toLowerCase()}
                onClick={remove}
              >
                {busy === "delete" ? "Deleting…" : "Delete account"}
              </button>
            </>
          }
        >
          <p>
            This cancels any subscription, removes every play, playbook, Call Sheet, team file and device on <b>{email || id}</b>, and
            closes their sign-in. It can't be undone and nothing goes to the trash. Download their data first if you might need it.
          </p>
          <label className="field">
            <span>Reason (kept in the audit log)</span>
            <input value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
          </label>
          <label className="field">
            <span>Type their email to confirm</span>
            <input value={typed} autoComplete="off" onChange={(e) => setTyped(e.target.value)} placeholder={email} />
          </label>
        </Modal>
      )}
    </div>
  );
}
