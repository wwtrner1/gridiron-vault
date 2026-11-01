import Stripe from "stripe";

/**
 * Stripe in the server tests. The billing code builds its client with Stripe's fetch HTTP client on first use, so
 * `installStripeFake()` puts a fake `fetch` in front of api.stripe.com before that: every call is answered from an
 * in-memory account and recorded in `calls`, and anything the fake doesn't know fails the test loudly. The helpers
 * play Stripe's side of a purchase (the coach paying on the Checkout page, a renewal failing, a refund, a dispute) and
 * `signedEvent` builds the webhook Stripe would send, signed with the test secret, for the API function to receive.
 */
export const WEBHOOK_SECRET = "whsec_server_tests";

export const PRICES = {
  solo_month: "price_solo_month",
  solo_year: "price_solo_year",
  season: "price_season",
  crew_month: "price_crew_month",
  crew_year: "price_crew_year",
  program_month: "price_program_month",
  program_year: "price_program_year",
  founding: "price_founding",
} as const;

type Obj = Record<string, any>;
export type Call = { method: string; path: string; body: Obj; query: Obj };

export const calls: Call[] = [];
const sessions = new Map<string, Obj>();
const customers = new Map<string, Obj>();
const subscriptions = new Map<string, Obj>();
const charges = new Map<string, Obj>();
let seq = 0;
const nextId = (prefix: string) => `${prefix}_test${String(++seq).padStart(6, "0")}`;
const now = () => Math.floor(Date.now() / 1000);

export function resetStripe() {
  calls.length = 0;
  for (const m of [sessions, customers, subscriptions, charges]) m.clear();
}

/** Stripe's form encoding (`a[b][0][c]=x`) back into an object; arrays stay objects keyed "0", "1", … */
function parseForm(text: string): Obj {
  const out: Obj = {};
  for (const [key, value] of new URLSearchParams(text)) {
    const path = key.split(/\[|\]\[|\]/).filter(Boolean);
    let at = out;
    path.forEach((part, i) => {
      if (i === path.length - 1) at[part] = value;
      else at = at[part] = typeof at[part] === "object" ? at[part] : {};
    });
  }
  return out;
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "request-id": nextId("req") } });
const missing = (what: string) => json({ error: { type: "invalid_request_error", message: `No such ${what}`, code: "resource_missing" } }, 404);

const intervalOf = (price: string) => (/_year$/.test(price) ? "year" : "month");
const priceObj = (id: string) => ({ id, object: "price", recurring: id === PRICES.season ? null : { interval: intervalOf(id) } });

function answer(method: string, path: string, body: Obj, query: Obj): Response {
  const [, , resource, id, action] = path.split("/"); // "", "v1", resource, id, action
  if (resource === "checkout" && id === "sessions" && method === "POST") {
    const s = {
      id: nextId("cs"),
      object: "checkout.session",
      url: `https://checkout.stripe.com/c/pay/${seq}`,
      status: "open",
      payment_status: "unpaid",
      mode: body.mode,
      client_reference_id: body.client_reference_id ?? null,
      customer: body.customer ?? null,
      customer_email: body.customer_email ?? null,
      metadata: body.metadata ?? {},
      subscription: null,
      payment_intent: null,
      line_items: body.line_items,
      params: body,
    };
    sessions.set(s.id, s);
    return json(s);
  }
  if (resource === "checkout" && id === "sessions" && method === "GET" && !action) {
    const data = [...sessions.values()].filter((s) => !query.payment_intent || s.payment_intent === query.payment_intent).slice(0, Number(query.limit ?? 10));
    return json({ object: "list", data, has_more: false, url: "/v1/checkout/sessions" });
  }
  if (resource === "billing_portal" && id === "sessions" && method === "POST") {
    if (!customers.has(body.customer)) return missing("customer");
    return json({ id: nextId("bps"), object: "billing_portal.session", url: "https://billing.stripe.com/p/session/test", customer: body.customer, return_url: body.return_url });
  }
  if (resource === "customers" && id && method === "POST") {
    const c = customers.get(id);
    if (!c) return missing("customer");
    Object.assign(c, { ...body, metadata: { ...c.metadata, ...(body.metadata ?? {}) } });
    return json(c);
  }
  if (resource === "subscriptions" && id) {
    const sub = subscriptions.get(id);
    if (!sub) return missing("subscription");
    if (method === "GET") return json(sub);
    if (method === "DELETE") {
      Object.assign(sub, { status: "canceled", canceled_at: now(), ended_at: now() });
      return json(sub);
    }
    if (method === "POST") {
      if ("pause_collection" in body)
        sub.pause_collection = body.pause_collection === "" ? null : { behavior: body.pause_collection.behavior, resumes_at: Number(body.pause_collection.resumes_at) || null };
      return json(sub);
    }
  }
  if (resource === "charges" && id && method === "GET") return charges.has(id) ? json(charges.get(id)) : missing("charge");
  return json({ error: { type: "invalid_request_error", message: `The Stripe fake doesn't know ${method} ${path}` } }, 400);
}

