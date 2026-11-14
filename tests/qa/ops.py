import sys, time; sys.path.insert(0,"/tmp/qa")
from common import *
from playwright.sync_api import sync_playwright
IMG="/tmp/demo/car.jpg"
def ride_doc(pg, pickup):
    return next(((k,v) for k,v in db(pg).items() if k.startswith("rides/") and v.get("pickup","").startswith(pickup)), (None,{}))
with sync_playwright() as p:
    b,ctx=launch(p)
    # ---------- Office login screen
    lg=ctx.new_page(); lerrs=[]; watch(lg,lerrs)
    lg.goto(BASE+"/?as=guest"); lg.wait_for_timeout(1000); lg.goto(BASE+"/admin/login"); lg.wait_for_timeout(800)
    def admin_wrong():
        lg.fill("input[placeholder='Email']","dispatch@example.com"); lg.fill("input[placeholder='Password']","nope1234")
        lg.click("form button[type=submit]"); lg.wait_for_timeout(1000)
        return "/admin/login" in lg.url and lg.locator(".text-red-600, .text-red-700, .bg-red-50").count()>0 or "no error shown"
    check("Office login: wrong password shows an error", admin_wrong)
    def admin_ok():
        lg.fill("input[placeholder='Password']","demo1234"); lg.click("form button[type=submit]"); lg.wait_for_timeout(1800)
        return "/admin/dashboard" in lg.url or lg.url
    check("Office login: right password opens the dispatch desk", admin_ok)
    lg.close()
    # ---------- Driver 44 goes online
    D=ctx.new_page(); derrs=[]; watch(D,derrs)
    D.goto(BASE+"/?as=demo-driver-44"); D.wait_for_timeout(1200); D.goto(BASE+"/driver"); D.wait_for_timeout(1500); accept_gate(D)
    def online():
        D.click("button:has-text('Go Online')"); D.wait_for_timeout(500)
        assert D.locator("[aria-label='Start-of-shift check']").count()==1, "no shift check"
        D.click("button:has-text(\"No, it's the same\")"); D.wait_for_timeout(2500)
        return db(D).get("board/demo-driver-44",{}).get("status") in ("moving","ready") or db(D).get("board/demo-driver-44",{}).get("status")
    check("Driver: Go Online -> shift-check pop-up -> on the board", online)
    # ---------- Dispatcher posts a phone ride and sends car 44
    A=ctx.new_page(); aerrs=[]; watch(A,aerrs)
    A.goto(BASE+"/?as=demo-admin"); A.wait_for_timeout(1200); A.goto(BASE+"/admin/dashboard"); A.wait_for_timeout(1800)
    def post_ride():
        A.fill("input[placeholder=\"Caller's number\"]","7065550123"); A.wait_for_timeout(300)
        A.fill("input[placeholder='First name']","Phone"); A.fill("input[placeholder='Last name']","Caller")
        A.fill("input[placeholder='Pickup address or place']","QA Civic Center, Columbus"); A.fill("input[placeholder='Drop-off (optional)']","Peachtree Mall")
        A.click("button:has-text('Post ride')"); A.wait_for_timeout(2500)
        k,v=ride_doc(A,"QA Civic Center"); return bool(k) or "ride not saved"
    check("Dispatcher: post a phone ride (quick entry)", post_ride)
    def send_car():
        for _ in range(20):
            k,v=ride_doc(A,"QA Civic Center")
            if v.get("status")!="pending" or v.get("dispatchState")=="offering": break
            if A.locator("button:has-text('DISPATCH')").count(): break
            A.wait_for_timeout(500)
        k,v=ride_doc(A,"QA Civic Center")
        if v.get("driverId")=="demo-driver-44": return True
        if D.locator("button:has-text('Accept')").count():
            D.click("button:has-text('Accept')"); D.wait_for_timeout(1500); return True
        if v.get("status")=="pending":
            card=A.locator("div", has_text="QA Civic Center").locator("button:has-text('DISPATCH')").last
            card.click(); A.wait_for_timeout(600)
            A.locator("button", has_text="Car 44").first.click(); A.wait_for_timeout(600)
            if A.locator("button:has-text('Send anyway')").count(): A.click("button:has-text('Send anyway')")
            A.wait_for_timeout(2000)
        k,v=ride_doc(A,"QA Civic Center")
        return v.get("driverId")=="demo-driver-44" or f"status={v.get('status')} driver={v.get('driverId')} state={v.get('dispatchState')}"
    check("Dispatcher: DISPATCH -> pick Car 44 (car picker pop-up)", send_car)
    def driver_gets_call():
        D.wait_for_timeout(1500)
        return D.locator("button:has-text('Picked up')").count()==1 or "no call card on the driver's phone"
    check("Driver: the call shows up with Picked up", driver_gets_call)
    def pickup_drop():
        D.click("button:has-text('Picked up')"); D.wait_for_timeout(1500)
        D.click("button:has-text('Drop Off')"); D.wait_for_timeout(2500)
        k,v=ride_doc(D,"QA Civic Center")
        return v.get("status")=="finished" or v.get("status")
    check("Driver: Picked up -> Drop Off finishes the ride", pickup_drop)
    def settle():
        A.wait_for_timeout(1500)
        btn=A.locator("button", has_text="Mark Settled").first
        if not btn.count(): btn=A.locator("button", has_text="Remove from Active").first
        btn.click(); A.wait_for_timeout(800)
        if A.locator("button:has-text('Close out'), button:has-text('Confirm'), button:has-text('Yes')").count():
            A.locator("button:has-text('Close out'), button:has-text('Confirm'), button:has-text('Yes')").first.click(); A.wait_for_timeout(1000)
        k,v=ride_doc(A,"QA Civic Center")
        return v.get("status") in ("completed","settled","closed") or v.get("settled") or f"status={v.get('status')}"
    check("Dispatcher: Mark Settled closes the ride", settle)
    # ---------- SOS and alert
    def sos():
        D.click("button[aria-label='Emergency: call 911']"); D.wait_for_timeout(300)
        D.click("button:has-text('Alert the office only')"); D.wait_for_timeout(2000)
        D.click("button:has-text('Close')")
        A.wait_for_timeout(1500)
        ok=A.locator("[role=alert]").count()>0
        A.locator("[role=alert] button:has-text('Handled')").first.click(); A.wait_for_timeout(1200)
        return ok or "no alert on desk"
    check("SOS pop-up -> red alert on the desk -> Handled", sos)
    # ---------- Damage and problem reports
    def damage():
        D.goto(BASE+"/driver/inspection?type=damage"); D.wait_for_timeout(1200)
        D.locator("select").first.select_option("Hood"); D.fill("input[placeholder^='Dent']","Small dent")
        D.locator("input[type=file][accept='image/*']").first.set_input_files(IMG); D.wait_for_timeout(300)
        D.click("button:has-text('Next')"); D.wait_for_timeout(300)
        D.fill("input[autocomplete=name]","Jordan Example"); D.click("button:has-text('Sign & Send')"); D.wait_for_timeout(2500)
        return D.locator("text=Damage report saved").count()==1 or D.locator("h1").inner_text()
    check("Driver: Report damage (photo, sign) saves and goes to the shop", damage)
    def problem():
        D.goto(BASE+"/driver/inspection?type=repair"); D.wait_for_timeout(1200)
        D.locator("select").first.select_option("Rattle or clunk"); D.fill("textarea","Rattle in dash")
        D.click("button:has-text('Next')"); D.wait_for_timeout(300)
        D.fill("input[autocomplete=name]","Jordan Example"); D.click("button:has-text('Sign & Send')"); D.wait_for_timeout(2500)
        return D.locator("text=Problem report saved").count()==1 or D.locator("h1").inner_text()
    check("Driver: Report a problem saves to the shop", problem)
    def profile_save():
        D.goto(BASE+"/driver/profile"); D.wait_for_timeout(1500)
        D.fill("input[placeholder='Emergency contact']","Sam Example"); D.fill("input[placeholder='Their phone']","7065550144")
        D.click("button:has-text('Save')"); D.wait_for_timeout(1500)
        return D.locator("text=Saved.").count()>0 or "no Saved message"
    check("Driver profile: edit and Save", profile_save)
    # ---------- Office tools
    def apps():
        A.goto(BASE+"/admin/dashboard"); A.wait_for_timeout(1500)
        if not A.locator("button:has-text('Approve')").count(): return "no application to approve (none seeded)"
        A.locator("input[placeholder='Car #']").first.fill("88"); A.locator("button:has-text('Approve')").first.click(); A.wait_for_timeout(2000)
        return True
    check("Dispatcher: approve a driver application", apps)
    def settings():
        A.click("button:has-text('Login Settings')"); A.wait_for_timeout(500)
        ok=A.locator("text=Dispatcher Login Settings").count()==1
        A.click("button:has-text('Close')"); A.wait_for_timeout(300)
        return ok
    check("Dispatcher: Login Settings pop-up opens and closes", settings)
    def incident():
        A.goto(BASE+"/admin/drivers"); A.wait_for_timeout(1500)
        opener=A.locator("button", has_text="Add to record").first
        if not opener.count(): opener=A.locator("button", has_text="Incident").first
        opener.click(); A.wait_for_timeout(400)
        A.locator("textarea, input[placeholder*='note' i], input[placeholder*='what' i]").first.fill("QA test note")
        A.locator("button:has-text('Add to record')").last.click(); A.wait_for_timeout(1500)
        return True
    check("Drivers page: add something to a driver's record", incident)
    def lease():
        A.goto(BASE+"/admin/lease"); A.wait_for_timeout(1500)
        A.locator("button:has-text('History')").first.click(); A.wait_for_timeout(500)
        return A.locator("text=/Lease|Envelope/").count()>0
    check("Lease desk loads and History opens", lease)
    # ---------- Mechanic
    M=ctx.new_page(); merrs=[]; watch(M,merrs)
    M.goto(BASE+"/?as=demo-mechanic"); M.wait_for_timeout(1200); M.goto(BASE+"/shop"); M.wait_for_timeout(1500)
    def shop():
        n=M.locator("text=Reported by").count()
        M.locator("button:has-text('Scheduled')").first.click(); M.wait_for_timeout(1000)
        M.locator("input[placeholder^='Shop notes']").first.fill("Pads Tuesday"); M.locator("button:has-text('Save')").first.click(); M.wait_for_timeout(1000)
        M.click("button:has-text('+ Add a repair')"); M.fill("input[placeholder='Car #']","44"); M.fill("textarea","QA added repair"); M.click("button:text-is('Add')"); M.wait_for_timeout(1500)
        return M.locator("text=Reported by").count()==n+1 or f"{n} -> {M.locator('text=Reported by').count()}"
    check("Shop Board: change status, save notes, add a repair", shop)
    check("Driver screens: no errors", lambda: not derrs or "; ".join(dict.fromkeys(derrs)))
    check("Office screens: no errors", lambda: not aerrs or "; ".join(dict.fromkeys(aerrs)))
    check("Shop screens: no errors", lambda: not merrs or "; ".join(dict.fromkeys(merrs)))
    b.close()
report("Driver, dispatcher and mechanic")
