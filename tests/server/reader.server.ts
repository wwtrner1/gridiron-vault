/**
 * Scanned play review, server side (2026-11-13): the quarterback rule on a read,
 * the corrections a coach's fixes teach, the reader's memory per coach and
 * across coaches (three coaches before a lesson reaches everyone, the owner's
 * switch and purge), and the owner's play archive (kept through a delete,
 * purged, erased with the account).
 *
 *   npm run test:server
 */
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { randomUUID } from "node:crypto";

delete process.env.TRIAL_SIGNUPS;
delete process.env.TWILIO_VERIFY_SID;
delete process.env.STRIPE_SECRET_KEY;

const { migrate, client } = await import("./fake-db.ts");
const { signInAs } = await import("./fake-identity.ts");
const { default: api } = await import("../../netlify/functions/api.ts");
const { fixQuarterback, correctionsBetween, setLetter, setAssignment, lessonText } = await import("../../src/lib/photo.ts");
const { lessonsFor } = await import("../../netlify/ai/lessons.ts");

const OWNER_EMAIL = "wwtrner1@gmail.com";
const owner = randomUUID();

async function call(method: string, path: string, body?: unknown) {
  const res = await api(
    new Request(`https://gridiron-vault.com/api/${path}`, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    }),
  );
  const text = await res.text();
  let data: any = text;
  try {
    data = JSON.parse(text);
  } catch {
    /* empty */
  }
  return { status: res.status, data };
}

async function coach() {
  const id = randomUUID();
  signInAs({ id, email: `${id.slice(0, 8)}@example.com` });
  await call("GET", "me");
  await client.query("update profiles set plan = 'solo' where id = $1", [id]);
  return id;
}
const as = (id: string) => signInAs({ id, email: id === owner ? OWNER_EMAIL : `${id.slice(0, 8)}@example.com` });

/** Wes's board (2026-11-13): numbered players, 2 a square on the ball, 0 deep in the backfield with no line. */
const board = () => ({
  isPlay: true,
  name: "Cross Combo",
  formation: "Custom",
  game: "5v5" as const,
  losY: 0.6,
  offenseAt: "bottom" as const,
  players: [
    { board: "1", vault: "X", side: "offense" as const, x: 0.45, y: 0.6 },
    { board: "2", vault: "Q", side: "offense" as const, x: 0.6, y: 0.6 },
    { board: "3", vault: "Y", side: "offense" as const, x: 0.78, y: 0.6 },
    { board: "4", vault: "H", side: "offense" as const, x: 0.7, y: 0.68 },
    { board: "0", vault: "S", side: "offense" as const, x: 0.6, y: 0.85 },
  ],
  assignments: [
    { player: "X", kind: "route" as const, action: "post", heard: "" },
    { player: "Q", kind: "route" as const, action: "out", heard: "" },
    { player: "Y", kind: "route" as const, action: "go", heard: "" },
    { player: "H", kind: "route" as const, action: "drag", heard: "" },
  ],
  questions: [{ player: "Q", question: "Is this a QB route/scramble line?", options: ["out", "sweep"] }],
});

before(async () => {
  await migrate();
  signInAs({ id: owner, email: OWNER_EMAIL });
  await call("GET", "me");
});

after(async () => {
  await client.close();
});

describe("The quarterback rule", () => {
  test("the player with no line behind the center is the quarterback; the old Q on the ball becomes the center", () => {
    const fixed = fixQuarterback(board());
    const by = (b: string) => fixed.players.find((p) => p.board === b)!.vault;
    assert.equal(by("0"), "Q");
    assert.equal(by("2"), "C");
    // His line went with him: the center now runs the crossing route, and the question about that line follows it.
    assert.deepEqual(fixed.assignments.map((a) => a.player).sort(), ["C", "H", "X", "Y"]);
    assert.deepEqual(fixed.questions.map((q) => q.player), ["C"]);
    assert.match(fixed.qbNote ?? "", /marked 0 has no line/);
  });

  test("a Q with no line is left alone, and questions about him are dropped", () => {
    const read = { ...board(), assignments: board().assignments.filter((a) => a.player !== "Q") };
    const fixed = fixQuarterback(read);
    assert.equal(fixed.players.find((p) => p.board === "2")!.vault, "Q");
    assert.equal(fixed.questions.length, 0);
    assert.equal(fixed.qbNote, undefined);
  });

  test("a defense is never changed", () => {
    const read = { ...board(), playType: "defense" as const };
    assert.deepEqual(fixQuarterback(read), read);
  });
});

describe("Corrections", () => {
  test("a new letter for a board mark and a new route shape are what the reader learns", () => {
    const before = fixQuarterback(board());
    let after = setLetter(before, 3, "S"); // the board's 4 is the slot, not the back
    after = setAssignment(after, "X", { kind: "route", action: "corner" });
    assert.deepEqual(correctionsBetween(before, after), [
      { kind: "route", from: "post", to: "corner" },
      { kind: "letter", from: "4", to: "S" },
    ]);
    // Swapping letters moves the line with the player.
    assert.equal(after.assignments.find((a) => a.player === "S")?.action, "drag");
    assert.match(lessonText([{ kind: "letter", from: "4", to: "S", times: 2, scope: "coach" }]), /written "4" is the player GridIronVault calls S/);
  });
});

