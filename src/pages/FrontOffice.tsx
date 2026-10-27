import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Shell } from "../components/Shell";
import { Icon } from "../components/Icon";
import { Modal } from "../components/Modal";
import { PlayThumb } from "../components/PlayThumb";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { cloneSharedPlay, ORG_LIMITS, parseEmails, type FrontOfficeState, type MyOrg, type OrgShareDetail, type OrgShareSummary } from "../lib/frontOffice";
import { savePlays } from "../lib/griddyVault";
import { gateFrontOffice, gateSave } from "../lib/plan";
import { SHARE_LIMITS, toSnapshot } from "../lib/share";
import { store, useStore } from "../lib/store";
import { useTier } from "../lib/tier";
import { useToast } from "../lib/toast";
import type { StoredPlay } from "../lib/types";
import { Hub, type HubTab } from "./frontOffice/Hub";
import "../styles/frontOffice.css";

/** A question before a change: Leave, Remove, Stop sharing, Close, or a new name (`input`). */
type Ask = { title: string; body: string; label: string; danger?: boolean; input?: string; onYes: (value: string) => void };

/** The Front Office's tabs: the playbook sharing it started with, then the team hub. */
const TABS: { id: "playbooks" | HubTab; label: string; icon: string }[] = [
  { id: "playbooks", label: "Playbooks & coaches", icon: "folder" },
  { id: "roster", label: "Roster", icon: "users" },
  { id: "depth", label: "Depth chart", icon: "ladder" },
  { id: "schedule", label: "Schedule", icon: "calendar" },
  { id: "messages", label: "Messages", icon: "message" },
  { id: "files", label: "Files", icon: "folder" },
];

const day = (iso: string) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "");

