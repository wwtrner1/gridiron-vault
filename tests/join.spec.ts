import { expect, test } from "@playwright/test";
import { errorsOf, quiet, signIn } from "./helpers";

/**
 * Family texts: a parent signing up on the team's public `/join/:token` page
 * (the consent box, the sign-up, the same number again, a refusal, a dead
 * link), and the coach's side on Front Office → Messages → Players & families
 * (the link, Copy link, taking someone off, a new link), with `/api` mocked.
 */
test.beforeEach(async ({ context }) => quiet(context));

const DEAD = "This sign-up link isn't active. Ask your coach for the team's current link.";

test("a parent signs up for team texts, is told when the number was already on the list, and sees refusals in plain words", async ({ page, context }) => {
  const errors = errorsOf(page);
  const posted: Record<string, unknown>[] = [];
  let answer: { status?: number; json: Record<string, unknown> } = { status: 201, json: { ok: true, confirmed: true } };
  await context.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api\//, "");
    const method = route.request().method();
    if (path === "join/tok1" && method === "GET") return route.fulfill({ json: { team: "U10 Mustangs", org: "Vaultline Youth" } });
    if (path === "join/tok1" && method === "POST") {
      posted.push(JSON.parse(route.request().postData() ?? "{}"));
      return route.fulfill({ status: answer.status ?? 200, json: answer.json });
    }
    if (path.startsWith("join/")) return route.fulfill({ status: 404, json: { error: DEAD } });
    return route.fulfill({ status: 204, body: "" });
  });

  await page.goto("/join/tok1");
  await expect(page.getByRole("heading", { name: "U10 Mustangs team texts" })).toBeVisible();
  await expect(page.getByText("from the U10 Mustangs coaches (Vaultline Youth) by text.")).toBeVisible();
  await expect(page).toHaveTitle(/Team texts sign-up/);
  // No Shell, no Griddy: just the form.
  await expect(page.locator(".shell")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Griddy/ })).toHaveCount(0);

  const send = page.getByRole("button", { name: "Sign me up for team texts" });
  await expect(send).toBeDisabled();
  await page.getByLabel("Your name").fill("Dana Hill");
  await page.getByLabel("Player's name").fill("Marcus");
  await page.getByLabel("Mobile number").fill("(615) 555-0142");
  const consent = page.getByRole("checkbox", { name: /Text me team updates from U10 Mustangs coaches/ });
  await expect(page.getByText("Consent is not a condition of joining the team.")).toBeVisible();
  await expect(send).toBeDisabled();
  await consent.check();
  await expect(send).toBeEnabled();
  await send.click();
  await expect(page.getByRole("main").getByRole("status")).toContainText("You're on the list");
  await expect(page.getByRole("main").getByRole("status")).toContainText("You'll get U10 Mustangs updates by text. A confirmation text is on its way. Reply STOP to any text to stop them.");
  expect(posted).toEqual([{ name: "Dana Hill", player: "Marcus", phone: "(615) 555-0142", consent: true }]);

  // The same number again updates the details instead of adding a second entry.
  answer = { json: { ok: true, again: true } };
  await page.goto("/join/tok1");
  await page.getByLabel("Your name").fill("Dana Hill");
  await page.getByLabel("Mobile number").fill("6155550142");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Sign me up for team texts" }).click();
  await expect(page.getByRole("main").getByRole("status")).toContainText("That number was already signed up for U10 Mustangs texts. We've updated your details.");

  // A refusal stays on the form, in the server's own words.
  answer = { status: 400, json: { error: "Enter a 10-digit US mobile number." } };
  await page.goto("/join/tok1");
  await page.getByLabel("Your name").fill("Dana");
  await page.getByLabel("Mobile number").fill("12345");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Sign me up for team texts" }).click();
  await expect(page.getByRole("alert")).toHaveText("Enter a 10-digit US mobile number.");
  await expect(page.getByLabel("Your name")).toHaveValue("Dana");

  // A retired link.
  await page.goto("/join/old-token");
  await expect(page.getByRole("heading", { name: "This link isn't working" })).toBeVisible();
  await expect(page.getByText(DEAD)).toBeVisible();
  expect(errors).toEqual([]);
});

