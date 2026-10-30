export {};
/**
 * Is billing switched on at the live site? The webhook route answers 404 while
 * billing is off (no STRIPE_SECRET_KEY / STRIPE_PRICES / STRIPE_WEBHOOK_SECRET on
 * the deployed function) and 400 "bad signature" once it is on, so an unsigned
 * POST tells you whether the Netlify values reached the deploy. Sends nothing
 * that can change an account.
 *
 *   npm run stripe:probe                      # https://gridiron-vault.com
 *   npm run stripe:probe -- https://deploy-preview-1--gridiron-vault.netlify.app
 */
const site = (process.argv[2] ?? "https://gridiron-vault.com").replace(/\/$/, "");
const res = await fetch(`${site}/api/billing/webhook`, { method: "POST", body: "{}" }).catch((e: Error) => e);
if (res instanceof Error) {
  console.log(`Could not reach ${site}: ${res.message}`);
  process.exit(1);
}
const text = (await res.text()).trim();
if (res.status === 400) console.log(`ON. ${site} is checking Stripe signatures (400 "${text}"). Billing is live on this deploy.`);
else if (res.status === 404) console.log(`OFF. ${site} answered 404: STRIPE_SECRET_KEY, STRIPE_PRICES or STRIPE_WEBHOOK_SECRET is missing on this deploy, or it was not redeployed after you added them.`);
else console.log(`Unexpected ${res.status} from ${site}: ${text.slice(0, 200)}`);
process.exit(res.status === 400 ? 0 : 1);
