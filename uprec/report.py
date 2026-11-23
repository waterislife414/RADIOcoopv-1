"""Reporting module for ranked owners and property aggregation."""
import csv
import sqlite3
from pathlib import Path

def ranked_rows(conn: sqlite3.Connection) -> list[dict]:
    """
    Return ranked owners with aggregated property metrics,
    sorted by tier (A, B, C, X, unscored) and then by total_min_cents descending.
    """
    query = """
        SELECT 
            o.id as owner_id,
            o.name as owner,
            o.tier,
            o.life_status,
            o.status,
            COALESCE(SUM(p.amount_min_cents), 0) as total_min_cents,
            COUNT(p.id) as property_count,
            MAX(p.signal) as top_signal
        FROM owners o
        LEFT JOIN properties p ON o.id = p.owner_id
        GROUP BY o.id
    """
    cursor = conn.execute(query)
    rows = [dict(row) for row in cursor.fetchall()]

    # Define tier sort order
    tier_order = {'A': 0, 'B': 1, 'C': 2, 'X': 3, 'unscored': 4}

    def sort_key(r):
        t = r.get('tier', 'unscored')
        t_val = tier_order.get(t, len(tier_order)) # Default to highest value for unknown tiers
        # Sort by tier ascending, then total_min_cents descending
        return (t_val, -r.get('total_min_cents', 0))

    rows.sort(key=sort_key)
    return rows

def export_csv(rows: list[dict], path: str | Path) -> None:
    """Export ranked rows to a CSV file."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    
    fieldnames = ['owner_id', 'owner', 'tier', 'life_status', 'status', 'total_min_cents', 'property_count', 'top_signal']
    with open(path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow({k: row.get(k, '') for k in fieldnames})
