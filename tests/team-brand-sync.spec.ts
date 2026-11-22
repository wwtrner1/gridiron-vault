import { expect, test } from "@playwright/test";
import { errorsOf, quiet, signIn } from "./helpers";

test.beforeEach(async ({ context }) => quiet(context));

test("My team and the team brand changed with no signal go to the account when the signal is back", async ({ page, context }) => {
  const errors = errorsOf(page);
  let signal = true;
  const put: Record<string, unknown[]> = { brand: [], "my-team": [] };
  await signIn(context, (route, path, method) => {
    if ((path === "brand" || path === "my-team") && method === "PUT") {
      if (!signal) {
        void route.abort("internetdisconnected");
        return true;
      }
      const body = route.request().postDataJSON();
      put[path].push(body);
      void route.fulfill({ json: body });
      return true;
    }
  });

  await page.goto("/roster");
  await expect(page.getByRole("heading", { level: 1, name: "My team" })).toBeVisible();

  // The signal drops; the coach names the team and the brand anyway.
  signal = false;
  await page.getByLabel("Team name", { exact: true }).fill("Mustangs U10");
  await page.getByLabel("Name on the field and prints").fill("Mustangs");
  await page.waitForTimeout(2500); // past the 1.5 s push delay: the pushes were tried and failed
  expect(put.brand).toHaveLength(0);
  expect(put["my-team"]).toHaveLength(0);
  // Both are kept in this browser.
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("grid1ronvault.myteams.v1")!).teams[0].name)).toBe("Mustangs U10");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("grid1ronvault.brand.v1")!).name)).toBe("Mustangs");

  // The signal is back: both go up without another edit.
  signal = true;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect.poll(() => put.brand.length).toBe(1);
  await expect.poll(() => put["my-team"].length).toBe(1);
  expect((put.brand[0] as { brand: { name: string } }).brand.name).toBe("Mustangs");
  expect((put["my-team"][0] as { teams: { teams: { name: string }[] } }).teams.teams[0].name).toBe("Mustangs U10");

  // Nothing changed since, so the signal flickering again sends nothing more.
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await page.waitForTimeout(500);
  expect(put.brand).toHaveLength(1);
  expect(put["my-team"]).toHaveLength(1);

  expect(errors).toEqual([]);
});

/** Another coach's brand left in this browser, stamped with that coach's account. */
async function seedOtherCoachBrand(context: import("@playwright/test").BrowserContext, owner: string) {
  await context.addInitScript((who) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem(
      "grid1ronvault.brand.v1",
      JSON.stringify({ name: "Sharks", logo: null, primary: "#008E97", secondary: "#FC4C02", logoOnField: true, endZones: true, prints: true, updatedAt: "2099-01-01T00:00:00.000Z" }),
    );
    localStorage.setItem("grid1ronvault.brand.owner.v1", who);
  }, owner);
}

test("A brand another account chose in this browser is never shown to, or sent to, the next coach", async ({ page, context }) => {
  const errors = errorsOf(page);
  const put: unknown[] = [];
  await seedOtherCoachBrand(context, "someone-else");
  await signIn(context, (route, path, method) => {
    if (path === "brand" && method === "PUT") {
      put.push(route.request().postDataJSON());
      void route.fulfill({ json: route.request().postDataJSON() });
      return true;
    }
  });

  await page.goto("/roster");
  const panel = page.getByRole("region", { name: "Team branding" });
  await expect(panel.getByLabel("Name on the field and prints")).toHaveValue("");
  await expect(panel.getByLabel("Primary color")).toHaveValue("#0b1524");
  expect(await page.evaluate(() => localStorage.getItem("grid1ronvault.brand.owner.v1"))).toBe("u1");
  await page.waitForTimeout(2000);
  expect(put).toHaveLength(0);

  // This coach's own brand still goes to their account.
  await panel.getByLabel("Name on the field and prints").fill("Mustangs");
  await expect.poll(() => put.length).toBe(1);
  expect((put[0] as { brand: { name: string } }).brand.name).toBe("Mustangs");
  expect(errors).toEqual([]);
});

