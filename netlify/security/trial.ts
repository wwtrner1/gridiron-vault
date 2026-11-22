import { createHash } from "node:crypto";

/**
 * The 14-day Head Coach trial, once per person. TRIAL_SIGNUPS=on starts it for
 * new coaches (otherwise new coaches join as Beta Coach, as before). These
 * helpers decide who is the same person: an email with its +tags and Gmail dots
 * removed. Fingerprints go in the trial_claims table. (A phone number was a
 * second key until the sign-in phone code was taken out on 2026-11-22; rows of
 * kind "phone" from before then stay in the table and are no longer read.)
 */
export const trialsOn = () => process.env.TRIAL_SIGNUPS === "on";

const GMAIL = new Set(["gmail.com", "googlemail.com"]);

// Throwaway inboxes people use to open accounts in bulk. Not a complete list: it covers the common ones.
const DISPOSABLE = new Set([
  "mailinator.com", "guerrillamail.com", "guerrillamail.net", "guerrillamail.org", "sharklasers.com", "10minutemail.com",
  "temp-mail.org", "tempmail.com", "yopmail.com", "trashmail.com", "getnada.com", "dispostable.com", "maildrop.cc",
  "throwawaymail.com", "fakeinbox.com", "mailnesia.com", "tempr.email", "mohmal.com", "emailondeck.com",
]);

/** "Coach.Smith+2@googlemail.com" → "coachsmith@gmail.com"; other providers only lose case and +tag. */
export function normalizeEmail(raw: string): string | null {
  const s = raw.trim().toLowerCase();
  const at = s.lastIndexOf("@");
  if (at < 1 || at === s.length - 1) return null;
  let local = s.slice(0, at).split("+")[0];
  let domain = s.slice(at + 1);
  if (GMAIL.has(domain)) {
    domain = "gmail.com";
    local = local.replace(/\./g, "");
  }
  return local ? `${local}@${domain}` : null;
}

export const isDisposable = (email: string) => DISPOSABLE.has(email.trim().toLowerCase().split("@").pop() ?? "");

const fingerprint = (kind: string, value: string) => createHash("sha256").update(`${kind}:${value}`).digest("hex");
export const emailKey = (email: string) => {
  const n = normalizeEmail(email);
  return n ? fingerprint("email", n) : null;
};
