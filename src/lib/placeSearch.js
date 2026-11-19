export async function searchPlaces(q, signal) {
  const queryStr = String(q || "").trim();
  if (queryStr.length < 3) return [];
  try {
    const res = await fetch(
      `https://photon.komoot.io/api/?q=${encodeURIComponent(queryStr)}&limit=6&lat=32.46&lon=-84.99&bbox=-85.25,32.25,-84.70,32.70`,
      { signal }
    );
    if (!res.ok) return [];
    const data = await res.json();
    const features = data?.features || [];
    const results = [];
    const seenTexts = new Set();

    for (const f of features) {
      const p = f.properties || {};
      const street = [p.housenumber, p.street].filter(Boolean).join(" ");
      const city = p.city || p.town || p.village || p.county || "";
      const address = [street, city, p.state].filter(Boolean).join(", ");
      if (!address) continue;
      const name = p.name && p.name !== street ? p.name : "";
      const text = name ? `${name}, ${address}` : address;
      if (seenTexts.has(text)) continue;
      seenTexts.add(text);

      const coords = f.geometry?.coordinates;
      if (!Array.isArray(coords) || coords.length < 2) continue;

      results.push({
        name,
        address,
        text,
        lat: coords[1],
        lng: coords[0],
      });
    }
    return results;
  } catch (e) {
    if (e.name === "AbortError") return [];
    return [];
  }
}
