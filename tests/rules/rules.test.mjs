// Firestore security rules against the emulator.
//   cd tests/rules && npm install
//   npx firebase-tools emulators:exec --only firestore --project demo-radio "cd tests/rules && npm test"
import { test, before, after, beforeEach } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { addDoc, collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";

let env;
const rules = readFileSync(fileURLToPath(new URL("../../firestore.rules", import.meta.url)), "utf8");
const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080").split(":");

before(async () => {
  env = await initializeTestEnvironment({ projectId: "demo-radio", firestore: { rules, host, port: Number(port) } });
});
after(async () => env?.cleanup());
// A suite run just before this one in the same emulator (rideflow) can leave a transaction lock
// that expires on its own; wait it out instead of failing every test.
async function clearWithRetry() {
  for (let i = 0; ; i++) {
    try { return await env.clearFirestore(); } catch (e) {
      if (i >= 40 || !/lock timeout|ABORTED/i.test(String(e?.message ?? e))) throw e;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}
beforeEach(async () => {
  await clearWithRetry();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const put = (p, d) => setDoc(doc(db, p), d);
    await put("users/rider1", { firstName: "R", walletBalance: 0, subscriptionTier: null });
    await put("rides/mine", { customerId: "rider1", status: "pending", phone: "7065550100", pickup: "A" });
    await put("rides/done", { customerId: "rider1", status: "finished", phone: "7065550100", pickup: "A" });
    await put("rides/other", { customerId: "rider2", status: "pending", phone: "7065550101", pickup: "B" });
    await put("board/d1", { carNumber: "44", status: "ready" });
    await put("drivers/d1", { carNumber: "44", active: true });
    await put("driverInbox/d1", { offer: null });
    await put("driverInbox/d2", { offer: null });
    await put("driverLocations/d2", { lat: 1, lng: 2 });
    await put("ledger/d1/days/2026-11-13", { open: true });
    await put("ledger/d2/days/2026-11-13", { open: true });
    await put("envelopes/e1", { driverId: "d1", amountCents: 4000 });
    await put("envelopes/e2", { driverId: "d2", amountCents: 4000 });
    await put("payouts/p2", { driverId: "d2" });
    await put("phoneRiders/7065550100", { firstName: "Annie" });
    await put("settings/dispatch", { mode: "manual" });
    await put("zones/east", { label: "East" });
  });
});

const guest = () => env.unauthenticatedContext().firestore();
const rider = () => env.authenticatedContext("rider1").firestore();
const driver = (uid = "d1") => env.authenticatedContext(uid, { driver: true }).firestore();
const office = () => env.authenticatedContext("boss", { admin: true }).firestore();
const ride = (extra = {}) => ({ customerId: "guest", status: "pending", phone: "7065550100", pickup: "A", dropoff: "B", finalFare: null, ...extra });

test("riders: book a ride, but never set dispatch or money fields", async () => {
  await assertSucceeds(setDoc(doc(guest(), "rides/g1"), ride({ pickupLat: 32.4, pickupLng: -84.9 })));
  await assertSucceeds(setDoc(doc(rider(), "rides/r1"), ride({ customerId: "rider1", paymentIntentId: "pi_1" })));
  for (const bad of [
    { driverId: "d1" },
    { dispatchState: "assigned" },
    { zoneId: "east" },
    { priority: "premium" },
    { requestedDriverId: "d1" },
    { status: "dispatched" },
    { finalFare: 5 },
    { customerId: "rider2" },
    // Perks, fees and pickup timing are the server's to set.
    { perks: { liveMap: true, callDriver: true } },
    { fee: { cents: 0 } },
    { headsUpAt: 1 },
    { arrivedAt: 1 },
    { termsRead: true },
    // Card meter, fee and tip records are the server's (a rider can't block a tip or fake price data).
    { tipAddedAt: 1 },
    { meterCents: 100 },
    { cardFunding: "debit" },
    { driverCardCostCents: 0 },
    { creditUsedCents: 500 },
    { routeChangedAt: 1 },
    { stopCount: 0 },
  ]) {
    await assertFails(setDoc(doc(rider(), "rides/x"), ride({ customerId: "rider1", ...bad })));
  }
  // Location choices are the rider's: share, or book as a call-in ride.
  await assertSucceeds(setDoc(doc(rider(), "rides/loc"), ride({ customerId: "rider1", shareLocation: true, bookedFrom: { lat: 32.4, lng: -84.9 } })));
  await assertSucceeds(setDoc(doc(rider(), "rides/callin"), ride({ customerId: "rider1", shareLocation: false, callIn: true })));
  await assertFails(updateDoc(doc(rider(), "rides/mine"), { perks: { liveMap: true } }));
  // After booking, a rider can't flip what decides fees, priority or who dispatches it.
  for (const bad of [{ callIn: true }, { wantsPriorityPass: false }, { consent: null }, { paymentMethod: "card" }, { shareLocation: false }]) {
    await assertFails(updateDoc(doc(rider(), "rides/mine"), bad));
  }
  await assertSucceeds(updateDoc(doc(rider(), "rides/mine"), { dropoff: "C" }));
  await assertFails(updateDoc(doc(rider(), "rides/mine"), { status: "dispatched" }));
  await assertFails(updateDoc(doc(rider(), "rides/mine"), { dispatchState: "assigned" }));
  await assertFails(updateDoc(doc(rider(), "rides/other"), { dropoff: "C" }));
  await assertSucceeds(updateDoc(doc(rider(), "rides/done"), { rating: 5 }));
  await assertFails(getDoc(doc(rider(), "rides/other")));
});

test("riders: no free wallet money or membership", async () => {
  const fresh = env.authenticatedContext("rider9").firestore();
  await assertFails(setDoc(doc(fresh, "users/rider9"), { firstName: "X", walletBalance: 100, subscriptionTier: null }));
  await assertFails(setDoc(doc(fresh, "users/rider9"), { firstName: "X", walletBalance: 0, subscriptionTier: "PREMIUM" }));
  await assertSucceeds(setDoc(doc(fresh, "users/rider9"), { firstName: "X", walletBalance: 0, subscriptionTier: null }));
  await assertFails(updateDoc(doc(rider(), "users/rider1"), { walletBalance: 50 }));
  await assertFails(updateDoc(doc(rider(), "users/rider1"), { subscriptionTier: "PREMIUM" }));
  // No free Day Pass, and no wiping out fees owed.
  await assertFails(updateDoc(doc(rider(), "users/rider1"), { dayPass: { id: "x", expiresAt: 9e15 } }));
  await assertFails(updateDoc(doc(rider(), "users/rider1"), { feesOwedCents: 0 }));
  // No free ride credit, and no faking rides toward a reward or a second welcome credit.
  await assertFails(updateDoc(doc(rider(), "users/rider1"), { rideCreditCents: 1000 }));
  await assertFails(updateDoc(doc(rider(), "users/rider1"), { rewardRides: 9 }));
  await assertFails(updateDoc(doc(rider(), "users/rider1"), { welcomeCreditAt: null }));
  const rider8 = env.authenticatedContext("rider8").firestore();
  await assertFails(setDoc(doc(rider8, "users/rider8"), { firstName: "X", walletBalance: 0, subscriptionTier: null, dayPass: { id: "x" } }));
  await assertFails(setDoc(doc(rider8, "users/rider8"), { firstName: "X", walletBalance: 0, subscriptionTier: null, idVerified: true }));
  await assertSucceeds(setDoc(doc(rider8, "users/rider8"), { firstName: "X", walletBalance: 0, subscriptionTier: null }));
  await assertFails(updateDoc(doc(rider8, "users/rider8"), { idVerified: true }));
  await assertSucceeds(updateDoc(doc(rider(), "users/rider1"), { phone: "7065550100" }));
  await assertSucceeds(updateDoc(doc(rider(), "users/rider1"), { idImageUrl: "u", idVerified: false, idSubmittedAt: "t" }));
  await assertFails(updateDoc(doc(rider(), "users/rider1"), { idVerified: true }));
  // A rider the office already verified can still edit his profile and deactivate.
  await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), "users/rider1"), { idVerified: true }));
  await assertSucceeds(updateDoc(doc(rider(), "users/rider1"), { phone: "7065550111" }));
  await assertSucceeds(updateDoc(doc(rider(), "users/rider1"), { active: false }));
  await assertSucceeds(updateDoc(doc(rider(), "users/rider1"), { idImageUrl: "new", idVerified: false }));
});

