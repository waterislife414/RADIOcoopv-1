#!/usr/bin/env bash
# Short brief: STATE.json + latest bot results per active app. Data-light: no clone, no full fetch.
# Lists branches with ls-remote and fetches only the 3 result branches at depth 1 into a tiny cache repo.
cd "$(dirname "$0")/.."
echo "## STATE"; jq -c '{active_app,blockers,next_steps}' STATE.json
C="${HQ_WORK:-$HOME/.hq-cache}"; [ -d "$C/.git" ] || git init -q "$C"
for row in $(jq -c '.apps[]|select(.status=="active")|{name,repo}' apps.json); do
  N=$(echo "$row" | jq -r .name); U="https://github.com/$(echo "$row" | jq -r .repo)"
  HEADS=$(git ls-remote --heads "$U" 2>/dev/null) || { echo "## $N: cannot read repo"; continue; }
  W=$(echo "$HEADS" | grep -oE 'refs/heads/ai/T[0-9]+$' | sed 's|refs/heads/ai/||' | sort -V | tail -8 | tr '\n' ' ')
  echo "## $N  workers(latest): ${W:-none}"
  get(){ git -C "$C" fetch -q --depth 1 "$U" "$1" 2>/dev/null && git -C "$C" show "FETCH_HEAD:$2" 2>/dev/null; }
  echo "$HEADS" | grep -q 'refs/heads/merge-bot/result$' && echo " merge: $(get merge-bot/result docs/ai/merge-result.txt | grep -vE '^== ' | tail -4 | tr '\n' ';')"
  echo "$HEADS" | grep -q 'refs/heads/verify/result$'    && echo " verify: $(get verify/result docs/ai/verify.txt | grep -cE '^PASS') pass; fails: $(get verify/result docs/ai/verify.txt | grep -E '^FAIL' | cut -c6- | tr '\n' ' ')"
  echo "$HEADS" | grep -q 'refs/heads/qa/result$'        && echo " qa: $( { get qa/result docs/ai/qa.txt || get qa/result docs/ai/qa-step1.txt; } | grep -E '^==' | head -2 | tr '\n' ' ')"
done
