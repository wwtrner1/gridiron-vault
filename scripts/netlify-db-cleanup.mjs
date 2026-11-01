// Clears Netlify Database branches left behind by Deploy Previews.
//
// Every Deploy Preview gets its own database branch, and Netlify never removes
// it when the PR closes. The real limit is 249 (the Database page says 300,
// but Netlify support confirmed 249 on #1159571); past it, every new
// Deploy Preview fails with a 500 from createSiteDatabaseBranch (Netlify
// support case #1159571). Run by .github/workflows/db-branch-cleanup.yml.
//
// Netlify's API refuses to delete a database branch with a personal token
// (401 "This operation must be performed from the Netlify dashboard."), but a
// database branch is removed when its preview deploys are deleted, and the
// API does allow deleting deploys. So this deletes a stale branch's preview
// deploys, then lists the database branches again to report which are gone.
//
//   MODE=sweep   every database branch whose git branch has no open PR
//   MODE=closed  the database branch for BRANCH (the PR that just closed)
//
// Env: NETLIFY_AUTH_TOKEN, SITE_ID, MODE, BRANCH (closed), KEEP (sweep: one git
// branch per line to keep), DRY_RUN=true lists without deleting, LIMIT caps
// how many branches are handled in one run (oldest first).
//
// API (Netlify's OpenAPI spec): GET /sites/{site}/database/branches,
// GET /sites/{site}/deploys (paged), DELETE /sites/{site}/deploys/{deploy_id}.
// Production, main and production-context deploys are never touched.

const API = "https://api.netlify.com/api/v1";
const token = process.env.NETLIFY_AUTH_TOKEN;
const site = process.env.SITE_ID;
const mode = process.env.MODE ?? "sweep";
const dryRun = process.env.DRY_RUN !== "false";
const limit = Number(process.env.LIMIT || 0) || Infinity;
const PROTECTED = new Set(["production", "main"]);
const DELETABLE_CONTEXTS = new Set(["deploy-preview", "branch-deploy"]);
const keep = new Set([...PROTECTED, ...(process.env.KEEP ?? "").split("\n").map((s) => s.trim()).filter(Boolean)]);

if (!token) fail("NETLIFY_AUTH_TOKEN is missing. Add it under Settings → Secrets and variables → Actions.");
if (!site) fail("SITE_ID is missing.");
if (mode === "closed" && !process.env.BRANCH) fail("MODE=closed needs BRANCH.");

function fail(message) {
  console.error(`::error::${message}`);
  process.exit(1);
}

async function call(method, path) {
  const res = await fetch(API + path, { method, headers: { Authorization: `Bearer ${token}` } });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

const short = (body) => (typeof body === "string" ? body : JSON.stringify(body ?? "")).slice(0, 200);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function databaseBranches() {
  const { status, body } = await call("GET", `/sites/${site}/database/branches`);
  if (status !== 200) fail(`Listing database branches failed (${status}): ${short(body)}`);
  return (body?.branches ?? []).map((b) => ({ id: b.branch_id ?? b.name, name: b.name ?? b.branch_id, lastActive: b.last_active_at }));
}

/** Deletable deploy ids (previews and branch deploys only) per git branch. */
async function deploysByBranch() {
  const byBranch = new Map();
  for (let page = 1; ; page++) {
    const { status, body } = await call("GET", `/sites/${site}/deploys?per_page=100&page=${page}`);
    if (status !== 200) fail(`Listing deploys failed (${status}): ${short(body)}`);
    if (!Array.isArray(body) || body.length === 0) break;
    for (const d of body) {
      if (!d.branch || PROTECTED.has(d.branch) || !DELETABLE_CONTEXTS.has(d.context)) continue;
      if (!byBranch.has(d.branch)) byBranch.set(d.branch, []);
      byBranch.get(d.branch).push(d.id);
    }
  }
  return byBranch;
}

const before = await databaseBranches();
const isProtected = (b) => PROTECTED.has(b.id) || PROTECTED.has(b.name);
const stale = (
  mode === "closed"
    ? before.filter((b) => !isProtected(b) && (b.id === process.env.BRANCH || b.name === process.env.BRANCH))
    : before.filter((b) => !isProtected(b) && !keep.has(b.id) && !keep.has(b.name))
).sort((a, b) => String(a.lastActive).localeCompare(String(b.lastActive)));

const deploys = stale.length ? await deploysByBranch() : new Map();
const idsOf = (b) => deploys.get(b.name) ?? deploys.get(b.id) ?? [];
const noDeploys = stale.filter((b) => !idsOf(b).length).map((b) => b.name);
// The limit counts only branches this run can act on, so LIMIT=1 always tests one real delete.
const targets = stale.filter((b) => idsOf(b).length).slice(0, limit);

console.log(`Mode: ${mode}${dryRun ? " (dry run: nothing is deleted)" : ""}`);
console.log(`Database branches: ${before.length} (limit 249, though the dashboard says 300). Kept: ${[...keep].join(", ")}`);
console.log(`Stale: ${stale.length}. With preview deploys to delete: ${stale.length - noDeploys.length}. This run: ${targets.length}${Number.isFinite(limit) ? ` (limit ${limit}, oldest first)` : ""}`);
for (const name of noDeploys) console.log(`no preview deploys left for: ${name} (only a dashboard delete clears it)`);

let deployCount = 0;
const errors = [];

for (const b of targets) {
  const ids = idsOf(b);
  if (dryRun) {
    console.log(`would delete ${ids.length} preview deploys of: ${b.name}`);
    continue;
  }
  for (const id of ids) {
    const { status, body } = await call("DELETE", `/sites/${site}/deploys/${id}`);
    if (status >= 200 && status < 300) deployCount++;
    else if (status !== 404) {
      errors.push(`${b.name} deploy ${id}: ${status} ${short(body)}`);
      console.log(`::warning::${b.name} deploy ${id}: ${status} ${short(body)}`);
      if (status === 401 || status === 403) break;
    }
  }
  console.log(`deleted ${ids.length} preview deploys of: ${b.name}`);
  if (errors.some((e) => / 40[13] /.test(e))) break;
}

let summary;
if (dryRun) {
  summary = `Dry run: ${targets.length} branches would have their preview deploys deleted; ${noDeploys.length} stale branches have none left (dashboard only).`;
} else {
  await sleep(Number(process.env.SETTLE_MS ?? 15000));
  const after = await databaseBranches();
  const stillThere = new Set(after.map((b) => b.name));
  const cleared = targets.filter((b) => !stillThere.has(b.name)).map((b) => b.name);
  const remaining = targets.filter((b) => stillThere.has(b.name)).map((b) => b.name);
  for (const name of remaining) console.log(`database branch still there: ${name}`);
  summary = `Deleted ${deployCount} preview deploys. Database branches cleared: ${cleared.length} of ${targets.length}. Now ${after.length} (limit 249).`;
  if (remaining.length) summary += ` Still there (may clear shortly, or need a dashboard delete): ${remaining.slice(0, 10).join(", ")}${remaining.length > 10 ? "…" : ""}`;
}
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) {
  const { appendFileSync } = await import("node:fs");
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Netlify database branch cleanup\n\n${summary}\n${errors.map((e) => `- ${e}`).join("\n")}\n`);
}
if (errors.length) process.exit(1);
