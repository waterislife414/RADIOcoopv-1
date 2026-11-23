import sqlite3
from datetime import datetime, date, timedelta


def _parse_date(d_str: str) -> date:
    return datetime.strptime(d_str, "%Y-%m-%d").date()


def log_outreach(
    conn: sqlite3.Connection,
    owner