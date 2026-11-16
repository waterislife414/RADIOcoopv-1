// dispatchCore.mjs — pure dispatch, lease and close-out logic for Radio Co-op.
// No Firebase imports. Shared by the frontend (Vite: import from
// '../../functions/lib/dispatchCore.mjs') and Cloud Functions
// (CommonJS: const core = await import('./lib/dispatchCore.mjs')).
// All money is integer cents. All times are epoch milliseconds.

export const DEFAULTS = Object.freeze({
  offer: { pings: 3, pingIntervalSec: 15 },
  maxWarnings: 3,
  dropOffPlacement: 'front', // 'front' | 'back'
  timeZone: 'America/New_York',
  lease: {
    dailyCents: 7500,
    dueStart: '14:00',
    dueEnd: '16:00',
    exitPayoutPct: 50,
    includeTips: true,
  },
  autoPlaceParkedMin: 2,
});

// Driver statuses
export const STATUS = Object.freeze({
  OFFLINE: 'offline',
  MOVING: 'moving',
  READY: 'ready',       // red dot, waiting in a zone line
  OFFERED: 'offered',   // red dot, currently being pinged
  ON_CALL: 'on_call',   // green dot, has a ride, stays in pickup zone until drop-off
  SUSPENDED: 'suspended',
  CLOSED: 'closed',
});

const WAITING = new Set([STATUS.READY, STATUS.OFFERED]);
const AVAILABLE = new Set([STATUS.READY, STATUS.MOVING]);

const byLineKey = (a, b) => (a.lineKey ?? 0) - (b.lineKey ?? 0);

// ---------------------------------------------------------------------------
// Zone line + board

/**
 * Ordered line for one zone: green (on call) first, then red (waiting).
 * @param {Array<{id:string,status:string,zoneId:string,lineKey:number}>} drivers
 */
export function zoneLine(drivers, zoneId) {
  const inZone = drivers.filter((d) => d.zoneId === zoneId);
  const onCall = inZone.filter((d) => d.status === STATUS.ON_CALL).sort(byLineKey);
  const waiting = inZone.filter((d) => WAITING.has(d.status)).sort(byLineKey);
  return [
    ...onCall.map((d) => ({ ...d, dot: 'green' })),
    ...waiting.map((d) => ({ ...d, dot: 'red' })),
  ];
}

/**
 * Position in line ("3rd out") and calls until this driver's turn.
 * position = onCall + waitingAhead + 1; callsUntilYou = waitingAhead.
 */
export function linePosition(line, driverId) {
  const idx = line.findIndex((d) => d.id === driverId);
  if (idx === -1) return null;
  const me = line[idx];
  const waitingAhead = line.slice(0, idx).filter((d) => d.dot === 'red').length;
  return {
    position: idx + 1,
    callsUntilYou: me.dot === 'red' ? waitingAhead : 0,
    onCall: me.dot === 'green',
  };
}

/**
 * Whole board for a viewer. Driver view marks the viewer's own dot blue
 * ('ring' while waiting, 'filled' on call) and hides zones he isn't certified for.
 */
export function buildBoard({ drivers, zones, viewerId = null, viewer = null, now = Date.now() }) {
  const moving = drivers.filter((d) => d.status === STATUS.MOVING);
  const visibleZones = zones.filter((z) => {
    if (!viewer || !z.requiresCert) return true;
    return hasCert(viewer, z.requiresCert, now);
  });
  const rows = visibleZones.map((z) => {
    const line = zoneLine(drivers, z.id).map((d) => {
      if (viewerId && d.id === viewerId) {
        return { ...d, dot: d.dot === 'green' ? 'blue-filled' : 'blue-ring', me: true };
      }
      return d;
    });
    return { zoneId: z.id, label: z.label, line };
  });
  let me = null;
  if (viewerId) {
    for (const r of rows) {
      const raw = zoneLine(drivers, r.zoneId);
      const pos = linePosition(raw, viewerId);
      if (pos) { me = { zoneId: r.zoneId, label: r.label, ...pos }; break; }
    }
    if (!me && moving.some((d) => d.id === viewerId)) me = { moving: true };
  }
  return { moving, rows, me };
}

