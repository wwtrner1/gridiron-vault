import { expect, test } from "@playwright/test";
import { errorsOf, quiet, seedReady, signIn, workspace } from "./helpers";

/**
 * The Vault's Shared by coaches tab: public plays from the account listed with
 * their coach, searched, exported, and copied into the coach's own Vault (a
 * browser copy at once; signed in, the account's copy replaces it, and a copy
 * the account refuses keeps the browser one); a full Sideline Vault refuses
 * the copy in the plan's words and offers the plans. The ready-to-go label
 * left on by adding the Ready-to-Go playbook narrows the shared list too, so
 * the tab says nothing matches (not "no shared plays yet"), keeps the chip in
 * the row and offers Clear filters.
 */
test.beforeEach(async ({ context }) => quiet(context));

const RIVERA = "Coach Rivera";
const MESH = "33333333-3333-4333-8333-333333333333";
const SMASH = "44444444-4444-4444-8444-444444444444";
const COPY = "55555555-5555-4555-8555-555555555555";

type ApiPlay = Record<string, unknown> & { id: string; name: string; scene: unknown };

/** Two of Coach Rivera's public plays, drawn like the first two Ready-to-Go plays. */
async function sharedPlays(page: import("@playwright/test").Page): Promise<ApiPlay[]> {
  const [a, b] = (await workspace(page)).plays!;
  const base = (p: (typeof a) & Record<string, unknown>, id: string, name: string) => ({
    id,
    ownerId: "u9",
    ownerName: RIVERA,
    name,
    formation: (p.formation as string) ?? "",
    playType: (p.playType as string) ?? "pass",
    personnel: "",
    description: "",
    tags: ["mesh"],
    fieldView: (p.fieldView as string) ?? "half",
    scene: p.scene,
    preview: "",
    isPublic: true,
    saveCount: 12,
    updatedAt: "2026-10-01T12:00:00.000Z",
  });
  return [base(a as never, MESH, "Rivera Mesh"), base(b as never, SMASH, "Rivera Smash")];
}

test("signed out, shared plays list with their coach, search, export and copy into this browser, and a full Sideline Vault refuses", async ({ page, context }) => {
  const errors = errorsOf(page);
  let shared: ApiPlay[] = [];
  let copies = 0;
  await context.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/plays" && url.searchParams.get("scope") === "public") return route.fulfill({ json: { plays: shared } });
    if (url.pathname.endsWith("/copy")) copies++;
    return route.fulfill({ status: 401, json: { error: "Sign in to use your account." } });
  });
  await seedReady(page);
  shared = await sharedPlays(page);

  const tabs = page.getByRole("group", { name: "Which plays to show" });
  await tabs.getByRole("button", { name: "Shared by coaches" }).click();
  const cards = page.locator(".play-card");
  // The ready-to-go label is still on from adding the playbook: say so, show it, and offer to clear it.
  await expect(page.getByRole("heading", { name: "Nothing matches that" })).toBeVisible();
  await expect(page.locator(".chip.is-on")).toHaveText("ready-to-go");
  await page.locator(".empty").getByRole("button", { name: "Clear filters" }).click();
  await expect(cards).toHaveCount(2);
  await expect(cards.first()).toContainText("Rivera Mesh");
  await expect(cards.first()).toContainText(`· ${RIVERA}`);
  // Shared cards copy or print; they are never deleted from here.
  await expect(cards.first().getByRole("button", { name: "Copy Rivera Mesh to your Vault" })).toBeVisible();
  await expect(cards.first().getByRole("button", { name: /^Delete/ })).toHaveCount(0);

  // Search reads the shared list too.
  const search = page.getByLabel("Search the Vault");
  await search.fill("smash");
  await expect(cards).toHaveCount(1);
  await expect(cards).toContainText("Rivera Smash");
  await search.fill("");
  await expect(cards).toHaveCount(2);

  // Export or print opens the export dialog on that one play.
  await cards.nth(1).getByRole("button", { name: "Export or print Rivera Smash" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Export Rivera Smash" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);

  // Copy: a browser copy at once, named as a copy, in Your plays; nothing goes to the account while signed out.
  await cards.first().getByRole("button", { name: "Copy Rivera Mesh to your Vault" }).click();
  await expect(page.locator(".toast", { hasText: "Rivera Mesh copied" })).toHaveText("Rivera Mesh copied into your Vault. Edit it however you want.");
  await expect(tabs.getByRole("button", { name: "Your plays (25)" })).toBeVisible();
  const copied = (await workspace(page)).plays!.find((p) => p.name === "Rivera Mesh (copy)")!;
  expect(copied).toBeTruthy();
  expect(copied.remote).toBeFalsy();
  expect(copied.id).not.toBe(MESH);
  expect(copies).toBe(0);
  await tabs.getByRole("button", { name: "Your plays (25)" }).click();
  await search.fill("rivera");
  await expect(cards).toHaveCount(1);
  await expect(cards).toContainText("Rivera Mesh (copy)");
  await expect(cards.getByRole("button", { name: "Delete Rivera Mesh (copy)" })).toBeVisible();

  // On Sideline the Vault is full at 8 plays: the copy is refused in the plan's words and the plans open.
  await page.evaluate(() => localStorage.setItem("nextplay.tier.v1", "free"));
  await page.reload();
  await page.getByRole("group", { name: "Which plays to show" }).getByRole("button", { name: "Shared by coaches" }).click();
  await expect(page.locator(".play-card")).toHaveCount(2);
  await page.locator(".play-card").first().getByRole("button", { name: "Copy Rivera Mesh to your Vault" }).click();
  await expect(page.locator(".toast.is-bad")).toHaveText("Your Sideline Vault holds 8 plays and it is full. Delete one, or move up a plan to keep the whole install.");
  await expect(page).toHaveURL(/\/pricing$/);
  expect((await workspace(page)).plays).toHaveLength(25);
  expect(errors).toEqual([]);
});

