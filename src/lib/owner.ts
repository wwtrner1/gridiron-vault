import { useEffect, useState } from "react";
import { api } from "./api";
import { useAuth } from "./auth";

/**
 * Whether the signed-in account is the owner. This only decides what to show:
 * the server checks the owner list again on every /api/admin request.
 */
const known = new Map<string, boolean>();

export function useOwner(): boolean | null {
  const { account } = useAuth();
  const [owner, setOwner] = useState<boolean | null>(account ? known.get(account.id) ?? null : false);
  useEffect(() => {
    if (!account) return setOwner(false);
    const cached = known.get(account.id);
    if (cached !== undefined) return setOwner(cached);
    let live = true;
    api
      .me()
      .then((r) => {
        known.set(account.id, Boolean(r.owner));
        if (live) setOwner(Boolean(r.owner));
      })
      .catch(() => live && setOwner(false));
    return () => {
      live = false;
    };
  }, [account]);
  return owner;
}
