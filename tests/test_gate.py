"""Tests for gating logic."""
import pytest
import sqlite3

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

    history = cursor.execute(
        "SELECT old_status, new_status, reason FROM status_history WHERE owner_id = 1"
    ).fetchone()
    assert history["old_status"] == "new"
    assert history["new_status"] == "dropped"
    assert history["reason"] == "single_below_floor"


def test_gate_owner_single_not_below_floor(db_conn):
    rules = {
        "law": {"waiting_months": 24, "year_only_delivery": "12-31"},
        "floors": {"single_claim_min_cents": 10001}
    }
    cursor = db_conn.cursor()
    cursor.execute("INSERT INTO owners (id, name, status) VALUES (1, 'Test Owner', 'new')")
    # Property amount is $200.00, which is strictly above $100.00
    cursor.execute(
        "INSERT INTO properties (owner_id, amount_max_cents, reported_date) VALUES (1, 20000, '2020-01-01')"
    )
    db_conn.commit()

    status = gate_owner(db_conn, 1, "2026-01-01", rules)
    assert status == "gated"

    owner = cursor.execute("SELECT status, drop_reason FROM owners WHERE id = 1").fetchone()
    assert owner["status"] == "gated"
    assert owner["drop_reason"] is None

    history = cursor.execute(
        "SELECT old_status, new_status, reason FROM status_history WHERE owner_id = 1"
    ).fetchone()
    assert history["old_status"] == "new"
    assert history["new_status"] == "gated"
    assert history["reason"] is None


def test_gate_owner_multi_claim_not_dropped_by_floor(db_conn):
    rules = {
        "law": {"waiting_months": 24, "year_only_delivery": "12-31"},
        "floors": {"single_claim_min_cents": 10001, "multi_claim_override": True}
    }
    cursor = db_conn.cursor()
    cursor.execute("INSERT INTO owners (id, name, status) VALUES (1, 'Test Owner', 'new')")
    # Two properties, each below the single claim floor ($50.00 and $75.00)
    cursor.execute(
        "INSERT INTO properties (owner_id, amount_max_cents, reported_date) VALUES (1, 5000, '2020-01-01')"
    )
    cursor.execute(
        "INSERT INTO properties (owner_id, amount_max_cents, reported_date) VALUES (1, 7500, '2020-01-01')"
    )
    db_conn.commit()

    status = gate_owner(db_conn, 1, "2026-01-01", rules)
    assert status == "gated"

    owner = cursor.execute("SELECT status, drop_reason FROM owners WHERE id = 1").fetchone()
    assert owner["status"] == "gated"
    assert owner["drop_reason"] is None

    history = cursor.execute(
        "SELECT old_status, new_status, reason FROM status_history WHERE owner_id = 1"
    ).fetchone()
    assert history["old_status"] == "new"
    assert history["new_status"] == "gated"
    assert history["reason"] is None


def test_gate_owner_unknown_date_holds(db_conn):
    rules = {
        "law": {"waiting_months": 24, "year_only_delivery": "12-31"},
        "floors": {"single_claim_min_cents": 10001}
    }
    cursor = db_conn.cursor()
    cursor.execute("INSERT INTO owners (id, name, status) VALUES (1, 'Test Owner', 'new')")
    # Property with unknown reported date and year
    cursor.execute(
        "INSERT INTO properties (owner_id, amount_max_cents, reported_date, reported_year) VALUES (1, 50000, NULL, NULL)"
    )
    db_conn.commit()

    status = gate_owner(db_conn, 1, "2026-01-01", rules)
    assert status == "hold"

    owner = cursor.execute("SELECT status, drop_reason FROM owners WHERE id = 1").fetchone()
    assert owner["status"] == "hold"
    assert owner["drop_reason"] is None # drop_reason is not set for 'hold' status

    history = cursor.execute(
        "SELECT old_status, new_status, reason FROM status_history WHERE owner_id = 1"
    ).fetchone()
    assert history["old_status"] == "new"
    assert history["new_status"] == "hold"
    assert history["reason"] == "unknown_date"


def test_gate_owner_all_too_new_drops(db_conn):
    rules = {
        "law": {"waiting_months": 24, "year_only_delivery": "12-31"},
        "floors": {"single_claim_min_cents": 10001}
    }
    cursor = db_conn.cursor()
    cursor.execute("INSERT INTO owners (id, name, status) VALUES (1, 'Test Owner', 'new')")
    # Property reported recently, making it too new for the 24-month waiting period
    cursor.execute(
        "INSERT INTO properties (owner_id, amount_max_cents, reported_date) VALUES (1, 50000, '2025-05-01')"
    )
    db_conn.commit()

    status = gate_owner(db_conn, 1, "2026-01-01", rules)
    assert status == "dropped"

    owner = cursor.execute("SELECT status, drop_reason FROM owners WHERE id = 1").fetchone()
    assert owner["status"] == "dropped"
    assert owner["drop_reason"] == "under_waiting_period"

    history = cursor.execute(
        "SELECT old_status, new_status, reason FROM status_history WHERE owner_id = 1"
    ).fetchone()
    assert history["old_status"] == "new"
    assert history["new_status"] == "dropped"
    assert history["reason"] == "under_waiting_period"
