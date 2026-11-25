---
description: Start free workers on an app. Usage: /dispatch <app> T1 T2
argument-hint: <app> <task ids...>
---
Args: $ARGUMENTS
1. Check each task line exists in the app's AI_PROMPT.md on its work branch, has FILES and READ, files are disjoint across the wave, and no FILES touch money, security rules, permissions or dispatch logic. Fix the task lines first if not (commit to work branch).
2. Add the task ids to that app's `ai-team.json` `watch` list (on the default branch so the watchdog sees it).
3. Run `bash bin/dispatch.sh $ARGUMENTS`.
4. Update STATE.json tasks_in_flight, commit, push. Reply in one line.
