"""Tests for gating logic."""
import sqlite3
from datetime import date
import pytest

from uprec.db import init_db
from uprec.gate import eligible_after, gate_owner


@pytest.fixture
def db_conn():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    init_db(conn)
    yield conn
    conn.close()


def test_eligible_after_reported_date():
    rules = {"law": {"waiting_months": 24, "year_only_delivery": "12-31"}}
    assert eligible_after("2024-05-01", None, rules) == "2026-05-01"


def test_eligible_after_reported_year():
    rules = {"law": {"waiting_months": 24, "year_only_delivery": "12-31"}}
    assert eligible_after(None, 2023, rules) == "2025-12-31"


def test_gate_owner_single_below_floor(db_conn):
    rules = {
        "law": {"waiting_months": 24, "year_only_delivery": "12-31"},
        "floors": {"single_claim_min_cents": 10001}
    }
    cursor = db_conn.cursor()
    cursor.execute("INSERT INTO owners (id, name, status) VALUES (1, 'Test Owner', 'new')")
    cursor.execute(
        "INSERT INTO properties (owner_id, amount_max_cents, reported_date) VALUES (1, 5000, '2020-01-01')"
    )
    db_conn.commit()

    status = gate_owner(db_conn, 1, "2026-01-01", rules)
    assert status == "dropped"

    owner = cursor.execute("SELECT status, drop_reason FROM owners WHERE id = 1").fetchone()
    assert owner["status"] == "dropped"
    assert owner["drop_reason"] == "single_below_floor"
