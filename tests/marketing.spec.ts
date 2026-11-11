import { expect, test } from "@playwright/test";
import { errorsOf, quiet } from "./helpers";

/**
 * The marketing chrome: the home page's nav and its How it works jump, the
 * hero's two ways in, the plans teaser, the footer's four columns with every
 * guide link landing on a real static page (served before the app, with no
 * script but the JSON-LD so the CSP holds), and the sitemap and robots file
 * naming every guide.
 */
test.beforeEach(async ({ context }) => quiet(context));

const GUIDES = [
  "/guides/flag-football-plays-vs-zone/",
  "/guides/flag-football-plays-vs-man/",
  "/guides/flag-football-red-zone-plays/",
  "/guides/beat-the-blitz-flag-football/",
  "/guides/flag-football-install-plan/",
  "/guides/flag-football-glossary/",
];

test("the home page's nav, hero, plans and footer link where they say, every guide is a real page, and the sitemap lists them", async ({ page }) => {
  const errors = errorsOf(page);
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav.getByRole("link")).toHaveText(["Designer", "How it works", "Starter plays", "Pricing"]);
  await expect(nav.getByRole("link", { name: "Designer" })).toHaveAttribute("href", "/build");
  await expect(nav.getByRole("link", { name: "Pricing" })).toHaveAttribute("href", "/pricing");
  await expect(page.getByRole("banner").getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/signin");

  // The hero offers the Designer and the starters; the plans teaser and the closing call go to pricing and the Designer.
  const hero = page.locator("section").filter({ has: page.locator("#hero-h") });
  await expect(hero.getByRole("link", { name: "Start drawing — it is free" })).toHaveAttribute("href", "/build");
  await expect(hero.getByRole("link", { name: "Browse the starter plays" })).toHaveAttribute("href", "/starters");
  await expect(page.getByRole("heading", { name: "Start free, upgrade when it earns it" })).toBeVisible();
  await expect(page.locator("section").filter({ has: page.locator("#plans-h") }).locator('a[href="/pricing"]').first()).toBeVisible();
  await expect(page.locator("section").filter({ has: page.locator("#cta-h") }).locator('a[href="/build"]')).toHaveCount(1);

  // How it works jumps down the page to its section.
  await nav.getByRole("link", { name: "How it works" }).click();
  await expect(page).toHaveURL(/\/#how$/);
  await expect(page.locator("#how")).toBeInViewport();
  await expect(page.getByRole("heading", { name: "Four steps, about five minutes" })).toBeVisible();

  // The footer: four columns, and the guides as plain page links (not router links).
  const footer = page.locator("footer.mkt");
  await expect(footer.getByRole("heading", { level: 3 })).toHaveText(["Product", "Learn", "Account", "Support"]);
  await expect(footer.getByRole("navigation", { name: "Product" }).getByRole("link")).toHaveText(["Designer", "Call Sheet", "The Vault", "Playbooks"]);
  await expect(footer.getByRole("navigation", { name: "Support" }).getByRole("link")).toHaveText(["Contact us", "Tell us what to improve →", "Privacy Policy", "Terms of Use"]);
  const learn = footer.getByRole("navigation", { name: "Learn" });
  await expect(learn.locator('a[href^="/guides/"]')).toHaveCount(GUIDES.length);
  for (const g of GUIDES) await expect(learn.locator(`a[href="${g}"]`)).toHaveCount(1);
  expect(errors).toEqual([]);

  // Every guide (and the hub) is a real static page with a title, the shared stylesheet and no script but the JSON-LD.
  for (const path of ["/guides/", ...GUIDES]) {
    const res = await page.request.get(path);
    expect(res.status(), path).toBe(200);
    const html = await res.text();
    expect(html, path).toContain("<title>");
    expect(html, path).toContain("guides.css");
    expect(html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, ""), path).not.toMatch(/<script/);
  }
  await page.goto("/guides/flag-football-glossary/");
  await expect(page.locator("h1")).toBeVisible();
  await expect(page.locator('a[href="/starters"]').first()).toBeVisible();

  // The sitemap names the hub and every guide; robots.txt points at it.
  const sitemap = await (await page.request.get("/sitemap.xml")).text();
  for (const g of ["/guides/", ...GUIDES]) expect(sitemap).toContain(`<loc>https://gridiron-vault.com${g}</loc>`);
  expect(await (await page.request.get("/robots.txt")).text()).toContain("Sitemap: https://gridiron-vault.com/sitemap.xml");
});

