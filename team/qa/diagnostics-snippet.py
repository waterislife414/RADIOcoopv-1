# Paste into your Playwright common.py; call PAGES.append(pg) in watch(); append ' :: SCREEN '+diag() to every failed check message.
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