test("drivers: see the board, never write it; own inbox/location/ledger/envelopes only", async () => {
  await assertSucceeds(getDoc(doc(driver(), "board/d1")));
  await assertFails(updateDoc(doc(driver(), "board/d1"), { status: "ready", lineKey: 0 }));
  await assertSucceeds(getDoc(doc(driver(), "driverInbox/d1")));
  await assertFails(getDoc(doc(driver(), "driverInbox/d2")));
  await assertFails(setDoc(doc(driver(), "driverInbox/d1"), { offer: { rideId: "x" } }));
  await assertFails(getDoc(doc(driver(), "driverLocations/d2")));
  await assertFails(setDoc(doc(driver(), "driverLocations/d1"), { lat: 0, lng: 0 }));
  await assertSucceeds(getDoc(doc(driver(), "ledger/d1/days/2026-11-13")));
  await assertFails(getDoc(doc(driver(), "ledger/d2/days/2026-11-13")));
  await assertFails(setDoc(doc(driver(), "ledger/d1/days/2026-11-13"), { cardFaresCents: 99999 }));
  await assertSucceeds(getDocs(query(collection(driver(), "envelopes"), where("driverId", "==", "d1"))));
  await assertFails(getDoc(doc(driver(), "envelopes/e2")));
  await assertFails(setDoc(doc(driver(), "envelopes/e3"), { driverId: "d1", amountCents: 1 }));
  await assertFails(getDoc(doc(driver(), "payouts/p2")));
  await assertFails(updateDoc(doc(driver(), "drivers/d1"), { leaseCreditCents: 100000 }));
  await assertFails(getDoc(doc(driver(), "rides/mine")));
  await assertFails(getDoc(doc(driver(), "settings/dispatch")));
  await assertFails(getDoc(doc(driver(), "phoneRiders/7065550100")));
  await assertSucceeds(getDoc(doc(driver(), "zones/east")));
});

