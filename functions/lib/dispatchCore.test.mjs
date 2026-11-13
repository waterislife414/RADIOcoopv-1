import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as c from './dispatchCore.mjs';

const d = (id, status, zoneId, lineKey, extra = {}) => ({ id, status, zoneId, lineKey, ...extra });

test('Baker 🟢🔴🔴(you) → 3rd out, 1 call until you', () => {
  const drivers = [d('a', 'on_call', 'baker', 1), d('b', 'ready', 'baker', 2), d('me', 'ready', 'baker', 3)];
  const pos = c.linePosition(c.zoneLine(drivers, 'baker'), 'me');
  assert.deepEqual(pos, { position: 3, callsUntilYou: 1, onCall: false });
  assert.equal(c.ordinal(pos.position), '3rd');
});

test('radio: "fourth out with two on call" → 1 call until you', () => {
  const drivers = [d('a', 'on_call', 'z', 1), d('b', 'on_call', 'z', 2), d('c', 'ready', 'z', 3), d('me', 'ready', 'z', 4)];
  assert.deepEqual(c.linePosition(c.zoneLine(drivers, 'z'), 'me'), { position: 4, callsUntilYou: 1, onCall: false });
});

test('greens always ahead of reds regardless of lineKey', () => {
  const drivers = [d('r', 'ready', 'z', 1), d('g', 'on_call', 'z', 5)];
  assert.deepEqual(c.zoneLine(drivers, 'z').map((x) => x.dot), ['green', 'red']);
});

test('board: own dot blue ring / filled; Moving row; Fort Benning hidden without cert', () => {
  const zones = [{ id: 'baker', label: 'Baker' }, { id: 'fort-benning', label: 'Fort Benning', requiresCert: 'base' }];
  const drivers = [d('a', 'on_call', 'baker', 1), d('me', 'ready', 'baker', 2), d('m', 'moving', null, null)];
  const viewer = { id: 'me', certs: {} };
  const b = c.buildBoard({ drivers, zones, viewerId: 'me', viewer });
  assert.equal(b.rows.length, 1);
  assert.deepEqual(b.rows[0].line.map((x) => x.dot), ['green', 'blue-ring']);
  assert.equal(b.moving.length, 1);
  assert.deepEqual(b.me, { zoneId: 'baker', label: 'Baker', position: 2, callsUntilYou: 0, onCall: false });
  const onCall = c.buildBoard({ drivers: [d('me', 'on_call', 'baker', 1)], zones, viewerId: 'me', viewer });
  assert.equal(onCall.rows[0].line[0].dot, 'blue-filled');
  const certified = { id: 'me', certs: { base: { status: 'approved' } } };
  assert.equal(c.buildBoard({ drivers, zones, viewerId: 'me', viewer: certified }).rows.length, 2);
});

test('eligibility: base cert, expiry, wheelchair needs cert AND van', () => {
  const now = 1000;
  const ride = { requiresCerts: ['base'] };
  assert.equal(c.isEligible({ certs: {} }, ride, {}, now), false);
  assert.equal(c.isEligible({ certs: { base: { status: 'approved' } } }, ride, {}, now), true);
  assert.equal(c.isEligible({ certs: { base: { status: 'approved', expiresAt: 999 } } }, ride, {}, now), false);
  assert.equal(c.isEligible({ certs: { base: { status: 'pending' } } }, ride, {}, now), false);
  const wc = { requiresCerts: ['wheelchair'] };
  const drv = { carNumber: '44', certs: { wheelchair: { status: 'approved' } } };
  assert.equal(c.isEligible(drv, wc, { 44: { isVan: false } }, now), false);
  assert.equal(c.isEligible(drv, wc, { 44: { isVan: true } }, now), true);
  assert.equal(c.isEligible({ carNumber: '44', certs: {} }, wc, { 44: { isVan: true } }, now), false);
});

test('requiredCertsForRide pulls base from either zone + wheelchair option', () => {
  const fb = { id: 'fort-benning', requiresCert: 'base' };
  assert.deepEqual(c.requiredCertsForRide({ pickupZone: { id: 'baker' }, dropZone: fb, wheelchair: true }).sort(), ['base', 'wheelchair']);
});

test('priority: Premium > VIP > everyone, then oldest', () => {
  const rides = [{ id: 'n1', createdAt: 1 }, { id: 'v', priority: 'vip', createdAt: 5 }, { id: 'p', priority: 'premium', createdAt: 9 }, { id: 'n0', createdAt: 0 }];
  assert.deepEqual(c.sortPendingRides(rides).map((r) => r.id), ['p', 'v', 'n0', 'n1']);
});

