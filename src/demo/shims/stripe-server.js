// Demo stand-in for the "stripe" server library: example payments only,
// no card network is contacted and nothing is charged.
const id = (p) => `${p}_demo_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
export default function Stripe() {
  const intents = {};
  return {
    paymentIntents: {
      async create(p) {
        const pi = { id: id("pi"), amount: p.amount, status: p.confirm ? "succeeded" : "requires_payment_method", metadata: p.metadata || {} };
        pi.client_secret = `${pi.id}_secret_demo`;
        intents[pi.id] = pi;
        return pi;
      },
      update: async (pid, p) => ({ id: pid, ...intents[pid], ...p }),
      capture: async (pid) => ({ id: pid, ...intents[pid], status: "succeeded" }),
      cancel: async (pid) => ({ id: pid, status: "canceled" }),
      retrieve: async (pid) => ({ id: pid, status: "requires_capture", ...intents[pid] }),
    },
    customers: { create: async (p) => ({ id: id("cus"), ...p }), update: async (cid, p) => ({ id: cid, ...p }) },
    setupIntents: { create: async () => ({ id: id("seti"), client_secret: `${id("seti")}_secret_demo` }) },
    paymentMethods: { attach: async (pm) => ({ id: pm }) },
    subscriptions: { create: async (p) => ({ id: id("sub"), status: p.trial_period_days ? "trialing" : "active", items: { data: [] } }) },
    webhooks: {
      constructEvent() {
        throw new Error("Webhooks are not used in the demo.");
      },
    },
  };
}
