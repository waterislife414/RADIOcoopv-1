import { test } from "node:test";
import assert from "node:assert/strict";
import * as H from "./selfCheck.mjs";

const NOW = 1_800_000_000_000;
const min = (m) => NOW - m * 60000;

test("stuck card charge is released after 10 minutes (safe fix)", () => {
  assert.deepEqual(H.rideIssue({ settlingAt: min(11), finalFare: null }, NOW), { kind: "stuck_settling", fix: { settlingAt: null } });
  assert.equal(H.rideIssue({ settlingAt: min(5), finalFare: null }, NOW), null);
  assert.equal(H.rideIssue({ settlingAt: min(30), finalFare: 9 }, NOW), null);
});

test("finished card ride never charged: flagged after 2 hours", () => {
  const r = { status: "finished", paymentMethod: "card", finalFare: null, droppedOffAt: min(121) };
  assert.equal(H.rideIssue(r, NOW).kind, "card_unpaid");
  assert.equal(H.rideIssue({ ...r, droppedOffAt: min(60) }, NOW), null);
  assert.equal(H.rideIssue({ ...r, paymentMethod: "cash" }, NOW), null);
});

test("waiting, long rides and long stops are flagged; scheduled rides are not", () => {
  assert.equal(H.rideIssue({ status: "pending", timestamp: min(31) }, NOW).kind, "pending_long");
  assert.equal(H.rideIssue({ status: "pending", scheduleType: "later", timestamp: min(90) }, NOW), null);
  assert.equal(H.rideIssue({ status: "in_transit", assignedAt: min(241) }, NOW).kind, "on_ride_long");
  assert.equal(H.rideIssue({ status: "in_transit", assignedAt: min(20), stopWait: { startedAt: min(61) } }, NOW).kind, "stop_wait_long");
  assert.equal(H.rideIssue({ status: "in_transit", assignedAt: min(20) }, NOW), null);
});

test("Firestore timestamps work too", () => {
  assert.equal(H.rideIssue({ status: "pending", timestamp: { seconds: (NOW - 40 * 60000) / 1000 } }, NOW).kind, "pending_long");
});

test("road factor moves at most 0.05 a run and stays between 1.1 and 1.8", () => {
  assert.equal(H.nextRoadFactor(1.35, 1.5), 1.4);
  assert.equal(H.nextRoadFactor(1.35, 1.32), 1.32);
  assert.equal(H.nextRoadFactor(1.12, 0.9), 1.1);
  assert.equal(H.nextRoadFactor(1.78, 2.5), 1.8);
  assert.equal(H.nextRoadFactor(1.35, null), 1.35);
});
