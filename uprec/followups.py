"""Outreach log and follow-up tracking."""
import sqlite3
from datetime import date, timedelta

CHANNELS = ("mail", "phone", "email", "in_person")
OPEN_STATUSES = ("new", "gated", "researching", "ready")


def _set_status(conn: sqlite3.Connection, owner_id: int, new: str, reason: str) -> None:
    old = conn.execute("SELECT status FROM owners WHERE id = ?", (owner_id,)).fetchone()["status"]
    conn.execute("UPDATE owners SET status = ?, updated_at = date('now') WHERE id = ?", (new, owner_id))
    conn.execute(
        "INSERT INTO status_history (owner_id, old_status, new_status, reason) VALUES (?, ?, ?, ?)",
        (owner_id, old, new, reason),
    )


def log_outreach(conn, owner_id, channel, sent_on, follow_up_on=None, response=None, rules=None) -> int:
    if channel not in CHANNELS:
        raise ValueError(f"channel must be one of {CHANNELS}")
    if follow_up_on is None and not response:
        days = (rules or {}).get("outreach", {}).get("follow_up_days", 14)
        follow_up_on = (date.fromisoformat(sent_on) + timedelta(days=days)).isoformat()
    cur = conn.execute(
        "INSERT INTO outreach (owner_id, channel, sent_on, response, follow_up_on) VALUES (?, ?, ?, ?, ?)",
        (owner_id, channel, sent_on, response, follow_up_on),
    )
    status = conn.execute("SELECT status FROM owners WHERE id = ?", (owner_id,)).fetchone()["status"]
    if status in OPEN_STATUSES:
        _set_status(conn, owner_id, "contacted", f"outreach via {channel}")
    return cur.lastrowid


def record_response(conn, outreach_id: int, response: str) -> None:
    conn.execute("UPDATE outreach SET response = ?, follow_up_on = NULL WHERE id = ?", (response, outreach_id))


def _attempts(conn, owner_id) -> int:
    return conn.execute("SELECT COUNT(*) n FROM outreach WHERE owner_id = ?", (owner_id,)).fetchone()["n"]


def due_followups(conn, today: str, rules: dict) -> list[dict]:
    rows = conn.execute(
        """SELECT u.id AS outreach_id, u.owner_id, o.name, u.channel, u.sent_on, u.follow_up_on
           FROM outreach u JOIN owners o ON o.id = u.owner_id
           WHERE u.follow_up_on IS NOT NULL AND u.follow_up_on <= ?
             AND (u.response IS NULL OR u.response = '') AND o.status = 'contacted'
           ORDER BY u.follow_up_on, u.id""",
        (today,),
    ).fetchall()
    return [dict(r) | {"attempts": _attempts(conn, r["owner_id"])} for r in rows]


def close_exhausted(conn, today: str, rules: dict) -> list[int]:
    max_attempts = rules.get("outreach", {}).get("max_attempts", 3)
    closed = []
    for o in conn.execute("SELECT id FROM owners WHERE status = 'contacted'").fetchall():
        oid = o["id"]
        rows = conn.execute("SELECT response, follow_up_on FROM outreach WHERE owner_id = ?", (oid,)).fetchall()
        if len(rows) < max_attempts or any(r["response"] for r in rows):
            continue
        last = max((r["follow_up_on"] for r in rows if r["follow_up_on"]), default=None)
        if last is not None and last <= today:
            _set_status(conn, oid, "closed_lost", "no response after max attempts")
            closed.append(oid)
    return closed
