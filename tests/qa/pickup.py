import sys, time, json; sys.path.insert(0,"/tmp/qa")
from common import *
from playwright.sync_api import sync_playwright
def rides(pg, pickup): return [(k,v) for k,v in db(pg).items() if k.startswith("rides/") and v.get("pickup","").startswith(pickup)]
def put(pg, path, data):
    pg.evaluate("([k,p,d])=>{const s=JSON.parse(localStorage.getItem(k)||'{}');s[p]=Object.assign(s[p]||{},d);localStorage.setItem(k,JSON.stringify(s))}", [KEY,path,data])
def book(pg, pickup, share=True, pay="Card"):
    pg.goto(BASE+"/trip-details"); pg.wait_for_timeout(900)
    pg.fill("#pickup", pickup); pg.fill("#dropoff","Peachtree Mall")
    sw=pg.locator("[aria-label='Share my location with my driver']")
    if (sw.get_attribute("aria-checked")=="true") != share: sw.click()
    pg.click("button:has-text('Continue to Payment')"); pg.wait_for_timeout(500)
    if pg.locator("text=You already have a ride").count(): pg.click("button:has-text('Continue to Payment')"); pg.wait_for_timeout(500)
    agree_modal(pg,"Agree & Continue"); pg.wait_for_timeout(1500)
    if pay=="Card":
        pg.locator("text=Card").first.click(); pg.wait_for_timeout(500)
        pg.fill("input[placeholder='Cardholder Name']","Riley Example"); pg.click("button:has-text('Authorize Card')"); pg.wait_for_timeout(2500)
    else:
        pg.locator(f"button:has-text('{pay}')").first.click(); pg.wait_for_timeout(2000)
