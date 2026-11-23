"""Command line for the whole pipeline.  python -m uprec.cli <command> -h
Real data lives in data/ (gitignored). Nothing here touches the network."""
import argparse
import sys
import time
from datetime import date
from pathlib import Path

import yaml

from uprec import db as dbm
from uprec.casesheet import render_case_sheet
from uprec.config import load_rules
from uprec.gate import gate_owner
from uprec.ingest import ingest_csv
from uprec.letters import render_letter
from uprec.readiness import outreach_blockers
from uprec.report import export_csv, ranked_rows
from uprec.research import add_contact, add_heir, record_fact
from uprec.score import score_owner
from uprec.work_queue import next_cases

ROOT = Path(__file__).resolve().parent.parent
BUSINESS_PATHS = [ROOT / "data" / "business.yaml", ROOT / "config" / "business.yaml"]
TEMPLATES = ROOT / "templates"
def _today() -> str:
    return time.strftime("%Y-%m-%d")


WATERMARK = "*** DRAFT - NOT FOR SIGNATURE OR MAILING ***\n\n"


def load_business() -> dict:
    for p in BUSINESS_PATHS:
        if p.exists():
            return yaml.safe_load(p.read_text(encoding="utf-8"))
    raise FileNotFoundError("config/business.yaml not found")


def unfilled(cfg: dict, prefix: str = "") -> list[str]:
    """Names of settings that still say TODO or VERIFY."""
    bad = []
    for k, v in cfg.items():
        if isinstance(v, dict):
            bad += unfilled(v, f"{prefix}{k}.")
        elif isinstance(v, str) and ("TODO" in v or "VERIFY" in v):
            bad.append(f"{prefix}{k}")
    return bad


def _owner(conn, owner_id):
    row = conn.execute("SELECT * FROM owners WHERE id = ?", (owner_id,)).fetchone()
    if row is None:
        raise SystemExit(f"no owner with id {owner_id}")
    return row


def _eligible_props(conn, owner_id, today):
    rows = conn.execute(
        "SELECT * FROM properties WHERE owner_id = ? AND eligible_after IS NOT NULL AND eligible_after < ?",
        (owner_id, today),
    ).fetchall()
    return [dict(r) for r in rows]


def _context(conn, owner, props, biz, today, heir=None):
    mail = conn.execute(
        "SELECT value FROM contacts WHERE owner_id = ? AND kind = 'mail' AND "
        + ("heir_id = ?" if heir else "heir_id IS NULL")
        + " ORDER BY verified DESC, id LIMIT 1",
        (owner["id"], heir["id"]) if heir else (owner["id"],),
    ).fetchone()
    fin, tre = biz["finder"], biz["treasury"]
    return {
        "date": date.fromisoformat(today).strftime("%B %-d, %Y"),
        "owner_name": heir["name"] if heir else owner["name"],
        "deceased_name": owner["name"],
        "deceased_name_line": owner["name"] if heir else "the Owner",
        "capacity": f"heir/beneficiary of {owner['name']} ({heir['relationship'] or 'relationship to confirm'})"
        if heir else "owner",
        "address": mail["value"] if mail else "",
        "finder_name": fin["name"], "finder_address": fin["address"], "finder_phone": fin["phone"],
        "finder_email": fin["email"], "sign_off": fin["sign_off"],
        "treasury_office": tre["office_name"], "treasury_website": tre["website"], "treasury_phone": tre["phone"],
        "fee_pct": biz["fee_pct"], "fee_due_days": biz["fee_due_days"],
        "eligible_after": max((p["eligible_after"] for p in props), default=""),
    }


def _render(conn, args, template_name, need_review):
    biz = load_business()
    if float(biz["fee_pct"]) > 10:
        raise SystemExit("fee_pct may never exceed 10")
    blockers = []
    bad = unfilled(biz)
    if bad:
        blockers.append("fill in: " + ", ".join(bad))
    if need_review and not biz.get("attorney_reviewed"):
        blockers.append("agreement template has not been attorney reviewed (attorney_reviewed: false)")
    owner = _owner(conn, args.owner_id)
    today = args.today or _today()
    heir = None
    if args.heir:
        heir = conn.execute("SELECT * FROM heirs WHERE id = ? AND owner_id = ?", (args.heir, owner["id"])).fetchone()
        if heir is None:
            raise SystemExit("no such heir for that owner")
    props = _eligible_props(conn, owner["id"], today)
    if not props:
        blockers.append("no property past the 24-month waiting period")
    ctx = _context(conn, owner, props, biz, today, heir)
    if not ctx["address"]:
        blockers.append("no researched mailing address on file")
    if blockers and not args.draft:
        print("REFUSING to render:\n- " + "\n- ".join(blockers) + "\n(use --draft to preview with a watermark)")
        return 1
    template = TEMPLATES / template_name
    text = render_letter(template.read_text(encoding="utf-8"), ctx, props)
    print((WATERMARK if blockers else "") + text)
    return 0


def cmd_init(conn, args, rules):
    dbm.init_db(conn)
    print("database ready")


