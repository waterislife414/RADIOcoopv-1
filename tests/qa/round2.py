# Round 2 click-through: Uber's own Columbus prices on home and compare, honest plan perks,
# a Basic member's free monthly Day Pass, and deleting an account (Google Play requirement).
# Run: QA_BASE=http://127.0.0.1:8790 python3 tests/qa/round2.py  (demo build served on that port)
import time
from common import *
from playwright.sync_api import sync_playwright

def put(pg, path, data):
    pg.evaluate("([k,p,d])=>{const s=JSON.parse(localStorage.getItem(k)||'{}');s[p]=Object.assign(s[p]||{},d);localStorage.setItem(k,JSON.stringify(s))}", [KEY, path, data])

with sync_playwright() as p:
    b, ctx = launch(p)
    pg = ctx.new_page(); errs = []; watch(pg, errs)

    def home_local_price():
        pg.goto(BASE + "/"); pg.wait_for_timeout(1200)
        t = pg.inner_text("[data-testid=compare-card]")
        return ("Uber (Columbus average)" in t and "$11.73" in t and "$18.00" in t and "uber.com" in t) or t[:200]
    check("Home: Uber's own Columbus average vs our meter (5 mi: $11.73 vs $18.00)", home_local_price)

    def compare_local():
        pg.goto(BASE + "/compare"); pg.wait_for_timeout(900)
        rows = pg.locator("[data-testid=compare-local] tbody tr").count()
        t = pg.inner_text("[data-testid=compare-local]")
        foot = pg.inner_text("[data-testid=compare-local-footnote]")
        ok = rows == 3 and "Call for a quote" in t and "$17.67" in t and "Uber" in foot and "not fixed or guaranteed" in foot
        return ok or f"rows={rows} table={t[:160]!r}"
    check("Compare: three real Columbus trips, out-of-town says call, footnote cites Uber", compare_local)

    def plans_honest():
        pg.goto(BASE + "/join"); pg.wait_for_timeout(900)
        body = pg.inner_text("body")
        ok = "free entry" not in body.lower() and "1 free Priority Day Pass a month" in body and "Front of the line on every ride" in body
        bad = [w for w in ["on my way out", "text your driver"] if w in body.lower()]
        return (ok and not bad) or f"free entry shown={'free entry' in body.lower()} bad={bad}"
    check("Plans: only perks the app gives (no free-entry, no unbuilt buttons)", plans_honest)

    def member_free_pass():
        pg.goto(BASE + "/?as=demo-rider"); pg.wait_for_timeout(1500)
        put(pg, "users/demo-rider", {"subscriptionTier": "BASIC", "subscriptionStatus": "active", "dayPass": None, "memberPasses": None})
        pg.goto(BASE + "/trip-details"); pg.wait_for_timeout(1500)
        btn = pg.locator("[data-testid=use-free-pass]")
        if not btn.count():
            return "no free pass button for a Basic member"
        label = btn.inner_text()
        btn.click(); pg.wait_for_timeout(1500)
        d = db(pg)
        u = d.get("users/demo-rider", {})
        passes = [k for k, v in d.items() if k.startswith("fast_passes/member_demo-rider")]
        on = "On until midnight" in pg.inner_text("body")
        ok = "1 left" in label and u.get("memberPasses", {}).get("used") == 1 and passes and on
        return ok or f"label={label!r} used={u.get('memberPasses')} passes={passes} on={on}"
    check("Basic member: 'Use free pass (1 left)' turns the Day Pass on and counts it", member_free_pass)

    def no_second_free_pass():
        put(pg, "users/demo-rider", {"dayPass": None})
        pg.goto(BASE + "/trip-details"); pg.wait_for_timeout(1200)
        return pg.locator("[data-testid=use-free-pass]").count() == 0 or "free pass offered twice in one month"
    check("Basic member: no second free pass the same month", no_second_free_pass)

    def delete_account():
        pg.click("button[aria-label='Open menu']"); pg.wait_for_timeout(300)
        pg.click("button:has-text('Log Out'), button:has-text('Sign Out')"); pg.wait_for_timeout(1000)
        email = f"del{int(time.time())}@example.com"
        pg.goto(BASE + "/sign-up"); pg.wait_for_timeout(800)
        pg.fill("input[placeholder='First Name']", "Dee"); pg.fill("input[placeholder='Last Name']", "Leet")
        pg.fill("input[placeholder='Home Address']", "100 Main St, Columbus GA"); pg.fill("input[placeholder='Phone']", "7065550177")
        pg.fill("input[placeholder='Email']", email); pg.fill("input[placeholder='Password']", "secret123")
        pg.fill("#dob", "1980-05-05")
        pg.click("form button[type=submit]"); pg.wait_for_timeout(500)
        agree_modal(pg, "Agree & Create Account"); pg.wait_for_timeout(2000)
        uid = [k.split("/")[1] for k, v in db(pg).items() if k.startswith("users/") and v.get("email") == email]
        assert uid, "account not created"
        pg.goto(BASE + "/profile"); pg.wait_for_timeout(1000)
        pg.click("[data-testid=delete-account-link]"); pg.wait_for_timeout(800)
        pg.click("[data-testid=delete-start]"); pg.click("[data-testid=delete-confirm]"); pg.wait_for_timeout(2000)
        gone = f"users/{uid[0]}" not in db(pg)
        done = pg.locator("[data-testid=delete-done]").count() == 1
        return (gone and done) or f"gone={gone} done={done} body={pg.inner_text('body')[:200]!r}"
    check("Delete account: profile link -> confirm -> profile and sign-in removed", delete_account)

    def delete_page_public():
        pg.goto(BASE + "/delete-account"); pg.wait_for_timeout(800)
        return (pg.locator("text=Sign in to delete your account").count() == 1 and pg.locator("[data-testid=delete-explainer]").count() == 1) or "public page missing"
    check("Delete account web page works without signing in (Play web link)", delete_page_public)

    real = [e for e in errs if "photon.komoot" not in e]
    check("No page errors", lambda: not real or str(real[:3]))
    b.close()
report("Round 2")
