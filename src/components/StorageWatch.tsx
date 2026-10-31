import { useEffect, useRef } from "react";
import { useAuth } from "../lib/auth";
import { onStorageFailed } from "../lib/store";
import { useToast } from "../lib/toast";

/**
 * Mounted once in App. When this browser refuses to keep the workspace
 * (storage full, or a private window that blocks it), say so once per visit
 * instead of letting new plays vanish with the tab.
 */
export function StorageWatch() {
  const toast = useToast();
  const { account } = useAuth();
  // The wording follows the sign-in state at the moment it fails, read through a ref so the one listener never keeps the state from mount (signed out, before Identity has answered).
  const signedIn = useRef(!!account);
  signedIn.current = !!account;
  useEffect(
    () =>
      onStorageFailed(() =>
        toast(
          signedIn.current
            ? "This browser can't keep more work, so new changes live on your account only until you free up space here."
            : "This browser's storage is full, so new work is gone when you close the tab. Sign in to keep plays on your account, or delete plays you don't need.",
          true,
        ),
      ),
    [toast],
  );
  return null;
}
