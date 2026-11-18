import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { BRAND } from "../config/constants";

const TILES = BRAND.infrastructure?.mapTiles || {
  url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  attribution: "&copy; OpenStreetMap contributors",
};

export default function PinPicker({ initialLat, initialLng, title, onPick, onClose }) {
  const el = useRef(null);
  const map = useRef(null);
  const marker = useRef(null);
  const [pos, setPos] = useState({
    lat: typeof initialLat === "number" ? initialLat : BRAND.dispatch.mapCenter.lat,
    lng: typeof initialLng === "number" ? initialLng : BRAND.dispatch.mapCenter.lng,
  });

  useEffect(() => {
    if (!el.current || map.current) return undefined;

    const m = L.map(el.current, {
      zoomControl: true,
      attributionControl: false,
    });
    L.tileLayer(TILES.url, { attribution: TILES.attribution, maxZoom: 19 }).addTo(m);
    map.current = m;

    m.setView([pos.lat, pos.lng], 15);

    const mk = L.marker([pos.lat, pos.lng], { draggable: true }).addTo(m);
    marker.current = mk;

    mk.on("dragend", () => {
      const p = mk.getLatLng();
      setPos({ lat: p.lat, lng: p.lng });
    });

    m.on("click", (e) => {
      const { lat, lng } = e.latlng;
      mk.setLatLng([lat, lng]);
      setPos({ lat, lng });
    });

    setTimeout(() => {
      if (map.current) map.current.invalidateSize();
    }, 100);

    return () => {
      m.remove();
      map.current = null;
    };
  }, []);

  return (
    <div
      data-testid="pin-picker"
      className="fixed inset-0 z-50 bg-black/70 flex flex-col items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl flex flex-col h-[80vh]">
        <div className="p-4 bg-slate-900 text-white flex justify-between items-center">
          <h2 className="font-bold text-lg">{title || "Drop a pin"}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-300 hover:text-white font-bold text-lg px-2 py-1"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 relative w-full h-full bg-slate-100">
          <div ref={el} className="w-full h-full absolute inset-0 z-0" />
        </div>
        <div className="p-4 bg-white border-t border-slate-200 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 min-h-[48px] rounded-xl border-2 border-slate-300 font-bold text-slate-700 text-base"
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="pin-use"
            onClick={() => {
              onPick(pos);
              onClose();
            }}
            className="flex-1 min-h-[48px] rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-base shadow-lg"
          >
            Use this spot
          </button>
        </div>
      </div>
    </div>
  );
}
