import { useEffect, useState } from "react";
import { api, type Security } from "../lib/api";
import { useToast } from "../lib/toast";

/**
 * Account page: the verified number and confirmed devices, with a way to
 * sign out every other device (say, after a borrowed laptop). Hidden while
 * phone verification is switched off.
 */
export function DevicesCard() {
  const toast = useToast();
  const [sec, setSec] = useState<Security | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .me()
      .then((r) => setSec(r.security ?? null))
      .catch(() => setSec(null));
  }, []);

  if (!sec?.required || !sec.verified) return null;

  const forget = async () => {
    setBusy(true);
    try {
      const r = await api.phone("forget-others");
      if (r.security) setSec(r.security);
      toast("Every other device is signed out. They'll need a code to get back in.");
    } catch (e) {
      toast(e instanceof Error ? e.message : "That didn't work. Try again.", true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card">
      <h3>Phone and devices</h3>
      <p>
        Codes go to <b>{sec.phone}</b>. {sec.devices} of 5 devices confirmed.
      </p>
      <p className="hint">One account, one coach: a new device needs a code to your phone, and a sixth signs out the one used longest ago.</p>
      <button type="button" className="btn btn-ghost btn-sm" onClick={forget} disabled={busy || sec.devices < 2}>
        Sign out other devices
      </button>
    </section>
  );
}