test('pick: requested driver first, skips ineligible without losing spot, then broadcast', () => {
  const drivers = [
    d('g', 'on_call', 'baker', 0),
    d('noBase', 'ready', 'baker', 1, { certs: {} }),
    d('base', 'ready', 'baker', 2, { certs: { base: { status: 'approved' } } }),
    d('req', 'moving', null, null, { certs: {} }),
  ];
  assert.deepEqual(c.pickDriverForRide({ zoneId: 'baker', requestedDriverId: 'req' }, drivers), { driverId: 'req', kind: 'requested' });
  assert.deepEqual(c.pickDriverForRide({ zoneId: 'baker', requestedDriverId: 'req', triedDriverIds: ['req'] }, drivers), { driverId: 'noBase', kind: 'zone' });
  assert.deepEqual(c.pickDriverForRide({ zoneId: 'baker', requiresCerts: ['base'] }, drivers), { driverId: 'base', kind: 'zone' });
  assert.deepEqual(c.pickDriverForRide({ zoneId: 'baker', requiresCerts: ['base'], triedDriverIds: ['base'] }, drivers), { broadcast: true });
  assert.deepEqual(c.pickDriverForRide({ zoneId: 'empty' }, drivers), { broadcast: true });
});

test('broadcast goes to eligible ready + moving drivers only', () => {
  const drivers = [d('r', 'ready', 'a', 1), d('m', 'moving', null, null), d('g', 'on_call', 'a', 0), d('o', 'offline', null, null)];
  assert.deepEqual(c.broadcastRecipients({ zoneId: 'x' }, drivers).sort(), ['m', 'r']);
});

test('offer: 3 pings 15 s apart, then expire', () => {
  const o = { startedAt: 0, pingsSent: 0 };
  assert.deepEqual(c.offerTick(o, 0), { action: 'ping', ping: 1 });
  assert.deepEqual(c.offerTick({ ...o, pingsSent: 1 }, 10_000), { action: 'wait', nextAt: 15_000 });
  assert.deepEqual(c.offerTick({ ...o, pingsSent: 1 }, 15_000), { action: 'ping', ping: 2 });
  assert.deepEqual(c.offerTick({ ...o, pingsSent: 2 }, 30_000), { action: 'ping', ping: 3 });
  assert.deepEqual(c.offerTick({ ...o, pingsSent: 3 }, 44_999), { action: 'wait', nextAt: 45_000 });
  assert.deepEqual(c.offerTick({ ...o, pingsSent: 3 }, 45_000), { action: 'expire' });
});

test('miss: off the board + warning; 3rd warning suspends; requested = no penalty', () => {
  assert.deepEqual(c.applyMiss({ warnings: 0, status: 'offered', zoneId: 'z' }), { warnings: 1, status: 'offline', zoneId: null, lineKey: null });
  assert.equal(c.applyMiss({ warnings: 2 }).status, 'suspended');
  assert.deepEqual(c.applyMiss({ warnings: 2, status: 'offered', zoneId: 'z' }, { requested: true }), { status: 'ready' });
  assert.deepEqual(c.applyMiss({ status: 'offered', zoneId: null }, { requested: true }), { status: 'moving' });
});

test('drop-off: front of drop zone line (next up); back optional; outside zones → Moving', () => {
  const drivers = [d('x', 'ready', 'rose-hill', 100), d('y', 'ready', 'rose-hill', 200), d('g', 'on_call', 'rose-hill', 50)];
  const front = c.applyDropOff(drivers, 'me', 'rose-hill', 'front', 999);
  assert.equal(front.lineKey, 99);
  const after = [...drivers, d('me', front.status, front.zoneId, front.lineKey)];
  assert.deepEqual(c.linePosition(c.zoneLine(after, 'rose-hill'), 'me'), { position: 2, callsUntilYou: 0, onCall: false });
  assert.equal(c.applyDropOff(drivers, 'me', 'rose-hill', 'back', 999).lineKey, 999);
  assert.equal(c.applyDropOff(drivers, 'me', 'empty-zone', 'front', 999).lineKey, 999);
  assert.deepEqual(c.applyDropOff(drivers, 'me', null), { status: 'moving', zoneId: null, lineKey: null });
});

