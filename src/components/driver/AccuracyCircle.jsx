import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { BRAND } from "../../config/constants";

// Map tiles come from branding.config.json (infrastructure.mapTiles), so a
// tile account key can be swapped in at launch without touching this file.
const TILES = BRAND.infrastructure?.mapTiles || {
  url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  attribution: "&copy; OpenStreetMap contributors",
};

const ok = (p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng);

/**
 * Small live map showing a single point and its accuracy circle.
 * Doesn't allow user interaction.
 */
export default function AccuracyCircle({ lat, lng, accuracy, max }) {
  const el = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);

  useEffect(() => {
    if (!el.current || map.current) return undefined;
    const m = L.map(el.current, {
      zoomControl: false,
      attributionControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
    });
    L.tileLayer(TILES.url, { attribution: TILES.attribution, maxZoom: 19 }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m || !layer.current || !ok({ lat, lng })) return;

    layer.current.clearLayers();

    const center = L.latLng(lat, lng);
    const circleColor = accuracy > max ? "#dc2626" : "#16a34a"; // red for bad, green for good

    L.circleMarker(center, {
      radius: 5,
      weight: 2,
      color: "#ffffff",
      fillColor: circleColor,
      fillOpacity: 1,
    }).addTo(layer.current);

    const circle = L.circle(center, {
      radius: accuracy,
      weight: 2,
      color: circleColor,
      fillColor: circleColor,
      fillOpacity: 0.2,
    }).addTo(layer.current);

    // Fit bounds to the circle, with a maxZoom to prevent over-zooming on small accuracy
    m.fitBounds(circle.getBounds(), { padding: [10, 10], maxZoom: 16 });
  }, [lat, lng, accuracy, max]);

  return (
    <div
      ref={el}
      role="img"
      aria-label="GPS Accuracy Map"
      style={{ height: 160 }}
      className="w-full rounded-2xl overflow-hidden border-2 border-slate-200 z-0"
      data-testid="accuracy-circle"
    />
  );
}
