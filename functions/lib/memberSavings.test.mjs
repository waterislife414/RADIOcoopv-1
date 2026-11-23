import { test } from "node:test";
import assert from "node:assert/strict";
import * as S from "./memberSavings.mjs";

const FARE = { BASE_FARE: 2.16, PER_MILE: 1.98, FIRST_INCREMENT_MILES: 1 / 6, EXTRA_PAX_FEE: 2 };

test("card cost: 2.9% + 30c, nothing on $0", () => {
  assert.equal(S.cardCostCents(1173), 64);
  assert.equal(S.cardCostCents(0), 0);
  assert.equal(S.cardCostCents(10000, { percent: 2.9, fixedCents: 30 }), 320);
});

test("no deals: rider pays the meter + tip; driver pays the card cost on the meter", () => {
  const b = S.fareBreakdown({ meterCents: 1173, tipCents: 176 });
  assert.deepEqual(b, { meterCents: 1173, lockOffCents: 0, creditUsedCents: 0, fareChargeCents: 1173, tipCents: 176, chargeCents: 1349, driverCardCostCents: 64 });
});

test("company pays the card cost when paidBy is company; cash-type rides have none", () => {
  assert.equal(S.fareBreakdown({ meterCents: 1173, cost: { paidBy: "company" } }).driverCardCostCents, 0);
  assert.equal(S.fareBreakdown({ meterCents: 1173, card: false }).driverCardCostCents, 0);
});

test("price lock takes off what's over the cap, then credit; tip is never discounted", () => {
  const b = S.fareBreakdown({ meterCents: 1500, capCents: 1349, creditCents: 300, tipCents: 200 });
  assert.equal(b.lockOffCents, 151);
  assert.equal(b.creditUsedCents, 300);
  assert.equal(b.fareChargeCents, 1049);
  assert.equal(b.chargeCents, 1249);
  assert.equal(b.driverCardCostCents, S.cardCostCents(1500)); // driver: meter less card cost, as always
});

test("credit never goes below $0; leftover credit stays for next time", () => {
  const b = S.fareBreakdown({ meterCents: 500, creditCents: 1000 });
  assert.equal(b.creditUsedCents, 500);
  assert.equal(b.fareChargeCents, 0);
  assert.equal(b.chargeCents, 0);
});

test("price lock cap: members only, top of the range + waiting after the free minutes", () => {
  const ride = { customerId: "u1", estMiles: 5, passengers: 1 };
  const base = S.priceLockCapCents({ ride, fare: FARE });
  assert.ok(base > 1173 && base < 1500, String(base));
  assert.equal(S.priceLockCapCents({ ride: { ...ride, waitedMs: 5 * 60000 }, fare: FARE, waitPerMinuteCents: 35, waitGraceMinutes: 2 }), base + 3 * 35);
  assert.equal(S.priceLockCapCents({ ride: { ...ride, customerId: "guest" }, fare: FARE }), null);
  assert.equal(S.priceLockCapCents({ ride: { ...ride, stops: [{ address: "x" }] }, fare: FARE }), null);
  assert.equal(S.priceLockCapCents({ ride: { ...ride, outOfArea: true }, fare: FARE }), null);
  assert.equal(S.priceLockCapCents({ ride: { customerId: "u1" }, fare: FARE }), null);
  assert.equal(S.priceLockCapCents({ ride, fare: FARE, deals: { priceLock: false } }), null);
});

test("rewards: every 10th counted ride, rides of $5 or more, members only", () => {
  assert.equal(S.rewardFor(10, 500), 500);
  assert.equal(S.rewardFor(20, 1000), 1000);
  assert.equal(S.rewardFor(9, 500), 0);
  assert.equal(S.rewardFor(0, 500), 0);
  assert.equal(S.ridesToNextReward(0), 10);
  assert.equal(S.ridesToNextReward(7), 3);
  assert.equal(S.ridesToNextReward(10), 10);
  assert.equal(S.countsForReward({ customerId: "u1", meterCents: 499 }), false);
  assert.equal(S.countsForReward({ customerId: "u1", finalFare: 5 }), true);
  assert.equal(S.countsForReward({ customerId: "u1" }), true);
  assert.equal(S.countsForReward({ customerId: "guest", meterCents: 900 }), false);
});

test("price lock ends when the rider changes the drop-off or makes a stop during the ride", () => {
  const ride = { customerId: "u1", estMiles: 5, passengers: 1 };
  assert.ok(S.priceLockCapCents({ ride, fare: FARE }) > 0);
  assert.equal(S.priceLockCapCents({ ride: { ...ride, routeChangedAt: 1 }, fare: FARE }), null);
  assert.equal(S.priceLockCapCents({ ride: { ...ride, stopCount: 1 }, fare: FARE }), null);
  assert.equal(S.tripChanged({ stopCount: 0 }), false);
});
