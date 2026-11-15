import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { useLocation } from "react-router-dom";
import { db } from "../../config/firebase";
import { useAuth } from "../../context/AuthContext";
import { useDriverInbox } from "../../hooks/useDriverInbox";
import OfferAlert from "./OfferAlert";

/**
 * Incoming calls ring on every screen a driver might be on (profile,
 * inspection, menus), not only the driver home. The driver home shows its own.
 */
export default function DriverCallLayer() {
  const { currentUser, isDriver } = useAuth();
  const { pathname } = useLocation();
  const uid = isDriver ? currentUser?.uid : null;
  const inbox = useDriverInbox(uid);
  const [board, setBoard] = useState(null);
  const [warnings, setWarnings] = useState(0);
  useEffect(() => {
    if (!uid) return undefined;
    const a = onSnapshot(doc(db, "board", uid), (s) => setBoard(s.exists() ? s.data() : null));
    const b = onSnapshot(doc(db, "drivers", uid), (s) => setWarnings(s.data()?.warnings ?? 0));
    return () => {
      a();
      b();
    };
  }, [uid]);
  if (!uid || pathname === "/driver") return null;
  const offer = inbox.offer && board?.status === "offered" && board.offerRideId === inbox.offer.rideId ? inbox.offer : null;
  return offer ? <OfferAlert offer={offer} warnings={warnings} /> : null;
}
