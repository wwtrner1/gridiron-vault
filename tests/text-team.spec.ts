import { expect, test } from "@playwright/test";
import { errorsOf, quiet, signIn } from "./helpers";

/**
 * Text the team (My team → Text the team). From the coach's own phone (signed
 * out, or texting from GridIronVault not switched on): the card's counts, a
 * template's [FILL-INS] holding the send back while brackets the coach typed
 * around a value don't, the audience chips, the sent-in-groups screen (groups
 * of 8, sms: links with the signed text, Finish later until every group is
 * opened), "opened in Messages" (never "sent") on the done screen and My team.
 * From GridIronVault (signed in, sending on): one tap to the families who
 * signed up, each family's status, a recheck, and the sign-up link panel.
 */
test.beforeEach(async ({ context }) => quiet(context));

const player = (i: number) => ({
  id: `p${i}`,
  teamId: "my-team",
  updatedAt: "2026-10-01T00:00:00.000Z",
  firstName: `Kid${i}`,
  lastName: "Test",
  jersey: String(i),
  positions: "",
  grade: "",
  birthDate: "",
  height: "",
  weight: "",
  status: "active",
  phone: "",
  email: "",
  text: false,
  address: "",
  medical: "",
  notes: "",
  guardians: [{ name: `Parent ${i}`, relation: "Mom", phone: `615555${String(1000 + i)}`, email: "", text: true }],
});

const offState = { token: "tok_abcdefghijklmnop", signups: [], texts: [], sms: false, sentToday: 0, perDay: 300 };
/** A Head Coach before one-tap sending is switched on: the phone groups are how they text. */
const signedInPhone = (context: import("@playwright/test").BrowserContext) =>
  signIn(context, (route, path, method) => {
    if (path === "my-team/my-team/texts" && method === "GET") return route.fulfill({ json: offState }).then(() => true);
  });

