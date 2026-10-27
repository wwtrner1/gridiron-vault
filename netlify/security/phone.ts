import { createHash } from "node:crypto";

/**
 * Phone verification through Twilio Verify, so one login is one coach:
 * every account has a verified mobile number, and a sign-in from a new
 * device needs a code sent to it. The credentials live only in secret
 * environment variables; until all three are set, the check is off and
 * the app behaves as before.
 */
// Five, not three: a coach's phone, tablet, laptop, the phone's home-screen app
// (which iOS keeps separate from Safari) and a spare, without bumping each other off.
export const DEVICE_LIMIT = 5;
export const DEVICE_DAYS = 30;

/**
 * Deploy Previews are behind the Netlify team login and each one is a new web
 * address (so every preview looked like a new device and cost a text). The
 * check stays on for the live site. Each deploy runs its own copy of the
 * function, so this is set once per deploy, not per coach.
 */
let previewDeploy = false;
export const noteHost = (host: string) => {
  previewDeploy = /^deploy-preview-\d+--/.test(host);
};
export const SMS_PER_DAY = 8;

// Trimmed: a space or line break pasted along with a key makes Twilio answer
// "invalid username" (seen on Deploy Preview #53).
const env = () => ({
  sid: process.env.TWILIO_ACCOUNT_SID?.trim(),
  token: process.env.TWILIO_AUTH_TOKEN?.trim(),
  service: process.env.TWILIO_VERIFY_SID?.trim(),
});

export const phoneRequired = () => {
  const e = env();
  return !previewDeploy && Boolean(e.sid && e.token && e.service);
};

export class PhoneError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

/** US and Canadian numbers as typed by coaches → E.164 (+15551234567); other countries need the + and code. */
export function normalizePhone(raw: string): string | null {
  const s = raw.trim();
  const digits = s.replace(/\D/g, "");
  if (s.startsWith("+")) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

/** "•••• 4567" — enough for a coach to recognise their number, not enough to read it. */
export const maskPhone = (e164: string) => `•••• ${e164.slice(-4)}`;

export const hashDevice = (id: string) => createHash("sha256").update(id).digest("hex");

async function twilio(path: string, body: Record<string, string>) {
  const { sid, token, service } = env();
  const res = await fetch(`https://verify.twilio.com/v2/Services/${service}/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body),
  });
  const data = (await res.json().catch(() => ({}))) as { status?: string; code?: number; message?: string };
  if (!res.ok) {
    console.error("Twilio Verify", res.status, data.code, data.message);
    // Refusals about our Twilio account (21608: a trial account may only text verified numbers; 20003: bad keys), not the coach's number.
    if (data.code === 21608 || data.code === 20003 || res.status === 401)
      throw new PhoneError("Texting codes is down on our side, so this isn't your number. We're fixing it now: try again later today.", 503);
    if (res.status === 429 || data.code === 60203) throw new PhoneError("Too many codes sent to that number. Wait ten minutes and try again.", 429);
    if (data.code === 60200 || data.code === 21211) throw new PhoneError("That doesn't look like a mobile number. Check it and try again.");
    if (res.status === 404 && path === "VerificationCheck") throw new PhoneError("That code has expired. Send a new one.");
    throw new PhoneError("We couldn't send a code just now. Try again in a minute.", 502);
  }
  return data;
}

export const sendCode = (to: string) => twilio("Verifications", { To: to, Channel: "sms" });

export async function checkCode(to: string, code: string): Promise<boolean> {
  if (!/^\d{4,10}$/.test(code)) return false;
  const data = await twilio("VerificationCheck", { To: to, Code: code });
  return data.status === "approved";
}
