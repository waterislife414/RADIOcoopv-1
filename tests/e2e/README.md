Server-side end-to-end tests against the Firebase emulators (no deploy, no real data).
Callables and schedules are invoked directly with `fn.run(...)`; Cloud Tasks timers and
push are captured in-process.

    npx firebase-tools emulators:exec --config tests/e2e/firebase.emulators.json \
      --only firestore,auth --project demo-radio \
      'for t in board dispatch dispatcher lease closeout incentives phone; do node tests/e2e/$t.e2e.cjs || exit 1; done'

Each suite wipes the emulator database first (reset.cjs).

Pure logic: `cd functions/lib && node --test`.
