import { useState } from "react";
import { goToBilling, usePaymentFailed, useSuspended } from "../lib/tier";
import { SUPPORT_EMAIL } from "../lib/site";
import { useToast } from "../lib/toast";

/**
 * Stripe couldn't take the last payment. The coach is on Sideline until it
 * goes through (nothing is deleted), so say so on every page and send them
 * straight to Stripe's portal to fix the card.
 */
export function PaymentBanner() {
  const failed = usePaymentFailed();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (!failed) return null;

  const fix = async () => {
    setBusy(true);
    try {
      await goToBilling();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Stripe didn't answer. Try again in a minute.", true);
      setBusy(false);
    }
  };

  return (
    <div className="pay-banner" role="status">
      <p>
        <strong>Your last payment didn't go through.</strong> You're on Sideline until it does, and every play is still here. Update your
        card and your plan comes straight back.
      </p>
      <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={fix}>
        {busy ? "Opening Stripe…" : "Update card"}
      </button>
    </div>
  );
}

/** The owner switched this account off: say so on every page, and that the plays in this browser are still here. */
export function SuspendedBanner() {
  const off = useSuspended();
  if (!off) return null;
  return (
    <div className="pay-banner" role="status">
      <p>
        <strong>This account is switched off.</strong> Saving to your account, syncing and Griddy are paused. Plays in this browser are
        still here. Write to <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> if you think that's a mistake.
      </p>
    </div>
  );
}
