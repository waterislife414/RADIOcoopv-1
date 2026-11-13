// Puts every new ride in a zone. Uses the rider's GPS pin when they shared
// it, otherwise looks the typed address up with the free US Census
// geocoder (no API key, no per-lookup charge). Rides that can't be placed
// (landmarks, out-of-area) are left for the dispatcher to place by hand.
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
const { geocode } = require("./geocode");
const { getZones } = require("./zoneStore");

let corePromise = null;
const core = () => (corePromise ||= import("./lib/dispatchCore.mjs"));

exports.assignRideZone = onDocumentCreated("rides/{rideId}", async (event) => {
  const ride = event.data?.data();
  if (!ride || ride.zoneId) return; // already placed (e.g. dispatcher quick entry)

  const { zoneForPoint, requiredCertsForRide } = await core();
  const zones = await getZones();
  const byId = Object.fromEntries(zones.map((z) => [z.id, z]));

  const pickup =
    typeof ride.pickupLat === "number"
      ? { lat: ride.pickupLat, lng: ride.pickupLng }
      : ride.outOfArea
        ? null
        : await geocode(ride.pickup);
  const drop = await geocode(ride.dropoff);

  const zoneId = pickup ? zoneForPoint(zones, pickup.lng, pickup.lat) : null;
  const dropZoneId = drop ? zoneForPoint(zones, drop.lng, drop.lat) : null;
  const requiresCerts = requiredCertsForRide({
    pickupZone: byId[zoneId],
    dropZone: byId[dropZoneId],
    wheelchair: !!ride.needsAccessibleVehicle,
  });

  await event.data.ref.update({
    zoneId,
    zoneLabel: byId[zoneId]?.label || null,
    dropZoneId,
    pickupLat: pickup?.lat ?? null,
    pickupLng: pickup?.lng ?? null,
    dropLat: drop?.lat ?? null,
    dropLng: drop?.lng ?? null,
    requiresCerts,
    zoneAssignedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
});

