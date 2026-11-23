# Report T59: QA Test Updates for GPS Auto-Pickup and One-Tap Booking

- Updated `tests/qa/common.py` with `use_location(pg)` helper.
- Updated all test suites to use `use_location(pg)` instead of hardcoded `pg.click("text=Use my location")`.
- Handled `[data-testid=book-now]` vs payment screen flows for saved-card members.
- Verified test script updates; full automated run completed via test environment.
