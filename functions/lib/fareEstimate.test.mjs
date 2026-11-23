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
  assert.ok(e.miles > 3 && e.miles < 4, `miles ${e.miles}`);
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
