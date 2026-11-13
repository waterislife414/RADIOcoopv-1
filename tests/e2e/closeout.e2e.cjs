// Close Out on the Firestore emulator.
const assert = require("node:assert/strict");
const ROOT = require("node:path").resolve(__dirname, "../../functions");
const f = require(ROOT + "/index.js");
const admin = require(ROOT + "/node_modules/firebase-admin");
const db = admin.firestore();
const ADMIN = { uid: "boss", token: { admin: true } };
const as = (fn, data, auth = ADMIN) => f[fn].run({ data, auth });
const get = async (p) => (await db.doc(p).get()).data();
async function rejects(p, re) { await assert.rejects(p, (e) => (assert.match(e.message, re), true)); }

(async () => {
  for (const c of ["board", "drivers", "ledger", "payouts", "driverLocations"]) {
    const s = await db.collection(c).get();
    await Promise.all(s.docs.map((d) => db.recursiveDelete(d.ref)));
  }
  const core = await import(ROOT + "/lib/dispatchCore.mjs");
  const key = core.leasePeriodKey(Date.now(), { timeZone: "America/New_York", lease: { dueStart: "14:00" } });
  const mk = async (uid, car, extra = {}, board = { status: "offline" }) => {
    await db.doc(`drivers/${uid}`).set({ carNumber: car, name: `Driver ${car}`, active: true, status: "offline", leaseCreditCents: 0, leaseOwedCents: 0, ...extra });
    await db.doc(`board/${uid}`).set({ carNumber: car, zoneId: null, lineKey: null, ...board });
  };
  await mk("d1", "44", { leaseCreditCents: 30000 });
  await mk("d2", "12", { leaseCreditCents: 5000 });
  await mk("d3", "7", { leaseCreditCents: 30000, leaseOwedCents: 4000, leaseOwedPeriodKey: "2026-11-12" });
  await mk("d4", "21", { leaseCreditCents: 10000 });
  await db.doc("ledger/d4/days/2026-11-10").set({ periodKey: "2026-11-10", open: true });
  await db.doc(`ledger/d4/days/${key}`).set({ periodKey: key, open: true, cardFaresCents: 1500, cardTipsCents: 500 });
  await mk("d5", "30", { leaseCreditCents: 9000 }, { status: "on_call", rideId: "x" });

  const authOn = !!process.env.FIREBASE_AUTH_EMULATOR_HOST;
  if (authOn) {
    await admin.auth().deleteUser("d1").catch(() => {});
    await admin.auth().createUser({ uid: "d1", email: "d1@test.local" });
    await admin.auth().setCustomUserClaims("d1", { driver: true });
  }
  await rejects(as("closeOutDriver", { uid: "d1", reason: "quit" }, { uid: "d1", token: { driver: true } }), /Dispatcher/);
  await rejects(as("closeOutDriver", { uid: "d1", reason: "vacation" }), /quit or let go/);

  // $300 credit → $75 final day → $225 → check for $112.50
  let p = await as("closeOutPreview", { uid: "d1" });
  assert.deepEqual([p.afterFinalDayCents, p.payoutCents, p.owedAfterCents], [22500, 11250, 0]);
  let r = await as("closeOutDriver", { uid: "d1", reason: "quit" });
  assert.equal(r.payoutCents, 11250);
  const d1 = await get("drivers/d1");
  assert.deepEqual([d1.active, d1.status, d1.leaseCreditCents, d1.closedReason], [false, "closed", 0, "quit"]);
  assert.equal(await get("board/d1"), undefined);
  if (authOn) assert.equal((await admin.auth().getUser("d1")).customClaims.driver, false);
  let pay = await get(`payouts/${r.payoutId}`);
  assert.deepEqual([pay.status, pay.amountCents ?? pay.payoutCents, pay.carNumber], ["awaiting_check", 11250, "44"]);
  await rejects(as("closeOutDriver", { uid: "d1", reason: "quit" }), /Already closed/);

  // Check recorded once
  await rejects(as("recordPayoutCheck", { payoutId: r.payoutId, checkNumber: "", checkDate: "2026-11-14" }), /check number/);
  await as("recordPayoutCheck", { payoutId: r.payoutId, checkNumber: "1043", checkDate: "2026-11-14" });
  pay = await get(`payouts/${r.payoutId}`);
  assert.deepEqual([pay.status, pay.checkNumber, pay.checkDate], ["paid", "1043", "2026-11-14"]);
  await rejects(as("recordPayoutCheck", { payoutId: r.payoutId, checkNumber: "1044", checkDate: "2026-11-14" }), /Nothing to pay/);

  // $50 credit < $75 → no check, owes $25
  r = await as("closeOutDriver", { uid: "d2", reason: "fired" });
  assert.deepEqual([r.payoutCents, r.owedAfterCents], [0, 2500]);
  assert.equal((await get(`payouts/${r.payoutId}`)).status, "no_payout");
  assert.equal((await get("drivers/d2")).leaseOwedCents, 2500);
  await rejects(as("recordPayoutCheck", { payoutId: r.payoutId, checkNumber: "1", checkDate: "2026-11-14" }), /Nothing to pay/);

  // Unpaid $40 envelope comes out before the split: 300 - 40 - 75 = 185 → $92.50
  r = await as("closeOutDriver", { uid: "d3", reason: "quit" });
  assert.deepEqual([r.unpaidCents, r.afterFinalDayCents, r.payoutCents], [4000, 18500, 9250]);
  assert.equal((await get("drivers/d3")).leaseOwedCents, 0);

  // Older open day settled first ($100 credit - $75 = $25), then today's $20 card: 25 + 20 - 75 → owes $30
  p = await as("closeOutPreview", { uid: "d4" });
  assert.deepEqual([p.olderDaysSettled, p.creditCents, p.cardTodayCents, p.owedAfterCents, p.payoutCents], [1, 2500, 2000, 3000, 0]);
  r = await as("closeOutDriver", { uid: "d4", reason: "quit" });
  assert.deepEqual([r.creditCents, r.owedAfterCents], [2500, 3000]);
  assert.equal((await get("ledger/d4/days/2026-11-10")).settledAt > 0, true);
  const today = await get(`ledger/d4/days/${key}`);
  assert.deepEqual([today.open, today.closeOut], [false, true]);

  // On a call → wait
  await rejects(as("closeOutDriver", { uid: "d5", reason: "quit" }), /has a call/);

  console.log(`CLOSEOUT E2E: all assertions passed${authOn ? " (incl. driver access removed)" : ""}`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
