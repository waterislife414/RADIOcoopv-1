import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import BrandHeader from "../../components/BrandHeader";

export default function AdminLogin() {
  const { login, resetPassword, currentUser, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [resetStatus, setResetStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setResetStatus("");
    setLoading(true);
    try {
      const cred = await login(email, password);
      const tokenResult = await cred.user.getIdTokenResult(true);
      if (!tokenResult.claims.admin) {
        setError("This account does not have dispatcher access.");
        setLoading(false);
        return;
      }
      navigate("/admin/dashboard");
    } catch (err) {
      setError("Error: " + (err.code || err.message || "unknown"));
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword() {
    setError("");
    setResetStatus("");
    if (!email.trim()) {
      setError("Enter the dispatcher email above first.");
      return;
    }
    setResetting(true);
    try {
      await resetPassword(email.trim());
      setResetStatus("Check the company email for a password reset link.");
    } catch (err) {
      setResetStatus("If that email has an account, a reset link has been sent.");
    } finally {
      setResetting(false);
    }
  }

  if (currentUser && isAdmin) {
    navigate("/admin/dashboard");
  }

  return (
    <div className="min-h-screen bg-navy-950 flex flex-col justify-center">
      <BrandHeader tagline="Dispatcher Access" />
      <div className="px-6 py-10">
        <div className="max-w-sm w-full mx-auto bg-white rounded-2xl p-8 shadow-2xl">
          <h1 className="text-2xl font-display font-semibold text-slate-800 mb-6 text-center">
            Dispatcher Login
          </h1>

          {error && (
            <div className="bg-red-50 text-red-700 text-base rounded-lg p-3 mb-4 break-words">
              {error}
            </div>
          )}
          {resetStatus && (
            <div className="bg-blue-50 text-blue-700 text-base rounded-lg p-3 mb-4">
              {resetStatus}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="email"
              placeholder="Email"
              required
              className="w-full border-2 border-slate-300 rounded-xl px-4 py-3.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-600"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              type="password"
              placeholder="Password"
              required
              className="w-full border-2 border-slate-300 rounded-xl px-4 py-3.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-600"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <div className="text-right">
              <button
                type="button"
                onClick={handleForgotPassword}
                disabled={resetting}
                className="text-sm font-semibold text-blue-600 hover:text-blue-700 disabled:opacity-50"
              >
                {resetting ? "Sending..." : "Forgot Password?"}
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
        </div>
      </div>
    </div>
  );
}
