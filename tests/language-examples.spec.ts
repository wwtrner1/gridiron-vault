import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { quiet, seedReady, signIn } from "./helpers";

/**
 * Playbook language examples: every starter term shows a diagram (a peek on
 * hover, the full example on a click), a coach's own term takes a Vault play
 * as its example, starter terms are the coach's to rename, reset, delete
 * (with Undo) and bring back, and the list follows the coach's account.
 */
test.beforeEach(async ({ context }) => {
  await quiet(context);
});

const rows = (page: import("@playwright/test").Page) => page.locator(".lang-table tbody tr");

test("every starter term shows what it looks like, on hover and in its example", async ({ page }) => {
  await page.goto("/language");
  await expect(rows(page)).toHaveCount(33);
  // A diagram beside every starter term, none waiting for a pick.
  await expect(page.locator("button.lang-thumb:not(.is-empty)")).toHaveCount(33);
  await expect(page.locator("button.lang-thumb.is-empty")).toHaveCount(0);

  // Hover peeks at it large, with the meaning.
  const flood = page.getByRole("button", { name: "Show the Flood example" });
  await flood.hover();
  const peek = page.getByRole("tooltip");
  await expect(peek).toContainText("Flood");
  await expect(peek).toContainText("Three levels to one side");
  await expect(peek.locator("svg path").first()).toBeAttached();
  await page.mouse.move(5, 5);
  await expect(peek).toHaveCount(0);

  // A click opens the example; the drawing has the three routes and the read.
  await flood.click();
  const dialog = page.getByRole("dialog", { name: "Flood" });
  await expect(dialog).toContainText("Three levels to one side: corner, out, flat");
  await expect(dialog.locator("figcaption")).toHaveText("Starter glossary diagram");
  await expect(dialog.getByRole("img", { name: "Flood example diagram" })).toBeVisible();
  const axe = await new AxeBuilder({ page }).include(".modal").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);

  // A technique shows the defender wearing its number over the line.
  await page.getByRole("button", { name: "Show the 3 technique example" }).click();
  const tech = page.getByRole("dialog", { name: "3 technique" });
  await expect(tech.locator("svg text", { hasText: /^3$/ }).first()).toBeAttached();
  await tech.getByRole("button", { name: "Done" }).click();

  // Keyboard focus peeks too.
  await page.getByRole("button", { name: "Show the Mesh example" }).focus();
  await expect(page.getByRole("tooltip")).toContainText("Mesh");
  const table = await new AxeBuilder({ page }).include(".lang-table-wrap").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  // The example buttons' only visible text is the diagram's yard numbers; their label names the term (docs/accessibility.md).
  expect(table.violations.filter((v) => v.id !== "label-content-name-mismatch").map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
});

