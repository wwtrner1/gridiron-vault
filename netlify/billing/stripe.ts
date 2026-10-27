import Stripe from "stripe";
import { and, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { profiles } from "../../db/schema.js";
import type { TierId } from "../../src/lib/plan.js";

/**
 * Billing through Stripe: Checkout to pay, the customer portal to cancel or change a card, and a
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

/** Does this subscription still entitle the coach to its plan? A late payment keeps access while Stripe retries. */
// past_due and unpaid are deliberately not here: a failed payment drops the coach to Sideline at once, and the next paid invoice (status active) restores the plan.
const PAYING = new Set(["active", "trialing"]);

async function applySubscription(sub: Stripe.Subscription) {
  const customer = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const offer = offerOfPrice(sub.items.data[0]?.price.id);
  const live = PAYING.has(sub.status) && offer;
  const [row] = await db.select({ planEndsAt: profiles.planEndsAt }).from(profiles).where(eq(profiles.stripeCustomerId, customer));
  if (!row) return;
  // A season pass paid earlier still counts after a subscription ends.
  const season = row.planEndsAt && row.planEndsAt.getTime() > Date.now();
  await db
    .update(profiles)
    .set(live ? { plan: PLAN_OF[offer], stripeSubscriptionId: sub.id } : { plan: season ? "solo" : "free", stripeSubscriptionId: null })
    .where(eq(profiles.stripeCustomerId, customer));
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
    else if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted")
      await applySubscription(event.data.object);
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
