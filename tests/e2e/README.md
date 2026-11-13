Server-side end-to-end tests against the Firebase emulators (no deploy, no real data).
Callables and schedules are invoked directly with `fn.run(...)`; Cloud Tasks timers and
push are captured in-process.

    npx firebase-tools emulators:exec --config tests/e2e/firebase.emulators.json \
      --only firestore,auth --project demo-radio \
      "node tests/e2e/board.e2e.cjs && node tests/e2e/dispatch.e2e.cjs && \
       node tests/e2e/dispatcher.e2e.cjs && node tests/e2e/lease.e2e.cjs && \
       node tests/e2e/closeout.e2e.cjs"

Pure logic: `cd functions/lib && node --test`.
