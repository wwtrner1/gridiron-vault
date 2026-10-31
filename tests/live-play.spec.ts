import { expect, test } from "@playwright/test";
import { errorsOf, quiet, seedReady, signIn, workspace } from "./helpers";

/**
 * Draw together (live plays), with `/api/live` mocked: a blank live play
 * started from the Front Office opens in the Designer with the staff who are
 * there, another coach's change lands on the field within a poll, this
 * coach's move goes up as one patch, "Save a copy to my Vault" makes a normal
 * play, a Vault play goes live from Extras, and an organisation without the
 * plan sees "Can't open live".
 */
test.beforeEach(async ({ context }) => quiet(context));

type Node = Record<string, unknown> & { id: string; kind: string; x: number; y: number };
type Scene = { version: 2; view: string; width: number; height: number; losY: number; pivot: null; nodes: Node[]; [k: string]: unknown };
type Patch = { set: Node[]; remove: string[]; frame?: Record<string, unknown> };
const org = { id: "org1", name: "Vaultline Youth", seats: 3, members: [], shares: [] };

const player = (id: string, label: string, x: number, y: number): Node => ({
  id, x, y, rotation: 0, scaleX: 1, scaleY: 1, z: 0, groupId: null, locked: false, hidden: false, name: label,
  kind: "player", shape: "circle", label, size: 36, fill: "#0B1524", stroke: "#0B1524", textColor: "#FFFFFF", side: "offense",
});
const text = (id: string, words: string): Node => ({
  id, x: 520, y: 200, rotation: 0, scaleX: 1, scaleY: 1, z: 5, groupId: null, locked: false, hidden: false, name: "Note",
  kind: "text", text: words, fontSize: 28, color: "#0B1524", weight: 600, align: "middle", boxed: false,
});
const blank = (): Scene => ({ version: 2, view: "half", width: 1040, height: 660, losY: 420, pivot: null, nodes: [] });

/** The mocked live play: one server copy, revisions, and the patches coaches sent. */
function liveServer() {
  const s = { id: "live1", name: "", rev: 1, scene: blank(), here: ["Coach Dee"], puts: [] as Patch[], started: [] as { name: string; nodes: number; orgId?: string }[] };
  const apply = (patch: Patch) => {
    const gone = new Set(patch.remove);
    const next = new Map(patch.set.map((n) => [n.id, n]));
    const nodes = s.scene.nodes.filter((n) => !gone.has(n.id)).map((n) => next.get(n.id) ?? n);
    for (const n of patch.set) if (!nodes.some((x) => x.id === n.id)) nodes.push(n);
    s.scene = { ...s.scene, ...(patch.frame ?? {}), nodes };
    s.rev += 1;
  };
  return { s, apply };
}