with sync_playwright() as p:
    b,ctx=launch(p)
    pg=ctx.new_page(); errs=[]; watch(pg,errs)
    pg.goto(BASE+"/?as=demo-rider"); pg.wait_for_timeout(1500)
    # A. App ride with a demo car: on the way -> 4-minute alert -> here -> I'm at the car -> riding
    def live_flow():
        book(pg, "QA 1 Broadway", pay="Card")
        assert "/success" in pg.url, pg.url
        k,v=rides(pg,"QA 1 Broadway")[0]
        assert v.get("consent",{}).get("version") and v.get("shareLocation") is True and v.get("callIn") is False, "booking fields"
        assert v.get("appHandled") is True, f"not app-handled: {v.get('officeWhy')}"
        seen=set()
        for _ in range(120):
            t=pg.inner_text("body")
            if "is on the way" in t: seen.add("way")
            if "minutes away" in t: seen.add("close")
            if "is here!" in t: seen.add("here"); break
            pg.wait_for_timeout(1000)
        assert "here" in seen, f"saw {seen}"
        assert pg.locator("[data-testid=wait-clock]").count()==1, "no wait clock"
        pg.click("button:has-text('at the car')"); pg.wait_for_timeout(5000)
        k,v=rides(pg,"QA 1 Broadway")[0]
        return ("close" in seen and v.get("status")=="in_transit" and v.get("headsUpAt") and v.get("arrivedAt")) or f"seen={seen} status={v.get('status')}"
    check("Rider: on the way, 4-minute alert, driver here, I'm at the car, riding", live_flow)
    # B. Terms every booking
    def terms_again():
        pg.goto(BASE+"/trip-details"); pg.wait_for_timeout(800)
        pg.fill("#pickup","QA 2 Broadway"); pg.fill("#dropoff","Mall")
        pg.click("button:has-text('Continue to Payment')"); pg.wait_for_timeout(500)
        if pg.locator("text=You already have a ride").count(): pg.click("button:has-text('Continue to Payment')"); pg.wait_for_timeout(500)
        return pg.locator("[data-testid=legal-scroll]").count()==1 or "no agreement pop-up on 2nd booking"
    check("Rider: agreement pop-up on every booking", terms_again)
    # C. Location off = call-in ride for the office
    def call_in():
        pg.goto(BASE+"/?as=demo-rider"); pg.wait_for_timeout(600)
        book(pg, "QA 3 CallIn", share=False)
        k,v=rides(pg,"QA 3 CallIn")[0]
        return (v.get("callIn") is True and v.get("dispatchState")=="office") or f"callIn={v.get('callIn')} state={v.get('dispatchState')}"
    check("Rider: location off -> call-in ride in the office queue", call_in)
    def office_lists():
        A=ctx.new_page(); aerr=[]; watch(A,aerr); A.goto(BASE+"/?as=demo-admin"); A.wait_for_timeout(1000); A.goto(BASE+"/admin/dashboard"); A.wait_for_timeout(2500)
        t=A.inner_text("body")
        assert "Send by radio" in t and "App rides" in t, "lists missing"
        sec=A.locator("section", has_text="Send by radio").first.inner_text()
        assert "QA 3 CallIn" in sec and "no GPS" in sec, "call-in ride not in the radio list with its reason"
        # Board: open a car, see the radio-call button
        A.locator("button[title^='Car ']").first.click(); A.wait_for_timeout(500)
        ok=A.locator("button:has-text('Gave him a radio call')").count()==1 or A.locator("text=On a radio call").count()>0 or A.locator("text=On an app call").count()>0
        A.close(); return (ok and not aerr) or f"radio-call button missing or errors {aerr[:2]}"
    check("Dispatcher: 'Send by radio' vs 'App rides' lists, reasons shown, radio-call button on cars", office_lists)
    # D. Waiting in line -> Day Pass offer -> pay -> moves up
    def line_offer():
        put(pg,"settings/dispatch",{"mode":"manual"})
        now=int(time.time()*1000)
        k,v=rides(pg,"QA 3 CallIn")[0]; zone=v.get("zoneId")
        for i in (1,2):
            put(pg,f"rides/qa-ahead-{i}",{"status":"pending","pickup":f"Ahead {i}","customerId":"guest","zoneId":zone,"createdMs":now-600000+i,"dispatchState":"office"})
        book(pg, "QA 4 Wait")
        pg.wait_for_timeout(1500)
        dlg=pg.locator("[role=dialog][aria-label='Priority Day Pass']")
        assert dlg.count()==1, "no Day Pass offer after booking"
        t=dlg.inner_text(); assert "in line" in t and "$5" in t, t[:80]
        dlg.locator("button:has-text('Skip ahead for $5')").click(); pg.wait_for_timeout(1200)
        assert "/fast-pass?ride=" in pg.url, pg.url
        pg.fill("input[placeholder='Cardholder Name']","Riley Example"); pg.click("button:has-text('skip ahead')"); pg.wait_for_timeout(3000)
        k,v=rides(pg,"QA 4 Wait")[0]
        return (v.get("priority")=="vip" and v.get("perks",{}).get("liveMap") and v.get("perks",{}).get("callDriver")) or f"priority={v.get('priority')} perks={v.get('perks')} url={pg.url}"
    check("Rider: 'You're 3rd in line' pop-up -> Day Pass -> moves up with map + calling", line_offer)
    def next_up():
        pg.goto(BASE+"/"); pg.wait_for_timeout(2500)
        t=" | ".join(pg.locator("[data-testid=line-status]").all_inner_texts())  # home can show up to 3 open rides
        return "next up" in t or f"line text: {t!r}"
    check("Rider: after the pass, 'You're next up!'", next_up)
    # E. Cancel with the right price
    def cancel_free():
        btn=pg.locator("button:has-text('Cancel this ride')")
        if not btn.count():
            pg.screenshot(path="/tmp/qa/cancel.png"); return "no cancel button: "+pg.inner_text("body")[:200].replace("\n"," | ")
        btn.first.click(); pg.wait_for_timeout(400)
        assert "No charge" in pg.inner_text("body")
        pg.click("button:has-text('Yes, cancel')"); pg.wait_for_timeout(2000)
        return len(rides(pg,"QA 4 Wait"))==0 or "ride not cancelled"
    check("Rider: cancel while waiting is free", cancel_free)
    check("No page errors", lambda: not errs or "; ".join(dict.fromkeys(errs))[:300])
    b.close()
report("Pickup flow, fees, line, Day Pass")
