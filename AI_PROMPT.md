# Lead prompt (paste into OpenCode/Aider in the Codespace)

Read AGENTS.md first and obey it. Repo: Radio Co-op Taxi PWA (React+Vite+Firebase, plain JS). Branch `step1-wip` holds unfinished "step 1" work. Run `git checkout step1-wip`, `npm ci`, `cd functions && npm ci`.
Run these TASKS in parallel (one sub-agent each, each on its own branch `ai/<task>` off `step1-wip`, one commit per task, never push to main, never touch keys/deploy/money logic/firestore.rules weakening):

T1 tests-green: run lint (`npx oxlint src functions`), `node --test functions/lib/*.test.mjs`, `npm run build`, `npm run build:demo`. E2E needs the Firebase emulator: `firebase emulators:exec --only firestore,auth --project demo-radio "for t in profile board dispatch dispatcher lease closeout incentives phone fastpass inspections callissues rideflow support; do node tests/e2e/$t.e2e.cjs; done; cd tests/rules && npm test"`. Fix only real failures; report pass/fail list.
T2 gps-circle: driver map shows a GPS accuracy circle (radius = fix accuracy, m) in src/components/driver/DriverStatusPanel.jsx or the driver map component; red if > dispatch.gps.maxAccuracyMeters (branding.config.json).
T3 fix-buttons: in DriverStatusPanel `ready-blocker` box add fix buttons for the "agreement not signed" and "permission off" reasons (link to the agreement page / how-to-enable-permission text), same style as existing buttons.
T4 call-him: add a "Call him" tel: button (driver phone from profile) to src/components/admin/ApprovalPopup.jsx.
T5 pegboard-drag: in src/components/admin/Pegboard.jsx allow dragging a waiting call onto a Ready car chip to assign it (use existing dispatcher action in functions/dispatcher.js; no new backend rules).
T6 qa-scripts: update tests/qa/*.py (Playwright) for the demo's new real-GPS default (use the DEMO menu or QA_BASE + geolocation permission set to a zone) and the removed old Board section (use data-testid pegboard). Add tests/qa/step1.py checking: ready-blocker shows on poor GPS, ask-dispatch opens, admin approval-popup appears and Approve places the driver, pegboard renders map + status-key, dispatcher can put any car Out/On a call.
Rules: small diffs, show `git diff --stat`, run lint+unit+both builds before each commit, stop and write blockers to docs/ai-blockers.md instead of guessing. Finish by writing docs/ai-report.md (task, branch, pass/fail, files).
