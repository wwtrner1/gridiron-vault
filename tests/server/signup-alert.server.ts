/**
 * The new-account email to the owner (netlify/admin/signupAlert.ts, sent from `ensureProfile` the moment a coach's
 * profile is first made). Through the real API function with Resend faked at the fetch level: one email per account
 * however many calls arrive at once, the plan the coach actually got, the owner's own sign-in and other people's
 * mail settings never mattering, and a Resend that refuses, drops the connection or hangs never failing or holding
 * up the sign-up.
 *
 *   npm run test:server
 */
import assert from "node:assert/strict";
import { after, before, beforeEach, describe, test } from "node:test";
import { randomUUID } from "node:crypto";

process.env.TRIAL_SIGNUPS = "on";
delete process.env.STRIPE_SECRET_KEY;
const OWNER = "owner.console@example.com";
process.env.OWNER_EMAILS = OWNER;
const WES = "alerts.to.me@example.com";

const { migrate, client } = await import("./fake-db.ts");
const { signInAs } = await import("./fake-identity.ts");
const { default: api } = await import("../../netlify/functions/api.ts");
const { composeSignupAlert, signupAlertTo } = await import("../../netlify/admin/signupAlert.ts");

type Sent = { url: string; headers: Record<string, string>; body: { from: string; to: string[]; subject: string; text: string } };
let sent: Sent[] = [];
/** What the fake Resend does with the next sends: answer, refuse, drop the connection or never answer. */
let resend: "ok" | "refuse" | "drop" | "hang" = "ok";
const realFetch = globalThis.fetch;

async function call(path: string, opts: { geo?: Record<string, unknown>; waitUntil?: (work: Promise<unknown>) => void; method?: string; body?: unknown } = {}) {
  const res = await api(
    new Request(`https://gridiron-vault.com/api/${path}`, {
      method: opts.method ?? "GET",
      headers: { "Content-Type": "application/json", "X-Device": "device-one-0001" },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    }),
    { geo: opts.geo, ip: "203.0.113.9", waitUntil: opts.waitUntil } as never,
  );
  return { status: res.status, data: (await res.json().catch(() => null)) as any };
}

/** Everything the function logs with console.warn while `run` goes: the setup mistakes it names once. */
async function warnings(run: () => Promise<void>) {
  const lines: string[] = [];
  const real = console.warn;
  console.warn = (...a: unknown[]) => void lines.push(a.join(" "));
  try {
    await run();
  } finally {
    console.warn = real;
  }
  return lines;
}

/** A new signed-in coach; the first /api/me makes the profile, as the app's first call does. */
async function newCoach(over: { email?: string; name?: string; provider?: string; createdAt?: string; userMetadata?: Record<string, unknown> } = {}) {
  const id = randomUUID();
  const email = over.email ?? `${id.slice(0, 8)}@example.com`;
  signInAs({ id, email, name: over.name ?? "Jane Coach", provider: over.provider, createdAt: over.createdAt, userMetadata: over.userMetadata });
  return { id, email };
}

before(async () => {
  await migrate();
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.startsWith("https://api.resend.com/")) return realFetch(input, init);
    sent.push({ url, headers: Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>)), body: JSON.parse(String(init?.body ?? "{}")) });
    if (resend === "refuse") return new Response('{"message":"domain not verified"}', { status: 403 });
    if (resend === "drop") throw new TypeError("fetch failed");
    if (resend === "hang") {
      return new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal!.reason ?? new Error("aborted"))));
    }
    return new Response('{"id":"em_1"}', { status: 200 });
  }) as typeof fetch;
});

beforeEach(() => {
  sent = [];
  resend = "ok";
  process.env.TRIAL_SIGNUPS = "on";
  process.env.RESEND_API_KEY = "re_test_key";
  process.env.HUB_EMAIL_FROM = "GridIronVault <team@example.com>";
  process.env.SIGNUP_ALERT_TO = WES;
  delete process.env.SIGNUP_ALERT_FROM;
});

after(async () => {
  globalThis.fetch = realFetch;
  for (const k of ["TRIAL_SIGNUPS", "OWNER_EMAILS", "RESEND_API_KEY", "HUB_EMAIL_FROM", "SIGNUP_ALERT_TO", "SIGNUP_ALERT_FROM"]) delete process.env[k];
  await client.close();
});

