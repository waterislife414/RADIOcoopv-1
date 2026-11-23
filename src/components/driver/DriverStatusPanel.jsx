import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../config/firebase";
import { BRAND } from "../../config/constants";
import { CERT_LABELS } from "../../config/driverCerts";
import { useDriverGps, MAX_ACCURACY_M } from "../../hooks/useDriverGps";
import { unlockAudio } from "../../utils/alertSound";
import { enableDriverPush, pushPermission } from "../../push/driverPush";
import { hasCert, linePosition, ordinal, zoneLine } from "../../../functions/lib/dispatchCore.mjs";
import { inspectionNeeded } from "../../../functions/lib/inspectionCore.mjs";
import AskDispatch from "./AskDispatch";
import ApprovalAnswer from "./ApprovalAnswer";
import AccuracyCircle from "./AccuracyCircle";
import MeterCharge from "./MeterCharge";

const OUT_OF_ZONE_MIN = BRAND.dispatch?.gps?.outOfZoneMin ?? 3;
const MAX_WARNINGS = BRAND.dispatch?.maxWarnings ?? 3;
const DROP_FRONT = (BRAND.dispatch?.dropOffPlacement ?? "front") === "front";
const call = (name) => httpsCallable(functions, name);
const goOnline = call("driverGoOnline");
const checkReady = call("driverCheckReady");
const goMoving = call("driverGoMoving");
const goOffline = call("driverGoOffline");
const dropOff = call("driverDropOff");
const submitInspection = call("submitInspection");

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
  const strike = event.warnings ? ` Warning ${event.warnings} of ${MAX_WARNINGS}.` : "";
  const text = {
    gps_lost:
      "You went off the board because your location stopped updating. Keep this app open on your screen while you work.",
    left_zone: `You left ${zoneLabel(event.zoneId) || "your zone"}, so you were moved to Moving.`,
    missed_call: `You didn't answer a call, so you're off the board.${strike}`,
    declined: `You turned down a call, so you're off the board.${strike}`,
    ride_cancelled: "Your call was cancelled. You're back on the board.",
    lease_lock: "Lick not paid, so you're off the board. Drop your envelope and log it below.",
  }[event.type];
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
      {onCallAhead > 0 && <span className="text-slate-500">{` \u00b7 ${onCallAhead} on call`}</span>}
    </p>
  );
}

