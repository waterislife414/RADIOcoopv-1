#!/usr/bin/env bash
# Usage: bin/dispatch.sh <app-name> T1 [T2 ...]  -> pushes ai-go/<Tn> branches (from the work branch) to start workers.
set -e
cd "$(dirname "$0")/.."
A="${1:?app name}"; shift; [ $# -gt 0 ] || { echo "give task ids"; exit 1; }
R=$(jq -r --arg a "$A" '.apps[]|select(.name==$a)|.repo' apps.json); WB=$(jq -r --arg a "$A" '.apps[]|select(.name==$a)|.work_branch' apps.json)
[ -n "$R" ] || { echo "unknown app $A"; exit 1; }
D="${HQ_WORK:-$HOME/hq-apps}/$A"
[ -d "$D/.git" ] || git clone -q "https://github.com/$R" "$D"
git -C "$D" fetch -q origin "$WB"
for T in "$@"; do
  git -C "$D" show "origin/$WB:AI_PROMPT.md" | grep -qE "^$T " || { echo "$T: no task line in AI_PROMPT.md on $WB, skipped"; continue; }
  git -C "$D" push -q -f origin "origin/$WB:refs/heads/ai-go/$T" && echo "$T: started (watch: ai/$T, then merge-bot/result)"
done
