# Rider-simple click-through: one Book button, price before paying, totals per way of paying,
# the same price after booking, extras folded away, driver first name on the pickup card.
# Run: QA_BASE=http://127.0.0.1:8790 python3 tests/qa/simple.py  (demo build served on that port)
import re, sys
from common import *
from playwright.sync_api import sync_playwright

money = lambda t: float(re.search(r"\$(\d+\.\d\d)", t).group(1))

def pin_dropoff(pg):
    pg.click("#dropoff"); pg.wait_for_timeout(300)
    pg.locator("button:has-text('drop a pin'), button:has-text('Drop a pin')").first.click(); pg.wait_for_timeout(900)
    pg.click("[data-testid=pin-use]"); pg.wait_for_timeout(600)

with sync_playwright() as p:
    b, ctx = launch(p)
    pg = ctx.new_page(); errs = []; watch(pg, errs)

    def home_one_button():
        pg.goto(BASE + "/"); pg.wait_for_timeout(1200)
        ok = pg.locator("[data-testid=book-ride]").count() == 1 and pg.locator("text=Continue as Guest").count() == 0
        return (ok and pg.locator("[data-testid=account-links]").count() == 1) or "home still shows the old buttons"
    check("Home: one Book a Ride button for everyone, log in/sign up as links", home_one_button)

    def price_before_paying():
        pg.click("[data-testid=book-ride]"); pg.wait_for_timeout(900)
        assert "/trip-details" in pg.url, pg.url
        hint = pg.inner_text("[data-testid=price-estimate]")
        assert "to see your price" in hint, hint
        pg.click("text=Use my location"); pg.wait_for_timeout(1200)
        pin_dropoff(pg)
        t = pg.inner_text("[data-testid=price-amount]")
        btn = pg.inner_text("button:has-text('Continue to Payment')")
        return ("About $" in t and money(t) >= 2.16 and money(btn) == money(t)) or f"price={t!r} button={btn!r}"
    check("Booking: price shows before paying, and on the Continue button", price_before_paying)

    def extras_folded():
        closed = pg.locator("#passengers-select").count() == 0
        more_options(pg)
        opened = pg.locator("#passengers-select").count() == 1
        return (closed and opened) or f"closed={closed} opened={opened}"
    check("Booking: extras sit behind More options", extras_folded)

    def totals_per_method():
        global fare
        fare = money(pg.inner_text("[data-testid=price-amount]"))
        pg.fill("input[placeholder='Jane']", "Simple"); pg.fill("input[placeholder='Doe']", "Tester")
        pg.fill("input[type=tel]", "7065550123")
        pg.click("button:has-text('Continue to Payment')"); pg.wait_for_timeout(500)
        agree_modal(pg, "Agree & Continue"); pg.wait_for_timeout(900)
        assert "/payment" in pg.url, pg.url
        cash = money(pg.inner_text("[data-testid=total-cash]"))
        card = money(pg.inner_text("[data-testid=total-card]"))
        summary = money(pg.inner_text("[data-testid=summary-fare]"))
        # No card fee (Nov 23 decision): a guest's card total is the fare.
        ok = cash == fare and summary == fare and abs(card - fare) < 0.005
        return ok or f"fare={fare} cash={cash} card={card} summary={summary}"
    check("Payment: trip summary, cash total = fare, card total = fare (no card fee)", totals_per_method)

    def same_price_after():
        pg.locator("button:has-text('Cash')").first.click(); pg.wait_for_timeout(2000)
        assert "/success" in pg.url, pg.url
        t = pg.inner_text("[data-testid=success-price]")
        rides = [v for k, v in db(pg).items() if k.startswith("rides/") and v.get("firstName") == "Simple"]
        ok = money(t) == fare and rides and rides[0].get("estMiles", 0) > 0
        return ok or f"success={t!r} estMiles={rides[0].get('estMiles') if rides else None}"
    check("Success: same price, no typing miles; ride saved with estMiles", same_price_after)

    def no_fake_badge():
        pg.goto(BASE + "/join"); pg.wait_for_timeout(900)
        return pg.locator("text=/most popular/i").count() == 0 or "Most Popular badge still shown"
    check("Plans: no 'Most Popular' badge", no_fake_badge)

    def member_riding_as():
        pg.goto(BASE + "/?as=demo-rider"); pg.wait_for_timeout(1500)
        pg.goto(BASE + "/trip-details"); pg.wait_for_timeout(1200)
        return pg.locator("[data-testid=riding-as]").count() == 1 or "name/phone fields still shown to a signed-in rider"
    check("Signed-in booking: shows 'Riding as' instead of name and phone boxes", member_riding_as)

    def driver_first_name():
        pg.click("text=Use my location"); pg.wait_for_timeout(1200)
        pin_dropoff(pg)
        pg.click("button:has-text('Continue to Payment')"); pg.wait_for_timeout(500)
        if pg.locator("text=You already have a ride").count():
            pg.click("button:has-text('Continue to Payment')"); pg.wait_for_timeout(500)
        if pg.locator("[data-testid=legal-scroll]").count():
            agree_modal(pg, "Agree & Continue")
        pg.wait_for_timeout(1200)
        pg.locator("text=Card").first.click(); pg.wait_for_timeout(400)
        pg.fill("input[placeholder='Cardholder Name']", "Riley Example"); pg.click("button:has-text('Authorize Card')")
        for _ in range(90):
            if pg.locator("[data-testid=driver-identity]").count():
                break
            pg.wait_for_timeout(1000)
        t = pg.inner_text("[data-testid=driver-identity]") if pg.locator("[data-testid=driver-identity]").count() else ""
        return ("Car " in t and "Driver " in t) or f"identity card: {t!r}"
    check("Pickup: rider sees car number and driver's first name", driver_first_name)

    real = [e for e in errs if "photon.komoot" not in e]
    check("No page errors", lambda: not real or str(real[:3]))
    b.close()
report("Rider simple")
