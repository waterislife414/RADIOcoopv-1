import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { collection, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../config/firebase";
import { BRAND } from "../../config/constants";
import { STATUS_COLORS, statusInfo, zoneColor } from "../../utils/statusColors";
import { pickupPoint, waitClock, rulesFrom } from "../../../functions/lib/rideTiming.mjs";

const move = httpsCallable(functions, "dispatcherBoardAction");
const assignRide = httpsCallable(functions, "dispatcherAssignRide");
const DISPATCH = BRAND.dispatch;
const RULES = rulesFrom(BRAND.rideRules);
const STALE_MS = (DISPATCH.gps?.staleMin ?? 3) * 60000;
const ALERT_MS = (DISPATCH.needsDispatcherAlertMinutes ?? 3) * 60000;
const tsMs = (t) => (t?.seconds ? t.seconds * 1000 : typeof t === "number" ? t : 0);

function beep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    o.frequency.value = 660;
    o.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.3);
  } catch {
    // No sound: the row still flashes.
  }
}

/** The word shown next to a ride in progress (colour is always paired with a word). */
export function rideWord(ride, now) {
  if (ride.status === "in_transit") return "Loaded";
  if (ride.arrivedAt != null) return waitClock(ride, now, RULES)?.meterOn ? "Waiting (meter)" : "At pickup";
  return "En route";
}

const reasonTag = (r) => {
  if (r.dispatchState === "escalated") return "Nobody took it";
  if (r.paymentMethod === "cash") return "Cash: check rider";
  return r.officeWhy || "Phone / needs you";
};

/**
 * The digital pegboard (spec section 9): live map on top; "Working" bottom
 * left; "Off / out" bottom right. The dispatcher can change any car at any
 * time. Zone strip: drop a chip on a zone, or tap the chip then the zone.
 */
