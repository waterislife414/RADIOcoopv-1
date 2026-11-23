import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as E from "./fareEstimate.mjs";

// The real rates from branding.config.json, so the tests break if the meter changes.
const brand = JSON.parse(readFileSync(new URL("../../branding.config.json", import.meta.url), "utf8"));
const FARE = brand.pricing.fare;

test("meter: matches the city rate card ($2.16 first 1/6 mile, $0.33 each 1/6 after)", () => {
  assert.equal(E.meterCents(0, FARE), 216);
  assert.equal(E.meterCents(1 / 6, FARE), 216);
  assert.equal(E.meterCents(2, FARE), 579); // home page compare card: $5.79
  assert.equal(E.meterCents(3, FARE), 777); // home page compare card: $7.77
  assert.equal(E.meterCents(10, FARE), 2163); // compare page: $21.63
});

test("meter: a started 1/6 mile counts, and extra passengers add $2 each", () => {
  assert.equal(E.meterCents(0.2, FARE), 216 + 33);
  assert.equal(E.meterCents(3, FARE, 3), 777 + 400);
});

test("straight miles: about right across Columbus, null without both points", () => {
  const office = { lat: 32.4559, lng: -84.9636 }; // Cusseta Rd area
  const mall = { lat: 32.5266, lng: -84.9583 }; // Manchester Expy area
  const m = E.straightMiles(office, mall);
  assert.ok(m > 4.5 && m < 5.2, `miles ${m}`);
  assert.equal(E.straightMiles(office, null), null);
  assert.equal(E.straightMiles(office, { lat: NaN, lng: 1 }), null);
});

test("estimate: one-way, card fee added once, range high >= low", () => {
  const a = { lat: 32.4559, lng: -84.9636 };
  const b = { lat: 32.4993, lng: -84.9636 };
  const e = E.estimateTrip({ points: [a, b], fare: FARE, cardFeeCents: 180 });
  assert.ok(e.miles > 3.5 && e.miles < 4.5, `miles ${e.miles}`);
  assert.equal(e.fareCents, E.meterCents(E.roadMiles([a, b]), FARE));
  assert.equal(e.totalCents, e.fareCents + 180);
  assert.ok(e.highCents >= e.fareCents);
  assert.equal(e.highTotalCents, e.highCents + 180);
});

test("estimate: round trip doubles the fare, not the card fee", () => {
  const a = { lat: 32.4559, lng: -84.9636 };
  const b = { lat: 32.4993, lng: -84.9636 };
  const one = E.estimateTrip({ points: [a, b], fare: FARE, cardFeeCents: 200 });
  const two = E.estimateTrip({ points: [a, b], fare: FARE, cardFeeCents: 200, roundTrip: true });
  assert.equal(two.fareCents, one.fareCents * 2);
  assert.equal(two.totalCents, one.fareCents * 2 + 200);
});

test("estimate: stops add their legs; a stop with no point means no estimate", () => {
  const a = { lat: 32.4559, lng: -84.9636 };
  const s = { lat: 32.47, lng: -84.99 };
  const b = { lat: 32.4993, lng: -84.9636 };
  const direct = E.estimateTrip({ points: [a, b], fare: FARE });
  const viaStop = E.estimateTrip({ points: [a, s, b], fare: FARE });
  assert.ok(viaStop.fareCents > direct.fareCents);
  assert.equal(E.estimateTrip({ points: [a, null, b], fare: FARE }), null);
});

test("estimate: too far or missing points gives null (rider calls for a price)", () => {
  const a = { lat: 32.4559, lng: -84.9636 };
  const atlanta = { lat: 33.749, lng: -84.388 };
  assert.equal(E.estimateTrip({ points: [a, atlanta], fare: FARE }), null);
  assert.equal(E.estimateTrip({ points: [a], fare: FARE }), null);
  assert.equal(E.estimateTrip({ points: [], fare: FARE }), null);
});

test("priceMiles: same answer as estimateTrip for the same road miles; bad miles give null", () => {
  const a = { lat: 32.4559, lng: -84.9636 };
  const b = { lat: 32.4993, lng: -84.9636 };
  const e = E.estimateTrip({ points: [a, b], fare: FARE, passengers: 2, cardFeeCents: 200 });
  const p = E.priceMiles({ miles: E.roadMiles([a, b]), fare: FARE, passengers: 2, cardFeeCents: 200 });
  assert.deepEqual(p, e);
  assert.equal(E.priceMiles({ miles: 0, fare: FARE }), null);
  assert.equal(E.priceMiles({ miles: NaN, fare: FARE }), null);
});

test("dollars: formats cents", () => {
  assert.equal(E.dollars(777), "$7.77");
  assert.equal(E.dollars(0), "$0.00");
});

test("meterCheck: normal meters pass, a wild one goes to the office", () => {
  const ok = E.meterCheck({ meterCents: 1100, estMiles: 4.5, fare: FARE });
  assert.equal(ok.ok, true);
  assert.equal(ok.estFareCents, E.meterCents(4.5, FARE));
  const wild = E.meterCheck({ meterCents: 9000, estMiles: 4.5, fare: FARE });
  assert.equal(wild.ok, false);
  assert.ok(wild.limitCents < 9000);
  // No estimate: only the hard cap.
  assert.equal(E.meterCheck({ meterCents: 9000, estMiles: 0, fare: FARE }).ok, true);
  assert.equal(E.meterCheck({ meterCents: 30000, estMiles: 0, fare: FARE }).ok, false);
  assert.equal(E.meterCheck({ meterCents: 0, estMiles: 3, fare: FARE }).ok, false);
});

test("impliedMiles: the inverse of the meter", () => {
  for (const miles of [1, 3, 7.5, 12]) {
    const back = E.impliedMiles(E.meterCents(miles, FARE), FARE);
    assert.ok(Math.abs(back - miles) < 1 / 6 + 1e-9, `${miles} -> ${back}`);
  }
  assert.ok(Math.abs(E.impliedMiles(E.meterCents(3, FARE, 2), FARE, 2) - 3) < 1 / 6 + 1e-9);
});

test("suggestRoadFactor: learns from real meters, needs enough rides", () => {
  // Real trips ran 10% longer than estimated.
  const samples = Array.from({ length: 25 }, (_, i) => {
    const est = 2 + i * 0.3;
    return { estMiles: est, meterCents: E.meterCents(est * 1.1, FARE) };
  });
  const s = E.suggestRoadFactor(samples, FARE, 1.35);
  assert.equal(s.rides, 25);
  assert.ok(s.factor >= 1.45 && s.factor <= 1.5, `factor ${s.factor}`);
  assert.equal(E.suggestRoadFactor(samples.slice(0, 5), FARE, 1.35).factor, null);
});

test("card fee can be a percent of the fare (credit card surcharge)", () => {
  const pct = (c) => Math.floor(c * 0.03);
  const p = E.priceMiles({ miles: 5, fare: FARE, cardFeeCents: pct });
  assert.equal(p.cardFeeCents, Math.floor(p.fareCents * 0.03));
  assert.equal(p.totalCents, p.fareCents + p.cardFeeCents);
  assert.equal(p.highTotalCents, p.highCents + Math.floor(p.highCents * 0.03));
});
