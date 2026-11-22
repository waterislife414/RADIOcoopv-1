# Plan and stage gates (owner approves each stage before the next starts)
1. Game plan (done, approved).
2. Pre-write: this repo, rules, schema, compliance doc, workflows, baseline tests. No research, no real data.
3. Wave 1 bots: ingest, gate, score, queries, letters, report (tasks T1-T6 in AI_PROMPT.md). Merge only if the pytest score holds or improves.
4. Research workflow: manager-run lookups for Tier A then B (alive/deceased, business status, heirs, contacts). Every fact logged with source URL.
5. Outreach: manager writes letter and agreement templates (attorney review recommended); workers only render.
6. Pilot: 5 easy cases end to end.
7. Scale, then other states (each state's finder rules verified first; Georgia needs a license: out of scope).

## Qualify standards (config/rules.yaml is the source of truth)
Drop: single property of $100 or less; provably under 24 months since delivery; already claimed; government owner; unidentifiable owner; deceased with no heir after the research budget.
Hold: report date unknown (confirm with Treasury 334-242-9614); single claim over $100 with unknown upper bound.
Golden: owner with 2+ properties (kept even if each is small). Priority signals: life insurance/annuity, brokerage/stock, crypto, retirement accounts.
Tiers: A known total >= $500, or 2+ claims with a high signal, or one high-signal claim over $100. B total >= $100 or 2+ claims over $100 total. C one claim, unknown amount. X dropped.
Geography: Phenix City AL home base. Distance is only a bonus: an easy, reachable, high-value case anywhere is fair game.
