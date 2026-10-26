import { useCallback, useEffect, useRef, useState } from "react";
import { api, SECURITY_EVENT, type Security } from "../lib/api";
import { useAuth } from "../lib/auth";
import { deviceLabel } from "../lib/device";
import { setBilling, syncPlan } from "../lib/tier";

/**
 * One login, one coach. Once phone verification is switched on (the Twilio
 * secrets are set in Netlify), a signed-in coach must have a verified
 * mobile number, and a new device needs the code texted to it. Until then
 * the server reports it as off and this never shows.
 */
export function PhoneGate() {
  const { account, signOut } = useAuth();
  const [sec, setSec] = useState<Security | null>(null);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const first = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    if (!account) return setSec(null);
    try {
      const res = await api.me();
      setSec(res.security ?? null);
      // The one /me call after sign-in also brings the account's plan.
      void syncPlan(res.plan, res.trialEndsAt);
      setBilling(Boolean(res.billing));
    } catch {
      /* the next API call will ask again */
    }
  }, [account]);

  useEffect(() => {
    void refresh();
    window.addEventListener(SECURITY_EVENT, refresh);
    return () => window.removeEventListener(SECURITY_EVENT, refresh);
  }, [refresh]);

  const needsPhone = !!sec?.required && !sec.verified;
  const needsDevice = !!sec?.required && sec.verified && !sec.trusted;
  const open = !!account && (needsPhone || needsDevice);

  useEffect(() => {
    if (open) first.current?.focus();
  }, [open, sentTo]);

  if (!open) return null;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const send = () =>
    run(async () => {
      const res = needsPhone ? await api.phone("start", { phone }) : await api.phone("device-start");
      setSentTo(res.sentTo ?? "");
      setCode("");
    });

  const confirm = () =>
    run(async () => {
      const res = needsPhone
        ? await api.phone("check", { phone, code, label: deviceLabel() })
        : await api.phone("device-check", { code, label: deviceLabel() });
      if (res.security) setSec(res.security);
      setSentTo("");
      setCode("");
      // Reload so every screen fetches with this device confirmed.
      window.location.reload();
    });

  return (
    <div className="pg-backdrop">
      <div
        className="pg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pg-h"
        aria-describedby="pg-p"
        onKeyDown={(e) => {
          // Keep Tab inside the dialog; it can't be dismissed, only completed or signed out of.
          if (e.key !== "Tab") return;
          const items = [...e.currentTarget.querySelectorAll<HTMLElement>("input, button:not([disabled])")];
          const i = items.indexOf(document.activeElement as HTMLElement);
          if (e.shiftKey && i <= 0) (e.preventDefault(), items[items.length - 1]?.focus());
          else if (!e.shiftKey && i === items.length - 1) (e.preventDefault(), items[0]?.focus());
        }}
      >
        <h2 id="pg-h">{needsPhone ? "Add your mobile number" : "Confirm this device"}</h2>
        <p id="pg-p">
          {needsPhone
            ? "Each GridIronVault account belongs to one coach. We'll text a code to your phone, and again when you sign in on a new device."
            : `You're signing in on a new device. We'll text a code to ${sec?.phone ?? "your phone"}.`}
        </p>

        <form
          className="pg-form"
          onSubmit={(e) => {
            e.preventDefault();
            void (sentTo ? confirm() : send());
          }}
        >
          {needsPhone && !sentTo && (
            <label className="field">
              <span>Mobile number</span>
              <input
                ref={first}
                className="input"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="555-123-4567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
            </label>
          )}
          {sentTo && (
            <label className="field">
              <span>Code sent to {sentTo}</span>
              <input
                ref={first}
                className="input pg-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={10}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                required
              />
            </label>
          )}
          {error && (
            <p className="error-line" role="alert">
              {error}
            </p>
          )}
          <div className="pg-acts">
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? "One moment…" : sentTo ? "Confirm" : "Text me a code"}
            </button>
            {sentTo && (
              <button type="button" className="btn btn-ghost" onClick={send} disabled={busy}>
                Send a new code
              </button>
            )}
            <button type="button" className="btn btn-quiet" onClick={() => void signOut()}>
              Sign out
            </button>
          </div>
          <p className="pg-note">
            Message and data rates may apply. You only do this once per device: up to 5 stay confirmed as long as you use
            them at least once a month, and a sixth signs out the one used longest ago. Plays saved in this browser stay here
            while you sign in.
          </p>
        </form>
      </div>
    </div>
  );
}
