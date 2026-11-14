import re, json
BASE="http://127.0.0.1:8790"
KEY="rc-demo-db-v1"
results=[]
def check(name, fn):
    try:
        r=fn()
        ok = r is not False
        results.append((ok,name,"" if ok else (r if isinstance(r,str) else "failed")))
    except Exception as e:
        results.append((False,name,str(e).split("\n")[0][:160]))
def report(title):
    bad=[r for r in results if not r[0]]
    print(f"== {title}: {len(results)-len(bad)}/{len(results)} passed")
    for ok,n,why in bad: print("  FAIL", n, "->", why)
def watch(pg, errs):
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
    pg.evaluate("document.querySelector('[data-testid=legal-scroll]').scrollTo(0,1e6)"); pg.wait_for_timeout(300)
    pg.click("button:has-text('Check all')"); pg.click(f"button:has-text('{confirm}')")
def launch(p, **kw):
    b=p.chromium.launch(executable_path="/usr/bin/google-chrome",args=["--no-sandbox"])
    ctx=b.new_context(viewport={"width":400,"height":860},geolocation={"latitude":32.47,"longitude":-84.98},permissions=["geolocation"],**kw)
    return b, ctx
