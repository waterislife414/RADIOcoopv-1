"""Tests for uprec/report module."""
import sqlite3

import pytest

from uprec.db import init_db
from uprec.report import export_csv, ranked_rows


@pytest.fixture
def memory_db():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    init_db(conn)
    yield conn
    conn.close()

def test_ranked_rows_and_export(memory_db, tmp_path):
    # Insert test owner A
    cursor = memory_db.execute(
        "INSERT INTO owners (name, tier, life_status, status) VALUES (?, ?, ?, ?)",
        ("Alice Smith", "A", "alive", "new")
    )
    owner_a_id = cursor.lastrowid
    
    # Insert test owner B
    cursor = memory_db.execute(
        "INSERT INTO owners (name, tier, life_status, status) VALUES (?, ?, ?, ?)",
        ("Bob Jones", "B", "unknown", "new")
    )
    owner_b_id = cursor.lastrowid
    memory_db.commit()

    # Add properties
    memory_db.execute(
        "INSERT INTO properties (owner_id, amount_min_cents, signal) VALUES (?, ?, ?)",
        (owner_a_id, 60000, "high")
    )
    memory_db.execute(
        "INSERT INTO properties (owner_id, amount_min_cents, signal) VALUES (?, ?, ?)",
        (owner_b_id, 20000, "medium")
    )
    memory_db.commit()

    rows = ranked_rows(memory_db)
    assert len(rows) == 2
    assert rows[0]["owner"] == "Alice Smith"
    assert rows[0]["tier"] == "A"
    assert rows[0]["total_min_cents"] == 60000
    assert rows[0]["property_count"] == 1

    assert rows[1]["owner"] == "Bob Jones"
    assert rows[1]["tier"] == "B"
    assert rows[1]["total_min_cents"] == 20000

    # Test CSV export
    csv_path = tmp_path / "report.csv"
    export_csv(rows, csv_path)
    assert csv_path.exists()
    content = csv_path.read_text(encoding="utf-8")
    assert "Alice Smith" in content
    assert "Bob Jones" in content
