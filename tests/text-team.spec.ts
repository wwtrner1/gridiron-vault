import { expect, test } from "@playwright/test";
import { errorsOf, quiet } from "./helpers";

/**
 * Text the team (My team → Text the team): the card's counts, a template with
 * [brackets] holding the send back, the audience chips, the sent-in-groups
 * screen (groups of 8, sms: links with the signed text, Finish later until
 * every group is opened), the log on the done screen and its place on My team.
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

test("write a text, send it from the phone in groups of 8, and see it logged on My team", async ({ page }) => {
  const errors = errorsOf(page);
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
  await expect(page.getByText("Fill in the [brackets] before you send.")).toBeVisible();
  await expect(next).toBeDisabled();
  await page.getByLabel("Message").fill("Practice moved to 6:00 PM Thursday. Bring water.");
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
  await page.getByRole("button", { name: "Done: log it" }).click();

  await expect(page.getByRole("heading", { name: /has the call/ })).toBeVisible();
  await expect(page.getByText("10 · 2 groups")).toBeVisible();
  await page.getByRole("link", { name: "Back to My team" }).click();

  // The log shows on My team and survives a reload.
  await expect(page.locator(".tt-recent li").first()).toContainText("Practice moved to 6:00 PM Thursday. Bring water.");
  await expect(page.locator(".tt-recent li").first()).toContainText("10 contacts · 2 groups");
  await page.reload();
  await expect(page.locator(".tt-stat").nth(2)).toContainText("1");
  expect(errors).toEqual([]);
});

test("with no one marked OK to text, the screen says so and holds the send back", async ({ page }) => {
  await page.goto("/roster/text");
  await expect(page.getByText("No numbers to text yet.")).toBeVisible();
  await page.getByLabel("Message").fill("Practice is on.");
  await expect(page.getByRole("button", { name: "Next: send from my phone" })).toBeDisabled();
});
