import { test } from "node:test";
import assert from "node:assert/strict";
import { validateInspection, workOrdersFrom, inspectionNeeded, PHOTO_SLOTS, FLUIDS, CHECKS } from "./inspectionCore.mjs";

const allPhotos = Object.fromEntries(PHOTO_SLOTS.filter((s) => !s.optional).map((s) => [s.id, `inspections/u1/${s.id}.jpg`]));
const okFluids = Object.fromEntries(FLUIDS.map((f) => [f.id, "ok"]));
const okChecks = Object.fromEntries(CHECKS.map((c) => [c.id, "ok"]));
const full = { photos: allPhotos, fluids: okFluids, checks: okChecks, mileage: "84210", signedName: "Pat Example", damageAnswered: true };

test("first inspection needs at least 10 required photos", () => {
  assert.match(validateInspection("initial", { ...full, photos: { front: "a/b.jpg" } }).error, /required photos/);
  assert.ok(validateInspection("initial", full).value);
  assert.equal(Object.keys(validateInspection("initial", full).value.photos).length, 11);
});

test("weekly needs the 5 weekly photos, every fluid and check, mileage and a signature", () => {
  const weekly = Object.fromEntries(PHOTO_SLOTS.filter((s) => s.weekly).map((s) => [s.id, `p/${s.id}.jpg`]));
  assert.ok(validateInspection("weekly", { ...full, photos: weekly }).value);
  assert.match(validateInspection("weekly", { ...full, photos: {} }).error, /weekly photos/);
  assert.match(validateInspection("weekly", { ...full, photos: weekly, fluids: {} }).error, /fluid/);
  assert.match(validateInspection("weekly", { ...full, photos: weekly, mileage: "" }).error, /mileage/);
  assert.match(validateInspection("weekly", { ...full, photos: weekly, signedName: "" }).error, /sign/);
});

test("damage needs a photo; problems need a description", () => {
  assert.match(validateInspection("damage", { signedName: "Pat E", damages: [{ area: "Hood" }] }).error, /photo/);
  assert.ok(validateInspection("damage", { signedName: "Pat E", damages: [{ area: "Hood", photo: "x/y.jpg" }] }).value);
  assert.match(validateInspection("repair", { signedName: "Pat E", repairs: [{ item: "Rattle or clunk" }] }).error, /Describe/);
});

test("shop work orders come from shop fluids, failed checks, new damage and problems, not old damage", () => {
  const v = validateInspection("weekly", {
    ...full,
    photos: allPhotos,
    fluids: { ...okFluids, brakeFluid: "shop", engineOil: "topped" },
    checks: { ...okChecks, brakes: "problem" },
    checkNotes: { brakes: "Grinding when stopping" },
    damages: [
      { area: "Front bumper", photo: "d1.jpg", preExisting: true },
      { area: "Back-left door", photo: "d2.jpg", description: "New dent" },
    ],
    repairs: [{ item: "Rattle or clunk", description: "Rattle in back right over bumps", urgency: "watch" }],
  }).value;
  const wo = workOrdersFrom(v);
  assert.deepEqual(wo.map((w) => w.item), ["Brake fluid", "Brakes", "Body damage: Back-left door", "Rattle or clunk"]);
  assert.equal(wo[1].description, "Grinding when stopping");
  assert.equal(wo[3].urgency, "watch");
});

test("what's needed before going on the board", () => {
  const now = Date.parse("2026-11-14T12:00:00Z");
  const day = 86400000;
  assert.equal(inspectionNeeded(null, "44", now), "initial");
  assert.equal(inspectionNeeded({ carNumber: "12", initialAt: now }, "44", now), "initial", "new car needs a new 360");
  assert.equal(inspectionNeeded({ carNumber: "44", initialAt: now - 8 * day, lastFullAt: now - 8 * day }, "44", now), "weekly");
  assert.equal(inspectionNeeded({ carNumber: "44", initialAt: now, lastFullAt: now - day, shiftCheckAt: now - 20 * 3600000 }, "44", now), "shift");
  assert.equal(inspectionNeeded({ carNumber: "44", initialAt: now, lastFullAt: now - day, shiftCheckAt: now - 3600000 }, "44", now), null);
  assert.equal(inspectionNeeded(null, null, now), null, "no car assigned: nothing to inspect");
});
