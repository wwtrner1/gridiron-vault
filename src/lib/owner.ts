import { useEffect, useState } from "react";
import { api } from "./api";
import { useAuth } from "./auth";

/**
 * Whether the signed-in account is the owner. This only decides what to show:
 * the server checks the owner list again on every /api/admin request.
 * `hint` is the server's reason when an address on the owner list was not accepted.
 */
type OwnerState = { owner: boolean; hint?: string };
const known = new Map<string, OwnerState>();

export function useOwnerState(): { owner: boolean | null; hint?: string } {
  const { account, status, renew } = useAuth();
  const [state, setState] = useState<{ owner: boolean | null; hint?: string }>(
    account ? known.get(account.id) ?? { owner: null } : { owner: null },
  );
  useEffect(() => {
    // Until sign-in has been looked up, we don't know yet: /admin must not bounce the owner on a fresh load.
    if (!account) return setState({ owner: status === "loading" ? null : false });
    const cached = known.get(account.id);
    if (cached) return setState(cached);
    let live = true;
    // The account can answer "nobody signed in" while this page still shows a coach (the sign-in cookie ran out).
    // That isn't a "not the owner": refresh the sign-in and ask once more, and never remember that answer.
    const ask = async () => {
      const r = await api.me();
      if (r.user || !(await renew())) return r;
      return api.me();
    };
    ask()
      .then((r) => {
        const next = { owner: Boolean(r.user && r.owner), hint: r.ownerHint };
        if (r.user) known.set(account.id, next);
        if (live) setState(next);
      })
      // A failed look-up isn't remembered, so the next screen asks again.
      .catch(() => live && setState({ owner: false }));
    return () => {
      live = false;
    };
  }, [account, status, renew]);
  return state;
}

export function useOwner(): boolean | null {
  return useOwnerState().owner;
}