test("write a text, send it from the phone in groups of 8, and see it logged on My team", async ({ context, page }) => {
  const errors = errorsOf(page);
  await signedInPhone(context);
  const players = Array.from({ length: 10 }, (_, i) => player(i + 1));
  players.push({ ...player(11), status: "inactive" }); // never texted
  await page.addInitScript((list) => {
    if (!localStorage.getItem("grid1ronvault.myteam.v1"))
      localStorage.setItem("grid1ronvault.myteam.v1", JSON.stringify({ name: "Lady Vipers 12U", level: "12U", season: "Fall", players: list, charts: [], updatedAt: "2026-10-01T00:00:00.000Z" }));
  }, players);

  await page.goto("/roster");
  const card = page.getByRole("region", { name: "Text the team" });
  await expect(card.locator(".tt-stat").nth(0)).toContainText("11");
  await expect(card.locator(".tt-stat").nth(1)).toContainText("10"); // the inactive player's parent is left out
  await expect(card.locator(".tt-stat").nth(2)).toContainText("0");
  await card.getByRole("link", { name: "Text the team" }).click();
  await expect(page).toHaveURL(/\/roster\/text$/);
  await expect(page).toHaveTitle(/Text the team/);

  // Nothing to send until there is a message; a template's [brackets] hold it back.
  const next = page.getByRole("button", { name: "Next: send from my phone" });
  await expect(next).toBeDisabled();
  await expect(page.getByRole("button", { name: "Everyone · 10" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Players · 0" })).toBeVisible();
  await page.getByRole("button", { name: "Practice moved" }).click();
  await expect(page.getByLabel("Message")).toHaveValue(/\[TIME\]/);
  await expect(page.getByText("Replace [TIME], [DAY], [PLACE] with the real details before you send.")).toBeVisible();
  await expect(next).toBeDisabled();
  // Typing over the word and keeping the brackets counts as filled in; the brackets come off what goes out.
  await page.getByLabel("Message").fill("Practice moved to [6:00 PM] Thursday. Bring water.");
  await expect(page.getByText(/Replace .* before you send/)).toHaveCount(0);
  await expect(page.getByText(/^Signed “— /)).toBeVisible();
  await expect(next).toBeEnabled();
  await expect(page.getByText("10 contacts in 2 groups")).toBeVisible();
  await next.click();

  // Two groups: 8 and 2. Finish later until both are opened.
  await expect(page.getByRole("heading", { name: "Send in 2 groups" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Finish later" })).toBeVisible();
  const first = page.getByRole("link", { name: "Open in Messages: group 1" });
  const href = (await first.getAttribute("href")) ?? "";
  expect(href).toMatch(/^sms:/);
  expect(href.split("?")[0].split(",")).toHaveLength(8);
  expect(decodeURIComponent(href)).toContain("Practice moved to 6:00 PM Thursday. Bring water. — ");
  // Opening a group only marks it; stop the page leaving for the sms: handler.
  await page.route("sms:*", (r) => r.abort());
  await first.evaluate((a) => a.addEventListener("click", (e) => e.preventDefault()));
  await first.click();
  await expect(page.getByText("1/2")).toBeVisible();
  await expect(page.getByRole("button", { name: "Finish later" })).toBeVisible();
  const second = page.getByRole("link", { name: "Open in Messages: group 2" });
  await second.evaluate((a) => a.addEventListener("click", (e) => e.preventDefault()));
  await second.click();
  await expect(page.getByText("2/2")).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();

  await expect(page.getByRole("heading", { name: /Opened in\s*Messages/ })).toBeVisible();
  await expect(page.getByText("Texted from your phone")).toHaveCount(0);
  await expect(page.getByText("10 · 2 groups")).toBeVisible();
  await page.getByRole("link", { name: "Back to My team" }).click();

  // The log shows on My team and survives a reload.
  await expect(page.locator(".tt-recent li").first()).toContainText("Practice moved to 6:00 PM Thursday. Bring water.");
  await expect(page.locator(".tt-recent li").first()).toContainText("10 contacts · opened in Messages");
  await page.reload();
  await expect(page.locator(".tt-stat").nth(2)).toContainText("1");
  // See all opens the team's sent texts.
  await page.getByRole("link", { name: "See all" }).click();
  await expect(page.getByRole("heading", { name: "Sent texts", level: 2 })).toBeVisible();
  await expect(page.getByRole("list", { name: "Sent texts" })).toContainText("10 contacts · opened in Messages from this device");
  expect(errors).toEqual([]);
});

test("with no one marked OK to text, the screen says so and holds the send back", async ({ context, page }) => {
  await signedInPhone(context);
  await page.goto("/roster/text");
  await expect(page.getByText("No numbers to text yet.")).toBeVisible();
  await page.getByLabel("Message").fill("Practice is on.");
  await expect(page.getByRole("button", { name: "Next: send from my phone" })).toBeDisabled();
});

const signup = (id: string, name: string, player: string, phone: string) => ({ id, name, player, phone, createdAt: "2026-11-25T12:00:00.000Z" });
const SIGNUPS = [signup("s1", "Dana Ruiz", "Mia", "+16155550101"), signup("s2", "Lee Park", "Ava", "+16155550102"), signup("s3", "Zoe Kim", "", "+16155550103")];
const recips = (statuses: [string, number | null][]) =>
  SIGNUPS.map((s, i) => ({ name: s.name, player: s.player, phone: s.phone, sid: `SM${String(i).padStart(32, "0")}`, status: statuses[i][0], code: statuses[i][1] }));

test("signed in with texting on: one tap sends to the families who signed up, and each family's status comes back", async ({ context, page }) => {
  const errors = errorsOf(page);
  const sent: unknown[] = [];
  let checks = 0;
  const text = (statuses: [string, number | null][]) => ({ id: "11111111-1111-4111-8111-111111111111", at: "2026-11-25T21:00:00.000Z", body: "Game moved to 10 AM. — Coach", recipients: recips(statuses) });
  await signIn(context, (route, path, method) => {
    const state = { token: "tok_abcdefghijklmnop", signups: SIGNUPS, texts: sent.length ? [text([["delivered", null], ["delivered", null], ["undelivered", 30006]])] : [], sms: true, sentToday: 0, perDay: 300 };
    if (path === "my-team/my-team/texts" && method === "GET") return route.fulfill({ json: state }).then(() => true);
    if (path === "my-team/my-team/texts" && method === "POST") {
      sent.push(route.request().postDataJSON());
      return route.fulfill({ status: 201, json: { ...state, text: text([["queued", null], ["sent", null], ["undelivered", 30006]]) } }).then(() => true);
    }
    if (path.startsWith("my-team/my-team/texts/") && method === "GET") {
      checks++;
      return route.fulfill({ json: { text: text([["delivered", null], ["delivered", null], ["undelivered", 30006]]) } }).then(() => true);
    }
  });
  await page.addInitScript(() => {
    if (!localStorage.getItem("grid1ronvault.myteam.v1"))
      localStorage.setItem("grid1ronvault.myteam.v1", JSON.stringify({ name: "Lady Vipers 12U", players: [], charts: [], updatedAt: "2026-10-01T00:00:00.000Z" }));
  });

  await page.goto("/roster");
  const card = page.getByRole("region", { name: "Text the team" });
  await expect(card.getByText("One tap sends it from GridIronVault's team number")).toBeVisible();
  await expect(card.locator(".tt-stat").nth(1)).toContainText("3");
  await expect(card.locator(".tt-stat").nth(1)).toContainText("Signed up");
  await card.getByRole("link", { name: "Text the team" }).click();

  // The chips count the families who signed up: a blank player name is a player signing up for themselves.
  await expect(page.getByRole("button", { name: "Everyone · 3" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Parents & guardians · 2" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Players · 1" })).toBeVisible();
  await expect(page.getByLabel("Family texts sign-up link")).toHaveValue(/\/join\/tok_abcdefghijklmnop$/);
  await expect(page.getByRole("button", { name: "Next: send from my phone" })).toHaveCount(0);

  const go = page.getByRole("button", { name: "Send to 3 families" });
  await expect(go).toBeDisabled();
  await page.getByLabel("Message").fill("Game moved to 10 AM.");
  await go.click();
  expect(sent).toEqual([{ body: "Game moved to 10 AM.", audience: "all" }]);

  // Every family on its own line; a failure says why. A recheck turns Sent into Delivered.
  await expect(page.getByRole("heading", { name: "Sent to 2 of 3." })).toBeVisible();
  const list = page.getByRole("list", { name: "Each family" });
  await expect(list.locator("li")).toHaveCount(3);
  await expect(list.locator("li").nth(2)).toContainText("That number is a landline");
  await expect(list.locator("li").nth(2)).toContainText("Not delivered");
  await expect(list.locator("li").nth(0)).toContainText("Delivered", { timeout: 10_000 });
  await expect(list.locator("li").nth(1)).toContainText("Delivered");
  expect(checks).toBeGreaterThan(0);
  await expect(page.locator('a[href^="sms:"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("signed in before texting is switched on: the phone flow stays, and families can already sign up", async ({ context, page }) => {
  await signIn(context, (route, path, method) => {
    if (path === "my-team/my-team/texts" && method === "GET")
      return route.fulfill({ json: { token: "tok_abcdefghijklmnop", signups: [], texts: [], sms: false, sentToday: 0, perDay: 300 } }).then(() => true);
  });
  await page.goto("/roster/text");
  await expect(page.getByText("One-tap texting from GridIronVault isn't switched on yet.")).toBeVisible();
  await expect(page.getByLabel("Family texts sign-up link")).toHaveValue(/\/join\/tok_abcdefghijklmnop$/);
  await expect(page.getByRole("button", { name: "Next: send from my phone" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Send to/ })).toHaveCount(0);
});

test("sent texts: every text from GridIronVault stays reviewable with its date, families and status", async ({ context, page }) => {
  const errors = errorsOf(page);
  const older = { id: "22222222-2222-4222-8222-222222222222", at: "2026-11-20T18:00:00.000Z", body: "No practice Friday. — Coach", recipients: recips([["delivered", null], ["delivered", null], ["delivered", null]]) };
  const newer = { id: "33333333-3333-4333-8333-333333333333", at: "2026-11-24T18:00:00.000Z", body: "Picture day Saturday. — Coach", recipients: recips([["delivered", null], ["failed", 30005], ["delivered", null]]) };
  await signIn(context, (route, path, method) => {
    if (path === "my-team/my-team/texts" && method === "GET")
      return route.fulfill({ json: { token: "tok_abcdefghijklmnop", signups: SIGNUPS, texts: [newer, older], sms: true, sentToday: 0, perDay: 300 } }).then(() => true);
    if (path.startsWith("my-team/my-team/texts/") && method === "GET") return route.fulfill({ json: { text: newer } }).then(() => true);
  });
  await page.goto("/roster/text");
  await page.getByRole("button", { name: "Sent texts · 2" }).click();
  const list = page.getByRole("list", { name: "Sent texts" });
  await expect(list.locator("li")).toHaveCount(2);
  await expect(list.locator("li").nth(0)).toContainText("Picture day Saturday.");
  await expect(list.locator("li").nth(0)).toContainText("3 families · 2 delivered · 1 not delivered");
  await expect(list.locator("li").nth(1)).toContainText("No practice Friday.");

  await list.locator("li").nth(0).getByRole("button").click();
  await expect(page.getByRole("heading", { name: "Sent to 2 of 3." })).toBeVisible();
  await expect(page.getByRole("list", { name: "Each family" }).locator("li").nth(1)).toContainText("Not a working mobile number");
  await page.getByRole("button", { name: "Back to sent texts" }).click();
  await expect(page.getByRole("heading", { name: "Sent texts", level: 2 })).toBeVisible();
  expect(errors).toEqual([]);
});

test("on Sideline there is no texting at all, only the way to a plan", async ({ context, page }) => {
  const asked: string[] = [];
  await signIn(context, (route, path) => {
    if (path === "me") return route.fulfill({ json: { user: { id: "u1", email: "coach@example.com", name: "Coach" }, plan: "free" } }).then(() => true);
    if (path.startsWith("my-team/my-team/")) {
      asked.push(path);
      return route.fulfill({ status: 403, json: { error: "Texting your team comes with Head Coach and up.", code: "plan_required" } }).then(() => true);
    }
  });
  await page.goto("/roster");
  const card = page.getByRole("region", { name: "Text the team" });
  await expect(card.getByText("Texting your team comes with Head Coach and up.")).toBeVisible();
  await expect(card.getByRole("link", { name: "Text the team" })).toHaveCount(0);

  await page.goto("/roster/text?view=history");
  await expect(page.getByText("Texting your team comes with Head Coach and up.")).toBeVisible();
  await expect(page.getByRole("link", { name: "See plans" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Next: send from my phone" })).toHaveCount(0);
  await expect(page.getByLabel("Message")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Sent texts", level: 2 })).toHaveCount(0);
  await expect(page.locator('a[href^="sms:"]')).toHaveCount(0);
  expect(asked).toEqual([]);
});

test("signed out there is no texting either: sign in or see plans", async ({ page }) => {
  await page.goto("/roster/text");
  await expect(page.getByText("Texting your team comes with Head Coach and up.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" }).last()).toBeVisible();
  await expect(page.getByLabel("Message")).toHaveCount(0);
});
