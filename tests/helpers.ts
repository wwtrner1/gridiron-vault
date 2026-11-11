import type { BrowserContext, Page, Route } from "@playwright/test";

/** Keeps the Designer's animated slides and first-visit tours out of the way. */
export async function quiet(context: BrowserContext) {
  await context.addInitScript(() => localStorage.setItem("grid1ronvault.tour.v1", "1"));
}

/**
 * A beta account this browser already follows. The tests' browser starts on Head Coach
 * (playwright.config.ts), which a first sign-in would otherwise hand up to the account.
 */
export async function onBeta(context: BrowserContext) {
  await context.addInitScript(() => {
    if (sessionStorage.getItem("beta-set")) return;
    sessionStorage.setItem("beta-set", "1");
    localStorage.setItem("nextplay.tier.v1", "beta");
    localStorage.setItem("nextplay.tier.synced.v1", "1");
  });
}

/** Puts the Ready-to-Go playbook (24 plays) in the Vault, the way a new coach would. */
export async function seedReady(page: Page) {
  await page.goto("/vault");
  await page.locator(".vault-ready button").click();
  await page.locator(".play-card").first().waitFor();
}

/** The coach's local workspace, as the store saved it. */
export function workspace(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem("snapline.workspace.v1") ?? "{}") as { plays?: { id: string; name: string; remote?: boolean; unsynced?: boolean; updatedAt: string; scene: { nodes: { id: string; x: number; y: number; label?: string }[] } }[]; playbooks?: { id: string; name: string }[] });
}

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");

/**
 * A signed-in coach without a real Identity: a token in gotrue.user, Identity
 * answered here, and `/api` handed to `api` (anything it returns undefined for
 * gets an empty 204).
 */
export async function signIn(context: BrowserContext, api: (route: Route, path: string, method: string) => Promise<boolean | void> | boolean | void) {
  const jwt = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: "u1", email: "coach@example.com", exp: Math.floor(Date.now() / 1000) + 86400 })}.sig`;
  await context.addInitScript((token) => {
    localStorage.setItem(
      "gotrue.user",
      JSON.stringify({
        id: "u1",
        email: "coach@example.com",
        app_metadata: { provider: "email" },
        user_metadata: { full_name: "Coach" },
        token: { access_token: token, refresh_token: "r", expires_at: Date.now() + 86_400_000, token_type: "bearer" },
        url: `${location.origin}/.netlify/identity`,
      }),
    );
  }, jwt);
  const user = { id: "u1", email: "coach@example.com", confirmed_at: "2026-01-01", app_metadata: { provider: "email" }, user_metadata: { full_name: "Coach" } };
  await context.route("**/.netlify/identity/**", (route) =>
    route.fulfill({ json: route.request().url().endsWith("/settings") ? { external: {}, disable_signup: false, autoconfirm: false } : user }),
  );
  await context.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^\/api\//, "");
    const handled = await api(route, path, route.request().method());
    if (handled) return;
    if (path === "me") return route.fulfill({ json: { user: { id: "u1", email: "coach@example.com", name: "Coach" }, plan: "solo" } });
    if (path.startsWith("plays") && route.request().method() === "GET") return route.fulfill({ json: { plays: [] } });
    if (path.startsWith("playbooks") && route.request().method() === "GET") return route.fulfill({ json: { playbooks: [], members: [] } });
    if (path.startsWith("call-sheets") && route.request().method() === "GET") return route.fulfill({ json: { sheets: [] } });
    if (path === "my-team" && route.request().method() === "GET") return route.fulfill({ json: { team: null } });
    if (path === "brand" && route.request().method() === "GET") return route.fulfill({ json: { brand: null } });
    return route.fulfill({ status: 204, body: "" });
  });
}

/** Collects page errors so a test can assert there were none. */
export function errorsOf(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}
