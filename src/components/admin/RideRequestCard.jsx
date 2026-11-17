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
        if