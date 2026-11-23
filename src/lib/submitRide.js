// Saves a booking. Shared by the payment screen and one-tap booking on the
// booking screen, so both send exactly the same ride.
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../config/firebase";
import { normalizePhone } from "../utils/phone";

const LAST_PAY = "rc-last-pay";
const GUEST = "rc-guest-rider";

/** How this phone paid last time ("card" | "cash" | "transfer"), to offer it first. */
export function lastPayMethod() {
  try {
    return localStorage.getItem(LAST_PAY) || null;
  } catch {
    return null;
  }
}

/** A guest's name and number, kept on this phone only so they don't retype them. */
export function rememberedGuest() {
  try {
    const g = JSON.parse(localStorage.getItem(GUEST) || "null");
    return g && typeof g === "object" ? g : null;
  } catch {
    return null;
  }
}

export async function submitRide(ride, { uid = null, paymentMethod, paymentIntentId = null, cardholderName = null }) {
  const num = (v) => (typeof v === "number" ? v : null);
  const docRef = await addDoc(collection(db, "rides"), {
    customerId: uid || "guest",
    firstName: ride.guestFirstName || null,
    lastName: ride.guestLastName || null,
    phone: normalizePhone(ride.phone),
    cardholderName: cardholderName || null,
    pickup: ride.pickup,
    pickupLat: num(ride.pickupLat),
    pickupLng: num(ride.pickupLng),
    dropoff: ride.dropoff,
    // The exact point the rider picked or pinned (the server only looks the text up when this is missing).
    dropoffLat: num(ride.dropoffLat),
    dropoffLng: num(ride.dropoffLng),
    outOfArea: !!ride.outOfArea,
    outOfAreaCity: ride.outOfArea ? ride.outOfAreaCity || null : null,
    passengers: ride.passengers,
    stops: ride.stops,
    needsAccessibleVehicle: ride.needsAccessibleVehicle,
    wantsPriorityPass: ride.wantsPriorityPass,
    fastPassId: ride.wantsPriorityPass ? ride.fastPassId || null : null,
    roundTrip: ride.roundTrip,
    estMiles: ride.estMiles,
    scheduleType: ride.scheduleType,
    scheduledFor: ride.scheduledFor,
    recurring: ride.recurring,
    paymentMethod,
    paymentIntentId,
    promoCode: ride.promoCode || null,
    consent: ride.consent || null,
    shareLocation: ride.shareLocation !== false,
    callIn: !!ride.callIn,
    bookedFrom: ride.bookedFrom || null,
    status: "pending",
    finalFare: null,
    timestamp: serverTimestamp(),
  });
  try {
    localStorage.setItem(LAST_PAY, paymentMethod);
    if (!uid) localStorage.setItem(GUEST, JSON.stringify({ first: ride.guestFirstName || "", last: ride.guestLastName || "", phone: normalizePhone(ride.phone) }));
  } catch {
    // Private mode: nothing remembered, nothing breaks.
  }
  return docRef.id;
}
