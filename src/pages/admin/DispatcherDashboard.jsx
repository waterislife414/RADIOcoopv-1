import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
  getDoc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../config/firebase";
import { useAuth } from "../../context/AuthContext";
import RideCard from "../../components/admin/RideCard";
import ConfirmModal from "../../components/admin/ConfirmModal";
import FareModal from "../../components/admin/FareModal";
import WalletChargeModal from "../../components/admin/WalletChargeModal";
import DispatcherAccountSettings from "../../components/admin/DispatcherAccountSettings";
import DriverApplicationsPanel from "../../components/admin/DriverApplicationsPanel";
import ZoneBoard from "../../components/board/ZoneBoard";
import DispatchModePanel from "../../components/admin/DispatchModePanel";
import AssignCarModal from "../../components/admin/AssignCarModal";
import CarActionsModal from "../../components/admin/CarActionsModal";
import LeaseAlert from "../../components/admin/LeaseAlert";
import QuickEntry from "../../components/admin/QuickEntry";
import { useLiveBoard } from "../../hooks/useLiveBoard";
import { OFFICE_ADDRESS, COMPANY_PHONE_DISPLAY, COPY } from "../../config/constants";

const NEXT_STATUS = {
  pending: "dispatched",
  dispatched: "in_transit",
  in_transit: "finished",
};

