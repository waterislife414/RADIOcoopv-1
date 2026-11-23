"""Portal header mapping to canonical fields."""
from pathlib import Path
import re

import yaml

COLUMNS_PATH = Path(__file__).resolve().parent.parent / "config" / "portal_columns.yaml"


def load_column_map(path=None) -> dict:
    p = Path(path) if path else COLUMNS_PATH
    if not p.exists():
        return {}
    with open(p, encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def norm_header(h: str) -> str:
    if not h:
        return ""
    # lowercase, strip, drop punctuation, collapse spaces
    h_lower = h.lower().strip()
    h_clean = re.sub(r"[^\w\s]", "", h_lower)
    return re.sub(r"\s+", " ", h_clean)


def build_header_map(headers: list[str], colmap: dict) -> dict:
    canonical_dict = colmap.get("canonical", {})
    mapping = {}
    for h in headers:
        nh = norm_header(h)
        matched_canonical = None
        for canonical_key, aliases in canonical_dict.items():
            for alias in aliases:
                if norm_header(alias) == nh:
                    matched_canonical = canonical_key
                    break
            if matched_canonical:
                break
        if matched_canonical:
            mapping[h] = matched_canonical
    return mapping


def map_row(row: dict, header_map: dict, colmap: dict) -> dict:
    canonical_dict = colmap.get("canonical", {})
    all_keys = list(canonical_dict.keys())
    result = {k: "" for k in all_keys}

    for raw_header, val in row.items():
        if raw_header in header_map:
            ck = header_map[raw_header]
            result[ck] = str(val).strip() if val is not None else ""

    # Name join logic if owner_name is empty but first/last present
    name_join = colmap.get("name_join", {})
    if not result.get("owner_name") and (result.get("first_name") or result.get("last_name")):
        first = result.get("first_name", "")
        last = result.get("last_name", "")
        order = name_join.get("order", "last_first")
        if order == "last_first":
            combined = f"{last} {first}".strip().upper()
        else:
            combined = f"{first} {last}".strip().upper()
        result["owner_name"] = combined

    return result