test("riders and the public can't see drivers, the board or zones", async () => {
  for (const p of ["board/d1", "drivers/d1", "zones/east", "driverInbox/d1", "settings/dispatch", "phoneRiders/7065550100"]) {
    await assertFails(getDoc(doc(rider(), p)));
    await assertFails(getDoc(doc(guest(), p)));
  }
});

test("office: settings and lookups; server-only collections stay server-only", async () => {
  await assertSucceeds(setDoc(doc(office(), "settings/dispatch"), { mode: "auto" }));
  await assertSucceeds(getDoc(doc(office(), "phoneRiders/7065550100")));
  await assertFails(setDoc(doc(office(), "phoneRiders/7065550100"), { firstName: "Z" }));
  await assertFails(setDoc(doc(office(), "board/d1"), { status: "ready" }));
  await assertFails(setDoc(doc(office(), "envelopes/e1"), { status: "received" }));
  await assertFails(setDoc(doc(office(), "driverTokens/d1"), { tokens: [] }));
  await assertSucceeds(getDoc(doc(office(), "payouts/p2")));
  await assertSucceeds(getDoc(doc(office(), "ledger/d2/days/2026-11-13")));
});

test("certification requests: a driver files his own, for real certs only", async () => {
  const req = (extra = {}) => ({ uid: "d1", cert: "base", status: "pending", ...extra });
  await assertSucceeds(setDoc(doc(driver(), "certRequests/d1_base"), req()));
  await assertFails(setDoc(doc(driver(), "certRequests/d2_base"), req({ uid: "d2" })));
  await assertFails(setDoc(doc(driver(), "certRequests/d1_pilot"), req({ cert: "pilot" })));
  await assertFails(setDoc(doc(driver(), "certRequests/d1_base"), req({ status: "approved" })));
});

test("the app's real booking and signup payloads are accepted", async () => {
  const booking = (customerId) => ({
    customerId, firstName: "Pat", lastName: null, phone: "7065550100", cardholderName: null,
    pickup: "100 Main St", pickupLat: null, pickupLng: null, dropoff: "Mall", outOfArea: false, outOfAreaCity: null,
    passengers: 1, stops: [], needsAccessibleVehicle: false, wantsPriorityPass: false, roundTrip: false,
    estMiles: null, scheduleType: "now", scheduledFor: null, recurring: null, paymentMethod: "cash",
    paymentIntentId: null, promoCode: null, status: "pending", finalFare: null, timestamp: serverTimestamp(),
  });
  await assertSucceeds(addDoc(collection(guest(), "rides"), booking("guest")));
  await assertSucceeds(addDoc(collection(rider(), "rides"), { ...booking("rider1"), paymentMethod: "card", paymentIntentId: "pi_123", pickupLat: 32.46, pickupLng: -84.98 }));
  const fresh = env.authenticatedContext("newbie").firestore();
  await assertSucceeds(setDoc(doc(fresh, "users/newbie"), {
    uid: "newbie", firstName: "N", lastName: "B", phone: "7065550123", email: "n@example.com", address: "1 A St", dob: "1990-01-01",
    subscriptionTier: null, walletBalance: 0, active: true, referralCode: "ABC123", referredBy: null, createdAt: serverTimestamp(),
  }));
});

test("driver record is read-only to the driver; riders may save consent and a photo", async () => {
  await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), "drivers/d1/record/x1"), { type: "accident", points: 30 }));
  await assertSucceeds(getDoc(doc(driver(), "drivers/d1/record/x1")));
  await assertFails(getDoc(doc(driver("d2"), "drivers/d1/record/x1")));
  await assertFails(setDoc(doc(driver(), "drivers/d1/record/x1"), { type: "accident", points: 0 }));
  await assertFails(updateDoc(doc(driver(), "drivers/d1"), { score: 100, penalties: [] }));
  await assertSucceeds(updateDoc(doc(rider(), "users/rider1"), { legal: { version: "v", docs: ["rider-terms", "privacy"], acceptedAt: 1 }, marketingOptIn: true }));
  await assertSucceeds(updateDoc(doc(rider(), "users/rider1"), { photoUrl: "u", photoCheck: "needs-review" }));
});

