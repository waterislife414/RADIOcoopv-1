import sqlite3

import pytest

from uprec.config import load_rules
from uprec.db import connect, init_db


def test_schema_loads_and_tables_exist():
    conn = connect(":memory:")
    init_db(conn)
    names = {r["name"] for r in conn.execute("select name from sqlite_master where type='table'")}
    assert {"owners", "properties", "research_log", "contacts", "heirs",
            "outreach", "agreements", "status_history"} <= names


def test_fee_cap_enforced_by_schema():
    conn = connect(":memory:")
    init_db(conn)
    conn.execute("insert into owners(name) values ('Test Owner')")
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute("insert into agreements(owner_id, fee_pct) values (1, 15)")


def test_rules_have_legal_constants():
    r = load_rules()
    assert r["law"]["waiting_months"] == 24
    assert r["law"]["fee_cap_pct"] == 10
    assert r["floors"]["single_claim_min_cents"] == 10001