test("a live play started from the Front Office is drawn with the staff, and a copy saves to the Vault", async ({ page, context }) => {
  const errors = errorsOf(page);
  const { s, apply } = liveServer();
  await signIn(context, async (route, path, method) => {
    if (path === "orgs" && method === "GET") return (await route.fulfill({ json: { mine: org, joined: [], invites: [] } }), true);
    if (path === "live" && method === "GET") return (await route.fulfill({ json: { plays: [], live: true } }), true);
    if (path === "live" && method === "POST") {
      const body = JSON.parse(route.request().postData() ?? "{}") as { name: string; scene: Scene; orgId?: string };
      s.started.push({ name: body.name, nodes: body.scene.nodes.length, orgId: body.orgId });
      s.name = body.name;
      s.scene = body.scene;
      return (await route.fulfill({ json: { play: { id: s.id, orgId: "org1", name: s.name, rev: s.rev, updatedAt: new Date().toISOString(), updatedBy: "Coach" } } }), true);
    }
    if (path === `live/${s.id}` && method === "GET") {
      const since = Number(new URL(route.request().url()).searchParams.get("since") ?? "-1");
      if (since === s.rev) return (await route.fulfill({ json: { rev: s.rev, same: true, here: s.here } }), true);
      return (await route.fulfill({ json: { rev: s.rev, name: s.name, scene: s.scene, here: s.here } }), true);
    }
    if (path === `live/${s.id}` && method === "PUT") {
      const { patch } = JSON.parse(route.request().postData() ?? "{}") as { patch: Patch };
      s.puts.push(patch);
      apply(patch);
      return (await route.fulfill({ json: { rev: s.rev, scene: s.scene, here: s.here } }), true);
    }
    if (path === "plays" && method === "POST") {
      const body = JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>;
      return (
        await route.fulfill({
          json: { play: { id: "11111111-1111-4111-8111-111111111111", ownerId: "u1", ownerName: "Coach", name: body.name, formation: "", playType: "pass", personnel: "", description: "", tags: [], fieldView: "half", scene: body.scene, preview: "", isPublic: false, saveCount: 1, updatedAt: new Date().toISOString() } },
        }),
        true
      );
    }
  });

  await page.goto("/front-office?tab=live");
  await page.getByLabel("Live play name").fill("Staff play A");
  await page.getByRole("button", { name: "Start a blank live play" }).click();
  await expect(page).toHaveURL(/\/build\?live=live1/);
  expect(s.started).toEqual([{ name: "Staff play A", nodes: 0, orgId: "org1" }]);
  const badge = page.locator(".dz-saved[role=status]");
  await expect(badge).toHaveText(/Live with Coach Dee/);
  await expect(page.locator(".dz-name")).toHaveText("Staff play A");
  // No Save button on a live play: everything drawn is shared as it happens.
  await expect(page.getByRole("button", { name: "Save play" })).toHaveCount(0);

  // Another coach puts two players and a note on the field: it shows within a poll.
  s.scene = { ...s.scene, nodes: [player("p-q", "Q", 520, 470), player("p-x", "X", 220, 400), text("t-1", "Watch the blitz")] };
  s.rev += 1;
  await expect(page.locator(".stage-frame svg text", { hasText: "Watch the blitz" })).toBeVisible({ timeout: 10_000 });
  await expect(page.locator(".stage-frame svg text", { hasText: /^X$/ })).toBeVisible();

  // This coach moves a player with the keyboard: one patch goes up with that player's new spot.
  await page.waitForTimeout(300);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await expect(async () => {
    await page.keyboard.press("n");
    await expect(page.locator(".dz-status [role=status]")).toContainText("Selected", { timeout: 1000 });
  }).toPass();
  for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowRight");
  await expect(page.locator(".dz-status [role=status]")).toContainText("Moved");
  await expect.poll(() => s.puts.length, { timeout: 10_000 }).toBe(1);
  expect(s.puts[0].remove).toEqual([]);
  expect(s.puts[0].set).toHaveLength(1);
  const moved = s.puts[0].set[0];
  const was = [player("p-q", "Q", 520, 470), player("p-x", "X", 220, 400)].find((p) => p.id === moved.id)!;
  expect(moved.kind).toBe("player");
  expect(moved.x).toBeGreaterThan(was.x);
  await expect(badge).toHaveText(/Live with Coach Dee/);

  // Save a copy: a normal play in the Vault, and the Designer moves to it.
  await page.locator('button[aria-controls="dz-more-menu"]').click();
  await page.locator("#dz-more-menu").getByRole("button", { name: "Save a copy to my Vault" }).click();
  await expect(page.getByText("Saved to your Vault and your account.")).toBeVisible();
  await expect(page).toHaveURL(/\/build\/11111111-1111-4111-8111-111111111111/);
  const ws = await workspace(page);
  const copy = ws.plays?.find((p) => p.name === "Staff play A");
  expect(copy).toBeTruthy();
  expect(copy!.scene.nodes.map((n) => n.id).sort()).toEqual(["p-q", "p-x", "t-1"]);
  await expect(page.getByRole("status").filter({ hasText: "Saved" }).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("a Vault play goes live from Extras with its drawing", async ({ page, context }) => {
  const errors = errorsOf(page);
  const started: { name: string; nodes: number }[] = [];
  await signIn(context, async (route, path, method) => {
    if (path === "live" && method === "POST") {
      const body = JSON.parse(route.request().postData() ?? "{}") as { name: string; scene: Scene };
      started.push({ name: body.name, nodes: body.scene.nodes.length });
      return (await route.fulfill({ json: { play: { id: "live2", orgId: "org1", name: body.name, rev: 1, updatedAt: new Date().toISOString(), updatedBy: "Coach" } } }), true);
    }
    if (path === "live/live2" && method === "GET") return (await route.fulfill({ json: { rev: 1, name: started[0]?.name, scene: blank(), here: [] } }), true);
  });
  await seedReady(page);
  await page.locator('.play-card button[aria-label^="Open"]').nth(2).click();
  await page.locator(".stage-frame svg").first().waitFor();
  const name = await page.locator(".dz-name").textContent();
  await page.locator('button[aria-controls="dz-more-menu"]').click();
  await page.locator("#dz-more-menu").getByRole("button", { name: "Draw this live with my staff" }).click();
  await expect(page).toHaveURL(/\/build\?live=live2/);
  expect(started).toHaveLength(1);
  expect(started[0].name).toBe(name);
  expect(started[0].nodes).toBeGreaterThan(5);
  await expect(page.locator(".dz-saved[role=status]")).toHaveText(/Live · just you/);
  expect(errors).toEqual([]);
});

test("without the Staff plan the live play can't open, and the badge says so", async ({ page, context }) => {
  const errors = errorsOf(page);
  let asked = 0;
  await signIn(context, async (route, path, method) => {
    if (path === "live/live9" && method === "GET") {
      asked += 1;
      return (await route.fulfill({ status: 403, json: { error: "Drawing together comes with the Staff plan. Ask your director to upgrade." } }), true);
    }
  });
  await page.goto("/build?live=live9");
  const badge = page.locator(".dz-saved[role=status]");
  await expect(badge).toHaveText(/Can't open live/);
  await expect(badge).toHaveAttribute("title", "Drawing together comes with the Staff plan. Ask your director to upgrade.");
  await page.waitForTimeout(3000);
  expect(asked).toBe(1);
  expect(errors).toEqual([]);
});
