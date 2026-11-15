import { test } from "node:test";
import assert from "node:assert/strict";
import * as T from "./rideTiming.mjs";
import { cardCreditCents } from "./dispatchCore.mjs";

const R = T.DEFAULT_RULES;
const MIN = 60_000;
const app = (x = {}) => ({ status: "dispatched", customerId: "u1", driverId: "d1", assignedAt: 0, ...x });

test("eta: about a mile is a few minutes, missing points give null", () => {
  const eta = T.etaMinutes({ lat: 32.46, lng: -84.98 }, { lat: 32.4745, lng: -84.98 }, R);
  assert.ok(eta >= 2 && eta <= 5, `eta ${eta}`);
  assert.equal(T.etaMinutes(null, { lat: 1, lng: 1 }, R), null);
});

test("heads-up fires once, at 4 minutes or less, before arrival", () => {
  assert.equal(T.shouldSendHeadsUp(app(), 5, R), false);
  assert.equal(T.shouldSendHeadsUp(app(), 4, R), true);
  assert.equal(T.shouldSendHeadsUp(app({ headsUpAt: 1 }), 2, R), false);
  assert.equal(T.shouldSendHeadsUp(app({ arrivedAt: 1 }), 2, R), false);
});

test("cancel: free before the alert, $5 after it, always 1 minute free after accept", () => {
  assert.deepEqual(T.cancelQuote({ status: "pending" }, 0, R).feeCents, 0);
  assert.equal(T.cancelQuote(app(), 10 * MIN, R).feeCents, 0);
  assert.equal(T.cancelQuote(app({ headsUpAt: 5 * MIN }), 5 * MIN + 1, R).feeCents, 500);
  // Driver was already close when he took it: rider still gets a minute.
  assert.equal(T.cancelQuote(app({ headsUpAt: 1000 }), 30_000, R).feeCents, 0);
  assert.equal(T.cancelQuote(app({ headsUpAt: 1000 }), MIN + 1, R).feeCents, 500);
  assert.equal(T.cancelQuote(app({ status: "in_transit" }), 0, R).allowed, false);
});

test("call-in and guest rides never pay a fee and cancel through the office", () => {
  for (const x of [{ source: "phone" }, { callIn: true }, { customerId: "guest" }]) {
    assert.equal(T.isAppRide(app(x)), false);
    assert.equal(T.cancelQuote(app({ ...x, headsUpAt: 1 }), 10 * MIN, R).reason, "call_office");
    assert.deepEqual(T.noShowCheck(app(x), 0, R), { allowed: true, feeCents: 0 });
  }
});

test("wait clock: meter at 2 minutes, no-show at 7", () => {
  const ride = app({ arrivedAt: 0, arrivedDistM: 40 });
  assert.equal(T.waitClock(ride, 2 * MIN - 1, R).meterOn, false);
  assert.equal(T.waitClock(ride, 2 * MIN, R).meterOn, true);
  assert.equal(T.noShowCheck(ride, 6 * MIN, R).allowed, false);
  assert.deepEqual(T.noShowCheck(ride, 7 * MIN, R), { allowed: true, feeCents: 1000, near: true });
  assert.equal(T.noShowCheck(app(), 99 * MIN, R).allowed, false, "must tap I'm here first");
});

test("no fee when the driver wasn't actually at the pickup", () => {
  const far = app({ arrivedAt: 0, arrivedDistM: 2000 });
  assert.deepEqual(T.noShowCheck(far, 8 * MIN, R), { allowed: true, feeCents: 0, near: false });
});

test("line: Premium, then Day Pass, then by booking time", () => {
  const w = [
    { id: "a", createdMs: 1 },
    { id: "b", createdMs: 2, priority: "vip" },
    { id: "c", createdMs: 3, priority: "premium" },
    { id: "me", createdMs: 4 },
  ];
  assert.equal(T.queuePosition(w[3], w), 4);
  assert.equal(T.queuePosition({ ...w[3], priority: "vip" }, w), 3);
  assert.equal(T.queuePosition(w[2], w), 1);
  assert.equal(T.lineText(1), "next up");
  assert.equal(T.lineText(2), "2nd in line");
  assert.equal(T.lineText(3), "3rd in line");
  assert.equal(T.lineText(11), "11th in line");
});

test("perks: Basic gets the map, Premium and Day Pass get map + calling", () => {
  const cfg = { liveMap: ["DAY_PASS", "BASIC", "PREMIUM"], callDriver: ["DAY_PASS", "PREMIUM"] };
  assert.deepEqual(T.perksFor({}, cfg), { liveMap: false, callDriver: false });
  assert.deepEqual(T.perksFor({ tier: "BASIC" }, cfg), { liveMap: true, callDriver: false });
  assert.deepEqual(T.perksFor({ tier: "PREMIUM" }, cfg), { liveMap: true, callDriver: true });
  assert.deepEqual(T.perksFor({ dayPass: true }, cfg), { liveMap: true, callDriver: true });
});

test("Day Pass runs to local midnight, including across daylight-saving changes", () => {
  const at = Date.UTC(2026, 10, 14, 23, 0); // 6 PM Columbus time
  assert.equal(T.endOfLocalDay(at, "America/New_York"), Date.UTC(2026, 10, 15, 5, 0));
  const summer = Date.UTC(2026, 6, 4, 15, 0); // 11 AM EDT
  assert.equal(T.endOfLocalDay(summer, "America/New_York"), Date.UTC(2026, 6, 5, 4, 0));
});

test("driver credit is meter fare + tip only: card fee and the $5 pass stay with the company", () => {
  const ride = { paymentMethod: "card", stripeStatus: "succeeded", finalFare: 12.5, tipAmount: 2, cardFeeCents: 200, wantsPriorityPass: true, capturedAmountCents: 2150 };
  assert.deepEqual(cardCreditCents(ride, { includeTips: true }), { fareCents: 1250, tipCents: 200 });
});