export function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ---------------------------------------------------------------------------
// Eligibility (certifications)

export function hasCert(driver, cert, now = Date.now()) {
  const c = driver?.certs?.[cert];
  if (!c || c.status !== 'approved') return false;
  if (c.expiresAt && c.expiresAt <= now) return false;
  return true;
}

/** Driver can take this ride: holds every required cert; wheelchair also needs a van today. */
export function isEligible(driver, ride, vehiclesByCar = {}, now = Date.now()) {
  const required = ride.requiresCerts || [];
  for (const cert of required) {
    if (!hasCert(driver, cert, now)) return false;
  }
  if (required.includes('wheelchair')) {
    const v = vehiclesByCar[driver.carNumber];
    if (!v || !v.isVan) return false;
  }
  return true;
}

/** Certs a ride needs from its zones and booking options. */
export function requiredCertsForRide({ pickupZone, dropZone, wheelchair }) {
  const certs = new Set();
  if (pickupZone?.requiresCert) certs.add(pickupZone.requiresCert);
  if (dropZone?.requiresCert) certs.add(dropZone.requiresCert);
  if (wheelchair) certs.add('wheelchair');
  return [...certs];
}

// ---------------------------------------------------------------------------
// Ride priority: Premium > $5 VIP pass > everyone else, then oldest first.

const PRIORITY_RANK = { premium: 0, vip: 1 };
export function priorityRank(ride) {
  return PRIORITY_RANK[ride.priority] ?? 2;
}
export function sortPendingRides(rides) {
  return [...rides].sort(
    (a, b) => priorityRank(a) - priorityRank(b) || (a.createdAt ?? 0) - (b.createdAt ?? 0),
  );
}

// ---------------------------------------------------------------------------
// Who gets the offer

/**
 * @returns {{driverId:string, kind:'requested'|'zone'} | {broadcast:true}}
 * - Requested driver first (if eligible, available, and hasn't declined it).
 * - Else first eligible red driver in the pickup zone's line who hasn't been tried.
 *   Ineligible drivers are skipped and keep their spot.
 * - Else broadcast "Need a car in [zone]".
 */
export function pickDriverForRide(ride, drivers, vehiclesByCar = {}, now = Date.now()) {
  const tried = new Set(ride.triedDriverIds || []);
  if (ride.requestedDriverId && !tried.has(ride.requestedDriverId)) {
    const req = drivers.find((d) => d.id === ride.requestedDriverId);
    if (req && AVAILABLE.has(req.status) && isEligible(req, ride, vehiclesByCar, now)) {
      return { driverId: req.id, kind: 'requested' };
    }
  }
  const line = zoneLine(drivers, ride.zoneId);
  const next = line.find(
    (d) => d.status === STATUS.READY && !tried.has(d.id) && isEligible(d, ride, vehiclesByCar, now),
  );
  if (next) return { driverId: next.id, kind: 'zone' };
  return { broadcast: true };
}

/** Drivers who should get a "Need a car in [zone]" broadcast. */
export function broadcastRecipients(ride, drivers, vehiclesByCar = {}, now = Date.now()) {
  const tried = new Set(ride.triedDriverIds || []);
  return drivers
    .filter((d) => AVAILABLE.has(d.status) && !tried.has(d.id) && isEligible(d, ride, vehiclesByCar, now))
    .map((d) => d.id);
}

// ---------------------------------------------------------------------------
// Offer pings: 3 alerts, then it counts as no answer.

/**
 * @param {{startedAt:number, pingsSent:number}} offer
 * @returns {{action:'ping', ping:number} | {action:'expire'} | {action:'wait', nextAt:number}}
 */
export function offerTick(offer, now, cfg = DEFAULTS.offer) {
  const interval = cfg.pingIntervalSec * 1000;
  const sent = offer.pingsSent ?? 0;
  if (sent < cfg.pings) {
    const dueAt = offer.startedAt + sent * interval;
    if (now >= dueAt) return { action: 'ping', ping: sent + 1 };
    return { action: 'wait', nextAt: dueAt };
  }
  const expireAt = offer.startedAt + cfg.pings * interval;
  if (now >= expireAt) return { action: 'expire' };
  return { action: 'wait', nextAt: expireAt };
}

