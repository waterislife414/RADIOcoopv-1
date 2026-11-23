"""CSV Ingestion, amount parsing, and signal classification."""
import csv
from pathlib import Path
import re
import sqlite3

def parse_amount(text: str, rules: dict) -> tuple[int | None, int | None]:
    if not text:
        return None, None
    buckets = rules.get("amount_buckets", [])
    for b in buckets:
        pattern = b["pattern"]
        kind = b["kind"]
        m = re.search(pattern, text)
        if m:
            val_str = m.group(1).replace(",", "")
            try:
                # convert float/int dollars to cents
                dollars = float(val_str)
                cents = round(dollars * 100)
            except ValueError:
                return None, None

            if kind == "upper":
                return None, cents
            elif kind == "lower":
                return cents, None
            elif kind == "exact":
                return cents, cents
    return None, None


def classify_signal(holder: str, property_type: str, rules: dict) -> str:
    combined = f"{holder or ''} {property_type or ''}"
    signals = rules.get("signals", {})
    
    for level in ["high", "medium", "low"]:
        patterns = signals.get(level, [])
        for pat in patterns:
            if re.search(pat, combined):
                return level
    return "none"


def ingest_csv(conn: sqlite3.Connection, path: str | Path, rules: dict) -> int:
    path = Path(path)
    if not path.exists():
        return 0

    count = 0
    with open(path, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            owner_name = row.get("owner_name", "").strip()
            address = row.get("address", "").strip()
            city = row.get("city", "").strip()
            state = row.get("state", "").strip()
            zip_code = row.get("zip", "").strip()
            holder = row.get("holder", "").strip()
            prop_type = row.get("property_type", "").strip()
            amount_text = row.get("amount", "").strip()
            reported_str = row.get("reported", "").strip()
            portal_prop_id = row.get("property_id", "").strip()

            # Determine kind
            biz_pattern = r"(?i)\b(LLC|INC|CORP|CO|LTD|LP|CHURCH|TRUST)\b"
            if re.search(biz_pattern, owner_name):
                kind = "business"
            else:
                kind = "person"

            # Find or insert owner by name + zip
            cur = conn.execute(
                "SELECT id FROM owners WHERE name = ? AND (zip = ? OR (zip IS NULL AND ? = ''))",
                (owner_name, zip_code, zip_code)
            )
            owner_row = cur.fetchone()
            if owner_row:
                owner_id = owner_row["id"]
            else:
                cur = conn.execute(
                    """INSERT INTO owners (kind, name, address, city, state, zip)
                       VALUES (?, ?, ?, ?, ?, ?)""",
                    (kind, owner_name, address, city, state, zip_code)
                )
                owner_id = cur.lastrowid

            min_cents, max_cents = parse_amount(amount_text, rules)
            signal = classify_signal(holder, prop_type, rules)

            reported_year = None
            reported_date = None
            if reported_str:
                if len(reported_str) == 4 and reported_str.isdigit():
                    reported_year = int(reported_str)
                else:
                    reported_date = reported_str

            conn.execute(
                """INSERT INTO properties (
                       owner_id, portal_property_id, holder, property_type,
                       amount_text, amount_min_cents, amount_max_cents,
                       reported_date, reported_year, signal
                   ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT(owner_id, portal_property_id) DO UPDATE SET
                       holder=excluded.holder,
                       property_type=excluded.property_type,
                       amount_text=excluded.amount_text,
                       amount_min_cents=excluded.amount_min_cents,
                       amount_max_cents=excluded.amount_max_cents,
                       reported_date=excluded.reported_date,
                       reported_year=excluded.reported_year,
                       signal=excluded.signal
                """,
                (
                    owner_id, portal_prop_id, holder, prop_type,
                    amount_text, min_cents, max_cents,
                    reported_date, reported_year, signal
                )
            )
            count += 1
    conn.commit()
    return count