let installed = false;
export function installStripeFake() {
  if (installed) return;
  installed = true;
  const real = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.hostname !== "api.stripe.com") return real(input, init);
    const method = (init?.method ?? "GET").toUpperCase();
    const body = typeof init?.body === "string" ? parseForm(init.body) : {};
    const query = Object.fromEntries(url.searchParams);
    calls.push({ method, path: url.pathname, body, query });
    return answer(method, url.pathname, body, query);
  }) as typeof fetch;
}

/** The last Checkout session the app opened. */
export const lastSession = () => [...sessions.values()].at(-1);

/**
 * The coach pays on the Checkout page. Stripe makes (or reuses) the customer and either a live subscription or a paid
 * one-time charge, then marks the session complete. `paid: false` is a bank debit still clearing (async payment).
 */
export function payCheckout(sessionId: string, opts: { paid?: boolean } = {}) {
  const s = sessions.get(sessionId);
  if (!s) throw new Error(`no session ${sessionId}`);
  const price = s.line_items?.["0"]?.price as string;
  let customer = s.customer as string | null;
  if (!customer) {
    customer = nextId("cus");
    customers.set(customer, { id: customer, object: "customer", email: s.customer_email, metadata: {} });
  }
  s.customer = customer;
  s.status = "complete";
  s.payment_status = opts.paid === false ? "unpaid" : "paid";
  let subscription: Obj | undefined;
  let charge: Obj | undefined;
  if (s.mode === "subscription") {
    subscription = {
      id: nextId("sub"),
      object: "subscription",
      customer,
      status: "active",
      pause_collection: null,
      metadata: s.params.subscription_data?.metadata ?? {},
      items: { object: "list", data: [{ id: nextId("si"), object: "subscription_item", price: priceObj(price) }] },
      current_period_end: now() + 30 * 86400,
    };
    subscriptions.set(subscription.id, subscription);
    s.subscription = subscription.id;
  } else {
    const intent = nextId("pi");
    charge = { id: nextId("ch"), object: "charge", customer, payment_intent: intent, amount: 2900, amount_refunded: 0, refunded: false };
    charges.set(charge.id, charge);
    s.payment_intent = intent;
  }
  return { session: s, customer, subscription, charge };
}

/** Stripe changes a subscription on its side (a renewal fails, a retry succeeds, the coach cancels in the portal). */
export function setSubscription(id: string, patch: Obj) {
  const sub = subscriptions.get(id);
  if (!sub) throw new Error(`no subscription ${id}`);
  return Object.assign(sub, patch);
}

export const subscription = (id: string) => subscriptions.get(id);
export const customer = (id: string) => customers.get(id);

/** A renewal charge on a subscription (not a Checkout payment), for the refund cases that must leave access alone. */
export function subscriptionCharge(customerId: string) {
  const charge = { id: nextId("ch"), object: "charge", customer: customerId, payment_intent: nextId("pi"), amount: 1200, amount_refunded: 0, refunded: false, invoice: nextId("in") };
  charges.set(charge.id, charge);
  return charge;
}

export function refund(chargeId: string, amount?: number) {
  const charge = charges.get(chargeId)!;
  charge.amount_refunded = amount ?? charge.amount;
  charge.refunded = charge.amount_refunded >= charge.amount;
  return charge;
}

export const dispute = (chargeId: string) => ({ id: nextId("dp"), object: "dispute", charge: chargeId, status: "needs_response", amount: charges.get(chargeId)!.amount });

/** The webhook Stripe sends for an event, signed with the test secret. */
export function signedEvent(type: string, object: Obj, secret = WEBHOOK_SECRET) {
  const payload = JSON.stringify({ id: nextId("evt"), object: "event", type, created: now(), data: { object }, livemode: false, api_version: "2026-01-01" });
  const header = Stripe.webhooks.generateTestHeaderString({ payload, secret });
  return new Request("https://gridiron-vault.com/api/billing/webhook", { method: "POST", headers: { "stripe-signature": header, "content-type": "application/json" }, body: payload });
}
