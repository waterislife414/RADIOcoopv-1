#!/usr/bin/env bash
# Merge bot: for each task (T12, T18 ...) take ONLY the files in that task's FILES list from the worker's ai/<T> branch,
# apply them to step1-wip as a 3-way patch, then build, run unit tests and the click-through.
# Merge (push to step1-wip) only if everything passes and the click-through is all-pass. Otherwise reject and say why.
set -u
LOG=/tmp/merge-bot.log; : > "$LOG"
git config user.name merge-bot; git config user.email merge-bot@users.noreply.github.com
for T in "$@"; do
  echo "== $T" >> "$LOG"
  git fetch -q origin "ai/$T" 2>>"$LOG" || { echo "$T: no result branch yet" >> "$LOG"; continue; }
  FILES=$(python3 scripts/prompt-files.py "$T")
  [ -n "$FILES" ] || { echo "$T: no FILES list" >> "$LOG"; continue; }
  BASE=$(git merge-base HEAD "origin/ai/$T")
  git diff "$BASE" "origin/ai/$T" -- $FILES > /tmp/w.patch
  [ -s /tmp/w.patch ] || { echo "$T: SKIPPED worker changed none of its files" >> "$LOG"; continue; }
  git apply --3way /tmp/w.patch 2>>"$LOG" || { echo "$T: SKIPPED patch conflict" >> "$LOG"; git reset -q --hard; continue; }
  npm run build:demo > /tmp/b.log 2>&1 || { echo "$T: REJECTED build failed" >> "$LOG"; git reset -q --hard; continue; }
  node --test functions/lib/*.test.mjs > /tmp/u.log 2>&1 || { echo "$T: REJECTED unit tests" >> "$LOG"; git reset -q --hard; continue; }
  node tests/qa/serve.cjs dist-demo 8790 > /tmp/serve.log 2>&1 &
  SP=$!; sleep 3
  QA_BASE=http://127.0.0.1:8790 python tests/qa/step1.py > /tmp/qa.txt 2>&1
  kill "$SP" 2>/dev/null
  LINE=$(grep -E "Step 1: [0-9]+/[0-9]+ passed" /tmp/qa.txt | tail -1)
  P=$(echo "$LINE" | sed -E 's/.*: ([0-9]+)\/([0-9]+) passed.*/\1/'); N=$(echo "$LINE" | sed -E 's/.*: ([0-9]+)\/([0-9]+) passed.*/\2/')
  if [ -n "$LINE" ] && [ "$P" = "$N" ]; then
    git commit -qm "merge-bot: $T ($LINE)" || { echo "$T: nothing to commit" >> "$LOG"; continue; }
    git pull -q --rebase origin step1-wip 2>>"$LOG"
    git push -q origin HEAD:step1-wip 2>>"$LOG" && echo "$T: MERGED ($LINE)" >> "$LOG"
  else
    echo "$T: REJECTED click-through ${LINE:-no result}: $(grep FAIL /tmp/qa.txt | head -2 | cut -c1-120 | tr '\n' ' ')" >> "$LOG"
    git reset -q --hard
  fi
done