/**
 * Driver missed (no answer after 3 pings) or declined.
 * Requested rides: no penalty, driver keeps his spot.
 * Otherwise: off the board, +1 warning, suspended at maxWarnings.
 * @returns patch to apply to the driver doc
 */
export function applyMiss(driver, { requested = false } = {}, maxWarnings = DEFAULTS.maxWarnings) {
  if (requested) return { status: driver.zoneId ? STATUS.READY : STATUS.MOVING };
  const warnings = (driver.warnings ?? 0) + 1;
  return {
    warnings,
    status: warnings >= maxWarnings ? STATUS.SUSPENDED : STATUS.OFFLINE,
    zoneId: null,
    lineKey: null,
  };
}

/** Driver accepted: green dot stays in the pickup zone until drop-off. */
export function applyAccept(driver, ride) {
  return { status: STATUS.ON_CALL, zoneId: ride.zoneId ?? driver.zoneId ?? null, lineKey: driver.lineKey ?? Date.now() };
}

/**
 * Dispatcher moves a car on the board by hand.
 * 'ready' = back of zoneId's line, 'front' = next up in zoneId,
 * 'moving' = on the board, no line, 'off' = off the board.
 */
export function dispatcherMove(drivers, driverId, action, zoneId, now = Date.now()) {
  if (action === 'ready') return { status: STATUS.READY, zoneId, lineKey: now };
  if (action === 'front') return applyDropOff(drivers, driverId, zoneId, 'front', now);
  if (action === 'moving') return { status: STATUS.MOVING, zoneId: null, lineKey: null };
  if (action === 'off') return { status: STATUS.OFFLINE, zoneId: null, lineKey: null };
  // A call he took over the radio: green in his zone until he drops off.
  if (action === 'radio_call') return { status: STATUS.ON_CALL, zoneId: zoneId ?? null, lineKey: null };
  return null;
}

/**
 * Drop-off: green leaves pickup zone; driver goes into the drop zone's line.
 * 'front' = ahead of every red in that zone ("next up"); 'back' = end of line.
 * dropZoneId null (outside all zones) → Moving.
 */
export function applyDropOff(drivers, driverId, dropZoneId, placement = DEFAULTS.dropOffPlacement, now = Date.now()) {
  if (!dropZoneId) return { status: STATUS.MOVING, zoneId: null, lineKey: null };
  const waiting = drivers.filter((d) => d.id !== driverId && d.zoneId === dropZoneId && WAITING.has(d.status));
  let lineKey = now;
  if (placement === 'front' && waiting.length) {
    lineKey = Math.min(...waiting.map((d) => d.lineKey ?? now)) - 1;
  }
  return { status: STATUS.READY, zoneId: dropZoneId, lineKey };
}

/** Check Ready: GPS must be inside the zone the driver picks. */
export function applyCheckReady(driverZoneFromGps, now = Date.now()) {
  if (!driverZoneFromGps) return { error: 'not_in_zone' };
  return { status: STATUS.READY, zoneId: driverZoneFromGps, lineKey: now };
}

// ---------------------------------------------------------------------------
// GPS

