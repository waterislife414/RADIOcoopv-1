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
  return { status: STATUS.ON_CALL, zoneId: ride.zoneId, lineKey: driver.lineKey ?? Date.now() };
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

/** First zone containing the point, or null. */
export function zoneForPoint(zones, lng, lat) {
  const z = zones.find((zone) => zone.polygon && pointInPolygon(lng, lat, zone.polygon));
  return z ? z.id : null;
}

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
