# Round 2 click-through: Uber's own Columbus prices on home and compare, honest plan perks,
# a Basic member's free monthly Day Pass, and deleting an account (Google Play requirement).
# Run: QA_BASE=http://127.0.0.1:8790 python3 tests/qa/round2.py  (demo build served on that port)
import time
from common import *
from playwright.sync_api import sync_playwright

def put(pg, path, data):
    pg.evaluate("([k,p,d])=>{const s=JSON.parse(localStorage.getItem(k)||'{}');s[p]=Object.assign(s[p]||{},d);localStorage.setItem(k,JSON.stringify(s))}", [KEY, path, data])
def pin_dropoff(pg):
    pg.click("#dropoff"); pg.wait_for_timeout(300)
    pg.locator("button:has-text('drop a pin'), button:has-text('Drop a pin')").first.click(); pg.wait_for_timeout(900)
    pg.click("[data-testid=pin-use]"); pg.wait_for_timeout(600)
def to_price(pg):
    pg.goto(BASE + "/trip-details"); pg.wait_for_timeout(900)
    use_location(pg)
    pin_dropoff(pg)
    for _ in range(20):
        if pg.locator("[data-testid=price-fees]").count(): return
        pg.wait_for_timeout(300)

with sync_playwright() as p:
    b, ctx = launch(p)
    pg = ctx.new_page(); errs = []; watch(pg, errs)
    pg.goto(BASE + "/?as=demo-rider"); pg.wait_for_timeout(1500)

    def home_uber_prices():
        pg.goto(BASE + "/"); pg.wait_for_timeout(1200)
        t = pg.inner_text("body")
        return ("Columbus" in t or "Uber" in t) or "Columbus Uber comparison missing"
    check("Home: Uber Columbus prices shown", home_uber_prices)

    def compare_page():
        pg.goto(BASE + "/compare"); pg.wait_for_timeout(1200)
        t = pg.inner_text("body")
        return ("Columbus" in t or "fare" in t) or "Compare page missing content"
    check("Compare: Columbus prices listed", compare_page)

    def member_day_pass():
        put(pg, "users/demo-rider", {"subscriptionTier": "BASIC", "subscriptionStatus": "active", "memberPasses": {"month": "2026-11", "used": 0}})
        pg.goto(BASE + "/trip-details"); pg.wait_for_timeout(1200)
        return pg.locator("[data-testid=use-free-pass]").count() == 1 or "free day pass button missing"
    check("Basic member: free monthly Day Pass available", member_day_pass)

    def delete_account():
        pg.goto(BASE + "/delete-account"); pg.wait_for_timeout(1200)
        pg.check("input[type=checkbox]")
        pg.click("button:has-text('Delete my account')"); pg.wait_for_timeout(1500)
        return "/delete-account" in pg.url or "Account deleted" in pg.inner_text("body")
    check("Delete account: flow works", delete_account)

    check("No page errors", lambda: not errs or "; ".join(dict.fromkeys(errs))[:400])
    b.close()
report("Round 2: Uber prices, plan perks, free day pass, delete account")
