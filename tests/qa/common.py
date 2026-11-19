"""Shared Playwright helpers for the click-through. Failed checks append what the screen really showed."""
import os, re
from playwright.sync_api import sync_playwright, Page

BASE = os.environ.get("QA_BASE", "http://127.0.0.1:8790")
PAGES: list[Page] = []
RESULTS: list[tuple[str, bool, str]] = []
CONSOLE_ERRORS: list[str] = []


def diag() -> str:
    """Diagnostics bot: say what each open page shows (url, test ids, visible buttons, h1)."""
    out = []
    for pg in PAGES:
        try:
            ids = pg.evaluate("[...new Set([...document.querySelectorAll('[data-testid]')].map(e=>e.dataset.testid))]")
            btn = pg.evaluate("[...document.querySelectorAll('button,a')].filter(b=>b.offsetParent).map(b=>b.innerText.trim().slice(0,22)).filter(Boolean).slice(0,24)")
            h1 = pg.evaluate("document.querySelector('h1')?.innerText?.slice(0,60) || ''")
            out.append(f"[{pg.url[-48:]}] h1={h1!r} testids={ids} buttons={btn}")
        except Exception:
            pass
    return " || ".join(out)[:1100]


def check(name: str, fn) -> bool:
    try:
        fn()
        RESULTS.append((name, True, ""))
        return True
    except Exception as e:  # noqa: BLE001
        msg = re.sub(r"\s+", " ", str(e))[:260]
        RESULTS.append((name, False, f"{msg} :: SCREEN {diag()}"))
        return False


def new_page(browser, mobile: bool = True) -> Page:
    ctx = browser.new_context(viewport={"width": 390, "height": 844} if mobile else {"width": 1366, "height": 900})
    pg = ctx.new_page()
    pg.set_default_timeout(15000)
    pg.on("pageerror", lambda e: CONSOLE_ERRORS.append(f"PAGE {e}"))
    PAGES.append(pg)
    return pg


def report(suite: str) -> None:
    passed = sum(1 for _, ok, _ in RESULTS if ok)
    for name, ok, msg in RESULTS:
        print(f"PASS {name}" if ok else f"  FAIL {name}: {msg}")
    for e in CONSOLE_ERRORS[:5]:
        print(f"  FAIL js-error: {e[:240]}")
    total = len(RESULTS) + (1 if CONSOLE_ERRORS else 0)
    print(f"== {suite} score {passed}/{total}")


def run(suite: str, body) -> None:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        try:
            body(browser)
        finally:
            report(suite)
            browser.close()
