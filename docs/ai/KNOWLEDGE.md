# Unclaimed Property Recovery (Alabama): what every worker must know
Business: owner (Jared, Phenix City AL) is a "finder": locates owners/heirs of Alabama State Treasury unclaimed property, signs a written agreement, files the claim with the owner, collects at most 10% of value claimed. Law: Ala. Code 35-12-93 (as amended by HB104, 2026).
Hard legal facts: agreement is VOID if signed before 24 months after the property was paid/delivered to the Treasurer; fee cap 10% of value claimed; no finder license in Alabama; agreement must state the property is held by the Treasurer, that it can be recovered free from the Treasurer, and the fee percentage.
Pipeline: ingest list -> gate (hard drops) -> score (tiers A/B/C/X) -> research (alive? business? heirs? contact?) -> outreach letter -> agreement -> claim packet -> track.
Data: SQLite file at data/uprec.db (gitignored). Schema in db/schema.sql. Rules in config/rules.yaml (loaded by uprec/config.py). Raw CSV from the Treasury portal goes in data/inbox/ (gitignored).
Portal fields we expect (UNVERIFIED until the first real CSV): owner name, address (city/state/zip), holder name, property type, amount bucket text (e.g. "under $100", "over $100", "over $500"), reported year/date, property id.
Code map: uprec/db.py (connect/init), uprec/config.py (load rules), uprec/ingest.py, uprec/gate.py, uprec/score.py, uprec/queries.py (search-string builders), uprec/letters.py (render), uprec/report.py (exports). Tests in tests/, synthetic data in fixtures/.
Amounts: buckets give a lower bound ("over $500" -> min 50000 cents) or an upper bound ("under $100" -> max 10000 cents). Exact amounts are rare. Aggregate per owner using the lower bounds.
Test commands: `ruff check .` and `pytest -q`. No services, keys or network needed.

Stage 4 modules (being built): uprec/columns.py (portal header mapping via config/portal_columns.yaml), uprec/research.py (record_fact/add_heir/add_contact), uprec/casesheet.py (markdown case sheet), uprec/readiness.py (outreach blockers), uprec/work_queue.py (next cases to research). Research method: docs/RESEARCH-PLAYBOOK.md. Stage 3 modules exist: ingest, gate, score, queries, letters, report.
