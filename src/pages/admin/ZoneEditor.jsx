import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { db } from "../../config/firebase";
import { BRAND } from "../../config/constants";

const DISPATCH = BRAND.dispatch;
const COLORS = ["#1F72B0", "#C9A227", "#10B981", "#EF4444", "#8B5CF6", "#F97316", "#0EA5E9", "#EC4899", "#14B8A6", "#84CC16", "#6366F1", "#F59E0B", "#64748B", "#A855F7"];

function slugify(label) {
  return label.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// Malcolm/Jared trace each zone by tapping its corners on the map. The app
// uses these shapes to put rides and drivers in the right zone.
export default function ZoneEditor() {
  const mapEl = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const [zones, setZones] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [newLabel, setNewLabel] = useState("");
  const [renameTo, setRenameTo] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(
    () =>
      onSnapshot(collection(db, "zones"), (snap) =>
        setZones(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order ?? 99) - (b.order ?? 99)))
      ),
    []
  );

  useEffect(() => {
    const map = L.map(mapEl.current, { zoomControl: true }).setView(
      [DISPATCH.mapCenter.lat, DISPATCH.mapCenter.lng],
      DISPATCH.mapZoom
    );
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    map.on("click", (e) => {
      setDraft((d) => (d ? [...d, { lat: +e.latlng.lat.toFixed(6), lng: +e.latlng.lng.toFixed(6) }] : d));
    });
    mapRef.current = map;
    return () => map.remove();
  }, []);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    layer.clearLayers();
    zones.forEach((z, i) => {
      const editing = z.id === selectedId && draft;
      const pts = editing ? draft : z.points || [];
      const color = COLORS[i % COLORS.length];
      if (pts.length >= 3) {
        L.polygon(
          pts.map((p) => [p.lat, p.lng]),
          { color, weight: z.id === selectedId ? 4 : 2, fillOpacity: z.id === selectedId ? 0.3 : 0.15 }
        )
          .bindTooltip(z.label, { permanent: true, direction: "center", className: "zone-label" })
          .addTo(layer);
      } else if (editing && pts.length > 0) {
        L.polyline(pts.map((p) => [p.lat, p.lng]), { color, weight: 3, dashArray: "6 6" }).addTo(layer);
      }
      if (editing) {
        pts.forEach((p) => L.circleMarker([p.lat, p.lng], { radius: 6, color, fillOpacity: 1 }).addTo(layer));
      }
    });
  }, [zones, selectedId, draft]);

  const selected = zones.find((z) => z.id === selectedId) || null;

  function select(z) {
    setSelectedId(z.id);
    setDraft(null);
    setRenameTo(z.label);
    setMsg("");
    if (z.points?.length >= 3 && mapRef.current) {
      mapRef.current.fitBounds(L.latLngBounds(z.points.map((p) => [p.lat, p.lng])), { padding: [30, 30] });
    }
  }

  async function seedZones() {
    const existing = new Set(zones.map((z) => z.id));
    const missing = DISPATCH.zones.filter((z) => !existing.has(z.id));
    await Promise.all(
      missing.map((z) =>
        setDoc(doc(db, "zones", z.id), {
          label: z.label,
          order: DISPATCH.zones.indexOf(z),
          requiresCert: z.requiresCert || null,
          points: [],
          updatedAt: serverTimestamp(),
        })
      )
    );
    setMsg(missing.length ? `Added ${missing.length} zones.` : "All zones already exist.");
  }

  async function saveShape() {
    if (!draft || draft.length < 3) {
      setMsg("Tap at least 3 corners on the map.");
      return;
    }
    await updateDoc(doc(db, "zones", selectedId), { points: draft, updatedAt: serverTimestamp() });
    setDraft(null);
    setMsg(`${selected.label} saved.`);
  }

  async function addZone(e) {
    e.preventDefault();
    const label = newLabel.trim();
    const id = slugify(label);
    if (!id) return;
    await setDoc(doc(db, "zones", id), {
      label,
      order: zones.length,
      requiresCert: null,
      points: [],
      updatedAt: serverTimestamp(),
    });
    setNewLabel("");
    setMsg(`Added ${label}. Select it and tap "Draw shape".`);
  }

  async function rename() {
    if (!renameTo.trim()) return;
    await updateDoc(doc(db, "zones", selectedId), { label: renameTo.trim() });
    setMsg("Renamed.");
  }

  async function removeZone() {
    if (!window.confirm(`Delete the ${selected.label} zone?`)) return;
    await deleteDoc(doc(db, "zones", selectedId));
    setSelectedId(null);
    setDraft(null);
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-navy-950 text-white px-6 py-4 flex items-center gap-4">
        <Link to="/admin/dashboard" className="text-slate-300 hover:text-white font-semibold">
          &larr; Dispatch
        </Link>
        <h1 className="font-display font-bold text-2xl">Zones</h1>
      </header>

      <div ref={mapEl} className="w-full h-[55vh] z-0" />

      <div className="max-w-3xl mx-auto p-4 space-y-4">
        {msg && <div className="bg-blue-50 text-blue-800 rounded-lg p-3">{msg}</div>}

        {selected && (
          <div className="bg-white rounded-xl p-4 border border-slate-200 space-y-3">
            <p className="font-bold text-lg">
              {selected.label}
              {selected.requiresCert && <span className="ml-2 text-sm text-gold-600">({selected.requiresCert} cert required)</span>}
            </p>
            {draft ? (
              <>
                <p className="text-slate-600">
                  Tap the map around the edge of {selected.label}, corner by corner. {draft.length} point
                  {draft.length === 1 ? "" : "s"} so far.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button onClick={saveShape} className="px-4 py-2.5 rounded-xl bg-emerald-600 text-white font-bold">
                    Save shape
                  </button>
                  <button onClick={() => setDraft((d) => d.slice(0, -1))} className="px-4 py-2.5 rounded-xl bg-slate-200 font-bold">
                    Undo point
                  </button>
                  <button onClick={() => setDraft([])} className="px-4 py-2.5 rounded-xl bg-slate-200 font-bold">
                    Start over
                  </button>
                  <button onClick={() => setDraft(null)} className="px-4 py-2.5 rounded-xl bg-white border font-bold">
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <div className="flex flex-wrap gap-2 items-center">
                <button onClick={() => setDraft(selected.points?.slice() || [])} className="px-4 py-2.5 rounded-xl bg-blue-600 text-white font-bold">
                  {selected.points?.length >= 3 ? "Redraw shape" : "Draw shape"}
                </button>
                <input
                  value={renameTo}
                  onChange={(e) => setRenameTo(e.target.value)}
                  className="border-2 border-slate-300 rounded-xl px-3 py-2"
                  aria-label="Zone name"
                />
                <button onClick={rename} className="px-3 py-2.5 rounded-xl bg-slate-200 font-bold">
                  Rename
                </button>
                <button onClick={removeZone} className="px-3 py-2.5 rounded-xl text-red-600 font-bold">
                  Delete
                </button>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {zones.map((z, i) => (
            <button
              key={z.id}
              onClick={() => select(z)}
              className={`px-3 py-2 rounded-full font-bold border-2 ${z.id === selectedId ? "bg-navy-950 text-white border-navy-950" : "bg-white"}`}
              style={{ borderColor: z.id === selectedId ? undefined : COLORS[i % COLORS.length] }}
            >
              {z.label}
              {!(z.points?.length >= 3) && <span className="ml-1 text-amber-600">&bull;</span>}
            </button>
          ))}
        </div>
        <p className="text-sm text-slate-500">
          <span className="text-amber-600 font-bold">&bull;</span> = no shape drawn yet. Rides in an area with no zone
          shape show up for the dispatcher to place by hand.
        </p>

        <div className="flex flex-wrap gap-2 items-center">
          <button onClick={seedZones} className="px-4 py-2.5 rounded-xl bg-slate-800 text-white font-bold">
            Load starter zones
          </button>
          <form onSubmit={addZone} className="flex gap-2">
            <input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="New zone name"
              className="border-2 border-slate-300 rounded-xl px-3 py-2"
            />
            <button className="px-4 py-2.5 rounded-xl bg-white border-2 border-slate-300 font-bold">Add</button>
          </form>
        </div>
      </div>
    </div>
  );
}
