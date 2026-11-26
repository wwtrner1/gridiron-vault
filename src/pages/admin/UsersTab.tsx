import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import { FOUNDING_SEATS, TIERS, type TierId } from "../../lib/plan";
import { useToast } from "../../lib/toast";

export type AdminUser = {
  id: string; email: string; name: string; signedUpAt: string | null; confirmed: boolean; provider: string;
  lastSignInAt: string | null; lastActiveAt: string | null; plan: string; founding: boolean; phone: "verified" | "none"; phoneNumber?: string | null;
  deleted: boolean; deletedAt: string | null; plays: number; griddyMonth: number; griddyPeakDay: number;
  photosMonth: number; exports: number; exports24h: number; devices: number; phoneSignups: number; devicePeers: number; griddyFirstDay: number; captures7d: number; suspended: boolean; flags: string[];
};

/** A plan's name as coaches see it ("Sideline", not "free"); an id no plan has any more stays as it is. */
const planName = (id: string) => TIERS[id as TierId]?.name ?? id;

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—");

export function useAdminUsers() {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [identity, setIdentity] = useState(true);
  const [error, setError] = useState("");
  const load = () =>
    api
      .admin<{ users: AdminUser[]; identity: boolean }>("users")
      .then((r) => {
        setUsers(r.users);
        setIdentity(r.identity);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "The user list didn't load."));
  useEffect(() => {
    void load();
  }, []);
  return { users, identity, error, reload: load };
}

type Props = { users: AdminUser[] | null; identity: boolean; error: string; watch?: boolean; onOpen: (id: string) => void };

/** Everyone who has signed up, newest first. With `watch`, only accounts the abuse checks flagged. */
export function UsersTab({ users, identity, error, watch, onOpen }: Props) {
  const toast = useToast();
  const [q, setQ] = useState("");
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (users ?? [])
      .filter((u) => (watch ? u.flags.length > 0 : true))
      .filter((u) => !needle || `${u.email} ${u.name} ${u.id} ${u.plan} ${planName(u.plan)} ${u.founding ? "founding" : ""} ${u.phoneNumber ?? ""}`.toLowerCase().includes(needle));
  }, [users, q, watch]);

  // Live accounts on each plan, most first, and how many of the founding spots are taken (deleted accounts' spots stay
  // taken on the server, so the Pricing page's count can be a little lower than this one).
  const plans = useMemo(() => {
    const live = (users ?? []).filter((u) => !u.deleted);
    const counts = new Map<string, number>();
    for (const u of live) counts.set(u.plan, (counts.get(u.plan) ?? 0) + 1);
    return { counts: [...counts].sort((a, b) => b[1] - a[1]), founding: live.filter((u) => u.founding).length };
  }, [users]);

  async function download() {
    try {
      const blob = await api.adminUsersCsv();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `gridironvault-users-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      toast(e instanceof Error ? e.message : "The export didn't download.", true);
    }
  }

  if (error) return <p className="adm-note adm-bad">{error}</p>;
  if (!users) return <p className="hint">Loading every signup…</p>;

  return (
    <>
      <div className="adm-bar">
        <label className="adm-search">
          <span className="sr-only">Search users</span>
          <input type="search" placeholder="Search email, name, phone, plan or id" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <span className="hint">
          {rows.length} of {users.length}
        </span>
        <button type="button" className="btn btn-primary btn-sm" onClick={download}>
          Download CSV
        </button>
      </div>
      {!watch && (
        <p className="adm-plans" aria-label="Accounts on each plan">
          {plans.counts.map(([plan, n]) => (
            <button type="button" key={plan} className="chip" onClick={() => setQ(planName(plan))}>
              {planName(plan)} <b>{n}</b>
            </button>
          ))}
          <button type="button" className="chip" onClick={() => setQ("founding")} title="Head Coach at $9 a month for life, for the first coaches to take it">
            Founding spots <b>{plans.founding} of {FOUNDING_SEATS}</b>
          </button>
        </p>
      )}
      {!identity && (
        <p className="adm-note">Sign-in provider list unavailable here, so this shows only coaches who have used the app (profiles).</p>
      )}
      <div className="adm-scroll">
        <table className="adm-table">
          <thead>
            <tr>
              <th>Coach</th><th>Signed up</th><th>Last active</th><th>Plan</th><th>Phone</th>
              <th>Plays</th><th>Griddy / mo</th><th>Exports</th><th>Captures / 7d</th><th>Devices</th><th>Flags</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id} className={u.deleted || u.suspended ? "is-deleted" : undefined}>
                <td>
                  <button type="button" className="adm-link" onClick={() => onOpen(u.id)}>
                    {u.email || u.id}
                  </button>
                  <small>{u.name}{!u.confirmed && " · email not confirmed"}{u.deleted && ` · deleted ${when(u.deletedAt)}`}{u.suspended && " · switched off"}</small>
                </td>
                <td>{when(u.signedUpAt)}</td>
                <td>{when(u.lastActiveAt ?? u.lastSignInAt)}</td>
                <td>
                  <span className={`pill${u.plan === "master" ? " pill-cyan" : ""}`}>{planName(u.plan)}</span>
                  {u.founding && <small>Founding spot</small>}
                </td>
                <td>
                  {u.phoneNumber ?? "None"}
                  {u.phoneNumber && <small>{u.phone === "verified" ? "verified" : "not verified"}{u.phoneSignups > 1 && ` · ${u.phoneSignups} accounts`}</small>}
                </td>
                <td>{u.plays}</td>
                <td>{u.griddyMonth}{u.griddyPeakDay > 0 && <small>peak {u.griddyPeakDay}/day</small>}</td>
                <td>{u.exports}{u.exports24h > 0 && <small>{u.exports24h} today</small>}</td>
                <td>{u.captures7d}</td>
                <td>{u.devices}{u.devicePeers > 1 && <small>{u.devicePeers} accounts on one device</small>}</td>
                <td>{u.flags.map((f) => <span key={f} className="pill pill-amber">{f}</span>)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={11}>{watch ? "Nothing flagged right now." : "No one matches that search."}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
