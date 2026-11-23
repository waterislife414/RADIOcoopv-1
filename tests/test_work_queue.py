import sqlite3
import pytest
from uprec.db import init_db
from uprec.work_queue import next_cases

@pytest.fixture
def db_conn():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    init_db(conn)
    yield conn
    conn.close()

def test_work_queue_ordering_and_missing(db_conn):
    # Insert owners
    db_conn.execute("""
        INSERT INTO owners (id, kind, name, address, life_status, business_status, tier, status)
        VALUES 
        (1, 'person', 'Alice Smith', NULL, 'unknown', 'n/a', 'B', 'gated'),
        (2, 'person', 'Bob Jones', '123 Main St', 'deceased', 'n/a', 'A', 'researching'),
        (3, 'business', 'Acme Corp', '456 Market St', 'n/a', 'unknown', 'A', 'gated')
    """)
    # Insert properties
    db_conn.execute("""
        INSERT INTO properties (owner_id, amount_min_cents)
        VALUES 
        (1, 20000),
        (2, 60000),
        (3, 80000)
    """)
    db_conn.commit()

    cases = next_cases(db_conn, limit=10)
    # Tier A should come first, sorted by total_min_cents desc (Acme Corp 80000, Bob Jones 60000), then Tier B (Alice Smith 20000)
    assert len(cases) == 3
    assert cases[0]["owner_id"] == 3
    assert cases[0]["tier"] == 'A'
    assert 'business status' in cases[0]["missing"]

    assert cases[1]["owner_id"] == 2
    assert cases[1]["tier"] == 'A'
    assert 'heirs' in cases[1]["missing"] # deceased with no heirs

    assert cases[2]["owner_id"] == 1
    assert cases[2]["tier"] == 'B'
    assert 'mailing address' in cases[2]["missing"]
