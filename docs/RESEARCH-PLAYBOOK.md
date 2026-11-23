# Research playbook (manager-run; code only builds queries and stores facts)
Order of work: Tier A first, then B. Tier C and hold wait. Never research a dropped owner. Time budget per case in config/rules.yaml.
Every fact is saved with `record_fact(...)` and MUST have a source URL or note. No source, no fact.
Confidence: high = two independent sources or an official record; medium = one solid source (obituary naming the person and city); low = name match only.

## 1. Alive or deceased (people)
1. Obituary searches (uprec.queries.obituary_queries): funeral home sites, Legacy, Echovita, local paper. Match name + city/age/relatives before accepting.
2. Find a Grave. 3. County probate case search for the county of last address (Russell, Lee, etc.). 4. Recent social media or business listing proving alive.
Result: alive / deceased / unknown. Deceased also needs date of death if available.

## 2. Heirs (if deceased)
Obituary survivors list is the starting point. Record each heir with relationship and source. Spouse and children first. Probate filings name legal heirs when an estate was opened. Do NOT guess relationships. No heir found within budget => status hold, reason `deceased_no_heir_found`.

## 3. Business owners
Alabama Secretary of State entity search: active/dissolved, registered agent, officers. Active => contact the registered agent or an officer. Dissolved => former officers/shareholders are the claimants; note it, expect more paperwork; only continue for Tier A.

## 4. Contact info (free sources only)
County revenue commissioner/assessor and deed records (current owner and mailing address), business websites, public social profiles, the owner's own listings. Record mailing address first (letters are our first channel). Phone/email only if publicly published by the owner. Never buy lists, never scrape people-search sites, never pretext.

## 5. Ready check
Run readiness (uprec.readiness): eligible >24 months, alive status known or heirs found, a mailing address exists. Only ready cases go to outreach.

## Safety
- No data from this work goes into this repo or any free AI worker prompt. It lives in data/uprec.db.
- Be honest in every contact: who we are, the free claim option, the 10% cap. We are not the state.
