import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../config/firebase";

const byOrder = (a, b) => (a.order ?? 99) - (b.order ?? 99) || String(a.label).localeCompare(String(b.label));

/** Live board (every driver's status/zone/line) and the zone list, in board order. */
export function useLiveBoard() {
  const [drivers, setDrivers] = useState([]);
  const [zones, setZones] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const offBoard = onSnapshot(collection(db, "board"), (s) => {
      setDrivers(s.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoaded(true);
    });
    const offZones = onSnapshot(collection(db, "zones"), (s) =>
      setZones(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort(byOrder))
    );
    return () => {
      offBoard();
      offZones();
    };
  }, []);

  return { drivers, zones, loaded };
}
