import sys; sys.path.insert(0,"/tmp/qa")
from common import *
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b,ctx=launch(p); pg=ctx.new_page(); errs=[]; watch(pg,errs)
    pg.goto(BASE+"/?as=demo-rider"); pg.wait_for_timeout(1500); pg.goto(BASE+"/trip-details"); pg.wait_for_timeout(1500)
    print(pg.url, pg.locator("#pickup").count()); print(pg.inner_text("body")[:300].replace("\n"," | ")); print(errs[:3])
    pg.screenshot(path="/tmp/qa/dbg.png")
    b.close()
