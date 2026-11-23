export async function reverseGeocode(lat, lng) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 4000);
  try {
    const r = await fetch(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}&limit=1`, { signal: ctl.signal });
    if (!r.ok) return "";
    const j = await r.json();
    const p = j?.features?.[0]?.properties || {};
    const street = [p.housenumber, p.street || p.name].filter(Boolean).join(" ");
    return [street, p.city || p.town || p.village, p.state].filter(Boolean).join(", ");
  } catch {
    return "";
  } finally {
    clearTimeout(t);
  }
}
