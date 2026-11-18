// Problem reports ("Report a problem / Ask dispatch") and the dispatcher
// approval pop-up (spec section 21).
//
//  - reportProblem: a driver (or a dispatcher) files a problem with the
//    device details attached. It is saved to support_tickets and queued for
//    email to the developer and the owner. A driver whose GPS glitched can
//    also ask dispatch to place him ("Check Ready" without a good fix).
//  - answerApproval: the dispatcher approves (places him in the zone he
//    asked for, time-limited) or denies with a reason.
//
// A driver who turned a permission off can't ask around it: he is told to
// turn it back on. Everything is written by Cloud Functions only.
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const BRANDING = require("./branding.json");
const E = require("./dispatchEngine");
const { getZones } = require("./zoneStore");
const { requireDriver } = require("./workRules");

const db = () => admin.firestore();
const serverNow = () => admin.firestore.FieldValue.serverTimestamp();
const { boardRef, driverRef } = E.refs;

const DISPATCH = BRANDING.dispatch || {};
const APPROVAL_MIN = DISPATCH.approvalValidMinutes ?? 60;
const FLAG_AFTER = DISPATCH.approvalsBeforeFlag ?? 2;
const AREAS = ["check_ready", "go_online", "payment", "calling", "map_address", "other"];
const PERMS = ["location", "notifications", "camera"];
const placeholder = (s) => !s || /^\[INSERT/i.test(String(s));

const str = (v, n) => String(v ?? "").slice(0, n);

/** Only the device facts we expect, each capped, so a ticket can't be stuffed with junk. */
function cleanDevice(d) {
  const o = d && typeof d === "object" ? d : {};
  const fix = o.lastFix && typeof o.lastFix === "object" ? o.lastFix : null;
  const perms = {};
  for (const p of PERMS) perms[p] = ["granted", "denied", "off", "unknown"].includes(o.permissions?.[p]) ? o.permissions[p] : "unknown";
  return {
    appVersion: str(o.appVersion, 40),
    userAgent: str(o.userAgent, 240),
    phoneModel: str(o.phoneModel, 80),
    permissions: perms,
    lastFix: fix
      ? {
          lat: Number.isFinite(Number(fix.lat)) ? Number(fix.lat) : null,
          lng: Number.isFinite(Number(fix.lng)) ? Number(fix.lng) : null,
          accuracy: Number.isFinite(Number(fix.accuracy)) ? Math.round(Number(fix.accuracy)) : null,
          ageSec: Number.isFinite(Number(fix.ageSec)) ? Math.round(Number(fix.ageSec)) : null,
        }
      : null,
    gpsState: str(o.gpsState, 24),
    zoneId: str(o.zoneId, 60),
    errors: (Array.isArray(o.errors) ? o.errors : []).slice(-50).map((e) => str(e, 200)),
  };
}

async function queueEmail(ticket, id) {
  const to = [BRANDING.support?.devEmail, BRANDING.support?.ownerEmail].filter((e) => !placeholder(e));
  if (!to.length) return false;
  const lines = [
    `${ticket.role === "dispatcher" ? "Dispatcher" : `Car ${ticket.carNumber ?? "?"}`} reported a problem: ${ticket.area}`,
    ticket.note || "(no note)",
    "",
    `App ${ticket.device.appVersion || "?"} · ${ticket.device.phoneModel || ticket.device.userAgent}`,
    `Permissions: ${PERMS.map((p) => `${p} ${ticket.device.permissions[p]}`).join(", ")}`,
    ticket.device.lastFix
      ? `Last GPS: ±${ticket.device.lastFix.accuracy ?? "?"} m, ${ticket.device.lastFix.ageSec ?? "?"} s old (${ticket.device.gpsState || "?"})`
      : "No GPS fix",
    `Zone: ${ticket.device.zoneId || "none"}`,
    `Last errors: ${ticket.device.errors.slice(-5).join(" | ") || "none"}`,
    `Ticket ${id}`,
  ];
  await db().collection("mail_queue").add({
    to,
    subject: `Radio Co-op problem report: ${ticket.area}`,
    text: lines.join("\n"),
    kind: "support_ticket",
    ticketId: id,
    createdAtMs: Date.now(),
  });
  return true;
}

exports.reportProblem = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const isAdmin = request.auth.token.admin === true;
  const uid = isAdmin ? request.auth.uid : requireDriver(request);
  const area = AREAS.includes(request.data?.area) ? request.data.area : "other";
  const note = str(request.data?.note, 1000).trim();
  const device = cleanDevice(request.data?.device);
  if (!note && !request.data?.ask) throw new HttpsError("invalid-argument", "Tell us what went wrong.");

  let carNumber = null;
  let driver = {};
  if (!isAdmin) {
    const dSnap = await driverRef(uid).get();
    driver = dSnap.data() || {};
    carNumber = driver.carNumber ?? null;
  }
  const ticket = {
    uid,
    role: isAdmin ? "dispatcher" : "driver",
    carNumber,
    area,
    note,
    device,
    status: "open", // open, approved, fixed, closed
    createdAtMs: Date.now(),
    createdAt: serverNow(),
  };

  // Ask dispatch: only a glitch qualifies. A driver whose permission is off must turn it back on.
  const ask = !isAdmin && request.data?.ask?.type === "check_ready" ? request.data.ask : null;
  if (ask) {
    const off = PERMS.filter((p) => ["denied", "off"].includes(device.permissions[p]));
    if (off.length) {
      throw new HttpsError(
        "failed-precondition",
        `Turn ${off.join(" and ")} back on for this app first. Dispatch can't approve around a permission that's off.`,
        { permissionsOff: off }
      );
    }
    const zones = await getZones();
    const zone = zones.find((z) => z.id === ask.zoneId);
    if (!zone) throw new HttpsError("invalid-argument", "Pick the zone you're in.");
    const c = await E.core();
    if (zone.requiresCert && !c.hasCert(driver, zone.requiresCert, Date.now())) {
      throw new HttpsError("failed-precondition", `${zone.label} is for certified drivers only.`);
    }
    ticket.status = "open";
    ticket.area = "check_ready";
    const open = await db().collection("approval_requests").where("uid", "==", uid).where("status", "==", "pending").limit(1).get();
    if (!open.empty) return { ticketId: null, approvalId: open.docs[0].id, already: true };

    const ref = await db().collection("support_tickets").add(ticket);
    const approval = await db().collection("approval_requests").add({
      uid,
      carNumber,
      name: str(driver.name, 60),
      zoneId: zone.id,
      zoneLabel: zone.label,
      note,
      reason: str(ask.reason, 160),
      gps: device.lastFix,
      gpsState: device.gpsState,
      ticketId: ref.id,
      status: "pending",
      createdAtMs: Date.now(),
      remindAtMs: Date.now() + (DISPATCH.approvalRepeatSeconds ?? 120) * 1000,
    });
    ticket.emailed = await queueEmail(ticket, ref.id);
    await ref.update({ approvalId: approval.id, emailed: ticket.emailed });
    return { ticketId: ref.id, approvalId: approval.id };
  }

  const ref = await db().collection("support_tickets").add(ticket);
  const emailed = await queueEmail(ticket, ref.id);
  await ref.update({ emailed });

  // Also add an alert so the dispatcher desk sees non-check_ready problems immediately.
  await db().collection("alerts").add({
    type: "driver_problem",
    status: "open",
    at: Date.now(),
    carNumber,
    driverName: driver.name || "",
    driverId: uid,
    message: note || `Driver needs help: ${area}`,
    ticketId: ref.id,
  });

  return { ticketId: ref.id, approvalId: null };
});

