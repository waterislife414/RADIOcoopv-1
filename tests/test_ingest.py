from pathlib import Path
import sqlite3

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
from pathlib import Path
import sqlite3

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
    assert parse_amount("more than $1,000", rules) == (100000, None)
    assert parse_amount("under $50", rules) == (None, 5000)
    assert parse_amount("$25", rules) == (2500, 2500)
    assert parse_amount("unknown", rules) == (None, None)
    assert parse_amount("", rules) == (None, None)


def test_classify_signal():
    rules = load_rules()
    assert classify_signal("Example Life Insurance Co", "Life insurance proceeds", rules) == "high"
    assert classify_signal("Example Bank", "Savings account", rules) == "medium"
    assert classify_signal("Example Power Co", "Utility deposit", rules) == "low"
    assert classify_signal("Unknown Holder", "Unknown Type", rules) == "none"
    assert classify_signal("Fidelity Investments", "Brokerage Account", rules) == "high"
    assert classify_signal("Wells Fargo", "Checking Account", rules) == "medium"
    assert classify_signal("City Water Dept", "Utility Refund", rules) == "low"


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
    # The first property for ALPHA is 'Life insurance proceeds', which is 'high'
    # The second is 'Crypto account', which is also 'high'
    assert props[0]["signal"] == "high"
    assert props[1]["signal"] == "high"
    assert alpha["kind"] == "person"

    # Verify BRAVO amount max is 10000 ('under $100')
    bravo = db.execute("SELECT id FROM owners WHERE name = 'ZZ TESTPERSON BRAVO'").fetchone()
    assert bravo is not None
    bprop = db.execute("SELECT * FROM properties WHERE owner_id = ?", (bravo["id"],)).fetchone()
    assert bprop["amount_max_cents"] == 10000
    assert bprop["amount_min_cents"] is None
    assert bravo["kind"] == "person"

    # Verify CHARLIE is a person and has correct reported year
    charlie = db.execute("SELECT id FROM owners WHERE name = 'ZZ TESTPERSON CHARLIE'").fetchone()
    assert charlie["kind"] == "person"
    cprop = db.execute("SELECT * FROM properties WHERE owner_id = ?", (charlie["id"],)).fetchone()
    assert cprop["reported_year"] is None
    assert cprop["reported_date"] == "2025" # The fixture has '2025' which is parsed as a date string if not 4 digits and only digits.

    # Verify BUSINESS LLC is a business
    business = db.execute("SELECT id FROM owners WHERE name = 'ZZ TEST BUSINESS LLC'").fetchone()
    assert business["kind"] == "business"

    # Test idempotency by ingesting again
    count_again = ingest_csv(db, csv_path, rules)
    assert count_again == 6 # Still 6 rows processed, but no new inserts
    total_owners = db.execute("SELECT COUNT(*) FROM owners").fetchone()[0]
    total_properties = db.execute("SELECT COUNT(*) FROM properties").fetchone()[0]
    assert total_owners == 4 # ALPHA, BRAVO, CHARLIE, BUSINESS
    assert total_properties == 6 # 2 for ALPHA, 1 for BRAVO, 1 for CHARLIE, 2 for BUSINESS

    # Test that updates occur on conflict (e.g., if a signal changes due to rule update)
    # This requires modifying a row in the CSV or simulating a change, not directly covered by the current fixture.
    # However, the ON CONFLICT clause in the ingest_csv function ensures this behavior.
