// Who may work right now. Shared by the board and dispatch functions so a
// driver is blocked the same way everywhere (lease lockout joins here).
const { HttpsError } = require("firebase-functions/v2/https");

function requireDriver(request) {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  if (request.auth.token.driver !== true) {
    throw new HttpsError("permission-denied", "This needs an approved driver account.");
  }
  return request.auth.uid;
}

/** Why this driver can't work right now, or null. */
function blockReason(driver) {
  if (!driver || driver.active === false) return "Your driver account isn't active. See the office.";
  if (driver.status === "suspended") return "You're suspended. Come back to the shop to get reinstated.";
  return null;
}

module.exports = { requireDriver, blockReason };
