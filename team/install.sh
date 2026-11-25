#!/usr/bin/env bash
# Usage: team/install.sh /path/to/app-repo
# Copies the AI team into an app repo. Never overwrites AGENTS.md / AI_PROMPT.md / KNOWLEDGE.md / ai-team.json if present.
set -e
T="${1:?path to app repo}"
H="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$T/.github/workflows" "$T/docs/ai" "$T/tests/qa"
cp "$H"/.github/workflows/*.yml "$T/.github/workflows/"
# Scripts are always refreshed; per-app tuned files (style-*.txt, lessons.md) are kept if present.
for f in "$H"/ai/*; do case "$f" in *.sh|*.py) cp "$f" "$T/docs/ai/";; *) [ -f "$T/docs/ai/$(basename "$f")" ] || cp "$f" "$T/docs/ai/";; esac; done
chmod +x "$T/docs/ai/"*.sh
for f in run.sh serve.cjs diagnostics-snippet.py; do [ -f "$T/tests/qa/$f" ] || cp "$H/qa/$f" "$T/tests/qa/"; done
[ -f "$T/AGENTS.md" ]            || cp "$H/templates/AGENTS.template.md" "$T/AGENTS.md"
[ -f "$T/AI_PROMPT.md" ]         || cp "$H/templates/AI_PROMPT.template.md" "$T/AI_PROMPT.md"
[ -f "$T/docs/ai/KNOWLEDGE.md" ] || cp "$H/templates/KNOWLEDGE.template.md" "$T/docs/ai/KNOWLEDGE.md"
[ -f "$T/ai-team.json" ]         || cp "$H/templates/ai-team.json" "$T/ai-team.json"
echo "Installed into $T. Fill ai-team.json (branch + commands), AGENTS.md, docs/ai/KNOWLEDGE.md. Workflows must also be on the DEFAULT branch. Repo secrets: GEMINI_API_KEY, OPENROUTER_API_KEY, GROQ_API_KEY (the owner adds them in GitHub > Settings > Secrets)."