/** Ray-casting point-in-polygon. polygon = GeoJSON Polygon coordinates ([[lng,lat],...] rings). */
export function pointInPolygon(lng, lat, polygon) {
  const rings = polygon.coordinates ?? polygon;
  let inside = false;
  const outer = rings[0];
  for (let i = 0, j = outer.length - 1; i < outer.length; j = i++) {
    const [xi, yi] = outer[i];
    const [xj, yj] = outer[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  if (!inside) return false;
  for (let r = 1; r < rings.length; r++) {
    if (pointInPolygon(lng, lat, [rings[r]])) return false; // inside a hole
  }
  return true;
}

/**
 * Zone outline as polygon rings. Firestore can't store nested arrays, so
 * zones are saved as points: [{lat, lng}, ...]; GeoJSON `polygon` also works.
 */
export function zonePolygon(zone) {
  if (zone?.points?.length >= 3) return [zone.points.map((p) => [p.lng, p.lat])];
  if (zone?.polygon) return zone.polygon.coordinates ?? zone.polygon;
  return null;
}

/** First zone containing the point, or null. */
export function zoneForPoint(zones, lng, lat) {
  const z = zones.find((zone) => {
    const poly = zonePolygon(zone);
    return poly && pointInPolygon(lng, lat, poly);
  });
  return z ? z.id : null;
}

/** Straight-line distance in meters (for "moved far enough to report"). */
export function metersBetween(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * One GPS fix against a driver's board state. A waiting (red) driver who
 * stays outside his zone for outOfZoneMin goes to Moving. On-call drivers
 * are left alone: they leave the zone to run the call.
 * Returns { outOfZoneSince, board } where board is a patch or null.
 */
export function applyLocation({ status, zoneId, outOfZoneSince = null }, gpsZoneId, now, outOfZoneMin = 3) {
  if (!WAITING.has(status) || (gpsZoneId && gpsZoneId === zoneId)) return { outOfZoneSince: null, board: null };
  const since = outOfZoneSince ?? now;
  if (status === STATUS.READY && now - since >= outOfZoneMin * 60 * 1000) {
    return {
      outOfZoneSince: null,
      board: { status: STATUS.MOVING, zoneId: null, lineKey: null, lastEvent: { type: 'left_zone', zoneId, at: now } },
    };
  }
  return { outOfZoneSince: since, board: null };
}

/**
 * Parked auto-place: a Ready driver parked inside a DIFFERENT zone than the
 * one he checked ready in, continuously for parkedMin minutes, moves to the
 * back of that zone's line.
 */
export function parkedAutoPlace(driver, zoneIdNow, now, parkedMin = DEFAULTS.autoPlaceParkedMin, parkedSinceMs = null, parkedZoneId = null) {
  if (driver.status !== STATUS.READY || !zoneIdNow || zoneIdNow === driver.zoneId) {
    return { parkedSinceMs: null, parkedZoneId: null, patch: null };
  }
  const sameZone = zoneIdNow === parkedZoneId;
  const since = sameZone && parkedSinceMs != null ? parkedSinceMs : now;
  const zoneChanged = !sameZone;

  if (zoneChanged) {
    return { parkedSinceMs: now, parkedZoneId: zoneIdNow, patch: null };
  }

  if (now - since >= parkedMin * 60 * 1000) {
    return {
      parkedSinceMs: null,
      parkedZoneId: null,
      patch: { status: STATUS.READY, zoneId: zoneIdNow, lineKey: now },
    };
  }
  return { parkedSinceMs: since, parkedZoneId: zoneIdNow, patch: null };
}

/** Sweep: a waiting or moving driver whose phone stopped reporting falls off the board. */
export function staleLocationPatch({ status, zoneId = null }, lastLocationAt, now, staleMin = 3) {
  if (status !== STATUS.READY && status !== STATUS.MOVING) return null;
  if (!isLocationStale({ at: lastLocationAt }, now, staleMin)) return null;
  return { status: STATUS.OFFLINE, zoneId: null, lineKey: null, lastEvent: { type: 'gps_lost', zoneId, at: now } };
}

/** Statuses that keep the phone's location "live" for the stale sweep. */
export const isLive = (status) => AVAILABLE.has(status);

/** Location older than staleMin → driver falls off the board. */
export function isLocationStale(lastLocation, now, staleMin = 3) {
  if (lastLocation?.at == null) return true;
  return now - lastLocation.at > staleMin * 60 * 1000;
}

// ---------------------------------------------------------------------------
// Time helpers (company local time)

function localParts(ms, timeZone) {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  const p = Object.fromEntries(f.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
}
const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

const WEEKDAY = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
function localWeekday(ms, timeZone) {
  return WEEKDAY[new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(new Date(ms))];
}

/**
 * Wall-clock "YYYY-MM-DDTHH:mm" (an <input type="datetime-local"> value) in
 * the company's time zone → epoch ms. Returns null if unparseable.
 */
export function parseLocalDateTime(value, timeZone = DEFAULTS.timeZone) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(value || ''));
  if (!m) return null;
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  let ms = wall;
  for (let i = 0; i < 2; i++) {
    const p = localParts(ms, timeZone);
    const [y, mo, d] = p.date.split('-').map(Number);
    const seen = Date.UTC(y, mo - 1, d, Math.floor(p.minutes / 60), p.minutes % 60);
    ms += wall - seen;
  }
  return ms;
}

// ---------------------------------------------------------------------------
// Dispatch mode: manual (dispatcher only), auto, or scheduled (auto during
// windows, e.g. nights). Windows: [{ days:[0..6], start:'22:00', end:'06:00' }]
// where days are the days the window STARTS on (0 = Sunday).

export function isAutoDispatch(settings, now = Date.now(), timeZone = DEFAULTS.timeZone) {
  const mode = settings?.mode ?? 'manual';
  if (mode === 'auto') return true;
  if (mode !== 'scheduled') return false;
  const { minutes } = localParts(now, timeZone);
  const day = localWeekday(now, timeZone);
  const prev = (day + 6) % 7;
  return (settings.windows || []).some((w) => {
    const s = toMin(w.start);
    const e = toMin(w.end);
    const days = w.days ?? [0, 1, 2, 3, 4, 5, 6];
    if (s < e) return days.includes(day) && minutes >= s && minutes < e;
    return (days.includes(day) && minutes >= s) || (days.includes(prev) && minutes < e);
  });
}

/**
 * Outcome of a missed or declined offer for the board and driver records.
 * Requested rides: no penalty, he keeps his spot. Otherwise off the board,
 * +1 warning, suspended (come back to the shop) at maxWarnings.
 */
export function missOutcome({ board, driver, kind, reason = 'missed', now = Date.now(), maxWarnings = DEFAULTS.maxWarnings }) {
  if (kind === 'requested') {
    return { board: { status: board.zoneId ? STATUS.READY : STATUS.MOVING }, driver: null };
  }
  const p = applyMiss({ ...board, warnings: driver?.warnings ?? 0 }, {}, maxWarnings);
  const suspended = p.status === STATUS.SUSPENDED;
  return {
    board: {
      status: STATUS.OFFLINE,
      zoneId: null,
      lineKey: null,
      lastEvent: { type: reason === 'declined' ? 'declined' : 'missed_call', at: now, warnings: p.warnings, suspended },
    },
    driver: { warnings: p.warnings, ...(suspended ? { status: STATUS.SUSPENDED } : {}) },
  };
}

/**
 * Lease period key. A period runs from dueStart (2 PM) to the next day's 2 PM
 * and is keyed by the date it ends on (the day its lease is due).
 */
export function leasePeriodKey(ms, cfg = DEFAULTS) {
  const { date, minutes } = localParts(ms, cfg.timeZone);
  if (minutes < toMin(cfg.lease.dueStart)) return date;
  const next = localParts(ms + 24 * 3600 * 1000, cfg.timeZone).date;
  return next;
}

/** 'before_window' | 'in_window' (2–4 PM) | 'after_window' */
export function leaseWindow(ms, cfg = DEFAULTS) {
  const { minutes } = localParts(ms, cfg.timeZone);
  if (minutes < toMin(cfg.lease.dueStart)) return 'before_window';
  if (minutes < toMin(cfg.lease.dueEnd)) return 'in_window';
  return 'after_window';
}

// ---------------------------------------------------------------------------
// Lease settlement ($75/day, card money rolls forward forever)

/**
 * @param {{creditInCents:number, cardFaresCents:number, cardTipsCents:number, discountCents?:number}} p
 * @returns {{leaseDueCents, availableCents, envelopeCents, creditOutCents, coveredByCard:boolean}}
 */
export function settleLease(p, leaseCfg = DEFAULTS.lease) {
  const leaseDue = Math.max(0, leaseCfg.dailyCents - (p.discountCents ?? 0));
  const card = (p.cardFaresCents ?? 0) + (leaseCfg.includeTips ? (p.cardTipsCents ?? 0) : 0);
  const available = (p.creditInCents ?? 0) + card;
  if (available >= leaseDue) {
    return { leaseDueCents: leaseDue, availableCents: available, envelopeCents: 0, creditOutCents: available - leaseDue, coveredByCard: true };
  }
  return { leaseDueCents: leaseDue, availableCents: available, envelopeCents: leaseDue - available, creditOutCents: 0, coveredByCard: false };
}

/**
 * Can the driver Check Ready? Locked out after 4 PM if the lease isn't covered
 * by card credit and no envelope is logged.
 */
export function leaseLockout({ now, settlement, envelopeLogged }, cfg = DEFAULTS) {
  if (settlement.coveredByCard || envelopeLogged) return false;
  return leaseWindow(now, cfg) === 'after_window';
}

/** Local calendar date (YYYY-MM-DD) in the company's time zone. */
export function localDateKey(ms, timeZone = DEFAULTS.timeZone) {
  return localParts(ms, timeZone).date;
}

/**
 * Locked out for an unpaid lease? owedPeriodKey is the due date of the
 * oldest unpaid envelope. Locked once that day's window (2–4 PM) has passed.
 */
export function leaseLocked({ owedCents, owedPeriodKey, now }, cfg = DEFAULTS) {
  if (!owedCents || owedCents <= 0) return false;
  const today = localParts(now, cfg.timeZone).date;
  if (!owedPeriodKey || owedPeriodKey < today) return true;
  if (owedPeriodKey > today) return false;
  return leaseWindow(now, cfg) === 'after_window';
}

/** Driver's share of a settled card ride: meter fare + tip (card fee and VIP pass stay with the company). */
export function cardCreditCents(ride, leaseCfg = DEFAULTS.lease) {
  if (!ride || ride.paymentMethod === 'cash' || ride.finalFare == null) return null;
  if (!['succeeded', 'wallet_charge'].includes(ride.stripeStatus)) return null;
  const fareCents = Math.round(Number(ride.finalFare) * 100);
  const tipCents = leaseCfg.includeTips ? Math.round(Number(ride.tipAmount || 0) * 100) : 0;
  if (!(fareCents > 0)) return null;
  return { fareCents, tipCents };
}

// ---------------------------------------------------------------------------
// Score + clean-period bonus. A strike = a missed or declined call when he
// was next up (requested calls never count). Score = 100 minus points per
// strike in the last scoreWindowDays. Bonus: every bonusPeriodDays, a driver
// who worked at least bonusMinDays and stayed under strikesToForfeit gets
// bonusCents of lease credit ("$5 off the lick").

export const INCENTIVE_DEFAULTS = Object.freeze({
  bonusCents: 500,
  bonusPeriodDays: 14,
  bonusAnchor: '2026-11-02',
  strikesToForfeit: 2,
  bonusMinDays: 5,
  scoreStrikePoints: 10,
  scoreWindowDays: 60, // warnings and incidents stay on the profile this long
  lowScore: 70, // below this: no app calls for lowScoreHoldHours
  lowScoreHoldHours: 12,
  holdCreditAfterDays: 60, // clean this long -> may hold lease credit for a day
  penaltyPoints: { accident: 30, no_show: 15, complaint: 10, write_up: 20, other: 5 },
});

const dayNumber = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
};
const keyFromDayNumber = (n) => new Date(n * 86400000).toISOString().slice(0, 10);

/** The bonus period containing `now`: { startKey, endKey (exclusive), index }. */
export function incentivePeriod(now, inc = INCENTIVE_DEFAULTS, timeZone = DEFAULTS.timeZone) {
  const today = dayNumber(localParts(now, timeZone).date);
  const anchor = dayNumber(inc.bonusAnchor);
  const index = Math.floor((today - anchor) / inc.bonusPeriodDays);
  const start = anchor + index * inc.bonusPeriodDays;
  return { index, startKey: keyFromDayNumber(start), endKey: keyFromDayNumber(start + inc.bonusPeriodDays) };
}

/** Add a strike; keep only the score window. Returns { recentStrikes, score }. */
export function recordStrike(recentStrikes = [], now, inc = INCENTIVE_DEFAULTS) {
  return scoreFrom([...recentStrikes, now], now, inc);
}

/** Drop strikes older than the score window and score what's left. */
export function scoreFrom(recentStrikes = [], now, inc = INCENTIVE_DEFAULTS) {
  const cutoff = now - inc.scoreWindowDays * 86400000;
  const kept = recentStrikes.filter((t) => t > cutoff).sort((a, b) => a - b);
  return { recentStrikes: kept, score: Math.max(0, 100 - kept.length * inc.scoreStrikePoints) };
}

const toMs = (v) => (v && typeof v.toMillis === 'function' ? v.toMillis() : v ?? 0);

/**
 * A driver's standing right now: strikes (missed/declined calls) and office
 * penalties from the last scoreWindowDays, the score they add up to, and
 * how many warnings are active (strikes since the office last cleared them).
 */
export function standing(driver = {}, now, inc = INCENTIVE_DEFAULTS) {
  const cutoff = now - inc.scoreWindowDays * 86400000;
  const recentStrikes = (driver.recentStrikes || []).filter((t) => t > cutoff).sort((a, b) => a - b);
  const penalties = (driver.penalties || []).filter((p) => p.at > cutoff);
  const lost = recentStrikes.length * inc.scoreStrikePoints + penalties.reduce((s, p) => s + (p.points || 0), 0);
  const warnings = recentStrikes.filter((t) => t > (driver.warningsClearedAt || 0)).length;
  return { recentStrikes, penalties, score: Math.max(0, 100 - lost), warnings };
}

/** New penalty dropped the score under the line -> no app calls until this time (else null). */
export function callHoldUntil(score, now, inc = INCENTIVE_DEFAULTS) {
  return score < inc.lowScore ? now + inc.lowScoreHoldHours * 3600000 : null;
}

/** May this driver hold his lease credit for a day? Needs holdCreditAfterDays driving with a clean record. */
export function canHoldCredit(driver = {}, now, inc = INCENTIVE_DEFAULTS) {
  const since = toMs(driver.approvedAt);
  if (!since || now - since < inc.holdCreditAfterDays * 86400000) return { ok: false, reason: 'too_new' };
  const s = standing(driver, now, inc);
  if (s.recentStrikes.length || s.penalties.length || driver.status === 'suspended') return { ok: false, reason: 'record' };
  return { ok: true };
}

/** Strikes between two local date keys [startKey, endKey). */
export function strikesBetween(recentStrikes = [], startKey, endKey, timeZone = DEFAULTS.timeZone) {
  const from = parseLocalDateTime(`${startKey}T00:00`, timeZone);
  const to = parseLocalDateTime(`${endKey}T00:00`, timeZone);
  return recentStrikes.filter((t) => t >= from && t < to).length;
}

/** Bonus decision for one finished period. */
export function bonusOutcome({ strikes, workedDays }, inc = INCENTIVE_DEFAULTS) {
  if (workedDays < inc.bonusMinDays) return { award: false, reason: 'not_enough_days' };
  if (strikes >= inc.strikesToForfeit) return { award: false, reason: 'strikes' };
  return { award: true, cents: inc.bonusCents };
}

/** Envelope counted at the safe: flag if amount differs from what was logged. */
export function envelopeMismatch(loggedCents, receivedCents) {
  return loggedCents !== receivedCents ? receivedCents - loggedCents : 0;
}

// ---------------------------------------------------------------------------
// Close out (quit or fired): take that day's lease, pay half of what's left.

/**
 * @param {{creditCents:number}} p credit including that day's card money
 * @returns {{afterFinalDayCents, payoutCents, owedCents}}
 */
export function closeOut({ creditCents }, leaseCfg = DEFAULTS.lease) {
  const after = creditCents - leaseCfg.dailyCents;
  if (after <= 0) return { afterFinalDayCents: after, payoutCents: 0, owedCents: -after };
  return { afterFinalDayCents: after, payoutCents: Math.round((after * leaseCfg.exitPayoutPct) / 100), owedCents: 0 };
}

export const fmt = (cents) => `$${(cents / 100).toFixed(2)}`;