describe("The reader's memory", () => {
  test("a coach's fixes shape their own reads at once and everyone's only after three coaches", async () => {
    const a = await coach();
    const bad = await call("POST", "read-lessons", { corrections: [{ kind: "letter", from: "<script>", to: "Q" }, { kind: "route", from: "post", to: "nonsense" }] });
    assert.equal(bad.data.learned, 0);
    assert.equal((await call("POST", "read-lessons", { corrections: [{ kind: "letter", from: "0", to: "Q" }] })).data.learned, 1);
    await call("POST", "read-lessons", { corrections: [{ kind: "letter", from: "0", to: "Q" }] });
    const mine = await call("GET", "read-lessons");
    assert.equal(mine.data.lessons.length, 1);
    assert.equal(mine.data.lessons[0].times, 2);
    assert.deepEqual(
      (await lessonsFor(a)).map((l) => l.scope),
      ["coach"],
    );

    const b = await coach();
    await call("POST", "read-lessons", { corrections: [{ kind: "letter", from: "0", to: "Q" }] });
    const c = await coach();
    assert.equal((await lessonsFor(c)).length, 0, "two coaches aren't enough");
    const d = await coach();
    await call("POST", "read-lessons", { corrections: [{ kind: "letter", from: "0", to: "Q" }] });
    as(c);
    await call("POST", "read-lessons", { corrections: [{ kind: "route", from: "out", to: "dig" }] });
    const forC = await lessonsFor(c);
    assert.deepEqual(forC.map((l) => `${l.scope}:${l.from}>${l.to}`), ["coach:out>dig", "app:0>Q"]);

    // A coach without the lesson sees nothing until it's shared by three; the owner can switch it off and purge it.
    as(d);
    assert.equal((await call("GET", "admin/lessons")).status, 404);
    as(owner);
    const list = await call("GET", "admin/lessons");
    const zero = list.data.lessons.find((l: any) => l.from === "0");
    assert.equal(zero.coaches, 3);
    assert.equal(zero.live, true);
    await call("POST", "admin/lessons/switch", { kind: "letter", from: "0", to: "Q", off: true });
    assert.equal((await lessonsFor(c)).some((l) => l.scope === "app"), false);
    const purged = await call("POST", "admin/lessons/purge", { kind: "letter", from: "0", to: "Q" });
    assert.equal(purged.data.purged, 3);

    as(c);
    await call("DELETE", "read-lessons");
    assert.equal((await call("GET", "read-lessons")).data.lessons.length, 0);
    void a;
    void b;
  });
});

describe("The owner's play archive", () => {
  test("every saved play is copied, kept through the coach's delete, purged by the owner and erased with the account", async () => {
    const id = await coach();
    const scanned = await call("POST", "plays", { name: "Scanned Mesh", tags: ["imported", "scan", "to-check"], scene: { version: 2, nodes: [] } });
    assert.equal(scanned.status, 201);
    const drawn = await call("POST", "plays", { name: "Our Flood", tags: [], scene: { version: 2, nodes: [] } });
    await call("PUT", `plays/${drawn.data.play.id}`, { name: "Our Flood 2" });
    await call("DELETE", `plays/${scanned.data.play.id}`);

    as(id);
    assert.equal((await call("GET", "admin/archive")).status, 404, "coaches can't see the archive");
    as(owner);
    const list = await call("GET", `admin/archive?owner=${id}`);
    assert.equal(list.status, 200);
    const rows = list.data.plays as any[];
    assert.deepEqual(rows.map((r) => r.name).sort(), ["Our Flood 2", "Scanned Mesh"]);
    const mesh = rows.find((r) => r.name === "Scanned Mesh");
    assert.equal(mesh.source, "scanned");
    assert.ok(mesh.deletedAt, "kept when the coach deletes it");
    assert.equal(rows.find((r) => r.name === "Our Flood 2").source, "created");

    const deletedOnly = await call("GET", `admin/archive?owner=${id}&deleted=1`);
    assert.equal(deletedOnly.data.total, 1);
    assert.equal((await call("POST", "admin/archive/purge", { scope: "all" })).status, 400, "the whole archive needs PURGE typed");
    const one = await call("POST", "admin/archive/purge", { scope: "play", playId: mesh.playId });
    assert.equal(one.data.purged, 1);
    const audit = await call("GET", "admin/audit");
    assert.ok(audit.data.entries.some((e: any) => e.action === "archive_purge"));

    as(id);
    const gone = await call("DELETE", "me", { confirm: `${id.slice(0, 8)}@example.com` });
    assert.ok(gone.status < 300, JSON.stringify(gone.data));
    const left = await client.query<{ n: number }>("select count(*)::int as n from play_archive where owner_id = $1", [id]);
    assert.equal(left.rows[0].n, 0);
  });
});
