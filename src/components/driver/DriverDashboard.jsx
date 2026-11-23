import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../config/firebase";
import { useAuth } from "../../context/AuthContext";
import { COMPANY_WORDMARK } from "../../config/constants";
import { CERT_LABELS } from "../../config/driverCerts";
import DriverCerts from "./DriverCerts";
import DriverLeaseCard from "./DriverLeaseCard";
import VehicleCheckCard from "./VehicleCheckCard";
import EmergencyButton from "./EmergencyButton";
import DriverRecord from "./DriverRecord";
import DriverAgreementGate from "./DriverAgreementGate";
import { consentIsCurrent } from "../../legal/documents";
import DriverStatusPanel from "./DriverStatusPanel";
import ZoneBoard from "../board/ZoneBoard";
import { useLiveBoard } from "../../hooks/useLiveBoard";
import { useDriverInbox } from "../../hooks/useDriverInbox";
import OfferAlert from "./OfferAlert";
import BroadcastList from "./BroadcastList";
import CurrentRide from "./CurrentRide";

/** "The rider cancelled. $5 goes to your lease credit." Shows for 10 minutes or until closed. */
function DriverNotice({ notice }) {
  const [closed, setClosed] = useState(() => {
    try {
      return Number(localStorage.getItem("rc-driver-notice") || 0);
    } catch {
      return 0;
    }
  });
  if (!notice?.text || notice.at <= closed || Date.now() - notice.at > 10 * 60000) return null;
  function close() {
    try {
      localStorage.setItem("rc-driver-notice", String(notice.at));
    } catch {
      // Fine: it hides for this visit.
    }
    setClosed(notice.at);
  }
  return (
    <div className="rounded-2xl bg-gold-400 text-navy-950 p-4 font-bold flex items-start justify-between gap-3" role="status">
      <span>{notice.text}</span>
      <button type="button" onClick={close} className="shrink-0 underline min-h-[48px] min-w-[48px]">
        OK
      </button>
    </div>
  );
}
import { unlockAudio } from "../../utils/alertSound";

function CertBadges({ certs }) {
  const approved = Object.entries(certs || {}).filter(([, c]) => c?.status === "approved");
  if (approved.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 mt-3">
      {approved.map(([key]) => (
        <span
          key={key}
          className="text-sm font-bold px-3 py-1 rounded-full bg-gold-400/15 text-gold-300 border border-gold-400/40"
        >
          {CERT_LABELS[key]?.icon} {CERT_LABELS[key]?.label || key}
        </span>
      ))}
    </div>
  );
}

// The approved driver's screen. Sections are filled in by the dispatch,
// GPS, certification and lease features.
export default function DriverDashboard() {
  const { currentUser, logout } = useAuth();
  const [driver, setDriver] = useState(null);
  const { drivers, zones } = useLiveBoard();
  const board = drivers.find((d) => d.id === currentUser.uid) || null;
  const canWork = driver && driver.status !== "suspended" && driver.active !== false;
  const inbox = useDriverInbox(currentUser.uid);
  const offer =
    inbox.offer && board?.status === "offered" && board.offerRideId === inbox.offer.rideId ? inbox.offer : null;
  const free = board?.status === "ready" || board?.status === "moving";

  // Sound needs one tap on the page before a call can ring.
  useEffect(() => {
    window.addEventListener("pointerdown", unlockAudio, { once: true });
    return () => window.removeEventListener("pointerdown", unlockAudio);
  }, []);

  useEffect(() => {
    return onSnapshot(doc(db, "drivers", currentUser.uid), (snap) => {
      setDriver(snap.exists() ? { id: snap.id, ...snap.data() } : null);
    });
  }, [currentUser.uid]);

  // Terms changed while he's on the board: take him off until he agrees, so
  // he isn't offered calls on a screen that can't show them.
  const needsAgreement = !!driver && driver.active !== false && !consentIsCurrent(driver.agreement, ["driver-agreement", "privacy"]);
  useEffect(() => {
    if (needsAgreement && (board?.status === "ready" || board?.status === "moving")) {
      httpsCallable(functions, "driverGoOffline")({}).catch(() => {});
    }
  }, [needsAgreement, board?.status]);

  if (!driver) {
    return (
      <div className="min-h-screen bg-navy-950 flex items-center justify-center">
        <p className="text-slate-400 text-base">Loading your driver profile&hellip;</p>
      </div>
    );
  }
  if (driver.active !== false && !consentIsCurrent(driver.agreement, ["driver-agreement", "privacy"])) {
    return <DriverAgreementGate driver={driver} onSignOut={logout} />;
  }

  return (
    <div className="min-h-screen bg-navy-950 text-white pb-32">
      <header className="px-5 pt-6 pb-5 border-b border-white/10">
        <div className="flex items-start justify-between gap-3 max-w-md mx-auto">
          <div>
            <p className="text-xs font-bold tracking-[0.3em] text-gold-400 uppercase">{COMPANY_WORDMARK}</p>
            <h1 className="font-display font-bold text-3xl mt-1">Car {driver.carNumber}</h1>
            <p className="text-slate-300 text-base">{driver.name}</p>
            <CertBadges certs={driver.certs} />
          </div>
          <button onClick={logout} className="min-h-[48px] px-3 mr-12 text-sm font-semibold text-slate-400 hover:text-white">
            Sign out
          </button>
        </div>
      </header>

      {driver.active !== false && <EmergencyButton />}
      <main className="px-5 pt-5 max-w-md mx-auto space-y-5">
        {driver.status === "suspended" && (
          <div className="bg-red-600/20 border-2 border-red-500 rounded-2xl p-5 text-center">
            <p className="font-bold text-xl text-red-300">Suspended</p>
            <p className="text-slate-200 mt-1">Come back to the shop to get reinstated.</p>
          </div>
        )}

        {offer && <OfferAlert key={offer.rideId} offer={offer} warnings={driver.warnings ?? 0} />}

        <DriverStatusPanel driver={driver} board={board} drivers={drivers} zones={zones} rideStatus={inbox.current?.status ?? null} current={inbox.current || null} />

        <DriverNotice notice={inbox.notice} />
        {board?.status === "on_call" && <CurrentRide ride={inbox.current} />}
        {canWork && free && <BroadcastList broadcasts={inbox.broadcasts} />}

        {canWork && (
          <section className="glass-panel border border-white/10 rounded-2xl p-5">
            <p className="text-xs font-bold tracking-widest text-slate-400 uppercase mb-1">Board</p>
            <ZoneBoard drivers={drivers} zones={zones} viewer={driver} variant="driver" />
          </section>
        )}

        {driver.active !== false && <VehicleCheckCard driver={driver} />}
        {driver.active !== false && <DriverLeaseCard driver={driver} />}

        <DriverRecord driver={driver} />

        <DriverCerts driver={driver} />
      </main>
    </div>
  );
}
