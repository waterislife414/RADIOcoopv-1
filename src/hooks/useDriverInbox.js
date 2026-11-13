import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../config/firebase";

/** The driver's own offer, "Need a car" broadcasts, and current ride (server-written). */
export function useDriverInbox(uid) {
  const [inbox, setInbox] = useState({});
  useEffect(() => {
    if (!uid) return undefined;
    return onSnapshot(doc(db, "driverInbox", uid), (s) => setInbox(s.data() || {}));
  }, [uid]);
  return inbox;
}
