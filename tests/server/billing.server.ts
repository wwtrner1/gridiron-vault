/**
 * Billing, end to end on the server: the API function itself (netlify/functions/api.ts) with its real Drizzle
 * queries on an in-memory Postgres carrying every migration, a signed-in coach from a stand-in Identity, and Stripe
 * answered by tests/server/stripe-fake.ts. Each test buys (or loses) a plan the way a coach would — POST
 * /api/billing/checkout, pay on Stripe's side, Stripe's signed webhook — and then reads what the account now allows
 * through GET /api/me and a Vault save, so the first real purchase runs the same code these tests do.
 *
 *   npm run test:server
 */
import assert from "node:assert/strict";
import { after, before, beforeEach, describe, test } from "node:test";
import { randomUUID } from "node:crypto";

process.env.STRIPE_SECRET_KEY = "sk_test_server_tests";
process.env.STRIPE_PRICES = JSON.stringify((await import("./stripe-fake.ts")).PRICES);
process.env.STRIPE_WEBHOOK_SECRET = (await import("./stripe-fake.ts")).WEBHOOK_SECRET;
delete process.env.TRIAL_SIGNUPS;
delete process.env.TWILIO_VERIFY_SID;

const stripe = await import("./stripe-fake.ts");
stripe.installStripeFake();
const { migrate, client } = await import("./fake-db.ts");
const { signInAs } = await import("./fake-identity.ts");
const { default: api } = await import("../../netlify/functions/api.ts");

type Coach = { id: string; email: string };

async function call(method: string, path: string, body?: unknown) {
  const res = await api(new Request(`https://gridiron-vault.com/api/${path}`, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }));
  const text = await res.text();
  let data: any = text;
  try {
    data = JSON.parse(text);
  } catch {
    /* plain text answer (the webhook) */
  }
  return { status: res.status, data };
}

const as = (coach: Coach | null) => signInAs(coach);
const me = async (coach: Coach) => (as(coach), (await call("GET", "me")).data);
const webhook = async (req: Request) => {
  const res = await api(req);
  return { status: res.status, text: await res.text() };
};
const profile = async (coach: Coach) => (await client.query<Record<string, any>>("select * from profiles where id = $1", [coach.id])).rows[0];
const setProfile = (coach: Coach, column: string, value: unknown) => client.query(`update profiles set ${column} = $1 where id = $2`, [value, coach.id]);

let n = 0;
/** A new coach with a profile on file (GET /api/me makes it, as the app does on sign-in). */
async function newCoach(email = `coach${++n}@example.com`): Promise<Coach> {
  const coach = { id: randomUUID(), email };
  await me(coach);
  return coach;
}

/** The coach presses a plan button: the app opens Checkout and returns its address. */
async function checkout(coach: Coach, offer: string) {
  as(coach);
  return call("POST", "billing/checkout", { offer });
}

/** The whole purchase: Checkout, the payment on Stripe's side, and the webhooks Stripe sends for it. */
async function buy(coach: Coach, offer: string) {
  const opened = await checkout(coach, offer);
  assert.equal(opened.status, 200, JSON.stringify(opened.data));
  const paid = stripe.payCheckout(stripe.lastSession()!.id);
  // Stripe sends the subscription's own event alongside the session's; either can land first.
  if (paid.subscription) assert.equal((await webhook(stripe.signedEvent("customer.subscription.created", paid.subscription))).status, 200);
  assert.equal((await webhook(stripe.signedEvent("checkout.session.completed", paid.session))).status, 200);
  return paid;
}

/** Fills the coach's Vault with plays straight into the database. */
async function fillVault(coach: Coach, count: number) {
  for (let i = 0; i < count; i++)
    await client.query("insert into plays (owner_id, name, scene) values ($1, $2, '{}'::jsonb)", [coach.id, `Play ${i + 1}`]);
}

/** Saves one more play through the API, as the Designer does. */
async function savePlay(coach: Coach) {
  as(coach);
  return call("POST", "plays", { name: "Smash", scene: { version: 2, nodes: [] } });
}

before(async () => {
  await migrate();
});

after(async () => {
  await client.close();
});

beforeEach(() => {
  stripe.resetStripe();
  delete process.env.TRIAL_SIGNUPS;
});

