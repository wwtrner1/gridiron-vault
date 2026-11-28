# Using the Claude Console credits (expire 2026-11-29 05:34 UTC)

Wes's Individual Org (the API org linked to the Max plan) received **$100 in API credits** on 2026-11-28. They apply to the **Claude API, Claude Managed Agents, the Claude Agent SDK and the Playground only**. They do not pay for Claude Code sessions or extra usage in the Claude apps, and they do not touch Griddy in production (Griddy goes through Netlify AI Gateway, billed on its own).

You don't have to spend all of it. Spend it on work worth having.

## What's ready

| Piece | Where | What it does |
|---|---|---|
| Program account researcher | `scripts/managed-agents/program-account-researcher/` | A Managed Agent that reads college flag football programs' public athletics and staff pages and returns a CSV of program Instagram/X accounts and listed coaches, every answer with a source URL. Input: `data/programs-to-research.csv` (325 programs with no social account yet). |
| Griddy live check | `npm run griddy:live` | Runs Griddy against the real Claude API with a fixed Vault and scores each card through the app's own code. Each run is one Griddy turn. |

## Two ways to start (pick one)

**A. On your own computer (recommended: no secret leaves it).**

```sh
brew install anthropics/tap/ant          # macOS; Linux: see the ant CLI releases page
ant auth login                           # opens a browser; choose Wes's Individual Org
ant auth status                          # confirm the org and workspace before anything else

cd scripts/managed-agents
ant apply --dry-run program-account-researcher/agent.md program-account-researcher/environment.yaml
ant apply --yes program-account-researcher/agent.md program-account-researcher/environment.yaml
```

Start a run (attach `data/programs-to-research.csv` to the session as a file first, or send the first 40 rows for a smoke test):

```sh
AGENT_ID=$(jq -r '.resources["./program-account-researcher/agent.md"].id' claude-lock.json)
ENV_ID=$(jq -r '.resources["./program-account-researcher/environment.yaml"].id' claude-lock.json)
SID=$(ant beta:sessions create --agent "$AGENT_ID" --environment-id "$ENV_ID" --transform id -r)
ant beta:sessions:events send --session-id "$SID" < program-account-researcher/kickoff.yaml
ant beta:sessions:events stream --session-id "$SID"      # watch it work
```

Watch the same session in the Console (`https://platform.claude.com/workspaces/default/sessions/<id>`). Commit `claude-lock.json` with the agent files so a later `ant apply` doesn't create duplicates.

Griddy check, on a computer with the repo:

```sh
ANTHROPIC_API_KEY=<a Console key from Wes's Individual Org> npm run griddy:live -- --runs 2
npm run griddy:live -- --dry             # no API calls; scores the ideal replies
```

**B. A key in the cloud environment.** A Claude API key can be saved only as an *environment variable* (Network secrets can't be saved for Anthropic's own hosts). Everyone who uses that environment, and any command in its sessions, can read it. If you do it, make a key just for this, with a spend limit, and delete it after Nov 29. A new session then picks it up.

## Getting the most out of Managed Agents

- **Outcomes.** When a run produces one deliverable (a CSV, a report), start it with `user.define_outcome` and a rubric, as `kickoff.yaml` does. A separate grader checks the work against the rubric and sends the agent back until it passes. Tune the rubric; it is the quality bar.
- **Session budget.** Put a hard dollar cap on a session when you create it (`budget: {type: "limit", max_list_cost: {amount, currency}}` on session create; see the Managed Agents core guide). Do it for any run you leave unattended.
- **Effort.** The researcher runs at `effort: low`. Raise it only where answers are wrong, not by default.
- **Cheaper workers.** For long reading jobs, a cheaper model (Sonnet 5.5, or Haiku 5.5 for plain extraction) stretches the credits. The agent file uses Opus 5.5 because that is the default; change `model.id` to try it, and compare a 40-row sample first.
- **Schedules.** A deployment (`deployment-*.yaml`) fires the same agent on a cron schedule, for example a weekly check of new programs. Credits that expire don't fund a schedule, so add one only if the run will be paid for later.
- **Memory stores.** An agent that keeps state between runs (which programs it already verified) can use a memory store. Skip it for a one-off.
- **Workflows and subagents.** Fan-out across hundreds of sites is what multi-agent workflows are for, but they spend more tokens. Try the single agent on 40 rows first.

## Honest limits

- Coaches' personal handles are mostly not listed on school pages. Expect "not found" for most; the agent is told not to guess.
- Sites that block automated access stay blocked; the agent marks them and moves on.
- Managed Agents bills session runtime on top of tokens. I couldn't price a full 325-row run from here; run the 40-row sample first and read the cost from the Console before scaling up.
- Instagram can't be read without logging in, so the agent works from school pages, not from Instagram itself.
