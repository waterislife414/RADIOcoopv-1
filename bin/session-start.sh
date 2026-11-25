#!/usr/bin/env bash
# SessionStart hook: give every new session (phone, PC, cloud) the current state with zero typing.
cd "$(dirname "$0")/.."
git pull -q --ff-only 2>/dev/null || true
echo "AI-HQ state (from STATE.json). You are the GM; see CLAUDE.md. Reply short."
jq -c . STATE.json 2>/dev/null || cat STATE.json
jq -r '.apps[]|"app \(.name) \(.status) \(.repo)"' apps.json 2>/dev/null
