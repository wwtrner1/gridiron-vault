import { normalizePhone } from "../security/phone.js";

/**
 * Email and text delivery for team announcements. Both are off until the site
 * owner sets them up (docs/team-messaging-setup.md); until then the browser
 * hands the coach their own email app and the numbers to text instead.
 *
 * Email: Resend (`RESEND_API_KEY`, `HUB_EMAIL_FROM`). Texts: Twilio's
 * Messaging API with the site's Twilio account (`TWILIO_ACCOUNT_SID`,
 * `TWILIO_AUTH_TOKEN`), switched on
 * with `TEAM_SMS=on` plus `TWILIO_MESSAGING_SID` (a Messaging Service, which
 * handles STOP replies) or `TWILIO_FROM` (a number).
 */

const env = (k: string) => process.env[k]?.trim() ?? "";

export const emailOn = () => Boolean(env("RESEND_API_KEY") && env("HUB_EMAIL_FROM"));
export const smsOn = () =>
  env("TEAM_SMS") === "on" && Boolean(env("TWILIO_ACCOUNT_SID") && env("TWILIO_AUTH_TOKEN") && (env("TWILIO_MESSAGING_SID") || env("TWILIO_FROM")));

/** Resend takes up to 50 recipients on one email; families go in Bcc so nobody sees another family's address. */
const EMAIL_BATCH = 49;

/** Sends one announcement by email. Returns how many addresses it reached. */
export async function sendEmails(to: string[], subject: string, text: string, replyTo: string): Promise<number> {
  let sent = 0;
  for (let i = 0; i < to.length; i += EMAIL_BATCH) {
    const bcc = to.slice(i, i + EMAIL_BATCH);
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env("RESEND_API_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env("HUB_EMAIL_FROM"), to: [env("HUB_EMAIL_FROM").replace(/^.*</, "").replace(/>.*$/, "")], bcc, subject, text, reply_to: replyTo || undefined }),
    });
    if (!res.ok) {
      console.error("Resend", res.status, await res.text().catch(() => ""));
      break;
    }
    sent += bcc.length;
  }
  return sent;
}

/**
 * One plain-text email to the people who run the site (the new-signup notice). Unlike `sendEmails` the recipients
 * are the `to` line, because the owner should see who else got it. It never throws and never waits long: it answers
 * "off" when email isn't set up, "failed" when Resend refuses, can't be reached or is slow, so a notice can never
 * break the request that caused it. `idempotencyKey` makes Resend itself drop a repeat of the same notice.
 */
export async function sendNotice(opts: { from: string; to: string[]; subject: string; text: string; idempotencyKey?: string; timeoutMs?: number }): Promise<"sent" | "off" | "failed"> {
  const key = env("RESEND_API_KEY");
  if (!key || !opts.from || !opts.to.length) return "off";
  // A plain timer rather than AbortSignal.timeout: it is cleared the moment the answer comes, and it holds the function
  // open until it fires, so a Resend that never answers is cut off here instead of hanging the request.
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(new Error("Resend took too long")), opts.timeoutMs ?? 4000);
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        ...(opts.idempotencyKey ? { "Idempotency-Key": opts.idempotencyKey } : {}),
      },
      body: JSON.stringify({ from: opts.from, to: opts.to, subject: opts.subject, text: opts.text }),
      signal: stop.signal,
    });
    if (!res.ok) {
      console.error("Resend notice", res.status, await res.text().catch(() => ""));
      return "failed";
    }
    return "sent";
  } catch (e) {
    console.error("Resend notice", e instanceof Error ? e.message : e);
    return "failed";
  } finally {
    clearTimeout(timer);
  }
}

/** Texts one announcement to each number. Returns how many went out. */
export async function sendTexts(numbers: string[], body: string): Promise<number> {
  const sid = env("TWILIO_ACCOUNT_SID");
  const auth = `Basic ${Buffer.from(`${sid}:${env("TWILIO_AUTH_TOKEN")}`).toString("base64")}`;
  const sender: Record<string, string> = env("TWILIO_MESSAGING_SID") ? { MessagingServiceSid: env("TWILIO_MESSAGING_SID") } : { From: env("TWILIO_FROM") };
  const list = [...new Set(numbers.map(normalizePhone).filter((n): n is string => Boolean(n)))];
  let sent = 0;
  // Ten at a time, so a full roster goes out well inside the function's time limit.
  for (let i = 0; i < list.length; i += 10) {
    const done = await Promise.all(
      list.slice(i, i + 10).map(async (To) => {
        const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
          method: "POST",
          headers: { Authorization: auth, "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ ...sender, To, Body: body }),
        });
        if (!res.ok) console.error("Twilio Messages", res.status, await res.text().catch(() => ""));
        return res.ok;
      }),
    );
    sent += done.filter(Boolean).length;
  }
  return sent;
}
