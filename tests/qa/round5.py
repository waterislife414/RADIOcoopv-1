# Round 5 click-through: changing the trip during the ride, waiting at a stop, and Continue with Google.
# The address search (Photon) is answered by a stand-in so the test doesn't need the internet.
# Run: QA_BASE=http://127.0.0.1:8790 python3 tests/qa/round5.py  (demo build served on that port)
import json
from common import *
from playwright.sync_api import sync_playwright

PHOTON = {"features": [{"geometry": {"coordinates": [-84.9551, 32.5097]}, "properties": {"name": "Columbus Airport", "housenumber": "3250", "street": "W Britt David Rd", "city": "Columbus", "state": "Georgia"}}]}

def put(pg, path, data):
    pg.evaluate("([k,p,d])=>{const s=JSON.parse(localStorage.getItem(k)||'{}');s[p]=Object.assign(s[p]||{},d);localStorage.setItem(k,JSON.stringify(s))}", [KEY, path, data])
def pin_dropoff(pg):
    pg.click("#dropoff"); pg.wait_for_timeout(300)
    pg.locator("button:has-text('drop a pin'), button:has-text('Drop a pin')").first.click(); pg.wait_for_timeout(900)
    pg.click("[data-testid=pin-use]"); pg.wait_for_timeout(600)
BEFORE = set()
def mine(pg): return [(k, v) for k, v in db(pg).items() if k.startswith("rides/") and k not in BEFORE and v.get("customerId") == "demo-rider"]