test('point in polygon + zoneForPoint', () => {
  const sq = { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]], [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]]] };
  assert.equal(c.pointInPolygon(1, 1, sq), true);
  assert.equal(c.pointInPolygon(5, 5, sq), false); // hole
  assert.equal(c.pointInPolygon(11, 1, sq), false);
  assert.equal(c.zoneForPoint([{ id: 'a', polygon: sq }], 2, 2), 'a');
  assert.equal(c.zoneForPoint([{ id: 'a', polygon: sq }], 20, 2), null);
});

test('zones stored as {lat,lng} points (Firestore-safe) + distance', () => {
  const zone = { id: 'z', points: [{ lat: 0, lng: 0 }, { lat: 0, lng: 10 }, { lat: 10, lng: 10 }, { lat: 10, lng: 0 }] };
  assert.equal(c.zoneForPoint([zone], 5, 5), 'z');
  assert.equal(c.zoneForPoint([zone], 15, 5), null);
  assert.equal(c.zoneForPoint([{ id: 'empty', points: [] }], 5, 5), null);
  const m = c.metersBetween({ lat: 32.46, lng: -84.98 }, { lat: 32.47, lng: -84.98 });
  assert.ok(m > 1100 && m < 1120, `~1112 m, got ${m}`);
});

test('stale GPS after 3 min', () => {
  assert.equal(c.isLocationStale({ at: 0 }, 180_000), false);
  assert.equal(c.isLocationStale({ at: 0 }, 180_001), true);
  assert.equal(c.isLocationStale(null, 0), true);
});

test('lease period key + 2–4 PM window (Eastern)', () => {
  const at = (iso) => Date.parse(iso);
  // Nov 13 2026, EST = UTC-5
  assert.equal(c.leasePeriodKey(at('2026-11-13T18:59:00Z')), '2026-11-13'); // 1:59 PM → due today
  assert.equal(c.leasePeriodKey(at('2026-11-13T19:00:00Z')), '2026-11-14'); // 2:00 PM → next period
  assert.equal(c.leaseWindow(at('2026-11-13T18:59:00Z')), 'before_window');
  assert.equal(c.leaseWindow(at('2026-11-13T20:30:00Z')), 'in_window');
  assert.equal(c.leaseWindow(at('2026-11-13T21:00:00Z')), 'after_window');
});

test('lease: $110 card → covered, $35 credit; next day $0 card → $40 envelope', () => {
  const day1 = c.settleLease({ creditInCents: 0, cardFaresCents: 11000, cardTipsCents: 0 });
  assert.deepEqual(day1, { leaseDueCents: 7500, availableCents: 11000, envelopeCents: 0, creditOutCents: 3500, coveredByCard: true });
  const day2 = c.settleLease({ creditInCents: day1.creditOutCents, cardFaresCents: 0, cardTipsCents: 0 });
  assert.equal(day2.envelopeCents, 4000);
  assert.equal(day2.creditOutCents, 0);
  assert.equal(c.settleLease({ creditInCents: 0, cardFaresCents: 0, cardTipsCents: 0, discountCents: 500 }).envelopeCents, 7000);
});

test('4 PM lockout only when uncovered and no envelope', () => {
  const late = Date.parse('2026-11-13T21:05:00Z');
  const uncovered = { coveredByCard: false };
  assert.equal(c.leaseLockout({ now: late, settlement: uncovered, envelopeLogged: false }), true);
  assert.equal(c.leaseLockout({ now: late, settlement: uncovered, envelopeLogged: true }), false);
  assert.equal(c.leaseLockout({ now: late, settlement: { coveredByCard: true }, envelopeLogged: false }), false);
  assert.equal(c.leaseLockout({ now: Date.parse('2026-11-13T20:00:00Z'), settlement: uncovered, envelopeLogged: false }), false);
});

test('envelope mismatch', () => {
  assert.equal(c.envelopeMismatch(4000, 4000), 0);
  assert.equal(c.envelopeMismatch(4000, 3000), -1000);
});

test('close out: $300 credit → $112.50 check; under $75 → owes difference', () => {
  assert.deepEqual(c.closeOut({ creditCents: 30000 }), { afterFinalDayCents: 22500, payoutCents: 11250, owedCents: 0 });
  assert.equal(c.fmt(c.closeOut({ creditCents: 30000 }).payoutCents), '$112.50');
  assert.deepEqual(c.closeOut({ creditCents: 5000 }), { afterFinalDayCents: -2500, payoutCents: 0, owedCents: 2500 });
  assert.equal(c.closeOut({ creditCents: 7501 }).payoutCents, 1); // rounds half-cent
});
