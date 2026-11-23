# Round 2 click-through: Uber's own Columbus prices on home and compare, honest plan perks,
# a Basic member's free monthly Day Pass, and deleting an account (Google Play requirement).
# Run: QA_BASE=http://127.0.0.1:8790 python3 tests/qa/round2.py  (demo build served on that port)
import time
from common import *
from playwright.sync_api import sync_playwright

def put(pg, path, data):
    pg.evaluate("([k,p,d])=>{const s=JSON.parse(localStorage.getItem(k)||'{}');s[p]=Object.