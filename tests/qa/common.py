import re, json
BASE=__import__("os").environ.get("QA_BASE","http://127.0.0.1:8790")
KEY="rc-demo-db-v1"
results=[]
PAGES=[]
def diag():
    # Free diagnostics bot: on a failed check, say what each open page actually shows.
    out=[]
    for pg in PAGES:
        try:
            ids=pg.evaluate("[...new Set([...document.querySelectorAll('[data-testid]')].map(e=>e.dataset.testid))]")
            btn=pg.evaluate("[...document.querySelectorAll('button')].filter(b=>b.offsetParent).map(b=>b.innerText.trim().slice(0,22)).filter(Boolean).slice(0,24)")
            out.append(f"[{pg.url[-38:]}] testids={ids} buttons={btn}")
        except Exception: pass
    return " || ".join(out)[:1100]
def check(name, fn):
    try:
        r=fn()
        # Pass = True, None, or another truthy non-string value. A string is a failure reason.
        ok = (r is None or r is True or (bool(r) and not isinstance(r,str)))
        results.append((ok,name,"" if ok else ((r if isinstance(r,str) else "failed")+" :: SCREEN "+diag())))
    except Exception as e:
        results.append((False,name,str(e).split("\n")[0][:160]+" :: SCREEN "+diag()))
def report(title):
    bad=[r for r in results if not r[0]]
    print(f"== {title}: {len(results)-len(bad)}/{len(results)} passed")
    for ok,n,why in bad: print("  FAIL", n, "->", why)
def watch(pg, errs):
    PAGES.append(pg)
    pg.on("pageerror", lambda e: errs.append("PAGE "+str(e)[:160]))
    pg.on("console", lambda m: errs.append("CONSOLE "+m.text[:160]) if m.type=="error" and "favicon" not in m.text else None)
    pg.on("response", lambda r: errs.append(f"HTTP {r.status} {r.url[-60:]}") if r.status>=400 and r.url.startswith(BASE) else None)
def db(pg): return pg.evaluate(f"JSON.parse(localStorage.getItem('{KEY}')||'{{}}')")
def accept_gate(pg):
    if pg.locator("text=Before you drive").count():
        pg.click("button:has-text('Open and read')"); pg.wait_for_timeout(400)
        pg.evaluate("document.querySelector('[data-testid=legal-scroll]').scrollTo(0,1e6)"); pg.wait_for_timeout(300)
        pg.click("button:has-text(\"I've read it\")"); pg.wait_for_timeout(200)
        pg.locator("text=I have read and agree").click(); pg.click("button:has-text('Agree and continue')"); pg.wait_for_timeout(1500)
def agree_modal(pg, confirm):
    pg.wait_for_selector("[data-testid=legal-scroll]", timeout=4000)
    if pg.locator("[data-testid=consent-quick]").count():
        # Riders: one box, no scrolling (Nov 23 decision).
        pg.check("[data-testid=consent-agree]"); pg.click(f"button:has-text('{confirm}')"); return
    pg.evaluate("document.querySelector('[data-testid=legal-scroll]').scrollTo(0,1e6)"); pg.wait_for_timeout(300)
    pg.click("button:has-text('Check all')"); pg.click(f"button:has-text('{confirm}')")
def launch(p, **kw):
    b=p.chromium.launch(executable_path="/usr/bin/google-chrome",args=["--no-sandbox"])
    ctx=b.new_context(viewport={"width":400,"height":860},geolocation={"latitude":32.47,"longitude":-84.98},permissions=["geolocation"],**kw)
    return b, ctx
def more_options(pg):
    # Booking extras (passengers, stops, round trip, wheelchair, share location, schedule) sit behind "More options".
    b=pg.locator("[data-testid=more-options]")
    if b.count() and b.get_attribute("aria-expanded")!="true": b.click(); pg.wait_for_timeout(200)
