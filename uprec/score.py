import re
import sqlite3

def matches_any_signal(text: str, regex_list: list[str]) -> bool:
    if not text:
        return False
    for pattern in regex_list:
        if re.search(pattern, text):
            return True
    return False

def score_owner(conn: sqlite3.Connection, owner_id: int, rules: dict) -> str:
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM properties WHERE owner_id = ?", (owner_id,))
    properties = cursor.fetchall()

    if not properties:
        cursor.execute("UPDATE owners SET tier = 'X' WHERE id = ?", (owner_id,))
        conn.commit()
        return 'X'

    tier_rules = rules.get('tiers', {})
    signals = rules.get('signal', {})
    high_patterns = signals.get('high', [])

    tier_a = tier_rules.get('A', {})
    tier_b = tier_rules.get('B', {})
    tier_c = tier_rules.get('C', {})
    floors = rules.get('floors', {})
    single_claim_min = floors.get('single_claim_min_cents', 10001)

    total_min_cents = 0
    high_signal_count = 0
    property_count = len(properties)
    has_unknown_single_over_floor = False

    for prop in properties:
        min_cents = prop['amount_min_cents'] or 0
        total_min_cents += min_cents

        signal_type = prop['signal']
        prop_text = f"{prop['holder'] or ''} {prop['property_type'] or ''} {prop['amount_text'] or ''}"
        is_high = signal_type == 'high' or matches_any_signal(prop_text, high_patterns)
        if is_high:
            high_signal_count += 1

        if property_count == 1 and prop['amount_min_cents'] is not None and prop['amount_min_cents'] >= single_claim_min and prop['amount_max_cents'] is None:
            has_unknown_single_over_floor = True

    # Tier A check
    a_known_min = tier_a.get('known_min_cents', 50000)
    a_high_min = tier_a.get('high_signal_min_cents', 10001)
    
    is_tier_a = (
        total_min_cents >= a_known_min
        or (tier_a.get('multi_claim_with_high_signal', True) and property_count >= 2 and high_signal_count > 0)
        or (high_signal_count > 0 and any((p['amount_min_cents'] or 0) >= a_high_min for p in properties if (p['signal'] == 'high' or matches_any_signal(f"{p['holder'] or ''} {p['property_type'] or ''}", high_patterns))))
    )

    if is_tier_a:
        tier = 'A'
    else:
        # Tier B check
        b_known_min = tier_b.get('known_min_cents', 10001)
        b_multi_min = tier_b.get('multi_claim_min_total_cents', 10001)

        is_tier_b = (
            total_min_cents >= b_known_min
            or (property_count >= 2 and total_min_cents >= b_multi_min)
        )

        if is_tier_b:
            tier = 'B'
        else:
            # Tier C check
            if tier_c.get('hold_unknown_single_over_floor', True) and has_unknown_single_over_floor:
                tier = 'C'
            else:
                tier = 'X'

    cursor.execute("UPDATE owners SET tier = ? WHERE id = ?", (tier, owner_id))
    conn.commit()
    return tier
