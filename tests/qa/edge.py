import sys, time; sys.path.insert(0,"/tmp/qa")
from common import *
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b,ctx=launch(p)
    pg=ctx.new_page(); errs=[]; watch(pg,errs)
    pg.goto(BASE+"/?as=guest"); pg.wait_for_timeout(1200)
    def odd_typing():
        pg.goto(BASE+"/trip-details"); pg.wait_for_timeout(900)
        pg.fill("input[placeholder='Jane']","Mary-Jo"); pg.fill("input[placeholder='Doe']","O'Brien 😀")
        pg.fill("#pickup",'Apt #5 & "B", 900 Broadway; Columbus GA <test>'); pg.fill("#dropoff","Peachtree Mall – Food Court")
        pg.fill("input[type=tel]","(706) 555-0100")
        pg.click("button:has-text('Continue to Payment')"); pg.wait_for_timeout(500)
        agree_modal(pg,"Agree & Continue"); pg.wait_for_timeout(700)
        pg.click("button:has-text('Cash')"); pg.wait_for_timeout(2200)
        r=[v for k,v in db(pg).items() if k.startswith("rides/") and "Apt #5" in v.get("pickup","")]
        return ("/success" in pg.url and r and r[0].get("lastName")=="O'Brien 😀") or f"url={pg.url} saved={bool(r)}"
    check("Typing: apostrophes, symbols, emoji and a formatted phone number book fine", odd_typing)
    def short_phone():
        pg.goto(BASE+"/trip-details"); pg.wait_for_timeout(800)
        pg.fill("input[placeholder='Jane']","A"); pg.fill("input[placeholder='Doe']","B"); pg.fill("#pickup","900 Broadway"); pg.fill("#dropoff","Mall")
        pg.fill("input[type=tel]","555")
        pg.click("button:has-text('Continue to Payment')"); pg.wait_for_timeout(500)
        return (pg.locator("[data-testid=legal-scroll]").count()==0 and "/trip-details" in pg.url) or "a 3-digit phone number was accepted"
    check("Typing: a too-short phone number is stopped", short_phone)
    email=f"edge{int(time.time())}@example.com"
    def signup_then_book_no_repeat():
        pg.goto(BASE+"/sign-up"); pg.wait_for_timeout(800)
        pg.fill("input[placeholder='First Name']","Edge"); pg.fill("input[placeholder='Last Name']","Case")
        pg.fill("input[placeholder='Home Address']","1 Main St"); pg.fill("input[placeholder='Phone']","706.555.0102")
        pg.fill("input[placeholder='Email']",email); pg.fill("input[placeholder='Password']","secret123"); pg.fill("#dob","1970-01-01")
        pg.click("form button[type=submit]"); pg.wait_for_timeout(500); agree_modal(pg,"Agree & Create Account"); pg.wait_for_timeout(2000)
        pg.goto(BASE+"/trip-details"); pg.wait_for_timeout(1000)
        if pg.locator("#pickup").input_value()=="": pg.fill("#pickup","900 Broadway, Columbus")
        pg.fill("#dropoff","Peachtree Mall")
        if pg.locator("input[type=tel]").input_value()=="": pg.fill("input[type=tel]","7065550102")
        pg.click("button:has-text('Continue to Payment')"); pg.wait_for_timeout(700)
        return pg.locator("[data-testid=legal-scroll]").count()==1 or f"no agreement pop-up on the next booking: {pg.url}"
    check("Agreement pop-up comes back on every booking, even for members", signup_then_book_no_repeat)
    def recent_chips():
        if pg.locator("[data-testid=legal-scroll]").count(): pg.keyboard.press("Escape")
        pg.goto(BASE+"/trip-details"); pg.wait_for_timeout(900)
        return pg.locator("text=Recent places").count()>0 or "no recent places after booking"
    check("Recent places show up after a booking", recent_chips)
    def mileage_letters():
        d=ctx.new_page(); d.goto(BASE+"/?as=demo-driver-12"); d.wait_for_timeout(1000)
        d.goto(BASE+"/driver/inspection?type=repair"); d.wait_for_timeout(900)
        d.locator("select").first.select_option("Other"); d.fill("textarea","x"*700)
        d.click("button:has-text('Next')"); d.wait_for_timeout(300)
        d.fill("input[autocomplete=name]","Sam Example"); d.click("button:has-text('Sign & Send')"); d.wait_for_timeout(2500)
        ok=d.locator("text=Problem report saved").count()==1
        d.close(); return ok or "very long description failed"
    check("Typing: a very long description still sends", mileage_letters)
    check("No errors", lambda: not errs or "; ".join(dict.fromkeys(errs)))
    b.close()
report("Typing edge cases and pop-up timing")
