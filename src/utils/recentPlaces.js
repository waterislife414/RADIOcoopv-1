// Addresses this phone has used before, so regular riders tap instead of type
// (like Uber's saved places). Kept only on the device, with the map point when
// known, so a tap prices the trip right away with no lookup.
const KEY = "rc-recent-places";
const MAX = 6;

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** [{ text, lat, lng }] newest first (lat/lng null for older entries). */
export function recentPlacesFull() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "[]");
    if (!Array.isArray(v)) return [];
    return v
      .map((x) => (typeof x === "string" ? { text: x, lat: null, lng: null } : x && typeof x.text === "string" ? { text: x.text, lat: num(x.lat), lng: num(x.lng) } : null))
      .filter(Boolean)
      .slice(0, MAX);
  } catch {
    return [];
  }
}

/** Just the addresses (for the address box's list). */
export function recentPlaces() {
  return recentPlacesFull().map((p) => p.text);
}

/** Strings or { text, lat, lng }. */
export function rememberPlaces(...places) {
  try {
    // "Pin dropped" has no address to reuse, so it is not a recent place.
    const clean = places
      .map((p) => (typeof p === "string" ? { text: p, lat: null, lng: null } : p || {}))
      .map((p) => ({ text: String(p.text || "").trim(), lat: num(p.lat), lng: num(p.lng) }))
      .filter((p) => p.text.length > 3 && p.text !== "Pin dropped");
    const texts = clean.map((p) => p.text);
    const next = [...clean, ...recentPlacesFull().filter((p) => !texts.includes(p.text))].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Private mode or storage full: just skip.
  }
}