test("signed in, a copy goes to the account and its copy replaces the browser one; a refused copy keeps the browser one", async ({ page, context }) => {
  const errors = errorsOf(page);
  let shared: ApiPlay[] = [];
  const copyCalls: string[] = [];
  let posted = 0;
  await signIn(context, async (route, path, method) => {
    if (path === "plays" && method === "GET" && new URL(route.request().url()).searchParams.get("scope") === "public") {
      await route.fulfill({ json: { plays: shared } });
      return true;
    }
    if (path === "plays" && method === "POST") {
      // The Ready-to-Go plays going up to the account, each with its account id.
      const body = JSON.parse(route.request().postData() ?? "{}");
      posted++;
      await route.fulfill({ json: { play: { ...body, id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(posted).padStart(12, "0")}`, ownerId: "u1", ownerName: "Coach", isPublic: false, saveCount: 0, updatedAt: new Date().toISOString() } } });
      return true;
    }
    const m = path.match(/^plays\/([^/]+)\/copy$/);
    if (m && method === "POST") {
      copyCalls.push(m[1]);
      if (m[1] === SMASH) {
        await route.fulfill({ status: 403, json: { error: "That play isn't shared any more." } });
        return true;
      }
      const src = shared.find((p) => p.id === m[1])!;
      await route.fulfill({ json: { play: { ...src, id: COPY, ownerId: "u1", ownerName: "Coach", name: `${src.name} (copy)`, isPublic: false, saveCount: 0, updatedAt: new Date().toISOString() } } });
      return true;
    }
  });
  await seedReady(page);
  await expect.poll(() => posted).toBe(24);
  shared = await sharedPlays(page);
  const tabs = page.getByRole("group", { name: "Which plays to show" });
  await tabs.getByRole("button", { name: "Shared by coaches" }).click();
  await page.locator(".chip.is-on", { hasText: "ready-to-go" }).click();
  const cards = page.locator(".play-card");
  await expect(cards).toHaveCount(2);

  await cards.first().getByRole("button", { name: "Copy Rivera Mesh to your Vault" }).click();
  await expect(page.locator(".toast", { hasText: "Rivera Mesh copied" })).toHaveText("Rivera Mesh copied into your Vault. Edit it however you want.");
  await expect.poll(async () => (await workspace(page)).plays!.find((p) => p.id === COPY)?.remote).toBe(true);
  let mine = (await workspace(page)).plays!;
  expect(mine.filter((p) => p.name === "Rivera Mesh (copy)")).toHaveLength(1);
  expect(copyCalls).toEqual([MESH]);

  // The account won't copy the second one: the browser copy made at once is still here.
  await cards.nth(1).getByRole("button", { name: "Copy Rivera Smash to your Vault" }).click();
  await expect(page.locator(".toast", { hasText: "Rivera Smash copied" })).toHaveText("Rivera Smash copied into your Vault. Edit it however you want.");
  await expect.poll(() => copyCalls.length).toBe(2);
  await expect(tabs.getByRole("button", { name: "Your plays (26)" })).toBeVisible();
  mine = (await workspace(page)).plays!;
  const kept = mine.find((p) => p.name === "Rivera Smash (copy)")!;
  expect(kept.remote).toBeFalsy();
  expect(errors).toEqual([]);
});
