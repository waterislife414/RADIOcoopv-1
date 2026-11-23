# Round 3 click-through: card rides are paid from the driver's phone.
# The driver types the meter at drop-off, the card saved at booking is charged with the lawful
# credit-card fee (up to 3%, never above cost; debit none), the rider gets a receipt and can tip once,
# and a meter far above the estimate is refused.
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
def credit_fee(cents): return min(cents * 3 // 100, round(cents * 0.029 + 30))

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
        assert "debit card: no fee" in t.lower() and "Credit card: up to" in t, t
        pg.click("button:has-text('Continue to Payment')"); pg.wait_for_timeout(500)
        if pg.locator("text=You already have a ride").count(): pg.click("button:has-text('Continue to Payment')"); pg.wait_for_timeout(500)
        agree_modal(pg, "Agree & Continue"); pg.wait_for_timeout(1500)
        rule = pg.inner_text("[data-testid=card-fee-rule]")
        return ("Credit cards: up to 3%" in rule and "Debit cards: no fee" in rule) or rule
    check("Booking: price card and payment screen say credit up to 3%, debit no fee", fee_rule_shown)

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
            if pg.locator("[data-testid=card-payment]").count() and "Your driver enters the meter" in pg.inner_text("[data-testid=card-payment]"):
                notice = True
            k, v = rides(pg, "QA 7 Meter Card")[0]
            if v.get("finalFare") is not None: break
            pg.wait_for_timeout(1000)
        k, v = rides(pg, "QA 7 Meter Card")[0]
        assert notice, "rider never saw 'Your driver enters the meter'"
        assert v.get("finalFare") is not None, f"never charged: status={v.get('status')}"
        meter = round(v["finalFare"] * 100)
        want = credit_fee(meter)
        bad = []
        if v.get("meterEnteredBy") != "driver": bad.append(f"meterEnteredBy={v.get('meterEnteredBy')}")
        if v.get("settledBy") != "driver": bad.append(f"settledBy={v.get('settledBy')}")
        if v.get("cardFunding") != "credit": bad.append(f"cardFunding={v.get('cardFunding')}")
        if v.get("cardFeeCents") != want: bad.append(f"fee={v.get('cardFeeCents')} want {want} on {meter}")
        if v.get("capturedAmountCents") != meter + want: bad.append(f"total={v.get('capturedAmountCents')}")
        if not v.get("estFareCents"): bad.append("no estFareCents saved for price learning")
        if v.get("stripeStatus") != "succeeded": bad.append(f"stripe={v.get('stripeStatus')}")
        return not bad or "; ".join(bad)
    check("Card ride: driver enters the meter at drop-off, saved card charged with 3% credit fee", driver_charges)

    # C. Receipt and one tip.
    def receipt_tip():
        for _ in range(10):
            if pg.locator("[data-testid=receipt]").count(): break
            pg.wait_for_timeout(500)
        r = pg.inner_text("[data-testid=receipt]")
        assert "Card fee (credit card)" in r and "Total" in r, r[:200]
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
    check("Receipt: meter, card fee, total; 15% tip charged once and credited to the driver", receipt_tip)

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
        D.fill("[data-testid=meter-input]", "11.73"); D.click("[data-testid=meter-charge-btn]"); D.wait_for_timeout(2500)
        v = db(D).get("rides/qa-meter-44", {})
        bad = []
        if v.get("finalFare") != 11.73: bad.append(f"finalFare={v.get('finalFare')}")
        if v.get("cardFeeCents") != 35: bad.append(f"fee={v.get('cardFeeCents')} want 35 (3% of $11.73)")
        if v.get("settledBy") != "driver": bad.append(f"settledBy={v.get('settledBy')}")
        if D.locator("[data-testid=meter-charge]").count(): bad.append("meter box still open")
        return not bad or "; ".join(bad)
    check("Driver: $11.73 on the meter charges $11.73 + $0.35 card fee and drops off", meter_charged)

    def price_check():
        A = ctx.new_page(); aerr = []; watch(A, aerr)
        A.goto(BASE + "/?as=demo-admin"); A.wait_for_timeout(1000); A.goto(BASE + "/admin/lease"); A.wait_for_timeout(2500)
        t = A.inner_text("[data-testid=price-check]") if A.locator("[data-testid=price-check]").count() else ""
        A.close()
        return ("real meters vs. estimates" in t and "ride" in t and "estimated" in t) or f"price check: {t[:160]!r}"
    check("Office: price check compares typed meters with estimates (learns the road factor)", price_check)

    check("No page errors", lambda: not (errs + derrs) or "; ".join(dict.fromkeys(errs + derrs))[:400])
    b.close()
report("Round 3: driver-entered meter, lawful card fee, receipt and tip")