/** Online / Check Ready / Moving / Drop Off / Offline, driven by the phone's GPS. */
export default function DriverStatusPanel({ driver, board, drivers, zones, rideStatus = null, current = null }) {
  const uid = driver.id;
  // Card ride with the rider's card on file: Drop Off asks for the meter and charges it.
  const [meterOpen, setMeterOpen] = useState(false);
  const cardRide = !!(current?.cardHold && current?.rideId && board?.rideId === current.rideId);
  const [starting, setStarting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [push, setPush] = useState(() => pushPermission());
  const [problem, setProblem] = useState(null); // why the last tap was refused: { message, details }
  const [asking, setAsking] = useState(false);

  const navigate = useNavigate();
  const [shiftCheck, setShiftCheck] = useState(false);
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
    setProblem(null);
    try {
      const fix = withFix ? await gps.getFix() : null;
      const res = await fn(fix ? { lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy } : {});
      if (fix) gps.noteZone(res.data.gpsZoneId, fix);
    } catch (e) {
      const message = (e?.code !== "functions/internal" && e?.message) || "Something went wrong. Try again.";
      setMsg(message);
      setProblem({ message, details: e?.details || {}, retry: fn });
      return false;
    } finally {
      setBusy(false);
    }
    return true;
  }

  // GPS starts on the tap (so the phone asks permission right away) and
  // stays on once the board shows the driver online.
  async function handleGoOnline() {
    unlockAudio();
    const needed = inspectionNeeded(driver.inspection, driver.carNumber, Date.now());
    if (needed === "initial" || needed === "weekly") {
      navigate(`/driver/inspection?type=${needed}&then=online`);
      return;
    }
    if (needed === "shift") {
      setShiftCheck(true);
      return;
    }
    setStarting(true);
    if (!(await run(goOnline))) setStarting(false);
  }

  // Start-of-shift check: one tap if nothing changed, then straight on the board.
  async function shiftOk() {
    setBusy(true);
    setMsg("");
    try {
      await submitInspection({ type: "shift", noNewDamage: true, signedName: driver.name || "Driver" });
    } catch (e) {
      setBusy(false);
      setMsg(e?.message || "Couldn't save the check. Try again.");
      return;
    }
    setBusy(false);
    setShiftCheck(false);
    setStarting(true);
    if (!(await run(goOnline))) setStarting(false);
  }

  if (driver.status === "suspended" || driver.active === false) return null;

  return (
    <>
      {shiftCheck && (
        <div className="fixed inset-0 z-[70] bg-black/70 flex items-end sm:items-center justify-center p-3" role="dialog" aria-modal="true" aria-label="Start-of-shift check">
          <div className="w-full max-w-md rounded-3xl bg-navy-900 border border-white/15 p-5 space-y-3 text-white">
            <p className="text-xs font-bold tracking-widest text-gold-400 uppercase">Start-of-shift check &middot; Car {driver.carNumber}</p>
            <p className="text-2xl font-display font-bold">Walk around your car.</p>
            <p className="text-lg text-slate-200">Any new damage, or anything wrong with it since your last check?</p>
            <button type="button" disabled={busy} onClick={shiftOk} className="w-full min-h-[56px] rounded-2xl bg-emerald-500 text-navy-950 font-extrabold text-lg disabled:opacity-60">
              {busy ? "Saving\u2026" : "\u2713 No, it's the same \u2014 Go Online"}
            </button>
            <button type="button" onClick={() => navigate("/driver/inspection?type=damage&then=online")} className="w-full min-h-[52px] rounded-2xl border-2 border-amber-400 text-amber-200 font-bold text-lg">
              Yes &mdash; report new damage
            </button>
            <button type="button" onClick={() => navigate("/driver/inspection?type=repair&then=online")} className="w-full min-h-[52px] rounded-2xl border-2 border-white/30 font-bold text-lg">
              Something&rsquo;s wrong with the car
            </button>
            <button type="button" onClick={() => setShiftCheck(false)} className="w-full py-2 text-slate-300 font-semibold">
              Not now
            </button>
            <p className="text-xs text-slate-400">Tapping &ldquo;No&rdquo; is your sign-off that the car has no new damage you haven&rsquo;t reported.</p>
          </div>
        </div>
      )}
    <section className="glass-panel border border-white/10 rounded-2xl p-5 space-y-4">

      <div>
        <p className="text-xs font-bold tracking-widest text-slate-500 uppercase mb-1">Status</p>
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
        {status === "on_call" && board?.radioCall && (
          <p className="text-lg font-bold text-amber-200">
            {"\u{1F4FB}"} Radio call from dispatch{board.radioCall.note ? `: ${board.radioCall.note}` : ""}. Tap Drop Off when you&rsquo;re done.
          </p>
        )}
      </div>

      <GpsLine gps={gps.gps} error={gps.error} zoneLabel={gpsZone?.label} />
      {gps.gps === "ok" && gps.fix?.accuracy != null && (
        <>
          <p className={`text-sm ${gps.fix.accuracy > MAX_ACCURACY_M ? "text-amber-300 font-semibold" : "text-slate-400"}`} data-testid="gps-accuracy">
            {gps.fix.accuracy > MAX_ACCURACY_M
              ? `Waiting for a better GPS signal (\u00b1${Math.round(gps.fix.accuracy)} m)`
              : `GPS accuracy \u00b1${Math.round(gps.fix.accuracy)} m`}
          </p>
          <AccuracyCircle lat={gps.fix.lat} lng={gps.fix.lng} accuracy={gps.fix.accuracy} max={MAX_ACCURACY_M} />
        </>
      )}
      <ApprovalAnswer uid={uid} />
      {problem && (
        <div className="rounded-2xl border border-red-400/40 bg-red-500/10 p-4 space-y-2" data-testid="ready-blocker">
          <p className="text-lg font-bold text-red-200">{problem.message}</p>
          <div className="flex flex-wrap gap-2">
            {problem.details.inspection && (
              <button type="button" className="min-h-[48px] px-4 rounded-xl bg-gold-400 text-navy-950 font-bold" onClick={() => navigate(`/driver/inspection?type=${problem.details.inspection === "shift" ? "weekly" : problem.details.inspection}&then=online`)}>
                Do the vehicle check
              </button>
            )}
            {problem.details.weakGps && (
              <button type="button" className="min-h-[48px] px-4 rounded-xl bg-gold-400 text-navy-950 font-bold" onClick={() => run(problem.retry)}>
                Try again
              </button>
            )}
            {problem.details.agreement && (
              <button type="button" className="min-h-[48px] px-4 rounded-xl bg-gold-400 text-navy-950 font-bold" onClick={() => navigate("/driver-agreement")}>
                Sign agreement
              </button>
            )}
            <button type="button" className="min-h-[48px] px-4 rounded-xl bg-white/10 text-white font-bold" onClick={() => setAsking(true)}>
              Ask dispatch
            </button>
          </div>
          {problem.details.settings && (
            <p className="text-sm text-slate-300">
              Go to your phone&apos;s Settings &gt; Apps &gt; Radio Co-op &gt; Permissions to turn them on.
            </p>
          )}
        </div>
      )}
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

        {status === "on_call" && (!board?.rideId || rideStatus === "in_transit") && (
          <>
            <button className={PRIMARY} disabled={busy} onClick={() => (cardRide ? setMeterOpen(true) : run(dropOff))}>
              {cardRide ? "Drop Off & Charge Card" : "Drop Off"}
            </button>
            {meterOpen && (
              <MeterCharge
                rideId={current.rideId}
                estMiles={current.estMiles}
                passengers={current.passengers || 1}
                onCancel={() => setMeterOpen(false)}
                onDone={() => {
                  setMeterOpen(false);
                  run(dropOff);
                }}
              />
            )}
            <p className="text-sm text-slate-500">
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
            className="w-full min-h-[48px] py-2 text-base font-semibold text-slate-400 hover:text-white"
            disabled={busy}
            onClick={() => run(goOffline, { withFix: false })}
          >
            Go Offline
          </button>
        )}
      </div>

      {msg && !problem && <p className="text-red-300 text-sm">{msg}</p>}

      <button
        type="button"
        data-testid="report-problem"
        className="w-full min-h-[48px] rounded-xl bg-white/5 border border-white/15 text-slate-200 font-semibold"
        onClick={() => setAsking(true)}
      >
        Report a problem / Ask dispatch
      </button>
      {asking && (
        <AskDispatch
          onClose={() => setAsking(false)}
          defaultArea={status === "moving" || status === "offline" ? (status === "offline" ? "go_online" : "check_ready") : "other"}
          reason={problem?.message || ""}
          zones={zones}
          defaultZoneId={gps.gpsZoneId || board?.zoneId || ""}
          gps={gps}
          onAsked={() => setProblem(null)}
        />
      )}

      {onBoard && push === "default" && (
        <button
          className="w-full rounded-xl py-3 font-semibold bg-white/5 border border-white/15 text-slate-200"
          onClick={async () => setPush(await enableDriverPush().catch(() => "unsupported"))}
        >
          {"\u{1F514}"} Turn on call alerts for when your screen is off
        </button>
      )}

      {onBoard && (
        <p className="text-xs text-slate-500">
          Keep this screen open while you work. If you switch apps or lock the phone, your location stops and
          you&apos;ll fall off the board after a few minutes.
        </p>
      )}
    </section>
    </>
  );
}
