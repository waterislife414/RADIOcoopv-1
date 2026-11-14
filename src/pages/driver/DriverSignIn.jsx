import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../config/firebase";
import BrandHeader from "../../components/BrandHeader";
import ConsentModal from "../../components/legal/ConsentModal";

const acceptAgreement = httpsCallable(functions, "acceptDriverAgreement");

const inputClass =
  "w-full border-2 border-slate-300 rounded-xl px-4 py-3.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-600";

export default function DriverSignIn() {
  const { login, resetPassword, currentUser, isDriver } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [askConsent, setAskConsent] = useState(false);

  if (currentUser && isDriver) return <Navigate to="/driver" replace />;

  // Drivers accept the Driver Agreement + Privacy Policy as they sign in.
  function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setStatus("");
    setAskConsent(true);
  }

  async function signIn(record) {
    setLoading(true);
    try {
      await login(email.trim(), password);
    } catch {
      setAskConsent(false);
      setError("Wrong email or password.");
      setLoading(false);
      return;
    }
    // Only approved drivers have a driver record; applicants agreed when they applied.
    await acceptAgreement({ version: record.version, docs: record.docs, marketingOptIn: record.marketingOptIn }).catch(() => {});
    setLoading(false);
    navigate("/driver");
  }

  async function handleForgot() {
    setError("");
    if (!email.trim()) {
      setError("Enter your email above first, then tap Forgot Password.");
      return;
    }
    try {
      await resetPassword(email.trim());
    } catch {
      // Same message either way so this can't be used to check emails.
    }
    setStatus("If that email has an account, a reset link has been sent.");
  }

  return (
    <div className="min-h-screen bg-navy-950">
      <BrandHeader tagline="Driver Sign In" />
      <div className="px-6 py-10">
        <div className="max-w-sm w-full mx-auto bg-white rounded-2xl p-7 shadow-2xl">
          <h1 className="text-2xl font-display font-semibold text-slate-800 mb-6 text-center">
            Driver Sign In
          </h1>

          {error && <div className="bg-red-50 text-red-700 text-base rounded-lg p-3 mb-4">{error}</div>}
          {status && <div className="bg-blue-50 text-blue-700 text-base rounded-lg p-3 mb-4">{status}</div>}

          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="email"
              placeholder="Email"
              required
              autoComplete="email"
              className={inputClass}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              type="password"
              placeholder="Password"
              required
              autoComplete="current-password"
              className={inputClass}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <div className="text-right">
              <button type="button" onClick={handleForgot} className="text-sm font-semibold text-blue-600">
                Forgot Password?
              </button>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-lg py-3.5 rounded-xl transition disabled:opacity-50"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>
          <ConsentModal
            open={askConsent}
            docIds={["driver-agreement", "privacy"]}
            busy={loading}
            confirmLabel="Agree & Sign In"
            contactLabel="I agree to be contacted by phone call, text message, email and app alerts about calls, my lease and my account."
            promoLabel="Yes, send me company offers and news by text and email."
            onClose={() => setAskConsent(false)}
            onAccept={signIn}
          />

          <p className="text-center text-base text-slate-500 mt-6">
            Not a driver yet?{" "}
            <Link to="/become-a-driver" className="text-blue-600 font-semibold">
              Become a Driver
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
