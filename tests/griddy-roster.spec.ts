import { expect, test } from "@playwright/test";
import { errorsOf, quiet, signIn } from "./helpers";

/**
 * Griddy and the roster: on My team he gets the players' names, numbers and
 * status (never their contacts), his card takes the players the coach named
 * off the roster or changes their status, the roster on screen follows, and
 * Undo puts them back.
 */
test.beforeEach(async ({ context }) => quiet(context));

const player = (id: string, firstName: string, lastName: string, jersey: string) => ({
  id,
  teamId: "my-team",
  updatedAt: "2026-11-01T00:00:00.000Z",
  firstName,
  lastName,
  jersey,
  positions: "",
  grade: "",
  birthDate: "",
  height: "",
  weight: "",
  status: "active",
  phone: "615-555-0100",
  email: "family@example.com",
  text: false,
  address: "",
  guardians: [{ name: "Rebecca Crawford", relation: "Mom", phone: "615-555-0101", email: "mom@example.com", text: true }],
  medical: "",
  notes: "",
});

const team = (page: import("@playwright/test").Page) =>
  page.evaluate(
    () =>
      (JSON.parse(localStorage.getItem("grid1ronvault.myteams.v1") ?? "{}") as { teams: { players: { id: string; firstName: string; status: string }[] }[] }).teams[0],
  );

/** My team as this browser keeps it: a list of teams, the first one open. */
const seed = (players: unknown[]) =>
  JSON.stringify({ teams: [{ id: "my-team", name: "Hawks", level: "", season: "", players, charts: [], updatedAt: "2026-11-01T00:00:00.000Z" }], updatedAt: "2026-11-01T00:00:00.000Z" });

test("Griddy removes the players the coach names from My team, marks one injured, and Undo puts them back", async ({ page, context }) => {
  const errors = errorsOf(page);
  await context.addInitScript(
    (doc) => {
      if (!localStorage.getItem("grid1ronvault.myteams.v1")) localStorage.setItem("grid1ronvault.myteams.v1", doc);
    },
    seed([player("pa", "Casen", "Crawford", "1"), player("pb", "Harvey", "Diehl", "3"), player("pc", "Mack", "Turner", "12")]),
  );
  const sent: { context: { roster?: { team: string; players: Record<string, unknown>[] } | null } }[] = [];
  await signIn(context, async (route, path) => {
    if (path !== "ai/griddy") return;
    sent.push(JSON.parse(route.request().postData() ?? "{}"));
    const reply =
      sent.length === 1
        ? {
            text: "Here they are.",
            actions: [
              {
                id: "r1",
                tool: "edit_roster",
                team: "Hawks",
                remove: [
                  { id: "pa", name: "Casen Crawford" },
                  { id: "pb", name: "Harvey Diehl" },
                ],
                update: [{ id: "pc", name: "Mack Turner", status: "injured" }],
              },
            ],
          }
        : { text: "Done.", actions: [] };
    await route.fulfill({ json: { reply } });
    return true;
  });

  await page.goto("/roster");
  await expect(page.getByRole("button", { name: "Open Casen Crawford" })).toBeVisible();
  await page.locator(".gd-launch").click();
  const box = page.locator(".gd-panel textarea").first();
  await box.fill("Remove Casen Crawford and Harvey Diehl, and mark Mack injured");
  await box.press("Enter");

  // He sees the roster on screen: names, numbers and status, never a phone, email or guardian.
  await expect.poll(() => sent.length).toBe(1);
  const roster = sent[0].context.roster!;
  expect(roster.team).toBe("Hawks");
  expect(roster.players.map((p) => p.name)).toEqual(["Casen Crawford", "Harvey Diehl", "Mack Turner"]);
  expect(Object.keys(roster.players[0]).sort()).toEqual(["id", "jersey", "name", "positions", "status"]);
  expect(JSON.stringify(sent[0])).not.toContain("615-555");

  const card = page.locator(".gd-roster");
  await expect(card).toContainText("Take off the roster");
  await expect(card).toContainText("Casen Crawford");
  await expect(card).toContainText("Mack Turner");
  await card.getByRole("button", { name: "Apply to the roster" }).click();
  await expect(page.locator(".toast", { hasText: "Hawks roster updated: 2 removed, 1 changed" })).toBeVisible();

  // The roster on screen follows, and the change is saved in this browser.
  await expect(page.getByRole("button", { name: "Open Casen Crawford" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Open Harvey Diehl" })).toHaveCount(0);
  let saved = await team(page);
  expect(saved.players.map((p) => p.firstName)).toEqual(["Mack"]);
  expect(saved.players[0].status).toBe("injured");

  // Undo: both back, Mack active again.
  await card.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("button", { name: "Open Casen Crawford" })).toBeVisible();
  saved = await team(page);
  expect(saved.players.map((p) => p.firstName).sort()).toEqual(["Casen", "Harvey", "Mack"]);
  expect(saved.players.find((p) => p.firstName === "Mack")!.status).toBe("active");
  expect(errors).toEqual([]);
});

test("Away from the roster, the players go to Griddy only when the coach talks about them", async ({ page, context }) => {
  await context.addInitScript((doc) => localStorage.setItem("grid1ronvault.myteams.v1", doc), seed([player("pa", "Casen", "Crawford", "1")]));
  const sent: { context: { roster?: unknown } }[] = [];
  await signIn(context, async (route, path) => {
    if (path !== "ai/griddy") return;
    sent.push(JSON.parse(route.request().postData() ?? "{}"));
    await route.fulfill({ json: { reply: { text: "Sure.", actions: [] } } });
    return true;
  });
  await page.goto("/vault");
  await page.locator(".gd-launch").click();
  const box = page.locator(".gd-panel textarea").first();
  await box.fill("What beats Cover 2?");
  await box.press("Enter");
  await expect.poll(() => sent.length).toBe(1);
  expect(sent[0].context.roster ?? null).toBeNull();
  // Asked about players, My team goes along.
  await box.fill("take Casen off the roster");
  await box.press("Enter");
  await expect.poll(() => sent.length).toBe(2);
  expect(sent[1].context.roster).toMatchObject({ team: "Hawks", players: [{ id: "pa", name: "Casen Crawford" }] });
});
