// Demo stand-in for "@stripe/react-stripe-js": an example card that is
// never sent anywhere.
import { demoStripe } from "./stripe-js";

export const Elements = ({ children }) => children;
export const useStripe = () => demoStripe;
export const useElements = () => ({ getElement: () => ({ demo: true }) });

export function CardElement() {
  return (
    <div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 16, color: "#1e293b", fontFamily: "ui-monospace, monospace" }}>
        <span style={{ flex: 1 }}>4242 4242 4242 4242</span>
        <span>12 / 34</span>
        <span>123</span>
      </div>
      <p style={{ marginTop: 6, fontSize: 12, color: "#64748b" }}>Example card for the demo. Nothing is charged.</p>
    </div>
  );
}
export const PaymentElement = CardElement;
