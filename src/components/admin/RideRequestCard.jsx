import { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../config/firebase";

export default function RideRequestCard({ ride, customerStatus, carFor, zones, onSetZone, onChangeCar, onDispatchAdvance, onDismiss }) {
  const [rider, setRider] = useState(null);
  const [approving, setApproving] = useState(false);

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
    } catch (e) {
      alert(e?.message || "Couldn't approve ID.");
    } finally {
      setApproving(