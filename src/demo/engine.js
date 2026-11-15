// Demo backend, part 2: runs the REAL Cloud Functions code (../../functions)
// in this browser. Callables are invoked directly, Firestore triggers fire
// after each write, and a ticker stands in for Cloud Tasks / Cloud Scheduler.
import * as core from "./core";
import { accounts } from "./accounts";
import { HttpsError } from "./shims/functions-runtime";
import { _snap } from "./shims/admin";
import fns from "../../functions/index.js";
import leaseModule from "../../functions/lease.js";
import timers from "../../functions/timers.js";
import push from "../../functions/push.js";
import { addTimer } from "./engine-timers";
import { setSimulated } from "./geo";

timers.impl = (data, delaySec) => addTimer(data, delaySec);
push.impl = async (tokens) => ({ responses: tokens.map(() => ({ success: true })) });

const callables = {};
const triggers = [];
const schedules = {};
for (const [name, fn] of Object.entries(fns)) {
  const kind = fn?.__demo?.kind;
  if (kind === "call") callables[name] = fn;
  else if (["created", "updated", "deleted", "written"].includes(kind)) triggers.push({ name, kind, pattern: fn.__demo.opts.document.split("/"), run: fn.run });
  else if (kind === "schedule") schedules[name] = fn;
}
const taskHandler = fns.dispatchTimer;

const authFor = (uid) => {
  const u = uid && accounts.get(uid);
  if (u) return { uid, token: { ...(u.claims || {}), email: u.email, uid } };
  // Example drivers have no login; they act as approved drivers.
  if (uid && core.readDoc(`demoBots/${uid}`)) return { uid, token: { driver: true, uid } };
  return undefined;
};

export async function runAs(uid, name, data) {
  const fn = callables[name];
  if (!fn) throw Object.assign(new Error(`${name} is not available.`), { code: "functions/not-found" });
  try {
    return core.clone(await fn.run({ data: core.clone(data), auth: authFor(uid) }));
  } catch (e) {
    if (e instanceof HttpsError) throw Object.assign(new Error(e.message), { code: `functions/${e.code}`, details: e.details });
    console.error(`[demo] ${name} failed`, e);
    throw Object.assign(new Error("INTERNAL"), { code: "functions/internal" });
  }
}
export async function callFunction(name, data) {
  await new Promise((r) => setTimeout(r, 120)); // feels like a network call
  return runAs(accounts.currentUid(), name, data);
}

// Firestore triggers
function match(pattern, path) {
  const segs = path.split("/");
  if (segs.length !== pattern.length) return null;
  const params = {};
  for (let i = 0; i < segs.length; i++) {
    if (pattern[i].startsWith("{")) params[pattern[i].slice(1, -1)] = segs[i];
    else if (pattern[i] !== segs[i]) return null;
  }
  return params;
}
core.onCommitted(({ path, before, after }) => {
  const kind = before === undefined ? "created" : after === undefined ? "deleted" : "updated";
  for (const t of triggers) {
    if (t.kind !== kind && t.kind !== "written") continue;
    const params = match(t.pattern, path);
    if (!params) continue;
    const data = kind === "created" ? _snap(path, after) : kind === "deleted" ? _snap(path, before) : { before: _snap(path, before), after: _snap(path, after) };
    setTimeout(() => Promise.resolve(t.run({ params, data })).catch((e) => console.error(`[demo] trigger ${t.name}`, e)), 0);
  }
});

// ------------------------------------------------------------ ticker
const admin = () => ({ doc: (p) => core.readDoc(p), q: (q) => core.runQuery(q) });
const centroid = (zone) => {
  const pts = zone?.points || [];
  if (!pts.length) return null;
  return { lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length, lng: pts.reduce((s, p) => s + p.lng, 0) / pts.length };
};
export const zoneCenter = (zoneId) => centroid(core.readDoc(`zones/${zoneId}`));

async function runTimers(now) {
  for (const t of core.runQuery({ collection: "demoTimers", filters: [["dueAt", "<=", now]] })) {
    await core.commit([{ type: "delete", path: t.path }]);
    await Promise.resolve(taskHandler.run({ data: t.data.data })).catch((e) => console.error("[demo] timer", e));
  }
}

async function runMinuteJobs(now) {
  const meta = core.readDoc("demoMeta/schedules") || {};
  if (now - (meta.lastMinute || 0) < 60_000) return;
  await core.commit([{ type: "set", path: "demoMeta/schedules", data: { lastMinute: now }, merge: true }]);
  for (const name of ["sweepStaleDrivers", "dispatchSweep"]) {
    await Promise.resolve(schedules[name]?.run({})).catch((e) => console.error(`[demo] ${name}`, e));
  }
}

const lerp = (a, b, t) => ({ lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t });
const pickupOf = (ride, board) =>
  ride?.pickupLat != null ? { lat: ride.pickupLat, lng: ride.pickupLng } : zoneCenter(ride?.zoneId) || zoneCenter(board?.zoneId);
const startFrom = (to) => ({ lat: to.lat + 0.03, lng: to.lng }); // about 2 miles out

/** Demo: the signed-in driver "drives" to his pickup in about 20 seconds (sets off the 4-minute alert on the way). */
export async function driveMeToPickup(onStep) {
  const uid = accounts.currentUid();
  const cur = core.readDoc(`driverInbox/${uid}`)?.current;
  if (!cur || cur.status !== "dispatched") throw new Error("No pickup to drive to. Take a call first.");
  const to = pickupOf(core.readDoc(`rides/${cur.rideId}`), core.readDoc(`board/${uid}`));
  if (!to) throw new Error("This pickup isn't on the map.");
  const from = startFrom(to);
  for (let i = 0; i <= 10; i++) {
    const p = lerp(from, to, i / 10);
    setSimulated({ ...p });
    await runAs(uid, "driverPing", { ...p, accuracy: 8 });
    onStep?.(i);
    if (i < 10) await new Promise((r) => setTimeout(r, 2000));
  }
}