export default function DispatcherDashboard() {
  const { logout, getRideCountAndPerk } = useAuth();
  const [pending, setPending] = useState([]);
  const [active, setActive] = useState([]);
  const [customerStatusMap, setCustomerStatusMap] = useState({});
  const [dailyGross, setDailyGross] = useState(0);
  const [dismissTarget, setDismissTarget] = useState(null);
  const [fareModalRide, setFareModalRide] = useState(null);
  const [walletChargeRide, setWalletChargeRide] = useState(null);
  const [showAccountSettings, setShowAccountSettings] = useState(false);
  const liveBoard = useLiveBoard();
  const [assignRide, setAssignRide] = useState(null);
  const [carAction, setCarAction] = useState(null); // board entry, or "new" for a radio car
  const carFor = (uid) => liveBoard.drivers.find((d) => d.id === uid)?.carNumber;
  const boardCounts = liveBoard.drivers.reduce((m, d) => ({ ...m, [d.status]: (m[d.status] || 0) + 1 }), {});
  const [pendingIdVerifications, setPendingIdVerifications] = useState([]);

  useEffect(() => {
    const idQ = query(collection(db, "users"), where("idVerified", "==", false));
    const unsub = onSnapshot(idQ, (snap) => {
      setPendingIdVerifications(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, []);

  async function approveIdVerification(userId) {
    await updateDoc(doc(db, "users", userId), { idVerified: true });
  }

  useEffect(() => {
    const pendingQ = query(
      collection(db, "rides"),
      where("status", "==", "pending"),
      orderBy("timestamp", "asc")
    );
    const unsubPending = onSnapshot(pendingQ, (snap) => {
      setPending(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    const activeQ = query(
      collection(db, "rides"),
      where("status", "in", ["dispatched", "in_transit", "finished"]),
      orderBy("timestamp", "asc")
    );
    const unsubActive = onSnapshot(activeQ, (snap) => {
      setActive(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const grossQ = query(
      collection(db, "rides"),
      where("status", "==", "finished"),
      where("timestamp", ">=", Timestamp.fromDate(startOfDay))
    );
    const unsubGross = onSnapshot(grossQ, (snap) => {
      let total = 0;
      snap.forEach((d) => {
        const r = d.data();
        if (
          (r.paymentMethod === "card" || r.paymentMethod === "transfer") &&
          typeof r.finalFare === "number"
        ) {
          total += r.finalFare;
        }
      });
      setDailyGross(total);
    });

    return () => {
      unsubPending();
      unsubActive();
      unsubGross();
    };
  }, []);

  // Look up membership tier + free-ride status for signed-in customers only.
  useEffect(() => {
    const allRides = [...pending, ...active];
    const uniqueCustomerIds = [
      ...new Set(
        allRides
          .map((r) => r.customerId)
          .filter((id) => id && id !== "guest" && !customerStatusMap[id])
      ),
    ];
    if (uniqueCustomerIds.length === 0) return;

    uniqueCustomerIds.forEach(async (uid) => {
      try {
        const userSnap = await getDoc(doc(db, "users", uid));
        const tier = userSnap.exists() ? userSnap.data().subscriptionTier : null;
        const perk = await getRideCountAndPerk(uid);
        setCustomerStatusMap((prev) => ({
          ...prev,
          [uid]: { tier, hasFreeRideNow: perk.hasFreeRideNow },
        }));
      } catch (err) {
        // Non-fatal — card just shows no membership badge.
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, active]);

  async function handleDispatchAdvance(ride) {
    if (ride.status === "pending") {
      setAssignRide(ride);
      return;
    }
    const next = NEXT_STATUS[ride.status];
    if (!next) return;
    await updateDoc(doc(db, "rides", ride.id), { status: next });
  }

  async function handleSetZone(ride, zoneId) {
    try {
      await httpsCallable(functions, "dispatcherSetRideZone")({ rideId: ride.id, zoneId });
    } catch (e) {
      alert(e?.message || "Couldn't set the zone.");
    }
  }

  function requestDismiss(ride) {
    setDismissTarget(ride);
  }

  async function confirmDismiss() {
    if (!dismissTarget) return;
    const ride = dismissTarget;
    setDismissTarget(null);
    try {
      if (ride.paymentMethod === "card" && ride.paymentIntentId) {
        const declineRide = httpsCallable(functions, "declineRide");
        await declineRide({ rideId: ride.id });
      }
    } catch (err) {
      // If Cloud Functions aren't live yet, still remove the request.
    }
    await deleteDoc(doc(db, "rides", ride.id));
  }

  function requestCaptureFare(ride) {
    setFareModalRide(ride);
  }

  async function confirmCaptureFare(finalFare) {
    const ride = fareModalRide;
    setFareModalRide(null);
    try {
      const captureFare = httpsCallable(functions, "captureFare");
      await captureFare({ rideId: ride.id, meterFare: finalFare, tipAmount: 0 });
    } catch (err) {
      alert(
        "Could not capture card payment automatically (card processing isn't fully activated yet). Recording the fare manually — collect payment another way for now."
      );
      await updateDoc(doc(db, "rides", ride.id), { finalFare, settledBy: "dispatcher_override" });
    }
  }

  async function handleArchive(ride) {
    await updateDoc(doc(db, "rides", ride.id), { status: "archived" });
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-navy-950 text-white px-6 py-5 flex justify-between items-center flex-wrap gap-2">
        <div>
          <h1 className="font-display font-bold text-2xl">{COPY.dispatcherDashboardTitle}</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {OFFICE_ADDRESS} &middot; {COMPANY_PHONE_DISPLAY}
          </p>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-right">
            <p className="text-xs text-slate-400 uppercase tracking-wide">
              Today's Electronic Gross
            </p>
            <p className="font-bold text-xl text-gold-300">${dailyGross.toFixed(2)}</p>
          </div>
          <Link to="/admin/drivers" className="text-base font-semibold text-gold-300 hover:text-gold-200">
            Drivers &amp; Fleet
          </Link>
          <Link to="/admin/map" className="text-base font-semibold text-gold-300 hover:text-gold-200">
            Live Map
          </Link>
          <Link to="/admin/lease" className="text-base font-semibold text-gold-300 hover:text-gold-200">
            Lease
          </Link>
          <Link to="/admin/zones" className="text-base font-semibold text-gold-300 hover:text-gold-200">
            Zones
          </Link>
          <button
            onClick={() => setShowAccountSettings(true)}
            className="text-base text-slate-300 hover:text-white"
          >
            Login Settings
          </button>
          <button onClick={logout} className="text-base text-slate-300 hover:text-white">
            Log Out
          </button>
        </div>
      </header>

      {showAccountSettings && (
        <DispatcherAccountSettings onClose={() => setShowAccountSettings(false)} />
      )}

      <div className="px-6 pt-6 max-w-6xl mx-auto empty:hidden">
        <DriverApplicationsPanel />
      </div>

      {pendingIdVerifications.length > 0 && (
        <div className="px-6 pt-6 max-w-6xl mx-auto">
          <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-5">
            <h2 className="font-bold text-lg text-amber-800 mb-3">
              Pending ID Verifications ({pendingIdVerifications.length})
            </h2>
            <div className="space-y-3">
              {pendingIdVerifications.map((u) => (
                <div
                  key={u.id}
                  className="bg-white rounded-xl p-4 flex items-center justify-between gap-3"
                >
                  <div>
                    <p className="font-bold text-slate-800">
                      {u.firstName} {u.lastName}
                    </p>
                    <p className="text-sm text-slate-500">DOB on file: {u.dob}</p>
                    <a
                      href={u.idImageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 font-semibold underline"
                    >
                      View uploaded ID photo
                    </a>
                  </div>
                  <button
                    onClick={() => approveIdVerification(u.id)}
                    className="bg-emerald-600 text-white font-bold text-sm px-4 py-2.5 rounded-xl whitespace-nowrap"
                  >
                    Verified
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="px-6 pt-6 max-w-6xl mx-auto space-y-4">
        <LeaseAlert />
        <QuickEntry zones={liveBoard.zones} board={liveBoard.drivers} />
        <DispatchModePanel />
      </div>

      <section className="px-6 pt-6 max-w-6xl mx-auto">
        <div className="flex items-baseline gap-4 mb-3 flex-wrap">
          <h2 className="font-bold text-xl text-slate-700">Board</h2>
          <p className="text-sm text-slate-500">
            {(boardCounts.ready || 0) + (boardCounts.offered || 0)} waiting &middot; {boardCounts.on_call || 0} on call
            &middot; {boardCounts.moving || 0} moving
          </p>
          <p className="text-xs text-slate-400">Tap a car to move it.</p>
          {liveBoard.zones.length > 0 && (
            <button onClick={() => setCarAction("new")} className="ml-auto text-sm font-semibold text-blue-700">
              + Radio car
            </button>
          )}
        </div>
        {liveBoard.zones.length === 0 ? (
          <p className="text-slate-500">
            No zones yet. Set them up in <Link to="/admin/zones" className="text-blue-600 underline">Zones</Link>.
          </p>
        ) : (
          <ZoneBoard drivers={liveBoard.drivers} zones={liveBoard.zones} variant="dispatcher" onCarClick={setCarAction} />
        )}
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 max-w-6xl mx-auto">
        <section>
          <h2 className="font-bold text-xl text-slate-700 mb-3">
            New Requests ({pending.length})
          </h2>
          <div className="space-y-3">
            {[...pending]
              .sort((a, b) => {
                function priorityTier(ride) {
                  if (customerStatusMap[ride.customerId]?.tier === "PREMIUM") return 0;
                  if (ride.wantsPriorityPass) return 1;
                  return 2;
                }
                const diff = priorityTier(a) - priorityTier(b);
                if (diff !== 0) return diff;
                return (a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0);
              })
              .map((ride) => (
              <RideCard
                key={ride.id}
                ride={ride}
                customerStatus={customerStatusMap[ride.customerId]}
                carFor={carFor}
                zones={liveBoard.zones}
                onSetZone={handleSetZone}
                onChangeCar={setAssignRide}
                onDispatchAdvance={handleDispatchAdvance}
                onDismiss={requestDismiss}
              />
            ))}
            {pending.length === 0 && (
              <p className="text-base text-slate-400">No new requests.</p>
            )}
          </div>
        </section>

        <section>
          <h2 className="font-bold text-xl text-slate-700 mb-3">
            Active Rides ({active.length})
          </h2>
          <div className="space-y-3">
            {active.map((ride) => (
              <RideCard
                key={ride.id}
                ride={ride}
                customerStatus={customerStatusMap[ride.customerId]}
                carFor={carFor}
                zones={liveBoard.zones}
                onSetZone={handleSetZone}
                onChangeCar={setAssignRide}
                onDispatchAdvance={handleDispatchAdvance}
                onCaptureFare={requestCaptureFare}
                onChargeWallet={setWalletChargeRide}
                onArchive={handleArchive}
              />
            ))}
            {active.length === 0 && (
              <p className="text-base text-slate-400">No active rides.</p>
            )}
          </div>
        </section>
      </div>

      {assignRide && (
        <AssignCarModal ride={assignRide} board={liveBoard.drivers} zones={liveBoard.zones} onClose={() => setAssignRide(null)} />
      )}
      {carAction && (
        <CarActionsModal car={carAction === "new" ? null : carAction} zones={liveBoard.zones} onClose={() => setCarAction(null)} />
      )}

      {dismissTarget && (
        <ConfirmModal
          title="Dismiss this request?"
          message="Are you sure you wish to dismiss this? It will be deleted forever."
          confirmLabel="Dismiss Forever"
          danger
          onConfirm={confirmDismiss}
          onCancel={() => setDismissTarget(null)}
        />
      )}

      {fareModalRide && (
        <FareModal
          title="Enter Final Fare to Capture"
          onConfirm={confirmCaptureFare}
          onCancel={() => setFareModalRide(null)}
        />
      )}

      {walletChargeRide && (
        <WalletChargeModal
          ride={walletChargeRide}
          onClose={() => setWalletChargeRide(null)}
          onCharged={() => setWalletChargeRide(null)}
        />
      )}
    </div>
  );
}
