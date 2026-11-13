import { expect, test } from "@playwright/test";
import { errorsOf, quiet } from "./helpers";

/**
 * Coaching videos (/library): the list with its MOJO credit, search and the no-match wording,
 * the kind chips, Watch opening the privacy-enhanced YouTube player and Hide video closing it,
 * and a reading's link to mojo.sport in a new tab.
 */
test.beforeEach(async ({ context }) => {
  await quiet(context);
  await context.route("https://www.youtube-nocookie.com/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<html><body>player</body></html>" }));
});

test("Coaching videos: search, filter, watch a drill and open a reading", async ({ page }) => {
  const errors = errorsOf(page);
  await page.goto("/library");
  await expect(page.getByRole("heading", { name: "Coaching videos", level: 2 })).toBeVisible();
  await expect(page.locator(".page-head").getByRole("link", { name: "MOJO" })).toHaveAttribute("href", "https://mojo.sport/coachs-corner/");

  const cards = page.locator(".lib-card");
  const total = await cards.count();
  expect(total).toBeGreaterThan(30);
  await expect(page.locator(".lib-count")).toHaveText(`${total} of ${total}`);

  await page.getByRole("searchbox", { name: "Search the videos" }).fill("flag attack");
  await expect(cards).toHaveCount(1);
  await expect(cards.first().locator("h3")).toHaveText("Flag Attack");
  await expect(cards.first().locator(".lib-credit")).toHaveText("From MOJO");

  await cards.first().getByRole("button", { name: "▶ Watch" }).click();
  const frame = cards.first().locator("iframe");
  await expect(frame).toHaveAttribute("src", /^https:\/\/www\.youtube-nocookie\.com\/embed\/LIsoJdV2U8o/);
  await cards.first().getByRole("button", { name: "Hide video" }).click();
  await expect(frame).toHaveCount(0);

  await page.getByRole("searchbox", { name: "Search the videos" }).fill("zzzz nothing");
  await expect(page.getByText("Nothing matches. Try fewer words or All topics.")).toBeVisible();

  await page.getByRole("searchbox", { name: "Search the videos" }).fill("");
  await page.getByRole("button", { name: "Read", exact: true }).click();
  await expect(page.getByRole("button", { name: "Read", exact: true })).toHaveAttribute("aria-pressed", "true");
  const read = cards.first().getByRole("link", { name: /Read on MOJO/ });
  await expect(read).toHaveAttribute("href", /^https:\/\/mojo\.sport\/coachs-corner\//);
  await expect(read).toHaveAttribute("target", "_blank");
  await expect(cards.locator("iframe")).toHaveCount(0);
  await expect(cards.getByRole("button", { name: "▶ Watch" })).toHaveCount(0);

  expect(errors).toEqual([]);
});
