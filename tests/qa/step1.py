"""Step 1 click-through of the public site in DEMO mode (no keys). Run via tests/qa/run.sh.
Each check is independent; a failure prints ':: SCREEN ...' showing what the page really had."""
import re
from playwright.sync_api import expect
from common import BASE, check, new_page, run

DEMO_INVOICE = "/invoice/demo-estimate-kyles-auto-0001"


def body(browser):
    pg = new_page(browser)

    def home_loads():
        pg.goto(BASE + "/")
        expect(pg.locator("h1").first).to_contain_text("Honest Auto Repair")
        expect(pg.get_by_role("link", name=re.compile("Send a Mobile Mechanic")).first).to_be_visible()
        expect(pg.get_by_role("link", name=re.compile("Book a Shop Bay")).first).to_be_visible()
    check("home: hero + dual CTAs", home_loads)

    check("home: sticky mobile bar", lambda: expect(pg.get_by_text("Tap to Call")).to_be_visible())
    check("home: AutoRepair JSON-LD", lambda: re.search(r'"@type":"AutoRepair"', pg.content()) or (_ for _ in ()).throw(AssertionError("no AutoRepair JSON-LD")))

    def radius():
        pg.locator("#zip-check").fill("36869")
        expect(pg.get_by_text(re.compile("we come to you in", re.I))).to_be_visible()
        pg.locator("#zip-check").fill("36801")
        expect(pg.get_by_text(re.compile("past our mobile radius", re.I))).to_be_visible()
    check("home: ZIP radius checker in/out", radius)

    def services_toggle():
        pg.get_by_role("tab", name=re.compile("Shop Bay Only")).click()
        expect(pg.get_by_role("heading", name="Wheel Alignment")).to_be_visible()
    check("home: services toggle to shop", services_toggle)

    def offer_unlock():
        pg.goto(BASE + "/?offer=TRUCK25&utm_source=truck")
        expect(pg.get_by_text("Unlocked")).to_be_visible()
    check("home: ?offer=TRUCK25 unlocks promo", offer_unlock)

    bk = new_page(browser)

    def booking_flow():
        bk.goto(BASE + "/book?mode=mobile&service=alternator")
        expect(bk.locator("h1")).to_contain_text("How should we fix it")
        bk.locator("#b-zip").fill("36869")
        bk.locator("#b-street").fill("123 Test Ln")
        bk.get_by_role("button", name=re.compile("^Continue")).click()
        expect(bk.locator("h1")).to_contain_text("What are we working on")
        bk.locator("#b-year").select_option("2016")
        bk.locator("#b-make").fill("Ford")
        bk.locator("#b-model").fill("F-150")
        bk.locator("#b-miles").fill("128000")
        bk.get_by_role("button", name=re.compile("^Continue")).click()
        expect(bk.locator("h1")).to_contain_text("going on")
        bk.get_by_role("button", name=re.compile("^Continue")).click()
        expect(bk.locator("h1")).to_contain_text("Pick a time")
        expect(bk.get_by_text(re.compile("Eastern Time"))).to_be_visible()
        bk.locator("section button[aria-pressed]").nth(1).click()
        bk.get_by_role("button", name=re.compile(r"ET\s*Open|ET\s*Last spot")).first.click()
        bk.locator("#b-promo").fill("FIRSTMOBILE25")
        bk.get_by_role("button", name="Apply").click()
        expect(bk.get_by_text(re.compile("applied to your estimate"))).to_be_visible()
        bk.get_by_role("button", name=re.compile("^Continue")).click()
        expect(bk.locator("h1")).to_contain_text("Lock it in")
        bk.locator("#b-name").fill("QA Tester")
        bk.locator("#b-phone").fill("(334) 555-0100")
        bk.locator("#b-email").fill("qa@example.com")
        bk.get_by_role("button", name=re.compile("Confirm booking")).click()
        expect(bk.locator("h1")).to_contain_text("on the board", timeout=20000)
        expect(bk.get_by_text(re.compile(r"KA-[A-Z0-9]{7}"))).to_be_visible()
    if check("booking: mobile flow end to end", booking_flow):
        def ics():
            href = bk.get_by_role("link", name=re.compile("Add to calendar")).get_attribute("href")
            r = bk.request.get(BASE + href)
            assert r.status == 200 and "text/calendar" in r.headers.get("content-type", ""), f"ics {r.status}"
            assert "BEGIN:VEVENT" in r.text()
        check("booking: .ics download", ics)

    def out_of_area():
        bk.goto(BASE + "/book?mode=mobile")
        bk.locator("#b-zip").fill("36801")
        expect(bk.get_by_text(re.compile("outside our mobile radius"))).to_be_visible()
        bk.get_by_role("button", name="Switch to Shop Drop-Off").click()
        expect(bk.get_by_text("After-hours key drop", exact=True)).to_be_visible()
    check("booking: out-of-area routes to shop", out_of_area)

    mb = new_page(browser)

    def memberships():
        mb.goto(BASE + "/memberships")
        mb.get_by_role("radio", name=re.compile("Annual")).click()
        expect(mb.get_by_text("$290").first).to_be_visible()
        mb.get_by_role("button", name=re.compile("Join Daily Driver")).click()
        expect(mb.get_by_text(re.compile("You.re in"))).to_be_visible(timeout=20000)
    check("memberships: annual toggle + join", memberships)

    iv = new_page(browser)

    def invoice_approve():
        iv.goto(BASE + DEMO_INVOICE)
        expect(iv.get_by_text("Awaiting your approval")).to_be_visible()
        expect(iv.get_by_text("Digital Vehicle Inspection")).to_be_visible()
        iv.locator("#sig").fill("Sample Customer")
        iv.locator("input[name=consent]").check()
        iv.get_by_role("button", name="Approve Estimate").click()
        expect(iv.get_by_text(re.compile("^Approved")).first).to_be_visible(timeout=20000)
    if check("invoice: approve estimate", invoice_approve):
        def invoice_pay():
            iv.goto(BASE + DEMO_INVOICE)
            iv.get_by_role("button", name=re.compile("Pay Now")).click()
            expect(iv.get_by_role("link", name=re.compile("Official Receipt"))).to_be_visible(timeout=20000)
            iv.get_by_role("link", name=re.compile("Official Receipt")).click()
            expect(iv.locator("h1")).to_contain_text("Official Receipt")
            expect(iv.get_by_text("kyledubios2412@gmail.com").first).to_be_visible()
        check("invoice: pay + official receipt", invoice_pay)

    def admin_gate():
        iv.goto(BASE + "/admin")
        expect(iv).to_have_url(re.compile("/admin/login"))
    check("admin: gated to login", admin_gate)

    dk = new_page(browser, mobile=False)

    def desktop_nav():
        dk.goto(BASE + "/")
        expect(dk.get_by_role("navigation", name="Main").get_by_role("link", name="Memberships")).to_be_visible()
    check("desktop: main nav", desktop_nav)


run("step1", body)
