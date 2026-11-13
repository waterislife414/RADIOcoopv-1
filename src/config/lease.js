import { BRAND } from "./constants";

// Lease settings from branding.config.json (dispatch.lease), in core's cfg shape.
export const LEASE_CFG = {
  timeZone: BRAND.dispatch?.timeZone || "America/New_York",
  lease: { dailyCents: 7500, dueStart: "14:00", dueEnd: "16:00", exitPayoutPct: 50, includeTips: true, ...(BRAND.dispatch?.lease || {}) },
};

export const money = (cents) => `$${((cents || 0) / 100).toFixed(2)}`;

/** "14:00" → "2 PM" */
export function clock(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  const hr = h % 12 || 12;
  return `${hr}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "AM" : "PM"}`;
}

export const DUE_TEXT = `${clock(LEASE_CFG.lease.dueStart)}–${clock(LEASE_CFG.lease.dueEnd)}`;
