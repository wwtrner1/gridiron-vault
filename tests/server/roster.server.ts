/**
 * Rosters on the server: My team keeping several teams on the account (and an older tab's single team not wiping
 * the others), documents kept with a player (only their coach, or that Front Office team's staff, can list,
 * download or remove them; the bytes go when the player, the team or the account goes), and Remove selected on a
 * Front Office roster. The API function itself runs against PGlite, a stand-in Identity and in-memory Blobs.
 *
 *   npm run test:server
 */
import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { randomUUID } from "node:crypto";

delete process.env.TRIAL_SIGNUPS;
delete process.env.TWILIO_VERIFY_SID;

const { migrate, client } = await import("./fake-db.ts");
const { signInAs } = await import("./fake-identity.ts");
const { stores } = await import("./fake-blobs.ts");
const { default: api } = await import("../../netlify/functions/api.ts");

type Coach = { id: string; email: string };
const blobs = () => [...(stores.get("team-files")?.keys() ?? [])];

async function call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const raw = body instanceof Uint8Array;
  const res = await api(
    new Request(`https://gridiron-vault.com/api/${path}`, {
      method,
      headers: { "content-type": raw ? "application/pdf" : "application/json", ...headers },
      body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
    }),
  );
  const text = await res.text();
  let data: any = text;
  try {
    data = JSON.parse(text);
  } catch {
    /* a download */
  }
  return { status: res.status, data, headers: res.headers };
}

let n = 0;
async function newCoach(): Promise<Coach> {
  const coach = { id: randomUUID(), email: `roster${++n}@example.com` };
  signInAs(coach);
  await call("GET", "me");
  return coach;
}

const pdf = new TextEncoder().encode("%PDF-1.4 physical");
const upload = (scope: string, player: string, name = "Physical.pdf") => call("POST", `player-files/${scope}/${player}`, pdf, { "x-file-name": encodeURIComponent(name) });

const team = (id: string, name: string, players: { id: string; firstName: string }[]) => ({ id, name, level: "", season: "", players, charts: [], updatedAt: "2026-11-01T00:00:00.000Z" });

before(async () => {
  await migrate();
});

describe("My team on the account", () => {
  test("keeps every team, and an older tab's one team replaces only the first", async () => {
    await newCoach();
    const two = { teams: [team("my-team", "Mustangs 8U", [{ id: "p1", firstName: "Casen" }]), team("t2", "Spring 7v7", [{ id: "p2", firstName: "Mack" }])], updatedAt: "2026-11-01T00:00:00.000Z" };
    assert.equal((await call("PUT", "my-team", { teams: two })).status, 200);
    let got = (await call("GET", "my-team")).data;
    assert.deepEqual(
      got.teams.teams.map((t: { name: string; players: unknown[] }) => [t.name, t.players.length]),
      [
        ["Mustangs 8U", 1],
        ["Spring 7v7", 1],
      ],
    );
    assert.equal(got.team.name, "Mustangs 8U");

    // A tab opened before this release still sends `{ team }`.
    await call("PUT", "my-team", { team: { ...team("my-team", "Mustangs 8U (renamed)", []), id: undefined, updatedAt: "2026-11-02T00:00:00.000Z" } });
    got = (await call("GET", "my-team")).data;
    assert.deepEqual(
      got.teams.teams.map((t: { name: string }) => t.name),
      ["Mustangs 8U (renamed)", "Spring 7v7"],
    );
  });

  test("a player's new fields (middle name, grad year, sizes, picture) are kept and a bad picture is dropped", async () => {
    await newCoach();
    const photo = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==";
    const player = { id: "p1", firstName: "Casen", middleName: "Lee", gradYear: "35", sizes: { jersey: "YS", shirt: "YM", pants: "YS" }, photo };
    const bad = { id: "p2", firstName: "Mack", photo: "javascript:alert(1)" };
    await call("PUT", "my-team", { teams: { teams: [team("my-team", "Mustangs", [player, bad] as never)], updatedAt: "2026-11-01T00:00:00.000Z" } });
    const [p1, p2] = (await call("GET", "my-team")).data.teams.teams[0].players;
    assert.equal(p1.middleName, "Lee");
    assert.equal(p1.gradYear, "2035");
    assert.deepEqual(p1.sizes, { jersey: "YS", shirt: "YM", pants: "YS" });
    assert.equal(p1.photo, photo);
    assert.equal(p2.photo, "");
  });
});

