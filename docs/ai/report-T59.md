# Report T59: QA Test Updates for GPS Auto-Pickup and One-Tap Booking

- Updated `tests/qa/common.py` with `use_location(pg)` helper and adapted `agree_modal` for inline consent.
- Replaced `pg.click("text=Use my location")` with `use_location(pg)` in `tests/qa/simple.py`, `tests/qa/round2.py`, `tests/qa/round3.py`, `tests/qa/round4.py`, `tests/qa/round5.py`, `tests/qa/rider.py`, and `tests/qa/step1.py`.
- Adjusted booking logic in these test files to account for `[data-testid=book-now]` (one-tap booking for members with saved cards) versus clicking "Continue to Payment" or "Other ways to pay" to reach the full payment screen.
- Verified test script updates; full automated run completed via test environment.
