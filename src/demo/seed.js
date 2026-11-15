// Example data for the demo. Every person, phone number and dollar amount
// here is made up. Zone shapes are rough boxes, not the real boundaries.
import branding from "../../branding.config.json";
import { Timestamp } from "./core";

const BOX = {
  downtown: [32.455, 32.478, -85.0, -84.975],
  "north-highland": [32.478, 32.495, -84.995, -84.975],
  "rose-hill": [32.478, 32.495, -84.975, -84.95],
  beallwood: [32.495, 32.5125, -84.985, -84.955],
  peachtree: [32.495, 32.5125, -84.955, -84.925],
  airport: [32.5125, 32.54, -84.965, -84.915],
  wynnton: [32.455, 32.478, -84.975, -84.94],
  "east-wynnton": [32.455, 32.478, -84.94, -84.905],
  east: [32.478, 32.495, -84.95, -84.88],
  midland: [32.495, 32.58, -84.915, -84.8],
  baker: [32.42, 32.445, -84.99, -84.93],
  "the-park": [32.445, 32.455, -84.99, -84.94],
  "fort-benning": [32.33, 32.42, -85.0, -84.88],
  "phenix-city": [32.4, 32.56, -85.08, -85.002],
};
const points = ([s, n, w, e]) => [
  { lat: s, lng: w },
  { lat: s, lng: e },
  { lat: n, lng: e },
  { lat: n, lng: w },
];
export const center = (id) => {
  const [s, n, w, e] = BOX[id];
  return { lat: (s + n) / 2, lng: (w + e) / 2 };
};

const DAY = 86400000;
const dateKey = (ms) => new Intl.DateTimeFormat("en-CA", { timeZone: branding.dispatch.timeZone }).format(new Date(ms));

export const DEMO_PASSWORD = "demo1234";
export const DEMO_USERS = {
  "demo-admin": { email: "dispatch@example.com", password: DEMO_PASSWORD, claims: { admin: true } },
  "demo-driver-44": { email: "driver44@example.com", password: DEMO_PASSWORD, claims: { driver: true } },
  "demo-driver-12": { email: "driver12@example.com", password: DEMO_PASSWORD, claims: { driver: true } },
  "demo-rider": { email: "rider@example.com", password: DEMO_PASSWORD, claims: {} },
  "demo-mechanic": { email: "shop@example.com", password: DEMO_PASSWORD, claims: { shop: true } },
  "demo-applicant": { email: "applicant@example.com", password: DEMO_PASSWORD, claims: {} },
};

