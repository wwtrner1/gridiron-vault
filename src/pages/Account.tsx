import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Shell } from "../components/Shell";
import { Icon } from "../components/Icon";
import { Modal } from "../components/Modal";
import { Tooltip } from "../components/Tooltip";
import { DevicesCard } from "../components/DevicesCard";
import { InstallCard } from "../components/InstallCard";
import { useAuth } from "../lib/auth";
import { PUBLIC_TIERS, TIERS, type TierId } from "../lib/plan";
import { choosePlan, goToBilling, setBilling, syncPlan, useBilling, useTier } from "../lib/tier";
import { store, useStore } from "../lib/store";
import { readEvents } from "../lib/track";
import { forgetAll } from "../lib/autofill";
import { useToast } from "../lib/toast";
import { api } from "../lib/api";

const EVENT_LABELS: Record<string, string> = {
  play_created: "Plays saved",
  call_sheet_opened: "Call sheets opened",
  play_exported: "Exports and prints",
};

export function Account() {
  const { account, signOut, available } = useAuth();
  const tier = useTier();
  const billing = useBilling();
  const toast = useToast();
  const navigate = useNavigate();
  const plays = useStore((s) => s.plays);
  const books = useStore((s) => s.playbooks);
  const sheets = useStore((s) => s.sheets);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [params] = useSearchParams();
  const paid = params.get("billing") === "success";

  // Back from Stripe: the plan is set by Stripe's webhook a moment after the payment, so ask until it lands.
  useEffect(() => {
    if (!paid || !account) return;
    let alive = true;
    const first = tier.id;
    (async () => {
      for (let i = 0; i < 10 && alive; i++) {
        try {
          const me = await api.me();
          setBilling(Boolean(me.billing));
          if (me.plan && me.plan !== first) {
            void syncPlan(me.plan, me.trialEndsAt);
            toast(`You're on ${TIERS[me.plan as TierId]?.name ?? "your new plan"}. Thanks for backing the playbook.`);
            return;
          }
        } catch {
          /* ask again */
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paid, account?.id]);

  const deleteAccount = async () => {
    setBusy(true);
    setDeleteError("");
    try {
      await api.deleteAccount(typed);
      store.reset();
      await signOut().catch(() => {});
      toast("Your account and everything in it are deleted.");
      navigate("/");
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "The account could not be deleted. Try again.");
      setBusy(false);
    }
  };

  const events = useMemo(() => readEvents(), [plays.length, sheets.length]);

  const counts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const e of events) out[e.name] = (out[e.name] ?? 0) + 1;
    return out;
  }, [events]);

  const lastActive = events.length ? new Date(events[events.length - 1].at) : null;

  const pct = (used: number, limit: number) => Math.min(100, Math.round((used / Math.max(1, limit)) * 100));

  // Playbooks are free to create — they only hold references to plays — so the
  // Vault limit is the real ceiling and there is no separate meter for them.
  const usage = [
    { label: "Plays in your Vault", used: plays.length, limit: tier.playLimit, to: "/vault" },
    { label: "Call Sheets", used: sheets.length, limit: tier.gridLimit, to: "/grid" },
  ];

  return (
    <Shell
      title="Your account"
      actions={
        <Link to="/pricing" className="btn btn-primary btn-sm">
          <Icon name="sparkle" size={15} /> Compare plans
        </Link>
      }
    >
      <div className="page-head">
        <div>
          <h2>Your account</h2>
          <p>Your plan, what you have used, and where your work is stored.</p>
        </div>
      </div>

      <div className="acct-grid">
        <section className="card">
          <h3>Coach profile</h3>
          {account ? (
            <>
              <div className="acct-id">
                <span className="avatar avatar-lg">{account.name.slice(0, 1).toUpperCase()}</span>
                <div>
                  <b>{account.name}</b>
                  <small>{account.email}</small>
                </div>
              </div>
              <p className="hint">
                Your plays sync to this account. Sign in on a tablet and the same Vault shows up.
              </p>
              <div className="acct-tools">
                <button type="button" className="btn btn-quiet btn-sm" onClick={() => signOut()}>
                  Sign out
                </button>
                <button type="button" className="btn btn-danger btn-sm" onClick={() => (setTyped(""), setDeleteError(""), setDeleting(true))}>
                  <Icon name="trash" size={14} /> Delete my account
                </button>
              </div>
            </>
          ) : (
            <>
              <p>
                You are working locally. Everything you draw is saved in this browser only — clear your
                browser data and it is gone.
              </p>
              {!available && (
                <p className="hint">Accounts are not switched on for this site yet.</p>
              )}
              <Link to="/signin" className="btn btn-primary btn-sm">
                Create an account
              </Link>
            </>
          )}
        </section>

        {account && <DevicesCard />}
        <InstallCard />

        <section className="card">
          <div className="card-head">
            <h3>Your plan</h3>
            <span className={`pill${tier.id === "beta" || tier.id === "master" ? " pill-cyan" : ""}`}>{tier.name}</span>
          </div>
          <p>{tier.blurb}</p>
          <dl className="acct-facts">
            <div>
              <dt>Seats</dt>
              <dd>{tier.seats}</dd>
            </div>
            <div>
              <dt>Print quality</dt>
              <dd>{tier.maxDpi} DPI</dd>
            </div>
            <div>
              <dt>Export sizes</dt>
              <dd>{tier.sizes === "all" ? "Every size" : "Wristband + letter"}</dd>
            </div>
            <div>
              <dt>Whiteboard photo reviews</dt>
              <dd>{tier.id === "master" ? "Unlimited" : `${tier.photoReviews} per month`}</dd>
            </div>
            <div>
              <dt>Griddy requests</dt>
              <dd>{tier.id === "master" ? "Unlimited" : `${tier.assistantCalls} per month`}</dd>
            </div>
          </dl>
          {tier.id === "master" ? (
            <small className="hint">This is the owner account. It has no plan to switch and no limits to run into.</small>
          ) : billing ? (
            <div className="field">
              <span>Billing</span>
              <div className="chip-row">
                <Link className="btn btn-ghost" to="/pricing">
                  See plans
                </Link>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={async () => {
                    try {
                      await goToBilling();
                    } catch (e) {
                      toast(e instanceof Error ? e.message : "Stripe didn't open. Try again in a minute.", true);
                    }
                  }}
                >
                  Manage billing
                </button>
              </div>
              <small className="hint">Cancel, change your card or download receipts on Stripe's page. You keep your plan until the period you paid for ends.</small>
            </div>
          ) : (
          <div className="field">
            <span id="switch-plan">
              Switch plan <span className="pill pill-amber">Beta</span>
            </span>
            <div className="chip-row" role="group" aria-labelledby="switch-plan">
              {[TIERS.beta, ...PUBLIC_TIERS].map((t) => (
                <Tooltip key={t.id} title={t.name} hint={t.blurb} side="top">
                  <button
                    type="button"
                    className={`chip${tier.id === t.id ? " is-on" : ""}`}
                    aria-pressed={tier.id === t.id}
                    onClick={async () => {
                      try {
                        await choosePlan(t.id as TierId, Boolean(account));
                        toast(`Now on ${t.name}.`);
                      } catch (e) {
                        toast(e instanceof Error ? e.message : "Your plan didn't change. Try again in a minute.", true);
                      }
                    }}
                  >
                    {t.name}
                  </button>
                </Tooltip>
              ))}
            </div>
            <small className="hint">
              Beta plans are set by hand while we are testing. Billing takes over when beta ends.
            </small>
          </div>
          )}
        </section>

        <section className="card">
          <h3>What you have used</h3>
          {usage.map((u) => (
            <div className="meter" key={u.label}>
              <div className="meter-top">
                <Link to={u.to}>{u.label}</Link>
                <b>
                  {u.used} <small>{tier.id === "master" ? "· no limit" : `of ${u.limit}`}</small>
                </b>
              </div>
              <div
                className="meter-track"
                role="progressbar"
                aria-valuenow={u.used}
                aria-valuemin={0}
                aria-valuemax={u.limit}
                aria-valuetext={`${u.used} of ${u.limit} ${u.label.toLowerCase()} used`}
                aria-label={u.label}
              >
                <span style={{ width: `${pct(u.used, u.limit)}%` }} data-warn={pct(u.used, u.limit) >= 80 || undefined} />
              </div>
            </div>
          ))}
          <p className="hint">
            <Link to="/playbooks">{books.length} {books.length === 1 ? "playbook" : "playbooks"}</Link> —
            playbooks are unlimited on every plan.
          </p>
          {plays.length >= tier.playLimit && (
            <div className="lock-note">
              <Icon name="lock" size={15} />
              <div>
                <b>Your Vault is full.</b>
                <span>Delete a play you are not using, or move up a plan to keep saving.</span>
              </div>
              <Link to="/pricing" className="btn btn-primary btn-sm">
                See plans
              </Link>
            </div>
          )}
        </section>

        <section className="card">
          <h3>Activity</h3>
          {events.length === 0 ? (
            <p>Nothing logged yet. Save a play and it shows up here.</p>
          ) : (
            <>
              <div className="grid-stats">
                {Object.entries(EVENT_LABELS).map(([key, label]) => (
                  <div className="stat" key={key}>
                    <b>{counts[key] ?? 0}</b>
                    <span>{label}</span>
                  </div>
                ))}
              </div>
              <p className="hint">
                Last activity{" "}
                {lastActive
                  ? lastActive.toLocaleDateString(undefined, { month: "short", day: "numeric" })
                  : "—"}
                . Counts are kept in this browser so you can see your own usage.
              </p>
            </>
          )}
        </section>

        <section className="card">
          <h3>Your data</h3>
          <p>
            Plays, playbooks and Call Sheets live in this browser first and sync to your account when you
            are signed in.
          </p>
          <div className="acct-tools">
            <Tooltip title="Download a backup" hint="Writes every play, book and grid to one JSON file you can keep." side="top">
              <button
                type="button"
                className="btn btn-quiet btn-sm"
                onClick={() => {
                  const blob = new Blob([JSON.stringify(store.get(), null, 2)], { type: "application/json" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `gridironvault-backup-${new Date().toISOString().slice(0, 10)}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                  toast("Backup downloaded.");
                }}
              >
                <Icon name="download" size={14} /> Download a backup
              </button>
            </Tooltip>
            <Tooltip title="Forget autocomplete" hint="Clears the shorthand the Call Sheet learned from you. Your rows stay." side="top">
              <button
                type="button"
                className="btn btn-quiet btn-sm"
                onClick={() => {
                  forgetAll();
                  toast("Autocomplete memory cleared.");
                }}
              >
                <Icon name="undo" size={14} /> Forget autocomplete
              </button>
            </Tooltip>
            <button type="button" className="btn btn-danger btn-sm" onClick={() => setConfirmWipe(true)}>
              <Icon name="trash" size={14} /> Clear local workspace
            </button>
          </div>
        </section>
      </div>

      {deleting && account && (
        <Modal
          title="Delete your account?"
          onClose={() => !busy && setDeleting(false)}
          footer={
            <>
              <button type="button" className="btn btn-quiet" onClick={() => setDeleting(false)} disabled={busy}>
                Keep my account
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={deleteAccount}
                disabled={busy || typed.trim().toLowerCase() !== account.email.toLowerCase()}
              >
                {busy ? "Deleting…" : "Delete everything"}
              </button>
            </>
          }
        >
          <p>
            This permanently deletes your sign-in, your phone number and devices, and every play, playbook and
            Call Sheet saved to your account — on every device. It cannot be undone.
          </p>
          <p className="hint">Want a copy first? Close this and use Download a backup under Your data.</p>
          <label className="field">
            <span>Type {account.email} to confirm</span>
            <input
              type="email"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              disabled={busy}
            />
          </label>
          {deleteError && (
            <p className="error-line" role="alert">
              {deleteError}
            </p>
          )}
        </Modal>
      )}

      {confirmWipe && (
        <Modal
          title="Clear this browser's workspace?"
          onClose={() => setConfirmWipe(false)}
          footer={
            <>
              <button type="button" className="btn btn-quiet" onClick={() => setConfirmWipe(false)}>
                Keep my work
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => {
                  store.reset();
                  setConfirmWipe(false);
                  toast("Local workspace cleared.");
                  navigate("/");
                }}
              >
                Clear it
              </button>
            </>
          }
        >
          <p>
            This removes {plays.length} {plays.length === 1 ? "play" : "plays"}, {books.length}{" "}
            {books.length === 1 ? "playbook" : "playbooks"} and {sheets.length}{" "}
            {sheets.length === 1 ? "Call Sheet" : "Call Sheets"} from this browser.
          </p>
          <p>
            {account
              ? "Anything already synced to your account stays safe and comes back the next time you sign in."
              : "You are not signed in, so this cannot be undone. Download a backup first if you are unsure."}
          </p>
        </Modal>
      )}
    </Shell>
  );
}
