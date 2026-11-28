#!/usr/bin/env bash
# NOTE: the --budget flag name is from the docs, not tested here: check `ant beta:sessions create --help`.
# Usage: ./run.sh <agent-folder> [max_usd]   e.g. ./run.sh drill-video-finder 5
# Needs the `ant` CLI signed in to the right org (ant auth login; ant auth status) and jq.
set -euo pipefail
cd "$(dirname "$0")"
A="${1:?agent folder}"; CAP="${2:-5}"
ant apply --yes "$A/agent.md" "$A/environment.yaml"
AGENT_ID=$(jq -r ".resources[\"./$A/agent.md\"].id" claude-lock.json)
ENV_ID=$(jq -r ".resources[\"./$A/environment.yaml\"].id" claude-lock.json)
# Attach the CSV in $A/data/ to the session as a file (Console: Sessions > the new session), or paste its rows.
SID=$(ant beta:sessions create --agent "$AGENT_ID" --environment-id "$ENV_ID" \
  --budget "{\"type\":\"limit\",\"max_list_cost\":{\"amount\":$CAP,\"currency\":\"USD\"}}" --transform id -r)
echo "session $SID  https://platform.claude.com/workspaces/default/sessions/$SID"
ant beta:sessions:events send --session-id "$SID" < "$A/kickoff.yaml"
ant beta:sessions:events stream --session-id "$SID"
