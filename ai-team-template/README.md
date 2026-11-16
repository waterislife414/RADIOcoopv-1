# AI Team Skeleton (built on the Radio Co-op Taxi app, Nov 2026)
Owner (you) -> General Manager (Claude: plans, trains, reviews, merges; touches money/permissions/security) -> free Workers (Aider on Gemini / OpenRouter free / Groq) -> free Bots (no AI, no cost).
## Org chart
- **Owner:** sets goals, supplies keys/accounts/legal things only a human can.
- **General Manager (Claude):** writes task prompts, trains workers (lessons.md), reviews, merges. Keeps its own data for hard/risky work.
- **Workers** (ai-task.yml): push branch `ai-go/<Tn>` -> Aider runs the task from AI_PROMPT.md with the whole-repo map, KNOWLEDGE.md, lessons.md, per-model style, auto-lint + auto-test, fallback chain across free models, nudge-retry if no code changed. Result on branch `ai/<Tn>` + report.
- **Reviewer** (ai-review.yml): push `ai-review/<Tn>`; a different model attacks the diff.
- **QA bot** (qa.yml, push `qa-run/x`): builds the demo, runs the Playwright click-through, saves docs/ai/qa-*.txt. **Diagnostics bot** (qa/diagnostics-snippet.py): failed checks print what the screen really had.
- **Verify bot** (verify.yml, push `verify/x`): lint, unit, builds, emulator e2e, rules.
- **Integrator** (integrate.yml, push `integrate/x`): waits for workers, scores each change alone and all together vs baseline.
- **Watchdog** (watchdog.yml, every 5 min): restarts stuck/failed/empty workers (max 2 retries). Edit WATCH list.
## Setup checklist for a new app
1. `./install.sh /path/to/app [default-branch] [work-branch]`. 2. Fill AGENTS.md, docs/ai/KNOWLEDGE.md, AI_PROMPT.md. 3. Edit workflow commands (build/test/QA). 4. Repo secrets: GEMINI_API_KEY (aistudio.google.com/apikey), OPENROUTER_API_KEY (openrouter.ai/settings/keys), GROQ_API_KEY (console.groq.com/keys). Owner pastes keys himself. 5. Workflows must also exist on the DEFAULT branch (schedule/dispatch need it). 6. Run a wave: push `ai-go/T1`.. then `integrate/1`.
## Lessons learned (the expensive ones)
- Tell workers WHICH files and give the whole repo map; vague prompts produced empty files. Never ask them to "create" a file that exists (they overwrite it).
- Passing lint+build does NOT prove UI works: a map crash passed both. Gate merges on the browser click-through score, never on build alone.
- Free tiers are tiny: Gemini 2.5 Flash = 20 requests/day; free models get retired or go paid. Use a fallback chain across providers; check logs for rate-limit/NotFound.
- Reports must say how many code files changed; "build pass" on a no-op means nothing.
- Keep wave tasks on disjoint files; integrate once; merge only if score holds or improves.
- Workers do isolated UI/tests; money, security rules, permissions, business logic stay with the manager.
- Keys pasted in chat are exposed: rotate them. Public repo exposes business rules; use private when possible.
- GitHub pushes made with GITHUB_TOKEN do not trigger workflows; use workflow_dispatch for retries.
