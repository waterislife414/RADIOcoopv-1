# Radio Co-op Taxi PWA: master change log and to-do (nothing here may be dropped)

Stack: React 19 + Vite + Tailwind + Firebase (Auth, Firestore, Storage, Functions v2 CJS) + Stripe + Twilio. Plain JS/JSX. NOT Supabase/TypeScript/pnpm. Build: `npm run build`, `npm run build:demo`.
Standing rules: nothing deployed to live site; no billing/Stripe/Malcolm info until paid; ask before publishing or Cloud Shell; run all tests + both builds before "done"; check screens with Playwright; commit after each piece; never type secret keys for the user.
Spec: Project docs `claude/build-spec-2026-11-15.md` and `-part2.md`. Build order step 1 only until the user says go: spec §1 (1.1 GPS accuracy, 1.2 member ride on dispatcher screen, 1.3 exact Check Ready reasons, 1.4 demo jump buttons), §9 dispatcher pegboard, §21 Report a problem / Ask dispatch / approval pop-up; then §30 click-through checks.

## DONE (on branch step1-wip, committed; e2e/rules reported passing by test agent, not re-run by lead)
- Config: dispatch.gps.maxAccuracyMeters 100, statusColors, needsDispatcherAlertMinutes 3, approvalValidMinutes 60, approvalsBeforeFlag 2, approvalRepeatSeconds 120, support{devEmail,ownerEmail placeholders}.
- 1.1/1.3 Check Ready refused unless accuracy <= 100 m ("Waiting for a better GPS signal (±N m)"); problem box with fix buttons (vehicle check, try again, ask dispatch); accuracy text line.
- §21 functions/support.js: reportProblem, answerApproval (approve places driver, deny needs reason, approval lasts 60 min, >2 approvals/week -> owner_inbox). UI: AskDispatch.jsx, ApprovalAnswer.jsx (read aloud), ApprovalPopup.jsx (admin, beeps, repeats 2 min), deviceInfo.js error log.
- §9 Pegboard.jsx: zone map, car pins by status color, rider pins/lines, zone strip, Working pane, Off/out pane, status key, +New call, Needs dispatcher flash/chime after 3 min.
- Dispatcher override: dispatcher can change ANY driver to any state at any time (pull back offers, release dispatched ride to escalated, finish in_transit, radio call on any non-offline car). App driver can't be placed in a zone his GPS isn't in (unchanged).
- 1.4 demo: real GPS by default, demo clock, "Demo location" label, popup after 2PM/4PM jumps.
- Rules/indexes/tests updated; AGENTS.md; AI_PROMPT.md; opencode.jsonc; start-mobile-coding.sh; .github/workflows/ai-task.yml.

## TO DO for step 1 (assigned in AI_PROMPT.md as T1-T6)
T1 full tests+builds (lead does). T2 GPS accuracy circle on driver map. T3 fix buttons for agreement/permission blockers. T4 "Call him" button in approval pop-up. T5 drag a call onto a car (§9.3). T6 update Playwright QA scripts for real-GPS default + removed old Board; add tests/qa/step1.py.
Also: §9 header shift label and zone-parked auto placement; 1.2 member ride on dispatcher screen verify; real phone GPS test; real `npm run build`; §30 pass/fail report; then STOP and ask before step 2.

## OPEN / UNRESOLVED (from earlier sessions)
- rideflow e2e leaks a Firestore transaction lock; ride-trigger cost; queueStatus reads; client-supplied arrival evidence; `needsAccessibleVehicle` waiver; legal items (claude/lawyer-review.md).
- APPROVED 2026-11-16 by Jared ("Simplify it... have them simplify"): build the 6 UI-only points of the 7-point dispatcher simplification as a wave AFTER step 1 is green (plain-words board status, activity feed, "Needs you" box, phone call in two taps, radio cars simple, today-at-a-glance). "Driver enters meter fare" CONFIRMED in concept 2026-11-16: card ride -> driver enters meter amount -> rider gets pay link/app prompt showing the amount, rider approves + pays, driver phone shows Paid. Demo uses the Stripe shim only (no billing). Open: flag amounts well over the estimate; tips; cash rides unchanged. Build after the simplify wave; I write the money logic myself (server-side only, integer cents). Must not break spec §9.
- (was) Unconfirmed proposal (7 points): board plain-words status, activity feed, driver enters meter fare, "Needs you" box, phone call in two taps, radio cars simple, today-at-a-glance. Ask user whether to build; partly superseded by spec.
- Test link demo-v16 is stale; updating needs fresh OK for Cloud Shell Authorize.
- Handover to Malcolm must change only API keys and account settings.
