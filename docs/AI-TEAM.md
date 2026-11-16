# AI team (all free tiers). Owner: Jared. General manager: Claude (reviews, merges, runs full tests). Workers do one task per branch `ai/<task>`.
Work happens in GitHub Actions (.github/workflows/ai-task.yml): manager pushes branch `ai-go/<task>`, worker runs Aider on the task from AI_PROMPT.md, pushes `ai/<task>` + docs/ai/report-<task>.txt.
Shared memory for every worker: AGENTS.md, docs/CHANGES-AND-TODO.md, AI_PROMPT.md.
| Seat | Model/key (GitHub secret) | Job |
|---|---|---|
| 1 Gemini 2.5 Flash | GEMINI_API_KEY (added) | Single-screen UI: T2 accuracy circle, T3 fix buttons, T4 Call him |
| 2 OpenRouter free coder model | OPENROUTER_API_KEY (pending) | T6 Playwright QA scripts, tests, boilerplate |
| 3 Groq free open model | GROQ_API_KEY (pending) | Fast small fixes, diff second-opinion review |
| Manager Claude | n/a | Plans, reviews diffs, runs e2e/rules/builds, merges, touches money/rules/dispatch logic |
Free-tier limits apply; model names change, so verify before relying on them.
