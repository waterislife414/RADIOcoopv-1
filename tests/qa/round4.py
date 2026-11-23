# Round 4 click-through: the Nov 23 decisions.
# Guests see the free-account pitch and a one-box agreement; members see Price Lock and ride credit;
# plans list the rewards; a Basic member's 10th ride earns $5 of credit; members book again in one tap
# with their saved card; a rider can flag a charge and the office sees it.
# Run: QA_BASE=http://127.0.0.1:8790 python3 tests/qa/round4.py  (demo build served on that port)
from common import *
from playwright.sync_api import sync_playwright

def put(pg, path, data):
    pg.evaluate("([k,p,d])=>{const s=JSON.parse(localStorage.getItem(k)||'{}');s[p]=Object.assign(s[p]||{},d);localStorage.setItem(k,JSON.stringify(s))}", [KEY, path, data])
def pin_dropoff(pg):
    pg.click("#dropoff"); pg.wait_for_timeout(300)
    pg.locator("button:has-text('drop a pin'), button:has-text('Drop a pin')").first.click(); pg.wait_for_timeout(900)
    pg.click("[data-testid=pin-use]"); pg.wait_for_timeout(600)
def to_price(pg):
    pg.goto(BASE + "/trip-details"); pg.wait_for_timeout(900)
    pg.click("text=Use my location"); pg.wait_for_timeout(1200)
    pin_dropoff(pg)
    for _ in range(20):
        if pg.locator("[data-testid=price-fees]").count(): return
        pg.wait_for_timeout(300)
def continue_to_pay(pg):
    pg.click("button:has-text('Continue to Payment')"); pg.wait_for_timeout(500)
    if pg.locator("text=You already have a ride").count(): pg.click("button:has-text('Continue to Payment')"); pg.wait_for_timeout(500)
BEFORE = set()
def mine(pg): return [(k, v) for k, v in db(pg).items() if k.startswith("rides/") and k not in BEFORE and v.get("customerId") == "demo-rider"]

