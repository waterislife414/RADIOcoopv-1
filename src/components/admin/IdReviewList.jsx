import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { doc, updateDoc } from "firebase/firestore";
import { db, functions } from "../../config/firebase";

export default function IdReviewList({ users }) {
  const [busyId, setBusyId] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  async function handleApprove(userId) {
    setBusyId(userId);
    setErrorMsg("");
    try {
      await httpsCallable(functions, "dispatcherApproveRiderId")({ userId });
    } catch (e) {
      setErrorMsg(e?.message || "Couldn't approve.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDeny(userId) {
    setBusyId(userId);
    setErrorMsg("");
    try {
      await updateDoc(doc(db, "users", userId), { idImageUrl: null, faceImageUrl: null, idVerified: null });
    } catch (e) {
      setErrorMsg(e?.message || "Couldn't deny.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-3">
      {errorMsg && <p className="text-sm text-red-600 font-semibold">{errorMsg}</p>}
      {users.map((u) => {
        const isBusy = busyId === u.id;
        return (
          <div key={u.id} className="bg-white rounded-xl p-4 space-y-3">
            <p className="font-bold text-slate-800">
              {u.firstName} {u.lastName}
            </p>
            <p className="text-sm text-slate-500">DOB on file: {u.dob}</p>
            <div className="flex flex-wrap gap-3">
              {u.idImageUrl && (
                <a href={u.idImageUrl} target="_blank" rel="noopener noreferrer">
                  <img src={u.idImageUrl} alt="ID" data-testid="id-thumb" className="h-24 rounded-lg object-cover" />
                </a>
              )}
              {u.faceImageUrl && (
                <a href={u.faceImageUrl} target="_blank" rel="noopener noreferrer">
                  <img src={u.faceImageUrl} alt="Face" data-testid="face-thumb" className="h-24 rounded-lg object-cover" />
                </a>
              )}
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                disabled={isBusy}
                onClick={() => handleApprove(u.id)}
                data-testid="id-approve"
                className="flex-1 min-h-[48px] bg-emerald-600 text-white font-bold rounded-xl disabled:opacity-50"
              >
                Approve
              </button>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => handleDeny(u.id)}
                data-testid="id-deny"
                className="flex-1 min-h-[48px] bg-red-600 text-white font-bold rounded-xl disabled:opacity-50"
              >
                Deny
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
