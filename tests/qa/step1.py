"""Build step 1 click-through: dispatcher pegboard, rider booking, driver ask-dispatch/approval, car actions.
Run: QA_BASE=http://127.0.0.1:8790 python3 tests/qa/step1.py   (demo build served on that port)"""
import sys, os, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *
from playwright.sync_api import sync_playwright

def bar_open(pg):
    if not pg.locator("[data-testid=demo-location]").count():
        pg.locator("button:has-text('DEMO')").first.click(); pg.wait_for_timeout(300)
def bar_close(pg):
    if pg.locator("[data-testid=demo-location]").count():
        pg.click("button[aria-label='Close']"); pg.wait_for_timeout(200)
def set_loc(pg, idx=0):
    bar_open(pg)
    sel = pg.locator("select").first
    val = sel.locator("option").nth(idx).get_attribute("value")
    sel.select_option(val); pg.wait_for_timeout(500)
    label = sel.locator("option").nth(idx).inner_text()
    return val, label
def board(pg, uid): return db(pg).get("board/"+uid, {})

with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
    ctx = b.new_context(viewport={"width":1100,"height":860}, geolocation={"latitude":32.47,"longitude":-84.98}, permissions=["geolocation","notifications","camera"])
    A = ctx.new_page(); aerrs = []; watch(A, aerrs)
    D = ctx.new_page(); derrs = []; watch(D, derrs)
    R = ctx.new_page(); rerrs = []; watch(R, rerrs)
    A.goto(BASE+"/?as=demo-admin"); A.wait_for_timeout(1200)
    A.goto(BASE+"/admin/dashboard"); A.wait_for_timeout(2000)

    # 1. Dispatcher layout
    def c1():
        for t in ["pegboard", "pegboard-map", "status-key", "new-call"]:
            assert A.locator(f"[data-testid={t}]").first.is_visible(), "missing "+t
        peg = A.locator("[data-testid=pegboard]").inner_text()
        for w in ["Working", "Off / out"]: assert w in peg, "no pane "+w
        key = A.locator("[data-testid=status-key]").inner_text()
        for w in ["Ready", "On a call", "Moving", "Out"]: assert w in key, "key lacks "+w
        A.click("[data-testid=new-call]"); A.wait_for_timeout(600)
        assert A.locator("[data-testid=call-drawer]").is_visible(), "no drawer"
        assert A.locator("[data-testid=call-drawer] input[placeholder=\"Caller's number\"]").count()==1, "no Quick Entry form (caller's number) in drawer"
        A.keyboard.press("Escape"); A.wait_for_timeout(300)
        if A.locator("[data-testid=call-drawer]").count():
            A.mouse.click(10, 400); A.wait_for_timeout(300)
        return True
    check("1 Dispatcher: pegboard, map, panes, status key, + New call drawer with Quick Entry", c1)

    # 2. Rider books by card, appears in Working
    def c2():
        R.goto(BASE+"/?as=demo-rider"); R.wait_for_timeout(1200)
        R.goto(BASE+"/trip-details"); R.wait_for_timeout(900)
        if R.locator("input[placeholder='Jane']").count() and R.locator("input[placeholder='Jane']").input_value()=="": R.fill("input[placeholder='Jane']","Quinn")
        if R.locator("input[placeholder='Doe']").count() and R.locator("input[placeholder='Doe']").input_value()=="": R.fill("input[placeholder='Doe']","Tester")
        R.fill("#pickup","1795 Cusseta Rd, Columbus GA"); R.fill("#dropoff","QA Step1 Dropoff")
        if R.locator("input[type=tel]").count() and R.locator("input[type=tel]").input_value()=="": R.fill("input[type=tel]","7065550199")
        R.click("button:has-text('Continue to Payment')"); R.wait_for_timeout(500)
        if R.locator("[data-testid=legal-scroll]").count(): agree_modal(R, "Agree & Continue"); R.wait_for_timeout(600)
        assert "/payment" in R.url, "not on payment: "+R.url
        R.locator("text=Card").first.click(); R.wait_for_timeout(500)
        R.fill("input[placeholder='Cardholder Name']","Quinn Tester"); R.click("button:has-text('Authorize Card')"); R.wait_for_timeout(2500)
        assert "/success" in R.url, "no success: "+R.url
        for _ in range(12):
            if "QA Step1 Dropoff" in A.locator("[data-testid=pegboard]").inner_text(): return True
            A.wait_for_timeout(500)
        return "ride not in pegboard after 6s"
    check("2 Rider books card ride; shows in dispatcher Working list", c2)

    # 3. Driver 44
    D.goto(BASE+"/?as=demo-driver-44"); D.wait_for_timeout(1200); D.goto(BASE+"/driver"); D.wait_for_timeout(1500); accept_gate(D)
    zone = {}
    def c3():
        v, l = set_loc(D, 0); zone.update(id=v, label=l); bar_close(D)
        D.click("button:has-text('Go Online')"); D.wait_for_timeout(500)
        D.click("button:has-text(\"No, it's the same\")"); D.wait_for_timeout(2500)
        assert board(D,"demo-driver-44").get("status") in ("moving","ready"), board(D,"demo-driver-44").get("status")
        if board(D,"demo-driver-44").get("status") == "moving":
            btn = D.locator("button:has-text('Check Ready in')")
            btn.wait_for(timeout=5000); btn.click(); D.wait_for_timeout(2000)
        assert board(D,"demo-driver-44").get("status") == "ready", "Check Ready failed: "+str(board(D,"demo-driver-44").get("status"))
        bar_open(D)
        loc = D.locator("[data-testid=demo-location]").inner_text()
        assert loc == f"Demo location: {zone['label']}", loc
        assert D.locator("text=Demo clock").count() >= 1, "no Demo clock section"
        D.click("button:has-text('Jump to 2 PM')"); D.wait_for_timeout(1500)
        assert D.locator("[data-testid=demo-popup]").is_visible(), "no demo popup"
        D.click("[data-testid=demo-popup] button"); D.wait_for_timeout(200); bar_close(D)
        return True
    check("3 Driver 44: demo location, Go Online, Check Ready, DemoBar location + 2 PM popup", c3)

    # 4. Report problem + ask dispatch
    def c4a():
        D.click("[data-testid=report-problem]"); D.wait_for_timeout(400)
        dlg = D.locator("[data-testid=ask-dispatch]"); assert dlg.is_visible(), "no dialog"
        dlg.locator("select").first.select_option("other")
        dlg.locator("textarea").fill("QA test: map shows wrong street"); dlg.locator("button:has-text('Send report')").click(); D.wait_for_timeout(1500)
        assert "Thanks, we've got it" in dlg.inner_text(), dlg.inner_text()[:80]
        dlg.locator("button:has-text('OK')").click(); D.wait_for_timeout(300); return True
    check("4a Driver: Report a problem with note -> Thanks, we've got it", c4a)
    def ask(note=""):
        D.click("[data-testid=report-problem]"); D.wait_for_timeout(400)
        dlg = D.locator("[data-testid=ask-dispatch]")
        dlg.locator("select").first.select_option("check_ready"); D.wait_for_timeout(200)
        cb = dlg.locator("input[type=checkbox]")
        if not cb.is_checked(): cb.check()
        dlg.locator("select[aria-label='Zone I am in']").select_option(zone["id"])
        if note: dlg.locator("textarea").fill(note)
        dlg.locator("button:has-text('Ask dispatch')").click(); D.wait_for_timeout(1500)
        return dlg
    def c4b():
        dlg = ask("QA: phone not placing me")
        assert "Sent to dispatch" in dlg.inner_text(), dlg.inner_text()[:80]
        dlg.locator("button:has-text('OK')").click(); D.wait_for_timeout(300)
        pop = A.locator("[data-testid=approval-popup]")
        try: pop.wait_for(timeout=15000)
        except Exception: raise AssertionError("no approval-popup on dispatcher; approval docs="+str([(k,v.get("status")) for k,v in db(A).items() if "pproval" in k or "support" in k or "ticket" in k][:4]))
        assert "Car 44 needs your permission" in pop.inner_text(), pop.inner_text()[:80]
        A.click("[data-testid=approve]"); A.wait_for_timeout(1500)
        try: D.locator("[data-testid=approval-answer]").wait_for(timeout=15000)
        except Exception:
            doc=[v for k,v in db(D).items() if k.startswith('approval_requests')][0]
            D.reload(); D.wait_for_timeout(2500)
            after=D.locator("[data-testid=approval-answer]").count()
            raise AssertionError("driver never showed approval-answer (shows after reload: %s) uid=%s decidedAtMs=%s now=%s status=%s" % (after, doc.get("uid"), doc.get("decidedAtMs"), int(time.time()*1000), doc.get("status")))
        D.locator("[data-testid=approval-answer] button").first.click(); D.wait_for_timeout(500)
        pegtxt = A.locator("[data-testid=pegboard]").inner_text()
        st = board(A,"demo-driver-44")
        assert st.get("status") == "ready" and st.get("zoneId") == zone["id"], f"board={st.get('status')},{st.get('zoneId')}"
        return True
    check("4b Ask-dispatch Check Ready -> approval popup -> approve -> driver answer, car 44 in zone", c4b)

    # 5. Deny requires reason
    def c5():
        dlg = ask("QA: second ask")
        dlg.locator("button:has-text('OK')").click(); D.wait_for_timeout(300)
        pop = A.locator("[data-testid=approval-popup]"); pop.wait_for(timeout=15000)
        A.click("[data-testid=deny]"); A.wait_for_timeout(300)
        send = A.locator("button:has-text('Send')").filter(has_text="No")
        assert send.is_disabled(), "Deny can be sent without a reason"
        A.fill("input[aria-label=Reason]", "Out of zone"); A.wait_for_timeout(200)
        assert send.is_enabled(), "Send No still disabled with reason"
        send.click(); A.wait_for_timeout(1500)
        D.locator("[data-testid=approval-answer]").wait_for(timeout=15000)
        D.locator("[data-testid=approval-answer] button").first.click(); D.wait_for_timeout(300)
        return A.locator("[data-testid=approval-popup]").count()==0 or "popup still open"
    check("5 Deny needs a reason, then reaches driver", c5)

    # 6. Dispatcher car actions
    def chip44(): return A.locator("[data-testid=car-chip-44]").first
    def c6():
        global stage
        stage='a'
        # (a) Ready car
        chip44().click(); A.wait_for_timeout(500)
        assert A.locator("text=Car 44").count(), "no CarActionsModal"
        A.locator("button:text-is('Off')").click(); A.wait_for_timeout(1500)
        assert board(A,"demo-driver-44").get("status") in ("offline", None), "ready car not taken off: "+str(board(A,"demo-driver-44").get("status"))
        stage='b'
        # (b) on-call/offered car: put 44 back on, then offer a ride
        D.reload(); D.wait_for_timeout(1500); accept_gate(D)
        D.click("button:has-text('Go Online')"); D.wait_for_timeout(500)
        if D.locator("button:has-text(\"No, it's the same\")").count(): D.click("button:has-text(\"No, it's the same\")")
        D.wait_for_timeout(2500)
        if board(D,"demo-driver-44").get("status")=="moving":
            D.locator("button:has-text('Check Ready in')").click(); D.wait_for_timeout(1500)
        A.reload(); A.wait_for_timeout(2000)
        stage='c'
        if board(A,"demo-driver-44").get("status") not in ("offered","on_call"):
          A.click("[data-testid=new-call]"); A.wait_for_timeout(800) # Increased timeout
          A.locator("[data-testid=call-drawer] input").first.fill("1795 Cusseta Rd, Columbus GA")
          A.locator("[data-testid=call-drawer] input").nth(1).fill("QA Step1 Six")
          A.locator("[data-testid=call-drawer] button:has-text('Save'), [data-testid=call-drawer] button:has-text('Create'), [data-testid=call-drawer] button:has-text('Book')").first.click(); A.wait_for_timeout(1500) # Increased timeout
          for _ in range(12):
              if "QA Step1 Six" in A.locator("[data-testid=pegboard]").inner_text(): break
              A.wait_for_timeout(500)
          card = A.locator("[data-testid=pegboard] div", has_text="QA Step1 Six").locator("button:has-text('Pick a car'), button:has-text('Accept & assign')").last
          card.click(); A.wait_for_timeout(1000) # Increased timeout
          A.locator("button", has_text="Car 44").first.click(); A.wait_for_timeout(1000) # Increased timeout
          if A.locator("button:has-text('Send anyway')").count(): A.click("button:has-text('Send anyway')")
          A.wait_for_timeout(2500) # Increased timeout
        s = board(A,"demo-driver-44").get("status")
        assert s in ("offered","on_call"), "could not put 44 on a call: "+str(s)
        stage='d'
        A.wait_for_timeout(1000) # Added to allow UI to settle after ride assignment.
        chip44().click(); A.wait_for_timeout(500)
        A.locator("button:text-is('Off')").click(); A.wait_for_timeout(1500)
        s2 = board(A,"demo-driver-44").get("status")
        return s2 in ("offline", None) or f"{s} car not taken off: {s2}"
    stage=''
    check("6 Dispatcher chip -> CarActionsModal takes ready and on-call/offered car off", c6)

    # 7. Console / network errors
    def c7():
        e = [x for x in dict.fromkeys(aerrs + derrs)]
        return not e or "; ".join(e)[:300]
    check("7 No console errors / failed requests (dispatcher + driver)", c7)
    b.close()

print('stage6', stage)
for ok, n, why in results: print(("PASS" if ok else "FAIL"), n, ("-> "+why) if why else "")
report("Step 1")
sys.exit(1 if any(not r[0] for r in results) else 0)