with sync_playwright() as p:
    b, ctx = launch(p)
    ctx.route("https://photon.komoot.io/**", lambda r: r.fulfill(status=200, content_type="application/json", body=json.dumps(PHOTON)))
    errs = []

    # A. Continue with Google: new account in two taps + phone, then a returning sign-in.
    g = ctx.new_page(); watch(g, errs)
    g.goto(BASE + "/"); g.wait_for_timeout(1000)
    def google_new():
        g.goto(BASE + "/sign-up"); g.wait_for_timeout(1000)
        g.click("[data-testid=google-signin]"); g.wait_for_timeout(1500)
        assert "/finish-account" in g.url, g.url
        first = g.input_value("input[aria-label='First name']")
        g.fill("[data-testid=finish-phone]", "(706) 555-0177"); g.click("[data-testid=finish-account]"); g.wait_for_timeout(600)
        # Assuming agree_modal is designed to work with the updated inline consent now
        agree_modal(g, "Agree & Finish"); g.wait_for_timeout(1500)
        users = [v for k, v in db(g).items() if k.startswith("users/") and v.get("signInWith") == "google"]
        ok = users and users[0].get("phone") == "7065550177" and users[0].get("firstName") == "Gabby" and users[0].get("legal")
        return (ok and first == "Gabby") or f"url={g.url} first={first!r} users={users[:1]}"
    check("Google: Continue with Google -> name filled in, add phone, one box -> account made", google_new)
    def google_again():
        g.evaluate("sessionStorage.clear()"); g.goto(BASE + "/sign-in"); g.wait_for_timeout(1000)
        g.click("[data-testid=google-signin]"); g.wait_for_timeout(1500)
        return ("/finish-account" not in g.url and "/sign-in" not in g.url) or g.url
    check("Google: signing in again goes straight in (no second setup)", google_again)
    g.close()

    # B. Rider changes the drop-off during the ride; driver gets it; Price Lock ends.
    pg = ctx.new_page(); watch(pg, errs)
    pg.goto(BASE + "/?as=demo-rider"); pg.wait_for_timeout(1500)
    def book_card():
        BEFORE.update(k for k in db(pg) if k.startswith("rides/"))
        pg.goto(BASE + "/trip-details"); pg.wait_for_timeout(900)
        use_location(pg); pin_dropoff(pg)
        # Handle one-tap booking for members with saved cards
        if pg.locator("[data-testid=book-now]").count():
            pg.click("[data-testid=book-now]"); pg.wait_for_timeout(2500)
        else:
            pg.click("button:has-text('Continue to Payment')"); pg.wait_for_timeout(500)
            if pg.locator("text=You already have a ride").count(): pg.click("button:has-text('Continue to Payment')"); pg.wait_for_timeout(500)
            if pg.locator("[data-testid=legal-scroll]").count(): agree_modal(pg, "Agree & Continue"); pg.wait_for_timeout(1200)
            pg.locator("text=Card").first.click(); pg.wait_for_timeout(500)
            pg.fill("input[placeholder='Cardholder Name']", "Riley Example"); pg.click("button:has-text('Authorize Card')"); pg.wait_for_timeout(2500)
        assert "/success" in pg.url, pg.url
        pg.goto(BASE + "/"); pg.wait_for_timeout(1500)
        for _ in range(120):
            if pg.locator("[data-testid=change-dropoff]").count(): return True
            pg.wait_for_timeout(1000)
        return "no 'Change where you're going' once a driver had the ride"
    check("Rider: card ride booked; 'Change where you're going' shows once a driver has it", book_card)
    def change_dropoff():
        pg.click("[data-testid=change-dropoff]"); pg.wait_for_timeout(300)
        pg.fill("#new-dropoff", "3250 W Britt David Rd"); pg.wait_for_timeout(1500)
        pg.locator("[data-testid=new-dropoff-option]").first.click(); pg.wait_for_timeout(300)
        note = pg.inner_text("[data-testid=change-dropoff-box]")
        pg.click("[data-testid=change-dropoff-send]"); pg.wait_for_timeout(2000)
        k, v = mine(pg)[0]
        inbox = db(pg).get(f"driverInbox/{v.get('driverId')}", {}).get("current", {})
        bad = []
        if "Britt David" not in (v.get("dropoff") or ""): bad.append(f"ride dropoff={v.get('dropoff')}")
        if not v.get("routeChangedAt"): bad.append("no routeChangedAt")
        if "Britt David" not in (inbox.get("dropoff") or "") or not inbox.get("routeChangedAt"): bad.append(f"driver screen not updated: {inbox.get('dropoff')}")
        if "Price Lock turns off" not in note: bad.append("rider not told Price Lock ends")
        if pg.locator("[data-testid=rider-route-changed]").count() == 0: bad.append("no 'New drop-off sent' line")
        return not bad or "; ".join(bad)
    check("Rider: picks a new drop-off -> ride + driver's screen updated, Price Lock ends", change_dropoff)
    def lock_off_at_charge():
        for _ in range(150):
            if pg.locator("button:has-text('at the car')").count():
                pg.click("button:has-text('at the car')"); pg.wait_for_timeout(1000)
            k, v = mine(pg)[0]
            if v.get("finalFare") is not None: break
            pg.wait_for_timeout(1000)
        k, v = mine(pg)[0]
        return (v.get("finalFare") is not None and not v.get("lockOffCents") and v.get("estFareCents") is None) or \
            f"final={v.get('finalFare')} lockOff={v.get('lockOffCents')} est={v.get('estFareCents')}"
    check("Charge after a change: meter charged, no Price Lock, kept out of price learning", lock_off_at_charge)

    # C. Driver waits at a stop: one tap out, rider sees the rules, one tap back; meter over estimate needs the rider.
    D = ctx.new_page(); watch(D, errs)
    D.goto(BASE + "/?as=demo-driver-44"); D.wait_for_timeout(1200)
    now = int(D.evaluate("Date.now()"))
    put(D, "rides/qa-stop-44", {"status": "in_transit", "pickup": "QA Stop", "dropoff": "Peachtree Mall", "customerId": "demo-rider", "driverId": "demo-driver-44",
                                 "paymentMethod": "card", "paymentIntentId": "pi_demo_stop", "estMiles": 3, "passengers": 1, "createdMs": now - 600000, "timestamp": now, "appHandled": True})
    put(D, "board/demo-driver-44", {"status": "on_call", "rideId": "qa-stop-44"})
    put(D, "driverInbox/demo-driver-44", {"current": {"rideId": "qa-stop-44", "status": "in_transit", "cardHold": True, "estMiles": 3, "passengers": 1,
                                                       "pickup": "QA Stop", "dropoff": "Peachtree Mall", "assignedAt": now - 300000, "paymentMethod": "card"}})
    D.goto(BASE + "/driver"); D.wait_for_timeout(1800); accept_gate(D)
    def stop_wait():
        D.bring_to_front()
        D.click("[data-testid=stop-start]"); D.wait_for_timeout(1500)
        t = D.inner_text("[data-testid=stop-wait]")
        v = db(D).get("rides/qa-stop-44", {})
        pg.bring_to_front(); pg.goto(BASE + "/"); pg.wait_for_timeout(2000)
        rider = pg.inner_text("[data-testid=rider-stop-wait]") if pg.locator("[data-testid=rider-stop-wait]").count() else ""
        D.bring_to_front(); D.click("[data-testid=stop-back]"); D.wait_for_timeout(1500)
        v2 = db(D).get("rides/qa-stop-44", {})
        bad = []
        if "meter keeps running" not in t: bad.append(f"driver panel: {t[:80]!r}")
        if not (v.get("stopWait") or {}).get("startedAt") or v.get("stopCount") != 1: bad.append(f"ride stopWait={v.get('stopWait')} count={v.get('stopCount')}")
        if "Your driver is waiting" not in rider or "15" not in rider and "may end" not in rider: bad.append(f"rider notice: {rider[:120]!r}")
        if v2.get("stopWait") or not (v2.get("stopWaitMs") or 0) > 0: bad.append(f"after back: stopWait={v2.get('stopWait')} ms={v2.get('stopWaitMs')}")
        return not bad or "; ".join(bad)
    check("Stop: driver taps 'Rider stepped out' -> rider sees meter runs + 15-minute rule -> 'Rider's back'", stop_wait)
    def over_estimate():
        D.click("button:has-text('Drop Off & Charge Card')"); D.wait_for_timeout(500)
        D.fill("[data-testid=meter-input]", "60"); D.click("[data-testid=meter-charge-btn]"); D.wait_for_timeout(1800)
        if not D.locator("[data-testid=rider-pay]").count(): return "meter after a stop was refused: " + D.inner_text("[data-testid=meter-charge]")[:120]
        D.click("[data-testid=pay-no-tip]"); D.wait_for_timeout(2500)
        v = db(D).get("rides/qa-stop-44", {})
        return (v.get("finalFare") == 60 and v.get("riderApproved") and not v.get("lockOffCents")) or f"final={v.get('finalFare')} approved={v.get('riderApproved')} lock={v.get('lockOffCents')}"
    check("After a stop: $60 meter on a 3-mile trip goes to the rider's screen (no estimate limit), no Price Lock", over_estimate)

    check("No page errors", lambda: not errs or "; ".join(dict.fromkeys(errs))[:400])
    b.close()
report("Round 5: change the trip mid-ride, stops, Continue with Google")