describe("New-signup email to the owner", () => {
  test("a new coach's first call sends one email with who, plan, method and place", async () => {
    const { id, email } = await newCoach({ name: "Jane Coach", provider: "google", createdAt: new Date().toISOString() });
    const me = await call("me", { geo: { city: "Nashville", subdivision: { code: "TN" }, country: { code: "US" } } });
    assert.equal(me.status, 200);
    assert.equal(me.data.plan, "trial");

    assert.equal(sent.length, 1);
    const [mail] = sent;
    assert.equal(mail.url, "https://api.resend.com/emails");
    assert.equal(mail.headers.Authorization, "Bearer re_test_key");
    assert.equal(mail.headers["Idempotency-Key"], `signup-${id}`);
    assert.equal(mail.body.from, "GridIronVault <team@example.com>");
    assert.deepEqual(mail.body.to, [WES]);
    assert.equal(mail.body.subject, "New GridIronVault coach: Jane Coach");
    assert.match(mail.body.text, /Name:\s+Jane Coach/);
    assert.ok(mail.body.text.includes(`Email:      ${email}`));
    assert.match(mail.body.text, /Plan:\s+14-day Head Coach trial, ends /);
    assert.match(mail.body.text, /Signed up:\s+Google/);
    assert.match(mail.body.text, /From:\s+Nashville, TN, US/);
    assert.match(mail.body.text, /https:\/\/gridiron-vault\.com\/admin/);
    // The account and the first sign-in are minutes apart, so there is no "Account made" line.
    assert.doesNotMatch(mail.body.text, /Account made/);
  });

  test("the same coach calling again, on any route, never sends a second email", async () => {
    await newCoach();
    await call("me");
    await call("me");
    await call("plays");
    await call("playbooks");
    assert.equal(sent.length, 1);
  });

  test("a burst of first calls at once still sends one email", async () => {
    await newCoach();
    const results = await Promise.all([call("me"), call("me"), call("plays"), call("playbooks"), call("me")]);
    assert.ok(results.every((r) => r.status === 200));
    assert.equal(sent.length, 1);
  });

  test("two different new coaches send two emails", async () => {
    await newCoach();
    await call("me");
    await newCoach();
    await call("me");
    assert.equal(sent.length, 2);
    assert.notEqual(sent[0].headers["Idempotency-Key"], sent[1].headers["Idempotency-Key"]);
  });

  test("an account Identity made days ago says so", async () => {
    await newCoach({ createdAt: new Date(Date.now() - 3 * 86_400_000).toISOString() });
    await call("me");
    assert.match(sent[0].body.text, /Account made:/);
  });

  test("the owner signing in for the first time sends nothing", async () => {
    signInAs({ id: randomUUID(), email: OWNER, name: "Owner" });
    const me = await call("me");
    assert.equal(me.status, 200);
    assert.equal(me.data.owner, true);
    assert.equal(sent.length, 0);
  });

  test("the plan in the email is the one the coach got: no trial for an email that already had one, Beta with trials off", async () => {
    // A throwaway inbox never gets the trial, so the email says Sideline and why.
    await newCoach({ email: `${randomUUID().slice(0, 8)}@mailinator.com` });
    await call("me");
    assert.match(sent[0].body.text, /Plan:\s+Sideline, no trial/);

    sent = [];
    delete process.env.TRIAL_SIGNUPS;
    await newCoach();
    await call("me");
    assert.match(sent[0].body.text, /Plan:\s+Beta Coach \(free trials are switched off\)/);
  });

  test("goes to the owner list when SIGNUP_ALERT_TO is not set, and SIGNUP_ALERT_FROM overrides the sender", async () => {
    delete process.env.SIGNUP_ALERT_TO;
    process.env.SIGNUP_ALERT_FROM = "GridIronVault <alerts@example.com>";
    await newCoach();
    await call("me");
    assert.equal(sent.length, 1);
    assert.equal(sent[0].body.from, "GridIronVault <alerts@example.com>");
    assert.ok(sent[0].body.to.includes(OWNER));
    assert.ok(sent[0].body.to.includes("wwtrner1@gmail.com"), "the owner list's built-in address is on it");
  });

  test("off until Resend is set up, and off when SIGNUP_ALERT_TO says off: the sign-up is untouched", async () => {
    delete process.env.RESEND_API_KEY;
    await newCoach();
    const lines = await warnings(async () => {
      assert.equal((await call("me")).status, 200);
      await newCoach();
      assert.equal((await call("me")).status, 200);
    });
    assert.equal(sent.length, 0);
    // The function log says what to set, once, however many coaches join before it is fixed.
    assert.deepEqual(lines, ["New-signup email is off: set RESEND_API_KEY and HUB_EMAIL_FROM (or SIGNUP_ALERT_FROM) in Netlify."]);

    process.env.RESEND_API_KEY = "re_test_key";
    delete process.env.HUB_EMAIL_FROM;
    await newCoach();
    assert.equal((await call("me")).status, 200);
    assert.equal(sent.length, 0);

    process.env.HUB_EMAIL_FROM = "GridIronVault <team@example.com>";
    process.env.SIGNUP_ALERT_TO = "off";
    await newCoach();
    assert.equal((await call("me")).status, 200);
    assert.equal(sent.length, 0);
  });

  test("a SIGNUP_ALERT_TO with no valid address sends nothing and says so once in the log", async () => {
    process.env.SIGNUP_ALERT_TO = "me-at-example-dot-com";
    const lines = await warnings(async () => {
      await newCoach();
      assert.equal((await call("me")).status, 200);
      await newCoach();
      assert.equal((await call("me")).status, 200);
    });
    assert.equal(sent.length, 0);
    assert.deepEqual(lines, ["New-signup email is off: SIGNUP_ALERT_TO has no valid email address."]);
  });

  test("a deleted account whose sign-in is still good is not announced as a new coach", async () => {
    const { email } = await newCoach();
    assert.equal((await call("me")).status, 200);
    assert.equal(sent.length, 1);
    const del = await call("me", { method: "DELETE", body: { confirm: email } });
    assert.equal(del.status, 200);
    // A second device still holding the old token: the next call makes the profile row again, but it is no new coach.
    const again = await call("me");
    assert.equal(again.status, 200);
    assert.equal(sent.length, 1, "no second email for the same person");
  });

  test("a sign-up whose name isn't text still joins and is announced under the email's first part", async () => {
    const { email } = await newCoach({ name: "", userMetadata: { full_name: 12345 } });
    const me = await call("me");
    assert.equal(me.status, 200);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].body.subject, `New GridIronVault coach: ${email.split("@")[0]}`);
  });

  test("the email still goes when the trial step fails, and the call fails as it always did", async () => {
    await newCoach();
    await client.exec("alter table trial_claims rename to trial_claims_off");
    let status = 0;
    try {
      status = (await call("me")).status;
    } finally {
      await client.exec("alter table trial_claims_off rename to trial_claims");
    }
    assert.equal(status, 500, "an unchanged failure of the existing trial step");
    assert.equal(sent.length, 1);
    assert.match(sent[0].body.text, /Plan:\s+Sideline, no trial/);
  });

  test("with Netlify's waitUntil the answer doesn't wait for Resend, and the send still finishes", async () => {
    resend = "hang";
    await newCoach();
    const deferred: Promise<unknown>[] = [];
    const started = Date.now();
    const me = await call("me", { waitUntil: (work) => void deferred.push(work) });
    const took = Date.now() - started;
    assert.equal(me.status, 200);
    assert.equal(me.data.plan, "trial");
    assert.ok(took < 2000, `answered in ${took} ms while Resend hung`);
    assert.equal(deferred.length, 1, "handed to waitUntil once");
    assert.equal(sent.length, 1, "the send was started");
    // The hung send is cut off by its own timer, and the deferred work ends without rejecting.
    await Promise.all(deferred);
  });

  test("a Resend that refuses or drops the connection never fails the sign-up, and the coach keeps the account and trial", async () => {
    for (const mode of ["refuse", "drop"] as const) {
      resend = mode;
      sent = [];
      const { id } = await newCoach();
      const me = await call("me");
      assert.equal(me.status, 200, mode);
      assert.equal(me.data.user.name, "Jane Coach");
      assert.equal(me.data.plan, "trial");
      assert.equal(sent.length, 1, `${mode}: it tried once`);
      // The next call is an ordinary one: no retry, no second email, still signed in with the same account.
      assert.equal((await call("me")).status, 200);
      assert.equal(sent.length, 1, `${mode}: not sent again`);
      assert.ok(id);
    }
  });

  test("a Resend that never answers is given up on after a few seconds and the sign-up still works", async () => {
    resend = "hang";
    await newCoach();
    const started = Date.now();
    const me = await call("me");
    const took = Date.now() - started;
    assert.equal(me.status, 200);
    assert.equal(me.data.plan, "trial");
    assert.ok(took >= 3500 && took < 8000, `gave up after ${took} ms`);
  });
});