test("search and share tags: the share card on app pages, every public page in the sitemap, guides preload their fonts", async ({ page }) => {
  await page.goto("/pricing");
  const card = "https://gridiron-vault.com/social-card.png";
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", card);
  await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute("content", card);
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute("content", "summary_large_image");
  expect((await page.request.get("/social-card.png")).status()).toBe(200);

  const sitemap = await (await page.request.get("/sitemap.xml")).text();
  for (const p of ["/", "/pricing", "/starters", "/tutorials", "/help", "/privacy", "/terms"]) {
    expect(sitemap, p).toContain(`<loc>https://gridiron-vault.com${p}</loc>`);
  }

  // Each guide preloads the body and headline fonts, and sizes their stand-ins so nothing jumps when they arrive.
  for (const path of ["/guides/", ...GUIDES]) {
    const html = await (await page.request.get(path)).text();
    expect(html, path).toContain('rel="preload" href="/fonts/barlow-400.woff2"');
    expect(html, path).toContain('rel="preload" href="/fonts/saira-condensed-800.woff2"');
  }
  const fonts = await (await page.request.get("/fonts/fonts.css")).text();
  expect(fonts).toContain('font-family: "Saira Condensed Fallback"');
  expect(fonts).toContain('font-family: "Barlow Fallback"');
});

test("a guide's closing button and link don't overlap on a phone, and the header keeps its height while the fonts load", async ({ browser }) => {
  for (const fonts of [false, true]) {
    const context = await browser.newContext({ viewport: { width: 360, height: 760 } });
    const page = await context.newPage();
    if (!fonts) await page.route("**/*.woff2", (r) => r.abort());
    await page.goto("/guides/flag-football-plays-vs-zone/");
    if (fonts) await page.evaluate(() => document.fonts.ready);
    const btn = await page.locator(".g-cta .g-btn").boundingBox();
    const link = await page.locator(".g-cta .g-link").boundingBox();
    const apart = btn!.y + btn!.height <= link!.y || link!.x >= btn!.x + btn!.width;
    expect(apart, `button ${JSON.stringify(btn)} link ${JSON.stringify(link)}`).toBe(true);
    expect(link!.height).toBeGreaterThanOrEqual(24);
    // One row of header with the stand-in font as with the real one (it used to wrap to two and push the page down).
    expect(await page.locator(".g-top").evaluate((el) => el.getBoundingClientRect().height)).toBeLessThan(110);
    await context.close();
  }
});

test("the home page doesn't download the tool screens for offline use until a tool is opened", async ({ page }) => {
  const asked: string[] = [];
  page.on("request", (r) => asked.push(r.url()));
  await page.goto("/");
  await page.waitForTimeout(5000);
  expect(asked.filter((u) => /\/assets\/(jspdf|scanPdf|Builder)-/.test(u))).toEqual([]);
  await page.goto("/vault");
  await expect.poll(() => asked.some((u) => /\/assets\/jspdf/.test(u)), { timeout: 20_000 }).toBe(true);
});

test("the /partners page is a static page with our own fonts, its own script and the partner form", async ({ page }) => {
  const errors = errorsOf(page);
  const res = await page.request.get("/partners/");
  expect(res.status()).toBe(200);
  const html = await res.text();
  expect(html).toContain("<title>GridIronVault Partners</title>");
  expect(html).toContain("Vaultline Sports LLC");
  expect(html).not.toContain("fonts.googleapis.com");
  // Only our own script file; nothing inline, so the CSP holds.
  expect(html.match(/<script[^>]*>/g)).toEqual(['<script src="/partners/partners.js" defer>']);
  await page.goto("/partners/");
  await expect(page.locator("h1")).toContainText("where the play gets called");
  await expect(page.locator("#partner-form")).toHaveAttribute("action", "/__forms.html");
  await expect(page.locator('#partner-form input[name="form-name"]')).toHaveValue("partner-inquiry");
  expect(errors).toEqual([]);

  // The forms page declares the partner form for Netlify, and the sitemap names the page.
  expect(await (await page.request.get("/__forms.html")).text()).toContain('name="partner-inquiry"');
  expect(await (await page.request.get("/sitemap.xml")).text()).toContain("<loc>https://gridiron-vault.com/partners</loc>");
});
