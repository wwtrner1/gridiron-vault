import { useEffect } from "react";
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
  useEffect(
    () =>
      onStorageFailed(() =>
        toast(
          account
            ? "This browser can't keep more work, so new changes live on your account only until you free up space here."
            : "This browser's storage is full, so new work is gone when you close the tab. Sign in to keep plays on your account, or delete plays you don't need.",
          true,
        ),
      ),
    // The wording follows the sign-in state at the moment it fails.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [toast],
  );
  return null;
}
