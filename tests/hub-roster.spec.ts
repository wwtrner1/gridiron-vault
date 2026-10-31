import { expect, test } from "@playwright/test";
import { errorsOf, quiet, signIn } from "./helpers";

/**
 * Front Office → Roster and Depth chart on a team, with the hub API mocked
 * (the My team test covers the same tabs over the browser's own team): a
 * player added, edited and removed through the API, a refusal kept in the
 * dialog, the team chip's player count, and the depth chart's autosave (one
 * PUT per burst of changes, and whatever is still waiting sent when the coach
 * leaves the tab).
 */
test.beforeEach(async ({ context }) => quiet(context));

const org = { id: "org1", name: "Vaultline Youth", seats: 12, members: [], shares: [] };
type Player = Record<string, unknown> & { id: string; firstName: string; lastName: string; jersey: string };
type Slot = { key: string; label: string; letter: string; playerIds: string[] };

test("players are added, edited and removed through the API, and a refusal stays in the dialog", async ({ page, context }) => {
  const errors = errorsOf(page);
  let players: Player[] = [];
  let n = 1;
  const calls: string[] = [];
  const team = () => ({ id: "t1", name: "U10 Mustangs", level: "U10", season: "Fall 2026", color: "#1d4ed8", coachIds: [], allCoaches: true, players: players.length });
  await signIn(context, async (route, path, method) => {
    if (path === "orgs" && method === "GET") return (await route.fulfill({ json: { mine: org, joined: [], invites: [] } }), true);
    if (path === "hub/org1" && method === "GET") return (await route.fulfill({ json: { org: { id: "org1", name: "Vaultline Youth" }, role: "director", teams: [team()], coaches: [] } }), true);
    if (path === "teams/t1/players" && method === "GET") return (await route.fulfill({ json: { players } }), true);
    if (path === "teams/t1/players" && method === "POST") {
      const { players: list } = JSON.parse(route.request().postData() ?? "{}") as { players: Record<string, unknown>[] };
      calls.push(`POST ${list.map((p) => p.firstName).join(",")}`);
      if (list[0]?.firstName === "Refuse") return (await route.fulfill({ status: 403, json: { error: "This roster is full. Remove someone first." } }), true);
      players = [...players, ...list.map((p) => ({ ...p, id: `p${n++}`, teamId: "t1", updatedAt: new Date().toISOString() }) as unknown as Player)];
      return (await route.fulfill({ json: { players, added: list.length } }), true);
    }
    const one = /^team-players\/(p\d+)$/.exec(path);
    if (one && method === "PUT") {
      const { player } = JSON.parse(route.request().postData() ?? "{}") as { player: Record<string, unknown> };
      calls.push(`PUT ${one[1]} jersey=${String(player.jersey)}`);
      players = players.map((p) => (p.id === one[1] ? { ...p, ...player } : p));
      return (await route.fulfill({ json: { players } }), true);
    }
    if (one && method === "DELETE") {
      calls.push(`DELETE ${one[1]}`);
      players = players.filter((p) => p.id !== one[1]);
      return (await route.fulfill({ json: { players } }), true);
    }
  });

  await page.goto("/front-office?tab=roster");
  await expect(page.getByRole("heading", { name: "No players yet" })).toBeVisible();
  const chip = page.getByRole("group", { name: "Teams" }).getByRole("button", { name: /^U10 Mustangs/ });
  await expect(chip).toContainText("0 players");

  await page.getByRole("button", { name: "Add player" }).first().click();
  const add = page.getByRole("dialog", { name: "Add a player" });
  await add.getByLabel("First name").fill("Marcus");
  await add.getByLabel("Last name").fill("Hill");
  await add.getByLabel("Jersey #").fill("12");
  await add.getByLabel("Positions").fill("QB");
  await add.getByRole("button", { name: "Add player", exact: true }).click();
  await expect(add).toBeHidden();
  await expect(page.getByText("Marcus Hill added.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Open Marcus Hill" })).toBeVisible();
  await expect(chip).toContainText("1 player");

  // Edit: the jersey changes through PUT.
  await page.getByRole("button", { name: "Open Marcus Hill" }).click();
  const edit = page.getByRole("dialog", { name: "Marcus Hill" });
  await expect(edit.getByLabel("Jersey #")).toHaveValue("12");
  await edit.getByLabel("Jersey #").fill("7");
  await edit.getByRole("button", { name: "Save player" }).click();
  await expect(edit).toBeHidden();
  await expect(page.getByText("Saved.")).toBeVisible();
  await expect(page.getByRole("row", { name: /Marcus Hill/ }).locator(".hub-num")).toHaveText("7");

  // A refusal keeps the dialog open with the server's words.
  await page.getByRole("button", { name: "Add player" }).first().click();
  await add.getByLabel("First name").fill("Refuse");
  await add.getByLabel("Last name").fill("Me");
  await add.getByRole("button", { name: "Add player", exact: true }).click();
  await expect(add.getByRole("alert")).toHaveText("This roster is full. Remove someone first.");
  await add.getByRole("button", { name: "Cancel" }).click();

  // Remove, through the dialog's own confirm.
  await page.getByRole("button", { name: "Open Marcus Hill" }).click();
  await edit.getByRole("button", { name: "Remove", exact: true }).click();
  await edit.getByRole("button", { name: "Yes, remove from roster" }).click();
  await expect(edit).toBeHidden();
  await expect(page.getByText("Marcus Hill removed from the roster.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "No players yet" })).toBeVisible();
  await expect(chip).toContainText("0 players");
  expect(calls).toEqual(["POST Marcus", "PUT p1 jersey=7", "POST Refuse", "DELETE p1"]);
  expect(errors).toEqual([]);
});

test("the depth chart autosaves one PUT per burst and sends a waiting change when the coach leaves the tab", async ({ page, context }) => {
  const errors = errorsOf(page);
  const player = (id: string, first: string, jersey: string, positions: string) => ({
    id, teamId: "t1", updatedAt: "2026-10-30T10:00:00Z", firstName: first, lastName: "Hill", jersey, positions, grade: "", birthDate: "", height: "", weight: "", status: "active",
    phone: "", email: "", text: false, guardians: [], medical: "", notes: "",
  });
  const players = [player("p1", "Marcus", "12", "QB"), player("p2", "Jalen", "3", "WR")];
  let charts: { unit: string; slots: Slot[]; updatedAt: string }[] = [];
  const puts: { unit: string; slots: Slot[] }[] = [];
  const team = { id: "t1", name: "U10 Mustangs", level: "U10", season: "Fall 2026", color: "#1d4ed8", coachIds: [], allCoaches: true, players: 2 };
  await signIn(context, async (route, path, method) => {
    if (path === "orgs" && method === "GET") return (await route.fulfill({ json: { mine: org, joined: [], invites: [] } }), true);
    if (path === "hub/org1" && method === "GET") return (await route.fulfill({ json: { org: { id: "org1", name: "Vaultline Youth" }, role: "director", teams: [team], coaches: [] } }), true);
    if (path === "teams/t1/players" && method === "GET") return (await route.fulfill({ json: { players } }), true);
    if (path === "teams/t1/depth" && method === "GET") return (await route.fulfill({ json: { charts } }), true);
    if (path === "teams/t1/depth" && method === "PUT") {
      const body = JSON.parse(route.request().postData() ?? "{}") as { unit: string; slots: Slot[] };
      puts.push(body);
      charts = [...charts.filter((c) => c.unit !== body.unit), { ...body, updatedAt: new Date().toISOString() }];
      return (await route.fulfill({ json: { charts } }), true);
    }
  });

  await page.goto("/front-office?tab=depth&team=t1");
  const panel = page.getByRole("region", { name: "U10 Mustangs depth chart" });
  await expect(panel).toBeVisible();
  await expect(panel.getByText("All changes saved")).toBeVisible();

  // The preset and a starter inside one burst: one save.
  await panel.getByRole("button", { name: "Flag 5-on-5" }).click();
  await expect(panel.getByText("Unsaved")).toBeVisible();
  await panel.getByLabel("Add a player at QB").selectOption({ label: "#12 Marcus Hill (QB)" });
  await expect(panel.getByText("All changes saved")).toBeVisible();
  await expect.poll(() => puts.length).toBe(1);
  expect(puts[0].unit).toBe("offense");
  expect(puts[0].slots.map((s) => s.label)).toEqual(["QB", "Center", "X", "Y", "Z"]);
  expect(puts[0].slots[0].playerIds).toEqual(["p1"]);
  await expect(panel.locator(".hub-slot").first()).toContainText("Marcus Hill");

  // Defense keeps its own save.
  await panel.getByRole("group", { name: "Unit" }).getByRole("button", { name: "Defense" }).click();
  await expect(panel.locator(".hub-slot:not(.hub-slot-add)")).toHaveCount(0);
  await panel.getByRole("button", { name: "Blank" }).click();
  await expect.poll(() => puts.length).toBe(2);
  expect(puts[1].unit).toBe("defense");
  expect(puts[1].slots.map((s) => s.label)).toEqual(["Spot"]);

  // A change made a moment before leaving the tab is still sent.
  await panel.getByRole("group", { name: "Unit" }).getByRole("button", { name: "Offense" }).click();
  await panel.getByLabel("Add a player at X").selectOption({ label: "#3 Jalen Hill (WR)" });
  await page.getByRole("tab", { name: "Roster" }).click();
  await expect(page.getByRole("button", { name: "Open Marcus Hill" })).toBeVisible();
  await expect.poll(() => puts.length).toBe(3);
  expect(puts[2].unit).toBe("offense");
  expect(puts[2].slots.find((s) => s.label === "X")?.playerIds).toEqual(["p2"]);

  // Back on the chart, the account's copy is what shows.
  await page.getByRole("tab", { name: "Depth chart" }).click();
  await expect(panel.locator(".hub-slot").first()).toContainText("Marcus Hill");
  await expect(panel.locator(".hub-slot").nth(2)).toContainText("Jalen Hill");
  expect(errors).toEqual([]);
});
