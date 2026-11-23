// Demo stand-in for "@stripe/stripe-js".
export const demoStripe = {
  async confirmCardPayment(clientSecret) {
    return { paymentIntent: { id: String(clientSecret).replace(/_secret_demo$/, ""), status: "requires_capture" } };
  },
  // No Google Pay / Apple Pay in the demo: canMakePayment says no.
  paymentRequest() {
    return { canMakePayment: async () => null, on() {} };
  },
  async createPaymentMethod() {
    return { paymentMethod: { id: "pm_demo_visa4242" } };
  },
  async confirmCardSetup() {
    return { setupIntent: { id: "seti_demo", payment_method: "pm_demo_visa4242", status: "succeeded" } };
  },
};
export const loadStripe = async () => demoStripe;
