import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as F from "./cardFee.mjs";

const brand = JSON.parse(readFileSync(new URL("../../branding.config.json", import.meta.url), "utf8"));
// The surcharge math stays tested even though the app ships with no card fee.
const CFG = { ...brand.pricing.cardFee, mode: "credit_surcharge" };

test("config: no card fee (owner decision Nov 23: same price cash or card); surcharge stays within card rules", () => {
  assert.equal(brand.pricing.cardFee.mode, "none");
  assert.ok(CFG.creditPercent <= 3, "Visa caps U.S. credit surcharges at 3%");
  assert.equal(F.cardFeeRule(brand.pricing.cardFee), "No card fee. Same price as cash.");
});

test("credit: 3% of the fare, never more than the processing cost", () => {
  assert.equal(F.cardFeeCents({ baseCents: 1000, funding: "credit", cfg: CFG }), 30); // $10 -> 30 cents
  assert.equal(F.cardFeeCents({ baseCents: 1173, funding: "credit", cfg: CFG }), 35); // $11.73 -> 35 cents
  assert.equal(F.cardFeeCents({ baseCents: 10000, funding: "credit", cfg: CFG }), 300); // $100 -> $3.00
  // Past about $300 the processing cost (2.9% + 30c) is the lower one.
  assert.equal(F.cardFeeCents({ baseCents: 50000, funding: "credit", cfg: CFG }), 1480);
});

test("debit, prepaid and unknown cards: no fee", () => {
  for (const funding of ["debit", "prepaid", "unknown", undefined]) {
    assert.equal(F.cardFeeCents({ baseCents: 2000, funding, cfg: CFG }), 0, String(funding));
  }
});

test("flat mode (only if a lawyer approves it) and none mode", () => {
  const flat = { ...CFG, mode: "flat", flatCents: 200, flatMemberCents: 180 };
  assert.equal(F.cardFeeCents({ baseCents: 1000, funding: "debit", cfg: flat }), 200);
  assert.equal(F.cardFeeCents({ baseCents: 1000, member: true, cfg: flat }), 180);
  assert.equal(F.cardFeeCents({ baseCents: 1000, funding: "credit", cfg: { mode: "none" } }), 0);
});

test("zero or bad amounts: no fee", () => {
  assert.equal(F.cardFeeCents({ baseCents: 0, funding: "credit", cfg: CFG }), 0);
  assert.equal(F.cardFeeCents({ baseCents: -500, funding: "credit", cfg: CFG }), 0);
  assert.equal(F.cardFeeCents({ baseCents: NaN, funding: "credit", cfg: CFG }), 0);
});

test("max fee and the one-line rule", () => {
  assert.equal(F.maxCardFeeCents(1000, CFG), 30);
  assert.equal(F.cardFeeRule(CFG), "Credit cards: up to 3%. Debit cards: no fee.");
});
