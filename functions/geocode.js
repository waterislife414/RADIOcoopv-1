// Free US Census geocoder: address -> {lat, lng}. No API key, no charge.
const BRANDING = require("./branding.json");
const DISPATCH = BRANDING.dispatch || {};

const HAS_STATE_OR_ZIP = /\b(GA|AL|Georgia|Alabama)\b|\b\d{5}\b/i;

async function geocode(address) {
  const text = String(address || "").trim();
  if (!text) return null;
  const attempts = [text];
  if (!HAS_STATE_OR_ZIP.test(text)) {
    for (const city of DISPATCH.geocodeFallbackCities || []) attempts.push(`${text}, ${city}`);
  }
  for (const attempt of attempts) {
    try {
      const url =
        "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress" +
        `?address=${encodeURIComponent(attempt)}&benchmark=4&format=json`;
      const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
      if (!res.ok) continue;
      const json = await res.json();
      const match = json?.result?.addressMatches?.[0];
      if (match?.coordinates) {
        return { lat: match.coordinates.y, lng: match.coordinates.x, matched: match.matchedAddress || "" };
      }
    } catch (err) {
      console.warn("Geocode failed:", attempt, err.message);
    }
  }
  return null;
}

module.exports = { geocode };
