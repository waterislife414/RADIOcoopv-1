def obituary_queries(name: str, city: str, state: str) -> list[str]:
    """Return a list of Google-style search queries for an obituary."""
    return [
        f'"{name}" obituary {city} {state}',
        f'"{name}" passed away {city} {state}',
        f'"{name}" funeral {city} {state}',
    ]

def probate_queries(name: str, county: str) -> list[str]:
    """Return a list of Google-style search queries for probate records."""
    return [
        f'"{name}" probate {county} county AL estate',
        f'"{name}" will court {county} county AL',
    ]

def sos_business_queries(name: str) -> list[str]:
    """Return a list of Google-style search queries for Alabama SOS business records."""
    return [
        f'site:sos.alabama.gov "{name}"',
        f'"{name}" Alabama Secretary of State business',
    ]

def property_record_queries(name: str, county: str) -> list[str]:
    """Return a list of Google-style search queries for property/deed records."""
    return [
        f'"{name}" property records {county} county AL tax assessor',
        f'"{name}" deed {county} county Alabama',
    ]

def facebook_queries(name: str, city: str) -> list[str]:
    """Return a list of Google-style search queries for Facebook profiles."""
    return [
        f'site:facebook.com "{name}" {city}',
        f'site:facebook.com "{name}" Alabama',
    ]
