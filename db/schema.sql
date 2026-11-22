PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS owners (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'unknown' CHECK (kind IN ('person','business','unknown')),
  name TEXT NOT NULL,
  address TEXT, city TEXT, state TEXT, zip TEXT, county TEXT,
  life_status TEXT NOT NULL DEFAULT 'unknown' CHECK (life_status IN ('alive','deceased','unknown','n/a')),
  business_status TEXT NOT NULL DEFAULT 'unknown' CHECK (business_status IN ('active','dissolved','unknown','n/a')),
  tier TEXT NOT NULL DEFAULT 'unscored' CHECK (tier IN ('A','B','C','X','unscored')),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','gated','researching','ready','contacted','agreement_signed','claim_filed','paid','closed_won','closed_lost','dropped','hold')),
  drop_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (date('now')),
  updated_at TEXT NOT NULL DEFAULT (date('now'))
);
CREATE TABLE IF NOT EXISTS properties (
  id INTEGER PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  portal_property_id TEXT,
  holder TEXT, property_type TEXT,
  amount_text TEXT,                 -- raw portal text, e.g. 'over $100'
  amount_min_cents INTEGER, amount_max_cents INTEGER,   -- parsed bounds, NULL if unknown
  reported_date TEXT,               -- ISO date if known
  reported_year INTEGER,            -- if only the year is known
  signal TEXT NOT NULL DEFAULT 'none' CHECK (signal IN ('high','medium','low','none')),
  eligible_after TEXT,              -- computed by gate: first day an agreement may be signed
  claimed INTEGER NOT NULL DEFAULT 0,
  UNIQUE (owner_id, portal_property_id)
);
CREATE TABLE IF NOT EXISTS research_log (   -- every fact needs a source
  id INTEGER PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  fact_key TEXT NOT NULL,           -- e.g. life_status, obituary, probate_case, sos_status, mailing_address
  fact_value TEXT NOT NULL,
  source_url TEXT, source_note TEXT,
  confidence TEXT NOT NULL DEFAULT 'low' CHECK (confidence IN ('low','medium','high')),
  retrieved_at TEXT NOT NULL DEFAULT (date('now'))
);
CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  heir_id INTEGER REFERENCES heirs(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('mail','phone','email','other')),
  value TEXT NOT NULL,
  verified INTEGER NOT NULL DEFAULT 0,
  source_url TEXT
);
CREATE TABLE IF NOT EXISTS heirs (
  id INTEGER PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  name TEXT NOT NULL, relationship TEXT,
  source_url TEXT, notes TEXT
);
CREATE TABLE IF NOT EXISTS outreach (
  id INTEGER PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('mail','phone','email','in_person')),
  sent_on TEXT, response TEXT, follow_up_on TEXT
);
CREATE TABLE IF NOT EXISTS agreements (
  id INTEGER PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  signed_on TEXT, fee_pct REAL NOT NULL CHECK (fee_pct <= 10),
  value_claimed_cents INTEGER, fee_paid_cents INTEGER,
  claim_filed_on TEXT, claim_paid_on TEXT
);
CREATE TABLE IF NOT EXISTS status_history (
  id INTEGER PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  old_status TEXT, new_status TEXT NOT NULL, reason TEXT,
  changed_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_props_owner ON properties(owner_id);
CREATE INDEX IF NOT EXISTS idx_log_owner ON research_log(owner_id);
