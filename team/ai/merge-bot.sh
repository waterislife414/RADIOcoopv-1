#!/usr/bin/env bash
# Merge bot: for each task take ONLY the files in its FILES list from ai/<T>, 3-way apply to the work branch,
# then unit + builds + QA. Push to the work branch only if all pass (QA must exit 0). Otherwise reject and say why.
set -u
. docs/ai/cfg.sh
LOG=/tmp/merge-bot.log; : > "$LOG"
git config user.name merge-bot; git config user.email merge-bot@users.noreply.github.com
for T in "$@"; do
  echo "== $T" >> "$LOG"
  git fetch -q origin "ai/$T" 2>>"$LOG" || { echo "$T: no result branch yet" >> "$LOG"; continue; }
  FILES=$(python3 docs/ai/prompt-files.py "$T" files)
  [ -n "$FILES" ] || { echo "$T: no FILES list" >> "$LOG"; continue; }
  BASE=$(git merge-base HEAD "origin/ai/$T")
  git diff "$BASE" "origin/ai/$T" -- $FILES > /tmp/w.patch
  [ -s /tmp/w.patch ] || { echo "$T: SKIPPED worker changed none of its files" >> "$LOG"; continue; }
  git apply --3way /tmp/w.patch 2>>"$LOG" || { echo "$T: SKIPPED patch conflict" >> "$LOG"; git reset -q --hard; continue; }
  if [ -n "$UNIT_CMD" ] && ! bash -c "$UNIT_CMD" > /tmp/u.log 2>&1; then echo "$T: REJECTED unit tests" >> "$LOG"; git reset -q --hard; continue; fi
  B=$(run_builds); if echo "$B" | grep -q FAIL; then echo "$T: REJECTED $(echo "$B" | grep FAIL | head -1)" >> "$LOG"; git reset -q --hard; continue; fi
  if [ -n "$QA_CMD" ]; then
    bash -c "$QA_CMD" > /tmp/qa.txt 2>&1; QRC=$?
    SCORE=$(grep -E "$QA_SCORE_REGEX" /tmp/qa.txt | head -1)
    if [ "$QRC" != 0 ]; then echo "$T: REJECTED QA ${SCORE:-no result}: $(grep FAIL /tmp/qa.txt | head -2 | cut -c1-120 | tr '\n' ' ')" >> "$LOG"; git reset -q --hard; continue; fi
  fi
  git commit -qam "merge-bot: $T ${SCORE:-}" || { echo "$T: nothing to commit" >> "$LOG"; continue; }
  git pull -q --rebase origin "$WORK_BRANCH" 2>>"$LOG"
  git push -q origin "HEAD:$WORK_BRANCH" 2>>"$LOG" && echo "$T: MERGED ${SCORE:-}" >> "$LOG"
done
