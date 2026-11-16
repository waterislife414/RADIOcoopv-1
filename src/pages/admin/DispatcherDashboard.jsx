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
import AlertsBanner from "../../components/admin/AlertsBanner";
import ZoneBoard from "../../components/board/ZoneBoard";
import DispatchModePanel from "../../components/admin/DispatchModePanel";
import AssignCarModal from "../../components/admin/AssignCarModal";
import CarActionsModal from "../../components/admin/CarActionsModal";
import LeaseAlert from "../../components/admin/LeaseAlert";
import QuickEntry from "../../components/admin/QuickEntry";
import Pegboard from "../../components/admin/Pegboard";
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
  const [callDrawer, setCallDrawer] = useState(false);
  const [gps, setGps] = useState({}); // driver uid -> { zoneId, at } from his phone

  useEffect(
    () =>
      onSnapshot(collection(db, "driverLocations"), (snap) =>
        setGps(Object.fromEntries(snap.docs.map((d) => [d.id, { zoneId: d.data().zoneId || null, at: d.data().at || 0 }])))
      ),
    []
  );
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
        const extraTime = userSnap.exists() ? userSnap.data().extraTime === true : false;
        const perk = await getRideCountAndPerk(uid);
        setCustomerStatusMap((prev) => ({
          ...prev,
          [uid]: { tier, extraTime, hasFreeRideNow: perk.hasFreeRideNow },
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

  // Line order: Premium, then Day Pass, then by booking time.
  const priorityTier = (ride) => (customerStatusMap[ride.customerId]?.tier === "PREMIUM" || ride.priority === "premium" ? 0 : ride.priority === "vip" ? 1 : 2);
  const sorted = [...pending].sort(
    (a, b) => priorityTier(a) - priorityTier(b) || (a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0)
  );
  // The dispatcher's own list: anything the app isn't running by itself, or that nobody took.
  const needsDispatcher = (r) => r.appHandled !== true || r.dispatchState === "escalated";
  const officeRides = sorted.filter(needsDispatcher);
  const appRides = sorted.filter((r) => !needsDispatcher(r));

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-navy-950 text-white px-6 py-5 flex justify-between items-center flex-wrap gap-2">
        <div>
          <h1 className="font-display font-bold text-2xl">{COPY.dispatcherDashboardTitle}</h1>
          <p className="text-sm text-slate-300 mt-0.5">
            {OFFICE_ADDRESS} &middot; {COMPANY_PHONE_DISPLAY}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="text-right">
            <p className="text-xs text-slate-500 uppercase tracking-wide">
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
          <Link to="/shop" className="text-base font-semibold text-gold-300 hover:text-gold-200">
            Shop
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

      <div className="px-6 pt-4 max-w-6xl mx-auto empty:hidden">
        <AlertsBanner />
      </div>
      {pendingIdVerifications.length > 0 && (
        <div className="px-6 pt-3 max-w-6xl mx-auto">
          <a href="#id-checks" className="block rounded-xl bg-amber-100 border-2 border-amber-300 px-4 py-2 font-semibold text-amber-900">
            {pendingIdVerifications.length} rider{pendingIdVerifications.length === 1 ? "" : "s"} waiting for an ID check. Once checked, the app
            handles their card rides. &darr;
          </a>
        </div>
      )}

      <div className="px-6 pt-6 max-w-6xl mx-auto space-y-4">
        <LeaseAlert />
      </div>

      <Pegboard
        rides={[...pending, ...active.filter((r) => r.status !== "finished")]}
        drivers={liveBoard.drivers}
        zones={liveBoard.zones}
        onCarClick={setCarAction}
        onNewCall={() => setCallDrawer(true)}
        onAssignRide={setAssignRide}
      />
      {callDrawer && (
        <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setCallDrawer(false)}>
          <aside className="absolute right-0 top-0 h-full w-full max-w-xl bg-slate-100 overflow-y-auto p-4 shadow-2xl" onClick={(e) => e.stopPropagation()} data-testid="call-drawer">
            <button onClick={() => setCallDrawer(false)} className="mb-3 min-h-[44px] px-4 rounded-xl bg-white border border-slate-300 font-semibold">
              Close
            </button>
            <QuickEntry zones={liveBoard.zones} board={liveBoard.drivers} />
          </aside>
        </div>
      )}

      {/* The calls that need him come first: phone calls, cash, guests, no GPS, ID not checked, nobody took it. */}
      <section className="px-6 pt-6 max-w-6xl mx-auto" data-testid="send-by-radio">
          <div>
          <h2 className="font-bold text-xl text-slate-700">
            {"\u{1F4FB}"} Send by radio ({officeRides.length})
          </h2>
          <p className="text-sm text-slate-500 mb-3">Phone calls, cash, guests, no GPS, ID not checked yet, or nobody took it. These need you.</p>
          <div className="space-y-3">
            {officeRides.map((ride) => (
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
            {officeRides.length === 0 && <p className="text-base text-slate-500">Nothing to send right now.</p>}
          </div>
        </div>
      </section>


      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 max-w-6xl mx-auto">
        <section className="space-y-6">
          <div>
            <h2 className="font-bold text-xl text-slate-700">
              {"\u{1F4F1}"} App rides ({appRides.length})
            </h2>
            <p className="text-sm text-slate-500 mb-3">The app is sending these to drivers. Step in any time.</p>
            <div className="space-y-3">
              {appRides.map((ride) => (
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
              {appRides.length === 0 && <p className="text-base text-slate-500">No app rides waiting.</p>}
            </div>
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
              <p className="text-base text-slate-500">No active rides.</p>
            )}
          </div>
        </section>
      </div>

      {assignRide && (
        <AssignCarModal ride={assignRide} board={liveBoard.drivers} zones={liveBoard.zones} onClose={() => setAssignRide(null)} />
      )}
      {carAction && (
        <CarActionsModal
          car={carAction === "new" ? null : carAction}
          zones={liveBoard.zones}
          gps={carAction === "new" ? null : gps[carAction.id] || null}
          onClose={() => setCarAction(null)}
        />
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
      {/* Less frequent: dispatch mode, new driver applications and ID checks. */}
      <div className="px-6 pb-2 max-w-6xl mx-auto">
        <DispatchModePanel />
      </div>
      <div className="px-6 pb-6 max-w-6xl mx-auto empty:hidden">
        <DriverApplicationsPanel />
      </div>

      {pendingIdVerifications.length > 0 && (
        <div className="px-6 pb-6 max-w-6xl mx-auto">
          <div id="id-checks" className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-5">
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

    </div>
  );
}
