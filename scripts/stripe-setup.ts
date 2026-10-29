/**
 * Sets up Stripe for GridIronVault in one run: the products and prices, the customer portal and the
 * webhook endpoint. Safe to run twice: prices are found by lookup key and the webhook by its address.
 * Prints the three values to paste into Netlify (STRIPE_PRICES, STRIPE_WEBHOOK_SECRET); the secret key is
 * the one you passed in, so it is not printed. Never paste these into chat.
 *
 *   STRIPE_SECRET_KEY=sk_test_... npm run stripe:setup            # test mode (default)
 *   STRIPE_SECRET_KEY=sk_live_... npm run stripe:setup -- --live  # live mode, only with --live
 *   STRIPE_SECRET_KEY=sk_test_... npm run stripe:setup -- --check # change nothing, report what is missing
 *
 * A restricted key works if it can write Products, Prices, Webhook Endpoints and Customer portal.
 */
import Stripe from "stripe";
import type { OfferKey } from "../netlify/billing/stripe.js";

const key = process.env.STRIPE_SECRET_KEY ?? "";
const live = process.argv.includes("--live");
const check = process.argv.includes("--check");
if (!key) throw new Error("Set STRIPE_SECRET_KEY first.");
if (key.startsWith("sk_live_") && !live) throw new Error("That is a live key. Add --live if you mean it.");
if (live && !key.includes("_live_")) throw new Error("--live needs a live key.");
const stripe = new Stripe(key);

const WEBHOOK_URL = "https://gridiron-vault.com/api/billing/webhook";
const EVENTS: Stripe.WebhookEndpointCreateParams.EnabledEvent[] = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
];

/** What we sell. Amounts are in cents; `product` groups a monthly and yearly price under one product. */
const CATALOG: Record<OfferKey, { product: string; cents: number; every?: "month" | "year" }> = {
  solo_month: { product: "Head Coach", cents: 1200, every: "month" },
  solo_year: { product: "Head Coach", cents: 9900, every: "year" },
  season: { product: "Head Coach Season Pass", cents: 2900 },
  crew_month: { product: "Staff", cents: 2900, every: "month" },
  crew_year: { product: "Staff", cents: 24900, every: "year" },
  program_month: { product: "Program", cents: 7900, every: "month" },
  program_year: { product: "Program", cents: 69900, every: "year" },
  founding: { product: "Founding Head Coach", cents: 900, every: "month" },
};

async function productId(name: string): Promise<string | null> {
  const found = await stripe.products.search({ query: `active:'true' AND name:'${name}'`, limit: 1 });
  if (found.data[0]) return found.data[0].id;
  if (check) return null;
  return (await stripe.products.create({ name, metadata: { app: "gridironvault" } })).id;
}

const OFFER_KEYS = Object.keys(CATALOG) as OfferKey[];
const ids: Partial<Record<OfferKey, string>> = {};
for (const k of OFFER_KEYS) {
  const lookup_key = `gv_${k}`;
  const have = await stripe.prices.list({ lookup_keys: [lookup_key], active: true, limit: 1 });
  if (have.data[0]) {
    const p = have.data[0];
    if (p.unit_amount !== CATALOG[k].cents) console.warn(`! ${k}: Stripe has ${p.unit_amount}, catalog says ${CATALOG[k].cents}. Amounts are not edited in place; archive it in Stripe and rerun.`);
    ids[k] = p.id;
    continue;
  }
  const product = await productId(CATALOG[k].product);
  if (!product) {
    console.log(`missing price: ${k}`);
    continue;
  }
  const c = CATALOG[k];
  const price = await stripe.prices.create({ product, currency: "usd", unit_amount: c.cents, lookup_key, ...(c.every ? { recurring: { interval: c.every } } : {}) });
  ids[k] = price.id;
  console.log(`created ${k} ${price.id}`);
}

const hooks = await stripe.webhookEndpoints.list({ limit: 100 });
let hook = hooks.data.find((h) => h.url === WEBHOOK_URL);
let secret = "";
if (!hook && !check) {
  hook = await stripe.webhookEndpoints.create({ url: WEBHOOK_URL, enabled_events: EVENTS, description: "GridIronVault billing" });
  secret = hook.secret ?? "";
}
if (hook) {
  const missing = EVENTS.filter((e) => !hook!.enabled_events.includes(e) && !hook!.enabled_events.includes("*"));
  if (missing.length) console.warn(`! webhook is missing events: ${missing.join(", ")}`);
} else console.log("missing webhook endpoint");

const portals = await stripe.billingPortal.configurations.list({ limit: 1, is_default: true });
if (!portals.data[0] && !check) {
  await stripe.billingPortal.configurations.create({
    business_profile: { headline: "Manage your GridIronVault plan" },
    features: {
      subscription_cancel: { enabled: true, mode: "at_period_end" },
      payment_method_update: { enabled: true },
      invoice_history: { enabled: true },
    },
  });
  console.log("created customer portal settings");
} else if (!portals.data[0]) console.log("missing customer portal settings");

const missing = OFFER_KEYS.filter((k) => !ids[k]);
console.log(`\nmode: ${key.includes("_live_") ? "LIVE" : "test"}${check ? " (check only)" : ""}`);
console.log(missing.length ? `prices missing: ${missing.join(", ")}` : "all 8 prices present");
console.log(`\nSTRIPE_PRICES=${JSON.stringify(ids)}`);
console.log(secret ? `STRIPE_WEBHOOK_SECRET=${secret}` : hook ? "STRIPE_WEBHOOK_SECRET: already created earlier; copy it from Developers > Webhooks (Stripe only shows it once at creation)." : "");
