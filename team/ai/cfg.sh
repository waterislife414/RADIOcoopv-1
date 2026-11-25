#!/usr/bin/env bash
# Source this: exports the app's AI-team settings from ai-team.json (repo root) as shell vars.
# Every workflow uses these instead of hard-coded branch names / commands.
F="${AI_TEAM_JSON:-ai-team.json}"
[ -f "$F" ] || { echo "missing $F (copy team/templates/ai-team.json)"; exit 1; }
j(){ jq -r "$1 // empty" "$F"; }
export WORK_BRANCH="$(j .work_branch)"; WORK_BRANCH="${WORK_BRANCH:-main}"
export SETUP_CMD="$(j .setup)"
export LINT_CMD="$(j .lint)"
export UNIT_CMD="$(j .unit)"
export BUILD_CMDS="$(jq -r '(.builds // []) | join(" ;; ")' "$F")"   # ";;" separated list
export QA_CMD="$(j .qa)"                                              # exits 0 only when all checks pass
export QA_SCORE_REGEX="$(j .qa_score_regex)"; QA_SCORE_REGEX="${QA_SCORE_REGEX:-^== }"
export QA_TASKS="$(jq -r '(.qa_tasks // []) | join(" ")' "$F")"       # tasks whose test cmd is the QA click-through
export CODE_DIRS="$(jq -r '(.code_dirs // ["src"]) | join(" ")' "$F")"
export READ_ALWAYS="$(jq -r '(.read_always // []) | map("--read " + .) | join(" ")' "$F")"
export LINT_LANG="$(j .lint_lang)"
export DEFAULT_MODEL="$(j .default_model)"; DEFAULT_MODEL="${DEFAULT_MODEL:-gemini/gemini-2.5-flash}"
export MODELS="$(jq -r '(.model_chain // ["gemini/gemini-3.5-flash-lite","openrouter/cohere/north-mini-code:free","openrouter/google/gemma-4-31b-it:free","groq/llama-3.3-70b-versatile"]) | join(" ")' "$F")"
export WATCH="$(jq -r '(.watch // []) | join(" ")' "$F")"
export E2E_CMD="$(j .e2e)"
export NEEDS_PLAYWRIGHT="$(j .needs_playwright)"
RATE_RE="rate.?limit|NotFoundError|quota|RESOURCE_EXHAUSTED|is unavailable|overloaded"
export RATE_RE
# Run every build; print "name pass|FAIL" lines.
run_builds(){ local IFS=$'\n'; for b in $(echo "$BUILD_CMDS" | sed 's/ ;; /\n/g'); do [ -n "$b" ] || continue; if bash -c "$b" > /tmp/build.log 2>&1; then echo "build[$b] pass"; else echo "build[$b] FAIL"; fi; done; }
# Score line from the QA command (empty if no QA configured).
qa_score(){ [ -n "$QA_CMD" ] && bash -c "$QA_CMD" 2>&1 | grep -E "$QA_SCORE_REGEX" | head -1; }
