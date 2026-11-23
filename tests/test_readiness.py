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
