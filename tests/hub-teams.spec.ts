import { expect, test } from "@playwright/test";
import { errorsOf, quiet, signIn } from "./helpers";

/**
 * Front Office → the team picker, with the hub API mocked: the director's
 * empty state, Add a team (name, level, season, color, a hand-picked staff),
 * the team chip and address, Team settings (rename), a second team and
 * switching between them, Remove team through its in-box confirm, a refusal
 * in coach words, and what a coach on no team's staff sees.
 */
test.beforeEach(async ({ context }) => quiet(context));

const org = { id: "org1", name: "Vaultline Youth", seats: 12, members: [], shares: [] };
type Team = { id: string; name: string; level: string; season: string; color: string; coachIds: string[]; allCoaches: boolean; players: number };
const coaches = [
  { id: "m1", name: "Coach Smith", email: "smith@example.com", active: true },
  { id: "m2", name: "", email: "dee@example.com", active: false },
];

test("the director adds, renames, switches and removes teams", async ({ page, context }) => {
  const errors = errorsOf(page);
  let teams: Team[] = [];
  let n = 1;
  const posted: Record<string, unknown>[] = [];
  const hub = () => ({ org: { id: "org1", name: "Vaultline Youth" }, role: "director", teams, coaches });
  await signIn(context, async (route, path, method) => {
    if (path === "orgs" && method === "GET") return (await route.fulfill({ json: { mine: org, joined: [], invites: [] } }), true);
    if (path === "hub/org1" && method === "GET") return (await route.fulfill({ json: hub() }), true);
    if (path === "teams" && method === "POST") {
      const body = JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>;
      posted.push(body);
      if (body.name === "Refuse me") return (await route.fulfill({ status: 403, json: { error: "Your Front Office has all the teams its plan allows. See plans to add more." } }), true);
      const id = `t${n++}`;
      teams = [...teams, { id, name: String(body.name), level: String(body.level ?? ""), season: String(body.season ?? ""), color: String(body.color ?? ""), coachIds: (body.coachIds as string[]) ?? [], allCoaches: Boolean(body.allCoaches), players: 0 }];
      return (await route.fulfill({ json: { ...hub(), created: id } }), true);
    }
    const one = /^teams\/(t\d+)$/.exec(path);
    if (one && method === "PUT") {
      const body = JSON.parse(route.request().postData() ?? "{}") as Partial<Team>;
      teams = teams.map((t) => (t.id === one[1] ? { ...t, ...body } : t));
      return (await route.fulfill({ json: hub() }), true);
    }
    if (one && method === "DELETE") {
      teams = teams.filter((t) => t.id !== one[1]);
      return (await route.fulfill({ json: hub() }), true);
    }
    if (/^teams\/t\d+\/players$/.test(path) && method === "GET") return (await route.fulfill({ json: { players: [] } }), true);
  });

  await page.goto("/front-office?tab=roster");
  await expect(page.getByRole("heading", { name: "Add your first team" })).toBeVisible();
  await page.getByRole("button", { name: "Add a team" }).click();
  const dialog = page.getByRole("dialog", { name: "Add a team" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Add team" })).toBeDisabled();
  await dialog.getByLabel("Team name").fill("U10 Mustangs");
  await dialog.getByLabel("Level or age group").fill("U10");
  await expect(dialog.getByLabel("Season")).toHaveValue(String(new Date().getFullYear()));
  await dialog.getByLabel("Season").fill("Fall 2026");
  await dialog.getByRole("button", { name: "Color #c0392b" }).click();
  await expect(dialog.getByRole("button", { name: "Color #c0392b" })).toHaveAttribute("aria-pressed", "true");
  const every = dialog.getByRole("checkbox", { name: "Every coach in Vaultline Youth" });
  await expect(every).toBeChecked();
  await every.uncheck();
  await dialog.getByRole("checkbox", { name: "Coach Smith" }).check();
  await expect(dialog.getByText("dee@example.com (invited, not joined yet)")).toBeVisible();
  await dialog.getByRole("button", { name: "Add team" }).click();
  await expect(dialog).toBeHidden();
  expect(posted).toEqual([{ name: "U10 Mustangs", level: "U10", season: "Fall 2026", color: "#c0392b", coachIds: ["m1"], allCoaches: false, orgId: "org1" }]);

  const picker = page.getByRole("group", { name: "Teams" });
  const mustangs = picker.getByRole("button", { name: /^U10 Mustangs/ });
  await expect(mustangs).toHaveAttribute("aria-pressed", "true");
  await expect(mustangs).toContainText("U10 · Fall 2026 · 0 players");
  await expect(page).toHaveURL(/team=t1/);
  await expect(page.getByRole("heading", { name: "No players yet" })).toBeVisible();

  // Team settings: rename.
  await page.getByRole("button", { name: "Team settings for U10 Mustangs" }).click();
  const settings = page.getByRole("dialog", { name: "U10 Mustangs settings" });
  await settings.getByLabel("Team name").fill("U10 Mustangs Blue");
  await settings.getByRole("button", { name: "Save team" }).click();
  await expect(settings).toBeHidden();
  await expect(picker.getByRole("button", { name: /^U10 Mustangs Blue/ })).toHaveAttribute("aria-pressed", "true");

  // A second team, then switch between them.
  await picker.getByRole("button", { name: "Add team" }).click();
  await page.getByRole("dialog", { name: "Add a team" }).getByLabel("Team name").fill("U12 Eagles");
  await page.getByRole("dialog", { name: "Add a team" }).getByRole("button", { name: "Add team" }).click();
  const eagles = picker.getByRole("button", { name: /^U12 Eagles/ });
  await expect(eagles).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL(/team=t2/);
  expect(posted[1]).toMatchObject({ name: "U12 Eagles", allCoaches: true, coachIds: [] });
  await picker.getByRole("button", { name: /^U10 Mustangs Blue/ }).click();
  await expect(page).toHaveURL(/team=t1/);
  await expect(eagles).toHaveAttribute("aria-pressed", "false");

  // A refusal stays in coach words.
  await picker.getByRole("button", { name: "Add team" }).click();
  await page.getByRole("dialog", { name: "Add a team" }).getByLabel("Team name").fill("Refuse me");
  await page.getByRole("dialog", { name: "Add a team" }).getByRole("button", { name: "Add team" }).click();
  await expect(page.getByText("Your Front Office has all the teams its plan allows. See plans to add more.")).toBeVisible();
  await page.getByRole("dialog", { name: "Add a team" }).getByRole("button", { name: "Cancel" }).click();

  // Remove the second team through the dialog's own confirm.
  await eagles.click();
  await page.getByRole("button", { name: "Team settings for U12 Eagles" }).click();
  const eaglesSettings = page.getByRole("dialog", { name: "U12 Eagles settings" });
  await eaglesSettings.getByRole("button", { name: "Remove team" }).click();
  await eaglesSettings.getByRole("button", { name: "Yes, remove U12 Eagles and its roster" }).click();
  await expect(eaglesSettings).toBeHidden();
  await expect(picker.getByRole("button", { name: /^U12 Eagles/ })).toHaveCount(0);
  await expect(picker.getByRole("button", { name: /^U10 Mustangs Blue/ })).toHaveAttribute("aria-pressed", "true");
  expect(teams.map((t) => t.name)).toEqual(["U10 Mustangs Blue"]);
  expect(errors).toEqual([]);
});

test("a coach on no team's staff is told so, and can't add teams", async ({ page, context }) => {
  const errors = errorsOf(page);
  const joined = { memberId: "m1", org: { id: "org1", name: "Vaultline Youth" }, shares: [] };
  await signIn(context, async (route, path, method) => {
    if (path === "orgs" && method === "GET") return (await route.fulfill({ json: { mine: null, joined: [joined], invites: [] } }), true);
    if (path === "hub/org1" && method === "GET") return (await route.fulfill({ json: { org: { id: "org1", name: "Vaultline Youth" }, role: "coach", teams: [], coaches: [] } }), true);
  });
  await page.goto("/front-office?tab=roster&org=org1");
  await expect(page.getByRole("heading", { name: "No team yet" })).toBeVisible();
  await expect(page.getByText("Your director hasn't put you on a team's staff in Vaultline Youth yet.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Add (a )?team/ })).toHaveCount(0);
  expect(errors).toEqual([]);
});
