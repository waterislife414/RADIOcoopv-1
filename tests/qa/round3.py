# Round 3 click-through (updated for the Nov 23 decisions): card rides are paid from the driver's phone.
# The driver types the meter; the rider approves on the driver's phone with a tip (or the driver charges
# with no tip if the rider left). No card fee; the $3 welcome credit and Price Lock come off; the driver is
# credited the meter less the card company's cut; a meter far above the estimate is refused.
# Run: QA_BASE=http://127.0.0.1:8790 python3 tests/qa/round3.py  (demo build served on that port)
from common import *
from playwright.sync_api import sync_playwright

def put(pg, path, data):
    pg.evaluate("([k,p,d])=>{const s=JSON.parse(localStorage.getItem(k)||'{}');s[p]=Object.assign(s[p]||{},d);localStorage.setItem(k,JSON.stringify(s))}", [KEY, path, data])
BEFORE = set()
def rides(pg, _label=None):
    # The ride this run booked: the rider's ride that wasn't there before booking.
    return [(k, v) for k, v in db(pg).items() if k.startswith("rides/") and k not in BEFORE and v.get("customerId") == "demo-rider"]
def pin_dropoff(pg):
    pg.click("#dropoff"); pg.wait_for_timeout(300)
    pg.locator("button:has-text('drop a pin'), button:has-text('Drop a pin')").first.click(); pg.wait_for_timeout(900)
    pg.click("[data-testid=pin-use]"); pg.wait_for_timeout(600)
def card_cost(cents): return round(cents * 0.029) + 30