/** A playbook name not already in this browser's list, so a clone always lands in a new book. */
function freshBookName(base: string) {
  const taken = new Set(store.get().playbooks.map((b) => b.name.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base} ${n}`.toLowerCase())) return `${base} ${n}`;
}

/**
 * The Front Office: a league or program director hands read-only master
 * playbooks to the coaches they invite, and each coach clones what they want
 * into their own Vault. Cloning only ever adds new plays and a new playbook.
 */
export function FrontOffice() {
  const { account, status } = useAuth();
  const tier = useTier();
  const toast = useToast();
  const navigate = useNavigate();
  const [data, setData] = useState<FrontOfficeState | null>(null);
  const [failed, setFailed] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<OrgShareDetail | null>(null);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [params, setParams] = useSearchParams();

  const load = useCallback(async () => {
    try {
      setData(await api.frontOffice());
      setFailed("");
    } catch (e) {
      setFailed((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (account) void load();
    else setData(null);
  }, [account, load]);

  /** Runs one server change, takes the fresh state it answers with, and toasts what went wrong in coach words. */
  const run = async (work: () => Promise<FrontOfficeState | void>, done?: string) => {
    setBusy(true);
    try {
      const next = await work();
      if (next) setData(next);
      if (done) toast(done);
      return true;
    } catch (e) {
      toast((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const open = async (share: OrgShareSummary) => {
    setBusy(true);
    try {
      setPreview((await api.openOrgShare(share.id)).share);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const clone = async (detail: OrgShareDetail) => {
    const gate = gateSave(tier, store.get().plays.length + detail.plays.length - 1);
    if (!gate.ok) {
      toast(`${detail.name} has ${detail.plays.length} plays and they won't all fit. ${gate.reason}`);
      return;
    }
    const book = freshBookName(`${detail.name} (${detail.orgName})`.slice(0, 120));
    await run(async () => {
      const saved = await savePlays(detail.plays.map(cloneSharedPlay), { playbook: book, signedIn: Boolean(account) });
      const local = saved.filter((p) => !p.remote).length;
      toast(
        local
          ? `${saved.length} plays cloned into "${book}". ${local} are on this device only for now; open and save them to put them on your account.`
          : `${saved.length} plays cloned into "${book}". They're yours to change.`,
      );
    });
    setPreview(null);
  };

  // Every Front Office this coach can open the team hub of: their own first, then the ones they joined.
  const hubOrgs = data ? [...(data.mine ? [{ id: data.mine.id, name: data.mine.name }] : []), ...data.joined.map((j) => ({ id: j.org.id, name: j.org.name }))] : [];
  const orgId = hubOrgs.find((o) => o.id === params.get("org"))?.id ?? hubOrgs[0]?.id ?? "";
  const asked = params.get("tab");
  const tab = TABS.find((t) => t.id === asked)?.id ?? "playbooks";
  const choose = (next: { tab?: string; org?: string; team?: string }) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    setParams(p, { replace: true });
  };

  if (!account) {
    return (
      <Shell title="Front Office">
        <Head />
        <div className="empty">
          <Icon name="lock" size={30} />
          <h3>{status === "loading" ? "Checking your sign-in…" : "Sign in to open the Front Office"}</h3>
          <p>League and program directors share master playbooks here, and the coaches they invite clone them into their own Vault.</p>
          {status !== "loading" && (
            <Link to="/signin" className="btn btn-primary btn-sm">
              Sign in
            </Link>
          )}
        </div>
      </Shell>
    );
  }

  return (
    <Shell title="Front Office">
      <Head />
      {failed && !data && (
        <div className="empty empty-sm" role="alert">
          <p>{failed}</p>
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => void load()}>
            Try again
          </button>
        </div>
      )}
      {!data && !failed && <p role="status">Opening the Front Office…</p>}

      {data && (
        <>
          {data.invites.length > 0 && (
            <section className="fo-section" aria-labelledby="fo-invites">
              <h3 id="fo-invites">Invites waiting for you</h3>
              <ul className="fo-list">
                {data.invites.map((inv) => (
                  <li key={inv.memberId}>
                    <div>
                      <b>{inv.org.name}</b>
                      <small>
                        {inv.org.ownerName || "A director"} invited {account.email} on {day(inv.invitedAt)}
                      </small>
                    </div>
                    <div className="fo-actions">
                      <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void run(() => api.acceptInvite(inv.memberId), `You joined ${inv.org.name}.`)}>
                        <Icon name="check" size={14} /> Join
                      </button>
                      <button type="button" className="btn btn-quiet btn-sm" disabled={busy} onClick={() => void run(() => api.removeMember(inv.memberId), "Invite declined.")}>
                        Decline
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {hubOrgs.length > 0 && (
            <div className="hub-nav">
              {hubOrgs.length > 1 && (
                <label className="field hub-org">
                  <span>Front Office</span>
                  <select className="select" value={orgId} onChange={(e) => choose({ org: e.target.value, team: "" })}>
                    {hubOrgs.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div className="chip-row hub-tabs" role="tablist" aria-label="Front Office sections">
                {TABS.map((t) => (
                  <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`chip${tab === t.id ? " is-on" : ""}`} onClick={() => choose({ tab: t.id })}>
                    <Icon name={t.icon} size={14} /> {t.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {tab !== "playbooks" && orgId ? (
            <Hub orgId={orgId} tab={tab} teamId={params.get("team") ?? ""} onTeam={(team) => choose({ team })} />
          ) : (
          <>
          <section className="fo-section" aria-labelledby="fo-shared">
            <h3 id="fo-shared">Shared with you</h3>
            {data.joined.length === 0 ? (
              <p className="hint">
                Nothing yet. When your league or program director invites {account.email}, the invite shows up here.
              </p>
            ) : (
              data.joined.map((j) => (
                <div className="fo-org" key={j.memberId}>
                  <div className="fo-org-head">
                    <div>
                      <b>{j.org.name}</b>
                      <small>Director: {j.org.ownerName || "—"}</small>
                    </div>
                    <button
                      type="button"
                      className="btn btn-quiet btn-sm"
                      disabled={busy}
                      onClick={() =>
                        setAsk({
                          title: `Leave ${j.org.name}?`,
                          body: "You lose access to its shared playbooks. Plays you already cloned stay in your Vault.",
                          label: "Leave",
                          danger: true,
                          onYes: () => void run(() => api.removeMember(j.memberId), `You left ${j.org.name}.`),
                        })
                      }
                    >
                      Leave
                    </button>
                  </div>
                  <ShareList shares={j.shares} busy={busy} onOpen={open} empty="Your director hasn't shared a playbook yet." />
                </div>
              ))
            )}
          </section>

          <Director
            mine={data.mine}
            busy={busy}
            run={run}
            onOpen={open}
            gate={gateFrontOffice(tier)}
            seatsUsed={data.mine?.members.length ?? 0}
            onUpgrade={() => navigate("/pricing")}
            ask={setAsk}
          />
          </>
          )}
        </>
      )}

      {ask && <AskDialog ask={ask} onClose={() => setAsk(null)} />}

      {preview && (
        <Modal
          title={preview.name}
          onClose={() => setPreview(null)}
          wide
          footer={
            <>
              <button type="button" className="btn btn-quiet" onClick={() => setPreview(null)}>
                Close
              </button>
              <button type="button" className="btn btn-primary" disabled={busy || !preview.plays.length} onClick={() => void clone(preview)}>
                <Icon name="copy" size={15} /> Clone to my Vault
              </button>
            </>
          }
        >
          <p>
            <span className="pill pill-amber">
              <Icon name="lock" size={12} /> Read-only master
            </span>{" "}
            From {preview.orgName}, updated {day(preview.updatedAt)}. Cloning makes your own copy of all {preview.plays.length} plays in a new
            playbook; the master stays as your director left it.
          </p>
          {preview.note && <p className="fo-note">{preview.note}</p>}
          <div className="add-grid">
            {preview.plays.map((p) => (
              <div className="add-card fo-card" key={p.id}>
                <PlayThumb scene={p.scene} label={p.name} />
                <b>{p.name}</b>
                <small>{p.formation}</small>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </Shell>
  );
}

function AskDialog({ ask, onClose }: { ask: Ask; onClose: () => void }) {
  const [value, setValue] = useState(ask.input ?? "");
  const ok = ask.input === undefined || value.trim().length > 0;
  const yes = () => {
    if (!ok) return;
    onClose();
    ask.onYes(value.trim());
  };
  return (
    <Modal
      title={ask.title}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-quiet" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={`btn ${ask.danger ? "btn-danger" : "btn-primary"}`} disabled={!ok} onClick={yes}>
            {ask.label}
          </button>
        </>
      }
    >
      <p>{ask.body}</p>
      {ask.input !== undefined && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            yes();
          }}
        >
          <label className="field">
            <span>Name</span>
            <input className="input" value={value} maxLength={ORG_LIMITS.name} onChange={(e) => setValue(e.target.value)} />
          </label>
        </form>
      )}
    </Modal>
  );
}

function Head() {
  return (
    <div className="page-head">
      <div>
        <h2>Front Office</h2>
        <p>
          Run your league or program from one place. Share read-only master playbooks with every coach you invite, and keep each team's
          roster, parent contacts and season in a hub only you and that team's staff can open.
        </p>
      </div>
    </div>
  );
}

function ShareList({
  shares,
  busy,
  onOpen,
  empty,
  extra,
}: {
  shares: OrgShareSummary[];
  busy: boolean;
  onOpen: (s: OrgShareSummary) => void;
  empty: string;
  extra?: (s: OrgShareSummary) => React.ReactNode;
}) {
  if (!shares.length) return <p className="hint">{empty}</p>;
  return (
    <ul className="fo-list">
      {shares.map((s) => (
        <li key={s.id}>
          <Icon name="lock" size={18} />
          <div>
            <b>{s.name}</b>
            <small>
              {s.plays} {s.plays === 1 ? "play" : "plays"} · updated {day(s.updatedAt)}
              {s.note ? ` · ${s.note}` : ""}
            </small>
          </div>
          <div className="fo-actions">
            <button type="button" className="btn btn-quiet btn-sm" disabled={busy} onClick={() => onOpen(s)} aria-label={`Open ${s.name}`}>
              <Icon name="eye" size={14} /> Open
            </button>
            {extra?.(s)}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** The director's side: their own Front Office, its coaches and the playbooks it shares. */
function Director({
  mine,
  busy,
  run,
  onOpen,
  gate,
  seatsUsed,
  onUpgrade,
  ask,
}: {
  mine: MyOrg | null;
  busy: boolean;
  run: (work: () => Promise<FrontOfficeState | void>, done?: string) => Promise<boolean>;
  onOpen: (s: OrgShareSummary) => void;
  gate: ReturnType<typeof gateFrontOffice>;
  seatsUsed: number;
  onUpgrade: () => void;
  ask: (a: Ask) => void;
}) {
  const books = useStore((s) => s.playbooks);
  const plays = useStore((s) => s.plays);
  const playsById = useMemo(() => new Map(plays.map((p) => [p.id, p])), [plays]);
  const [name, setName] = useState("");
  const [emails, setEmails] = useState("");
  const [bookId, setBookId] = useState("");
  const [note, setNote] = useState("");

  const bookPlays = (id: string): StoredPlay[] =>
    (books.find((b) => b.id === id)?.playIds ?? []).map((p) => playsById.get(p)).filter((p): p is StoredPlay => Boolean(p));

  if (!mine) {
    return (
      <section className="fo-section" aria-labelledby="fo-mine">
        <h3 id="fo-mine">Run your own Front Office</h3>
        {!gate.ok ? (
          <>
            <p className="hint">{gate.reason}</p>
            <button type="button" className="btn btn-primary btn-sm" onClick={onUpgrade}>
              {gate.cta}
            </button>
          </>
        ) : (
          <form
            className="fo-inline"
            onSubmit={(e) => {
              e.preventDefault();
              void run(() => api.createOrg(name), "Front Office ready. Invite your coaches next.").then((ok) => ok && setName(""));
            }}
          >
            <label className="field">
              <span>League or program name</span>
              <input className="input" value={name} maxLength={ORG_LIMITS.name} onChange={(e) => setName(e.target.value)} placeholder="Middle TN Flag League" required />
            </label>
            <button type="submit" className="btn btn-primary btn-sm" disabled={busy || !name.trim()}>
              Start the Front Office
            </button>
          </form>
        )}
      </section>
    );
  }

  const share = (id: string, keepNote?: string) => {
    const book = books.find((b) => b.id === id);
    if (!book) return;
    const list = bookPlays(id);
    void run(
      () => api.shareToOrg(mine.id, { source: book.id, note: keepNote ?? note, snapshot: toSnapshot(book.name, list) }),
      mine.shares.some((s) => s.source === book.id) ? `Coaches now see the latest ${book.name}.` : `${book.name} is shared with your coaches.`,
    ).then((ok) => {
      if (ok && keepNote === undefined) {
        setBookId("");
        setNote("");
      }
    });
  };

  const picked = bookId ? bookPlays(bookId) : [];
  const parsed = parseEmails(emails);

  return (
    <section className="fo-section" aria-labelledby="fo-mine">
      <div className="fo-org-head">
        <h3 id="fo-mine">Your Front Office: {mine.name}</h3>
        <div className="fo-actions">
          <button
            type="button"
            className="btn btn-quiet btn-sm"
            disabled={busy}
            onClick={() =>
              ask({
                title: "Rename your Front Office",
                body: "Coaches see this name on their invites and shared playbooks.",
                label: "Rename",
                input: mine.name,
                onYes: (next) => {
                  if (next !== mine.name) void run(() => api.renameOrg(mine.id, next), "Renamed.");
                },
              })
            }
          >
            <Icon name="pencil" size={14} /> Rename
          </button>
          <button
            type="button"
            className="btn btn-danger btn-sm"
            disabled={busy}
            onClick={() =>
              ask({
                title: `Close ${mine.name}?`,
                body: "Coaches lose access to its shared playbooks, the coach list is cleared, and every team's roster, depth chart, schedule, messages and files are deleted. Plays coaches already cloned stay theirs, and your own plays and playbooks are not touched.",
                label: "Close it",
                danger: true,
                onYes: () => void run(() => api.deleteOrg(mine.id), "Front Office closed."),
              })
            }
          >
            <Icon name="trash" size={14} /> Close
          </button>
        </div>
      </div>

      <div className="fo-grid">
        <div className="fo-org">
          <h4>Shared playbooks</h4>
          <ShareList
            shares={mine.shares}
            busy={busy}
            onOpen={onOpen}
            empty="Share a playbook below and every coach who joined sees it."
            extra={(s) => (
              <>
                {books.some((b) => b.id === s.source) && (
                  <button type="button" className="btn btn-quiet btn-sm" disabled={busy} onClick={() => share(s.source, s.note)} aria-label={`Send the latest ${s.name}`}>
                    <Icon name="redo" size={14} /> Update
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-quiet btn-sm"
                  disabled={busy}
                  onClick={() =>
                    ask({
                      title: `Stop sharing ${s.name}?`,
                      body: "Coaches can no longer open it. Plays they already cloned stay theirs, and your playbook is not touched.",
                      label: "Stop sharing",
                      danger: true,
                      onYes: () => void run(() => api.unshareFromOrg(s.id), "No longer shared."),
                    })
                  }
                  aria-label={`Stop sharing ${s.name}`}
                >
                  Stop sharing
                </button>
              </>
            )}
          />
          <form
            className="fo-inline"
            onSubmit={(e) => {
              e.preventDefault();
              share(bookId);
            }}
          >
            <label className="field">
              <span>Playbook</span>
              <select className="select" value={bookId} onChange={(e) => setBookId(e.target.value)}>
                <option value="">Pick one of your playbooks</option>
                {books.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.playIds.length})
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Note for coaches (optional)</span>
              <input className="input" value={note} maxLength={ORG_LIMITS.note} onChange={(e) => setNote(e.target.value)} placeholder="Install by week 2" />
            </label>
            {picked.length > SHARE_LIMITS.plays && <p className="hint">A shared playbook holds up to {SHARE_LIMITS.plays} plays. This one has {picked.length}.</p>}
            <button type="submit" className="btn btn-primary btn-sm" disabled={busy || !picked.length || picked.length > SHARE_LIMITS.plays}>
              <Icon name="link" size={14} /> Share with coaches
            </button>
          </form>
        </div>

        <div className="fo-org">
          <h4>
            Coaches <span className="pill">{seatsUsed} of {mine.seats >= 1_000_000 ? "unlimited" : mine.seats}</span>
          </h4>
          {mine.members.length === 0 ? (
            <p className="hint">No coaches yet. Invite them by the email they sign in with.</p>
          ) : (
            <ul className="fo-list">
              {mine.members.map((m) => (
                <li key={m.id}>
                  <div>
                    <b>{m.name || m.email}</b>
                    <small>
                      {m.name ? `${m.email} · ` : ""}
                      {m.status === "active" ? `joined ${day(m.joinedAt ?? "")}` : `invited ${day(m.invitedAt)}, not joined yet`}
                    </small>
                  </div>
                  <span className={`pill ${m.status === "active" ? "pill-green" : "pill-amber"}`}>{m.status === "active" ? "Joined" : "Invited"}</span>
                  <button
                    type="button"
                    className="btn btn-quiet btn-sm"
                    disabled={busy}
                    onClick={() =>
                      ask({
                        title: `Remove ${m.email}?`,
                        body: "They lose access to your shared playbooks and the seat opens up. Plays they already cloned stay theirs.",
                        label: "Remove",
                        danger: true,
                        onYes: () => void run(() => api.removeMember(m.id), "Coach removed."),
                      })
                    }
                    aria-label={`Remove ${m.email}`}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form
            className="fo-inline"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                const res = await api.inviteCoaches(mine.id, parsed);
                setEmails("");
                return res;
              }, `${parsed.length === 1 ? "Invite" : "Invites"} saved. Tell your coaches to sign in with that email and open Front Office.`);
            }}
          >
            <label className="field">
              <span>Invite coaches</span>
              <textarea
                className="textarea"
                value={emails}
                onChange={(e) => setEmails(e.target.value)}
                placeholder={"coach.jones@example.com\ncoach.smith@example.com"}
              />
              <small className="hint">Paste one or many addresses. They see the invite when they sign in with that email; no email is sent.</small>
            </label>
            <button type="submit" className="btn btn-primary btn-sm" disabled={busy || !parsed.length}>
              <Icon name="plus" size={14} /> Invite {parsed.length > 1 ? `${parsed.length} coaches` : "coach"}
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
