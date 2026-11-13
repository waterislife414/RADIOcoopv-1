// Phone alerts for drivers (Firebase Cloud Messaging web push). The app's
// own on-screen alert is the main channel; this reaches a phone whose
// screen is off or showing another app. Tokens live in driverTokens/{uid}.
const admin = require("firebase-admin");

const push = {
  async impl(tokens, msg) {
    return admin.messaging().sendEachForMulticast({ tokens, ...msg });
  },
  /** Never throws: push is best effort. */
  async toDrivers(uids, { title, body, tag }) {
    const ids = [...new Set(uids)].filter(Boolean);
    if (!ids.length) return;
    try {
      const db = admin.firestore();
      const snaps = await db.getAll(...ids.map((id) => db.collection("driverTokens").doc(id)));
      const owners = [];
      const tokens = [];
      snaps.forEach((s) => (s.data()?.tokens || []).forEach((t) => (owners.push(s.id), tokens.push(t))));
      if (!tokens.length) return;
      const res = await push.impl(tokens, {
        webpush: {
          headers: { Urgency: "high", TTL: "60" },
          notification: { title, body, tag, renotify: true, requireInteraction: true, icon: "/icon-192.png" },
          fcmOptions: { link: "/driver" },
        },
      });
      const dead = {};
      res?.responses?.forEach((r, i) => {
        const code = r.error?.code || "";
        if (code.includes("registration-token-not-registered") || code.includes("invalid-registration-token")) {
          (dead[owners[i]] ||= []).push(tokens[i]);
        }
      });
      await Promise.all(
        Object.entries(dead).map(([uid, bad]) =>
          db.collection("driverTokens").doc(uid).update({ tokens: admin.firestore.FieldValue.arrayRemove(...bad) })
        )
      );
    } catch (e) {
      console.warn("Push failed:", e.message);
    }
  },
};

module.exports = push;