exports.answerApproval = onCall(async (request) => {
  if (!request.auth || request.auth.token.admin !== true) throw new HttpsError("permission-denied", "Dispatcher access required.");
  const requestId = str(request.data?.requestId, 80);
  const decision = request.data?.decision;
  if (!requestId || !["approve", "deny"].includes(decision)) throw new HttpsError("invalid-argument", "Approve or deny.");
  const reason = str(request.data?.reason, 200).trim();
  if (decision === "deny" && reason.length < 3) throw new HttpsError("invalid-argument", "Say why, so the driver knows.");
  const by = str(request.data?.dispatcherName || request.auth.token.name || "desk", 60);
  const c = await E.core();
  const zones = await getZones();
  const nowMs = Date.now();

  const out = await db().runTransaction(async (tx) => {
    const reqRef = db().collection("approval_requests").doc(requestId);
    const rs = await tx.get(reqRef);
    if (!rs.exists) throw new HttpsError("not-found", "That request is gone.");
    const r = rs.data();
    if (r.status !== "pending") throw new HttpsError("failed-precondition", `Already ${r.status}.`);

    if (decision === "deny") {
      tx.update(reqRef, { status: "denied", reason, decidedBy: by, decidedAtMs: nowMs });
      if (r.ticketId) tx.update(db().collection("support_tickets").doc(r.ticketId), { status: "closed" });
      return { status: "denied", uid: r.uid };
    }

    const zoneId = str(request.data?.zoneId || r.zoneId, 60);
    const zone = zones.find((z) => z.id === zoneId);
    if (!zone) throw new HttpsError("invalid-argument", "Pick a zone.");
    const bs = await tx.get(boardRef(r.uid));
    if (!bs.exists) throw new HttpsError("not-found", "Car not found.");
    const board = bs.data();
    if (["offered", "on_call"].includes(board.status)) throw new HttpsError("failed-precondition", "He's on a call right now.");
    const line = (await tx.get(db().collection("board").where("zoneId", "==", zoneId))).docs.map((d) => ({ id: d.id, ...d.data() }));
    const patch = c.dispatcherMove(line, r.uid, "ready", zoneId, nowMs);
    const untilMs = nowMs + APPROVAL_MIN * 60000;
    tx.update(boardRef(r.uid), {
      ...patch,
      updatedAt: serverNow(),
      approval: { by, at: nowMs, untilMs, zoneId, noGps: true },
    });
    tx.set(db().collection("driverLocations").doc(r.uid), { live: true, outOfZoneSince: null }, { merge: true });
    tx.update(reqRef, { status: "approved", zoneId, zoneLabel: zone.label, decidedBy: by, decidedAtMs: nowMs, untilMs });
    if (r.ticketId) tx.update(db().collection("support_tickets").doc(r.ticketId), { status: "approved" });
    return { status: "approved", uid: r.uid, carNumber: r.carNumber };
  });

  // Same driver approved again and again: the phone needs fixing. Tell the owner.
  if (out.status === "approved") {
    const weekAgo = nowMs - 7 * 86400000;
    const recent = await db().collection("approval_requests").where("uid", "==", out.uid).where("decidedAtMs", ">=", weekAgo).get();
    const approved = recent.docs.filter((d) => d.data().status === "approved").length;
    if (approved > FLAG_AFTER) {
      await db().collection("owner_inbox").doc(`approvals_${out.uid}`).set({
        kind: "repeat_approvals",
        uid: out.uid,
        carNumber: out.carNumber ?? null,
        count: approved,
        status: "open",
        updatedAtMs: nowMs,
      });
    }
  }
  return { ok: true, status: out.status };
});
