import sqlite3
from pathlib import Path

import pytest

from uprec.config import load_rules
from uprec.db import init_db
from uprec.ingest import classify_signal, ingest_csv, parse_amount

@pytest.fixture
def db():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    init_db(conn)
    yield conn
    conn.close()

def test_parse_amount():
    rules = load_rules()
    assert parse_amount("over $500", rules) == (50000, None)
    assert parse_amount("under $100", rules) == (None, 10000)
    assert parse_amount("$150.25", rules) == (15025, 15025)

def test_classify_signal():
    rules = load_rules()
    assert classify_signal("Example Life Insurance Co", "Life insurance proceeds", rules) == "high"
    assert classify_signal("Example Bank", "Savings account", rules) == "medium"
    assert classify_signal("Example Power Co", "Utility deposit", rules) == "low"
    assert classify_signal("Unknown Holder", "Unknown Type", rules) == "none"

def test_ingest_csv(db):
    rules = load_rules()
    csv_path = Path(__file__).resolve().parent.parent / "fixtures" / "synthetic_owners.csv"
    count = ingest_csv(db, csv_path, rules)
    assert count == 6

    # Verify ALPHA has 2 properties and signal high
    alpha = db.execute("SELECT id FROM owners WHERE name = 'ZZ TESTPERSON ALPHA'").fetchone()
    assert alpha is not None
    props = db.execute("SELECT * FROM properties WHERE owner_id = ?", (alpha["id"],)).fetchall()
    assert len(props) == 2
    assert props[0]["signal"] == "high"

    # Verify BRAVO amount max is 10000 ('under $100')
    bravo = db.execute("SELECT id FROM owners WHERE name = 'ZZ TESTPERSON BRAVO'").fetchone()
    assert bravo is not None
    bprop = db.execute("SELECT * FROM properties WHERE owner_id = ?", (bravo["id"],)).fetchone()
    assert bprop["amount_max_cents"] == 10000
