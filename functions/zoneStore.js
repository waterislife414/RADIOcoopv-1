// Zones change rarely; cache them per function instance for 5 minutes.
const admin = require("firebase-admin");

let cache = { at: 0, zones: [] };
async function getZones() {
  if (Date.now() - cache.at < 5 * 60 * 1000) return cache.zones;
  const snap = await admin.firestore().collection("zones").get();
  cache = { at: Date.now(), zones: snap.docs.map((d) => ({ id: d.id, ...d.data() })) };
  return cache.zones;
}

module.exports = { getZones };