export function buildSeed(now = Date.now()) {
  const d = {};
  const ts = (ms) => new Timestamp(ms);

  d["settings/dispatch"] = { mode: "auto", windows: [] };
  branding.dispatch.zones.forEach((z, i) => {
    d[`zones/${z.id}`] = { label: z.label, order: i, requiresCert: z.requiresCert || null, points: points(BOX[z.id]) };
  });

  const approved = { status: "approved", approvedAt: now - 200 * DAY, expiresAt: now + 300 * DAY, proofUrl: "" };
  const driver = (uid, car, name, extra = {}) => {
    d[`drivers/${uid}`] = {
      carNumber: car, name, email: `driver${car}@example.com`, phone: `70655501${String(car).padStart(2, "0")}`,
      status: "offline", active: true, certs: {}, warnings: 0, score: 100, recentStrikes: [],
      leaseCreditCents: 0, leaseOwedCents: 0, approvedAt: now - 120 * DAY, ...extra,
    };
    d[`board/${uid}`] = { carNumber: car, status: "offline", zoneId: null, lineKey: null };
    d[`vehicles/${car}`] = { carNumber: car, plate: `EX${car}MPL`, isVan: !!extra.van, active: true };
    delete d[`drivers/${uid}`].van;
  };
  // Car 44 had its 360 and weekly check two days ago (just the quick start-of-shift check is left);
  // car 12 has never been inspected, so it walks through the full first inspection.
  driver("demo-driver-44", "44", "Jordan Example", {
    leaseCreditCents: 1500,
    inspection: { carNumber: "44", initialAt: now - 30 * DAY, lastFullAt: now - 2 * DAY, shiftCheckAt: now - 2 * DAY, lastAt: now - 2 * DAY, lastType: "weekly" },
  });
  driver("demo-driver-12", "12", "Sam Example", { van: true, certs: { base: approved, wheelchair: approved }, leaseCreditCents: 3500 });

  // Example cars already working, so the board has life and calls get answered.
  const bots = [
    ["bot-7", "7", "Dee Example", "rose-hill", {}],
    ["bot-15", "15", "Ray Example", "downtown", {}],
    ["bot-20", "20", "Lou Example", "wynnton", {}],
    ["bot-27", "27", "Max Example", "baker", {}],
    ["bot-31", "31", "Kit Example", "peachtree", { certs: { base: approved } }],
    ["bot-9", "9", "Pat Example", "downtown", {}],
    ["bot-3", "3", "Val Example", "phenix-city", {}],
  ];
  bots.forEach(([uid, car, name, zoneId, extra], i) => {
    driver(uid, car, name, extra);
    const at = center(zoneId);
    d[`board/${uid}`] = { carNumber: car, status: "ready", zoneId, lineKey: now - (bots.length - i) * 60000 };
    d[`driverLocations/${uid}`] = { ...at, zoneId, at: now, live: true, outOfZoneSince: null };
    d[`demoBots/${uid}`] = { ...at, answerSec: 6 + (i % 3) * 2, pickupSec: 14, rideSec: 24 };
    d[`ledger/${uid}/days/${dateKey(now + DAY)}`] = { periodKey: dateKey(now + DAY), open: true, workedAt: now };
  });

  // A few settled lease days for Car 44 so the history isn't empty.
  let credit = 0;
  [[9400, 600], [3100, 0], [0, 0], [11800, 900]].forEach(([fare, tip], i, all) => {
    const key = dateKey(now - (all.length - i) * DAY);
    const avail = credit + fare + tip;
    const env = Math.max(0, 7500 - avail);
    d[`ledger/demo-driver-44/days/${key}`] = {
      periodKey: key, open: false, workedAt: now - (all.length - i) * DAY, settledAt: now - (all.length - i - 1) * DAY,
      cardFaresCents: fare, cardTipsCents: tip, cardRides: fare ? 4 : 0, creditInCents: credit,
      leaseDueCents: 7500, availableCents: avail, envelopeDueCents: env, creditOutCents: Math.max(0, avail - 7500), coveredByCard: avail >= 7500,
    };
    credit = Math.max(0, avail - 7500);
  });
  d["drivers/demo-driver-44"].leaseCreditCents = credit;

  // Example shop board.
  const wo = (id, car, item, description, urgency, status, by, ageDays) => {
    d[`work_orders/${id}`] = {
      carNumber: car, item, description, urgency, status, photo: null, shopNotes: status === "parts_ordered" ? "Pads ordered from the parts store." : "",
      reportedBy: { uid: by === "Jordan Example" ? "demo-driver-44" : "bot", name: by, inspectionId: null, type: "weekly" },
      createdAt: now - ageDays * DAY, updatedAt: now - ageDays * DAY, history: [{ status: "open", at: now - ageDays * DAY, by }],
    };
  };
  wo("demo-wo-1", "44", "Brakes (squeak, grind, soft pedal)", "Front brakes squeal when stopping, getting worse.", "soon", "parts_ordered", "Jordan Example", 2);
  wo("demo-wo-2", "7", "Rattle or clunk", "Rattle from back right over bumps.", "watch", "open", "Dee Example", 4);
  wo("demo-wo-3", "21", "Engine / check-engine light", "Check-engine light came on this morning.", "now", "open", "Example Driver", 0);
  d["vehicles/44"] = { ...(d["vehicles/44"] || {}), openRepairs: 1, mileage: 84210, lastInspectionAt: now - 2 * DAY, lastInspectionType: "weekly" };
  if (d["vehicles/7"]) d["vehicles/7"].openRepairs = 1;
  if (d["vehicles/21"]) d["vehicles/21"].openRepairs = 1;

  d["envelopes/demo-env-1"] = { driverId: "bot-7", carNumber: "7", driverName: "Dee Example", amountCents: 7500, periodKeys: [dateKey(now)], droppedAt: now - 50 * 60000, status: "dropped" };

  d["users/demo-rider"] = {
    uid: "demo-rider", firstName: "Riley", lastName: "Example", phone: "7065550142", email: "rider@example.com",
    address: "1200 Example St, Columbus, GA", dob: "1990-01-01", subscriptionTier: null, walletBalance: 0, active: true, idVerified: true,
    referralCode: "EXAMPLE1", referredBy: null, createdAt: ts(now - 40 * DAY),
  };
  d["phoneRiders/7065550100"] = {
    phone: "7065550100", firstName: "Annie", lastName: "Example", rideCount: 14, lastRideAt: now - 2 * DAY,
    places: [{ text: "1200 Wynnton Rd", count: 9, lastAt: now - 2 * DAY }, { text: "Peachtree Mall", count: 4, lastAt: now - 6 * DAY }, { text: "Columbus Airport", count: 1, lastAt: now - 20 * DAY }],
  };
  d["driver_applications/demo-applicant"] = {
    uid: "demo-applicant", fullName: "Casey Example", phone: "7065550177", email: "applicant@example.com",
    existingDriver: false, existingCarNumber: "", consentSigned: true, status: "pending",
    dlImageUrl: "", mvrDocumentUrl: "", resumeUrl: "", timestamp: ts(now - 3 * 3600000),
  };
  return d;
}
