"""Gate logic: calculate eligibility dates and evaluate owner status."""
import calendar
from datetime import date


def add_months(d: date, months: int) -> date:
    month = d.month - 1 + months
    year = d.year + month // 12
    month = month % 12 + 1
    day = min(d.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


def eligible_after(reported_date: str | None, reported_year: int | None, rules: dict) -> str | None:
    waiting_months = rules["law"]["waiting_months"]
    year_delivery_suffix = rules["law"]["year_only_delivery"]

    base_date = None
    if reported_date:
        base_date = date.fromisoformat(reported_date)
    elif reported_year:
        base_date = date.fromisoformat(f"{reported_year}-{year_delivery_suffix}")
    else:
        return None

    elig_date = add_months(base_date, waiting_months)
    return elig_date.isoformat()


def gate_owner(conn, owner_id: int, today_str: str, rules: dict) -> str:
    today = date.fromisoformat(today_str)
    
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM owners WHERE id = ?", (owner_id,))
    owner = cursor.fetchone()
    if not owner:
        raise ValueError(f"Owner {owner_id} not found")

    cursor.execute("SELECT * FROM properties WHERE owner_id = ?", (owner_id,))
    properties = cursor.fetchall()

    # Update eligible_after for each property
    unknown_date = False
    all_too_new = True
    
    for prop in properties:
        elig = eligible_after(prop["reported_date"], prop["reported_year"], rules)
        if elig is None:
            unknown_date = True
            all_too_new = False
        else:
            cursor.execute(
                "UPDATE properties SET eligible_after = ? WHERE id = ?",
                (elig, prop["id"])
            )
            if date.fromisoformat(elig) <= today:
                all_too_new = False

    conn.commit()

    # Determine new status
    old_status = owner["status"]
    new_status = "gated"
    drop_reason = None
    history_reason = None

    single_floor = rules["floors"]["single_claim_min_cents"]

    if unknown_date:
        new_status = "hold"
        history_reason = "unknown_date"
    elif len(properties) == 1:
        p = properties[0]
        max_c = p["amount_max_cents"]
        min_c = p["amount_min_cents"]
        is_below = False
        if (max_c is not None and max_c < single_floor) or \
           (min_c is not None and min_c < single_floor and max_c is not None and max_c < single_floor) or \
           (max_c is not None and max_c <= 10000):
            is_below = True

        if is_below:
            new_status = "dropped"
            drop_reason = "single_below_floor"
            history_reason = "single_below_floor"
        elif all_too_new:
            new_status = "dropped"
            drop_reason = "under_waiting_period"
            history_reason = "under_waiting_period"
    else:
        if all_too_new:
            new_status = "dropped"
            drop_reason = "under_waiting_period"
            history_reason = "under_waiting_period"
        else:
            new_status = "gated"

    if new_status != old_status or owner["drop_reason"] != drop_reason:
        cursor.execute(
            """
            UPDATE owners
            SET status = ?, drop_reason = ?, updated_at = date('now')
            WHERE id = ?
            """,
            (new_status, drop_reason, owner_id)
        )
        cursor.execute(
            """
            INSERT INTO status_history (owner_id, old_status, new_status, reason)
            VALUES (?, ?, ?, ?)
            """,
            (owner_id, old_status, new_status, history_reason)
        )
        conn.commit()

    return new_status
