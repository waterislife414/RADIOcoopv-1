import sys; sys.path.insert(0,"/tmp/qa")
from common import *
from playwright.sync_api import sync_playwright
START={"guest":["/"],"demo-rider":["/","/profile"],"demo-driver-44":["/driver","/driver/profile"],"demo-admin":["/admin/dashboard"],"demo-mechanic":["/shop"]}
with sync_playwright() as p:
    b,ctx=launch(p)
    for role,starts in START.items():
        pg=ctx.new_page(); errs=[]; watch(pg,errs)
        pg.goto(BASE+"/?as="+role); pg.wait_for_timeout(1200)
        seen=set(); queue=list(starts)
        while queue and len(seen)<45:
            path=queue.pop(0)
            if path in seen: continue
            seen.add(path); errs.clear()
            pg.goto(BASE+path); pg.wait_for_timeout(1100)
            accept_gate(pg)
            txt=pg.locator("#root").inner_text()
            name=f"{role} {path}"
            check(name+" loads", lambda: (len(txt)>60 and "That page doesn't exist" not in txt) or f"empty or 404 ({len(txt)} chars)")
            check(name+" no errors", lambda: not errs or "; ".join(errs[:2]))
            for h in pg.eval_on_selector_all("a[href^='/']","els=>els.map(e=>e.getAttribute('href'))"):
                h=h.split("#")[0]
                if h and h not in seen and not h.startswith("/admin/login") or (h=="/admin/login" and role=="guest"):
                    if h not in seen: queue.append(h)
        print(role, "pages:", len(seen))
        pg.close()
    b.close()
report("Every link, every role")
