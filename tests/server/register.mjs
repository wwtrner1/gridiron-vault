// Loads the API function against stand-ins: an in-memory Postgres (PGlite) for Netlify Database and a settable
// signed-in coach for Netlify Identity. Stripe is faked at the fetch level in stripe-fake.ts. See billing.server.ts.
import { register } from "node:module";

register("./hooks.mjs", import.meta.url);
