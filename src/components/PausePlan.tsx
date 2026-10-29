import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { syncPlan } from "../lib/tier";
import { useToast } from "../lib/toast";

const MONTHS = [1, 2, 3, 6] as const;

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });

/**
 * Season over? Pause instead of cancel. A monthly plan stops charging until
 * the date picked, the coach drops to Sideline meanwhile (nothing is deleted),
 * and billing starts again on its own. Shown only with billing on and a
 * subscription on the account; the server refuses yearly plans.
 */
export function PausePlan() {
  const toast = useToast();
  const [state, setState] = useState<{ subscribed: boolean; pausedUntil?: string; paymentFailed?: boolean } | null>(null);
  const [months, setMonths] = useState<(typeof MONTHS)[number]>(3);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    try {
      const me = await api.me();
      setState({ subscribed: !!me.subscribed, pausedUntil: me.pausedUntil, paymentFailed: me.paymentFailed });
      void syncPlan(me.plan, me.trialEndsAt);
    } catch {
      /* offline: the card stays hidden */
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  // A failed payment is fixed in Stripe (the banner at the top), not paused.
  if (!state?.subscribed || state.paymentFailed) return null;

  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    try {
      toast(await fn());
      await refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Stripe didn't answer. Try again in a minute.", true);
    } finally {
      setBusy(false);
    }
  };

  if (state.pausedUntil)
    return (
      <div className="field pause-plan">
        <span>Plan paused</span>
        <p className="hint">
          No charges until <strong>{day(state.pausedUntil)}</strong>. You're on Sideline until then, and every play, playbook and Call Sheet is
          still here. Billing starts again on its own that day.
        </p>
        <div className="chip-row">
          <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => run(async () => (await api.resumePlan(), "Welcome back. Your plan is on again."))}>
            Resume my plan now
          </button>
        </div>
      </div>
    );

  return (
    <div className="field pause-plan">
      <span id="pause-h">Season over? Pause instead of cancelling</span>
      <p className="hint">
        Stop paying until next season and keep everything. While paused you're on Sideline; your plan and price come back on their own.
        Monthly plans only.
      </p>
      <div className="chip-row" role="group" aria-labelledby="pause-h">
        {MONTHS.map((m) => (
          <button key={m} type="button" className={`chip${months === m ? " is-on" : ""}`} aria-pressed={months === m} onClick={() => setMonths(m)}>
            {m} {m === 1 ? "month" : "months"}
          </button>
        ))}
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={busy}
          onClick={() => run(async () => `Paused. No charges until ${day((await api.pausePlan(months)).pausedUntil)}.`)}
        >
          Pause for {months} {months === 1 ? "month" : "months"}
        </button>
      </div>
    </div>
  );
}