describe("Documents kept with a player", () => {
  test("My team: only the coach lists, downloads and removes them; removing the player or the account drops the bytes", async () => {
    const coach = await newCoach();
    const up = await upload("my.my-team", "p1");
    assert.equal(up.status, 201);
    assert.equal(up.data.files.length, 1);
    const file = up.data.files[0];
    assert.equal(file.name, "Physical.pdf");
    assert.ok(blobs().includes(`players/${coach.id}/${file.id}`));

    const down = await call("GET", `player-file/${file.id}`);
    assert.equal(down.status, 200);
    assert.match(down.headers.get("content-disposition") ?? "", /^attachment;/);
    assert.equal(down.headers.get("x-content-type-options"), "nosniff");
    assert.equal(down.headers.get("cache-control"), "private, no-store");
    assert.equal(down.data, "%PDF-1.4 physical");

    // Another coach sees nothing, even with the same team and player names.
    await newCoach();
    assert.deepEqual((await call("GET", "player-files/my.my-team/p1")).data.files, []);
    assert.equal((await call("GET", `player-file/${file.id}`)).status, 404);
    assert.equal((await call("DELETE", `player-file/${file.id}`)).status, 404);
    assert.ok(blobs().includes(`players/${coach.id}/${file.id}`));

    // A file type the hub doesn't take is refused before anything is stored.
    signInAs(coach);
    const exe = await upload("my.my-team", "p1", "setup.exe");
    assert.equal(exe.status, 400);

    // Removing the player drops their files.
    await call("DELETE", "player-files/my.my-team/p1");
    assert.deepEqual((await call("GET", "player-files/my.my-team/p1")).data.files, []);
    assert.ok(!blobs().some((k) => k.startsWith(`players/${coach.id}/`)));

    // Removing a whole team drops its players' files; deleting the account drops what is left.
    await upload("my.t2", "p9");
    await call("DELETE", "player-files/my.t2");
    assert.ok(!blobs().some((k) => k.startsWith(`players/${coach.id}/`)));
    await upload("my.my-team", "p3");
    assert.ok(blobs().some((k) => k.startsWith(`players/${coach.id}/`)));
    assert.equal((await call("DELETE", "me", { confirm: coach.email })).status < 300, true);
    assert.ok(!blobs().some((k) => k.startsWith(`players/${coach.id}/`)));
    assert.equal((await client.query("select count(*)::int as n from player_files where owner_id = $1", [coach.id])).rows[0].n, 0);
  });

  test("Front Office: the team's staff see a player's files; Remove selected drops the players and their files", async () => {
    const director = await newCoach();
    const org = (await client.query<{ id: string }>("insert into organizations (owner_id, name) values ($1, 'Hawks') returning id", [director.id])).rows[0].id;
    const teamId = (await client.query<{ id: string }>("insert into teams (org_id, name) values ($1, '8U') returning id", [org])).rows[0].id;
    const add = await call("POST", `teams/${teamId}/players`, { players: [{ firstName: "Casen" }, { firstName: "Mack" }, { firstName: "Harvey" }] });
    assert.equal(add.status, 201);
    const [a, b, c] = add.data.players.map((p: { id: string }) => p.id);

    const up = await upload(teamId, a);
    assert.equal(up.status, 201);
    assert.ok(blobs().includes(`${org}/players/${up.data.files[0].id}`));
    // A player id that isn't on that roster is refused.
    assert.equal((await upload(teamId, randomUUID())).status, 404);

    // A coach outside the Front Office gets the same 404 as a team that doesn't exist.
    await newCoach();
    assert.equal((await call("GET", `player-files/${teamId}/${a}`)).status, 404);
    assert.equal((await call("GET", `player-file/${up.data.files[0].id}`)).status, 404);
    assert.equal((await call("DELETE", `teams/${teamId}/players`, { ids: [a, b] })).status, 404);

    signInAs(director);
    const removed = await call("DELETE", `teams/${teamId}/players`, { ids: [a, b, randomUUID()] });
    assert.equal(removed.status, 200);
    assert.equal(removed.data.removed, 2);
    assert.deepEqual(
      removed.data.players.map((p: { id: string }) => p.id),
      [c],
    );
    assert.ok(!blobs().some((k) => k.startsWith(`${org}/players/`)));
    assert.equal((await call("DELETE", `teams/${teamId}/players`, { ids: [] })).status, 400);
  });
});
