import { expect, test } from "@playwright/test";
import { errorsOf, quiet, seedReady, signIn, workspace } from "./helpers";

/**
 * Front Office → Playbooks & coaches, with the orgs API mocked. The director's
 * side: start a Front Office, share a playbook as a frozen snapshot, send the
 * latest, invite and remove coaches, stop sharing. The coach's side: join from
 * an invite, open a shared master, clone it into a new playbook, leave.
 */
test.beforeEach(async ({ context }) => quiet(context));

type Member = { id: string; email: string; name: string; status: "invited" | "active"; invitedAt: string; joinedAt: string | null };
type Share = { id: string; source: string; name: string; note: string; plays: number; updatedAt: string };
const serverId = (n: number) => `33333333-3333-4333-8333-${String(n).padStart(12, "0")}`;

test("a director starts a Front Office, shares a playbook, invites coaches and takes both back", async ({ page, context }) => {
  const errors = errorsOf(page);
  let mine: { id: string; name: string; seats: number; members: Member[]; shares: Share[] } | null = null;
  const shared: { source: string; note: string; plays: number; names: string[] }[] = [];
  let n = 1;
  const state = () => ({ mine, joined: [], invites: [] });
  await signIn(context, async (route, path, method) => {
    if (path === "orgs" && method === "GET") return (await route.fulfill({ json: state() }), true);
    if (path === "orgs" && method === "POST") {
      const { name } = JSON.parse(route.request().postData() ?? "{}") as { name: string };
      mine = { id: "org1", name, seats: 12, members: [], shares: [] };
      return (await route.fulfill({ json: state() }), true);
    }
    if (path === "orgs/org1/shares" && method === "POST") {
      const body = JSON.parse(route.request().postData() ?? "{}") as { source: string; note: string; snapshot: { name: string; plays: { name: string }[] } };
      shared.push({ source: body.source, note: body.note, plays: body.snapshot.plays.length, names: body.snapshot.plays.map((p) => p.name) });
      const summary: Share = { id: "s1", source: body.source, name: body.snapshot.name, note: body.note, plays: body.snapshot.plays.length, updatedAt: new Date().toISOString() };
      mine!.shares = [...mine!.shares.filter((s) => s.source !== body.source), summary];
      return (await route.fulfill({ json: state() }), true);
    }
    if (path === "org-shares/s1" && method === "DELETE") {
      mine!.shares = [];
      return (await route.fulfill({ json: state() }), true);
    }
    if (path === "orgs/org1/members" && method === "POST") {
      const { emails } = JSON.parse(route.request().postData() ?? "{}") as { emails: string[] };
      mine!.members = [...mine!.members, ...emails.map((email) => ({ id: `m${n++}`, email, name: "", status: "invited" as const, invitedAt: new Date().toISOString(), joinedAt: null }))];
      return (await route.fulfill({ json: { ...state(), invited: emails.length } }), true);
    }
    if (path.startsWith("org-members/") && method === "DELETE") {
      mine!.members = mine!.members.filter((m) => m.id !== path.slice("org-members/".length));
      return (await route.fulfill({ json: state() }), true);
    }
  });
  await seedReady(page);
  await page.goto("/front-office");

  // Start one.
  const mineSection = page.getByRole("region", { name: /Run your own Front Office|Your Front Office/ });
  await expect(mineSection).toContainText("Run your own Front Office");
  await mineSection.getByLabel("League or program name").fill("Middle TN Flag League");
  await mineSection.getByRole("button", { name: "Start the Front Office" }).click();
  await expect(page.getByText("Front Office ready. Invite your coaches next.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your Front Office: Middle TN Flag League" })).toBeVisible();

  // Share the Ready-to-Go playbook as a frozen snapshot of its 24 plays.
  const bookPick = mineSection.locator("select").first();
  await bookPick.selectOption((await bookPick.locator("option", { hasText: "Ready-to-Go 5v5 Playbook" }).getAttribute("value"))!);
  await page.getByLabel("Note for coaches (optional)").fill("Install by week 2");
  await page.getByRole("button", { name: "Share with coaches" }).click();
  await expect(page.getByText("Ready-to-Go 5v5 Playbook is shared with your coaches.")).toBeVisible();
  expect(shared).toHaveLength(1);
  expect(shared[0]).toMatchObject({ note: "Install by week 2", plays: 24 });
  expect(shared[0].names).toContain("17 · Stick");
  const shares = page.locator(".fo-list").filter({ hasText: "Ready-to-Go 5v5 Playbook" });
  await expect(shares).toContainText("24 plays");
  await expect(shares).toContainText("Install by week 2");
  await expect(page.getByLabel("Note for coaches (optional)")).toHaveValue("");

  // Send the latest keeps the note and refreshes the snapshot.
  await page.getByRole("button", { name: "Send the latest Ready-to-Go 5v5 Playbook" }).click();
  await expect(page.getByText("Coaches now see the latest Ready-to-Go 5v5 Playbook.")).toBeVisible();
  expect(shared).toHaveLength(2);
  expect(shared[1].note).toBe("Install by week 2");

  // Invite two coaches from a pasted list (a name in brackets, a repeat, mixed case).
  await page.getByLabel("Invite coaches").fill("Coach Jones <Coach.Jones@example.com>, coach.smith@example.com\ncoach.jones@example.com");
  await expect(page.getByRole("button", { name: "Invite 2 coaches" })).toBeEnabled();
  await page.getByRole("button", { name: "Invite 2 coaches" }).click();
  await expect(page.getByText("Invites saved. Tell your coaches to sign in with that email and open Front Office.")).toBeVisible();
  await expect(page.getByRole("heading", { name: /Coaches 2 of 12/ })).toBeVisible();
  const coaches = page.locator(".fo-list li").filter({ hasText: "@example.com" });
  await expect(coaches).toHaveCount(2);
  await expect(coaches.first()).toContainText("coach.jones@example.com");
  await expect(coaches.first()).toContainText("Invited");
  await expect(page.getByLabel("Invite coaches")).toHaveValue("");

  // Remove a coach: the app's own box, then the seat opens.
  await page.getByRole("button", { name: "Remove coach.smith@example.com" }).click();
  const ask = page.getByRole("dialog", { name: "Remove coach.smith@example.com?" });
  await expect(ask).toContainText("Plays they already cloned stay theirs.");
  await ask.locator(".btn-danger").click();
  await expect(page.getByText("Coach removed.")).toBeVisible();
  await expect(coaches).toHaveCount(1);
  await expect(page.getByRole("heading", { name: /Coaches 1 of 12/ })).toBeVisible();

  // Stop sharing.
  await page.getByRole("button", { name: "Stop sharing Ready-to-Go 5v5 Playbook" }).click();
  await page.getByRole("dialog", { name: "Stop sharing Ready-to-Go 5v5 Playbook?" }).locator(".btn-danger").click();
  await expect(page.getByText("No longer shared.")).toBeVisible();
  await expect(page.getByText("Nothing shared yet", { exact: false }).or(page.locator(".fo-org").filter({ hasText: "Shared playbooks" }).locator(".hint"))).toBeVisible();
  expect(errors).toEqual([]);
});

