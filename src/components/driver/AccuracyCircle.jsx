import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { BRAND } from "../../config/constants";

const TILES = BRAND.infrastructure?.mapTiles || {
  url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  attribution: "&copy; OpenStreetMap contributors",
};

export default function AccuracyCircle({ lat, lng, accuracy, max }) {
  const el = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);

  useEffect(() => {
    if (!el.current || map.current) return undefined;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;

    const m = L.map(el.current, {
      zoomControl: false,
      attributionControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
    });
    L.tileLayer(TILES.url, { attribution: TILES.attribution, maxZoom: 19 }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    m.setView([lat, lng], 15);
    setTimeout(() => {
      if (map.current) map.current.invalidateSize();
    }, 50);

    return () => {
      m.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m || !layer.current) return;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    layer.current.clearLayers();
    const bad = accuracy > max;
    const color = bad ? "#dc2626" : "#16a34a";

    const circle = L.circle([lat, lng], {
      radius: Math.max(10, accuracy || 10),
      color,
      fillColor: color,
      fillOpacity: 0.2,
      weight: 2,
    });
    circle.addTo(layer.current);

    const marker = L.circleMarker([lat, lng], {
      radius: 6,
      color: "#ffffff",
      fillColor: color,
      fillOpacity: 1,
      weight: 2,
    });
    marker.addTo(layer.current);

    m.setView([lat, lng], m.getZoom());
    try {
      m.fitBounds(circle.getBounds(), { padding: [20, 20], maxZoom: 17 });
    } catch {
      // ignore fitBounds errors if map size isn't ready
    }
  }, [lat, lng, accuracy, max]);

  return (
    <div
      data-testid="accuracy-circle"
      className="w-full h-[160px] rounded-2xl overflow-hidden border-2 border-slate-200 z-0 relative"
    >
      <div ref={el} className="w-full h-full" />
    </div>
  );
}
