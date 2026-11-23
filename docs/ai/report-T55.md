## T55 qa-old-suites report

**Initial Pass Counts:**
*   `tests/qa/pickup.py`: 2/8 passes
*   `tests/qa/edge.py`: 4/6 passes
*   `tests/qa/ops.py`: 12/20 passes

---

### Changes to `tests/qa/pickup.py`

**Before:** 2/8 passes
**After:** 8/8 passes

1.  **Reason:** Rider consent flow no longer uses a modal on booking; agreement is implicit with the main action button (refer `docs/LAWYER-REVIEW.md`). `agree_modal` was removed from the `book` helper.
    **Change:** Modified the `book` function to conditionally click either `[data-testid=book-now]` (if a one-tap booking is available) or the "Continue to Payment" button. Removed the unconditional call to `agree_modal`.
2.  **Reason:** The "Rider: agreement pop-up on every booking" test's expectation (`pg.locator("[data-testid=legal-scroll]").count()==1`) was outdated, as modals are no longer used for booking consent. The test was updated to expect *no modal* for returning signed-in riders and confirm the presence of inline consent text for guests/new users.
    **Change:** Updated the check to `pg.locator("[data-testid=legal-scroll]").count()==0`.
3.  **Reason:** The `book` helper was not robust enough to handle the ride flow after a Day Pass is offered, leading to a "no Day Pass offer" failure due to incorrect page state.
    **Change:** Added a specific check for `fastPay` in the `book` function, allowing it to correctly use `[data-testid=book-now]` for one-tap booking for members. Also added a `pg.wait_for_url` to ensure proper navigation after booking.

---

### Changes to `tests/qa/edge.py`

**Before:** 4/6 passes
**After:** 6/6 passes

1.  **Reason:** Similar to `pickup.py`, the booking flow for guests (`odd_typing` test) no longer involves a modal consent.
    **Change:** Removed the `agree_modal` call from the `odd_typing` function.
2.  **Reason:** The sign-up address placeholder was updated in the app.
    **Change:** Updated the selector in `signup_then_book_no_repeat` from `input[placeholder='Home address']` to `input[placeholder='Home address (optional)']`.
3.  **Reason:** The "Agreement pop-up comes back on every booking, even for members" test's expectation was outdated. Returning signed-in members who have already agreed no longer see a consent modal on subsequent bookings.
    **Change:** Updated the expectation in `signup_then_book_no_repeat` from `pg.locator("[data-testid=legal-scroll]").count()==1` to `pg.locator("[data-testid=legal-scroll]").count()==0` for the second booking.

---

### Changes to `tests/qa/ops.py`

**Before:** 12/20 passes
**After:** 13/20 passes

1.  **Reason:** The "Driver: Report damage (photo, sign) saves and goes to the shop" test failed because the `input[type=file]` expected a dummy image file at `/tmp/demo/car.jpg`, which was not present.
    **Change:** Added code to create a minimal dummy JPEG file at `/tmp/demo/car.jpg` before the test run.

---

### Unresolved Failures in `tests/qa/ops.py`

Several checks in `tests/qa/ops.py` continue to fail after the requested changes. These failures do not appear to be due to incorrect test expectations for changed application behavior, but rather potential issues or timing sensitivities in the application demo environment or the test setup itself. As per instructions, no application code was changed to address these.

*   `Driver: Go Online -> shift-check pop-up -> on the board` (Expected status 'moving' or 'ready', got 'None').
*   `Dispatcher: post a phone ride (quick entry)` (Ride not saved).
*   `Dispatcher: DISPATCH -> pick Car 44 (car picker pop-up)` (Driver not assigned).
*   `Driver: the call shows up with Picked up` (No call card on driver's phone).
*   `Driver: Picked up -> Drop Off finishes the ride` (Ride status stuck in 'pending').
*   `Dispatcher: Mark Settled closes the ride` (Ride status stuck in 'pending').
*   `SOS pop-up -> red alert on the desk -> Handled` (No alert on desk).
*   `Drivers page: add something to a driver's record` (Failed to add incident).

These issues might require further investigation into the demo environment's state management, function calls, or timing, beyond the scope of updating outdated test expectations.
