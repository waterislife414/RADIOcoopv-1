import sys, time; sys.path.insert(0,"/tmp/qa")
from common import *
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b,ctx=launch(p)
    pg=ctx.new_page(); errs=[]; watch(pg,errs)
    pg.goto(BASE+"/?as=guest"); pg.wait_for_timeout(1300)
    # --- Menu + larger text
    def menu():
        pg.click("button[aria-label='Open menu']"); pg.wait_for_timeout(300)
        assert pg.locator("button:has-text('Larger text')").is_visible()
        pg.click("button:has-text('Larger text')"); pg.wait_for_timeout(200)
        big=pg.evaluate("document.documentElement.classList.contains('text-large')")
        pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
        pg.reload(); pg.wait_for_timeout(1000)
        kept=pg.evaluate("document.documentElement.classList.contains('text-large')")
        pg.click("button[aria-label='Open menu']"); pg.click("button:has-text('Larger text')"); pg.keyboard.press("Escape")
        return (big and kept) or f"big={big} kept={kept}"
    check("Menu opens; Larger text turns on and stays after reload", menu)
    def menu_closes():
        pg.click("button[aria-label='Open menu']"); pg.wait_for_timeout(300)
        pg.click("button[aria-label='Close menu']"); pg.wait_for_timeout(300)
        return not pg.locator("button:has-text('Larger text')").is_visible() or "still open"
    check("Menu closes with X", menu_closes)
    # --- Help accordion
    def help_page():
        pg.goto(BASE+"/help"); pg.wait_for_timeout(800)
        pg.locator("summary:has-text('How do I cancel')").click(); pg.wait_for_timeout(200)
        return pg.locator("text=Cancel this ride").first.is_visible()
    check("Help: question opens and shows its answer", help_page)
    # --- Booking validation and toggles
    def empty_booking():
        pg.goto(BASE+"/trip-details"); pg.wait_for_timeout(900)
        pg.click("button:has-text('Continue to Payment')"); pg.wait_for_timeout(400)
        return ("/trip-details" in pg.url and pg.locator("[data-testid=legal-scroll]").count()==0) or "went on without details"
    check("Booking: empty form doesn't continue", empty_booking)
    def toggles():
        out=[]
        pg.click("[aria-label='Trip outside the local area']"); pg.wait_for_timeout(200); out.append(pg.locator("#area-select").count()==1)
        pg.click("[aria-label='Trip outside the local area']"); pg.wait_for_timeout(200)
        n0=pg.locator("input").count(); pg.click("[aria-label='Add stops']"); pg.wait_for_timeout(200); out.append(pg.locator("input").count()>n0)
        pg.click("[aria-label='Add stops']")
        for t in ["Round trip","Handicap-accessible vehicle","VIP Fast Pass"]:
            pg.click(f"[aria-label='{t}']"); pg.wait_for_timeout(150)
            out.append(pg.locator(f"[aria-label='{t}']").get_attribute("aria-checked")=="true")
            pg.click(f"[aria-label='{t}']")
        return all(out) or str(out)
    check("Booking: every switch turns on (area list, stops, round trip, accessible, Fast Pass)", toggles)
    def passengers():
        pg.select_option("#passengers-select", "3"); return pg.locator("#passengers-select").input_value()=="3"
    check("Booking: passenger count can be changed", passengers)
    # --- Guest books with cash, consent every time
    def guest_book():
        pg.goto(BASE+"/trip-details"); pg.wait_for_timeout(800)
        pg.fill("input[placeholder='Jane']","Guest"); pg.fill("input[placeholder='Doe']","Tester")
        pg.fill("#pickup","900 Broadway, Columbus GA"); pg.fill("#dropoff","Peachtree Mall"); pg.fill("input[type=tel]","7065550100")
        pg.click("button:has-text('Continue to Payment')"); pg.wait_for_timeout(400)
        locked=pg.locator("[data-testid=consent-boxes] input[disabled]").count()
        agree_modal(pg,"Agree & Continue"); pg.wait_for_timeout(700)
        assert "/payment" in pg.url, pg.url
        pg.click("button:has-text('Cash')"); pg.wait_for_timeout(2000)
        return ("/success" in pg.url and locked==3) or f"url={pg.url} locked={locked}"
    check("Guest: book with cash (agreement pops up, boxes locked until scrolled)", guest_book)
    check("Guest: success page shows the booking and call-to-cancel", lambda: (len(pg.locator("#root").inner_text())>100 and pg.locator("text=Need to change or cancel? Call").count()==1) or "blank or missing")
    # --- Sign up
    email=f"qa{int(time.time())}@example.com"
    def signup():
        pg.goto(BASE+"/sign-up"); pg.wait_for_timeout(800)
        pg.fill("input[placeholder='First Name']","Quinn"); pg.fill("input[placeholder='Last Name']","Tester")
        pg.fill("input[placeholder='Home Address']","100 Main St, Columbus GA"); pg.fill("input[placeholder='Phone']","7065550199")
        pg.fill("input[placeholder='Email']",email); pg.fill("input[placeholder='Password']","secret123")
        pg.fill("#dob","1980-05-05")
        pg.click("form button[type=submit]"); pg.wait_for_timeout(500)
        agree_modal(pg,"Agree & Create Account"); pg.wait_for_timeout(2000)
        return ("/welcome" in pg.url or "/subscribe" in pg.url) or pg.url
    check("Sign up: form, agreement pop-up, account created", signup)
    def logout():
        pg.click("button[aria-label='Open menu']"); pg.wait_for_timeout(300)
        pg.click("button:has-text('Log Out'), button:has-text('Sign Out')"); pg.wait_for_timeout(1000)
        return True
    check("Log out from the menu", logout)
    def signin_wrong():
        pg.goto(BASE+"/sign-in"); pg.wait_for_timeout(700)
        pg.fill("input[placeholder='Email']",email); pg.fill("input[placeholder='Password']","wrongpass")
        pg.click("form button[type=submit]"); pg.wait_for_timeout(900)
        return pg.locator("text=Invalid email or password").count()==1
    check("Sign in: wrong password shows an error", signin_wrong)
    def forgot():
        pg.fill("input[placeholder='Email']",""); pg.click("button:has-text('Forgot')"); pg.wait_for_timeout(400)
        a=pg.locator("text=Enter your email above first").count()==1
        pg.fill("input[placeholder='Email']",email); pg.click("button:has-text('Forgot')"); pg.wait_for_timeout(900)
        return a or "no prompt for empty email"
    check("Sign in: Forgot password asks for email first", forgot)
    def signin_ok():
        pg.fill("input[placeholder='Password']","secret123"); pg.click("form button[type=submit]"); pg.wait_for_timeout(1500)
        pg.goto(BASE+"/profile"); pg.wait_for_timeout(1200)
        return pg.locator("text=Your Referral Code").count()==1 or "no referral code on profile"
    check("Sign in works; profile loads with referral code", signin_ok)
    def schedule():
        pg.goto(BASE+"/trip-details"); pg.wait_for_timeout(900)
        pg.locator("button", has_text="Schedule Later").first.click(); pg.wait_for_timeout(200)
        ok=pg.locator("input[type=datetime-local]").count()==1
        pg.locator("button", has_text="Ride Now").first.click(); pg.wait_for_timeout(200)
        return ok or "no date/time box"
    check("Signed-in booking: Schedule Later shows the date/time box", schedule)
    # --- Rider books by card, then cancels
    def card_book():
        pg.goto(BASE+"/trip-details"); pg.wait_for_timeout(900)
        if pg.locator("input[placeholder='Jane']").input_value()=="": pg.fill("input[placeholder='Jane']","Quinn")
        if pg.locator("input[placeholder='Doe']").input_value()=="": pg.fill("input[placeholder='Doe']","Tester")
        pg.fill("#pickup","1795 Cusseta Rd, Columbus GA"); pg.fill("#dropoff","Columbus Airport")
        if pg.locator("input[type=tel]").input_value()=="": pg.fill("input[type=tel]","7065550199")
        pg.click("button:has-text('Continue to Payment')"); pg.wait_for_timeout(500)
        if pg.locator("[data-testid=legal-scroll]").count(): agree_modal(pg,"Agree & Continue"); pg.wait_for_timeout(600)
        assert "/payment" in pg.url, "not on payment: "+pg.url
        pg.locator("text=Card").first.click(); pg.wait_for_timeout(500)
        pg.fill("input[placeholder='Cardholder Name']","Quinn Tester"); pg.click("button:has-text('Authorize Card')"); pg.wait_for_timeout(2500)
        return "/success" in pg.url or pg.url
    check("Rider: book by card (card form, hold, success page)", card_book)
    def cancel():
        pg.wait_for_selector("button:has-text('Cancel this ride')", timeout=6000)
        pg.click("button:has-text('Cancel this ride')"); pg.wait_for_timeout(300)
        pg.click("button:has-text('Yes, cancel')"); pg.wait_for_timeout(2000)
        return pg.locator("button:has-text('Cancel this ride')").count()==0 or "still showing"
    check("Rider: Cancel this ride pop-up confirms and cancels", cancel)
    # --- Membership checkout
    def membership():
        pg.goto(BASE+"/join"); pg.wait_for_timeout(900)
        pg.locator("button:has-text('Choose'), a:has-text('Choose')").first.click(); pg.wait_for_timeout(900)
        assert "/subscribe/" in pg.url, pg.url
        if pg.locator("input[placeholder='Cardholder Name']").count(): pg.fill("input[placeholder='Cardholder Name']","Quinn Tester")
        pg.click("form button[type=submit]"); pg.wait_for_timeout(2500)
        return "/subscribe/" not in pg.url or (pg.locator("text=/error|failed/i").count()==0 and "stayed on checkout")
    check("Membership: choose plan and start free trial", membership)
    def profile_plan():
        pg.goto(BASE+"/profile"); pg.wait_for_timeout(1200)
        return pg.locator("text=/Basic|Premium/").count()>0 or "plan not shown"
    check("Profile shows the new plan", profile_plan)
    check("Rider side: no errors anywhere", lambda: not errs or "; ".join(dict.fromkeys(errs)))
    b.close()
report("Rider and guest")
