// Deletes Netlify Database branches left behind by Deploy Previews.
//
// Every Deploy Preview gets its own database branch, and Netlify never removes
// it when the PR closes. The project's cap is 300; once it fills, every new
// Deploy Preview fails with a 500 from createSiteDatabaseBranch (Netlify
// support case #1159571). Run by .github/workflows/db-branch-cleanup.yml.
//
//   MODE=sweep   delete every database branch whose git branch has no open PR
//   MODE=closed  delete the database branch for BRANCH (the PR that just closed)
//
// Env: NETLIFY_AUTH_TOKEN, SITE_ID, MODE, BRANCH (closed), KEEP (sweep: one git
// branch per line to keep), DRY_RUN=true lists without deleting, LIMIT caps
// how many branches are deleted in one run.
//
// API (Netlify's OpenAPI spec): GET /sites/{site}/database/branches lists
// { branches: [{ branch_id, name, ... }] }, and
// DELETE /sites/{site}/database/branch/{branch_id} removes one (204). A
// preview's branch_id is its git branch name. The production branch is never
// touched.

const API = "https://api.netlify.com/api/v1";
const token = process.env.NETLIFY_AUTH_TOKEN;
const site = process.env.SITE_ID;
const mode = process.env.MODE ?? "sweep";
const dryRun = process.env.DRY_RUN !== "false";
const limit = Number(process.env.LIMIT || 0) || Infinity;
const PROTECTED = new Set(["production", "main"]);
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

const listed = await call("GET", `/sites/${site}/database/branches`);
if (listed.status === 401 || listed.status === 403) fail(`Netlify refused to list database branches (${listed.status}): ${short(listed.body)}`);
if (listed.status !== 200) fail(`Listing database branches failed (${listed.status}): ${short(listed.body)}`);
const branches = (listed.body?.branches ?? []).map((b) => ({ id: b.branch_id ?? b.name, name: b.name ?? b.branch_id, lastActive: b.last_active_at }));
const isProtected = (b) => PROTECTED.has(b.id) || PROTECTED.has(b.name);

const targets =
  mode === "closed"
    ? branches.filter((b) => !isProtected(b) && (b.id === process.env.BRANCH || b.name === process.env.BRANCH))
    : branches.filter((b) => !isProtected(b) && !keep.has(b.id) && !keep.has(b.name)).sort((a, b) => String(a.lastActive).localeCompare(String(b.lastActive)));

console.log(`Mode: ${mode}${dryRun ? " (dry run: nothing is deleted)" : ""}`);
console.log(`Database branches: ${branches.length} (cap 300). Kept: ${[...keep].join(", ")}`);
console.log(`To delete: ${targets.length}${Number.isFinite(limit) ? ` (this run handles up to ${limit}, oldest first)` : " (oldest first)"}`);

let deleted = 0;
let gone = 0;
const errors = [];
for (const b of targets.slice(0, limit)) {
  if (dryRun) {
    console.log(`would delete: ${b.name} (last active ${b.lastActive ?? "unknown"})`);
    continue;
  }
  const { status, body } = await call("DELETE", `/sites/${site}/database/branch/${encodeURIComponent(b.id)}`);
  if (status >= 200 && status < 300) {
    deleted++;
    console.log(`deleted: ${b.name}`);
  } else if (status === 404) {
    gone++;
    console.log(`already gone: ${b.name}`);
  } else {
    errors.push(`${b.name}: ${status} ${short(body)}`);
    console.log(`::warning::${b.name}: ${status} ${short(body)}`);
    if (status === 401 || status === 403) break;
  }
}

const summary = dryRun
  ? `Dry run: ${Math.min(targets.length, limit)} of ${branches.length} database branches would be deleted.`
  : `Deleted ${deleted}, already gone ${gone}, errors ${errors.length}. About ${branches.length - deleted} branches remain.`;
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) {
  const { appendFileSync } = await import("node:fs");
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Netlify database branch cleanup\n\n${summary}\n${errors.map((e) => `- ${e}`).join("\n")}\n`);
}
if (errors.length) process.exit(1);
