import sqlite3


def outreach_blockers(conn: sqlite3.Connection, owner_id: int, today_str: str, rules: dict) -> list[str]:
    blockers = []
    cur = conn.cursor()

    cur.execute("SELECT kind, life_status, business_status, tier, status FROM owners WHERE id = ?", (owner_id,))
    row = cur.fetchone()
    if not row:
        return ["owner not found"]

    kind, life_status, business_status, tier, status = row

    if status == 'dropped':
        blockers.append('status dropped')
    elif status == 'hold':
        blockers.append('status hold')

    if tier == 'X':
        blockers.append('tier X')

    cur.execute("SELECT eligible_after FROM properties WHERE owner_id = ?", (owner_id,))
    props = cur.fetchall()
    has_past_waiting = False
    for (ea,) in props:
        if ea and ea < today_str:
            has_past_waiting = True
            break
    if not has_past_waiting:
        blockers.append('no property past waiting period')

    if kind == 'person' and life_status == 'unknown':
        blockers.append('life status unknown')

    if life_status == 'deceased':
        cur.execute("SELECT COUNT(*) FROM heirs WHERE owner_id = ?", (owner_id,))
        heir_count = cur.fetchone()[0]
        if heir_count == 0:
            blockers.append('deceased: no heir')

    if kind == 'business':
        if business_status == 'unknown':
            blockers.append('business status unknown')
        elif business_status == 'dissolved':
            # Check for contacts tied to the owner or heirs of the owner
            cur.execute(
                """
                SELECT COUNT(*) FROM contacts
                WHERE owner_id = ? OR heir_id IN (SELECT id FROM heirs WHERE owner_id = ?)
                """,
                (owner_id, owner_id)
            )
            contact_count = cur.fetchone()[0]
            if contact_count == 0:
                blockers.append('business dissolved: no heir/officer contact')

    cur.execute(
        """
        SELECT COUNT(*) FROM contacts
        WHERE kind = 'mail' AND (owner_id = ? OR heir_id IN (SELECT id FROM heirs WHERE owner_id = ?))
        """,
        (owner_id, owner_id)
    )
    mail_count = cur.fetchone()[0]
    if mail_count == 0:
        blockers.append('no mailing address')

    return blockers


def is_outreach_ready(conn: sqlite3.Connection, owner_id: int, today_str: str, rules: dict) -> bool:
    return len(outreach_blockers(conn, owner_id, today_str, rules)) == 0
