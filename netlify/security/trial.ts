import { createHash } from "node:crypto";

/**
 * The 14-day Head Coach trial, once per person. TRIAL_SIGNUPS=on starts it for
 * new coaches (otherwise new coaches join as Beta Coach, as before). These
 * helpers decide who is the same person: an email with its +tags and Gmail dots
 * removed, and a phone number. Fingerprints go in the trial_claims table.
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
export const phoneKey = (e164: string) => fingerprint("phone", e164);

/**
 * True when Twilio says the number is internet-only (the kind anyone can make
 * unlimited). Asks Twilio Lookup, which is billed per call, once per new
 * number. Fails open: any error, or no Twilio credentials, means "not VoIP",
 * so a Lookup outage never costs a coach their trial. Set TRIAL_BLOCK_VOIP=off to skip it.
 */
export async function isInternetNumber(e164: string): Promise<boolean> {
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!sid || !token || process.env.TRIAL_BLOCK_VOIP === "off") return false;
  try {
    const res = await fetch(`https://lookups.twilio.com/v2/PhoneNumbers/${encodeURIComponent(e164)}?Fields=line_type_intelligence`, {
      headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}` },
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { line_type_intelligence?: { type?: string } | null };
    return data.line_type_intelligence?.type === "nonFixedVoip";
  } catch {
    return false;
  }
}
