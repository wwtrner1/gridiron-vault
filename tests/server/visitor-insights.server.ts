/**
 * The owner console's Visitors tab (netlify/admin/visits.ts): beacons from the visitor counter go in through the
 * real API function, and `GET /api/admin/visitors` comes back with every page's views, time on page and exits,
 * the path to a paying coach, the Central-time heat map, new against returning browsers, campaign tags, coaches by
 * plan and tool use. The owner's own work never shows, and nothing in it names a person.
 *
 *   npm run test:server
 */
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { randomUUID } from "node:crypto";

process.env.TRIAL_SIGNUPS = "on";
delete process.env.STRIPE_SECRET_KEY;
delete process.env.RESEND_API_KEY;
const OWNER = "owner.visitors@example.com";
process.env.OWNER_EMAILS = OWNER;
const OWNER_ID = randomUUID();

const { migrate, client } = await import("./fake-db.ts");
const { signInAs } = await import("./fake-identity.ts");
const { default: api } = await import("../../netlify/functions/api.ts");
const { tidyCampaign } = await import("../../netlify/admin/visits.ts");

const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148";

async function call(path: string, opts: { method?: string; body?: unknown; raw?: string; ua?: string } = {}) {
  const res = await api(
    new Request(`https://gridiron-vault.com/api/${path}`, {
      method: opts.method ?? "GET",
      headers: { "Content-Type": "application/json", "X-Device": "device-visits-0001", "User-Agent": opts.ua ?? UA },
      body: opts.raw ?? (opts.body === undefined ? undefined : JSON.stringify(opts.body)),
    }),
    { ip: "203.0.113.9" } as never,
  );
  return { status: res.status, data: (await res.json().catch(() => null)) as any };
}

/** One beacon from a signed-out browser. */
async function beacon(body: Record<string, unknown>, ua = UA) {
  signInAs(null);
  const res = await call("visit", { method: "POST", raw: JSON.stringify(body), ua });
  assert.equal(res.status, 204);
}

const id = () => randomUUID().replace(/-/g, "");

/** Lets time pass: the server credits a beat only as many seconds as have gone by since the last one. */
const later = () => client.exec("update page_views set last_beat_at = now() - interval '1 hour'; update visits set last_beat_at = now() - interval '1 hour'");

async function asOwner() {
  signInAs({ id: OWNER_ID, email: OWNER, name: "Owner" });
  await call("me");
}

before(async () => {
  await migrate();
  await asOwner();
});

after(async () => {
  for (const k of ["TRIAL_SIGNUPS", "OWNER_EMAILS"]) delete process.env[k];
  await client.close();
});

