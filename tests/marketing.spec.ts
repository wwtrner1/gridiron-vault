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
  await expect(hero.getByRole("link", { name: "Browse 56 starter plays" })).toHaveAttribute("href", "/starters");
  await expect(page.getByRole("heading", { name: "Free while we are in beta" })).toBeVisible();
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
