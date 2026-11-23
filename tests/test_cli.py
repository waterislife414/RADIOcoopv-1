from pathlib import Path

from uprec import cli

FIX = str(Path(__file__).resolve().parent.parent / "fixtures" / "synthetic_owners.csv")


def run(db, *argv):
    return cli.main(["--db", str(db), "--today", "2026-11-22", *argv])


def test_pipeline_end_to_end(tmp_path, capsys):
    db = tmp_path / "t.db"
    assert run(db, "init") == 0
    assert run(db, "ingest", FIX) == 0
    assert run(db, "gate") == 0
    capsys.readouterr()
    assert run(db, "queue") == 0
    out = capsys.readouterr().out
    assert "ZZ TESTPERSON ALPHA" in out and "tier A" in out
    assert "ZZ TESTPERSON BRAVO" not in out  # dropped (single claim under floor)
    assert run(db, "ready", "1") == 0
    assert "NOT READY" in capsys.readouterr().out


def test_letter_refuses_until_ready_then_draft_watermarks(tmp_path, capsys):
    db = tmp_path / "t.db"
    for a in (["init"], ["ingest", FIX], ["gate"]):
        run(db, *a)
    capsys.readouterr()
    assert run(db, "letter", "1") == 1
    assert "REFUSING" in capsys.readouterr().out
    run(db, "record", "1", "mailing_address", "1 Fake St, Phenix City AL 36867", "--source", "https://example.test",
        "--confidence", "high")
    run(db, "record", "1", "life_status", "alive", "--source", "https://example.test", "--confidence", "medium")
    capsys.readouterr()
    assert run(db, "letter", "1", "--draft") == 0
    out = capsys.readouterr().out
    assert "DRAFT - NOT FOR SIGNATURE" in out  # business.yaml still has TODO values
    assert "NOT the State of Alabama" in out and "for free" in out
    assert "1 Fake St" in out and "November 22, 2026" in out


def test_agreement_blocked_without_attorney_review(tmp_path, capsys):
    db = tmp_path / "t.db"
    for a in (["init"], ["ingest", FIX], ["gate"]):
        run(db, *a)
    capsys.readouterr()
    assert run(db, "agreement", "1") == 1
    assert "attorney" in capsys.readouterr().out


def test_unfilled_detects_placeholders():
    assert cli.unfilled({"a": {"b": "TODO x"}, "c": "ok", "d": "VERIFY y"}) == ["a.b", "d"]


def test_fee_cap_refused(tmp_path, monkeypatch):
    db = tmp_path / "t.db"
    run(db, "init")
    monkeypatch.setattr(cli, "load_business", lambda: {"fee_pct": 15})
    try:
        run(db, "letter", "1")
        raised = False
    except SystemExit:
        raised = True
    assert raised