const org = { id: "org1", name: "Vaultline Youth", seats: 3, members: [], shares: [] };
const team = { id: "t1", name: "U10 Mustangs", level: "U10", season: "Fall 2026", color: "#1d4ed8", coachIds: [], allCoaches: true, players: 0 };
type Signup = { id: string; name: string; player: string; phone: string; createdAt: string };

test("the coach shares the sign-up link, sees who signed up, takes one off and makes a new link", async ({ page, context }) => {
  const errors = errorsOf(page);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  let token = "tok1";
  let signups: Signup[] = [
    { id: "s1", name: "Dana Hill", player: "Marcus", phone: "+16155550142", createdAt: "2026-10-30T15:00:00Z" },
    { id: "s2", name: "Chris Lee", player: "", phone: "+16155550199", createdAt: "2026-10-30T16:00:00Z" },
  ];
  const list = () => ({ token, signups, sms: false });
  const fresh: unknown[] = [];
  await signIn(context, async (route, path, method) => {
    if (path === "orgs" && method === "GET") return (await route.fulfill({ json: { mine: org, joined: [], invites: [] } }), true);
    if (path === "hub/org1" && method === "GET") return (await route.fulfill({ json: { org: { id: "org1", name: "Vaultline Youth" }, role: "director", teams: [team], coaches: [] } }), true);
    if (path === "teams/t1/players" && method === "GET") return (await route.fulfill({ json: { players: [] } }), true);
    if (path === "hub/org1/messages" && method === "GET") return (await route.fulfill({ json: { messages: [], delivery: { email: false, sms: false } } }), true);
    if (path === "teams/t1/texts" && method === "GET") return (await route.fulfill({ json: list() }), true);
    if (path === "teams/t1/texts" && method === "POST") {
      fresh.push(JSON.parse(route.request().postData() ?? "{}"));
      token = "tok2";
      return (await route.fulfill({ json: list() }), true);
    }
    if (path.startsWith("text-signups/") && method === "DELETE") {
      signups = signups.filter((s) => s.id !== path.slice("text-signups/".length));
      return (await route.fulfill({ json: list() }), true);
    }
  });

  await page.goto("/front-office?tab=messages");
  const panel = page.getByRole("region", { name: "U10 Mustangs messages" });
  await panel.getByRole("group", { name: "Who the messages are for" }).getByRole("button", { name: /Players & families/ }).click();
  await expect(panel.getByText("0 email addresses on the roster and 2 phones signed up for team texts.")).toBeVisible();

  const head = panel.getByRole("button", { name: /Family texts sign-up/ });
  await expect(head).toContainText("2");
  if ((await head.getAttribute("aria-expanded")) !== "true") await head.click();
  const link = panel.getByLabel("Family texts sign-up link");
  await expect(link).toHaveValue(/\/join\/tok1$/);
  await expect(panel.getByText("Texting from GridIronVault isn't switched on yet.")).toBeVisible();
  await panel.getByRole("button", { name: "Copy link" }).click();
  await expect(page.getByText("Sign-up link copied.")).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/\/join\/tok1$/);

  const rows = panel.locator(".hub-feed > li");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText("Dana Hill");
  await expect(rows.nth(0)).toContainText("Marcus · (615) 555-0142");
  await expect(rows.nth(1)).toContainText("(615) 555-0199");
  await panel.getByRole("button", { name: "Take Dana Hill off team texts" }).click();
  await expect(page.getByText("Dana Hill is off team texts.")).toBeVisible();
  await expect(rows).toHaveCount(1);
  await expect(panel.getByText("0 email addresses on the roster and 1 phone signed up for team texts.")).toBeVisible();

  await panel.getByRole("button", { name: "New link" }).click();
  const confirm = page.getByRole("dialog", { name: "Make a new sign-up link?" });
  await expect(confirm).toContainText("The old link stops working the moment the new one is made");
  await confirm.getByRole("button", { name: "Make a new link" }).click();
  await expect(page.getByText("New sign-up link ready.")).toBeVisible();
  expect(fresh).toEqual([{ fresh: true }]);
  await expect(link).toHaveValue(/\/join\/tok2$/);
  await expect(rows).toHaveCount(1);
  expect(errors).toEqual([]);
});
