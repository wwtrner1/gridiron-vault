import { expect, test } from "@playwright/test";
import { errorsOf, quiet } from "./helpers";

/**
 * Help & feedback (/help): the form refuses an empty note and an oversized
 * screenshot in coach words, a failed send keeps the note, a good send posts
 * the note, area, rating, email and the page the coach came from to Netlify
 * Forms and shows the thanks, Send another note clears it, and the side cards
 * link to the tutorials and the support address.
 */
test.beforeEach(async ({ context }) => quiet(context));

test("the feedback form refuses an empty note, keeps it on a failed send, posts it with the page it came from, and clears for another", async ({ page, context }) => {
  const errors = errorsOf(page);
  const posts: string[] = [];
  let fail = true;
  await context.route("**/__forms.html", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    posts.push(route.request().postDataBuffer()?.toString("latin1") ?? "");
    await route.fulfill({ status: fail ? 500 : 200, body: "" });
  });

  // In from the Vault's side menu, so the note can say which page it came from.
  await page.goto("/vault");
  await page.locator("aside#rail-nav").getByRole("link", { name: "Help & feedback" }).click();
  await expect(page.locator("h1")).toHaveText("Tell us what to build next.");
  const form = page.locator("form.help-form");
  const note = form.getByLabel("What should we improve?");
  const send = form.getByRole("button", { name: "Send feedback" });

  // An empty note is refused before anything is sent.
  await send.click();
  await expect(form.getByRole("alert")).toHaveText("Tell us what to improve — two sentences is plenty.");
  await expect(note).toHaveAttribute("aria-invalid", "true");
  expect(posts).toHaveLength(0);

  // The note, the area, a rating (a second tap clears it), an email.
  await note.fill("Let me flip a play left or right in one click.");
  await form.getByLabel("Which part of GridIronVault?").selectOption("Call Sheet");
  const rating = form.getByRole("radiogroup", { name: "How is it going so far?" });
  await rating.getByRole("radio", { name: "4 out of 5" }).click();
  await expect(rating.getByRole("radio", { name: "4 out of 5" })).toHaveAttribute("aria-checked", "true");
  await rating.getByRole("radio", { name: "4 out of 5" }).click();
  await expect(rating.getByRole("radio", { checked: true })).toHaveCount(0);
  await rating.getByRole("radio", { name: "5 out of 5" }).click();
  await form.getByLabel("Your email (optional)").fill("coach@example.com");

  // A screenshot over 8 MB is refused before the send; a small one is fine.
  const shot = form.getByLabel("Attach a screenshot (optional)");
  await shot.setInputFiles({ name: "big.png", mimeType: "image/png", buffer: Buffer.alloc(8 * 1024 * 1024 + 1) });
  await send.click();
  await expect(form.getByRole("alert")).toHaveText("That screenshot is over 8 MB. Try a smaller one, or send the note without it.");
  expect(posts).toHaveLength(0);
  await shot.setInputFiles([]);

  // A failed send says so and keeps the note; the next try lands with everything in the post.
  await send.click();
  await expect(form.getByRole("alert")).toHaveText("That didn’t send. Check your connection and try again — your note is still here.");
  await expect(note).toHaveValue("Let me flip a play left or right in one click.");
  expect(posts).toHaveLength(1);
  fail = false;
  await send.click();
  const sent = page.getByRole("status").filter({ hasText: "Thanks, coach." });
  await expect(sent).toBeVisible();
  await expect(sent).toContainText("and you’ll get a reply");
  expect(posts).toHaveLength(2);
  const body = posts[1];
  for (const field of ['name="form-name"\r\n\r\nfeedback', 'name="improve"\r\n\r\nLet me flip a play left or right in one click.', 'name="area"\r\n\r\nCall Sheet', 'name="rating"\r\n\r\n5', 'name="email"\r\n\r\ncoach@example.com', 'name="page"\r\n\r\n/vault']) {
    expect(body).toContain(field);
  }

  // Send another note: the form is back and empty, with the area kept.
  await sent.getByRole("button", { name: "Send another note" }).click();
  await expect(note).toHaveValue("");
  await expect(rating.getByRole("radio", { checked: true })).toHaveCount(0);
  await expect(form.getByLabel("Which part of GridIronVault?")).toHaveValue("Call Sheet");

  // The side cards: the tutorials and a person to talk to.
  await expect(page.getByRole("link", { name: "Open the tutorials" })).toHaveAttribute("href", "/tutorials");
  await expect(page.getByRole("link", { name: "support@gridiron-vault.com" })).toHaveAttribute("href", "mailto:support@gridiron-vault.com");
  expect(errors).toEqual([]);
});
