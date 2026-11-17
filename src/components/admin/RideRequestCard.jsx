import { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../config/firebase";

export default function RideRequestCard({
  ride,
  customerStatus,
  carFor,
  zones,
  onSetZone,
  onChangeCar,
  onDispatchAdvance,
  onDismiss,
  onCaptureFare,
  onChargeWallet,
  onArchive,
}) {
  const [rider, setRider] = useState(null);
  const [approving, setApproving] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");

  useEffect(() => {
    if (!ride.customerId || ride.customerId === "guest") return;
    getDoc(doc(db, "users", ride.customerId))
      .then((snap) => {
        if (snap.exists()) setRider(snap.data());
      })
      .catch(() => {});
  }, [ride.customerId]);

  async function handleApprove() {
    if (!ride.customerId) return;
    setApproving(true);
    try {
      await httpsCallable(functions, "dispatcherApproveRiderId")({ userId: ride.customerId });
      setRider((prev) => (prev ? { ...prev, idVerified: true } : prev));
      setSuccessMsg("Sent back through the system");
    } catch (e) {
      alert(e?.message || "Couldn't approve ID.");
    } finally {
      setApproving(false);
    }
  }

  const isGuest = !ride.customerId || ride.customerId === "guest";
  const hasPhotos = rider?.idImageUrl || rider?.faceImageUrl;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-3">
      <div className="flex justify-between items-start">
        <div>
          <p className="font-semibold text-slate-800">{ride.pickup}</p>
          <p className="text-sm text-slate-500">&rarr; {ride.dropoff}</p>
        </div>
        <span className="text-xs font-bold uppercase px-3 py-1 rounded-full bg-blue-100 text-blue-800">
          {ride.status}
        </span>
      </div>

      {!isGuest && (
        <div data-testid="ride-id-strip" className="bg-slate-50 rounded-xl p-3 border border-slate-200 space-y-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              {hasPhotos ? (
                <div className="flex items-center gap-2">
                  {rider.idImageUrl && (
                    <a href={rider.idImageUrl} target="_blank" rel="noopener noreferrer">
                      <img src={rider.idImageUrl} alt="ID" className="h-16 w-16 object-cover rounded-lg border border-slate-300" />
                    </a>
                  )}
                  {rider.faceImageUrl && (
                    <a href={rider.faceImageUrl} target="_blank" rel="noopener noreferrer">
                      <img src={rider.faceImageUrl} alt="Face" className="h-16 w-16 object-cover rounded-lg border border-slate-300" />
                    </a>
                  )}
                </div>
              ) : (
                <p className="text-xs text-slate-500 italic">No ID yet</p>
              )}
            </div>

            <div>
              {rider?.idVerified ? (
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                  ID verified
                </span>
              ) : rider?.idImageUrl ? (
                <button
                  type="button"
                  data-testid="ride-id-approve"
                  disabled={approving}
                  onClick={handleApprove}
                  className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs px-4 py-2 rounded-xl transition-colors disabled:opacity-50"
                >
                  {approving ? "Approving..." : "Approve ID"}
                </button>
              ) : null}
            </div>
          </div>

          {successMsg && <p className="text-xs font-semibold text-emerald-600">{successMsg}</p>}
        </div>
      )}

      {Array.isArray(ride.officeWhy) && ride.officeWhy.includes("id") && (
        <p className="text-xs font-medium text-amber-700">Sent here: ID not verified</p>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100 text-xs">
        {onDispatchAdvance && (
          <button
            type="button"
            onClick={() => onDispatchAdvance(ride)}
            className="px-3 py-1.5 rounded-lg bg-blue-600 text-white font-semibold"
          >
            Advance
          </button>
        )}
        {onDismiss && (
          <button
            type="button"
            onClick={() => onDismiss(ride)}
            className="px-3 py-1.5 rounded-lg bg-slate-200 text-slate-700 font-semibold"
          >
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}
