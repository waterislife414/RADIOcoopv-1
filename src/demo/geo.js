// Demo location: a laptop on a desk can stand in for a cab. The Demo
// menu picks a spot; "real GPS" hands control back to the device.
const KEY = "rc-demo-loc";
const geo = navigator.geolocation;
const real = geo && {
  get: geo.getCurrentPosition.bind(geo),
  watch: geo.watchPosition.bind(geo),
  clear: geo.clearWatch.bind(geo),
};
const watchers = new Map(); // id -> callback
const realIds = new Map(); // id -> device watch id
let nextId = 9000;

export function getSimulated() {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) || "null");
  } catch {
    return null;
  }
}
const position = (p) => ({ coords: { latitude: p.lat, longitude: p.lng, accuracy: 12, altitude: null, altitudeAccuracy: null, heading: null, speed: 0 }, timestamp: Date.now() });

export function setSimulated(p) {
  if (p) sessionStorage.setItem(KEY, JSON.stringify(p));
  else sessionStorage.setItem(KEY, JSON.stringify({ real: true }));
  const sim = getSimulated();
  if (sim && !sim.real) for (const cb of watchers.values()) cb(position(sim));
}

export function installGeo(defaultSpot) {
  if (!getSimulated()) sessionStorage.setItem(KEY, JSON.stringify(defaultSpot));
  const target = geo || {};
  const sim = () => {
    const s = getSimulated();
    return s && !s.real ? s : null;
  };
  target.getCurrentPosition = (ok, fail, opts) => {
    const s = sim();
    if (s) setTimeout(() => ok(position(s)), 150);
    else if (real) real.get(ok, fail, opts);
    else fail?.({ code: 2, message: "No location" });
  };
  target.watchPosition = (ok, fail, opts) => {
    const id = nextId++;
    watchers.set(id, ok);
    const s = sim();
    if (s) setTimeout(() => ok(position(s)), 150);
    const realId = !s && real ? real.watch(ok, fail, opts) : null;
    if (realId != null) realIds.set(id, realId);
    return id;
  };
  target.clearWatch = (id) => {
    if (realIds.has(id) && real) real.clear(realIds.get(id));
    watchers.delete(id);
    realIds.delete(id);
  };
  if (!geo) Object.defineProperty(navigator, "geolocation", { value: target, configurable: true });
}
