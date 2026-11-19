#!/usr/bin/env bash
# Kyle's merge bot: for each task (K1 K2 ...) take ONLY the files in that task's FILES list from ai/<K>,
# apply them to kyle/main as a 3-way patch, then lint, typecheck, unit tests, real build and the demo click-through.
# Push to kyle/main only if everything passes AND the click-through is all-pass. Otherwise reject and say why.
set -u
export GIT_LITERAL_PATHSPECS=1
LOG=/tmp/merge-bot.log; : > "$LOG"
git config user.name merge-bot; git config user.email merge-bot@users.noreply.github.com
for T in "$@"; do
  echo "== $T" >> "$LOG"
  case "$T" in K[0-9]*) ;; *) echo "$T: not a Kyle task (K-numbers only)" >> "$LOG"; continue ;; esac
  git fetch -q origin "ai/$T" 2>>"$LOG" || { echo "$T: no result branch yet" >> "$LOG"; continue; }
  FILES=$(python3 scripts/prompt-files.py "$T" files)
  [ -n "$FILES" ] || { echo "$T: no FILES list" >> "$LOG"; continue; }
  BASE=$(git merge-base HEAD "origin/ai/$T")
  git diff "$BASE" "origin/ai/$T" -- $FILES > /tmp/w.patch
  [ -s /tmp/w.patch ] || { echo "$T: SKIPPED worker changed none of its files" >> "$LOG"; continue; }
  git apply --3way /tmp/w.patch 2>>"$LOG" || { echo "$T: SKIPPED patch conflict" >> "$LOG"; git reset -q --hard; git clean -fdq; continue; }
  fail(){ echo "$T: REJECTED $1: $(tail -4 "$2" | cut -c1-160 | tr '\n' ' ')" >> "$LOG"; git reset -q --hard; git clean -fdq; }
  npx eslint . > /tmp/l.log 2>&1 || { fail lint /tmp/l.log; continue; }
  npx tsc --noEmit > /tmp/t.log 2>&1 || { fail typecheck /tmp/t.log; continue; }
  npm test > /tmp/u.log 2>&1 || { fail "unit tests" /tmp/u.log; continue; }
  npm run build > /tmp/b.log 2>&1 || { fail build /tmp/b.log; continue; }
  bash tests/qa/run.sh > /tmp/qa.txt 2>&1
  LINE=$(grep -E "^== step1 score [0-9]+/[0-9]+" /tmp/qa.txt | tail -1)
  P=$(echo "$LINE" | sed -E 's/.* ([0-9]+)\/([0-9]+).*/\1/'); N=$(echo "$LINE" | sed -E 's/.* ([0-9]+)\/([0-9]+).*/\2/')
  if [ -n "$LINE" ] && [ "$P" = "$N" ]; then
    git add -A -- $FILES && git commit -qm "merge-bot: $T (${LINE#== })" || { echo "$T: nothing to commit" >> "$LOG"; continue; }
    git pull -q --rebase origin kyle/main 2>>"$LOG"
    git push -q origin HEAD:kyle/main 2>>"$LOG" && echo "$T: MERGED (${LINE#== })" >> "$LOG"
  else
    echo "$T: REJECTED click-through ${LINE:-no result}: $(grep FAIL /tmp/qa.txt | head -2 | cut -c1-160 | tr '\n' ' ')" >> "$LOG"
    git reset -q --hard; git clean -fdq
  fi
done
