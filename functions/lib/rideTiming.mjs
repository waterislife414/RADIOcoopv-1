// Pickup timing for app rides: the "about 4 minutes away" alert, free and
// paid cancels, the wait clock, no-shows, place in line and rider perks.
// Pure functions shared by the server (which decides) and the screens
// (which show the same numbers), so both always agree.

export const DEFAULT_RULES = {
  headsUpMinutes: 4,
  minFreeCancelMinutes: 1,
  lateCancelFee: 5,
  waitGraceMinutes: 2,
  noShowAfterMinutes: 7,
  noShowFee: 10,
  nearPickupMeters: 250,
  avgCitySpeedMph: 25,
  roadFactor: 1.35,
  upsellAgainAfterMinutes: 4,
};

const MIN = 60_000;

export const rulesFrom = (cfg) => ({ ...DEFAULT_RULES, ...(cfg || {}) });

const isPoint = (p) => !!p && Number.isFinite(p.lat) && Number.isFinite(p.lng);

export function distanceMeters(a, b) {
  if (!isPoint(a) || !isPoint(b)) return null;
  const R = 6371000;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Rough drive time in whole minutes: straight line x road factor at city speed. No routing service, no bill. */
export function etaMinutes(from, to, rules = DEFAULT_RULES) {
  const d = distanceMeters(from, to);
  if (d == null) return null;
  const metersPerMinute = rules.avgCitySpeedMph * 26.8224; // mph -> m/min
  return Math.max(1, Math.ceil((d * rules.roadFactor) / metersPerMinute));
}

export const pickupPoint = (ride) =>
  ride && Number.isFinite(ride.pickupLat) && Number.isFinite(ride.pickupLng) ? { lat: ride.pickupLat, lng: ride.pickupLng } : null;

/**
 * An app ride: booked in the app by a signed-in rider who shares their
 * location. Call-in rides (phone, office queue, no location) and guests
 * without an account never pay these fees: same as it has always been.
 */
export function isAppRide(ride) {
  if (!ride) return false;
  // Set when the ride is booked (see dispatchEngine.officeReasons).
  if (typeof ride.appHandled === "boolean") return ride.appHandled;
  if (ride.source === "phone" || ride.callIn) return false;
  return !!ride.customerId && ride.customerId !== "guest";
}

export const shouldSendHeadsUp = (ride, eta, rules = DEFAULT_RULES) =>
  ride?.status === "dispatched" && ride.headsUpAt == null && ride.arrivedAt == null && eta != null && eta <= rules.headsUpMinutes;

/**
 * Free cancelling ends when the "driver is close" alert goes out (or he
 * arrives), but never sooner than minFreeCancelMinutes after he took the call.
 * Null = no alert yet, still free.
 */
export function freeCancelEndsAt(ride, rules = DEFAULT_RULES) {
  // An "I'm here" from far away (arrivedNear false) doesn't end free cancelling.
  const alertAt = ride?.headsUpAt ?? (ride?.arrivedNear === false ? null : ride?.arrivedAt) ?? null;
  if (alertAt == null) return null;
  return Math.max(alertAt, (ride.assignedAt ?? alertAt) + rules.minFreeCancelMinutes * MIN);
}

/** What cancelling right now costs the rider, in cents. */
export function cancelQuote(ride, nowMs, rules = DEFAULT_RULES) {
  if (!ride) return { allowed: false, reason: "gone" };
  if (ride.status === "pending" && !ride.driverId) return { allowed: true, feeCents: 0, why: "no_driver" };
  if (ride.status !== "dispatched") return { allowed: false, reason: ride.status === "in_transit" ? "riding" : "done" };
  if (!isAppRide(ride)) return { allowed: false, reason: "call_office" };
  const ends = freeCancelEndsAt(ride, rules);
  if (ends == null || nowMs < ends) return { allowed: true, feeCents: 0, why: "free", freeUntil: ends };
  return { allowed: true, feeCents: Math.round(rules.lateCancelFee * 100), why: "driver_close" };
}

/** The wait clock after the driver taps "I'm here". */
export function waitClock(ride, nowMs, rules = DEFAULT_RULES) {
  if (ride?.arrivedAt == null) return null;
  const end = ride.pickedUpAt ?? nowMs;
  const meterAt = ride.arrivedAt + rules.waitGraceMinutes * MIN;
  const noShowAt = ride.arrivedAt + rules.noShowAfterMinutes * MIN;
  return {
    waitedMs: Math.max(0, end - ride.arrivedAt),
    meterAt,
    noShowAt,
    meterOn: end >= meterAt,
    noShowOpen: end >= noShowAt,
  };
}

/** Can the driver mark a no-show now, and does the rider pay (cents)? */
export function noShowCheck(ride, nowMs, rules = DEFAULT_RULES) {
  if (!ride || ride.status !== "dispatched") return { allowed: false, error: "That call isn't waiting on a pickup." };
  if (!isAppRide(ride)) return { allowed: true, feeCents: 0 };
  if (ride.arrivedAt == null) return { allowed: false, error: "Tap “I'm here” first. The no-show clock starts when you arrive." };
  const clock = waitClock(ride, nowMs, rules);
  if (!clock.noShowOpen) {
    return { allowed: false, error: `No-show opens ${rules.noShowAfterMinutes} minutes after you arrive.`, opensAt: clock.noShowAt };
  }
  const near = Number.isFinite(ride.arrivedDistM) && ride.arrivedDistM <= rules.nearPickupMeters;
  // Riders who need extra time (accessible vehicle, or flagged by the office) never pay it.
  if (ride.extraTime || ride.needsAccessibleVehicle) return { allowed: true, feeCents: 0, near, waived: true };
  // The rider tapped "I'm at the car" after he arrived: no fee; the office sorts it out.
  if (ride.riderReply?.reply === "here" && ride.riderReply.at >= ride.arrivedAt) {
    return { allowed: true, feeCents: 0, near, disputed: true };
  }
  return { allowed: true, feeCents: near ? Math.round(rules.noShowFee * 100) : 0, near };
}

/** Line order: Premium members and Day Pass riders together (by booking time), then everyone else. Owner decision Nov 18, 2026. */
export const PRIORITY_RANK = { premium: 0, vip: 0 };
const rank = (r) => PRIORITY_RANK[r.priority] ?? 2;

/** 1 = next up. `waiting` = rides still waiting for a driver in the same line, each { id, priority, createdMs }. */
export function queuePosition(me, waiting) {
  const mine = rank(me);
  return (
    waiting.filter(
      (r) => r.id !== me.id && (rank(r) < mine || (rank(r) === mine && (r.createdMs || 0) < (me.createdMs || 0)))
    ).length + 1
  );
}

/** Live map and Call-your-driver, from the rider's membership and Day Pass. */
export function perksFor({ tier, dayPass } = {}, perkCfg = {}) {
  const has = (list) => (list || []).some((k) => (k === "DAY_PASS" ? !!dayPass : !!tier && k === tier));
  return { liveMap: has(perkCfg.liveMap), callDriver: has(perkCfg.callDriver) };
}

/** Midnight tonight in the company's time zone: when a Day Pass runs out. */
export function endOfLocalDay(nowMs, timeZone = "America/New_York") {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = (ms) => Object.fromEntries(fmt.formatToParts(ms).map((p) => [p.type, p.value]));
  const p = parts(nowMs);
  const wall = Date.UTC(+p.year, +p.month - 1, +p.day + 1, 0, 0);
  let ms = wall;
  for (let i = 0; i < 2; i++) {
    const q = parts(ms);
    ms += wall - Date.UTC(+q.year, +q.month - 1, +q.day, +q.hour, +q.minute);
  }
  return ms;
}

/** "1:05" from milliseconds. */
export function clockText(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** "next up", "2nd in line", "3rd in line"... */
export function lineText(pos) {
  if (pos <= 1) return "next up";
  const s = pos % 100 >= 11 && pos % 100 <= 13 ? "th" : { 1: "st", 2: "nd", 3: "rd" }[pos % 10] || "th";
  return `${pos}${s} in line`;
}

/**
 * A Priority Day Pass is good for any of the buyer's rides until midnight.
 * A guest's pass (no account to tie it to) covers one ride, as do passes
 * bought before passes ran all day.
 */
export function isDayPassValid(pass, customerId, rideId, nowMs) {
  if (!pass || pass.status !== "succeeded") return false;
  if (pass.expiresAt == null || pass.uid === "guest") {
    if (pass.expiresAt != null && nowMs >= pass.expiresAt) return false;
    return !pass.rideId || pass.rideId === rideId;
  }
  return nowMs < pass.expiresAt && pass.uid === customerId;
}
