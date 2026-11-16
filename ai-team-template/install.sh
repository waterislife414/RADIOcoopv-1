#!/usr/bin/env bash
# Usage: ./install.sh /path/to/app-repo [default-branch] [work-branch]
# Copies the AI team into an app repo. work-branch is where workers branch from (default: same as default-branch).
set -e
T="${1:?path to app repo}"; DEF="${2:-main}"; WORK="${3:-$DEF}"
H="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$T/.github/workflows" "$T/docs/ai" "$T/tests/qa"
for f in "$H"/.github/workflows/*.yml; do sed "s/step1-wip/$WORK/g" "$f" > "$T/.github/workflows/$(basename "$f")"; done
cp "$H"/ai/* "$T/docs/ai/"
cp "$H"/qa/run.sh "$H"/qa/serve.cjs "$T/tests/qa/"; chmod +x "$T/tests/qa/run.sh"
cp "$H"/qa/diagnostics-snippet.py "$T/tests/qa/"
[ -f "$T/AGENTS.md" ] || cp "$H/AGENTS.template.md" "$T/AGENTS.md"
[ -f "$T/AI_PROMPT.md" ] || cp "$H/AI_PROMPT.template.md" "$T/AI_PROMPT.md"
[ -f "$T/docs/ai/KNOWLEDGE.md" ] || cp "$H/KNOWLEDGE.template.md" "$T/docs/ai/KNOWLEDGE.md"
echo "Installed. Next: edit AGENTS.md, docs/ai/KNOWLEDGE.md, AI_PROMPT.md; adjust build/test commands in the workflows (npm run build:demo, tests/qa/run.sh, firebase emulator line in verify.yml); add repo secrets GEMINI_API_KEY, OPENROUTER_API_KEY, GROQ_API_KEY; commit workflows to the DEFAULT branch ($DEF) so schedule/dispatch work."