describe("The email's words", () => {
  const at = new Date("2026-11-25T07:40:00Z");

  test("a name can't add lines or headers to the subject or the details", () => {
    const { subject, text } = composeSignupAlert({
      id: "u1",
      email: "evil@example.com\r\nBcc: someone@else.com",
      name: "Jane\r\nPlan:       free for life" + String.fromCharCode(0x2028) + "Admin: yes",
      plan: "trial",
      at,
    });
    assert.ok(!/[\r\n]/.test(subject), "one-line subject");
    const lines = text.split("\n");
    assert.equal(lines.filter((l) => l.startsWith("Plan:")).length, 1, "only the real Plan line");
    assert.equal(lines.filter((l) => l.startsWith("Name:")).length, 1);
    assert.ok(!text.includes("\r"));
  });

  test("a missing name, method and place read as not known, and times are shown in Central with the UTC time beside them", () => {
    const { subject, text } = composeSignupAlert({ id: "u2", email: "x@example.com", name: "", plan: "beta", at });
    assert.equal(subject, "New GridIronVault coach: x@example.com");
    assert.match(text, /Name:\s+\(none given\)/);
    assert.match(text, /Signed up:\s+not known/);
    assert.match(text, /From:\s+not known/);
    assert.match(text, /When:\s+Nov 25, 2026, 1:40 AM CST \(2026-11-25T07:40:00\.000Z\)/);
  });

  test("recipients: SIGNUP_ALERT_TO split on commas, spaces and semicolons, bad entries dropped, repeats folded", () => {
    process.env.SIGNUP_ALERT_TO = "A@example.com, b@example.com; not-an-address  a@example.com";
    assert.deepEqual(signupAlertTo(), ["a@example.com", "b@example.com"]);
    process.env.SIGNUP_ALERT_TO = "OFF";
    assert.deepEqual(signupAlertTo(), []);
  });
});
