import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../../config/firebase";
import { BRAND } from "../../config/constants";

const DISPATCH = BRAND.dispatch;
const STALE_MS = (DISPATCH.gps?.staleMin ?? 3) * 60 * 1000;

const STATUS_STYLE = {
  ready: { color: "#EF4444", label: "Waiting" },
  offered: { color: "#F59E0B", label: "Being offered" },
  on_call: { color: "#10B981", label: "On call" },
  moving: { color: "#3B82F6", label: "Moving" },
};
const ORDER = ["offered", "on_call", "ready", "moving"];

function ago(ms, now) {
  if (!ms) return "never";
  const s = Math.max(0, Math.round((now - ms) / 1000));
  return s < 60 ? `${s}s ago` : `${Math.floor(s / 60)}m ago`;
}

// Dispatcher's live view: every driver on the board, where his phone says he is.
export default function LiveMap() {
  const mapEl = useRef(null);
  const mapRef = useRef(null);
  const zoneLayer = useRef(null);
  const carLayer = useRef(null);
  const [zones, setZones] = useState([]);
  const [board, setBoard] = useState({});
  const [locs, setLocs] = useState({});
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const unsubs = [
      onSnapshot(collection(db, "zones"), (s) => setZones(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(collection(db, "board"), (s) =>
        setBoard(Object.fromEntries(s.docs.map((d) => [d.id, { id: d.id, ...d.data() }])))
      ),
      onSnapshot(collection(db, "driverLocations"), (s) =>
        setLocs(Object.fromEntries(s.docs.map((d) => [d.id, d.data()])))
      ),
    ];
    const t = setInterval(() => setNow(Date.now()), 10_000);
    return () => {
      unsubs.forEach((u) => u());
      clearInterval(t);
    };
  }, []);

  useEffect(() => {
    const map = L.map(mapEl.current).setView([DISPATCH.mapCenter.lat, DISPATCH.mapCenter.lng], DISPATCH.mapZoom);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);
    zoneLayer.current = L.layerGroup().addTo(map);
    carLayer.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => map.remove();
  }, []);

  const zoneLabel = useMemo(() => Object.fromEntries(zones.map((z) => [z.id, z.label])), [zones]);

  const cars = useMemo(
    () =>
      Object.values(board)
        .filter((b) => b.status && b.status !== "offline" && STATUS_STYLE[b.status])
        .map((b) => ({ ...b, loc: locs[b.id] || null }))
        .sort(
          (a, b) =>
            ORDER.indexOf(a.status) - ORDER.indexOf(b.status) ||
            String(a.carNumber).localeCompare(String(b.carNumber), undefined, { numeric: true })
        ),
    [board, locs]
  );

  useEffect(() => {
    const layer = zoneLayer.current;
    if (!layer) return;
    layer.clearLayers();
    zones.forEach((z) => {
      if (z.points?.length >= 3) {
        L.polygon(
          z.points.map((p) => [p.lat, p.lng]),
          { color: "#64748B", weight: 1.5, fillOpacity: 0.06 }
        )
          .bindTooltip(z.label, { permanent: true, direction: "center", className: "zone-label" })
          .addTo(layer);
      }
    });
  }, [zones]);

  useEffect(() => {
    const layer = carLayer.current;
    if (!layer) return;
    layer.clearLayers();
    cars.forEach((c) => {
      if (!c.loc?.lat) return;
      const stale = now - (c.loc.at || 0) > STALE_MS;
      L.circleMarker([c.loc.lat, c.loc.lng], {
        radius: 11,
        color: "#0F172A",
        weight: 2,
        fillColor: STATUS_STYLE[c.status].color,
        fillOpacity: stale ? 0.35 : 0.95,
      })
        .bindTooltip(String(c.carNumber), { permanent: true, direction: "top", offset: [0, -10] })
        .addTo(layer);
    });
  }, [cars, now]);

  function focus(c) {
    if (c.loc?.lat && mapRef.current) mapRef.current.setView([c.loc.lat, c.loc.lng], 15);
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-navy-950 text-white px-6 py-4 flex items-center gap-4">
        <Link to="/admin/dashboard" className="text-slate-300 hover:text-white font-semibold">
          &larr; Dispatch
        </Link>
        <h1 className="font-display font-bold text-2xl">Live Map</h1>
        <div className="ml-auto hidden sm:flex gap-4 text-sm">
          {ORDER.map((k) => (
            <span key={k} className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-full" style={{ background: STATUS_STYLE[k].color }} />
              {STATUS_STYLE[k].label}
            </span>
          ))}
        </div>
      </header>

      <div className="lg:flex">
        <div ref={mapEl} className="w-full lg:flex-1 h-[60vh] lg:h-[calc(100vh-72px)] z-0" />
        <aside className="lg:w-80 p-4 space-y-2 lg:overflow-y-auto lg:h-[calc(100vh-72px)]">
          <p className="text-sm font-bold text-slate-500 uppercase tracking-wide">
            {cars.length} car{cars.length === 1 ? "" : "s"} on the board
          </p>
          {cars.length === 0 && <p className="text-slate-500">No drivers online.</p>}
          {cars.map((c) => {
            const stale = !c.loc?.at || now - c.loc.at > STALE_MS;
            return (
              <button
                key={c.id}
                onClick={() => focus(c)}
                className="w-full text-left bg-white rounded-xl border border-slate-200 p-3 hover:border-slate-400"
              >
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full" style={{ background: STATUS_STYLE[c.status].color }} />
                  <span className="font-bold text-lg">Car {c.carNumber}</span>
                  <span className="ml-auto text-sm text-slate-500">{STATUS_STYLE[c.status].label}</span>
                </div>
                <p className="text-sm text-slate-600 mt-1">
                  {c.zoneId ? `Line: ${zoneLabel[c.zoneId] || c.zoneId}` : "No line"}
                  {c.loc?.zoneId && c.loc.zoneId !== c.zoneId ? ` · now in ${zoneLabel[c.loc.zoneId]}` : ""}
                </p>
                <p className={`text-xs mt-0.5 ${stale ? "text-red-600 font-semibold" : "text-slate-500"}`}>
                  GPS {ago(c.loc?.at, now)}
                </p>
              </button>
            );
          })}
        </aside>
      </div>
    </div>
  );
}
