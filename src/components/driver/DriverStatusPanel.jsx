import { useMemo, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../config/firebase";
import { BRAND } from "../../config/constants";
import { CERT_LABELS } from "../../config/driverCerts";
import { useDriverGps } from "../../hooks/useDriverGps";
import { hasCert, linePosition, ordinal, zoneLine } from "../../../functions/lib/dispatchCore.mjs";

const OUT_OF_ZONE_MIN = BRAND.dispatch?.gps?.outOfZoneMin ?? 3;
const DROP_FRONT = (BRAND.dispatch?.dropOffPlacement ?? "front") === "front";
const call = (name) => httpsCallable(functions, name);
const goOnline = call("driverGoOnline");
const checkReady = call("driverCheckReady");
const goMoving = call("driverGoMoving");
const goOffline = call("driverGoOffline");
const dropOff = call("driverDropOff");

const BIG = "w-full rounded-2xl py-4 text-lg font-bold transition disabled:opacity-50";
const PRIMARY = `${BIG} bg-gold-400 text-navy-950 hover:bg-gold-300`;
const SECONDARY = `${BIG} bg-white/10 text-white hover:bg-white/15`;

function GpsLine({ gps, error, zoneLabel }) {
  if (gps === "off") return null;
  const ok = gps === "ok";
  const bad = gps === "denied" || gps === "unavailable";
  return (
    <div className="flex items-start gap-2 text-sm">
      <span
        className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${ok ? "bg-emerald-400" : bad ? "bg-red-500" : "bg-amber-400 animate-pulse"}`}
      />
      <p className={bad ? "text-red-300" : "text-slate-300"}>
        {ok ? `Location on · ${zoneLabel || "Not in a zone"}` : error || "Finding your location…"}
      </p>
    </div>
  );
}

function EventBanner({ event, uid, zoneLabel }) {
  const key = `rc.lastEventSeen.${uid}`;
  const [seen, setSeen] = useState(() => Number(localStorage.getItem(key) || 0));
  if (!event?.at || event.at <= seen || Date.now() - event.at > 12 * 3600_000) return null;
  const text =
    event.type === "gps_lost"
      ? "You went off the board because your location stopped updating. Keep this app open on your screen while you work."
      : event.type === "left_zone"
        ? `You left ${zoneLabel(event.zoneId) || "your zone"}, so you were moved to Moving.`
        : null;
  if (!text) return null;
  return (
    <div className="bg-amber-500/15 border border-amber-400/50 rounded-2xl p-4 text-amber-100">
      <p>{text}</p>
      <button
        className="mt-2 text-sm font-bold text-amber-300"
        onClick={() => {
          localStorage.setItem(key, String(event.at));
          setSeen(event.at);
        }}
      >
        OK
      </button>
    </div>
  );
}

function PositionLine({ drivers, uid, zoneId }) {
  const pos = linePosition(zoneLine(drivers, zoneId), uid);
  if (!pos || pos.onCall) return null;
  const onCallAhead = pos.position - 1 - pos.callsUntilYou;
  return (
    <p className="text-lg text-slate-200 mt-1">
      <span className="font-bold text-white">{ordinal(pos.position)} out</span>
      {" \u00b7 "}
      {pos.callsUntilYou === 0
        ? "you're next up"
        : `${pos.callsUntilYou} call${pos.callsUntilYou === 1 ? "" : "s"} until you`}
      {onCallAhead > 0 && <span className="text-slate-400">{` \u00b7 ${onCallAhead} on call`}</span>}
    </p>
  );
}

/** Online / Check Ready / Moving / Drop Off / Offline, driven by the phone's GPS. */
export default function DriverStatusPanel({ driver, board, drivers, zones }) {
  const uid = driver.id;
  const [starting, setStarting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const status = board?.status || "offline";
  const onBoard = status !== "offline";
  const [prevStatus, setPrevStatus] = useState(status);
  if (status !== prevStatus) {
    setPrevStatus(status);
    if (onBoard) setStarting(false);
  }
  const gps = useDriverGps(onBoard || starting);

  const zoneById = useMemo(() => Object.fromEntries(zones.map((z) => [z.id, z])), [zones]);
  const zoneLabel = (id) => zoneById[id]?.label || null;
  const gpsZone = zoneById[gps.gpsZoneId] || null;
  const certNeeded = gpsZone?.requiresCert && !hasCert(driver, gpsZone.requiresCert) ? gpsZone.requiresCert : null;

  async function run(fn, { withFix = true } = {}) {
    setBusy(true);
    setMsg("");
    try {
      const fix = withFix ? await gps.getFix() : null;
      const res = await fn(fix ? { lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy } : {});
      if (fix) gps.noteZone(res.data.gpsZoneId, fix);
    } catch (e) {
      setMsg((e?.code !== "functions/internal" && e?.message) || "Something went wrong. Try again.");
      return false;
    } finally {
      setBusy(false);
    }
    return true;
  }

  // GPS starts on the tap (so the phone asks permission right away) and
  // stays on once the board shows the driver online.
  async function handleGoOnline() {
    setStarting(true);
    if (!(await run(goOnline))) setStarting(false);
  }

  if (driver.status === "suspended" || driver.active === false) return null;

  return (
    <section className="glass-panel border border-white/10 rounded-2xl p-5 space-y-4">
      <div>
        <p className="text-xs font-bold tracking-widest text-slate-400 uppercase mb-1">Status</p>
        {status === "offline" && <p className="text-2xl font-bold">Off the board</p>}
        {status === "moving" && <p className="text-2xl font-bold">{"\u{1F695}"} Moving</p>}
        {status === "ready" && (
          <>
            <p className="text-2xl font-bold">
              Checked ready in <span className="text-gold-300">{zoneLabel(board.zoneId)}</span>
            </p>
            <PositionLine drivers={drivers} uid={uid} zoneId={board.zoneId} />
          </>
        )}
        {status === "offered" && <p className="text-2xl font-bold text-amber-300">Call coming in&hellip;</p>}
        {status === "on_call" && (
          <p className="text-2xl font-bold text-emerald-300">On call &middot; {zoneLabel(board.zoneId)}</p>
        )}
      </div>

      <GpsLine gps={gps.gps} error={gps.error} zoneLabel={gpsZone?.label} />
      <EventBanner event={board?.lastEvent} uid={uid} zoneLabel={zoneLabel} />

      {status === "ready" && gps.gps === "ok" && gps.gpsZoneId !== board.zoneId && (
        <p className="text-amber-300 text-sm">
          You&apos;re outside {zoneLabel(board.zoneId)}. Get back within {OUT_OF_ZONE_MIN} minutes or you&apos;ll be
          moved to Moving.
        </p>
      )}

      <div className="space-y-3">
        {status === "offline" && (
          <button className={PRIMARY} disabled={busy} onClick={handleGoOnline}>
            {busy ? "Turning on location…" : "Go Online"}
          </button>
        )}

        {(status === "moving" || (status === "ready" && gps.gpsZoneId && gps.gpsZoneId !== board.zoneId)) && (
          <button
            className={PRIMARY}
            disabled={busy || !gpsZone || !!certNeeded}
            onClick={() => run(checkReady)}
          >
            {!gpsZone
              ? "Drive into a zone to check ready"
              : certNeeded
                ? `${gpsZone.label}: ${CERT_LABELS[certNeeded]?.label || "certification"} needed`
                : `Check Ready in ${gpsZone.label}`}
          </button>
        )}

        {status === "on_call" && (
          <>
            <button className={PRIMARY} disabled={busy} onClick={() => run(dropOff)}>
              Drop Off
            </button>
            <p className="text-sm text-slate-400">
              {!gpsZone
                ? "You're outside every zone, so you'll go to Moving."
                : certNeeded
                  ? `${gpsZone.label} needs certification, so you'll go to Moving.`
                  : DROP_FRONT
                    ? `You'll be next up in ${gpsZone.label}.`
                    : `You'll go to the back of the ${gpsZone.label} line.`}
            </p>
          </>
        )}

        {status === "ready" && (
          <button className={SECONDARY} disabled={busy} onClick={() => run(goMoving)}>
            I&apos;m moving
          </button>
        )}

        {(status === "moving" || status === "ready") && (
          <button
            className="w-full py-2 text-sm font-semibold text-slate-400 hover:text-white"
            disabled={busy}
            onClick={() => run(goOffline, { withFix: false })}
          >
            Go Offline
          </button>
        )}
      </div>

      {msg && <p className="text-red-300 text-sm">{msg}</p>}

      {onBoard && (
        <p className="text-xs text-slate-500">
          Keep this screen open while you work. If you switch apps or lock the phone, your location stops and
          you&apos;ll fall off the board after a few minutes.
        </p>
      )}
    </section>
  );
}
