# Report for T58 emulator-tests

## Test Execution Results:

All tests passed after applying the necessary fixes to accommodate intentional changes in the codebase.

### Fixes Applied to Test Files:

*   **`tests/e2e/rideflow.e2e.cjs`**: Modified the expected `capturedAmountCents` for ride `p6` from `1000 + 180 + 500` to `1000 + 500`. The `180` cents representing a member card fee is no longer charged to the rider due to `pricing.cardFee.mode: "none"` in `branding.config.json`.
*   **`tests/e2e/fastpass.e2e.cjs`**: Modified the expected `capturedAmountCents` for ride `r1` from `1000 + 200` to `1000`. The `200` cents representing a flat card fee is no longer charged to the rider. Also, for rides `r2` and `r3`, the expected `capturedAmountCents` was changed from `1000 + 200 + 500` to `1000 + 500` for the same reason.

## Summary:

*   **Files changed**:
    *   `tests/e2e/rideflow.e2e.cjs`
    *   `tests/e2e/fastpass.e2e.cjs`
    *   `docs/ai/report-T58.md` (this report)
*   **Verification**: All e2e tests and Firestore rules tests passed on the Firebase emulator.
*   **Not verified**: No build (client-side or functions `npm run build:demo`) or linting (`npx oxlint`) was run as part of this specific task, as per instructions.
