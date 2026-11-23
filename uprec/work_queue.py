import sqlite3


def next_cases(conn: sqlite3.Connection, limit: int = 10) -> list[dict]:
    """
    Return next cases to research: owners with status in ('gated', 'researching')
    and tier in ('A', 'B'), ordered A before B, then total_min_cents desc, then owner_id.
    Computed missing fields: 'life status', 'business status', 'mailing address', 'heirs' (if deceased).
    """
    query = """
    SELECT 
        o.id as owner_id,
        o.name,
        o.tier,
        o.status,
        o.kind,
        o.life_status,
        o.business_status,
        o.address,
        COALESCE(SUM(p.amount_min_cents), 0) as total_min_cents,
        COUNT(p.id) as property_count,
        (SELECT COUNT(*) FROM heirs h WHERE h.owner_id = o.id) as heir_count
    FROM owners o
    LEFT JOIN properties p ON p.owner_id = o.id
    WHERE o.status IN ('gated', 'researching')
      AND o.tier IN ('A', 'B')
    GROUP BY o.id
    ORDER BY 
        CASE o.tier WHEN 'A' THEN 1 WHEN 'B' THEN 2 ELSE 3 END ASC,
        total_min_cents DESC,
        o.id ASC
    LIMIT ?
    """
    cursor = conn.execute(query, (limit,))
    rows = cursor.fetchall()
    
    results = []
    for row in rows:
        missing = []
        # Check life status
        if row["life_status"] in ('unknown',):
            missing.append('life status')
        
        # Check business status if kind is business or unknown
        if row["kind"] in ('business', 'unknown') and row["business_status"] in ('unknown',):
            missing.append('business status')
            
        # Check mailing address
        if not row["address"]:
            missing.append('mailing address')
            
        # Check heirs if deceased
        if row["life_status"] == 'deceased' and row["heir_count"] == 0:
            missing.append('heirs')
            
        results.append({
            "owner_id": row["owner_id"],
            "name": row["name"],
            "tier": row["tier"],
            "status": row["status"],
            "total_min_cents": row["total_min_cents"],
            "property_count": row["property_count"],
            "missing": missing
        })
        
    return results