with sync_playwright() as p:
    b, ctx = launch(p)
    pg = ctx.new_page(); errs = []; watch(pg, errs)
    pg.goto(BASE + "/?as=demo-rider"); pg.wait_for_timeout(1500)

    # A. Booking shows the new card-fee rule before paying.
    def fee_rule_shown():
        BEFORE.update(k for k in db(pg) if k.startswith("rides/"))
        pg.goto(BASE + "/trip-details"); pg.wait_for_timeout(900)
        pg.click("text=Use my location"); pg.wait_for_timeout(1200)
        pin_dropoff(pg)
        for _ in range(20):
            if pg.locator("[data-testid=price-fees]").count(): break
            pg.wait_for_timeout(300)
        t = pg.inner_text("[data-testid=price-fees]")
        assert "Same price cash or card" in t, t
        pg.click("button:has-text('Continue to Payment')"); pg.wait_for_timeout(500)
        if pg.locator("text=You already have a ride").count(): pg.click("button:has-text('Continue to Payment')"); pg.wait_for_timeout(500)
        agree_modal(pg, "Agree & Continue"); pg.wait_for_timeout(1500)
        rule = pg.inner_text("[data-testid=card-fee-rule]")
        return ("No card fee" in rule) or rule
    check("Booking: price card and payment screen say no card fee, same price as cash", fee_rule_shown)

    # B. Card ride: the driver enters the meter; the rider does nothing.
    def driver_charges():
        pg.locator("text=Card").first.click(); pg.wait_for_timeout(500)
        pg.fill("input[placeholder='Cardholder Name']", "Riley Example"); pg.click("button:has-text('Authorize Card')"); pg.wait_for_timeout(2500)
        assert "/success" in pg.url, pg.url
        pg.goto(BASE + "/"); pg.wait_for_timeout(1500)
        notice = False
        for _ in range(150):
            t = pg.inner_text("body")
            if "at the car" in t and pg.locator("button:has-text('at the car')").count():
                pg.click("button:has-text('at the car')"); pg.wait_for_timeout(1500)
            if pg.locator("[data-testid=card-payment]").count() and "Tap Pay there" in pg.inner_text("[data-testid=card-payment]"):
                notice = True
            k, v = rides(pg, "QA 7 Meter Card")[0]
            if v.get("finalFare") is not None: break
            pg.wait_for_timeout(1000)
        k, v = rides(pg, "QA 7 Meter Card")[0]
        assert notice, "rider never saw Tap Pay there (pay on the driver phone)"
        assert v.get("finalFare") is not None, f"never charged: status={v.get('status')}"
        meter = round(v["finalFare"] * 100)
        bad = []
        if v.get("meterEnteredBy") != "driver": bad.append(f"meterEnteredBy={v.get('meterEnteredBy')}")
        if v.get("settledBy") != "driver": bad.append(f"settledBy={v.get('settledBy')}")
        if v.get("cardFeeCents") != 0: bad.append(f"card fee={v.get('cardFeeCents')} (should be none)")
        if v.get("creditUsedCents") != 300: bad.append(f"welcome credit used={v.get('creditUsedCents')} want 300")
        if v.get("capturedAmountCents") != meter - 300: bad.append(f"charged={v.get('capturedAmountCents')} want {meter - 300}")
        if v.get("driverCardCostCents") != card_cost(meter): bad.append(f"driver card cost={v.get('driverCardCostCents')} want {card_cost(meter)}")
        if not v.get("estFareCents"): bad.append("no estFareCents saved for price learning")
        if v.get("stripeStatus") != "succeeded": bad.append(f"stripe={v.get('stripeStatus')}")
        return not bad or "; ".join(bad)
    check("Card ride: driver enters the meter, saved card charged, no card fee, $3 welcome credit off", driver_charges)

    # C. Receipt and one tip.
    def receipt_tip():
        for _ in range(10):
            if pg.locator("[data-testid=receipt]").count(): break
            pg.wait_for_timeout(500)
        r = pg.inner_text("[data-testid=receipt]")
        assert "Ride credit" in r and "Total" in r and "Card fee" not in r, r[:200]
        assert pg.locator("[data-testid=tip-chooser]").count() == 1, "no tip buttons"
        k, v = rides(pg, "QA 7 Meter Card")[0]
        meter = round(v["finalFare"] * 100)
        pg.locator("[data-testid=tip-chooser] button", has_text="15%").click()
        for _ in range(16):
            pg.wait_for_timeout(500)
            k, v = rides(pg, "QA 7 Meter Card")[0]
            if v.get("tipChargedCents"): break
        shown = pg.inner_text("[data-testid=receipt]")
        want = max(100, round(meter * 15 / 100))
        bad = []
        if v.get("tipChargedCents") != want: bad.append(f"tip={v.get('tipChargedCents')} want {want}")
        if pg.locator("[data-testid=tip-chooser]").count(): bad.append("tip buttons still showing")
        led = [kk for kk in db(pg) if kk.startswith("ledger/") and kk.endswith(f"tip_{k.split('/')[1]}")]
        if not led: bad.append("tip not credited to the driver's ledger")
        return not bad or "; ".join(bad) + " | screen: " + shown.replace("\n", " ")[:300]
    check("Receipt: meter, ride credit, total; 15% tip charged once and credited to the driver", receipt_tip)

    # D. Driver screen: Drop Off asks for the meter; a crazy number is refused, a real one charges.
    D = ctx.new_page(); derrs = []; watch(D, derrs)
    D.goto(BASE + "/?as=demo-driver-44"); D.wait_for_timeout(1200)
    now = int(D.evaluate("Date.now()"))
    put(D, "rides/qa-meter-44", {"status": "in_transit", "pickup": "QA 8 Driver Meter", "dropoff": "Peachtree Mall", "customerId": "demo-rider",
                                  "driverId": "demo-driver-44", "paymentMethod": "card", "paymentIntentId": "pi_demo_qa44", "estMiles": 3, "passengers": 1,
                                  "createdMs": now - 600000, "appHandled": True})
    put(D, "board/demo-driver-44", {"status": "on_call", "rideId": "qa-meter-44", "zoneId": db(D).get("board/demo-driver-44", {}).get("zoneId")})
    put(D, "driverInbox/demo-driver-44", {"current": {"rideId": "qa-meter-44", "status": "in_transit", "cardHold": True, "estMiles": 3, "passengers": 1,
                                                       "pickup": "QA 8 Driver Meter", "dropoff": "Peachtree Mall", "assignedAt": now - 300000, "paymentMethod": "card"}})
    D.goto(BASE + "/driver"); D.wait_for_timeout(1800); accept_gate(D)
    def meter_refused():
        D.bring_to_front()
        btn = D.locator("button:has-text('Drop Off & Charge Card')")
        for _ in range(10):
            if btn.count(): break
            D.wait_for_timeout(500)
        assert btn.count(), "no 'Drop Off & Charge Card' button"
        btn.first.click(); D.wait_for_timeout(500)
        assert D.locator("[data-testid=meter-charge]").count() == 1, "no meter box"
        D.fill("[data-testid=meter-input]", "900"); D.click("[data-testid=meter-charge-btn]"); D.wait_for_timeout(1500)
        t = D.inner_text("[data-testid=meter-charge]")
        v = db(D).get("rides/qa-meter-44", {})
        return ("more than this trip should cost" in t and "Drop off without charging" in t and v.get("finalFare") is None) or t[:200]
    check("Driver: a meter far over the estimate is refused, with a way to drop off anyway", meter_refused)
    def meter_charged():
        D.fill("[data-testid=meter-input]", "11.73"); D.click("[data-testid=meter-charge-btn]"); D.wait_for_timeout(1800)
        assert D.locator("[data-testid=rider-pay]").count() == 1, "rider's pay screen didn't open"
        total = D.inner_text("[data-testid=rider-pay-total]")
        assert "Price Lock" in D.inner_text("[data-testid=rider-pay]"), "no Price Lock line (meter is over the 3-mile cap)"
        D.locator("[data-testid=rider-pay] button", has_text="15%").click(); D.wait_for_timeout(2500)
        v = db(D).get("rides/qa-meter-44", {})
        bad = []
        if v.get("finalFare") != 11.73: bad.append(f"finalFare={v.get('finalFare')}")
        if v.get("cardFeeCents") != 0: bad.append(f"card fee={v.get('cardFeeCents')}")
        if not v.get("lockOffCents"): bad.append("no Price Lock discount")
        if v.get("tipAmount") != 1.76: bad.append(f"tip={v.get('tipAmount')} want 1.76 (15% of the meter)")
        if not v.get("riderApproved") or not v.get("tipAddedAt"): bad.append("not marked rider-approved")
        if v.get("capturedAmountCents") != 1173 - (v.get("lockOffCents") or 0) + 176: bad.append(f"charged={v.get('capturedAmountCents')}")
        if v.get("driverCardCostCents") != 64: bad.append(f"driver card cost={v.get('driverCardCostCents')} want 64")
        led = [kv for kk, kv in db(D).items() if kk.endswith("ride_qa-meter-44")]
        if not led or led[0].get("fareCents") != 1109 or led[0].get("tipCents") != 176: bad.append(f"lick credit {led[:1]} want fare 1109 tip 176")
        if D.locator("[data-testid=rider-pay]").count(): bad.append("pay screen still open")
        return not bad or "; ".join(bad) + f" | screen total {total}"
    check("Driver: meter $11.73 -> rider taps 15% on the driver's phone; Price Lock off; driver credited meter less 64c + full tip", meter_charged)

    def price_check():
        A = ctx.new_page(); aerr = []; watch(A, aerr)
        A.goto(BASE + "/?as=demo-admin"); A.wait_for_timeout(1000); A.goto(BASE + "/admin/lease"); A.wait_for_timeout(2500)
        t = A.inner_text("[data-testid=price-check]") if A.locator("[data-testid=price-check]").count() else ""
        A.close()
        return ("real meters vs. estimates" in t and "ride" in t and "estimated" in t) or f"price check: {t[:160]!r}"
    check("Office: price check compares typed meters with estimates (learns the road factor)", price_check)

    check("No page errors", lambda: not (errs + derrs) or "; ".join(dict.fromkeys(errs + derrs))[:400])
    b.close()
report("Round 3: driver-entered meter, rider pays on the driver phone, no card fee, receipt and tip")
