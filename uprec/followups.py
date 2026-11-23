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
                INSERT INTO status_history (owner_id, old_status, new_status, reason)
                VALUES (?, ?, ?, ?)
                """,
                (owner_id, current_status, new_status, f"Logged outreach via {channel}"),
            )

    conn.commit()
    return outreach_id


def record_response(
    conn: sqlite3.Connection,
    outreach_id: int,
    response: str,
) -> None:
    cursor = conn.cursor()
    cursor.execute(
        """
        UPDATE outreach
        SET response = ?, follow_up_on = NULL
        WHERE id = ?
        """,
        (response, outreach_id),
    )
    conn.commit()


def due_followups(
    conn: sqlite3.Connection,
    today: str,
    rules: dict | None = None,
) -> list[dict]:
    cursor = conn.cursor()
    # Find outreach rows with follow_up_on not null and <= today and response null or empty
    # Owners with status 'contacted' only
    # ordered by follow_up_on then id
    # attempts = count of outreach rows for that owner
    query = """
        SELECT o.id AS outreach_id,
               o.owner_id,
               ow.name,
               o.channel,
               o.sent_on,
               o.follow_up_on,
               (SELECT COUNT(*) FROM outreach WHERE owner_id = o.owner_id) AS attempts
        FROM outreach o
        JOIN owners ow ON ow.id = o.owner_id
        WHERE ow.status = 'contacted'
          AND o.follow_up_on IS NOT NULL
          AND o.follow_up_on <= ?
          AND (o.response IS NULL OR o.response = '')
        ORDER BY o.follow_up_on ASC, o.id ASC
    """
    cursor.execute(query, (today,))
    rows = cursor.fetchall()
    return [dict(row) for row in rows]


def close_exhaust