test("a coach joins from an invite, opens a shared master, clones it into a new playbook and leaves", async ({ page, context }) => {
  const errors = errorsOf(page);
  await seedReady(page);
  // Three of the coach's seeded plays stand in for the director's master.
  const seeded = (await workspace(page)).plays!.slice(0, 3);
  const master = seeded.map((p, i) => ({ id: `master${i}`, name: `League ${p.name}`, formation: "Trips Right", playType: "pass", personnel: "5v5", description: "", tags: [], scene: p.scene }));
  const org = { id: "org9", name: "Vaultline Youth", ownerName: "Dana Director" };
  let invites = [{ memberId: "m9", org, invitedAt: "2026-10-30T10:00:00Z" }];
  let joined: { memberId: string; org: typeof org; shares: Share[] }[] = [];
  const created: { name: string }[] = [];
  let createdBooks = 0;
  await signIn(context, async (route, path, method) => {
    if (path === "orgs" && method === "GET") return (await route.fulfill({ json: { mine: null, joined, invites } }), true);
    if (path === "org-members/m9/accept" && method === "POST") {
      invites = [];
      joined = [{ memberId: "m9", org, shares: [{ id: "s7", source: "b1", name: "League masters", note: "Run these first", plays: 3, updatedAt: "2026-10-30T12:00:00Z" }] }];
      return (await route.fulfill({ json: { mine: null, joined, invites } }), true);
    }
    if (path === "org-members/m9" && method === "DELETE") {
      joined = [];
      return (await route.fulfill({ json: { mine: null, joined, invites } }), true);
    }
    if (path === "org-shares/s7" && method === "GET") {
      return (await route.fulfill({ json: { share: { id: "s7", source: "b1", name: "League masters", note: "Run these first", orgName: "Vaultline Youth", updatedAt: "2026-10-30T12:00:00Z", plays: master } } }), true);
    }
    if (path === "plays" && method === "POST") {
      const body = JSON.parse(route.request().postData() ?? "{}");
      created.push({ name: body.name });
      await route.fulfill({
        json: { play: { id: serverId(created.length), ownerId: "u1", ownerName: "Coach", name: body.name, formation: body.formation ?? "", playType: body.playType ?? "pass", personnel: body.personnel ?? "", description: body.description ?? "", tags: body.tags ?? [], fieldView: body.fieldView ?? "half", scene: body.scene, preview: "", isPublic: false, saveCount: 1, updatedAt: new Date().toISOString() } },
      });
      return true;
    }
    if (path === "playbooks" && method === "POST") {
      createdBooks++;
      const body = JSON.parse(route.request().postData() ?? "{}");
      await route.fulfill({ json: { playbook: { id: serverId(90 + createdBooks), ...body, updatedAt: new Date().toISOString() } } });
      return true;
    }
  });
  await page.goto("/front-office");

  // The invite shows under the coach's own email; Join moves the Front Office into Shared with you.
  const invite = page.getByRole("region", { name: "Invites waiting for you" });
  await expect(invite).toContainText("Dana Director invited coach@example.com");
  await invite.getByRole("button", { name: "Join" }).click();
  await expect(page.getByText("You joined Vaultline Youth.")).toBeVisible();
  await expect(invite).toHaveCount(0);
  const sharedWithMe = page.getByRole("region", { name: "Shared with you" });
  await expect(sharedWithMe).toContainText("Director: Dana Director");
  await expect(sharedWithMe).toContainText("3 plays");
  await expect(sharedWithMe).toContainText("Run these first");

  // Open the master: read-only, every play drawn, then clone.
  await sharedWithMe.getByRole("button", { name: "Open League masters" }).click();
  const preview = page.getByRole("dialog", { name: "League masters" });
  await expect(preview).toContainText("Read-only master");
  await expect(preview).toContainText("From Vaultline Youth");
  await expect(preview.locator(".fo-card")).toHaveCount(3);
  await preview.getByRole("button", { name: "Clone to my Vault" }).click();
  await expect(page.getByText('3 plays cloned into "League masters (Vaultline Youth)". They\'re yours to change.')).toBeVisible();
  await expect(preview).toHaveCount(0);
  await expect.poll(() => created.length).toBe(3);
  const ws = await workspace(page);
  expect(ws.plays).toHaveLength(27);
  expect(ws.plays!.filter((p) => p.name.startsWith("League ")).map((p) => p.remote)).toEqual([true, true, true]);
  expect(ws.playbooks!.map((b) => b.name)).toContain("League masters (Vaultline Youth)");

  // Leave: the box says cloned plays stay, and they do.
  await sharedWithMe.getByRole("button", { name: "Leave" }).click();
  const leave = page.getByRole("dialog", { name: "Leave Vaultline Youth?" });
  await expect(leave).toContainText("Plays you already cloned stay in your Vault.");
  await leave.locator(".btn-danger").click();
  await expect(page.getByText("You left Vaultline Youth.")).toBeVisible();
  await expect(sharedWithMe).toContainText("Nothing yet.");
  expect((await workspace(page)).plays).toHaveLength(27);
  expect(errors).toEqual([]);
});
