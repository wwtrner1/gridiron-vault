import Stripe from "stripe";
import { and, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { profiles } from "../../db/schema.js";
import type { TierId } from "../../src/lib/plan.js";

/**
 * Billing through Stripe: Checkout to pay, a pause for the off-season, the customer portal to cancel or change a card, and a
 * webhook that is the only thing that moves a paying coach's plan. Off until STRIPE_SECRET_KEY is set.
 * STRIPE_PRICES maps what we sell to Stripe price ids (not secret), as JSON:
 *   {"solo_month":"price_…","solo_year":"price_…","season":"price_…","crew_month":"…","crew_year":"…","program_month":"…","program_year":"…","founding":"price_…"}
 * Amounts live in Stripe; this file only knows which plan each price unlocks.
 */
const SITE = "https://gridiron-vault.com";
const SEASON_MONTHS = 4;

export const OFFER_KEYS = ["solo_month", "solo_year", "season", "crew_month", "crew_year", "program_month", "program_year", "founding"] as const;
export type OfferKey = (typeof OFFER_KEYS)[number];

/** The plan each thing we sell opens. Founding coaches are Head Coach at their own price. */
const PLAN_OF: Record<OfferKey, TierId> = { solo_month: "solo", solo_year: "solo", season: "solo", crew_month: "crew", crew_year: "crew", program_month: "program", program_year: "program", founding: "solo" };

export const billingOn = () => Boolean(process.env.STRIPE_SECRET_KEY && prices());

function prices(): Partial<Record<OfferKey, string>> {
  try {
    const raw = JSON.parse(process.env.STRIPE_PRICES ?? "{}") as Record<string, unknown>;
    return Object.fromEntries(OFFER_KEYS.flatMap((k) => (typeof raw[k] === "string" && raw[k] ? [[k, raw[k] as string]] : [])));
  } catch {
    return {};
  }
}

let client: Stripe | null = null;
const stripe = () => (client ??= new Stripe(process.env.STRIPE_SECRET_KEY ?? "", { httpClient: Stripe.createFetchHttpClient() }));

const offerOfPrice = (priceId: string | undefined) => Object.entries(prices()).find(([, id]) => id === priceId)?.[0] as OfferKey | undefined;

type Who = { id: string; email: string };

/** A Checkout page for one offer; the browser goes to the returned address. */
export async function startCheckout(me: Who, offer: string): Promise<{ url: string } | { error: string }> {
  const price = prices()[offer as OfferKey];
  if (!billingOn() || !price) return { error: "Billing isn't open yet. Your trial and your plays are safe." };
  const [row] = await db
    .select({ plan: profiles.plan, customer: profiles.stripeCustomerId, sub: profiles.stripeSubscriptionId })
    .from(profiles)
    .where(eq(profiles.id, me.id));
  // The founding rate is the beta coaches' promise: only an account that joined in beta can take it.
  if (offer === "founding" && row?.plan !== "beta") return { error: "The founding rate is for coaches who joined during the beta." };
  if (row?.sub && offer !== "season") return { error: "You already have a plan. Use Manage billing to change or cancel it." };
  const session = await stripe().checkout.sessions.create({
    mode: offer === "season" ? "payment" : "subscription",
    // A one-time payment makes no customer on its own; without one the portal and later renewals can't find this coach.
    ...(offer === "season" && !row?.customer ? { customer_creation: "always" as const } : {}),
    line_items: [{ price, quantity: 1 }],
    client_reference_id: me.id,
    ...(row?.customer ? { customer: row.customer } : { customer_email: me.email }),
    metadata: { userId: me.id, offer },
    ...(offer === "season" ? {} : { subscription_data: { metadata: { userId: me.id, offer } } }),
    allow_promotion_codes: true,
    success_url: `${SITE}/account?billing=success`,
    cancel_url: `${SITE}/pricing`,
  });
  return session.url ? { url: session.url } : { error: "Stripe didn't open the payment page. Try again in a minute." };
}

/** Stripe's page for cancelling, changing a card or downloading receipts. */
export async function openPortal(me: Who): Promise<{ url: string } | { error: string }> {
  if (!billingOn()) return { error: "Billing isn't open yet." };
  const [row] = await db.select({ customer: profiles.stripeCustomerId }).from(profiles).where(eq(profiles.id, me.id));
  if (!row?.customer) return { error: "There's no payment on this account yet. Pick a plan to start." };
  const session = await stripe().billingPortal.sessions.create({ customer: row.customer, return_url: `${SITE}/account` });
  return { url: session.url };
}

/** Does this subscription still entitle the coach to its plan? Only while it is paid up. */
// past_due and unpaid are deliberately not here: a failed payment drops the coach to Sideline at once, and the next paid invoice (status active) restores the plan.
const PAYING = new Set(["active", "trialing"]);

/** When a paused subscription starts charging again, or null when it isn't paused. */
const resumesAt = (sub: Stripe.Subscription) => (sub.pause_collection ? (sub.pause_collection.resumes_at ? new Date(sub.pause_collection.resumes_at * 1000) : new Date("2100-01-01T00:00:00Z")) : null);

async function applySubscription(sub: Stripe.Subscription) {
  const customer = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const offer = offerOfPrice(sub.items.data[0]?.price.id);
  const paused = PAYING.has(sub.status) && sub.pause_collection ? resumesAt(sub) : null;
  const live = PAYING.has(sub.status) && offer && !paused;
  // A failed payment: Sideline now, but the subscription is kept so the coach can fix the card and get the plan straight back.
  const failed = !live && !paused && (sub.status === "past_due" || sub.status === "unpaid");
  const [row] = await db
    .select({ planEndsAt: profiles.planEndsAt, paymentFailedAt: profiles.paymentFailedAt })
    .from(profiles)
    .where(eq(profiles.stripeCustomerId, customer));
  if (!row) return;
  // A season pass paid earlier still counts after a subscription ends or while it is paused.
  const season = row.planEndsAt && row.planEndsAt.getTime() > Date.now();
  await db
    .update(profiles)
    .set(
      live
        ? { plan: PLAN_OF[offer], stripeSubscriptionId: sub.id, pausedUntil: null, paymentFailedAt: null }
        : paused
          ? // Paused: Sideline until Stripe resumes it, and the subscription is kept so the coach can resume early.
            { plan: season ? "solo" : "free", stripeSubscriptionId: sub.id, pausedUntil: paused, paymentFailedAt: null }
          : failed
            ? { plan: season ? "solo" : "free", stripeSubscriptionId: sub.id, pausedUntil: null, paymentFailedAt: row.paymentFailedAt ?? new Date() }
            : { plan: season ? "solo" : "free", stripeSubscriptionId: null, pausedUntil: null, paymentFailedAt: null },
    )
    .where(eq(profiles.stripeCustomerId, customer));
}

/** How long a coach can pause, in months. */
export const PAUSE_MONTHS = [1, 2, 3, 6] as const;

/**
 * Season over? Pause instead of cancel: no charges until the date picked, the
 * coach is on Sideline meanwhile (every play kept), and Stripe starts billing
 * again on its own. Monthly plans only: a yearly plan is already paid for.
 */
export async function pauseSubscription(me: Who, months: unknown): Promise<{ pausedUntil: string } | { error: string }> {
  if (!billingOn()) return { error: "Billing isn't open yet." };
  const n = Number(months);
  if (!PAUSE_MONTHS.includes(n as (typeof PAUSE_MONTHS)[number])) return { error: "Pick 1, 2, 3 or 6 months." };
  const [row] = await db.select({ sub: profiles.stripeSubscriptionId }).from(profiles).where(eq(profiles.id, me.id));
  if (!row?.sub) return { error: "There's no monthly plan on this account to pause." };
  const sub = await stripe().subscriptions.retrieve(row.sub);
  if (!PAYING.has(sub.status)) return { error: "This plan isn't active, so there's nothing to pause. Pick a plan to start again." };
  if (sub.items.data[0]?.price.recurring?.interval !== "month") return { error: "A yearly plan is already paid for the year, so there's nothing to pause. Use Manage billing to stop it renewing." };
  const until = new Date();
  until.setMonth(until.getMonth() + n);
  const updated = await stripe().subscriptions.update(row.sub, { pause_collection: { behavior: "void", resumes_at: Math.floor(until.getTime() / 1000) } });
  await applySubscription(updated);
  return { pausedUntil: until.toISOString() };
}

/** Back on the paid plan today; Stripe bills from the next period. */
export async function resumeSubscription(me: Who): Promise<{ ok: true } | { error: string }> {
  if (!billingOn()) return { error: "Billing isn't open yet." };
  const [row] = await db.select({ sub: profiles.stripeSubscriptionId }).from(profiles).where(eq(profiles.id, me.id));
  if (!row?.sub) return { error: "There's no paused plan on this account." };
  // An empty string clears pause_collection in Stripe's API.
  const updated = await stripe().subscriptions.update(row.sub, { pause_collection: "" });
  await applySubscription(updated);
  return { ok: true };
}

async function applyCheckout(s: Stripe.Checkout.Session) {
  const userId = s.client_reference_id ?? s.metadata?.userId;
  const offer = s.metadata?.offer as OfferKey | undefined;
  if (!userId || !offer || !(offer in PLAN_OF) || s.payment_status === "unpaid") return;
  const customer = typeof s.customer === "string" ? s.customer : (s.customer?.id ?? null);
  const set: Partial<typeof profiles.$inferInsert> = { plan: PLAN_OF[offer], ...(customer ? { stripeCustomerId: customer } : {}) };
  if (s.mode === "subscription") {
    const sub = typeof s.subscription === "string" ? s.subscription : s.subscription?.id;
    if (sub) set.stripeSubscriptionId = sub;
  } else {
    // A one-time pass: four months from today, or from the end of one already running.
    const [row] = await db.select({ planEndsAt: profiles.planEndsAt }).from(profiles).where(eq(profiles.id, userId));
    const from = row?.planEndsAt && row.planEndsAt.getTime() > Date.now() ? row.planEndsAt : new Date();
    const end = new Date(from);
    end.setMonth(end.getMonth() + SEASON_MONTHS);
    set.planEndsAt = end;
  }
  await db.update(profiles).set(set).where(eq(profiles.id, userId));
  // Stripe's own customer record carries our id, so a payment found in the Dashboard says whose it is.
  if (customer) await stripe().customers.update(customer, { metadata: { userId } }).catch(() => undefined);
}

/**
 * A Season Pass that was refunded in full or disputed ends its access now. Only a one-time Checkout payment counts (subscription
 * charges and part refunds are left alone); a subscription still running keeps its own plan.
 */
async function revokeSeason(chargeRef: string | Stripe.Charge) {
  const charge = typeof chargeRef === "string" ? await stripe().charges.retrieve(chargeRef) : chargeRef;
  const customer = typeof charge.customer === "string" ? charge.customer : charge.customer?.id;
  const intent = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
  if (!customer || !intent) return;
  const sessions = await stripe().checkout.sessions.list({ payment_intent: intent, limit: 1 });
  const s = sessions.data[0];
  if (!s || s.mode !== "payment" || s.metadata?.offer !== "season") return;
  const [row] = await db.select({ sub: profiles.stripeSubscriptionId }).from(profiles).where(eq(profiles.stripeCustomerId, customer));
  if (!row) return;
  await db
    .update(profiles)
    .set(row.sub ? { planEndsAt: null } : { plan: "free", planEndsAt: null })
    .where(eq(profiles.stripeCustomerId, customer));
}

/** One webhook from Stripe, checked against its signature. Anything else is refused. */
export async function handleWebhook(req: Request): Promise<Response> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = req.headers.get("stripe-signature");
  if (!billingOn() || !secret || !signature) return new Response("not found", { status: 404 });
  let event: Stripe.Event;
  try {
    event = await stripe().webhooks.constructEventAsync(await req.text(), signature, secret, undefined, Stripe.createSubtleCryptoProvider());
  } catch {
    return new Response("bad signature", { status: 400 });
  }
  try {
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") await applyCheckout(event.data.object);
    else if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted" ||
      event.type === "customer.subscription.paused" ||
      event.type === "customer.subscription.resumed"
    )
      // Events can arrive out of order, so act on the subscription as Stripe has it now; the payload is the fallback.
      await applySubscription(await stripe().subscriptions.retrieve(event.data.object.id).catch(() => event.data.object));
    else if (event.type === "charge.refunded") {
      if (event.data.object.refunded) await revokeSeason(event.data.object);
    } else if (event.type === "charge.dispute.created") await revokeSeason(event.data.object.charge);
  } catch {
    // Stripe retries a 500, so a database blip doesn't lose a payment.
    return new Response("try again", { status: 500 });
  }
  return new Response("ok");
}

/** A season pass that has run out, with no subscription behind it: the coach is back on Sideline. */
export async function expireSeason(userId: string) {
  await db
    .update(profiles)
    .set({ plan: "free", planEndsAt: null })
    .where(and(eq(profiles.id, userId), eq(profiles.plan, "solo")));
}
