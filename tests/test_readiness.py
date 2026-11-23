import sqlite3

import pytest

from uprec.config import load_rules
from uprec.db import init_db
from uprec.readiness import is_outreach_ready, outreach_blockers


@pytest.fixture
def db_conn():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    init_db(conn)
    return conn


def test_readiness_blockers(db_conn):
    rules = load_rules()
    cur = db_conn.cursor()
    cur.execute("INSERT INTO owners (id, kind, name, status, life_status, tier) VALUES (1, 'person', 'Test Owner', 'new', 'alive', 'A')")
    cur.execute("INSERT INTO properties (owner_id, eligible_after) VALUES (1, '2025-01-01')")
    cur.execute("INSERT INTO contacts (owner_id, kind, value) VALUES (1, 'mail', '123 Main St')")
    db_conn.commit()

    blockers = outreach_blockers(db_conn, 1, '2026-01-01', rules)
    assert blockers == []
    assert is_outreach_ready(db_conn, 1, '2026-01-01', rules) is True

    cur.execute("UPDATE owners SET status = 'dropped' WHERE id = 1")
    db_conn.commit()
    blockers = outreach_blockers(db_conn, 1, '2026-01-01', rules)
    assert 'status dropped' in blockers
    assert is_outreach_ready(db_conn, 1, '2026-01-01', rules) is False

    # Test tier X blocker
    cur.execute("UPDATE owners SET status = 'new', tier = 'X' WHERE id = 1")
    db_conn.commit()
    blockers = outreach_blockers(db_conn, 1, '2026-01-01', rules)
    assert 'tier X' in blockers
    assert is_outreach_ready(db_conn, 1, '2026-01-01', rules) is False

    # Test no property past waiting period blocker
    cur.execute("UPDATE owners SET status = 'new', tier = 'A' WHERE id = 1")
    cur.execute("UPDATE properties SET eligible_after = '2027-01-01' WHERE owner_id = 1")
    db_conn.commit()
    blockers = outreach_blockers(db_conn, 1, '2026-01-01', rules)
    assert 'no property past waiting period' in blockers
    assert is_outreach_ready(db_conn, 1, '2026-01-01', rules) is False

    # Test life status unknown blocker (person)
    cur.execute("UPDATE properties SET eligible_after = '2025-01-01' WHERE owner_id = 1") # make it ready again
    cur.execute("UPDATE owners SET life_status = 'unknown' WHERE id = 1")
    db_conn.commit()
    blockers = outreach_blockers(db_conn, 1, '2026-01-01', rules)
    assert 'life status unknown' in blockers
    assert is_outreach_ready(db_conn, 1, '2026-01-01', rules) is False

    # Test deceased: no heir blocker
    cur.execute("UPDATE owners SET life_status = 'deceased' WHERE id = 1")
    db_conn.commit()
    blockers = outreach_blockers(db_conn, 1, '2026-01-01', rules)
    assert 'deceased: no heir' in blockers
    assert is_outreach_ready(db_conn, 1, '2026-01-01', rules) is False

    # Add an heir to clear the 'deceased: no heir' blocker, but ensure mail contact is still for owner
    cur.execute("INSERT INTO heirs (id, owner_id, name) VALUES (1, 1, 'Test Heir')")
    db_conn.commit()
    blockers = outreach_blockers(db_conn, 1, '2026-01-01', rules)
    assert 'deceased: no heir' not in blockers
    assert is_outreach_ready(db_conn, 1, '2026-01-01', rules) is True # Should be ready with heir and contact

    # Test no mailing address (owner contact removed, heir contact added)
    cur.execute("DELETE FROM contacts WHERE owner_id = 1")
    db_conn.commit()
    blockers = outreach_blockers(db_conn, 1, '2026-01-01', rules)
    assert 'no mailing address' in blockers
    assert is_outreach_ready(db_conn, 1, '2026-01-01', rules) is False

    cur.execute("INSERT INTO contacts (heir_id, kind, value) VALUES (1, 'mail', '456 Heir Ln')")
    db_conn.commit()
    blockers = outreach_blockers(db_conn, 1, '2026-01-01', rules)
    assert 'no mailing address' not in blockers
    assert is_outreach_ready(db_conn, 1, '2026-01-01', rules) is True

    # Test business status unknown blocker
    cur.execute("UPDATE owners SET kind = 'business', life_status = 'n/a', business_status = 'unknown' WHERE id = 1")
    db_conn.commit()
    blockers = outreach_blockers(db_conn, 1, '2026-01-01', rules)
    assert 'business status unknown' in blockers
    assert is_outreach_ready(db_conn, 1, '2026-01-01', rules) is False

    # Test business dissolved: no heir/officer contact blocker
    cur.execute("UPDATE owners SET business_status = 'dissolved' WHERE id = 1")
    cur.execute("DELETE FROM contacts WHERE heir_id = 1") # Remove existing contact
    db_conn.commit()
    blockers = outreach_blockers(db_conn, 1, '2026-01-01', rules)
    assert 'business dissolved: no heir/officer contact' in blockers
    assert is_outreach_ready(db_conn, 1, '2026-01-01', rules) is False

    # Add a contact for the business (or an heir) to clear the 'business dissolved' blocker
    cur.execute("INSERT INTO contacts (owner_id, kind, value) VALUES (1, 'email', 'business@example.com')")
    cur.execute("INSERT INTO contacts (owner_id, kind, value) VALUES (1, 'mail', '789 Business Rd')") # Also ensures mailing address
    db_conn.commit()
    blockers = outreach_blockers(db_conn, 1, '2026-01-01', rules)
    assert 'business dissolved: no heir/officer contact' not in blockers
    assert is_outreach_ready(db_conn, 1, '2026-01-01', rules) is True
