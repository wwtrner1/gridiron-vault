/**
 * Text the team from GridIronVault's number (netlify/front-office/myTeamTexts.ts): a coach's own team gets a sign-up
 * link, families sign up on `/join/:token` themselves, one send reaches only them and records every family's status
 * (a STOP reply takes that number off the list), a recheck asks Twilio again, and nothing goes out while TEAM_SMS is
 * off, a template fill-in is still open, or the same words were just sent. Sideline gets none of it (403
 * plan_required). Twilio is answered at the fetch level.
 *
 *   npm run test:server
 */
import assert from "node:assert/strict";
import { after, before, beforeEach, describe, test } from "node:test";
import { randomUUID } from "node:crypto";

delete process.env.TRIAL_SIGNUPS;
delete process.env.RESEND_API_KEY;

const { migrate, client } = await import("./fake-db.ts");
const { signInAs } = await import("./fake-identity.ts");
const signOut = () => signInAs(null);
const { default: api } = await import("../../netlify/functions/api.ts");

const realFetch = globalThis.fetch;
type Sent = { to: string; body: string };
let sent: Sent[] = [];
/** What Twilio answers for a number: a refusal code (21610 = replied STOP) or the queued message. */
let refuse: Record<string, number> = {};
let later: Record<string, { status: string; error_code: number | null }> = {};

async function call(method: string, path: string, body?: unknown) {
  const res = await api(new Request(`https://gridiron-vault.com/api/${path}`, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }));
  const text = await res.text();
  return { status: res.status, data: text ? JSON.parse(text) : null };
}

const smsOn = () => Object.assign(process.env, { TEAM_SMS: "on", TWILIO_ACCOUNT_SID: "AC_test", TWILIO_AUTH_TOKEN: "secret", TWILIO_MESSAGING_SID: "MG_test" });
const smsOff = () => delete process.env.TEAM_SMS;

before(async () => {
  await migrate();
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.startsWith("https://api.twilio.com/")) return realFetch(input, init);
    const one = url.match(/Messages\/(SM[0-9a-f]{32})\.json$/);
    if (one) return Response.json({ sid: one[1], ...(later[one[1]] ?? { status: "sent", error_code: null }) });
    const form = new URLSearchParams(String(init?.body ?? ""));
    const to = form.get("To") ?? "";
    assert.equal(form.get("MessagingServiceSid"), "MG_test");
    if (refuse[to]) return Response.json({ code: refuse[to], message: "refused" }, { status: 400 });
    sent.push({ to, body: form.get("Body") ?? "" });
    return Response.json({ sid: `SM${randomUUID().replace(/-/g, "")}`, status: "queued", error_code: null }, { status: 201 });
  }) as typeof fetch;
});
after(() => {
  globalThis.fetch = realFetch;
  smsOff();
});
beforeEach(() => {
  sent = [];
  refuse = {};
  later = {};
});

async function coachWithTeam(name = "Coach Kim", plan = "solo") {
  const coach = { id: randomUUID(), email: `${randomUUID().slice(0, 8)}@example.com`, name };
  signInAs(coach);
  await call("GET", "me");
  await client.query("update profiles set plan = $1 where id = $2", [plan, coach.id]);
  const team = { id: "my-team", name: "Lady Vipers", level: "", season: "", players: [], charts: [], updatedAt: "2026-11-01T00:00:00.000Z" };
  assert.equal((await call("PUT", "my-team", { teams: { teams: [team], updatedAt: team.updatedAt } })).status, 200);
  return coach;
}

async function signUp(token: string, name: string, player: string, phone: string) {
  return call("POST", `join/${token}`, { name, player, phone, consent: true });
}