test("a coach renames a starter term, puts it back, deletes one with Undo and brings the rest back", async ({ page }) => {
  await page.goto("/language");

  // Renamed to the staff's word: the diagram stays with it and the row says it was edited.
  await page.getByRole("button", { name: "Edit Flood" }).click();
  const form = page.getByRole("form", { name: "Edit Flood" });
  await expect(form).toContainText("A starter term, yours to change");
  await form.getByLabel("Term").fill("Sail");
  await form.getByLabel("Means").fill("Our flood: Z corner, Y out, H flat");
  await form.getByRole("button", { name: "Save term" }).click();
  const sail = rows(page).filter({ hasText: "Sail" });
  await expect(sail).toContainText("Starter glossary · edited");
  await expect(page.getByRole("button", { name: "Show the Sail example" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit Flood" })).toHaveCount(0);

  // Kept after a reload.
  await page.reload();
  await expect(rows(page).filter({ hasText: "Our flood: Z corner, Y out, H flat" })).toHaveCount(1);

  // Back to the starter wording.
  await page.getByRole("button", { name: "Edit Sail" }).click();
  const again = page.getByRole("form", { name: "Edit Sail" });
  await again.getByRole("button", { name: "Back to the starter wording (“Flood”)" }).click();
  await expect(again.getByLabel("Term")).toHaveValue("Flood");
  await again.getByRole("button", { name: "Save term" }).click();
  await expect(rows(page).filter({ hasText: "Flood" }).first()).not.toContainText("edited");

  // Delete with Undo puts it back where it was.
  await page.getByRole("button", { name: "Delete Mesh" }).click();
  await expect(rows(page)).toHaveCount(32);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(rows(page)).toHaveCount(33);
  await expect(rows(page).nth(1)).toContainText("Mesh");

  // Deleted for good, it can be brought back with the other starters.
  await page.getByRole("button", { name: "Delete Mesh" }).click();
  await page.getByRole("button", { name: "Delete Bubble" }).click();
  await expect(page.locator(".lang-restore")).toContainText("2 starter terms are off your list.");
  await page.reload();
  await expect(rows(page)).toHaveCount(31);
  await page.getByRole("button", { name: "Bring back the starter terms" }).click();
  await expect(rows(page)).toHaveCount(33);
  await expect(page.locator(".lang-restore")).toHaveCount(0);
});

test("a coach's own term takes a play from the Vault as its example", async ({ page }) => {
  await page.goto("/language");
  await page.getByRole("button", { name: "Teach a new term" }).click();
  const form = page.getByRole("form", { name: "New term" });
  await form.getByLabel("Term").fill("Zebra");
  await form.getByLabel("Means").fill("Our name for a reverse pass");
  await form.getByRole("button", { name: "Save term" }).click();

  // No play uses the word yet: nothing to show until one is picked.
  await page.getByRole("button", { name: "Add an example for Zebra" }).click();
  const dialog = page.getByRole("dialog", { name: "Zebra" });
  await expect(dialog).toContainText("No picture yet");
  await expect(dialog).toContainText("Your Vault is empty");
  await dialog.getByRole("button", { name: "Done" }).click();

  // With plays in the Vault, the coach picks one.
  await seedReady(page);
  await page.goto("/language");
  await page.getByRole("button", { name: "Add an example for Zebra" }).click();
  const picker = page.getByRole("dialog", { name: "Zebra" }).getByLabel("Show it with a play from your Vault");
  const name = (await picker.locator("optgroup option").first().textContent())!.trim();
  await picker.selectOption({ label: name });
  await expect(page.getByRole("dialog", { name: "Zebra" }).locator("figcaption")).toHaveText(`Your example: ${name}`);
  await expect(page.getByRole("dialog", { name: "Zebra" }).getByRole("link", { name: "Open in the Designer" })).toHaveAttribute("href", /\/build\//);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Show the Zebra example" })).toBeVisible();

  // Kept after a reload, and the default puts it back.
  await page.reload();
  await page.getByRole("button", { name: "Show the Zebra example" }).click();
  await page.getByRole("dialog", { name: "Zebra" }).getByLabel("Show it with a play from your Vault").selectOption("");
  await expect(page.getByRole("dialog", { name: "Zebra" })).toContainText("No picture yet");
});

test("signed in, the account's terms replace an older list and a change goes up to the account", async ({ page, context }) => {
  const sent: { terms: { term: string; means: string; id: string }[]; updatedAt: string }[] = [];
  await signIn(context, async (route, path, method) => {
    if (path !== "terms") return;
    if (method === "GET") {
      await route.fulfill({
        json: {
          terms: {
            terms: [
              { id: "glossary-flood", term: "Sail", means: "Staff word for flood", type: "concept", source: "Starter glossary", added: "2026-09-01", scope: "shared" },
              { id: "term-1", term: "Bang", means: "Skinny post at 6", type: "concept", source: "You added", added: "2026-11-01", scope: "staff" },
            ],
            ignored: [],
            seeded: [],
            updatedAt: "2099-01-01T00:00:00.000Z",
          },
        },
      });
      return true;
    }
    sent.push(JSON.parse(route.request().postData() ?? "{}").terms);
    await route.fulfill({ json: { terms: sent[sent.length - 1] } });
    return true;
  });
  await page.goto("/language");
  // The account's renamed Flood keeps its diagram; starters it never saw are added once.
  await expect(page.getByRole("button", { name: "Show the Sail example" })).toBeVisible();
  await expect(rows(page).filter({ hasText: "Skinny post at 6" })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Edit Flood" })).toHaveCount(0);

  await page.getByRole("button", { name: "Edit Bang" }).click();
  const form = page.getByRole("form", { name: "Edit Bang" });
  await form.getByLabel("Means").fill("Skinny post at 8");
  await form.getByRole("button", { name: "Save term" }).click();
  await expect.poll(() => sent.at(-1)?.terms.find((t) => t.id === "term-1")?.means).toBe("Skinny post at 8");
  expect(sent.at(-1)!.terms.find((t) => t.id === "glossary-flood")?.term).toBe("Sail");
});

test("a staff coach reads the head coach's terms, and Griddy speaks them first", async ({ page, context }) => {
  let griddyTerms: { term: string; means: string }[] = [];
  await signIn(context, async (route, path, method) => {
    if (path === "terms" && method === "GET") {
      await route.fulfill({
        json: {
          terms: null,
          director: false,
          staff: {
            org: "Hawks Football",
            from: "Coach Rivera",
            terms: [
              { id: "glossary-flood", term: "Sail", means: "Head coach's flood", type: "concept", source: "Starter glossary", added: "2026-09-01", scope: "shared" },
              { id: "term-h", term: "Mesh", means: "Head coach's mesh", type: "concept", source: "You added", added: "2026-11-01", scope: "staff" },
            ],
          },
        },
      });
      return true;
    }
    if (path === "ai/griddy") {
      griddyTerms = JSON.parse(route.request().postData() ?? "{}").terms;
      await route.fulfill({ json: { reply: { text: "Got it, Coach.", actions: [] } } });
      return true;
    }
  });
  await page.goto("/language");
  const staff = page.getByRole("region", { name: "From Coach Rivera · Hawks Football" });
  await expect(staff).toContainText("Head coach's flood");
  // No share switch for a coach who doesn't run a Front Office.
  await expect(page.getByLabel("Share my terms with my Front Office staff")).toHaveCount(0);

  // The staff list is read-only: its renamed Flood keeps the diagram, with no picker or Edit.
  await staff.getByRole("button", { name: "Show the Sail example" }).click();
  const dialog = page.getByRole("dialog", { name: "Sail" });
  await expect(dialog.locator("figcaption")).toHaveText("Starter glossary diagram");
  await expect(dialog).toContainText("Only they can change it");
  await expect(dialog.getByLabel("Show it with a play from your Vault")).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Edit the term" })).toHaveCount(0);
  await page.keyboard.press("Escape");

  // Griddy reads the head coach's words first; the coach's own Mesh gives way to the staff's.
  await page.locator("button.gd-launch").click();
  const box = page.locator("#griddy-panel").getByLabel("Message Griddy");
  await box.fill("Draw me our mesh");
  await box.press("Enter");
  await expect.poll(() => griddyTerms.length).toBeGreaterThan(0);
  expect(griddyTerms[0]).toEqual({ term: "Sail", means: "Head coach's flood" });
  expect(griddyTerms.filter((t) => t.term === "Mesh")).toEqual([{ term: "Mesh", means: "Head coach's mesh" }]);
  expect(griddyTerms.some((t) => t.term === "Flood")).toBe(true);
});

test("a director turns sharing with the staff off and on", async ({ page, context }) => {
  const sent: { shareWithStaff?: boolean }[] = [];
  await signIn(context, async (route, path, method) => {
    if (path !== "terms") return;
    if (method === "GET") await route.fulfill({ json: { terms: null, staff: null, director: true } });
    else {
      sent.push(JSON.parse(route.request().postData() ?? "{}").terms);
      await route.fulfill({ json: { terms: sent.at(-1) } });
    }
    return true;
  });
  await page.goto("/language");
  const share = page.getByLabel("Share my terms with my Front Office staff");
  await expect(share).toBeChecked();
  await share.uncheck();
  await expect.poll(() => sent.at(-1)?.shareWithStaff).toBe(false);
  await page.reload();
  await expect(share).not.toBeChecked();
  await share.check();
  await expect.poll(() => sent.at(-1)?.shareWithStaff).toBe(true);
});
