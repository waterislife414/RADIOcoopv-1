// Short timers for live dispatch (15-second pings, 45-second expiry,
// broadcast escalation) via Cloud Tasks. dispatchSweep is the once-a-minute
// safety net if a task is ever lost. Tests replace `impl`.
const { getFunctions } = require("firebase-admin/functions");

const REGION = process.env.FUNCTION_REGION || "us-central1";

const timers = {
  async impl(data, delaySec) {
    const queue = getFunctions().taskQueue(`locations/${REGION}/functions/dispatchTimer`);
    await queue.enqueue(data, { scheduleDelaySeconds: Math.max(0, Math.round(delaySec)), dispatchDeadlineSeconds: 60 });
  },
  /** Never throws: a lost timer is picked up by dispatchSweep. */
  async after(delaySec, data) {
    try {
      await timers.impl(data, delaySec);
    } catch (e) {
      console.warn("Timer not queued; the minute sweep will catch it.", e.message);
    }
  },
};

module.exports = timers;
