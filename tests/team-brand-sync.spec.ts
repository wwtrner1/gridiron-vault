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
