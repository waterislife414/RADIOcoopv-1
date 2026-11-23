import pytest
import sqlite3

from uprec.config import load_rules
from uprec.db import init_db
from uprec.score import score_owner

@pytest.fixture
def db_conn():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    init_db(conn)
    return conn

def test_score_owner_tier_a(db_conn):
    rules = load_rules()
    cursor = db_conn.cursor()
    cursor.execute("INSERT INTO owners (id, name) VALUES (1, 'Test Owner')")
    # Total >= 50000 -> Tier A
    cursor.execute("""
        INSERT INTO properties (owner_id, amount_min_cents, signal)
        VALUES (1, 60000, 'none')
    """)
    db_conn.commit()

    tier = score_owner(db_conn, 1, rules)
    assert tier == 'A'

def test_score_owner_tier_b(db_conn):
    rules = load_rules()
    cursor = db_conn.cursor()
    cursor.execute("INSERT INTO owners (id, name) VALUES (1, 'Test Owner')")
    # Total >= 10001 and < 50000 -> Tier B
    cursor.execute("""
        INSERT INTO properties (owner_id, amount_min_cents, signal)
        VALUES (1, 15000, 'none')
    """)
    db_conn.commit()

    tier = score_owner(db_conn, 1, rules)
    assert tier == 'B'

def test_score_owner_tier_c(db_conn):
    rules = load_rules()
    cursor = db_conn.cursor()
    cursor.execute("INSERT INTO owners (id, name) VALUES (1, 'Test Owner')")
    # Single property over floor with unknown upper bound -> Tier C
    cursor.execute("""
        INSERT INTO properties (owner_id, amount_min_cents, amount_max_cents, signal)
        VALUES (1, 15000, NULL, 'none')
    """)
    db_conn.commit()

    tier = score_owner(db_conn, 1, rules)
    assert tier == 'C'

def test_score_owner_tier_x(db_conn):
    rules = load_rules()
    cursor = db_conn.cursor()
    cursor.execute("INSERT INTO owners (id, name) VALUES (1, 'Test Owner')")
    # Small amount, no signal -> Tier X
    cursor.execute("""
        INSERT INTO properties (owner_id, amount_min_cents, amount_max_cents, signal)
        VALUES (1, 500, 1000, 'none')
    """)
    db_conn.commit()

    tier = score_owner(db_conn, 1, rules)
    assert tier == 'X'
