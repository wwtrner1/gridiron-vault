import { TIERS, TRIAL_DAYS, type TierId } from "../../src/lib/plan.js";
import { sendNotice } from "../front-office/send.js";
import { ownerEmails } from "../security/owner.js";

/**
 * The new-account email to the owner. `ensureProfile` (netlify/functions/api.ts) calls this once per account, the
 * moment its profile row is first made, so the email says the plan the coach actually got and one account can only
 * ever send one (the insert that makes the row is the only one that sees it as new).
 *
 * It rides the same Resend setup as team messages (docs/team-messaging-setup.md) and is off until that is set up:
 * `RESEND_API_KEY` plus a sender, `SIGNUP_ALERT_FROM` or else `HUB_EMAIL_FROM`. It goes to the owner list
 * (netlify/security/owner.ts) unless `SIGNUP_ALERT_TO` names other addresses, comma-separated, or says `off`.
 * It never throws and gives up after a few seconds, so an email problem can't break a sign-up; `ensureProfile` also
 * hands it to Netlify's `waitUntil`, so the coach's first call doesn't wait for the send.
 */

export type SignupInfo = {
  id: string;
  email: string;
  name: string;
  /** How the account was made, from Identity: "email", "google"… Empty when Identity didn't say. */
  method?: string;
  /** When Identity made the account (it can be days before the first sign-in when the email needed confirming). */
  accountCreatedAt?: string;
  /** The plan the profile row holds right now: trial, free (no trial) or beta (trials switched off). */
  plan: string;
  trialEndsAt?: Date | null;
  /** City, state and country Netlify places the first request in. */
  place?: string;
  at: Date;
};

const env = (k: string) => process.env[k]?.trim() ?? "";

/** Who gets the notice: `SIGNUP_ALERT_TO` when set (`off` silences it), else every address on the owner list. */
export function signupAlertTo(): string[] {
  const set = env("SIGNUP_ALERT_TO");
  if (/^(off|none|no)$/i.test(set)) return [];
  const list = (set ? set.split(/[,;\s]+/) : ownerEmails()).map((e) => e.trim().toLowerCase()).filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
  return [...new Set(list)];
}

const signupAlertFrom = () => env("SIGNUP_ALERT_FROM") || env("HUB_EMAIL_FROM");

/** One line of someone else's text: no line breaks or control characters, so a name can't reshape the email. */
const oneLine = (s: unknown, max = 120) => (typeof s === "string" ? s : "").replace(/[\p{Cc}\p{Zl}\p{Zp}]+/gu, " ").replace(/\s+/g, " ").trim().slice(0, max);

const central = (d: Date) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(d);

const METHODS: Record<string, string> = { email: "email and password", google: "Google", github: "GitHub", gitlab: "GitLab", bitbucket: "Bitbucket" };

function planLine(info: SignupInfo) {
  const tier = TIERS[info.plan as TierId]?.name ?? info.plan;
  if (info.plan === "trial") return `${TRIAL_DAYS}-day ${tier.replace(/ trial$/i, "")} trial${info.trialEndsAt ? `, ends ${central(info.trialEndsAt)}` : ""}`;
  if (info.plan === "free") return `${tier}, no trial (this email has had one before, or it is a throwaway address)`;
  if (info.plan === "beta") return `${tier} (free trials are switched off)`;
  return tier;
}

export function composeSignupAlert(info: SignupInfo): { subject: string; text: string } {
  const name = oneLine(info.name, 60);
  const email = oneLine(info.email, 120);
  const created = info.accountCreatedAt && !Number.isNaN(Date.parse(info.accountCreatedAt)) ? new Date(info.accountCreatedAt) : null;
  const lines = [
    "A new coach just joined GridIronVault.",
    "",
    `Name:       ${name || "(none given)"}`,
    `Email:      ${email}`,
    `Plan:       ${planLine(info)}`,
    `Signed up:  ${METHODS[info.method ?? ""] ?? (oneLine(info.method ?? "", 30) || "not known")}`,
    `From:       ${oneLine(info.place ?? "", 80) || "not known"}`,
    `When:       ${central(info.at)} (${info.at.toISOString()})`,
  ];
  // Only worth a line when the sign-up and the first sign-in are far apart (an unconfirmed email, an older account).
  if (created && info.at.getTime() - created.getTime() > 6 * 3_600_000) lines.push(`Account made: ${central(created)}`);
  lines.push("", "Owner console: https://gridiron-vault.com/admin", "", "You get this because your address is on the owner list (or SIGNUP_ALERT_TO). It is sent once per account.");
  return { subject: `New GridIronVault coach: ${name || email}`, text: lines.join("\n") };
}

const told = new Set<string>();
/** A setup mistake worth a line in the function log, once per running copy of the function. */
function warnOnce(message: string) {
  if (told.has(message)) return;
  told.add(message);
  console.warn(message);
}

/**
 * Emails the owner that this account is new. Safe to call without checking anything first: it answers "off" when
 * email or the recipient list isn't set up, "failed" when the send didn't go, and never throws.
 */
export async function notifySignup(info: SignupInfo): Promise<"sent" | "off" | "failed"> {
  try {
    const to = signupAlertTo();
    if (!to.length) {
      const set = env("SIGNUP_ALERT_TO");
      if (set && !/^(off|none|no)$/i.test(set)) warnOnce("New-signup email is off: SIGNUP_ALERT_TO has no valid email address.");
      return "off";
    }
    const from = signupAlertFrom();
    if (!from || !env("RESEND_API_KEY")) {
      warnOnce("New-signup email is off: set RESEND_API_KEY and HUB_EMAIL_FROM (or SIGNUP_ALERT_FROM) in Netlify.");
      return "off";
    }
    const { subject, text } = composeSignupAlert(info);
    return await sendNotice({ from, to, subject, text, idempotencyKey: `signup-${info.id}` });
  } catch (e) {
    console.error("signup alert", e instanceof Error ? e.message : e);
    return "failed";
  }
}