test("Signing out puts the plain look back instead of leaving the account's brand on screen", async ({ page, context }) => {
  const errors = errorsOf(page);
  await seedOtherCoachBrand(context, "u1");
  await page.goto("/roster");
  const panel = page.getByRole("region", { name: "Team branding" });
  await expect(panel.getByLabel("Name on the field and prints")).toHaveValue("");
  expect(await page.evaluate(() => localStorage.getItem("grid1ronvault.brand.owner.v1"))).toBeNull();
  expect(errors).toEqual([]);
});

test("A brand made signed out stays and goes to the account on sign-in", async ({ page, context }) => {
  const errors = errorsOf(page);
  const put: unknown[] = [];
  await context.addInitScript(() => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("grid1ronvault.brand.v1", JSON.stringify({ name: "Hawks", logo: null, primary: "#1B2A4A", secondary: "#F2B705", logoOnField: true, endZones: true, prints: true, updatedAt: "2026-11-01T00:00:00.000Z" }));
  });
  await signIn(context, (route, path, method) => {
    if (path === "brand" && method === "PUT") {
      put.push(route.request().postDataJSON());
      void route.fulfill({ json: route.request().postDataJSON() });
      return true;
    }
  });
  await page.goto("/roster");
  await expect(page.getByRole("region", { name: "Team branding" }).getByLabel("Name on the field and prints")).toHaveValue("Hawks");
  await expect.poll(() => put.length).toBe(1);
  expect(errors).toEqual([]);
});

const PIXEL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

test("The account's own brand beats a brand this browser holds with no account recorded", async ({ page, context }) => {
  const errors = errorsOf(page);
  const put: unknown[] = [];
  // An old shared browser: someone's brand with a newer stamp and no record of whose it is.
  await context.addInitScript(() => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("grid1ronvault.brand.v1", JSON.stringify({ name: "Sharks", logo: null, primary: "#008E97", secondary: "#FC4C02", logoOnField: true, endZones: true, prints: true, updatedAt: "2099-01-01T00:00:00.000Z" }));
  });
  await signIn(context, (route, path, method) => {
    if (path === "brand" && method === "GET") {
      void route.fulfill({ json: { brand: { name: "Mustangs", logo: null, primary: "#1B2A4A", secondary: "#F2B705", logoOnField: true, endZones: true, prints: true, updatedAt: "2026-11-01T00:00:00.000Z" } } });
      return true;
    }
    if (path === "brand" && method === "PUT") {
      put.push(route.request().postDataJSON());
      void route.fulfill({ json: route.request().postDataJSON() });
      return true;
    }
  });
  await page.goto("/roster");
  await expect(page.getByRole("region", { name: "Team branding" }).getByLabel("Name on the field and prints")).toHaveValue("Mustangs");
  await page.waitForTimeout(2000);
  expect(put).toHaveLength(0);
  expect(errors).toEqual([]);
});

test("A logo the account refuses to hold (the owner's) goes back to the plain look", async ({ page, context }) => {
  const errors = errorsOf(page);
  let puts = 0;
  // This browser holds the owner's logo for this coach's account, as an old build left it.
  await context.addInitScript((logo) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("grid1ronvault.brand.v1", JSON.stringify({ name: "Dolphins", logo, primary: "#008E97", secondary: "#FC4C02", logoOnField: true, endZones: true, prints: true, updatedAt: "2026-11-02T00:00:00.000Z" }));
    localStorage.setItem("grid1ronvault.brand.owner.v1", "u1");
  }, PIXEL);
  await signIn(context, (route, path, method) => {
    if (path === "brand" && (method === "GET" || method === "PUT")) {
      if (method === "PUT") puts++;
      void route.fulfill({ json: { brand: null, withheld: true } });
      return true;
    }
  });
  await page.goto("/roster");
  const panel = page.getByRole("region", { name: "Team branding" });
  await expect(panel.getByLabel("Name on the field and prints")).toHaveValue("");
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("grid1ronvault.brand.v1")!).logo)).toBeNull();
  expect(puts).toBe(1);
  // It is not sent again on its own.
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await page.waitForTimeout(500);
  expect(puts).toBe(1);
  expect(errors).toEqual([]);
});