test("inspections and shop work orders: server-written; driver reads his own, shop and office read all", async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "vehicle_inspections/i1"), { driverId: "d1", carNumber: "44", type: "weekly" });
    await setDoc(doc(db, "vehicle_inspections/i2"), { driverId: "d2", carNumber: "12", type: "weekly" });
    await setDoc(doc(db, "work_orders/w1"), { carNumber: "44", status: "open", reportedBy: { uid: "d1" } });
    await setDoc(doc(db, "work_orders/w2"), { carNumber: "12", status: "open", reportedBy: { uid: "d2" } });
    await setDoc(doc(db, "cancelled_rides/c1"), { customerId: "rider1" });
  });
  const driver = env.authenticatedContext("d1", { driver: true }).firestore();
  const shop = env.authenticatedContext("m1", { shop: true }).firestore();
  const rider = env.authenticatedContext("rider1").firestore();
  await assertSucceeds(getDoc(doc(driver, "vehicle_inspections/i1")));
  await assertFails(getDoc(doc(driver, "vehicle_inspections/i2")));
  await assertFails(setDoc(doc(driver, "vehicle_inspections/i3"), { driverId: "d1", carNumber: "44", type: "weekly" }));
  await assertSucceeds(getDoc(doc(driver, "work_orders/w1")));
  await assertFails(getDoc(doc(driver, "work_orders/w2")));
  await assertFails(updateDoc(doc(driver, "work_orders/w1"), { status: "done" }));
  await assertSucceeds(getDoc(doc(shop, "work_orders/w2")));
  await assertSucceeds(getDoc(doc(shop, "vehicle_inspections/i2")));
  await assertFails(updateDoc(doc(shop, "work_orders/w2"), { status: "done" }));
  await assertSucceeds(getDoc(doc(shop, "vehicles/44")));
  await assertFails(getDoc(doc(rider, "work_orders/w1")));
  await assertFails(getDoc(doc(rider, "cancelled_rides/c1")));
});

test("call logs are server-only", async () => {
  await assertFails(getDoc(doc(rider(), "ride_calls/c1")));
  await assertFails(setDoc(doc(rider(), "ride_calls/c1"), { rideId: "mine" }));
});

test("alerts: office reads them; nobody writes them from the app", async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "alerts/a1"), { type: "emergency", driverId: "d1", status: "open" });
  });
  const driver = env.authenticatedContext("d1", { driver: true }).firestore();
  const office = env.authenticatedContext("boss", { admin: true }).firestore();
  await assertFails(getDoc(doc(driver, "alerts/a1")));
  await assertFails(setDoc(doc(driver, "alerts/a2"), { type: "emergency", driverId: "d1", status: "open" }));
  await assertSucceeds(getDoc(doc(office, "alerts/a1")));
  await assertFails(updateDoc(doc(office, "alerts/a1"), { status: "handled" }));
});

test("problem reports and approvals: office reads; a driver reads only his own answer; nobody writes", async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "support_tickets/t1"), { uid: "d1", status: "open" });
    await setDoc(doc(db, "approval_requests/a1"), { uid: "d1", status: "pending" });
    await setDoc(doc(db, "approval_requests/a2"), { uid: "d2", status: "pending" });
    await setDoc(doc(db, "owner_inbox/o1"), { kind: "repeat_approvals" });
    await setDoc(doc(db, "mail_queue/m1"), { to: ["x@example.com"] });
  });
  await assertSucceeds(getDoc(doc(office(), "support_tickets/t1")));
  await assertFails(getDoc(doc(driver(), "support_tickets/t1")));
  await assertFails(setDoc(doc(driver(), "support_tickets/t2"), { uid: "d1" }));
  await assertSucceeds(getDoc(doc(driver(), "approval_requests/a1")));
  await assertFails(getDoc(doc(driver(), "approval_requests/a2")));
  await assertFails(updateDoc(doc(driver(), "approval_requests/a1"), { status: "approved" }));
  await assertFails(updateDoc(doc(office(), "approval_requests/a1"), { status: "approved" }));
  await assertSucceeds(getDoc(doc(office(), "owner_inbox/o1")));
  await assertFails(getDoc(doc(rider(), "owner_inbox/o1")));
  await assertFails(getDoc(doc(office(), "mail_queue/m1")));
  await assertFails(getDoc(doc(guest(), "approval_requests/a1")));
});
