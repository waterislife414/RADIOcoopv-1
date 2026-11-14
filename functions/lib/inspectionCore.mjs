// Vehicle inspections: what the driver must check, how answers are validated,
// and which answers become shop work orders. Pure functions, shared by the app
// (to draw the checklist) and the server (to validate and file it).

export const WEEKLY_DAYS = 7;
export const SHIFT_CHECK_HOURS = 16;
export const MIN_INITIAL_PHOTOS = 10;

/** Photo slots for the walk-around. `weekly: true` slots are required weekly too. */
export const PHOTO_SLOTS = [
  { id: "front", label: "Front", hint: "Whole front bumper and hood", weekly: true },
  { id: "rear", label: "Back", hint: "Whole back bumper and trunk lid", weekly: true },
  { id: "driverSide", label: "Driver side", hint: "Stand back so both doors show", weekly: true },
  { id: "passengerSide", label: "Passenger side", hint: "Stand back so both doors show", weekly: true },
  { id: "frontLeft", label: "Front-left corner", hint: "Bumper corner, headlight, wheel" },
  { id: "frontRight", label: "Front-right corner", hint: "Bumper corner, headlight, wheel" },
  { id: "rearLeft", label: "Back-left corner", hint: "Bumper corner, taillight, wheel" },
  { id: "rearRight", label: "Back-right corner", hint: "Bumper corner, taillight, wheel" },
  { id: "dashboard", label: "Dashboard", hint: "Engine running: mileage and any warning lights", weekly: true },
  { id: "frontSeats", label: "Inside - front", hint: "Front seats, floor and console" },
  { id: "backSeats", label: "Inside - back", hint: "Back seats, belts and floor" },
  { id: "trunk", label: "Trunk", hint: "Open trunk, spare tire area", optional: true },
];

/** The five fluids, plus washer fluid. */
export const FLUIDS = [
  { id: "engineOil", label: "Engine oil" },
  { id: "transmission", label: "Transmission fluid" },
  { id: "brakeFluid", label: "Brake fluid" },
  { id: "coolant", label: "Coolant (antifreeze)" },
  { id: "powerSteering", label: "Power steering fluid" },
  { id: "washer", label: "Windshield washer fluid" },
];
export const FLUID_ANSWERS = { ok: "OK", topped: "Was low - I topped it off", shop: "Needs the shop" };

export const CHECKS = [
  { id: "tires", label: "Tires", hint: "Air pressure, tread, no bulges or nails" },
  { id: "brakes", label: "Brakes", hint: "No squeal, grinding, pulling or soft pedal" },
  { id: "headlights", label: "Headlights and taillights" },
  { id: "signals", label: "Turn signals and brake lights" },
  { id: "wipers", label: "Wipers" },
  { id: "horn", label: "Horn" },
  { id: "seatbelts", label: "Seat belts (every seat)" },
  { id: "mirrors", label: "Mirrors" },
  { id: "glass", label: "Windshield and windows", hint: "No cracks that block the view" },
  { id: "warningLights", label: "Dashboard warning lights", hint: "Check-engine, oil, brake, tire lights off" },
  { id: "climate", label: "Heat and A/C" },
  { id: "doorsLocks", label: "Doors, locks and windows work" },
  { id: "interior", label: "Inside is clean", hint: "No trash, stains, smells or tears" },
  { id: "safetyKit", label: "Spare tire, jack and first-aid kit" },
];

export const DAMAGE_AREAS = [
  "Front bumper", "Hood", "Windshield", "Roof", "Back bumper", "Trunk lid", "Back window",
  "Front-left fender", "Front-left door", "Back-left door", "Back-left quarter panel",
  "Front-right fender", "Front-right door", "Back-right door", "Back-right quarter panel",
  "Left mirror", "Right mirror", "Wheels / rims", "Headlight", "Taillight",
  "Front seats", "Back seats", "Headliner / ceiling", "Floor / carpet", "Dashboard / console", "Other",
];

export const REPAIR_ITEMS = [
  "Brakes (squeak, grind, soft pedal)",
  "Rattle or clunk",
  "Engine / check-engine light",
  "Pulls to one side / shakes",
  "Leak under the car",
  "Tires",
  "Heat or A/C",
  "Lights",
  "Wipers",
  "Doors, locks or windows",
  "Body damage",
  "Other",
];

export const URGENCY = {
  now: "Unsafe - fix before driving",
  soon: "Fix soon",
  watch: "Keep an eye on it",
};

export const TYPES = {
  initial: "First full inspection (360°)",
  weekly: "Weekly inspection",
  shift: "Start-of-shift check",
  damage: "Damage report",
  repair: "Problem report",
};

const str = (v, max = 500) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const isPath = (p) => typeof p === "string" && p.length > 3 && p.length < 400 && !p.includes("..");

/**
 * Validate a submission. Returns { error } or { value } (clean copy to save).
 * `photos` are storage paths keyed by slot id; damage/repair photos are paths too.
 */
