---
description: Save current state to STATE.json so any device/session can resume
---
Update `STATE.json` from this conversation: `updated` (today), `active_app`, `tasks_in_flight`, `last_decisions` (keep the last 10), `blockers`, `next_steps`. No secrets. Then `git add STATE.json apps.json && git commit -m "handoff: <one line>" && git push`. Reply with one line: "Saved. Pick up anywhere with /resume."