describe("Checkout", () => {
  test("opens a subscription Checkout tied to the coach, with tax and the success page", async () => {
    const coach = await newCoach();
    const res = await checkout(coach, "solo_month");
    assert.equal(res.status, 200);
    assert.match(res.data.url, /^https:\/\/checkout\.stripe\.com\//);
    const p = stripe.lastSession()!.params;
    assert.equal(p.mode, "subscription");
    assert.equal(p.line_items["0"].price, stripe.PRICES.solo_month);
    assert.equal(p.line_items["0"].quantity, "1");
    assert.equal(p.client_reference_id, coach.id);
    assert.equal(p.customer_email, coach.email);
    assert.deepEqual(p.metadata, { userId: coach.id, offer: "solo_month" });
    assert.deepEqual(p.subscription_data.metadata, { userId: coach.id, offer: "solo_month" });
    assert.equal(p.automatic_tax.enabled, "true");
    assert.equal(p.billing_address_collection, "required");
    assert.equal(p.success_url, "https://gridiron-vault.com/account?billing=success");
    assert.equal(p.cancel_url, "https://gridiron-vault.com/pricing");
    assert.equal(p.customer_creation, undefined, "subscriptions make their own customer");
  });

  test("a Season Pass is a one-time payment that still makes a Stripe customer", async () => {
    const coach = await newCoach();
    await checkout(coach, "season");
    const p = stripe.lastSession()!.params;
    assert.equal(p.mode, "payment");
    assert.equal(p.customer_creation, "always");
    assert.equal(p.subscription_data, undefined);
  });

  test("refuses an offer that isn't sold, a second plan, the founding rate outside beta, the owner and a signed-out visitor", async () => {
    const coach = await newCoach();
    assert.equal((await checkout(coach, "lifetime_free")).status, 400);

    // New coaches join as Beta Coach while trials are off, so the founding rate is theirs.
    assert.equal((await checkout(coach, "founding")).status, 200);
    await buy(coach, "solo_month");
    const again = await checkout(coach, "crew_month");
    assert.equal(again.status, 400);
    assert.match(again.data.error, /already have a plan/);
    const founding = await checkout(coach, "founding");
    assert.equal(founding.status, 400);
    assert.match(founding.data.error, /joined during the beta/);

    as({ id: randomUUID(), email: "wwtrner1@gmail.com" });
    const owner = await call("POST", "billing/checkout", { offer: "solo_month" });
    assert.equal(owner.status, 403);

    as(null);
    assert.equal((await call("POST", "billing/checkout", { offer: "solo_month" })).status, 401);
  });

  test("a returning customer is sent back to their own Stripe customer", async () => {
    const coach = await newCoach();
    const { customer } = await buy(coach, "season");
    await checkout(coach, "season");
    const p = stripe.lastSession()!.params;
    assert.equal(p.customer, customer);
    assert.equal(p.customer_email, undefined);
    assert.equal(p.customer_creation, undefined);
    assert.equal(p.customer_update.address, "auto");
  });
});

describe("Switching billing on", () => {
  /** Runs `fn` with one billing key taken out of the environment, then puts it back. */
  async function without(name: string, value: string | undefined, fn: () => Promise<void>) {
    const kept = process.env[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
    try {
      await fn();
    } finally {
      process.env[name] = kept;
    }
  }

  test("billing stays shut until all three keys are set, so nobody can pay without the plan landing", async () => {
    const coach = await newCoach();
    assert.equal((await me(coach)).billing, true);
    for (const [name, value] of [["STRIPE_SECRET_KEY", undefined], ["STRIPE_WEBHOOK_SECRET", undefined], ["STRIPE_PRICES", undefined], ["STRIPE_PRICES", "not json"], ["STRIPE_PRICES", "{}"]] as const)
      await without(name, value, async () => {
        assert.equal((await me(coach)).billing, false, `${name}=${value}`);
        const res = await checkout(coach, "solo_month");
        assert.equal(res.status, 400, `${name}=${value}`);
        assert.match(res.data.error, /isn't open yet/);
      });
    assert.equal(stripe.calls.length, 0, "Stripe was never called while billing was shut");
  });

  test("with billing open, a coach can't hand themselves a paid plan, and a paying coach stops it in Stripe", async () => {
    const coach = await newCoach();
    as(coach);
    const free = await call("PUT", "me/plan", { plan: "solo" });
    assert.equal(free.status, 403);
    assert.match(free.data.error, /checkout/);
    assert.equal((await me(coach)).plan, "beta");

    await buy(coach, "solo_month");
    as(coach);
    const down = await call("PUT", "me/plan", { plan: "free" });
    assert.equal(down.status, 403);
    assert.match(down.data.error, /Manage billing/);
    assert.equal((await me(coach)).plan, "solo");

    // A coach with nothing billed can still step down to Sideline.
    const other = await newCoach();
    as(other);
    assert.equal((await call("PUT", "me/plan", { plan: "free" })).status, 200);
  });
});

describe("Webhook → plan", () => {
  test("a paid monthly plan opens Head Coach, and the Vault takes play nine", async () => {
    process.env.TRIAL_SIGNUPS = "on";
    const coach = await newCoach("fresh.coach@gmail.com");
    // Trial over: on Sideline, with a full eight-play Vault.
    await setProfile(coach, "trial_ends_at", new Date(Date.now() - 1000));
    assert.equal((await me(coach)).plan, "free");
    await fillVault(coach, 8);
    const refused = await savePlay(coach);
    assert.equal(refused.status, 403);
    assert.equal(refused.data.code, "plan_limit");

    const { customer, subscription } = await buy(coach, "solo_month");
    const after = await me(coach);
    assert.equal(after.plan, "solo");
    assert.equal(after.billing, true);
    assert.equal(after.subscribed, true);
    assert.equal(after.paymentFailed, false);
    const row = await profile(coach);
    assert.equal(row.stripe_customer_id, customer);
    assert.equal(row.stripe_subscription_id, subscription!.id);
    // Stripe's customer carries our id, so a payment found in the Dashboard says whose it is.
    assert.equal(stripe.customer(customer)!.metadata.userId, coach.id);
    assert.equal((await savePlay(coach)).status, 201);
  });

  test("each offer opens its own plan", async () => {
    for (const [offer, plan] of [["solo_year", "solo"], ["crew_month", "crew"], ["crew_year", "crew"], ["program_month", "program"], ["program_year", "program"], ["founding", "solo"]] as const) {
      const coach = await newCoach();
      await buy(coach, offer);
      assert.equal((await me(coach)).plan, plan, offer);
    }
  });

  test("Checkout's event may land before or after the subscription's; the plan ends up the same", async () => {
    const coach = await newCoach();
    await checkout(coach, "crew_year");
    const paid = stripe.payCheckout(stripe.lastSession()!.id);
    assert.equal((await webhook(stripe.signedEvent("checkout.session.completed", paid.session))).status, 200);
    assert.equal((await webhook(stripe.signedEvent("customer.subscription.created", paid.subscription!))).status, 200);
    assert.equal((await me(coach)).plan, "crew");
  });

  test("a bank payment still clearing opens nothing until Stripe says it succeeded", async () => {
    const coach = await newCoach();
    await checkout(coach, "season");
    const paid = stripe.payCheckout(stripe.lastSession()!.id, { paid: false });
    await webhook(stripe.signedEvent("checkout.session.completed", paid.session));
    assert.equal((await me(coach)).plan, "beta");
    paid.session.payment_status = "paid";
    await webhook(stripe.signedEvent("checkout.session.async_payment_succeeded", paid.session));
    assert.equal((await me(coach)).plan, "solo");
  });

  test("a Checkout event that arrives after the subscription was already cancelled doesn't open the plan again", async () => {
    const coach = await newCoach();
    const { session, subscription } = await buy(coach, "solo_month");
    stripe.setSubscription(subscription!.id, { status: "canceled" });
    await webhook(stripe.signedEvent("customer.subscription.deleted", subscription!));
    assert.equal((await me(coach)).plan, "free");
    // Stripe retries a webhook for days; a late copy of the purchase must not hand the plan back.
    await webhook(stripe.signedEvent("checkout.session.completed", session));
    const now = await me(coach);
    assert.equal(now.plan, "free");
    assert.equal(now.subscribed, false);
  });

  test("refuses a webhook without the right signature, and answers 404 while billing is off", async () => {
    const coach = await newCoach();
    await checkout(coach, "solo_month");
    const paid = stripe.payCheckout(stripe.lastSession()!.id);
    const forged = await webhook(stripe.signedEvent("checkout.session.completed", paid.session, "whsec_someone_else"));
    assert.equal(forged.status, 400);
    const unsigned = await api(new Request("https://gridiron-vault.com/api/billing/webhook", { method: "POST", body: "{}" }));
    assert.equal(unsigned.status, 404);
    assert.equal((await me(coach)).plan, "beta");

    const key = process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_SECRET_KEY;
    try {
      assert.equal((await webhook(stripe.signedEvent("checkout.session.completed", paid.session))).status, 404);
      assert.equal((await me(coach)).billing, false);
    } finally {
      process.env.STRIPE_SECRET_KEY = key;
    }
  });

  test("answers 500 when it can't act on a purchase, so Stripe sends it again", async () => {
    const coach = await newCoach();
    await checkout(coach, "solo_month");
    const paid = stripe.payCheckout(stripe.lastSession()!.id);
    const real = paid.session.subscription;
    paid.session.subscription = "sub_gone_missing";
    assert.equal((await webhook(stripe.signedEvent("checkout.session.completed", paid.session))).status, 500);
    assert.equal((await me(coach)).plan, "beta");
    paid.session.subscription = real;
    assert.equal((await webhook(stripe.signedEvent("checkout.session.completed", paid.session))).status, 200);
    assert.equal((await me(coach)).plan, "solo");
  });

  test("ignores events it doesn't act on", async () => {
    const res = await webhook(stripe.signedEvent("invoice.paid", { id: "in_1", object: "invoice" }));
    assert.equal(res.status, 200);
  });
});

describe("Failed payment, cancel, pause", () => {
  test("a failed renewal drops the coach to Sideline with the banner; the paid retry brings the plan back", async () => {
    const coach = await newCoach();
    const { subscription } = await buy(coach, "solo_month");
    stripe.setSubscription(subscription!.id, { status: "past_due" });
    await webhook(stripe.signedEvent("customer.subscription.updated", subscription!));
    let state = await me(coach);
    assert.equal(state.plan, "free");
    assert.equal(state.paymentFailed, true);
    assert.equal(state.subscribed, true, "the subscription is kept so the card can be fixed");
    // Pause is hidden and refused while a payment is failing.
    as(coach);
    assert.equal((await call("POST", "billing/pause", { months: 1 })).status, 400);
    // Update card goes to Stripe's portal.
    const portal = await call("POST", "billing/portal");
    assert.equal(portal.status, 200);
    assert.match(portal.data.url, /billing\.stripe\.com/);

    stripe.setSubscription(subscription!.id, { status: "active" });
    await webhook(stripe.signedEvent("customer.subscription.updated", subscription!));
    state = await me(coach);
    assert.equal(state.plan, "solo");
    assert.equal(state.paymentFailed, false);
  });

  test("an unpaid subscription stays on Sideline, and a cancelled one clears the subscription", async () => {
    const coach = await newCoach();
    const { subscription } = await buy(coach, "crew_month");
    stripe.setSubscription(subscription!.id, { status: "unpaid" });
    await webhook(stripe.signedEvent("customer.subscription.updated", subscription!));
    assert.equal((await me(coach)).plan, "free");

    stripe.setSubscription(subscription!.id, { status: "canceled" });
    await webhook(stripe.signedEvent("customer.subscription.deleted", subscription!));
    const state = await me(coach);
    assert.equal(state.plan, "free");
    assert.equal(state.subscribed, false);
    assert.equal(state.paymentFailed, false);
    assert.equal((await profile(coach)).stripe_subscription_id, null);
    // With no plan behind it, a new Checkout is allowed again.
    assert.equal((await checkout(coach, "solo_month")).status, 200);
  });

  test("acts on the subscription as Stripe has it now, not on a stale event", async () => {
    const coach = await newCoach();
    const { subscription } = await buy(coach, "solo_month");
    const stale = { ...subscription!, status: "past_due" };
    // The failure was already fixed by the time its event arrived.
    await webhook(stripe.signedEvent("customer.subscription.updated", stale));
    assert.equal((await me(coach)).plan, "solo");
  });

  test("pause a monthly plan: Sideline until the date, then Resume my plan now brings it back", async () => {
    const coach = await newCoach();
    const { subscription } = await buy(coach, "solo_month");
    as(coach);
    const paused = await call("POST", "billing/pause", { months: 2 });
    assert.equal(paused.status, 200, JSON.stringify(paused.data));
    assert.equal(stripe.subscription(subscription!.id)!.pause_collection.behavior, "void");
    let state = await me(coach);
    assert.equal(state.plan, "free");
    assert.ok(state.pausedUntil);
    assert.equal(state.subscribed, true);
    const days = (Date.parse(state.pausedUntil) - Date.now()) / 86_400_000;
    assert.ok(days > 55 && days < 63, `paused for ${days} days`);

    as(coach);
    assert.equal((await call("POST", "billing/resume")).status, 200);
    assert.equal(stripe.subscription(subscription!.id)!.pause_collection, null);
    state = await me(coach);
    assert.equal(state.plan, "solo");
    assert.equal(state.pausedUntil, undefined);
  });

  test("a yearly plan can't be paused, and pause months are held to 1, 2, 3 or 6", async () => {
    const coach = await newCoach();
    await buy(coach, "solo_year");
    as(coach);
    assert.match((await call("POST", "billing/pause", { months: 2 })).data.error, /yearly plan/);
    const other = await newCoach();
    await buy(other, "solo_month");
    as(other);
    assert.match((await call("POST", "billing/pause", { months: 5 })).data.error, /1, 2, 3 or 6/);
  });
});

describe("Season Pass, refunds and disputes", () => {
  test("a Season Pass opens Head Coach for four months, and a second one adds four more", async () => {
    const coach = await newCoach();
    await buy(coach, "season");
    assert.equal((await me(coach)).plan, "solo");
    const first = (await profile(coach)).plan_ends_at as Date;
    const months = (first.getTime() - Date.now()) / (30.4 * 86_400_000);
    assert.ok(months > 3.8 && months < 4.2, `${months} months`);
    assert.equal((await me(coach)).subscribed, false);

    await buy(coach, "season");
    const second = (await profile(coach)).plan_ends_at as Date;
    const added = (second.getTime() - first.getTime()) / (30.4 * 86_400_000);
    assert.ok(added > 3.8 && added < 4.2, `added ${added} months`);
  });

  test("a Season Pass that has run out is Sideline from the next request", async () => {
    const coach = await newCoach();
    await buy(coach, "season");
    await setProfile(coach, "plan_ends_at", new Date(Date.now() - 1000));
    assert.equal((await me(coach)).plan, "free");
    await fillVault(coach, 8);
    assert.equal((await savePlay(coach)).status, 403);
  });

  test("a full refund of a Season Pass ends it now; a part refund leaves it", async () => {
    const coach = await newCoach();
    const { charge } = await buy(coach, "season");
    await webhook(stripe.signedEvent("charge.refunded", stripe.refund(charge!.id, 1000)));
    assert.equal((await me(coach)).plan, "solo");
    await webhook(stripe.signedEvent("charge.refunded", stripe.refund(charge!.id)));
    assert.equal((await me(coach)).plan, "free");
    assert.equal((await profile(coach)).plan_ends_at, null);
  });

  test("a disputed Season Pass ends it now", async () => {
    const coach = await newCoach();
    const { charge } = await buy(coach, "season");
    const res = await webhook(stripe.signedEvent("charge.dispute.created", stripe.dispute(charge!.id)));
    assert.equal(res.status, 200);
    assert.equal((await me(coach)).plan, "free");
  });

  test("refunding a subscription charge leaves the subscription's plan alone", async () => {
    const coach = await newCoach();
    const { customer } = await buy(coach, "crew_month");
    const renewal = stripe.subscriptionCharge(customer);
    await webhook(stripe.signedEvent("charge.refunded", stripe.refund(renewal.id)));
    await webhook(stripe.signedEvent("charge.dispute.created", stripe.dispute(renewal.id)));
    assert.equal((await me(coach)).plan, "crew");
  });

  test("a refunded Season Pass on top of a running subscription keeps the subscription's plan", async () => {
    const coach = await newCoach();
    await buy(coach, "crew_month");
    const { charge } = await buy(coach, "season");
    await webhook(stripe.signedEvent("charge.refunded", stripe.refund(charge!.id)));
    assert.equal((await me(coach)).plan, "crew");
  });

  test("a refunded Season Pass beside a paused subscription leaves the coach on Sideline", async () => {
    const coach = await newCoach();
    await buy(coach, "solo_month");
    const { charge } = await buy(coach, "season");
    as(coach);
    assert.equal((await call("POST", "billing/pause", { months: 1 })).status, 200);
    assert.equal((await me(coach)).plan, "solo", "the pass carries the pause");
    await webhook(stripe.signedEvent("charge.refunded", stripe.refund(charge!.id)));
    const state = await me(coach);
    assert.equal(state.plan, "free");
    assert.ok(state.pausedUntil, "still paused, so Resume works");
  });

  test("a Season Pass bought while on Staff doesn't step the coach down to Head Coach", async () => {
    const coach = await newCoach();
    await buy(coach, "crew_month");
    await buy(coach, "season");
    assert.equal((await me(coach)).plan, "crew");
  });

  test("a Season Pass outlives the subscription it was bought beside", async () => {
    const coach = await newCoach();
    const { subscription } = await buy(coach, "solo_month");
    await buy(coach, "season");
    stripe.setSubscription(subscription!.id, { status: "canceled" });
    await webhook(stripe.signedEvent("customer.subscription.deleted", subscription!));
    assert.equal((await me(coach)).plan, "solo");
  });

  test("a Season Pass that runs out while the subscription is paused or failing is Sideline", async () => {
    for (const status of ["paused", "past_due"] as const) {
      const coach = await newCoach();
      const { subscription } = await buy(coach, "solo_month");
      await buy(coach, "season");
      if (status === "paused") {
        as(coach);
        assert.equal((await call("POST", "billing/pause", { months: 1 })).status, 200);
      } else {
        stripe.setSubscription(subscription!.id, { status: "past_due" });
        await webhook(stripe.signedEvent("customer.subscription.updated", subscription!));
      }
      assert.equal((await me(coach)).plan, "solo", `${status}: the pass still runs`);
      await setProfile(coach, "plan_ends_at", new Date(Date.now() - 1000));
      assert.equal((await me(coach)).plan, "free", `${status}: the pass has run out`);
    }
  });
});

describe("Trial", () => {
  test("a new coach gets 14 days of Head Coach once, then Sideline", async () => {
    process.env.TRIAL_SIGNUPS = "on";
    const coach = await newCoach("Coach.Trial@gmail.com");
    const state = await me(coach);
    assert.equal(state.plan, "trial");
    const days = (Date.parse(state.trialEndsAt) - Date.now()) / 86_400_000;
    assert.ok(days > 13.9 && days <= 14, `${days} days`);

    // The same person with a dotted, tagged address gets no second trial.
    const again = await newCoach("coachtrial+2@googlemail.com");
    assert.equal((await me(again)).plan, "free");

    await setProfile(coach, "trial_ends_at", new Date(Date.now() - 1000));
    const over = await me(coach);
    assert.equal(over.plan, "free");
    assert.equal(over.trialEndsAt, undefined);
    assert.equal((await profile(coach)).plan, "free");
  });

  test("buying during the trial opens the paid plan, and the trial's end date no longer matters", async () => {
    process.env.TRIAL_SIGNUPS = "on";
    const coach = await newCoach("buyer.trial@example.com");
    assert.equal((await me(coach)).plan, "trial");
    await buy(coach, "solo_year");
    await setProfile(coach, "trial_ends_at", new Date(Date.now() - 1000));
    const state = await me(coach);
    assert.equal(state.plan, "solo");
    assert.equal(state.trialEndsAt, undefined);
  });

  test("while trials are on a coach can only step down to Sideline by hand; paid plans go through Checkout", async () => {
    process.env.TRIAL_SIGNUPS = "on";
    const coach = await newCoach("stepdown@example.com");
    as(coach);
    assert.equal((await call("PUT", "me/plan", { plan: "solo" })).status, 403);
    assert.equal((await call("PUT", "me/plan", { plan: "free" })).status, 200);
  });
});

describe("Account deletion", () => {
  test("deleting the account cancels the subscription in Stripe first", async () => {
    const coach = await newCoach();
    const { subscription } = await buy(coach, "solo_month");
    as(coach);
    const res = await call("DELETE", "me", { confirm: coach.email });
    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.equal(stripe.subscription(subscription!.id)!.status, "canceled");
    assert.equal(await profile(coach), undefined);
  });
});