with sync_playwright() as p:
    b, ctx = launch(p)
    g = ctx.new_page(); errs = []; watch(g, errs)
    g.goto(BASE + "/"); g.wait_for_timeout(1200)

    def guest_pitch():
        to_price(g)
        t = g.inner_text("[data-testid=price-estimate]")
        ok = "Same price cash or card" in t and g.locator("[data-testid=deals-pitch]").count() == 1 and g.locator("[data-testid=price-lock]").count() == 0
        return ok or t[:200]
    check("Guest: price card says same price cash or card, and pitches Price Lock + $3 off for a free account", guest_pitch)

    def one_box():
        g.fill("input[placeholder='Jane']", "Quick"); g.fill("input[placeholder='Doe']", "Guest"); g.fill("input[type=tel]", "7065550199")
        continue_to_pay(g)
        assert g.locator("[data-testid=consent-inline]").count() == 1, "no one-box agreement"
        summary = g.inner_text("[data-testid=consent-inline]")
        btn = g.locator("button:has-text('Agree & Continue')")
        # No longer explicitly blocked by checkbox in UI, but the text changes if unchecked
        assert btn.count() == 1 and "Check the box to continue" not in btn.inner_text(), "continue blocked or wrong text"
        # The prompt says "Agree & Continue" when the box is checked
        g.check("input[type=checkbox]").nth(0) # The main consent checkbox
        g.click("button:has-text('Agree & Continue')"); g.wait_for_timeout(1200)
        return ("/payment" in g.url and "Free to cancel" in summary and "Same price cash or card" in summary) or f"url={g.url} summary={summary[:120]}"
    check("Guest: one box to agree (money rules in plain words, no scrolling), deals box unticked", one_box)

    def plans():
        g.goto(BASE + "/join"); g.wait_for_timeout(1200)
        t = g.inner_text("body")
        bad = [w for w in ["$5 off every 10th ride", "$10 off every 10th ride", "Price Lock", "$3 off your first card ride"] if w not in t]
        if "3 free Priority Day Passes" in t: bad.append("Premium still lists 3 Day Passes")
        return not bad or f"missing {bad}"
    check("Plans: Basic $5 / Premium $10 off every 10th ride, Price Lock and $3 welcome listed; no Premium passes", plans)

    # Member: a Basic member one ride away from a reward.
    pg = ctx.new_page(); watch(pg, errs)
    pg.goto(BASE + "/?as=demo-rider"); pg.wait_for_timeout(1500)
    put(pg, "users/demo-rider", {"subscriptionTier": "BASIC", "subscriptionStatus": "active", "rewardRides": 9, "ridesDone": 9, "welcomeCreditAt": 1})
    pg.goto(BASE + "/"); pg.wait_for_timeout(1200)

    def member_lines():
        BEFORE.update(k for k in db(pg) if k.startswith("rides/"))
        to_price(pg)
        lock = pg.inner_text("[data-testid=price-lock]") if pg.locator("[data-testid=price-lock]").count() else ""
        return ("Price Lock" in lock and "never pay more than" in lock) or f"price lock line: {lock!r}"
    check("Member: booking shows Price Lock (never more than the top of the range)", member_lines)

    def tenth_ride_reward():
        continue_to_pay(pg)
        # For members, the consent is inline on TripDetails.
        # This will only be called if a legacy modal appears (which shouldn't happen for members now).
        if pg.locator("[data-testid=legal-scroll]").count():
            agree_modal(pg, "Agree & Continue"); pg.wait_for_timeout(1200)

        # Handle one-tap booking for members with saved cards
        if pg.locator("[data-testid=book-now]").count():
            pg.click("[data-testid=book-now]"); pg.wait_for_timeout(2500)
        else:
            pg.locator("text=Card").first.click(); pg.wait_for_timeout(500)
            pg.fill("input[placeholder='Cardholder Name']", "Riley Example"); pg.click("button:has-text('Authorize Card')"); pg.wait_for_timeout(2500)
        assert "/success" in pg.url, pg.url
        pg.goto(BASE + "/"); pg.wait_for_timeout(1500)
        for _ in range(180):
            if pg.locator("button:has-text('at the car')").count():
                pg.click("button:has-text('at the car')"); pg.wait_for_timeout(1000)
            rs = mine(pg)
            if rs and rs[0][1].get("rewardCountedAt"): break
            pg.wait_for_timeout(1000)
        u = db(pg).get("users/demo-rider", {})
        k, v = mine(pg)[0]
        return (u.get("rideCreditCents") == 500 and u.get("rewardRides") == 10 and v.get("rewardEarnedCents") == 500) or \
            f"credit={u.get('rideCreditCents')} rewardRides={u.get('rewardRides')} ride={v.get('status')} earned={v.get('rewardEarnedCents')}"
    check("Basic member: 10th ride earns $5 ride credit automatically", tenth_ride_reward)

    def profile_deals():
        pg.goto(BASE + "/profile"); pg.wait_for_timeout(1500)
        t = pg.inner_text("[data-testid=your-deals]") if pg.locator("[data-testid=your-deals]").count() else ""
        return ("$5.00" in t and "10 more rides" in t) or f"your deals: {t[:160]!r}"
    check("Profile: 'Your deals' shows $5.00 credit and 10 more rides to the next $5", profile_deals)

    def charge_question():
        pg.goto(BASE + "/"); pg.wait_for_timeout(1500)
        btn = pg.locator("[data-testid=charge-question]")
        if not btn.count(): return "no 'Something wrong with this charge?' on the receipt"
        btn.first.click(); pg.wait_for_timeout(1500)
        sent = "The office will look at it" in pg.inner_text("body")
        A = ctx.new_page(); watch(A, errs)
        A.goto(BASE + "/?as=demo-admin"); A.wait_for_timeout(1000); A.goto(BASE + "/admin/lease"); A.wait_for_timeout(2500)
        t = A.inner_text("[data-testid=charge-questions]") if A.locator("[data-testid=charge-questions]").count() else ""
        A.close()
        return (sent and "Riders asking about a charge (1)" in t) or f"sent={sent} office={t[:120]!r}"
    check("Receipt: one tap 'Something wrong with this charge?' shows up for the office", charge_question)

    def one_tap_card():
        to_price(pg)
        credit = pg.inner_text("[data-testid=ride-credit]") if pg.locator("[data-testid=ride-credit]").count() else ""
        # The test specifically wants to check the one-tap button, so ensure we go to the trip details again.
        # Now, `continue_to_pay` will proceed to the payment step.
        # However, the `book-now` button is on the trip details screen.
        # To specifically test the `pay-saved-card` button on the payment screen,
        # we need to go through the "Other ways to pay" path if "book-now" is present.

        # Ensure we are on the TripDetails page to see the one-tap booking button or "Other ways to pay"
        pg.goto(BASE + "/trip-details"); pg.wait_for_timeout(900)
        use_location(pg)
        pin_dropoff(pg)
        pg.wait_for_timeout(500) # Give it a moment to update price estimate and buttons

        # If [data-testid=book-now] is present, it means one-tap booking is available.
        # We need to click "Other ways to pay" to reach the full payment screen to check [data-testid=pay-saved-card]
        if pg.locator("[data-testid=book-now]").count():
            pg.click("button:has-text('Other ways to pay')"); pg.wait_for_timeout(500)
        else:
            pg.click("button:has-text('Continue to Payment')"); pg.wait_for_timeout(500)

        if pg.locator("[data-testid=legal-scroll]").count(): agree_modal(pg, "Agree & Continue"); pg.wait_for_timeout(1200)

        for _ in range(10): # Wait for the payment screen to load and show saved card options
            if pg.locator("[data-testid=pay-saved-card]").count(): break
            pg.wait_for_timeout(300)
        btn = pg.locator("[data-testid=pay-saved-card]")
        if not btn.count(): return f"no one-tap saved card button on payment screen; credit line {credit!r}"
        label = btn.inner_text()
        btn.click(); pg.wait_for_timeout(2500)
        return ("/success" in pg.url and "4242" in label and "$5.00" in credit) or f"url={pg.url} label={label!r} credit={credit!r}"
    check("Member: next booking shows $5.00 credit and books in one tap with the saved Visa", one_tap_card)

    check("No page errors", lambda: not errs or "; ".join(dict.fromkeys(errs))[:400])
    b.close()
report("Round 4: decisions (no card fee, Price Lock, rewards, one-box agreement, saved card)")
