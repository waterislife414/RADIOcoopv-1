// The app watching itself (owner request Nov 23, 2026: "good backend work so nothing
// falls apart and the app improves by itself"). Pure rules, tested; Cloud Functions in
// functions/selfCheck.js run them on a schedule.

export const SELF_CHECK_DEFAULTS = Object.freeze({
  settlingStuckMin: 10, // a card charge that never finished: let it be retried
  cardUnpaidMin: 120, // finished card ride with no fare charged
  pendingLongMin: 30, // nobody has taken the ride
  onRideLongMin: 240, // driver on the same ride for 4 hours
  stopWaitLongMin: 60, // waiting at a stop for an hour
});

export const TUNE_DEFAULTS = Object.freeze({ step: 0.05, min: 1.1, max: 1.8, minRides: 20 });

const minutes = (ms) => ms / 60000;
const ms = (v) => (typeof v === "number" ? v : v?.toMillis ? v.toMillis() : v?.seconds ? v.seconds * 1000 : null);

/**
 * What's wrong with this ride right now, or null.
 * { kind, fix } — fix is a safe automatic repair (fields to set), or null when a person should look.
 */
export function rideIssue(ride, now, cfg = {}) {
  const c = { ...SELF_CHECK_DEFAULTS, ...cfg };
  if (!ride) return null;
  if (ride.finalFare == null && ride.settlingAt && minutes(now - ride.settlingAt) >= c.settlingStuckMin) {
    return { kind: "stuck_settling", fix: { settlingAt: null } };
  }
  if (ride.status === "finished" && ride.paymentMethod === "card" && ride.finalFare == null) {
    const at = ms(ride.droppedOffAt) ?? ms(ride.finishedAt) ?? ms(ride.timestamp);
    if (at && minutes(now - at) >= c.cardUnpaidMin) return { kind: "card_unpaid", fix: null };
  }
  if (ride.status === "pending" && ride.scheduleType !== "later") {
    const at = ms(ride.timestamp) ?? ms(ride.createdMs);
    if (at && minutes(now - at) >= c.pendingLongMin) return { kind: "pending_long", fix: null };
  }
  if (["dispatched", "in_transit"].includes(ride.status)) {
    if (ride.stopWait?.startedAt && minutes(now - ride.stopWait.startedAt) >= c.stopWaitLongMin) return { kind: "stop_wait_long", fix: null };
    const at = ms(ride.assignedAt) ?? ms(ride.pickedUpAt);
    if (at && minutes(now - at) >= c.onRideLongMin) return { kind: "on_ride_long", fix: null };
  }
  return null;
}

/** Plain words for the owner. */
export const ISSUE_TEXT = Object.freeze({
  stuck_settling: "A card charge got stuck. Fixed: it can be charged again.",
  card_unpaid: "Card ride finished but the fare was never charged. Settle it.",
  pending_long: "A rider has waited 30+ minutes with no driver.",
  on_ride_long: "A driver has been on the same ride for 4+ hours.",
  stop_wait_long: "A driver has waited at a stop for an hour.",
});

/**
 * Next road factor: moves toward what real meters say, at most `step` per run and
 * never outside [min, max]. Returns the current factor when there's no suggestion.
 */
export function nextRoadFactor(current, suggested, cfg = {}) {
  const c = { ...TUNE_DEFAULTS, ...cfg };
  const cur = Number(current);
  if (!Number.isFinite(cur)) return null;
  if (suggested == null || !Number.isFinite(Number(suggested))) return cur;
  const delta = Math.max(-c.step, Math.min(c.step, Number(suggested) - cur));
  return Math.round(Math.max(c.min, Math.min(c.max, cur + delta)) * 100) / 100;
}
