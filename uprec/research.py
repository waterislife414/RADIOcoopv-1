"""Research facts, heirs, and contacts store."""
import sqlite3

def record_fact(
    conn: sqlite3.Connection,
    owner_id: int,
    fact_key: str,
    fact_value: str,
    source_url: str | None = None,
    source_note: str | None = None,
    confidence: str = "low"
) -> int:
    if not source_url and not source_note:
        raise ValueError("Must provide either source_url or source_note")
    if confidence not in ("low", "medium", "high"):
        raise ValueError(f"Invalid confidence: {confidence}")

    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO research_log (owner_id, fact_key, fact_value, source_url, source_note, confidence)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (owner_id, fact_key, fact_value, source_url, source_note, confidence)
    )
    fact_id = cur.lastrowid

    # Check if this is the first fact for this owner, if so update status from new/gated to researching
    cur.execute("SELECT status FROM owners WHERE id = ?", (owner_id,))
    row = cur.fetchone()
    if row and row["status"] in ("new", "gated"):
        old_status = row["status"]
        cur.execute("UPDATE owners SET status = 'researching', updated_at = datetime('now') WHERE id = ?", (owner_id,))
        cur.execute(
            """
            INSERT INTO status_history (owner_id, old_status, new_status, reason)
            VALUES (?, ?, 'researching', 'Started research')
            """,
            (owner_id, old_status)
        )

    if fact_key == "life_status":
        if fact_value not in ("alive", "deceased", "unknown"):
            raise ValueError(f"Invalid life_status: {fact_value}")
        cur.execute("UPDATE owners SET life_status = ?, updated_at = datetime('now') WHERE id = ?", (fact_value, owner_id))
    elif fact_key == "business_status":
        if fact_value not in ("active", "dissolved", "unknown", "n/a"):
            raise ValueError(f"Invalid business_status: {fact_value}")
        cur.execute("UPDATE owners SET business_status = ?, updated_at = datetime('now') WHERE id = ?", (fact_value, owner_id))
    elif fact_key == "mailing_address":
        verified = 1 if confidence == "high" else 0
        add_contact(conn, owner_id, "mail", fact_value, verified=verified, source_url=source_url or source_note)

    conn.commit()
    return fact_id


def add_heir(
    conn: sqlite3.Connection,
    owner_id: int,
    name: str,
    relationship: str | None = None,
    source_url: str | None = None,
    notes: str | None = None
) -> int:
    if not source_url and not notes:
        raise ValueError("Must provide either source_url or notes for an heir")
    
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO heirs (owner_id, name, relationship, source_url, notes)
        VALUES (?, ?, ?, ?, ?)
        """,
        (owner_id, name, relationship, source_url, notes)
    )
    conn.commit()
    return cur.lastrowid


def add_contact(
    conn: sqlite3.Connection,
    owner_id: int,
    kind: str,
    value: str,
    verified: int = 0,
    source_url: str | None = None,
    heir_id: int | None = None
) -> int:
    if kind not in ("mail", "phone", "email", "other"):
        raise ValueError(f"Invalid contact kind: {kind}")

    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO contacts (owner_id, heir_id, kind, value, verified, source_url)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (owner_id, heir_id, kind, value, verified, source_url)
    )
    conn.commit()
    return cur.lastrowid
