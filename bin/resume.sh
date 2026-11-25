#!/usr/bin/env bash
# Print a short brief: STATE.json + latest bot results for every active app in apps.json.
# Works with public repos anonymously (git); private repos need GitHub access for this session.
cd "$(dirname "$0")/.."
echo "## STATE"; jq -c '{active_app,blockers,next_steps}' STATE.json
W="${HQ_WORK:-$HOME/hq-apps}"; mkdir -p "$W"
for row in $(jq -c '.apps[]|select(.status=="active")|{name,repo}' apps.json); do
  N=$(echo "$row" | jq -r .name); R=$(echo "$row" | jq -r .repo); D="$W/$N"
  echo "## $N ($R)"
  [ -d "$D/.git" ] || git clone -q --filter=blob:none --no-checkout "https://github.com/$R" "$D" 2>/dev/null || { echo "  cannot read repo"; continue; }
  git -C "$D" fetch -q origin '+refs/heads/*:refs/remotes/origin/*' 2>/dev/null
  show(){ git -C "$D" show "origin/$1:$2" 2>/dev/null | head -"${3:-8}" | sed 's/^/  /'; }
  echo " merge-bot:"; show merge-bot/result docs/ai/merge-result.txt 12
  echo " verify:";    show verify/result docs/ai/verify.txt 20 | grep -E "FAIL|target" || echo "  (all pass or no run)"
  echo " qa:";        { show qa/result docs/ai/qa.txt 40 || show qa/result docs/ai/qa-step1.txt 40; } | grep -E "^  (==|  FAIL)" | head -6
  echo " workers:";   git -C "$D" for-each-ref --sort=-committerdate --count=6 --format='  %(refname:short) %(committerdate:relative) %(contents:subject)' 'refs/remotes/origin/ai/T*'
done
