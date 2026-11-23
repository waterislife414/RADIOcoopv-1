import sqlite3
import pytest

from uprec.casesheet import render_case_sheet
from uprec.db import init_db


@pytest.fixture
def db_conn():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    init_db(conn)
    return conn


def test_render_case_sheet(db_conn):
    db_conn.execute(
        "INSERT INTO owners (id, kind, name, city, state, county, life_status, business_status, tier, status) "
        "VALUES (1, 'person', 'John Doe', 'Phenix City', 'AL', 'Russell', 'unknown', 'n/a', 'A', 'new')"
    )
    db_conn.execute(
        "INSERT INTO properties (owner_id, holder, property_type, amount_text, signal) "
        "VALUES (1, 'Bank of America', 'Savings', 'over $100', 'high')"
    )
    db_conn.commit()

    rules = {}
    sheet = render_case_sheet(db_conn, 1, rules, "2026-06-01")
    assert "# Case Sheet: John Doe" in sheet
    assert "Bank of America" in sheet
    assert "Life status unknown" in sheet
