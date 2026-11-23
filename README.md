# Alabama Unclaimed Property Recovery (branch `unclaimed-recovery` of the Radio Co-op repo)
Separate from the taxi app: no taxi code on this branch. Workflows are prefixed `ur-` (push `ur-go/<T>`, `ur-review/<T>`, `ur-verify/<x>`, `ur-integrate/<x>`); worker results land on `ur/<T>`.
REAL DATA NEVER GOES IN THIS REPO (it is public). It stays in `data/` (gitignored). Keep your real name/address/phone in `data/business.yaml`, not in `config/business.yaml`.

## Run it (Python 3.12, `pip install -r requirements.txt`)
    python -m uprec.cli init
    python -m uprec.cli ingest data/inbox/portal-list.csv     # headers mapped via config/portal_columns.yaml
    python -m uprec.cli gate                                  # hard drops + tiers A/B/C
    python -m uprec.cli queue                                 # who to research next, and what is missing
    python -m uprec.cli show 12                               # case sheet with search strings
    python -m uprec.cli record 12 life_status alive --source URL --confidence medium
    python -m uprec.cli record 12 mailing_address "ADDRESS" --source URL --confidence high
    python -m uprec.cli heir 12 "NAME" --relationship daughter --source URL
    python -m uprec.cli ready 12                              # blockers before outreach
    python -m uprec.cli letter 12   |  letter 12 --heir 3     # refuses until ready and business.yaml is filled
    python -m uprec.cli agreement 12                          # refuses until attorney_reviewed: true
    python -m uprec.cli outreach 12 mail ; python -m uprec.cli followups
    python -m uprec.cli report data/ranked.csv
Rules: config/rules.yaml. Method: docs/RESEARCH-PLAYBOOK.md. Law and checklist: docs/COMPLIANCE.md. Filing: docs/CLAIM-PACKET-CHECKLIST.md.
