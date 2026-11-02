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
  const { account, status } = useAuth();
  const [state, setState] = useState<{ owner: boolean | null; hint?: string }>(
    account ? known.get(account.id) ?? { owner: null } : { owner: null },
  );
  useEffect(() => {
    // Until sign-in has been looked up, we don't know yet: /admin must not bounce the owner on a fresh load.
    if (!account) return setState({ owner: status === "loading" ? null : false });
    const cached = known.get(account.id);
    if (cached) return setState(cached);
    let live = true;
    api
      .me()
      .then((r) => {
        const next = { owner: Boolean(r.owner), hint: r.ownerHint };
        known.set(account.id, next);
        if (live) setState(next);
      })
      // A failed look-up isn't remembered, so the next screen asks again.
      .catch(() => live && setState({ owner: false }));
    return () => {
      live = false;
    };
  }, [account, status]);
  return state;
}

export function useOwner(): boolean | null {
  return useOwnerState().owner;
}
