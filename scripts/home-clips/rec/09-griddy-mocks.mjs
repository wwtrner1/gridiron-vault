// Mocks for the 09-griddy clip: a signed-in coach with no real Identity (the same idea as signIn in tests/helpers.ts) and a
// small in-memory account for /api that holds the Vault the recorder seeded (so every play is an account play, as it is for a
// coach who is signed in, and bulk edits and saves round-trip like the real server). Griddy's answers are scripted (the real
// model needs the AI Gateway); every answer has the exact shape netlify/ai/griddy.ts returns ({ reply: { text, actions } }),
// and the plays it names come from the Vault list the browser sent with the message, so ids are always real. The coverage
// answer is read from the `beats` column the browser sends (the Coverage check's own result), never made up.
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const uuid = (n) => `55555555-5555-4555-8555-${String(n).padStart(12, "0")}`;

export const READY_BOOK = "Ready-to-Go 5v5 Playbook";
export const GOLD = "#F5D33B";
const COACH = "Sample Coach";

/** Turns the Vault the recorder just seeded (signed out) into an account's: UUID ids, remote plays, playbooks with a cloud id. */
export async function seedAccount(page) {
  const ws = JSON.parse(await page.evaluate(() => localStorage.getItem("snapline.workspace.v1")));
  const account = { plays: new Map(), books: new Map(), members: new Map(), sheets: new Map(), n: 2000 };
  const ids = new Map();
  ws.plays = ws.plays.map((p) => {
    const id = uuid(++account.n);
    ids.set(p.id, id);
    const row = { id, ownerId: "u1", ownerName: COACH, name: p.name, formation: p.formation, playType: p.playType, personnel: p.personnel, description: p.description, tags: p.tags, fieldView: p.fieldView, scene: p.scene, preview: "", isPublic: false, saveCount: 0, updatedAt: p.updatedAt };
    account.plays.set(id, row);
    return { ...p, id, ownerName: COACH, remote: true };
  });
  ws.playbooks = ws.playbooks.map((b) => {
    const cloudId = uuid(++account.n);
    const playIds = b.playIds.map((i) => ids.get(i) ?? i);
    account.books.set(cloudId, { id: cloudId, name: b.name, description: b.description, color: b.color, isPublic: false, updatedAt: b.updatedAt, clientId: b.id });
    account.members.set(cloudId, playIds);
    return { ...b, playIds, cloudId, cloudOwner: "u1" };
  });
  await page.evaluate((json) => localStorage.setItem("snapline.workspace.v1", json), JSON.stringify(ws));
  return account;
}

/** What each scripted turn answers. `last` is the coach's latest message; `vault` the list the browser sent. */
function replyFor(last, vault, playbooks) {
  const text = last.toLowerCase();
  if (/draw/.test(text)) {
    return {
      text: "Here's Smash from Trips Right. Z runs the hitch, Y the corner over it and H checks into the flat. That corner is the hole in Cover 2.",
      actions: [
        {
          id: "d1",
          tool: "draw_play",
          read: {
            formation: "Trips Right",
            game: "5v5",
            name: "Trips Right Smash",
            assignments: [
              { player: "Z", kind: "route", action: "hitch", heard: "Z hitch" },
              { player: "Y", kind: "route", action: "corner", heard: "Y corner", firstRead: true },
              { player: "H", kind: "route", action: "flat", heard: "H flat" },
            ],
            unsure: [],
          },
        },
      ],
    };
  }
  if (/make every|recolor|yellow/.test(text)) {
    const book = playbooks.find((b) => b.name === READY_BOOK)?.name ?? READY_BOOK;
    return {
      text: `Every Z in ${book} goes yellow. Check the before and after, then apply it.`,
      actions: [{ id: "b1", tool: "bulk_edit", scope: { kind: "playbook", name: book }, changes: [{ op: "recolor", letter: "Z", color: GOLD }] }],
    };
  }
  if (/call sheet/.test(text)) {
    const byName = (re) => vault.filter((v) => re.test(v.name));
    const lines = [
      ...byName(/stick|flood|smash/i).filter((p) => /^\d/.test(p.name)).map((p) => ({ playId: p.id, group: "Openers" })),
      ...byName(/slant-flat|mesh/i).map((p) => ({ playId: p.id, group: "3rd & short", down: "3rd", distance: "1-3" })),
    ];
    return {
      text: "Here's a sheet built from plays already in your Vault. Rename it, drop anything you don't want, then create it.",
      actions: [{ id: "c1", tool: "build_call_sheet", name: "Saturday game plan", lines }],
    };
  }
  if (/beat/.test(text)) {
    // Read from the Coverage check's column the browser sent along (the Vault rows' `beats`).
    const hits = vault.filter((v) => /^\d/.test(v.name) && /\bCover 2\b/.test(String(v.beats ?? "")));
    const pick = hits.slice(0, 3);
    return {
      text: pick.length
        ? `${["No", "One", "Two", "Three"][pick.length]} of your plays beat Cover 2 in the Coverage check. Each one puts a receiver in the hole between the corner and the safety.`
        : "Nothing in your Vault beats Cover 2 yet.",
      actions: pick.length ? [{ id: "s1", tool: "show_plays", ids: pick.map((v) => v.id) }] : [],
    };
  }
  return { text: "Got it, Coach. What do you want to do with it?", actions: [] };
}

