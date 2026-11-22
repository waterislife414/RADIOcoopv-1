"""Loads config/rules.yaml. Manager-owned foundation."""
from pathlib import Path

import yaml

RULES_PATH = Path(__file__).resolve().parent.parent / "config" / "rules.yaml"


def load_rules(path=RULES_PATH) -> dict:
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f)
