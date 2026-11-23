import sqlite3

import pytest

from uprec.casesheet import render_case_sheet
from uprec.db import init_db


@pytest.fixture
def db_conn():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    init_db(conn)
    return conn


def test_render_case_sheet(db_conn):
    db_conn.execute(
        "INSERT INTO owners (id, kind, name, city, state, county, life_status, business_status, tier, status) "
        "VALUES (1, 'person', 'John Doe', 'Phenix City', 'AL', 'Russell', 'unknown', 'n/a', 'A', 'new')"
    )
    db_conn.execute(
        "INSERT INTO properties (owner_id, holder, property_type, amount_text, reported_date, eligible_after, signal) "
        "VALUES (1, 'Bank of America', 'Savings', 'over $100', '2023-01-01', '2025-01-01', 'high')"
    )
    db_conn.execute(
        "INSERT INTO research_log (owner_id, fact_key, fact_value, source_url, confidence) "
        "VALUES (1, 'life_status', 'deceased', 'http://example.com/obituary', 'medium')"
    )
    db_conn.execute(
        "INSERT INTO heirs (owner_id, name, relationship) "
        "VALUES (1, 'Jane Doe', 'Spouse')"
    )
    db_conn.execute(
        "INSERT INTO contacts (owner_id, kind, value, verified) "
        "VALUES (1, 'mail', '123 Main St', 1)"
    )
    db_conn.commit()

    rules = {} # Rules are not used for query generation or checklist in the current implementation
    sheet = render_case_sheet(db_conn, 1, rules, "2026-06-01")
    assert "# Case Sheet: John Doe (ID: 1)" in sheet
    assert "## Overview" in sheet
    assert "- **Kind**: person" in sheet
    assert "- **Tier**: A" in sheet
    assert "- **Life Status**: deceased" in sheet
    assert "- **Address**: 123 Main St, Phenix City, AL 36867 (Russell County)" in sheet

    assert "## Properties" in sheet
    assert "| Holder | Type | Amount Text | Reported | Eligible After | Signal |" in sheet
    assert "| Bank of America | Savings | over $100 | 2023-01-01 | 2025-01-01 | high |" in sheet

    assert "## Research Log" in sheet
    assert "- **life_status**: deceased [medium] (Source: http://example.com/obituary)" in sheet

    assert "## Heirs" in sheet
    assert "- Jane Doe (Spouse)" in sheet

    assert "## Contacts" in sheet
    assert "- [mail] 123 Main St (verified)" in sheet

    assert "## Search These" in sheet
    assert '- "John Doe" probate Russell county AL estate' in sheet
    assert '- "John Doe" obituary Phenix City AL' in sheet
    assert '- site:facebook.com "John Doe" Phenix City' in sheet

    assert "## Still Missing Checklist" in sheet
    assert "None - all key checks present." not in sheet # Since we added address and heirs
    assert "- [ ] Life status unknown" not in sheet # Because life status is 'deceased'
    assert "- [ ] No mailing address" not in sheet # Because address is present
    assert "- [ ] Deceased with no heirs found" not in sheet # Because heirs are found
    assert "- [ ] Business status unknown" not in sheet # Because kind is 'person'

    # Test missing address and unknown life status
    db_conn.execute(
        "UPDATE owners SET address = NULL, life_status = 'unknown' WHERE id = 1"
    )
    db_conn.execute("DELETE FROM heirs WHERE owner_id = 1") # Remove heirs to test deceased_no_heir_found
    db_conn.commit()
    sheet_missing = render_case_sheet(db_conn, 1, rules, "2026-06-01")
    assert "- [ ] Life status unknown" in sheet_missing
    assert "- [ ] No mailing address" in sheet_missing
    assert "- [ ] Deceased with no heirs found" in sheet_missing # Now that heirs are deleted and life_status is deceased. Re-setting the owner status to deceased again
    db_conn.execute("UPDATE owners SET life_status = 'deceased' WHERE id = 1")
    db_conn.commit()
    sheet_missing_deceased = render_case_sheet(db_conn, 1, rules, "2026-06-01")
    assert "- [ ] Deceased with no heirs found" in sheet_missing_deceased

    # Test business status unknown for business kind
    db_conn.execute(
        "UPDATE owners SET kind = 'business', business_status = 'unknown', life_status = 'n/a' WHERE id = 1"
    )
    db_conn.commit()
    sheet_business = render_case_sheet(db_conn, 1, rules, "2026-06-01")
    assert "- [ ] Business status unknown" in sheet_business

    # Test no county for search queries
    db_conn.execute(
        "UPDATE owners SET county = NULL WHERE id = 1"
    )
    db_conn.commit()
    sheet_no_county = render_case_sheet(db_conn, 1, rules, "2026-06-01")
    assert '- "John Doe" probate Russell county AL estate' not in sheet_no_county
    assert '- "John Doe" will court Russell county AL' not in sheet_no_county
    assert '- "John Doe" property records Russell county AL tax assessor' not in sheet_no_county
    assert '- "John Doe" deed Russell county Alabama' not in sheet_no_county
    assert '- "John Doe" obituary Phenix City AL' in sheet_no_county # Still present
