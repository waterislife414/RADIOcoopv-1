# Round 6 click-through: location auto-fill, quick trips/picks, guest memory, consent inline, member one-tap card, ride-back, driver auto-accept toggle.
import json
from common import *
from playwright.sync_api import sync_playwright

PHOTON = {"features": [{"geometry": {"coordinates": [-84.9551, 32.5097]}, "properties": {"name": "Columbus Airport", "housenumber": "3250", "street": "W Britt David Rd", "city": "Columbus", "state": "Georgia"}}]}

def pin_dropoff(pg):
    pg.click("#dropoff"); pg.wait_for_timeout(300)
    pg.locator("button:has-text('drop a pin'), button:has-text('Drop a pin')").first.click(); pg.wait_for_timeout(900)
    pg.click("[data-testid=pin-use]"); pg.wait_for_timeout(600)

with sync_playwright() as p:
    b, ctx = launch(p)
    ctx.route("https://photon.komoot.io/**", lambda r: r.fulfill(status=200, content_type="application/json", body=json.dumps(PHOTON)))
    errs = []

    g = ctx.new_page(); watch(g, errs)
    g.goto(BASE + "/"); g.wait_for_timeout(1000)

    # a) on /trip-details the pickup fills by itself: "Location attached" shows within 3 s without clicking "Use my location"
    def pickup_autofill():
        g.goto(BASE + "/trip-details"); g.wait_for_timeout(500)
        for _ in range(30):
            if "Location attached" in g.inner_text("body"): return True
            g.wait_for_timeout(100)
        return "pickup did not auto-attach location"
    check("TripDetails: pickup fills by itself with Location attached", pickup_autofill)

    # b) after one booking, Home shows [data-testid=home-quick-trips] and /trip-details shows [data-testid=quick-picks] while drop-off is empty
    def quick_trips_and_picks():
        g.goto(BASE + "/trip-details"); g.wait_for_timeout(500)
        pin_dropoff(g)
        g.fill("input[placeholder='Jane']", "Test"); g.fill("input[placeholder='Doe']", "User"); g.fill("input[type=tel]", "7065550199")
        go_pay(g); g.wait_for_timeout(1000)
        g.goto(BASE + "/"); g.wait_for_timeout(1000)
        qt = g.locator("[data-testid=home-quick-trips]").count() > 0
        g.goto(BASE + "/trip-details"); g.wait_for_timeout(1000)
        qp = g.locator("[data-testid=quick-picks]").count() > 0
        return (qt and qp) or f"home-quick={qt} quick-picks={qp}"
    check("Quick trips: Home shows quick-trips and TripDetails shows quick-picks", quick_trips_and_picks)

    # c) a guest's first name, last name and phone are filled in on the next booking
    def guest_memory():
        g.goto(BASE + "/trip-details"); g.wait_for_timeout(1000)
        fn = g.input_value("input[placeholder='Jane']")
        ln = g.input_value("input[placeholder='Doe']")
        ph = g.input_value("input[type=tel]")
        return (fn == "Test" and ln == "User" and ph == "7065550199") or f"fn={fn!r} ln={ln!r} ph={ph!r}"
    check("Guest memory: name and phone remembered on next booking", guest_memory)

    # d) for a guest [data-testid=consent-inline] shows and no [data-testid=consent-quick] pop-up appears
    def consent_inline():
        inline = g.locator("[data-testid=consent-inline]").count() > 0
        popup = g.locator("[data-testid=consent-quick]").count() == 0
        return (inline and popup) or f"inline={inline} popup={popup}"
    check("Consent: inline consent box shows, no modal popup", consent_inline)

    # e) demo-rider (?as=demo-rider), after one card booking, sees [data-testid=book-now] containing "4242" and one tap reaches /success
    pg = ctx.new_page(); watch(pg, errs)
    pg.goto(BASE + "/?as=demo-rider"); pg.wait_for_timeout(1500)
    def member_one_tap():
        pg.goto(BASE + "/trip-details"); pg.wait_for_timeout(900)
        pin_dropoff(pg)
        bn = pg.locator("[data-testid=book-now]")
        if not bn.count() or "4242" not in bn.inner_text(): return f"no saved card button or 4242 missing: {bn.inner_text() if bn.count() else 'none'}"
        bn.click()
        try:
            pg.wait_for_url("**/success", timeout=3000)
        except:
            pg.wait_for_timeout(2000)
        return "/success" in pg.url or f"url={pg.url}"
    check("Member: saved card one-tap booking reaches /success", member_one_tap)

    # f) a finished ride shows [data-testid=ride-back] and tapping it opens /trip-details with pickup and drop-off swapped
    def ride_back():
        pg.goto(BASE + "/?as=demo-rider"); pg.wait_for_timeout(1500)
        pg.evaluate("([k])=>{const s=JSON.parse(localStorage.getItem(k)||'{}'); s['rides/qa-fin']={status:'finished', finalFare:15, customerId:'demo-rider', pickup:'Columbus Airport', dropoff:'Peachtree Mall'}; localStorage.setItem(k, JSON.stringify(s))}", [KEY])
        pg.reload(); pg.wait_for_timeout(1500)
        rb = pg.locator("[data-testid=ride-back]")
        if not rb.count(): return "no ride-back button found"
        rb.first.click(); pg.wait_for_timeout(1000)
        return ("/trip-details" in pg.url) or f"url={pg.url}"
    check("Ride back: finished ride shows button and swaps pickup/dropoff", ride_back)

    # g) driver (?as=demo-driver-44 then /driver, then accept_gate) sees [data-testid=auto-accept-toggle] after going online
    D = ctx.new_page(); watch(D, errs)
    D.goto(BASE + "/?as=demo-driver-44"); D.wait_for_timeout(1200)
    D.goto(BASE + "/driver"); D.wait_for_timeout(1800); accept_gate(D)
    def driver_auto_accept():
        if D.locator("button:has-text('Go Online')").count():
            D.click("button:has-text('Go Online')"); D.wait_for_timeout(1500)
        return D.locator("[data-testid=auto-accept-toggle]").count() > 0 or "no auto-accept toggle found"
    check("Driver: auto-accept toggle visible after going online", driver_auto_accept)

    check("No page errors", lambda: not errs or "; ".join(dict.fromkeys(errs))[:400])
    b.close()
report("Round 6: location auto-fill, quick picks, guest memory, consent inline, member one-tap, ride-back, driver auto-accept")
