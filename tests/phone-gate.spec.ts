import { expect, test, type Page, type Route } from "@playwright/test";
import { errorsOf, quiet, signIn } from "./helpers";

/**
 * The phone check ("one login, one coach"), with /api mocked as it answers
 * while Twilio Verify is switched on: a signed-in coach without a number
 * gets "Add your mobile number" over every screen (a bad number and a wrong
 * code refused in the server's words, the code box keeping digits only,
 * Send a new code, Tab staying inside, Sign out as the way out), a new
 * device gets "Confirm this device" with the code to the number on file,
 * and a confirmed code reloads the page with the gate gone.
 */
test.beforeEach(async ({ context }) => quiet(context));

type Security = { required: boolean; verified: boolean; trusted: boolean; phone: string | null; devices: number };

/** A coach whose account answers `security` until a code is confirmed; `posts` keeps every phone call's path and body. */
async function gate(page: Page, start: Security) {
  let security = start;
  const posts: { path: string; body: Record<string, string> }[] = [];
  let refuse: { status: number; error: string } | null = null;
  await signIn(page.context(), async (route: Route, path: string, method: string) => {
    if (path === "me") {
      await route.fulfill({ json: { user: { id: "u1", email: "coach@example.com", name: "Coach" }, plan: "beta", security } });
      return true;
    }
    if (path.startsWith("phone/") && method === "POST") {
      const body = route.request().postDataJSON() as Record<string, string>;
      posts.push({ path, body });
      if (refuse) {
        const r = refuse;
        refuse = null;
        await route.fulfill({ status: r.status, json: { error: r.error } });
        return true;
      }
      if (path.endsWith("-start") || path === "phone/start") {
        await route.fulfill({ json: { sentTo: `•••• ${(body.phone ?? "555-123-4321").slice(-4)}` } });
        return true;
      }
      security = { required: true, verified: true, trusted: true, phone: "•••• 4567", devices: security.devices + 1 };
      await route.fulfill({ json: { security } });
      return true;
    }
  });
  return { posts, refuseNext: (status: number, error: string) => (refuse = { status, error }) };
}

test("a coach without a number adds one: a bad number and a wrong code refused, a new code, then the gate goes", async ({ page }) => {
  const errors = errorsOf(page);
  const { posts, refuseNext } = await gate(page, { required: true, verified: false, trusted: false, phone: null, devices: 0 });
  await page.goto("/vault");
  const dialog = page.getByRole("dialog", { name: "Add your mobile number" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await expect(dialog).toContainText("Each GridIronVault account belongs to one coach. We'll text a code to your phone, and again when you sign in on a new device.");
  await expect(dialog).toContainText("You only do this once per device: up to 5 stay confirmed");
  const number = dialog.getByLabel("Mobile number");
  await expect(number).toBeFocused();
  await expect(dialog.getByRole("button", { name: "Send a new code" })).toHaveCount(0);

  // Tab stays inside: Shift+Tab from the first box lands on the last button.
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button", { name: "Sign out" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(number).toBeFocused();

  // A number the server refuses: its words, and the box kept.
  await number.fill("555-123-4567");
  refuseNext(400, "That doesn't look like a mobile number. Check it and try again.");
  await dialog.getByRole("button", { name: "Text me a code" }).click();
  await expect(dialog.getByRole("alert")).toHaveText("That doesn't look like a mobile number. Check it and try again.");
  await expect(number).toHaveValue("555-123-4567");
  expect(posts).toEqual([{ path: "phone/start", body: { phone: "555-123-4567" } }]);

  // Sent: the code box takes digits only; a wrong code is refused in the server's words.
  await dialog.getByRole("button", { name: "Text me a code" }).click();
  const code = dialog.getByLabel("Code sent to •••• 4567");
  await expect(code).toBeFocused();
  await expect(number).toHaveCount(0);
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await code.pressSequentially("12ab34");
  await expect(code).toHaveValue("1234");
  await code.fill("000000");
  refuseNext(400, "That code isn't right. Check the text and try again.");
  await dialog.getByRole("button", { name: "Confirm" }).click();
  await expect(dialog.getByRole("alert")).toHaveText("That code isn't right. Check the text and try again.");
  expect(posts[2]).toEqual({ path: "phone/check", body: { phone: "555-123-4567", code: "000000", label: expect.stringMatching(/^Chrome on /) } });

  // Send a new code goes out again and clears the box; the right code confirms, and the page comes back with no gate.
  await dialog.getByRole("button", { name: "Send a new code" }).click();
  await expect(code).toHaveValue("");
  expect(posts[3]).toEqual({ path: "phone/start", body: { phone: "555-123-4567" } });
  await code.fill("246810");
  await dialog.getByRole("button", { name: "Confirm" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator("h1")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(posts[4]).toEqual({ path: "phone/check", body: { phone: "555-123-4567", code: "246810", label: expect.stringMatching(/^Chrome on /) } });
  expect(errors).toEqual([]);
});

test("a new device confirms with a code to the number on file, and Sign out is the other way out", async ({ page }) => {
  const errors = errorsOf(page);
  const { posts } = await gate(page, { required: true, verified: true, trusted: false, phone: "•••• 4321", devices: 2 });
  await page.goto("/playbooks");
  const dialog = page.getByRole("dialog", { name: "Confirm this device" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("You're signing in on a new device. We'll text a code to •••• 4321.");
  await expect(dialog.getByLabel("Mobile number")).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Text me a code" })).toBeFocused();

  // The code goes to the number on file, with nothing typed first.
  await dialog.getByRole("button", { name: "Text me a code" }).click();
  const code = dialog.getByLabel("Code sent to •••• 4321");
  await expect(code).toBeFocused();
  expect(posts).toEqual([{ path: "phone/device-start", body: {} }]);
  await code.fill("135791");
  await dialog.getByRole("button", { name: "Confirm" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("h1")).toBeVisible();
  expect(posts[1]).toEqual({ path: "phone/device-check", body: { code: "135791", label: expect.stringMatching(/^Chrome on /) } });

  // Signed in again on yet another device, Sign out leaves the coach signed out with the browser's work in reach.
  await page.evaluate(() => sessionStorage.clear());
  await page.context().route("**/api/me", (route) => route.fulfill({ json: { user: { id: "u1", email: "coach@example.com", name: "Coach" }, plan: "beta", security: { required: true, verified: true, trusted: false, phone: "•••• 4321", devices: 3 } } }));
  await page.reload();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Sign out" }).click();
  await expect(dialog).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem("gotrue.user"))).toBeNull();
  await expect(page.locator("aside#rail-nav").getByRole("link", { name: "Sign in" })).toBeVisible();
  expect(errors).toEqual([]);
});