/** Signs a coach in on this page's browser and answers /api, then the caller reloads the screen. */
export async function install(page, account, { onGriddy } = {}) {
  const ctx = page.context();
  const jwt = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: "u1", email: "coach@example.com", exp: Math.floor(Date.now() / 1000) + 86400 })}.sig`;
  await ctx.addInitScript((token) => {
    localStorage.setItem(
      "gotrue.user",
      JSON.stringify({
        id: "u1",
        email: "coach@example.com",
        app_metadata: { provider: "email" },
        user_metadata: { full_name: "Sample Coach" },
        token: { access_token: token, refresh_token: "r", expires_at: Date.now() + 86_400_000, token_type: "bearer" },
        url: `${location.origin}/.netlify/identity`,
      }),
    );
  }, jwt);
  const user = { id: "u1", email: "coach@example.com", confirmed_at: "2026-01-01", app_metadata: { provider: "email" }, user_metadata: { full_name: COACH } };
  await ctx.route("**/.netlify/identity/**", (route) =>
    route.fulfill({ json: route.request().url().endsWith("/settings") ? { external: {}, disable_signup: false, autoconfirm: false } : user }),
  );
  const { plays, books, members, sheets } = account;
  await ctx.route("**/api/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname.replace(/^\/api\//, "");
    const method = req.method();
    const body = () => { try { return JSON.parse(req.postData() ?? "{}"); } catch { return {}; } };
    const now = () => new Date().toISOString();
    if (path === "me") return route.fulfill({ json: { user: { id: "u1", email: "coach@example.com", name: COACH }, plan: "solo" } });
    if (path === "ai/griddy" && method === "POST") {
      const b = body();
      const last = [...b.turns].reverse().find((t) => t.role === "coach")?.text ?? "";
      const reply = replyFor(last, b.context?.vault ?? [], b.context?.playbooks ?? []);
      onGriddy?.(last, reply, b.context);
      return route.fulfill({ json: { reply } });
    }
    if (path === "plays" && method === "POST") {
      const b = body();
      const id = uuid(++account.n);
      const play = { id, ownerId: "u1", ownerName: COACH, name: b.name, formation: b.formation ?? "", playType: b.playType ?? "pass", personnel: b.personnel ?? "", description: b.description ?? "", tags: b.tags ?? [], fieldView: b.fieldView ?? "half", scene: b.scene, preview: "", isPublic: false, saveCount: 0, updatedAt: now() };
      plays.set(id, play);
      return route.fulfill({ json: { play } });
    }
    if (path.startsWith("plays/") && method === "PUT") {
      const id = path.split("/")[1];
      const play = { ...plays.get(id), ...body(), id, ownerId: "u1", ownerName: COACH, updatedAt: now() };
      plays.set(id, play);
      return route.fulfill({ json: { play } });
    }
    if (path === "plays" && method === "GET") return route.fulfill({ json: { plays: [...plays.values()] } });
    if (path === "playbooks" && method === "POST") {
      const b = body();
      const id = uuid(++account.n);
      const book = { id, name: b.name, description: b.description ?? "", color: b.color ?? "", isPublic: false, updatedAt: now(), clientId: b.clientId ?? null };
      books.set(id, book);
      members.set(id, []);
      return route.fulfill({ json: { playbook: book } });
    }
    if (path.startsWith("playbooks/") && method === "PUT") {
      const id = path.split("/")[1];
      const { playIds, ...rest } = body();
      const book = { ...books.get(id), ...rest, id, updatedAt: now() };
      books.set(id, book);
      if (playIds) members.set(id, playIds);
      return route.fulfill({ json: { playbook: book } });
    }
    if (path === "playbooks" && method === "GET") {
      return route.fulfill({
        json: {
          playbooks: [...books.values()],
          members: [...members.entries()].flatMap(([playbookId, ids]) => ids.map((playId, sortOrder) => ({ playbookId, playId, sortOrder }))),
          owner: "u1",
        },
      });
    }
    if (path === "call-sheets" && method === "POST") {
      const b = body();
      const sheet = { id: uuid(++account.n), name: b.name, columns: b.columns, rows: b.rows, updatedAt: now(), clientId: b.clientId ?? null };
      sheets.set(sheet.id, sheet);
      return route.fulfill({ json: { sheet } });
    }
    if (path.startsWith("call-sheets/") && method === "PUT") {
      const b = body();
      const sheet = { ...sheets.get(path.split("/")[1]), id: path.split("/")[1], name: b.name, columns: b.columns, rows: b.rows, updatedAt: now() };
      sheets.set(sheet.id, sheet);
      return route.fulfill({ json: { sheet } });
    }
    if (path === "call-sheets" && method === "GET") return route.fulfill({ json: { sheets: [...sheets.values()], owner: "u1" } });
    if (path === "my-team" && method === "GET") return route.fulfill({ json: { team: null } });
    if (path === "brand" && method === "GET") return route.fulfill({ json: { brand: null } });
    if (path === "terms" && method === "GET") return route.fulfill({ json: { terms: null } });
    if (path === "wristband-setups" && method === "GET") return route.fulfill({ json: { setups: null } });
    if (path === "practice" && method === "GET") return route.fulfill({ json: { vault: null } });
    return route.fulfill({ status: 204, body: "" });
  });
}
