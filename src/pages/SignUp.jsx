import { useState } from "react";
import LegalConsent from "../components/legal/LegalConsent";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import BrandHeader from "../components/BrandHeader";
import { SUBSCRIPTION_TIERS } from "../config/constants";

export default function SignUp() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const chosenTier = searchParams.get("tier");
  const tierInfo = chosenTier ? SUBSCRIPTION_TIERS[chosenTier] : null;

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
    address: "",
    password: "",
    dob: "",
    referredBy: "",
  });
  const [error, setError] = useState("");
  const [consent, setConsent] = useState(null);
  const [loading, setLoading] = useState(false);

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signup({ ...form, legal: consent });
      if (tierInfo) {
        navigate(`/subscribe/${chosenTier}`);
      } else {
        navigate("/welcome");
      }
    } catch (err) {
      setError("Could not create account. Try a different email.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <BrandHeader />
      <div className="px-6 py-10">
        <div className="max-w-md mx-auto">
          <h1 className="text-3xl font-display font-semibold text-slate-800 mb-6">
            Create Account
          </h1>

          {tierInfo && (
            <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4 mb-5">
              <p className="text-sm text-blue-700">
                You're signing up for the{" "}
                <span className="font-bold">{tierInfo.name} Plan</span> (${tierInfo.price}
                /mo). You'll choose a payment method right after creating your account.
              </p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 text-red-700 text-base rounded-lg p-3 mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                placeholder="First Name"
                required
                className="border-2 border-slate-300 rounded-xl px-4 py-3.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-600"
                value={form.firstName}
                onChange={(e) => update("firstName", e.target.value)}
              />
              <input
                type="text"
                placeholder="Last Name"
                required
                className="border-2 border-slate-300 rounded-xl px-4 py-3.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-600"
                value={form.lastName}
                onChange={(e) => update("lastName", e.target.value)}
              />
            </div>
            <p className="text-xs text-slate-400 -mt-2">
              Name must match your driver's license or state ID.
            </p>
            <input
              type="text"
              placeholder="Home Address"
              required
              className="w-full border-2 border-slate-300 rounded-xl px-4 py-3.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-600"
              value={form.address}
              onChange={(e) => update("address", e.target.value)}
            />
            <input
              type="tel"
              placeholder="Phone"
              required
              className="w-full border-2 border-slate-300 rounded-xl px-4 py-3.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-600"
              value={form.phone}
              onChange={(e) => update("phone", e.target.value)}
            />
            <input
              type="email"
              placeholder="Email"
              required
              className="w-full border-2 border-slate-300 rounded-xl px-4 py-3.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-600"
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
            />
            <input
              type="password"
              placeholder="Password"
              required
              minLength={6}
              className="w-full border-2 border-slate-300 rounded-xl px-4 py-3.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-600"
              value={form.password}
              onChange={(e) => update("password", e.target.value)}
            />
            <div>
              <label className="block text-base font-semibold text-slate-700 mb-1.5">
                Date of Birth
              </label>
              <input
                type="date"
                required
                className="w-full border-2 border-slate-300 rounded-xl px-4 py-3.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-600"
                value={form.dob}
                onChange={(e) => update("dob", e.target.value)}
              />
            </div>
            <input
              type="text"
              placeholder="Referral Code (optional)"
              className="w-full border-2 border-slate-300 rounded-xl px-4 py-3.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-600"
              value={form.referredBy}
              onChange={(e) => update("referredBy", e.target.value)}
            />

            <LegalConsent docIds={["rider-terms", "privacy"]} onChange={setConsent} />

            <button
              type="submit"
              disabled={loading || !consent}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-lg py-4.5 rounded-2xl shadow-md transition disabled:opacity-50"
            >
              {loading ? "Creating..." : "Create Account"}
            </button>
          </form>

          <p className="text-center text-base text-slate-500 mt-6">
            Already have an account?{" "}
            <Link to="/sign-in" className="text-blue-600 font-semibold">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
