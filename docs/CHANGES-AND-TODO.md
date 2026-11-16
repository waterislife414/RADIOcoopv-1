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
- APPROVED 2026-11-16 by Jared ("Simplify it... have them simplify"): build the 6 UI-only points of the 7-point dispatcher simplification as a wave AFTER step 1 is green (plain-words board status, activity feed, "Needs you" box, phone call in two taps, radio cars simple, today-at-a-glance). "Driver enters meter fare" CONFIRMED in concept 2026-11-16: card ride -> driver enters meter amount -> rider gets pay link/app prompt showing the amount, rider approves + pays, driver phone shows Paid. Demo uses the Stripe shim only (no billing). Tips (Jared 2026-11-16): rider does NOT add a tip in the pay prompt; a tip screen appears BEFORE the driver approves the transaction: 5% / 10% / 15% / Custom, big and bold, with a small-print "No tip" under it (keep it readable and tappable). Non-payment (rider never approves, or card fails): company collects itself; rider is responsible for fees and costs -> needs Terms/Privacy wording + stored-card consent, ATTORNEY REVIEW (claude/lawyer-review.md). Open: whose screen shows the tip choices (driver phone vs rider); approval time limit; flag amounts well over the estimate; cash rides unchanged. Build after the simplify wave; I write the money logic myself (server-side only, integer cents). Must not break spec §9.
- (was) Unconfirmed proposal (7 points): board plain-words status, activity feed, driver enters meter fare, "Needs you" box, phone call in two taps, radio cars simple, today-at-a-glance. Ask user whether to build; partly superseded by spec.
- Test link demo-v16 is stale; updating needs fresh OK for Cloud Shell Authorize.
- Handover to Malcolm must change only API keys and account settings.

## 2026-11-16 step 1 status
- Merged: T7 (approval popup/answer fixes; its ApprovalAnswer hack reverted), T2 (accuracy circle), T8 (on-call cars stay on board), demo storage-event sync, Escape closes New call drawer, QA check 6 updated. Click-through 8/8, verify 18/18. Reviewer edits NOT merged (they re-added a polling hack).
- NOT done: T5 drag-call-onto-car (conflicts, re-run on new base), §9 header shift label + zone-parked auto placement, 1.2 member-ride verify, §30 pass/fail report, phone GPS test (Jared), settings signal for T3 how-to, simplify wave (6 items), card meter-fare + tip flow, legal wording.

## 2026-11-16 Jared requests (queued, not built yet)
- Queued to workers: T12 car window 4 buttons; T13 real street address + location wording + disclaimer + Contact us; T14 consent boxes default on; T15 compare rates table 2/5/10/20 mi; T16 perks dropdown; T17 orange car stays in pickup zone with -> drop-off zone.
- Needs Claude/decisions: card fee max rate (verify legal cap) minus 0.5% for members; tiers: guest no texts, Free (close-driver updates, offers), Basic (live driver map, message/call, 1x$5 priority/month), Premium (3x$5/month, driver photo+name); trials only next tier up, no priority 3 days running; referral bonus only after verified + first paid trip, 24-48h hold.
- Bugs to fix: driver drop-off stuck after location cancel (no error popup); drop-off should suggest zone from GPS; photo upload freezes after about 5 pics; veteran driver with accessibility skips weekly inspection; driver Ask dispatch popup missed by dispatcher when GPS error; setting a car Next up must not skip the line; owner tab (applications, money in/out).
- Store plan: wrap the PWA for Google Play and the App Store later; keep every screen phone-first and simple (see AI_PROMPT.md GLOBAL RULE).
- Driver incentives (Jared 2026-11-16, queued): monthly winner = 1 day of lick free; employee of the year = 3 days free. Rank by highest average rating; tie broken by more ratings (4.9 with 10 beats 4.9 with 8). Needs a minimum rated-rides count to qualify (open question). Ratings stay anonymous and show on the driver profile a few hours after the ride so riders can't be identified. Free day = lick credit (existing discountCents).
- Points rule (approved): each rated ride earns points = stars (5=5, 4=4, 1-2=0); most points in the month wins 1 free lick day, top year total wins 3; must average 4.5+ to qualify. Ratings anonymous, shown on profile hours later.
- Address plan: real build uses the free US Census geocoder (functions/geocode.js) for real-address check; riders can also drop a pin (T20) for pickup and drop-off; zone comes from coordinates. Offline street list deferred.