describe("Visitor insights in the owner console", () => {
  test("pages, time on page, exits, campaign, new against returning and the path to an account", async () => {
    // Visit 1: from an Instagram post, home → pricing → sign-in, and leaves from sign-in. A new browser.
    const a = id();
    const [a1, a2, a3] = [id(), id(), id()];
    await beacon({ sid: a, pv: a1, path: "/", ref: "https://l.instagram.com/", utm: "Instagram / Launch!", back: false, hit: 1 });
    await later();
    await beacon({ sid: a, pv: a1, secs: 20 });
    await beacon({ sid: a, pv: a2, path: "/pricing", hit: 1 });
    await later();
    await beacon({ sid: a, pv: a2, secs: 40 });
    await beacon({ sid: a, pv: a3, path: "/signin", hit: 1 });

    // Visit 2: a returning browser opens a play in the Designer and leaves from there.
    const b = id();
    const b1 = id();
    await beacon({ sid: b, pv: b1, path: "/build/abc123", back: true, hit: 1 });
    await later();
    await beacon({ sid: b, pv: b1, secs: 30 });

    // An older browser that sends no page id still counts as a visit; a bot sends nothing at all.
    await beacon({ sid: id(), path: "/", hit: 1 });
    await beacon({ sid: id(), pv: id(), path: "/", hit: 1 }, "Googlebot/2.1");

    // A new coach signs up and draws a play; the owner draws one too, which must not count.
    const coach = randomUUID();
    signInAs({ id: coach, email: `${coach.slice(0, 8)}@example.com`, name: "New Coach" });
    assert.equal((await call("me")).status, 200);
    assert.equal((await call("events", { method: "POST", body: { name: "play_created" } })).status < 300, true);
    await asOwner();
    await call("events", { method: "POST", body: { name: "play_created" } });

    const { status, data: s } = await call("admin/visitors?days=7");
    assert.equal(status, 200);

    // Pages: every page opened, with its views and time on page, ids folded into one name.
    const page = (p: string) => s.pages.find((x: { path: string }) => x.path === p);
    assert.deepEqual(page("/"), { path: "/", views: 1, visits: 1, avgSeconds: 20 });
    assert.equal(page("/pricing").avgSeconds, 40);
    assert.equal(page("/build/*").views, 1);
    assert.equal(page("/signin").views, 1);
    // The bot's page and the old beacon with no page id aren't page views.
    assert.equal(s.pages.reduce((n: number, x: { views: number }) => n + x.views, 0), 4);

    // Exits: the last page of each visit.
    const exit = (p: string) => s.exits.find((x: { path: string }) => x.path === p)?.n ?? 0;
    assert.equal(exit("/signin"), 1);
    assert.equal(exit("/build/*"), 1);
    assert.equal(exit("/"), 0);

    // The path to a paying coach.
    assert.equal(s.totals.sessions, 3);
    assert.equal(s.funnel.pricing, 1);
    assert.equal(s.funnel.designer, 1);
    assert.equal(s.funnel.signin, 1);
    assert.equal(s.funnel.accounts, 1, "the owner's own account isn't a new coach");
    assert.equal(s.funnel.paying, 0);

    // Campaign tags are plain words; new against returning comes from the browser's own flag.
    assert.deepEqual(s.campaigns, [{ name: "instagram / launch", n: 1, signedIn: 0 }]);
    assert.deepEqual(s.newVsReturning, { new: 2, returning: 1 });
    assert.equal(s.referrers[0].name, "l.instagram.com");
    assert.equal(s.devices[0].name, "mobile");

    // The heat map has a cell for every visit, on the Central clock.
    assert.equal(s.heat.reduce((n: number, h: { n: number }) => n + h.n, 0), 3);
    for (const h of s.heat) {
      assert.ok(h.dow >= 0 && h.dow <= 6);
      assert.ok(h.hour >= 0 && h.hour <= 23);
    }

    // Coaches by plan leave the owner out; tool use counts the coach's play and not the owner's.
    assert.ok(!s.plans.some((p: { plan: string }) => p.plan === "master"));
    assert.equal(s.plans.reduce((n: number, p: { coaches: number }) => n + p.coaches, 0), 1);
    const plays = s.features.find((f: { name: string }) => f.name === "Plays created");
    assert.deepEqual(plays, { name: "Plays created", n: 1, coaches: 1 });

    // No person in it: no email, no ids.
    const text = JSON.stringify(s);
    assert.doesNotMatch(text, /@example\.com/);
    assert.ok(!text.includes(coach));
  });

  test("time on a page can't grow faster than the clock", async () => {
    const sid = id();
    const pv = id();
    await beacon({ sid, pv, path: "/vault", hit: 1 });
    for (let i = 0; i < 5; i++) await beacon({ sid, pv, secs: 120 });
    await asOwner();
    const { data: s } = await call("admin/visitors?days=7");
    const vault = s.pages.find((x: { path: string }) => x.path === "/vault");
    assert.ok(vault.avgSeconds <= 30, `five fast beats credited ${vault.avgSeconds}s`);
  });

  test("a coach who isn't the owner gets the plain 404", async () => {
    signInAs({ id: randomUUID(), email: "someone@example.com", name: "Someone" });
    assert.equal((await call("admin/visitors?days=7")).status, 404);
  });

  test("campaign tags keep only plain words", () => {
    assert.equal(tidyCampaign("TikTok / Nov-Launch"), "tiktok / nov-launch");
    assert.equal(tidyCampaign("<script>alert(1)</script>"), "scriptalert1/script");
    assert.equal(tidyCampaign("https://evil.example/?x=1"), "https//evil.example/x1");
    assert.equal(tidyCampaign(undefined), "");
    assert.equal(tidyCampaign("x".repeat(200)).length, 60);
  });
});
