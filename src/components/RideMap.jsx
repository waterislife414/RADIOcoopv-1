import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { BRAND } from "../config/constants";

// Map tiles come from branding.config.json (infrastructure.mapTiles), so a
// tile account key can be swapped in at launch without touching this file.
const TILES = BRAND.infrastructure?.mapTiles || {
  url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  attribution: "&copy; OpenStreetMap contributors",
};

const pin = (color, label) =>
  L.divIcon({
    className: "",
    html: `<div style="background:${color};color:#fff;border:3px solid #fff;border-radius:9999px;min-width:30px;height:30px;padding:0 7px;display:flex;align-items:center;justify-content:center;font:800 13px system-ui;box-shadow:0 2px 8px rgba(0,0,0,.45);white-space:nowrap">${label}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });

const ok = (p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng);

/**
 * Small live map. points: [{ key, lat, lng, color, label }]. Fits everyone
 * on screen when someone new appears, then leaves the zoom to the person.
 */
export default function RideMap({ points, height = 220, label = "Map" }) {
  const el = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);
  const fitted = useRef("");
  const shown = (points || []).filter(ok);

  useEffect(() => {
    if (!el.current || map.current) return undefined;
    const m = L.map(el.current, { zoomControl: true, attributionControl: true });
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
    if (!m || !layer.current) return;
    layer.current.clearLayers();
    shown.forEach((p) => L.marker([p.lat, p.lng], { icon: pin(p.color, p.label), keyboard: false }).addTo(layer.current));
    const keys = shown.map((p) => p.key).join(",");
    if (shown.length && keys !== fitted.current) {
      fitted.current = keys;
      if (shown.length === 1) m.setView([shown[0].lat, shown[0].lng], 16);
      else m.fitBounds(L.latLngBounds(shown.map((p) => [p.lat, p.lng])), { padding: [36, 36], maxZoom: 17 });
    }
  });

  return <div ref={el} role="img" aria-label={label} style={{ height }} className="w-full rounded-2xl overflow-hidden border-2 border-slate-200 z-0" />;
}
