// Deletes Netlify Database branches left behind by Deploy Previews.
//
// Every Deploy Preview gets its own database branch, and Netlify never removes
// it when the PR closes. The project's cap is 300; once it fills, every new
// Deploy Preview fails with a 500 from createSiteDatabaseBranch (Netlify
// support case #1159571). Run by .github/workflows/db-branch-cleanup.yml.
//
//   MODE=sweep   delete the branch of every git branch that has no open PR
//   MODE=closed  delete the branch for BRANCH (the PR that just closed)
//
// Env: NETLIFY_AUTH_TOKEN, SITE_ID, MODE, BRANCH (closed), KEEP (sweep: one git
// branch per line to keep), DRY_RUN=true lists without deleting, LIMIT caps
// how many git branches are deleted in one run.
// Netlify's delete endpoint takes a deploy id: DELETE
// /api/v1/sites/{site}/database/branch/{deploy_id}. We try the branch's newest
// deploys first; a 404 moves on to the next one.

const API = "https://api.netlify.com/api/v1";
const token = process.env.NETLIFY_AUTH_TOKEN;
const site = process.env.SITE_ID;
const mode = process.env.MODE ?? "sweep";
const dryRun = process.env.DRY_RUN !== "false";
const limit = Number(process.env.LIMIT || 0) || Infinity;
const keep = new Set(["main", ...(process.env.KEEP ?? "").split("\n").map((s) => s.trim()).filter(Boolean)]);
const TRIES = 5;

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

/** Every preview and branch deploy, newest first, grouped by git branch. */
async function deploysByBranch() {
  const byBranch = new Map();
  for (let page = 1; ; page++) {
    const { status, body } = await call("GET", `/sites/${site}/deploys?per_page=100&page=${page}`);
    if (status === 401 || status === 403) fail(`Netlify refused the token (${status}). Make a new one and update the secret.`);
    if (status !== 200) fail(`Listing deploys failed (${status}): ${JSON.stringify(body).slice(0, 300)}`);
    if (!Array.isArray(body) || body.length === 0) break;
    for (const d of body) {
      if (d.context !== "deploy-preview" && d.context !== "branch-deploy") continue;
      if (!d.branch || d.branch === "main") continue;
      if (!byBranch.has(d.branch)) byBranch.set(d.branch, []);
      byBranch.get(d.branch).push(d.id);
    }
  }
  return byBranch;
}

async function deleteBranch(branch, ids) {
  for (const id of ids.slice(0, TRIES)) {
    const { status, body } = await call("DELETE", `/sites/${site}/database/branch/${id}`);
    if (status >= 200 && status < 300) return { ok: true, id };
    if (status === 404) continue;
    if (status === 401 || status === 403) fail(`Netlify refused the token (${status}).`);
    return { ok: false, id, status, detail: JSON.stringify(body).slice(0, 200) };
  }
  return { ok: false, status: 404, detail: "no database branch found for its newest deploys (already gone, or never made)" };
}

const byBranch = await deploysByBranch();
const targets =
  mode === "closed"
    ? [process.env.BRANCH].filter((b) => byBranch.has(b))
    : [...byBranch.keys()].filter((b) => !keep.has(b)).sort();

console.log(`Mode: ${mode}${dryRun ? " (dry run: nothing is deleted)" : ""}`);
console.log(`Git branches with preview deploys: ${byBranch.size}. Kept: ${[...keep].join(", ")}`);
console.log(`To clean up: ${targets.length}${Number.isFinite(limit) ? ` (this run handles up to ${limit})` : ""}`);

let deleted = 0;
let missing = 0;
const errors = [];
for (const branch of targets.slice(0, limit)) {
  if (dryRun) {
    console.log(`would delete: ${branch} (${byBranch.get(branch).length} deploys)`);
    continue;
  }
  const r = await deleteBranch(branch, byBranch.get(branch));
  if (r.ok) {
    deleted++;
    console.log(`deleted: ${branch} (deploy ${r.id})`);
  } else if (r.status === 404) {
    missing++;
    console.log(`skipped: ${branch}: ${r.detail}`);
  } else {
    errors.push(`${branch}: ${r.status} ${r.detail}`);
    console.log(`::warning::${branch}: ${r.status} ${r.detail}`);
  }
}

const summary = dryRun
  ? `Dry run: ${Math.min(targets.length, limit)} database branches would be deleted.`
  : `Deleted ${deleted}, already gone ${missing}, errors ${errors.length}.`;
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) {
  const { appendFileSync } = await import("node:fs");
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Netlify database branch cleanup\n\n${summary}\n${errors.map((e) => `- ${e}`).join("\n")}\n`);
}
if (errors.length) process.exit(1);