describe("Text the team from GridIronVault", () => {
  test("only families who signed up on the link get the one-tap text, each with its status", async () => {
    smsOn();
    const coach = await coachWithTeam();
    const first = await call("GET", "my-team/my-team/texts");
    assert.equal(first.status, 200);
    assert.equal(first.data.sms, true);
    assert.deepEqual(first.data.signups, []);
    const token = first.data.token as string;
    assert.match(token, /^[A-Za-z0-9_-]{16,40}$/);

    // The public page names the coach's team; families sign up there, not the coach.
    signOut();
    assert.deepEqual((await call("GET", `join/${token}`)).data, { team: "Lady Vipers", org: "" });
    assert.equal((await signUp(token, "Dana Ruiz", "Mia", "(615) 555-0101")).status, 201);
    assert.equal((await signUp(token, "Lee Park", "Ava", "615-555-0102")).status, 201);
    assert.equal((await signUp(token, "Zoe Kim", "", "6155550103")).status, 201);
    assert.equal((await call("POST", `join/${token}`, { name: "No Box", phone: "6155550199" })).status, 400);
    assert.equal(sent.length, 3, "each sign-up gets its confirmation text");
    assert.ok(sent.every((s) => s.body.startsWith("GridIronVault: You're signed up for Lady Vipers team texts.")));
    sent = [];

    signInAs(coach);
    const list = await call("GET", "my-team/my-team/texts");
    assert.equal(list.data.signups.length, 3);

    // A template's fill-in holds the send back; typed brackets around a value come off.
    assert.equal((await call("POST", "my-team/my-team/texts", { body: "Practice at [TIME] today." })).status, 400);
    assert.equal(sent.length, 0);

    refuse["+16155550103"] = 21610; // Zoe replied STOP to an earlier text
    const res = await call("POST", "my-team/my-team/texts", { body: "Practice moved to [5pm] at the stadium.", audience: "all" });
    assert.equal(res.status, 201);
    assert.deepEqual(sent.map((s) => s.to).sort(), ["+16155550101", "+16155550102"]);
    assert.equal(sent[0].body, "GridIronVault - Lady Vipers: Practice moved to 5pm at the stadium. — Coach Kim\nReply STOP to opt out.");
    const recips = res.data.text.recipients as { name: string; status: string; code: number | null; sid: string }[];
    assert.deepEqual(recips.map((r) => [r.name, r.status]).sort(), [["Dana Ruiz", "queued"], ["Lee Park", "queued"], ["Zoe Kim", "stopped"]]);
    assert.equal(res.data.signups.length, 2, "the STOP number came off the list");
    assert.equal(res.data.texts.length, 1);
    assert.equal(res.data.sentToday, 3);

    // Pressing Send twice doesn't text everyone twice.
    sent = [];
    assert.equal((await call("POST", "my-team/my-team/texts", { body: "Practice moved to [5pm] at the stadium." })).status, 409);
    assert.equal(sent.length, 0);

    // A recheck keeps what Twilio says now; a settled one isn't asked about again.
    const dana = recips.find((r) => r.name === "Dana Ruiz")!;
    const lee = recips.find((r) => r.name === "Lee Park")!;
    later[dana.sid] = { status: "delivered", error_code: null };
    later[lee.sid] = { status: "undelivered", error_code: 30006 };
    const again = await call("GET", `my-team/my-team/texts/${res.data.text.id}`);
    assert.deepEqual(
      again.data.text.recipients.map((r: { name: string; status: string; code: number | null }) => [r.name, r.status, r.code]).sort(),
      [["Dana Ruiz", "delivered", null], ["Lee Park", "undelivered", 30006], ["Zoe Kim", "stopped", 21610]],
    );

    // Audience: a blank player name is a player signing up for themselves.
    sent = [];
    await call("POST", "my-team/my-team/texts", { body: "Parents only: bring the forms.", audience: "players" }).then((r) => assert.equal(r.status, 400));
    await call("POST", "my-team/my-team/texts", { body: "Parents only: bring the forms.", audience: "families" }).then((r) => assert.equal(r.status, 201));
    assert.equal(sent.length, 2);
  });

  test("a Sideline coach gets no link, list, send or history", async () => {
    smsOn();
    await coachWithTeam("Free Coach", "free");
    for (const [method, path, body] of [
      ["GET", "my-team/my-team/texts"],
      ["POST", "my-team/my-team/texts", { body: "Practice is on." }],
      ["POST", "my-team/my-team/link"],
      ["GET", "my-team/my-team/texts/11111111-1111-4111-8111-111111111111"],
    ] as [string, string, unknown?][]) {
      const res = await call(method, path, body);
      assert.equal(res.status, 403, `${method} ${path}`);
      assert.equal(res.data.code, "plan_required");
    }
    assert.equal(sent.length, 0);
  });

  test("a Beta Coach gets no texting either", async () => {
    smsOn();
    await coachWithTeam("Beta Coach", "beta");
    const res = await call("GET", "my-team/my-team/texts");
    assert.equal(res.status, 403);
    assert.equal(res.data.code, "plan_required");
  });

  test("the Head Coach trial can send", async () => {
    smsOn();
    const coach = await coachWithTeam("Trial Coach", "trial");
    await client.query("update profiles set trial_ends_at = now() + interval '7 days' where id = $1", [coach.id]);
    assert.equal((await call("GET", "my-team/my-team/texts")).status, 200);
  });

  test("with texting switched off the link and list still work, and nothing is sent", async () => {
    smsOff();
    await coachWithTeam();
    const state = await call("GET", "my-team/my-team/texts");
    assert.equal(state.data.sms, false);
    signOut();
    assert.equal((await signUp(state.data.token, "Dana Ruiz", "Mia", "6155550101")).status, 201);
    assert.equal(sent.length, 0, "no confirmation text while sending is off");
    const res = await call("POST", `join/${state.data.token}`, {});
    assert.equal(res.status, 400);
  });

  test("a coach sees only their own team's list, a new link retires the old one, and a family can be taken off", async () => {
    smsOn();
    const owner = await coachWithTeam();
    const { data } = await call("GET", "my-team/my-team/texts");
    signOut();
    await signUp(data.token, "Dana Ruiz", "Mia", "6155550101");

    await coachWithTeam("Someone Else");
    const theirs = await call("GET", "my-team/my-team/texts");
    assert.equal(theirs.data.signups.length, 0);
    assert.notEqual(theirs.data.token, data.token);

    signInAs(owner);
    const mine = await call("GET", "my-team/my-team/texts");
    const id = mine.data.signups[0].id as string;
    signInAs({ id: randomUUID(), email: "x@example.com", name: "X" });
    await call("GET", "me");
    assert.equal((await call("DELETE", `my-team-signups/${id}`)).status, 404, "another coach can't take a family off");

    signInAs(owner);
    const renewed = await call("POST", "my-team/my-team/link");
    assert.notEqual(renewed.data.token, data.token);
    assert.equal(renewed.data.signups.length, 1, "families already signed up stay");
    signOut();
    assert.equal((await call("GET", `join/${data.token}`)).status, 404);
    signInAs(owner);
    const off = await call("DELETE", `my-team-signups/${id}`);
    assert.equal(off.status, 200);
    assert.equal(off.data.signups.length, 0);

    // A team that isn't saved on the account, and a signed-out caller, get nothing.
    assert.equal((await call("GET", "my-team/team-9/texts")).status, 404);
    signOut();
    assert.equal((await call("GET", "my-team/my-team/texts")).status, 401);
  });
});