// Example drivers that answer on their own, so a rider-only walkthrough
// still gets a car. They drive in from about 2 miles out (the rider gets the
// 4-minute alert), tap "I'm here", and pick up when the rider says they're at
// the car (or after a short wait).
async function runBots(now) {
  for (const b of core.runQuery({ collection: "demoBots" })) {
    const uid = b.path.split("/").pop();
    const bot = b.data;
    const board = admin().doc(`board/${uid}`);
    if (!board || board.status === "offline") continue;
    const loc = admin().doc(`driverLocations/${uid}`) || {};
    if (now - (loc.at || 0) > 30_000) {
      const at = zoneCenter(board.zoneId) || { lat: loc.lat ?? bot.lat, lng: loc.lng ?? bot.lng };
      await core.commit([{ type: "set", path: `driverLocations/${uid}`, merge: true, data: { ...at, zoneId: board.zoneId ?? null, at: now, live: ["ready", "moving"].includes(board.status), outOfZoneSince: null } }]);
    }
    const inbox = admin().doc(`driverInbox/${uid}`) || {};
    try {
      if (board.status === "offered" && inbox.offer && now - inbox.offer.startedAt > (bot.answerSec ?? 7) * 1000) {
        await runAs(uid, "acceptOffer", { rideId: inbox.offer.rideId });
      } else if (board.status === "on_call" && inbox.current) {
        const cur = inbox.current;
        const to = cur.status === "dispatched" ? pickupOf(admin().doc(`rides/${cur.rideId}`), board) : null;
        if (cur.status === "dispatched" && cur.arrivedAt == null && to) {
          const from = bot.rideId === cur.rideId && bot.from ? bot.from : startFrom(to);
          if (bot.rideId !== cur.rideId) await core.commit([{ type: "set", path: b.path, merge: true, data: { rideId: cur.rideId, from, lastPingAt: 0 } }]);
          const t = Math.min(1, (now - cur.assignedAt) / ((bot.driveSec ?? 40) * 1000));
          if (now - (bot.lastPingAt || 0) > 3000 || t >= 1) {
            await runAs(uid, "driverPing", { ...lerp(from, to, t), accuracy: 8 });
            await core.commit([{ type: "set", path: b.path, merge: true, data: { lastPingAt: now } }]);
          }
          if (t >= 1) await runAs(uid, "driverArrived", { rideId: cur.rideId, ...to });
        } else if (
          cur.status === "dispatched" &&
          (cur.arrivedAt != null
            ? cur.riderReply?.reply === "here" || now - cur.arrivedAt > (bot.waitSec ?? 45) * 1000
            : now - cur.assignedAt > (bot.pickupSec ?? 15) * 1000)
        ) {
          await runAs(uid, "driverPickedUp", { rideId: cur.rideId });
          await core.commit([{ type: "set", path: b.path, merge: true, data: { pickedAt: now } }]);
        } else if (cur.status === "in_transit" && now - (bot.pickedAt || 0) > (bot.rideSec ?? 25) * 1000) {
          const ride = admin().doc(`rides/${cur.rideId}`) || {};
          const at = (ride.dropLat != null && { lat: ride.dropLat, lng: ride.dropLng }) || zoneCenter(ride.dropZoneId) || zoneCenter(board.zoneId) || { lat: bot.lat, lng: bot.lng };
          await runAs(uid, "driverDropOff", at);
        }
      }
    } catch (e) {
      console.warn("[demo] bot", uid, e.message);
    }
  }
}

let ticking = false;
async function tick() {
  if (ticking || document.visibilityState !== "visible") return;
  ticking = true;
  const work = async () => {
    const now = Date.now();
    await runTimers(now);
    await runMinuteJobs(now);
    await runBots(now);
  };
  try {
    if (navigator.locks) await navigator.locks.request("rc-demo-tick", { ifAvailable: true }, (lock) => (lock ? work() : null));
    else await work();
  } catch (e) {
    console.error("[demo] tick", e);
  } finally {
    ticking = false;
  }
}
export function startEngine() {
  setInterval(tick, 1500);
}

// ------------------------------------------------------------ demo controls
const corePromise = import("../../functions/lib/dispatchCore.mjs");

/** "It's 2 PM": settle every open lease day now. */
export async function settleLeasesNow() {
  const c = await corePromise;
  const open = core.runQuery({ group: "days", filters: [["open", "==", true]] }).map((r) => ({ uid: r.path.split("/")[1], key: r.path.split("/").pop() }));
  open.sort((a, b) => a.uid.localeCompare(b.uid) || a.key.localeCompare(b.key));
  let n = 0;
  for (const p of open) if (await leaseModule._internal.settlePeriod(c, p.uid, p.key, Date.now())) n++;
  return n;
}

/** "It's past 4 PM": anyone still owing is locked off the board. */
export async function lockUnpaidNow() {
  const owing = core.runQuery({ collection: "drivers", filters: [["leaseOwedCents", ">", 0]] });
  if (owing.length) await core.commit(owing.map((d) => ({ type: "update", path: d.path, data: { leaseOwedPeriodKey: "2000-01-01" } })));
  return leaseModule._internal.lockUnpaid(Date.now());
}
