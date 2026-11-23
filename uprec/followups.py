import sqlite3
from datetime import datetime, date, timedelta


def _parse_date(d_str: str) -> date:
    return datetime.strptime(d_str, "%Y-%m-%d").date()


def log_outreach(
    conn: sqlite3.Connection,
    owner_id: int,
    channel: str,
    sent_on: str,
    follow_up_on: str | None = None,
    response: str | None = None,
    rules: dict | None = None,
) -> int:
    if channel not in ("mail", "phone", "email", "in_person"):
        raise ValueError(f"Invalid channel: {channel}")

    if follow_up_on is None:
        if rules and "outreach" in rules and "follow_up_days" in rules["outreach"]:
            days = rules["outreach"]["follow_up_days"]
        else:
            days = 14
        d = _parse_date(sent_on) + timedelta(days=days)
        follow_up_on = d.isoformat()

    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO outreach (owner_id, channel, sent_on, response, follow_up_on)
        VALUES (?, ?, ?, ?, ?)
        """,
        (owner_id, channel, sent_on, response, follow_up_on),
    )
    outreach_id = cursor.lastrowid

    # Check owner status
    cursor.execute("SELECT status FROM owners WHERE id = ?", (owner_id,))
    row = cursor.fetchone()
    if row:
        current_status = row["status"]
        if current_status in ("new", "gated", "researching", "ready"):
            new_status = "contacted"
            cursor.execute(
                "UPDATE owners SET status = ?, updated_at = date('now') WHERE id = ?",
                (new_status, owner_id),
            )
            cursor.execute(
                """
                INSERT INTO status_history (owner_id, old_