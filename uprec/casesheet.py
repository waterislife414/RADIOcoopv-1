import sqlite3

from uprec import queries


def render_case_sheet(conn: sqlite3.Connection, owner_id: int, rules: dict, today: str) -> str:
    owner = conn.execute("SELECT * FROM owners WHERE id = ?", (owner_id,)).fetchone()
    if not owner:
        return f"# Case Sheet: Owner {owner_id} Not Found"

    props = conn.execute("SELECT * FROM properties WHERE owner_id = ?", (owner_id,)).fetchall()
    logs = conn.execute("SELECT * FROM research_log WHERE owner_id = ?", (owner_id,)).fetchall()
    heirs = conn.execute("SELECT * FROM heirs WHERE owner_id = ?", (owner_id,)).fetchall()
    contacts = conn.execute("SELECT * FROM contacts WHERE owner_id = ?", (owner_id,)).fetchall()

    lines = []
    lines.append(f"# Case Sheet: {owner['name']} (ID: {owner['id']})")
    lines.append("")
    lines.append("## Overview")
    lines.append(f"- **Kind**: {owner['kind']}")
    lines.append(f"- **Tier**: {owner['tier']}")
    lines.append(f"- **Status**: {owner['status']}")
    lines.append(f"- **Life Status**: {owner['life_status']}")
    lines.append(f"- **Business Status**: {owner['business_status']}")
    lines.append(f"- **Address**: {owner['address'] or ''}, {owner['city'] or ''}, {owner['state'] or ''} {owner['zip'] or ''} ({owner['county'] or ''} County)")
    lines.append("")

    lines.append("## Properties")
    if props:
        lines.append("| Holder | Type | Amount Text | Reported | Eligible After | Signal |")
        lines.append("|---|---|---|---|---|---|")
        for p in props:
            reported = p['reported_date'] if p['reported_date'] else (str(p['reported_year']) if p['reported_year'] else '')
            lines.append(f"| {p['holder'] or ''} | {p['property_type'] or ''} | {p['amount_text'] or ''} | {reported} | {p['eligible_after'] or ''} | {p['signal']} |")
    else:
        lines.append("No properties recorded.")
    lines.append("")

    lines.append("## Research Log")
    if logs:
        for l in logs:
            source = f" (Source: {l['source_url'] or l['source_note'] or 'none'})" if (l['source_url'] or l['source_note']) else ""
            lines.append(f"- **{l['fact_key']}**: {l['fact_value']} [{l['confidence']}]{source}")
    else:
        lines.append("No research log entries.")
    lines.append("")

    lines.append("## Heirs")
    if heirs:
        for h in heirs:
            lines.append(f"- {h['name']} ({h['relationship'] or 'unknown relation'})")
    else:
        lines.append("No heirs recorded.")
    lines.append("")

    lines.append("## Contacts")
    if contacts:
        for c in contacts:
            verified = "verified" if c['verified'] else "unverified"
            lines.append(f"- [{c['kind']}] {c['value']} ({verified})")
    else:
        lines.append("No contacts recorded.")
    lines.append("")

    lines.append("## Search These")
    name = owner['name']
    city = owner['city'] or 'Phenix City'
    state = owner['state'] or 'AL'
    county = owner['county']

    if county: # Only add county-specific queries if county is not None or empty
        for q in queries.probate_queries(name, county):
            lines.append(f"- {q}")
        for q in queries.property_record_queries(name, county):
            lines.append(f"- {q}")
    for q in queries.obituary_queries(name, city, state):
        lines.append(f"- {q}")
    for q in queries.sos_business_queries(name):
        lines.append(f"- {q}")
    for q in queries.facebook_queries(name, city):
        lines.append(f"- {q}")
    lines.append("")

    lines.append("## Still Missing Checklist")
    missing = []
    if owner['life_status'] == 'unknown':
        missing.append("- [ ] Life status unknown")
    if not owner['address']:
        missing.append("- [ ] No mailing address")
    if owner['life_status'] == 'deceased' and not heirs:
        missing.append("- [ ] Deceased with no heirs found")
    if owner['kind'] == 'business' and owner['business_status'] == 'unknown':
        missing.append("- [ ] Business status unknown")

    if missing:
        lines.extend(missing)
    else:
        lines.append("None - all key checks present.")

    return "\n".join(lines)
