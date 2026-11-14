// Why a driver couldn't finish a call, and what each reason does.
//   ride: "cancel"     - ride is called off (rider cancelled, no-show, unsafe)
//         "finish"     - ride ends here, unpaid (rider ran off)
//         "redispatch" - another car is sent (car trouble, other)
//   board: "free" (back on the road) | "offline" (car out of service)
//   warnings: strikes added to the driver's record (out of gas = 2)

export const END_REASONS = {
  rider_cancelled: { label: "Rider cancelled", ride: "cancel", board: "free", warnings: 0 },
  no_show: { label: "Rider didn't show up", ride: "cancel", board: "free", warnings: 0, onlyBeforePickup: true },
  runner: { label: "Rider ran off without paying", ride: "finish", board: "free", warnings: 0, alert: true, onlyAfterPickup: true },
  unsafe: { label: "I don't feel safe", ride: "cancel", board: "free", warnings: 0, alert: true },
  flat_tire: { label: "Flat tire", ride: "redispatch", board: "offline", warnings: 0, alert: true, repair: "Tires" },
  breakdown: { label: "Car broke down", ride: "redispatch", board: "offline", warnings: 0, alert: true, repair: "Other" },
  out_of_gas: { label: "Ran out of gas", ride: "redispatch", board: "offline", warnings: 2, alert: true },
  other: { label: "Something else", ride: "redispatch", board: "free", warnings: 0, alert: true },
};

/** Reasons that make sense for where the ride is (before or after pickup). */
export function reasonsFor(rideStatus) {
  const picked = rideStatus === "in_transit";
  return Object.entries(END_REASONS)
    .filter(([, r]) => !(picked && r.onlyBeforePickup) && !(!picked && r.onlyAfterPickup))
    .map(([id, r]) => ({ id, ...r }));
}

/**
 * Validate a driver's report. Returns { error } or { value }.
 * A note is always required so the office knows what happened.
 */
export function validateEndCall(input = {}, rideStatus) {
  const reason = END_REASONS[input.reason] ? input.reason : null;
  if (!reason) return { error: "Pick why you can't finish this call." };
  if (!reasonsFor(rideStatus).some((r) => r.id === reason)) return { error: "That reason doesn't fit this call." };
  const note = typeof input.note === "string" ? input.note.trim().slice(0, 500) : "";
  if (note.length < 3) return { error: "Write a few words about what happened." };
  return { value: { reason, note, ...END_REASONS[reason] } };
}

/**
 * What happens to the ride. After pickup, car trouble means the rider is
 * still with the driver, so the office sends a car to where they are.
 */
export function rideOutcome(reason, rideStatus) {
  const r = END_REASONS[reason];
  if (r.ride === "redispatch" && rideStatus === "in_transit") return "office";
  return r.ride;
}
