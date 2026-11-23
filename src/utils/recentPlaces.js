// Addresses this phone has used before, so regular riders tap instead of type
// (like Uber's saved places). Kept only on the device.
const KEY = "rc-recent-places";
const MAX = 6;

export function recentPlaces() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, MAX) : [];
  } catch {
    return [];
  }
}

export function rememberPlaces(...places) {
  try {
    // "Pin dropped" has no address to reuse, so it is not a recent place.
    const clean = places.map((p) => (p || "").trim()).filter((p) => p.length > 3 && p !== "Pin dropped");
    const next = [...clean, ...recentPlaces().filter((p) => !clean.includes(p))].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Private mode or storage full: just skip.
  }
}
