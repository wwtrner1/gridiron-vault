# Copilot repo instructions

- Never push directly to `main` from an AI-assisted or automation session.
- Before starting a code run, confirm the working branch. If the branch is an auto-generated agent branch or looks disposable, create or switch to a PR branch and keep the work out of `main` until review is complete.
- Use a feature branch for every agent task and open a pull request to merge it into `main`.
- Preview builds must pass before merge. Treat Netlify duplicate-deploy messages as a sign that the deploy is reusing an older branch/commit path rather than a clean main build.
- After the PR is merged, delete the temporary agent branch in GitHub.
- Do not merge a branch that has not passed the repository checks (`npx tsc -p .`, `npm run build`, and the relevant test suite: `npm run test:server`, `npm run test:e2e`).
- If a branch name looks agent-generated (`agent-*`, `copilot-*`, `claude/*`, `netlify-*`, `floot-*`, `lovable-*`, or similar), treat it as disposable and review it through a PR.
- Keep all AI-generated work inside a normal PR flow so preview builds catch regressions before production deploys.

Full policy: `docs/ai-branch-policy.md`.
