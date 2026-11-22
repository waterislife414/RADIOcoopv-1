# Instructions for any AI working on this repo (Alabama Unclaimed Property Recovery)
Read first: docs/ai/KNOWLEDGE.md, docs/ai/lessons.md, config/rules.yaml, db/schema.sql.
Stack: plain Python 3.12, SQLite (stdlib sqlite3), PyYAML, pytest, ruff. NOT a web app. NOT Node. No external paid APIs. No network calls in code you write unless a task says so.
## Rules
1. One task per branch `ai/<task>`. Never push to main.
2. Before saying done run: `ruff check .` and `pytest -q`. Say plainly what you did NOT run.
3. Every threshold, percentage, keyword list and date window lives in config/rules.yaml. Never hard-code them.
4. Money is integer cents. Dates are ISO strings (YYYY-MM-DD). Never guess a column name: read db/schema.sql.
5. Tests use ONLY synthetic data from fixtures/. Real data lives in data/ (gitignored, never in this repo, never in a prompt).
## Never (stop and ask the owner)
- Never type, create, print or commit secrets, keys, tokens, SSNs, bank or card numbers.
- Never put a real person's or business's name, address, phone, email or amount in code, tests, docs or logs. Use the fixtures.
- Never scrape or automate a website. Query builders only return strings or URLs for a human or the manager to open.
- Never write or change legal wording (agreement/letter terms in docs/COMPLIANCE.md and templates/). Layout and rendering only.
- Never change config/rules.yaml thresholds or the 24-month / 10% rules.
## Safe for free workers: pure functions, parsers, formatters, CSV import/export, tests.
## Manager only: rules.yaml, legal text, scoring policy, anything that sends or stores contact data.
