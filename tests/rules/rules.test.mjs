// Firestore security rules against the emulator.
//   cd tests/rules && npm install
//   npx firebase-tools emulators:exec --only firestore --project demo-radio "cd tests/rules && npm test"
import { test, before, after, beforeEach } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from "firebase/firestore";

let env;
const rules = readFileSync(fileURLToPath(new URL("../../firestore.rules", import.meta.url)), "utf8");
const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080").split(":");

before(async () => {
  env = await initializeTestEnvironment({ projectId: "demo-radio", firestore: { rules, host, port: Number(port) } });
});
after(async () => env?.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
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
  ]) {
    await assertFails(setDoc(doc(rider(), "rides/x"), ride({ customerId: "rider1", ...bad })));
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
  await assertSucceeds(updateDoc(doc(rider(), "users/rider1"), { phone: "7065550100" }));
  await assertSucceeds(updateDoc(doc(rider(), "users/rider1"), { idImageUrl: "u", idVerified: false, idSubmittedAt: "t" }));
  await assertFails(updateDoc(doc(rider(), "users/rider1"), { idVerified: true }));
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