def cmd_ingest(conn, args, rules):
    dbm.init_db(conn)
    print(f"ingested {ingest_csv(conn, args.csv, rules)} rows")


def cmd_gate(conn, args, rules):
    today = args.today or _today()
    ids = [r["id"] for r in conn.execute("SELECT id FROM owners WHERE status IN ('new','gated','hold')")]
    for oid in ids:
        gate_owner(conn, oid, today, rules)
        row = conn.execute("SELECT status FROM owners WHERE id = ?", (oid,)).fetchone()
        if row["status"] == "gated":
            score_owner(conn, oid, rules)
    conn.commit()
    for r in conn.execute("SELECT status, tier, COUNT(*) n FROM owners GROUP BY status, tier ORDER BY status, tier"):
        print(f"{r['status']:12} tier {r['tier']:9} {r['n']}")


def cmd_queue(conn, args, rules):
    for c in next_cases(conn, args.limit):
        print(f"#{c['owner_id']} tier {c['tier']} ${c['total_min_cents'] / 100:,.0f}+ x{c['property_count']} "
              f"{c['name']}  missing: {', '.join(c['missing']) or 'nothing'}")


def cmd_show(conn, args, rules):
    print(render_case_sheet(conn, args.owner_id, rules, args.today or _today()))


def cmd_record(conn, args, rules):
    record_fact(conn, args.owner_id, args.key, args.value, args.source, args.note, args.confidence)
    conn.commit()
    print("recorded")


def cmd_heir(conn, args, rules):
    print("heir id", add_heir(conn, args.owner_id, args.name, args.relationship, args.source, args.notes))
    conn.commit()


def cmd_contact(conn, args, rules):
    print("contact id", add_contact(conn, args.owner_id, args.kind, args.value, int(args.verified), args.source,
                                    args.heir))
    conn.commit()


def cmd_ready(conn, args, rules):
    b = outreach_blockers(conn, args.owner_id, args.today or _today(), rules)
    print("READY" if not b else "NOT READY:\n- " + "\n- ".join(b))


def cmd_letter(conn, args, rules):
    return _render(conn, args, "letter_heir.txt" if args.heir else "letter_first_contact.txt", False)


def cmd_agreement(conn, args, rules):
    return _render(conn, args, "agreement_alabama.txt", True)


def cmd_outreach(conn, args, rules):
    from uprec.followups import log_outreach
    oid = log_outreach(conn, args.owner_id, args.channel, args.on or _today(), rules=rules)
    conn.commit()
    print("outreach id", oid)


def cmd_followups(conn, args, rules):
    from uprec.followups import close_exhausted, due_followups
    today = args.today or _today()
    closed = close_exhausted(conn, today, rules)
    conn.commit()
    for d in due_followups(conn, today, rules):
        print(f"#{d['owner_id']} {d['name']} via {d['channel']} sent {d['sent_on']} due {d['follow_up_on']} "
              f"(attempt {d['attempts']})")
    if closed:
        print("closed with no response:", closed)


def cmd_report(conn, args, rules):
    rows = ranked_rows(conn)
    export_csv(rows, args.path)
    print(f"wrote {len(rows)} rows to {args.path}")


def build_parser():
    p = argparse.ArgumentParser(prog="uprec")
    p.add_argument("--db", default=str(dbm.DEFAULT_DB))
    p.add_argument("--today", help="override today's date (YYYY-MM-DD)")
    sub = p.add_subparsers(dest="cmd", required=True)

    def add(name, fn, *a):
        sp = sub.add_parser(name)
        for spec, kw in a:
            sp.add_argument(*spec, **kw)
        sp.set_defaults(fn=fn)

    oid = (("owner_id",), {"type": int})
    add("init", cmd_init)
    add("ingest", cmd_ingest, (("csv",), {}))
    add("gate", cmd_gate)
    add("queue", cmd_queue, (("--limit",), {"type": int, "default": 10}))
    add("show", cmd_show, oid)
    add("record", cmd_record, oid, (("key",), {}), (("value",), {}), (("--source",), {}), (("--note",), {}),
        (("--confidence",), {"default": "low"}))
    add("heir", cmd_heir, oid, (("name",), {}), (("--relationship",), {}), (("--source",), {}), (("--notes",), {}))
    add("contact", cmd_contact, oid, (("kind",), {}), (("value",), {}), (("--verified",), {"default": 0}),
        (("--source",), {}), (("--heir",), {"type": int}))
    add("ready", cmd_ready, oid)
    add("letter", cmd_letter, oid, (("--heir",), {"type": int}), (("--draft",), {"action": "store_true"}))
    add("agreement", cmd_agreement, oid, (("--heir",), {"type": int}), (("--draft",), {"action": "store_true"}))
    add("outreach", cmd_outreach, oid, (("channel",), {}), (("--on",), {}))
    add("followups", cmd_followups)
    add("report", cmd_report, (("path",), {}))
    return p


def main(argv=None) -> int:
    args = build_parser().parse_args(argv)
    conn = dbm.connect(args.db)
    try:
        return args.fn(conn, args, load_rules()) or 0
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
