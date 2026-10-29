import { expect, test } from "@playwright/test";
import { errorsOf, quiet, signIn, workspace } from "./helpers";

test.beforeEach(async ({ context }) => quiet(context));

const CLOUD = "55555555-5555-4555-8555-555555555555";
const NEW = "66666666-6666-4666-8666-666666666666";

test("signing in brings the account's playbooks, and a new one goes to the account once", async ({ page, context }) => {
  const errors = errorsOf(page);
  const writes: { method: string; path: string; body: { name?: string; playIds?: string[] } }[] = [];
  await signIn(context, async (route, path, method) => {
    if (!path.startsWith("playbooks")) return;
    if (method === "GET") {
      await route.fulfill({ json: { playbooks: [{ id: CLOUD, name: "Red Zone", description: "", color: "#1f8fff", isPublic: false, updatedAt: "2026-10-01T00:00:00.000Z" }], members: [] } });
      return true;
    }
    const body = JSON.parse(route.request().postData() ?? "{}");
    writes.push({ method, path, body });
    const id = method === "POST" ? NEW : path.split("/")[1];
    await route.fulfill({ json: { playbook: { id, name: body.name ?? "x", description: "", color: "#1f8fff", isPublic: false, updatedAt: new Date().toISOString() } } });
    return true;
  });
  await page.goto("/playbooks");
  await expect(page.getByText("Red Zone").first()).toBeVisible();
  // The pulled copy isn't sent straight back.
  await page.waitForTimeout(2000);
  expect(writes).toEqual([]);

  await page.locator('[data-tour="new-playbook"]').click();
  await page.getByLabel("Playbook name").fill("Week 1 install");
  await page.getByRole("button", { name: "Create playbook" }).click();
  await expect.poll(() => writes.filter((w) => w.method === "POST").length).toBe(1);
  expect(writes.find((w) => w.method === "POST")!.body.name).toBe("Week 1 install");
  await expect.poll(async () => (await workspace(page)).playbooks!.find((b) => b.name === "Week 1 install") as unknown as { cloudId?: string } | undefined).toMatchObject({ cloudId: NEW });
  await page.waitForTimeout(2000);
  expect(writes.filter((w) => w.method === "POST").length).toBe(1);
  expect(errors).toEqual([]);
});