export function validateInspection(type, input = {}) {
  if (!TYPES[type]) return { error: "Unknown inspection type." };
  const photos = {};
  for (const s of PHOTO_SLOTS) if (isPath(input.photos?.[s.id])) photos[s.id] = input.photos[s.id];

  const damages = (Array.isArray(input.damages) ? input.damages : []).slice(0, 30).map((d) => ({
    area: DAMAGE_AREAS.includes(d?.area) ? d.area : "Other",
    description: str(d?.description, 300),
    photo: isPath(d?.photo) ? d.photo : null,
    preExisting: d?.preExisting === true,
  }));
  const repairs = (Array.isArray(input.repairs) ? input.repairs : []).slice(0, 30).map((r) => ({
    item: REPAIR_ITEMS.includes(r?.item) ? r.item : "Other",
    description: str(r?.description, 500),
    urgency: URGENCY[r?.urgency] ? r.urgency : "soon",
    photo: isPath(r?.photo) ? r.photo : null,
  }));
  const fluids = {};
  for (const f of FLUIDS) if (FLUID_ANSWERS[input.fluids?.[f.id]]) fluids[f.id] = input.fluids[f.id];
  const checks = {};
  for (const c of CHECKS) if (input.checks?.[c.id] === "ok" || input.checks?.[c.id] === "problem") checks[c.id] = input.checks[c.id];
  const checkNotes = {};
  for (const c of CHECKS) if (checks[c.id] === "problem") checkNotes[c.id] = str(input.checkNotes?.[c.id], 300);
  const signedName = str(input.signedName, 80);
  const mileage = Number.isFinite(Number(input.mileage)) && Number(input.mileage) > 0 ? Math.round(Number(input.mileage)) : null;
  const video = isPath(input.video) ? input.video : null;

  if (signedName.length < 3) return { error: "Type your full name to sign." };
  if (damages.some((d) => !d.photo)) return { error: "Every damage needs a photo." };
  if (repairs.some((r) => !r.description)) return { error: "Describe each problem so the shop knows what to fix." };

  if (type === "initial") {
    const required = PHOTO_SLOTS.filter((s) => !s.optional);
    const missing = required.filter((s) => !photos[s.id]);
    if (Object.keys(photos).length < MIN_INITIAL_PHOTOS || missing.length) {
      return { error: `Take all the required photos (${missing.map((s) => s.label).join(", ") || "at least " + MIN_INITIAL_PHOTOS}).` };
    }
  }
  if (type === "weekly") {
    const missing = PHOTO_SLOTS.filter((s) => s.weekly && !photos[s.id]);
    if (missing.length) return { error: `Take the weekly photos: ${missing.map((s) => s.label).join(", ")}.` };
  }
  if (type === "initial" || type === "weekly") {
    if (FLUIDS.some((f) => !fluids[f.id])) return { error: "Answer every fluid." };
    if (CHECKS.some((c) => !checks[c.id])) return { error: "Answer every safety check." };
    if (!mileage) return { error: "Enter the mileage from the dashboard." };
    if (input.damageAnswered !== true) return { error: "Answer whether the car has any damage." };
  }
  if (type === "damage" && !damages.length) return { error: "Add the damage and a photo." };
  if (type === "repair" && !repairs.length) return { error: "Describe the problem." };
  if (type === "shift" && input.noNewDamage !== true && !damages.length) {
    return { error: "Confirm there's no new damage, or report it." };
  }
  return {
    value: { type, photos, video, damages, repairs, fluids, checks, checkNotes, mileage, signedName, noNewDamage: input.noNewDamage === true },
  };
}

/** Which answers turn into shop work orders. */
export function workOrdersFrom(v) {
  const out = [];
  for (const f of FLUIDS) {
    if (v.fluids?.[f.id] === "shop") out.push({ item: f.label, description: `${f.label} needs the shop.`, urgency: "soon", photo: null });
  }
  for (const c of CHECKS) {
    if (v.checks?.[c.id] === "problem") {
      out.push({ item: c.label, description: v.checkNotes?.[c.id] || `${c.label}: problem reported.`, urgency: "soon", photo: null });
    }
  }
  for (const d of v.damages || []) {
    if (!d.preExisting) out.push({ item: `Body damage: ${d.area}`, description: d.description || "New damage reported.", urgency: "soon", photo: d.photo });
  }
  for (const r of v.repairs || []) out.push({ ...r });
  return out;
}

/**
 * What the driver must do before going on the board, or null.
 * inspection: driver.inspection { carNumber, initialAt, lastFullAt, shiftCheckAt }.
 */
export function inspectionNeeded(inspection, carNumber, nowMs) {
  if (!carNumber) return null;
  const i = inspection || {};
  if (String(i.carNumber || "") !== String(carNumber) || !i.initialAt) return "initial";
  if (!i.lastFullAt || nowMs - i.lastFullAt > WEEKLY_DAYS * 86400000) return "weekly";
  if (!i.shiftCheckAt || nowMs - i.shiftCheckAt > SHIFT_CHECK_HOURS * 3600000) return "shift";
  return null;
}

export const NEEDED_MESSAGE = {
  initial: "Do the first full inspection of your car (360° photos) before going on the board.",
  weekly: "Your weekly vehicle inspection is due. Do it before going on the board.",
  shift: "Do the quick start-of-shift check before going on the board.",
};
