// One colour scheme for every board: green Ready, orange On a call,
// blue Moving, red Out. Always shown with the word as well as the colour.
import { BRAND } from "../config/constants";

const C = { ready: "#16a34a", onCall: "#f97316", moving: "#2563eb", out: "#dc2626", ...(BRAND.dispatch?.statusColors || {}) };

export const STATUS_COLORS = C;

/** Board status -> { key, color, label } (offered counts as On a call: he is being pinged for one). */
export function statusInfo(status) {
  if (status === "ready") return { key: "ready", color: C.ready, label: "Ready" };
  if (status === "offered" || status === "on_call") return { key: "onCall", color: C.onCall, label: "On a call" };
  if (status === "moving") return { key: "moving", color: C.moving, label: "Moving" };
  return { key: "out", color: C.out, label: "Out" };
}

// Pale zone fills that never clash with the four status colours.
const ZONE_PALETTE = ["#a5b4fc", "#fcd34d", "#f9a8d4", "#99f6e4", "#d8b4fe", "#bef264", "#fda4af", "#7dd3fc"];
export const zoneColor = (z, i = 0) => z?.color || ZONE_PALETTE[i % ZONE_PALETTE.length];
