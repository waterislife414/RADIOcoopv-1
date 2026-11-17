import { useEffect, useState } from "react";
import * as core from "./core";
import { accounts } from "./accounts";
import { getSimulated, setSimulated } from "./geo";
import { center } from "./seed";
import { driveMeToPickup, lockUnpaidNow, settleLeasesNow } from "./engine";
import { resetDemo } from "./boot";

const ROLES = [
  { uid: null, label: "Rider (guest)", path: "/" },
  { uid: "demo-rider", label: "Rider with an account", path: "/" },
  { uid: "demo-driver-44", label: "Driver · Car 44", path: "/driver" },
  { uid: "demo-driver-12", label: "Driver · Car 12 (Base + van)", path: "/driver" },
  { uid: "demo-admin", label: "Dispatcher / Owner", path: "/admin/dashboard" },
  { uid: "demo-mechanic", label: "Mechanic \u00b7 Shop board", path: "/shop" },
];

/** Small floating menu, demo build only: switch role, set location, fast-forward the lick clock. */
export default function DemoBar() {
  const [open, setOpen] = useState(false);
  const [zones, setZones] = useState([]);
  const [note, setNote] = useState("");
  const [popup, setPopup] = useState(null); // what a clock jump just did
  const [jump, setJump] = useState(null); // { label } the demo clock after a jump
  const [tick, setTick] = useState(() => Date.now());
  const [, force] = useState(0);
  const uid = accounts.currentUid();
  const sim = getSimulated();

  useEffect(() => {
    const read = () => setZones(core.runQuery({ collection: "zones" }).map((r) => ({ id: r.path.split("/").pop(), ...r.data })).sort((a, b) => a.order - b.order));
    read();
    const a = core.subscribe(read);
    const b = accounts.onChange(() => force((n) => n + 1));
    return () => {
      a();
      b();
    };
  }, []);

  function go(role, newTab) {
    const url = `${role.path}?as=${role.uid || "guest"}`;
    if (newTab) window.open(url, "_blank");
    else window.location.assign(url);
  }
  async function act(fn, done, clock = null) {
    setNote("Working…");
    try {
      const n = await fn();
      const msg = done(n);
      setNote(msg);
      if (clock) {
        setJump({ label: clock });
        setPopup({ title: `Demo clock: ${clock}`, text: msg });
      }
    } catch (e) {
      setNote(e.message || "Didn't work.");
    }
  }
  useEffect(() => {
    const t = setInterval(() => setTick(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);

  // Tab on the left edge, clear of the app's own buttons.
  const box = { position: "fixed", left: 0, top: "42%", zIndex: 9999, fontFamily: "system-ui, sans-serif" };
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{ ...box, background: "#0f172a", color: "#fbbf24", border: "2px solid #fbbf24", borderLeft: 0, borderRadius: "0 10px 10px 0", padding: "10px 6px", writingMode: "vertical-rl", fontWeight: 800, fontSize: 11, letterSpacing: 2, boxShadow: "0 4px 14px rgba(0,0,0,.35)" }}>
        DEMO
      </button>
    );
  }
  const btn = { display: "block", width: "100%", textAlign: "left", padding: "9px 10px", borderRadius: 10, border: "1px solid #e2e8f0", background: "#fff", fontSize: 14, cursor: "pointer" };
  const h = { fontSize: 11, fontWeight: 800, letterSpacing: 1, color: "#64748b", textTransform: "uppercase", margin: "12px 0 6px" };
  return (
    <>
    {popup && (
      <div role="alertdialog" data-testid="demo-popup" style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(0,0,0,.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
        <div style={{ background: "#fff", color: "#0f172a", borderRadius: 18, padding: 22, maxWidth: 360, width: "100%", fontFamily: "system-ui, sans-serif" }}>
          <p style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{popup.title}</p>
          <p style={{ fontSize: 16, margin: "10px 0 16px" }}>{popup.text}</p>
          <button onClick={() => setPopup(null)} style={{ width: "100%", padding: 12, borderRadius: 12, border: 0, background: "#0f172a", color: "#fbbf24", fontWeight: 800, fontSize: 16 }}>OK</button>
        </div>
      </div>
    )}
    <div style={{ ...box, top: 12, left: 12, width: 300, maxHeight: "86vh", overflowY: "auto", background: "#f8fafc", color: "#0f172a", borderRadius: 16, padding: 14, boxShadow: "0 10px 30px rgba(0,0,0,.4)", border: "2px solid #fbbf24" }}>
      <div style={{ display: "flex", alignItems: "center" }}>
        <strong style={{ flex: 1 }}>Demo &mdash; example data</strong>
        <button onClick={() => setOpen(false)} style={{ border: 0, background: "none", fontSize: 20, cursor: "pointer" }} aria-label="Close">
          &times;
        </button>
      </div>
      <p style={{ fontSize: 12, color: "#475569", margin: "4px 0 0" }}>Nothing here is real: no charges, no real people. Everything runs in this browser.</p>

      <p style={h}>Use the app as</p>
      {ROLES.map((r) => (
        <div key={r.label} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
          <button style={{ ...btn, fontWeight: (r.uid || null) === (uid || null) ? 800 : 500, borderColor: (r.uid || null) === (uid || null) ? "#0f172a" : "#e2e8f0" }} onClick={() => go(r, false)}>
            {r.label}
          </button>
          <button style={{ ...btn, width: 44, textAlign: "center" }} title="Open in a new tab" onClick={() => go(r, true)}>
            &#8599;
          </button>
        </div>
      ))}

      <p style={h}>Demo clock</p>
      <p data-testid="demo-clock" style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>
        {jump ? `${jump.label} (jumped)` : new Date(tick).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
      </p>
      <p style={{ margin: "2px 0 0", fontSize: 11, color: "#64748b" }}>
        The real clock can&apos;t be changed. The jump buttons below run the 2 PM and 4 PM lick steps right now.
      </p>

      <p style={h}>This device is at</p>
      <select
        value={sim?.real ? "real" : sim?.zoneId || ""}
        onChange={(e) => {
          const v = e.target.value;
          setSimulated(v === "real" ? null : { ...center(v), zoneId: v });
          force((n) => n + 1);
        }}
        style={{ ...btn, padding: "9px 8px" }}
      >
        {zones.map((z) => (
          <option key={z.id} value={z.id}>
            {z.label}
          </option>
        ))}
        <option value="real">Real GPS of this device</option>
      </select>
      <p data-testid="demo-location" style={{ margin: "4px 0 0", fontSize: 12, color: sim && !sim.real ? "#b45309" : "#475569", fontWeight: sim && !sim.real ? 700 : 400 }}>
        {sim && !sim.real ? `Demo location: ${zones.find((z) => z.id === sim.zoneId)?.label || "a set spot"}` : "Using this device's real GPS"}
      </p>

      {String(uid || "").startsWith("demo-driver") && (
        <>
          <p style={h}>On a call</p>
          <button
            style={{ ...btn, marginBottom: 6 }}
            onClick={() => act(() => driveMeToPickup((i) => setNote(`Driving\u2026 ${i * 10}%`)), () => "At the pickup. Tap \u201cI'm here\u201d.")}
          >
            Drive my car to the pickup (20 sec)
          </button>
        </>
      )}

      <p style={h}>Lick clock</p>
      <button style={{ ...btn, marginBottom: 6 }} onClick={() => act(settleLeasesNow, (n) => `2 PM: settled ${n} lick day${n === 1 ? "" : "s"}. Drivers who didn't pay show as owing.`, "2:00 PM")}>
        Jump to 2 PM &mdash; settle today&apos;s licks
      </button>
      <button style={btn} onClick={() => act(lockUnpaidNow, (n) => `4 PM: ${n} driver${n === 1 ? "" : "s"} put on hold for unpaid lick.`, "4:00 PM")}>
        Jump past 4 PM &mdash; lock unpaid drivers
      </button>

      <p style={h}>Start over</p>
      <button style={btn} onClick={() => resetDemo().then(() => window.location.assign("/"))}>
        Reset example data
      </button>
      {note && <p style={{ fontSize: 13, color: "#0f766e", marginTop: 8 }}>{note}</p>}
      <p style={{ fontSize: 11, color: "#64748b", marginTop: 10 }}>Sign-in for any example account: password &ldquo;demo1234&rdquo;.</p>
    </div>
    </>
  );
}
