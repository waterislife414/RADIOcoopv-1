// What a support ticket carries so a problem can be fixed without a phone call:
// app version, phone model, permission states, the last GPS fix and the last
// 50 errors the app itself saw.
const errors = [];
const push = (m) => {
  errors.push(`${new Date().toISOString().slice(11, 19)} ${String(m).slice(0, 180)}`);
  if (errors.length > 50) errors.shift();
};
let installed = false;
export function installErrorLog() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("error", (e) => push(e.message || "error"));
  window.addEventListener("unhandledrejection", (e) => push(e.reason?.message || e.reason || "rejected promise"));
}
export const recentErrors = () => errors.slice();

async function permState(name) {
  try {
    const r = await navigator.permissions.query({ name });
    return r.state === "prompt" ? "off" : r.state; // granted | denied | off
  } catch {
    return "unknown";
  }
}

export async function collectDevice({ fix = null, gpsState = "", zoneId = "" } = {}) {
  const notif = typeof Notification !== "undefined" ? Notification.permission : "unknown";
  return {
    appVersion: import.meta.env?.MODE || "web",
    userAgent: navigator.userAgent,
    phoneModel: navigator.userAgentData?.platform || navigator.platform || "",
    permissions: {
      location: await permState("geolocation"),
      notifications: notif === "granted" ? "granted" : notif === "denied" ? "denied" : notif === "default" ? "off" : "unknown",
      camera: await permState("camera"),
    },
    lastFix: fix ? { lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy, ageSec: Math.round((Date.now() - fix.t) / 1000) } : null,
    gpsState,
    zoneId: zoneId || "",
    errors: recentErrors(),
  };
}
