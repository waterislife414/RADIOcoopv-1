// Who may work right now. Shared by the board and dispatch functions so a
// driver is blocked the same way everywhere (lease lockout joins here).
const { HttpsError } = require("firebase-functions/v2/https");
const BRANDING = require("./branding.json");

const D = BRANDING.dispatch || {};
const LEASE_CFG = {
  timeZone: D.timeZone || "America/New_York",
  lease: { dailyCents: 7500, dueStart: "14:00", dueEnd: "16:00", exitPayoutPct: 50, includeTips: true, ...(D.lease || {}) },
};

function requireDriver(request) {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  if (request.auth.token.driver !== true) {
    throw new HttpsError("permission-denied", "This needs an approved driver account.");
  }
  return request.auth.uid;
}

/**
 * Why this driver can't work right now, or null.
 * Pass { c: dispatchCore, nowMs } to include the unpaid-lease lockout.
 */
function blockReason(driver, ctx = null) {
  if (!driver || driver.active === false) return "Your driver account isn't active. See the office.";
  if (driver.status === "suspended") return "You're suspended. Come back to the shop to get reinstated.";
  if (
    ctx?.c?.leaseLocked(
      { owedCents: driver.leaseOwedCents, owedPeriodKey: driver.leaseOwedPeriodKey, now: ctx.nowMs ?? Date.now() },
      LEASE_CFG
    )
  ) {
    return `Lease not paid ($${(driver.leaseOwedCents / 100).toFixed(2)}). Drop your envelope and log it in the app, or see the office.`;
  }
  return null;
}

// Score + clean-period bonus settings (see dispatchCore INCENTIVE_DEFAULTS).
const INCENTIVES = {
  bonusCents: 500,
  bonusPeriodDays: 14,
  bonusAnchor: "2026-11-02",
  strikesToForfeit: 2,
  bonusMinDays: 5,
  scoreStrikePoints: 10,
  scoreWindowDays: 30,
  ...(D.incentives || {}),
};

module.exports = { requireDriver, blockReason, LEASE_CFG, INCENTIVES };