export default function Pegboard({ rides, drivers, zones, onCarClick, onNewCall, onAssignRide }) {
  const mapEl = useRef(null);
  const map = useRef(null);
  const layers = useRef({});
  const alerted = useRef(new Set());
  const [locs, setLocs] = useState({});
  const [now, setNow] = useState(() => Date.now());
  const [picked, setPicked] = useState(null); // car chip waiting for a zone tap
  const [msg, setMsg] = useState("");
  const [draggingCar, setDraggingCar] = useState(null);
  const [overZone, setOverZone] = useState(null);

  useEffect(() => {
    const u = onSnapshot(collection(db, "driverLocations"), (s) => setLocs(Object.fromEntries(s.docs.map((d) => [d.id, d.data()]))));
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => {
      u();
      clearInterval(t);
    };
  }, []);

  useEffect(() => {
    const m = L.map(mapEl.current, { zoomControl: true }).setView([DISPATCH.mapCenter.lat, DISPATCH.mapCenter.lng], DISPATCH.mapZoom);
    L.tileLayer(BRAND.infrastructure.mapTiles?.url || "https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: BRAND.infrastructure.mapTiles?.attribution || "&copy; OpenStreetMap contributors",
    }).addTo(m);
    layers.current = { zones: L.layerGroup().addTo(m), things: L.layerGroup().addTo(m) };
    map.current = m;
    return () => m.remove();
  }, []);

  const zoneName = useMemo(() => Object.fromEntries(zones.map((z) => [z.id, z.label])), [zones]);
  const carNo = useMemo(() => Object.fromEntries(drivers.map((d) => [d.id, d.carNumber])), [drivers]);
  const driverActiveRide = useMemo(() => {
    const mapObj = {};
    rides.forEach((r) => {
      if (["dispatched", "in_transit"].includes(r.status) && r.driverId) {
        mapObj[r.driverId] = r;
      }
    });
    return mapObj;
  }, [rides]);

  // Traced zones: pale fill and thin outline in each zone's own colour, name small and faded.
  useEffect(() => {
    const g = layers.current.zones;
    if (!g) return;
    g.clearLayers();
    zones.forEach((z, i) => {
      if (z.points?.length < 3) return;
      const c = zoneColor(z, i);
      L.polygon(
        z.points.map((p) => [p.lat, p.lng]),
        { color: c, weight: 1, fillColor: c, fillOpacity: 0.18, interactive: false }
      )
        .bindTooltip(z.label, { permanent: true, direction: "center", className: "zone-label", opacity: 0.55 })
        .addTo(g);
    });
  }, [zones]);

  const inProgress = rides.filter((r) => ["dispatched", "in_transit"].includes(r.status));
  const waiting = rides.filter((r) => r.status === "pending");
  const needsYou = waiting.filter((r) => r.appHandled !== true || r.dispatchState === "escalated");
  const appWaiting = waiting.filter((r) => !needsYou.includes(r));

  // Everything in motion: cars, sharing riders (with a line to their car), pickup and drop-off points.
  useEffect(() => {
    const g = layers.current.things;
    if (!g) return;
    g.clearLayers();
    drivers.forEach((d) => {
      const l = locs[d.id];
      if (!l?.lat || d.status === "offline") return;
      const st = statusInfo(d.status);
      const stale = now - (l.at || 0) > STALE_MS;
      L.circleMarker([l.lat, l.lng], { radius: 11, color: "#0F172A", weight: 2, fillColor: st.color, fillOpacity: stale ? 0.35 : 0.95 })
        .bindTooltip(String(d.carNumber), { permanent: true, direction: "top", offset: [0, -10] })
        .on("click", () => onCarClick?.(d))
        .addTo(g);
    });
    inProgress.concat(waiting).forEach((r) => {
      const pu = pickupPoint(r);
      if (pu) L.circleMarker([pu.lat, pu.lng], { radius: 5, color: "#0F172A", weight: 1, fillColor: "#fff", fillOpacity: 1 }).bindTooltip("Pickup").addTo(g);
      if (r.dropoffLat != null && r.dropoffLng != null) {
        L.circleMarker([r.dropoffLat, r.dropoffLng], { radius: 5, color: "#0F172A", weight: 1, fillColor: "#0F172A", fillOpacity: 1 }).bindTooltip("Drop-off").addTo(g);
      }
      const rp = r.riderPos;
      if (rp?.lat && now - (rp.at || 0) < 10 * 60000) {
        L.marker([rp.lat, rp.lng], { icon: L.divIcon({ className: "", html: "<div style='font-size:20px'>\u{1F9CD}</div>", iconSize: [20, 20] }) })
          .bindTooltip("Rider sharing location")
          .addTo(g);
        const cl = locs[r.driverId];
        if (cl?.lat) L.polyline([[rp.lat, rp.lng], [cl.lat, cl.lng]], { color: "#64748b", weight: 1.5, dashArray: "4 4" }).addTo(g);
      }
    });
  }, [drivers, locs, rides, now]); // eslint-disable-line react-hooks/exhaustive-deps

  // Rides the dispatcher must handle flash and chime once they have waited too long.
  useEffect(() => {
    needsYou.forEach((r) => {
      if (now - tsMs(r.timestamp) > ALERT_MS && !alerted.current.has(r.id)) {
        alerted.current.add(r.id);
        beep();
      }
    });
  }, [needsYou, now]);

  async function place(car, zoneId) {
    setMsg("");
    try {
      await move({ uid: car.id, action: "ready", zoneId });
      setPicked(null);
    } catch (e) {
      setMsg(e?.message || "Couldn't move that car.");
    }
  }
  const dropOn = (zoneId) => (e) => {
    e.preventDefault();
    const car = drivers.find((d) => d.id === e.dataTransfer.getData("text/car"));
    if (car) place(car, zoneId);
  };

  const out = drivers.filter((d) => ["offline", "suspended", "closed"].includes(d.status) || !d.status);
  const moving = drivers.filter((d) => d.status === "moving");
  const ready = (zid) =>
    drivers
      .filter((d) => d.status === "ready" && d.zoneId === zid)
      .sort((a, b) => (a.lineKey ?? 0) - (b.lineKey ?? 0));
  const onCallForZone = (zid) =>
    drivers.filter((d) => d.status === "on_call" && (d.zoneId === zid || driverActiveRide[d.id]?.zoneId === zid));

  const Chip = ({ d }) => {
    const st = statusInfo(d.status);
    const okd = d.approval?.untilMs > now;
    const ride = driverActiveRide[d.id];
    const dropZoneName = ride ? (zoneName[ride.dropZoneId] || ride.dropZoneLabel || (ride.dropoff ? String(ride.dropoff).split(",")[0] : null)) : null;

    const timerRef = useRef(null);
    const startPos = useRef({ x: 0, y: 0 });

    const handlePointerDown = (e) => {
      startPos.current = { x: e.clientX, y: e.clientY };
      timerRef.current = setTimeout(() => {
        setDraggingCar(d);
        try {
          e.target.setPointerCapture(e.pointerId);
        } catch {
          // ignore
        }
      }, 300);
    };

    const handlePointerMove = (e) => {
      if (!draggingCardIsThis()) {
        if (Math.hypot(e.clientX - startPos.current.x, e.clientY - startPos.current.y) > 10) {
          clearTimeout(timerRef.current);
        }
      }
      if (draggingCar?.id === d.id) {
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const zEl = el?.closest("[data-zone-id]");
        setOverZone(zEl ? zEl.getAttribute("data-zone-id") : null);
      }
    };

    const handlePointerUp = async (e) => {
      clearTimeout(timerRef.current);
      if (draggingCar?.id === d.id) {
        try {
          e.target.releasePointerCapture(e.pointerId);
        } catch {
          // ignore
        }
        if (overZone) {
          await place(d, overZone);
        }
        setDraggingCar(null);
        setOverZone(null);
      } else {
        if (Math.hypot(e.clientX - startPos.current.x, e.clientY - startPos.current.y) < 10) {
          if (picked?.id === d.id) setPicked(null);
          else onCarClick?.(d);
        }
      }
    };

    const draggingCardIsThis = () => draggingCar?.id === d.id;

    return (
      <button
        type="button"
        data-testid={`car-chip-${d.carNumber}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onDragStart={(e) => e.preventDefault()}
        title={`Car ${d.carNumber}: ${st.label}${okd ? " (OK'd, no GPS)" : ""}${d.radioOnly ? " (radio-only)" : ""}`}
        className={`rounded-full px-2.5 py-1 text-sm font-bold text-white border-2 inline-flex items-center gap-1 ${picked?.id === d.id ? "ring-4 ring-amber-300" : ""} ${d.radioOnly ? "border-dashed border-slate-700" : "border-transparent"}`}
        style={{ background: st.color, touchAction: draggingCar?.id === d.id ? "none" : "auto" }}
      >
        <span>{d.carNumber}</span>
        {okd && <span className="text-[10px]">OK</span>}
        {d.status === "on_call" && dropZoneName && <span className="text-[11px] font-normal opacity-90">&rarr; {dropZoneName}</span>}
      </button>
    );
  };

  return (
    <section className="px-3 pt-4 max-w-[1500px] mx-auto" data-testid="pegboard">
      <div className="flex items-center gap-3 flex-wrap mb-2">
        <p className="font-bold text-slate-700">Dispatch desk</p>
        <div className="flex gap-3 text-xs text-slate-600" data-testid="status-key">
          {[["ready", "Ready"], ["onCall", "On a call"], ["moving", "Moving"], ["out", "Out"]].map(([k, l]) => (
            <span key={k} className="flex items-center gap-1">
              <span className="h-3 w-3 rounded-full" style={{ background: STATUS_COLORS[k] }} />
              {l}
            </span>
          ))}
        </div>
        <button onClick={onNewCall} className="ml-auto min-h-[44px] px-4 rounded-xl bg-navy-950 text-gold-300 font-bold" data-testid="new-call">
          + New call
        </button>
      </div>

      <div ref={mapEl} className="w-full h-[38vh] rounded-2xl border border-slate-300 z-0" data-testid="pegboard-map" />

      <div className="flex flex-wrap gap-2 mt-2" data-testid="zone-strip">
        {zones.map((z, i) => (
          <button
            key={z.id}
            type="button"
            data-zone-id={z.id}
            onDragOver={(e) => e.preventDefault()}
            onDrop={dropOn(z.id)}
            onClick={() => picked && place(picked, z.id)}
            className={`rounded-xl border px-3 py-2 text-sm font-semibold text-slate-800 ${overZone === z.id ? "ring-2 ring-blue-600 bg-blue-50" : ""}`}
            style={{ borderColor: zoneColor(z, i), background: overZone === z.id ? undefined : `${zoneColor(z, i)}33` }}
          >
            {z.label} <span className="text-slate-500">({ready(z.id).length + onCallForZone(z.id).length})</span>
          </button>
        ))}
        {picked && <span className="self-center text-sm font-semibold text-amber-700">Car {picked.carNumber}: tap a zone to put him there</span>}
      </div>
      {msg && <p className="text-sm font-semibold text-red-700 mt-1">{msg}</p>}

      <div className="grid md:grid-cols-3 gap-3 mt-3">
        <div className="md:col-span-2 bg-white rounded-2xl border border-slate-200 p-3 space-y-3" data-testid="working">
          <h3 className="font-bold text-slate-700">Working</h3>

          {waiting.length > 0 && (
            <div>
              <p className="text-xs font-bold uppercase text-slate-500">Needs a car</p>
              {waiting.map((r) => (
                <div
                  key={r.id}
                  draggable
                  data-testid="call-chip"
                  onDragStart={(e) => e.dataTransfer.setData("text/ride", r.id)}
                  className="flex items-center gap-2 py-1 text-sm border-b border-slate-100 cursor-grab"
                >
                  <span className="font-semibold">{r.zoneLabel || "No zone"}</span>
                  <span className="text-slate-600 truncate">&rarr; {r.dropoff || r.dropoffAddress || "?"}</span>
                  {r.paymentMethod === "cash" && <span className="px-1.5 rounded bg-emerald-100 text-emerald-800 text-xs font-bold">CASH</span>}
                  {appWaiting.includes(r) && <span className="px-1.5 rounded bg-sky-100 text-sky-800 text-xs font-bold">App handling</span>}
                  {needsYou.includes(r) && (
                    <button onClick={() => onAssignRide(r)} className="ml-auto min-h-[36px] px-3 rounded-lg bg-slate-900 text-white font-semibold">
                      Pick a car
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          <div>
            <p className="text-xs font-bold uppercase text-slate-500">In progress</p>
            {inProgress.length === 0 && <p className="text-sm text-slate-500">No rides in progress.</p>}
            {inProgress.map((r) => (
              <div key={r.id} className="flex items-center gap-2 py-1 text-sm border-b border-slate-100" data-testid="ride-row">
                <span className="rounded-full px-2 py-0.5 font-bold text-white" style={{ background: STATUS_COLORS.onCall }}>
                  {carNo[r.driverId] ?? "?"}
                </span>
                <span>&rarr;</span>
                <span className="font-semibold">{zoneName[r.dropZoneId] || ""}</span>
                <span className="text-slate-600 truncate">{r.dropoff || r.dropoffAddress || "?"}</span>
                {r.paymentMethod === "cash" && <span className="px-1.5 rounded bg-emerald-100 text-emerald-800 text-xs font-bold">CASH</span>}
                <span className="ml-auto font-semibold" style={{ color: STATUS_COLORS.onCall }}>
                  {rideWord(r, now)}
                </span>
              </div>
            ))}
          </div>

          <div>
            <p className="text-xs font-bold uppercase text-slate-500">Ready &amp; On Call by Zone</p>
            {zones.map((z) => {
              const cars = ready(z.id);
              const onCalls = onCallForZone(z.id);
              if (!cars.length && !onCalls.length) return null;
              return (
                <div key={z.id} className="flex items-center gap-2 py-1" data-testid={`zone-col-${z.id}`}>
                  <span className="w-28 text-sm font-semibold text-slate-700">{z.label}</span>
                  <div className="flex gap-1.5 flex-wrap">
                    {cars.map((d) => <Chip key={d.id} d={d} />)}
                    {onCalls.map((d) => <Chip key={d.id} d={d} />)}
                  </div>
                </div>
              );
            })}
            {moving.length > 0 && (
              <div className="flex items-center gap-2 py-1">
                <span className="w-28 text-sm font-semibold text-slate-700">Moving</span>
                <div className="flex gap-1.5 flex-wrap">{moving.map((d) => <Chip key={d.id} d={d} />)}</div>
              </div>
            )}
            {drivers.filter((d) => d.status === "offered" || (d.status === "on_call" && !ready(d.zoneId).includes(d) && !onCallForZone(d.zoneId).includes(d))).map((d) => (
              <div key={d.id} className="flex items-center gap-2 py-1 text-sm">
                <Chip d={d} />
                <span className="text-slate-600">{d.radioCall ? `Radio call${d.radioCall.note ? `: ${d.radioCall.note}` : ""}` : d.status === "offered" ? "Being offered a call" : "On a call"}</span>
              </div>
            ))}
          </div>

          {needsYou.length > 0 && (
            <div data-testid="needs-dispatcher">
              <p className="text-xs font-bold uppercase text-red-700">Needs dispatcher</p>
              {needsYou.map((r) => {
                const late = now - tsMs(r.timestamp) > ALERT_MS;
                return (
                  <div
                    key={r.id}
                    draggable
                    data-testid="call-chip"
                    onDragStart={(e) => e.dataTransfer.setData("text/ride", r.id)}
                    className={`flex items-center gap-2 flex-wrap py-2 px-2 mt-1 rounded-xl border cursor-grab ${late ? "border-red-400 bg-red-50 animate-pulse" : "border-amber-300 bg-amber-50"}`}
                  >
                    <span className="px-2 py-0.5 rounded bg-slate-900 text-white text-xs font-bold">{reasonTag(r)}</span>
                    <span className="text-sm font-semibold">{r.name || r.firstName || "Caller"}</span>
                    <span className="text-sm text-slate-600 truncate">{r.zoneLabel ? `${r.zoneLabel} ` : ""}&rarr; {r.dropoff || r.dropoffAddress || "?"}</span>
                    <span className="ml-auto flex gap-2">
                      {r.phone && (
                        <a href={`tel:${r.phone}`} className="min-h-[36px] px-3 inline-flex items-center rounded-lg bg-white border border-slate-300 font-semibold text-sm">
                          Call rider
                        </a>
                      )}
                      <button onClick={() => onAssignRide(r)} className="min-h-[36px] px-3 rounded-lg bg-emerald-600 text-white font-bold text-sm">
                        Accept &amp; assign
                      </button>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-3" data-testid="off-out">
          <h3 className="font-bold text-slate-700">Off / out</h3>
          <p className="text-xs text-slate-500 mb-2">Drag a car onto a zone above (or double-tap it, then tap a zone). Tap a car to change anything about it.</p>
          <div className="flex flex-wrap gap-1.5">
            {out.length === 0 && <span className="text-sm text-slate-500">Everyone is on the board.</span>}
            {out.map((d) => <Chip key={d.id} d={d} />)}
          </div>
          <button onClick={() => onCarClick?.("new")} className="mt-3 text-sm font-semibold text-blue-700" data-testid="add-radio-car">
            + Radio car
          </button>
        </div>
      </div>
    </section>
  );
}
