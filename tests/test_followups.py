import pytest

from uprec.db import connect, init_db
from uprec.followups import close_exhausted, due_followups, log_outreach, record_response

RULES = {"outreach": {"follow_up_days": 14, "max_attempts": 3}}


@pytest.fixture
def conn():
    c = connect(":memory:")
    init_db(c)
    c.execute("INSERT INTO owners (id, name, status) VALUES (1, 'ZZ TEST ONE', 'ready')")
    c.commit()
    return c


def test_log_sets_followup_and_status(conn):
    log_outreach(conn, 1, "mail", "2026-11-01", rules=RULES)
    row = conn.execute("SELECT follow_up_on FROM outreach").fetchone()
    assert row["follow_up_on"] == "2026-11-15"
    assert conn.execute("SELECT status FROM owners WHERE id = 1").fetchone()["status"] == "contacted"
    assert conn.execute("SELECT COUNT(*) n FROM status_history").fetchone()["n"] == 1


def test_bad_channel_rejected(conn):
    with pytest.raises(ValueError):
        log_outreach(conn, 1, "carrier pigeon", "2026-11-01", rules=RULES)


def test_due_and_response_clears(conn):
    oid = log_outreach(conn, 1, "mail", "2026-11-01", rules=RULES)
    assert due_followups(conn, "2026-11-14", RULES) == []
    due = due_followups(conn, "2026-11-15", RULES)
    assert len(due) == 1 and due[0]["attempts"] == 1 and due[0]["name"] == "ZZ TEST ONE"
    record_response(conn, oid, "interested")
    assert due_followups(conn, "2026-11-30", RULES) == []


def test_close_exhausted_after_max_unanswered(conn):
    for d in ("2026-10-01", "2026-10-20", "2026-11-05"):
        log_outreach(conn, 1, "mail", d, rules=RULES)
    assert close_exhausted(conn, "2026-11-10", RULES) == []  # last follow-up (11-19) not reached yet
    assert close_exhausted(conn, "2026-11-19", RULES) == [1]
    assert conn.execute("SELECT status FROM owners WHERE id = 1").fetchone()["status"] == "closed_lost"


def test_answered_owner_never_closed(conn):
    for d in ("2026-10-01", "2026-10-20", "2026-11-05"):
        oid = log_outreach(conn, 1, "mail", d, rules=RULES)
    record_response(conn, oid, "call me")
    assert close_exhausted(conn, "2027-01-01", RULES) == []
