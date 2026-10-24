import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import { useToast } from "../../lib/toast";

export type AdminUser = {
  id: string; email: string; name: string; signedUpAt: string | null; confirmed: boolean; provider: string;
  lastSignInAt: string | null; lastActiveAt: string | null; plan: string; phone: "verified" | "none";
  deleted: boolean; deletedAt: string | null; plays: number; griddyMonth: number; griddyPeakDay: number;
  photosMonth: number; exports: number; exports24h: number; devices: number; phoneSignups: number; devicePeers: number; griddyFirstDay: number; flags: string[];
};

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
      .filter((u) => !needle || `${u.email} ${u.name} ${u.id} ${u.plan}`.toLowerCase().includes(needle));
  }, [users, q, watch]);

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
          <input type="search" placeholder="Search email, name, plan or id" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <span className="hint">
          {rows.length} of {users.length}
        </span>
        <button type="button" className="btn btn-primary btn-sm" onClick={download}>
          Download CSV
        </button>
      </div>
      {!identity && (
        <p className="adm-note">Sign-in provider list unavailable here, so this shows only coaches who have used the app (profiles).</p>
      )}
      <div className="adm-scroll">
        <table className="adm-table">
          <thead>
            <tr>
              <th>Coach</th><th>Signed up</th><th>Last active</th><th>Plan</th><th>Phone</th>
              <th>Plays</th><th>Griddy / mo</th><th>Exports</th><th>Devices</th><th>Flags</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id} className={u.deleted ? "is-deleted" : undefined}>
                <td>
                  <button type="button" className="adm-link" onClick={() => onOpen(u.id)}>
                    {u.email || u.id}
                  </button>
                  <small>{u.name}{!u.confirmed && " · email not confirmed"}{u.deleted && ` · deleted ${when(u.deletedAt)}`}</small>
                </td>
                <td>{when(u.signedUpAt)}</td>
                <td>{when(u.lastActiveAt ?? u.lastSignInAt)}</td>
                <td><span className={`pill${u.plan === "master" ? " pill-cyan" : ""}`}>{u.plan}</span></td>
                <td>{u.phone === "verified" ? "Verified" : "None"}{u.phoneSignups > 1 && ` · ${u.phoneSignups} accounts`}</td>
                <td>{u.plays}</td>
                <td>{u.griddyMonth}{u.griddyPeakDay > 0 && <small>peak {u.griddyPeakDay}/day</small>}</td>
                <td>{u.exports}{u.exports24h > 0 && <small>{u.exports24h} today</small>}</td>
                <td>{u.devices}{u.devicePeers > 1 && <small>{u.devicePeers} accounts on one device</small>}</td>
                <td>{u.flags.map((f) => <span key={f} className="pill pill-amber">{f}</span>)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={10}>{watch ? "Nothing flagged right now." : "No one matches that search."}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
