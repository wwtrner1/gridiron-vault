import { useCallback, useEffect } from "react";
import { ACCOUNT_EVENT, api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { setBilling, setPaymentFailed, setSuspended, syncPlan } from "../lib/tier";

/**
 * Asks the account how it stands once a coach is signed in: the plan, whether
 * billing is on, a failed payment, and whether the owner switched the account
 * off. It asks again when a call is refused because the account is switched
 * off. It draws nothing: a signed-in coach goes straight to their plays, with
 * no mobile number or texted code to enter.
 */
export function AccountWatch() {
  const { account } = useAuth();

  const refresh = useCallback(async () => {
    if (!account) return setSuspended(false);
    try {
      const res = await api.me();
      // The one /me call after sign-in also brings the account's plan.
      void syncPlan(res.plan, res.trialEndsAt);
      setBilling(Boolean(res.billing));
      setPaymentFailed(Boolean(res.paymentFailed));
      setSuspended(Boolean(res.suspended));
    } catch {
      /* the next API call will ask again */
    }
  }, [account]);

  useEffect(() => {
    void refresh();
    window.addEventListener(ACCOUNT_EVENT, refresh);
    return () => window.removeEventListener(ACCOUNT_EVENT, refresh);
  }, [refresh]);

  return null;
}
