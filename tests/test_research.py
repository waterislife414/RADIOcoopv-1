import sqlite3
import pytest
from uprec.db import connect, init_db
from uprec.research import record_fact, add_heir, add_contact

@pytest.fixture
def db():
    conn = connect(":memory:")
    init_db(conn)
    # Insert a test owner
    cur = conn.cursor()
    cur.execute("INSERT INTO owners (id, name, status) VALUES (1, 'Test Owner', 'new')")
    conn.commit()
    yield conn
    conn.close()

def test_record_fact_validation(db):
    with pytest.raises(ValueError):
        record_fact(db, 1, 'life_status', 'alive') # No source

    with pytest.raises(ValueError):
        record_fact(db, 1, 'life_status', 'alive', source_note='Obituary', confidence='invalid')

def test_record_fact_side_effects(db):
    fact_id = record_fact(db, 1, 'life_status', 'alive', source_note='Obituary', confidence='medium')
    assert fact_id is not None

    cur = db.cursor()
    cur.execute("SELECT status, life_status FROM owners WHERE id = 1")
    row = cur.fetchone()
    assert row['status'] == 'researching'
    assert row['life_status'] == 'alive'

    cur.execute("SELECT * FROM status_history WHERE owner_id = 1")
    assert len(cur.fetchall()) == 1

def test_mailing_address_fact(db):
    record_fact(db, 1, 'mailing_address', '123 Main St', source_url='http://example.com', confidence='high')
    cur = db.cursor()
    cur.execute("SELECT * FROM contacts WHERE owner_id = 1 AND kind = 'mail'")
    contact = cur.fetchone()
    assert contact is not None
    assert contact['value'] == '123 Main St'
    assert contact['verified'] == 1

def test_add_heir(db):
    with pytest.raises(ValueError):
        add_heir(db, 1, 'John Doe', 'Son')

    heir_id = add_heir(db, 1, 'John Doe', 'Son', notes='Obituary mention')
    assert heir_id is not None

    cur = db.cursor()
    cur.execute("SELECT * FROM heirs WHERE id = ?", (heir_id,))
    assert cur.fetchone() is not None

def test_add_contact(db):
    with pytest.raises(ValueError):
        add_contact(db, 1, 'invalid_kind', 'foo@bar.com')

    contact_id = add_contact(db, 1, 'email', 'foo@bar.com', verified=0)
    assert contact_id is not None
