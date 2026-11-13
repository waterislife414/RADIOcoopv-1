Server-side end-to-end tests against the Firestore emulator (no deploy needed).

    npx firebase-tools emulators:exec --only firestore --project demo-radio "node tests/e2e/board.e2e.cjs"

Callables and schedules are invoked directly with `fn.run(...)`.
