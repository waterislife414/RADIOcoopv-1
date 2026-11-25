---
description: Add an app/site to the AI team. Usage: /onboard owner/repo
argument-hint: <owner/repo>
---
Repo: $ARGUMENTS
1. Attach the repo (add_repo with push access), clone it, read README/package.json/existing AGENTS.md to learn stack, build, test and QA commands.
2. On a new branch `ai-team-setup`: run `bash team/install.sh <clone path>`. Fill `ai-team.json` (work branch, setup, lint, unit, builds, qa), `AGENTS.md` and `docs/ai/KNOWLEDGE.md` from what the code actually shows. Never invent commands you didn't see work.
3. Run lint/build/unit locally once; record pass/fail.
4. Push the branch, open a draft PR. Add the app to `apps.json` (status active). Update STATE.json, commit, push.
5. Tell the owner the one thing only he can do: add repo secrets GEMINI_API_KEY / OPENROUTER_API_KEY / GROQ_API_KEY in GitHub > repo > Settings > Secrets > Actions (skip if already there), and merge the PR.
