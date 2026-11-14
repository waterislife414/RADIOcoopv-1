// Clean-period bonus and score upkeep. Every bonusPeriodDays (14), a driver
// who worked at least bonusMinDays and stayed under strikesToForfeit
// refusals gets bonusCents of lease credit ("$5 off the lick"). Scores drift
// back up as old strikes age out of the 30-day window.
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const { LEASE_CFG, INCENTIVES } = require("./workRules");

const FieldValue = admin.firestore.FieldValue;
const db = () => admin.firestore();
let corePromise = null;
const core = () => (corePromise ||= import("./lib/dispatchCore.mjs"));
const TZ = LEASE_CFG.timeZone;

/** Award (or record the miss of) the bonus for the period that just ended. */
async function awardFor(c, uid, prev, nowMs) {
  const days = await db()
    .collection("ledger")
    .doc(uid)
    .collection("days")
    .where("periodKey", ">=", prev.startKey)
    .where("periodKey", "<", prev.endKey)
    .get();
  const workedDays = days.docs.filter((d) => d.data().workedAt).length;
  const entryId = `bonus_${prev.startKey}`;
  return db().runTransaction(async (tx) => {
    const ref = db().collection("drivers").doc(uid);
    const entry = db().collection("ledger").doc(uid).collection("entries").doc(entryId);
    const [ds, es] = await Promise.all([tx.get(ref), tx.get(entry)]);
    if (!ds.exists || es.exists) return null;
    const driver = ds.data();
    const strikes = c.strikesBetween(driver.recentStrikes || [], prev.startKey, prev.endKey, TZ);
    const out = c.bonusOutcome({ strikes, workedDays }, INCENTIVES);
    tx.set(entry, { type: "bonus", periodStartKey: prev.startKey, award: out.award, reason: out.reason || null, cents: out.cents || 0, strikes, workedDays, at: nowMs });
    tx.update(ref, {
      lastBonus: { periodStartKey: prev.startKey, award: out.award, reason: out.reason || null, cents: out.cents || 0, strikes, workedDays },
      ...(out.award ? { leaseCreditCents: FieldValue.increment(out.cents) } : {}),
    });
    return out;
  });
}

async function runIncentives(nowMs = Date.now()) {
  const c = await core();
  const current = c.incentivePeriod(nowMs, INCENTIVES, TZ);
  const prev = c.incentivePeriod(nowMs - INCENTIVES.bonusPeriodDays * 86400000, INCENTIVES, TZ);
  // Award in the first 3 days of a new period (catches a missed run; awards are idempotent).
  const newPeriod = c.incentivePeriod(nowMs - 3 * 86400000, INCENTIVES, TZ).index < current.index;
  const snap = await db().collection("drivers").where("active", "==", true).get();
  let awarded = 0;
  for (const d of snap.docs) {
    // Score decay: strikes older than the window fall off.
    const fresh = c.standing(d.data(), nowMs, INCENTIVES);
    const was = d.data();
    if (fresh.score !== was.score || fresh.warnings !== (was.warnings || 0) || fresh.recentStrikes.length !== (was.recentStrikes || []).length || fresh.penalties.length !== (was.penalties || []).length) {
      await d.ref.update(fresh);
    }
    if (newPeriod) {
      const out = await awardFor(c, d.id, prev, nowMs);
      if (out?.award) awarded++;
    }
  }
  return { awarded, period: current };
}

exports.dailyIncentives = onSchedule({ schedule: "every day 05:30", timeZone: TZ }, async () => {
  const r = await runIncentives();
  if (r.awarded) console.log(`Clean-period bonus: ${r.awarded} driver(s).`);
  return null;
});

module.exports._internal = { runIncentives, awardFor };
