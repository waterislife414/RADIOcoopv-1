from uprec.queries import (
    obituary_queries,
    probate_queries,
    sos_business_queries,
    property_record_queries,
    facebook_queries,
)

def test_obituary_queries():
    queries = obituary_queries("John Doe", "Phenix City", "AL")
    assert isinstance(queries, list)
    assert len(queries) > 0
    assert any("John Doe" in q for q in queries)
    assert any("Phenix City" in q for q in queries)

def test_probate_queries():
    queries = probate_queries("Jane Smith", "Russell")
    assert isinstance(queries, list)
    assert len(queries) > 0
    assert any("Jane Smith" in q for q in queries)
    assert any("Russell" in q for q in queries)

def test_sos_business_queries():
    queries = sos_business_queries("Acme Corp")
    assert isinstance(queries, list)
    assert len(queries) > 0
    assert any("Acme Corp" in q for q in queries)

def test_property_record_queries():
    queries = property_record_queries("John Doe", "Lee")
    assert isinstance(queries, list)
    assert len(queries) > 0
    assert any("John Doe" in q for q in queries)
    assert any("Lee" in q for q in queries)

def test_facebook_queries():
    queries = facebook_queries("John Doe", "Phenix City")
    assert isinstance(queries, list)
    assert len(queries) > 0
    assert any("facebook.com" in q for q in queries)
    assert any("John Doe" in q for q in queries)
