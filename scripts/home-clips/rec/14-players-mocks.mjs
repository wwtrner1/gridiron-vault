// Mocks for the 14-playbooks-players clip: a signed-in coach with no real Identity (the same idea as signIn in tests/helpers.ts)
// and a small in-memory account for /api that holds the Vault the recorder seeded, the playbooks the coach makes, and the
// player links. The share routes answer exactly what netlify/functions/api.ts answers (shareRoute, openShare, sendScore):
//   GET  shares                 -> { shares: [{ token, source, name, plays, updatedAt, results }] }
//   POST shares {source,snapshot} -> { token }   (one link per playbook; sharing again keeps the address)
//   GET  shares/:token          -> { share: { name, plays, updatedAt } }        (public: the player's page)
//   GET  shares/:token/results  -> { results: [{ id, playerName, letter, score, total, at }] } newest first
//   POST shares/:token/results  -> { ok: true }                                  (public: a finished quiz)
//   DELETE shares/:token        -> { ok: true }
// The snapshot a player opens is the one the coach's browser posted (the plays frozen by toSnapshot), so what the player sees is
// always the playbook as the coach had it when he made the link. Quiz scores a player sends are kept and listed back; the
// "earlier" scores are sample players (Sample Player 1...), written the way the server stores them.
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const uuid = (n) => `55555555-5555-4555-8555-${String(n).padStart(12, "0")}`;
const COACH = "Sample Coach";
/** 16 random bytes, base64url, like newToken() in the API (22 characters). */
export const TOKEN = "kT3vQ9mZpL2xW8dRn5HcYa";

/** Turns the Vault the recorder just seeded (signed out) into an account's: UUID ids, remote plays, playbooks with a cloud id. */
export async function seedAccount(page) {
  const ws = JSON.parse(await page.evaluate(() => localStorage.getItem("snapline.workspace.v1")));
  const account = { plays: new Map(), books: new Map(), members: new Map(), sheets: new Map(), shares: new Map(), results: [], n: 3000 };
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

/** Signs a coach in on this page's browser and answers /api, then the caller reloads the screen. */
export async function install(page, account, { onShare } = {}) {
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
  // The link the dialog shows is `${location.origin}/team/<token>`; a recording made on a local copy of the build says the
  // address the product really has (the QR code is drawn from the same text).
  await ctx.addInitScript(() => {
    const real = location.origin;
    const fix = (v) => (typeof v === "string" && v.startsWith(real + "/team/") ? "https://gridiron-vault.com" + v.slice(real.length) : v);
    for (const key of ["value", "defaultValue"]) {
      const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, key);
      if (d?.set) Object.defineProperty(HTMLInputElement.prototype, key, { ...d, set(v) { d.set.call(this, fix(v)); } });
    }
    const add = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function (k, v) { return add.call(this, k, this instanceof HTMLInputElement && k === "value" ? fix(v) : v); };
  });
  const user = { id: "u1", email: "coach@example.com", confirmed_at: "2026-01-01", app_metadata: { provider: "email" }, user_metadata: { full_name: COACH } };
  await ctx.route("**/.netlify/identity/**", (route) =>
    route.fulfill({ json: route.request().url().endsWith("/settings") ? { external: {}, disable_signup: false, autoconfirm: false } : user }),
  );
  const { plays, books, members, shares } = account;
  await ctx.route("**/api/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname.replace(/^\/api\//, "");
    const method = req.method();
    const body = () => { try { return JSON.parse(req.postData() ?? "{}"); } catch { return {}; } };
    const now = () => new Date().toISOString();
    if (path === "me") return route.fulfill({ json: { user: { id: "u1", email: "coach@example.com", name: COACH }, plan: "solo" } });

    // Player links.
    if (path === "shares" && method === "GET") {
      return route.fulfill({ json: { shares: [...shares.values()].map((s) => ({ token: s.token, source: s.source, name: s.snapshot.name, plays: s.snapshot.plays.length, updatedAt: s.updatedAt, results: account.results.filter((r) => r.token === s.token).length })) } });
    }
    if (path === "shares" && method === "POST") {
      const b = body();
      const mine = [...shares.values()].find((s) => s.source === b.source);
      const token = mine?.token ?? TOKEN;
      shares.set(token, { token, source: b.source, snapshot: b.snapshot, updatedAt: now() });
      onShare?.(b);
      return route.fulfill({ status: mine ? 200 : 201, json: { token } });
    }
    const m = path.match(/^shares\/([A-Za-z0-9_-]{16,40})(?:\/(results))?$/);
    if (m) {
      const [, token, action] = m;
      const share = shares.get(token);
      if (!share) return route.fulfill({ status: 404, json: { error: "This link isn't active any more. Ask your coach for a new one." } });
      if (!action && method === "GET") return route.fulfill({ json: { share: { name: share.snapshot.name, plays: share.snapshot.plays, updatedAt: share.updatedAt } } });
      if (!action && method === "DELETE") { shares.delete(token); return route.fulfill({ json: { ok: true } }); }
      if (action && method === "GET") {
        const rows = account.results.filter((r) => r.token === token).sort((a, b) => b.at.localeCompare(a.at));
        return route.fulfill({ json: { results: rows.map(({ token: _t, ...r }) => r) } });
      }
      if (action && method === "POST") {
        const b = body();
        // The rest of the team's scores (set by the recorder) are the ones that came in while the link was out: earlier today.
        const t0 = Date.now();
        (account.pending ?? []).forEach((r, i) => account.results.push({ ...r, token, id: uuid(++account.n), at: new Date(t0 - r.minutesAgo * 60000).toISOString() }));
        account.pending = [];
        account.results.push({ token, id: uuid(++account.n), playerName: String(b.name ?? "").trim().slice(0, 40), letter: String(b.letter ?? "").toUpperCase(), score: Math.trunc(Number(b.score)), total: Math.trunc(Number(b.total)), at: now() });
        return route.fulfill({ status: 201, json: { ok: true } });
      }
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
      const dupe = [...books.values()].find((x) => x.clientId && x.clientId === b.clientId);
      if (dupe) return route.fulfill({ json: { playbook: dupe } });
      const id = uuid(++account.n);
      const book = { id, name: b.name, description: b.description ?? "", color: b.color ?? "", isPublic: false, updatedAt: now(), clientId: b.clientId ?? null };
      books.set(id, book);
      members.set(id, b.playIds ?? []);
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
    if (path === "call-sheets" && method === "GET") return route.fulfill({ json: { sheets: [], owner: "u1" } });
    if (path === "my-team" && method === "GET") return route.fulfill({ json: { team: null } });
    if (path === "brand" && method === "GET") return route.fulfill({ json: { brand: null } });
    if (path === "terms" && method === "GET") return route.fulfill({ json: { terms: null } });
    if (path === "wristband-setups" && method === "GET") return route.fulfill({ json: { setups: null } });
    if (path === "practice" && method === "GET") return route.fulfill({ json: { vault: null } });
    return route.fulfill({ status: 204, body: "" });
  });
}
