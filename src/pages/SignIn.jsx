import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import BrandHeader from "../components/BrandHeader";
import GoogleButton from "../components/auth/GoogleButton";

export default function SignIn() {
  const { login, resetPassword } = useAuth();
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
      await login(email, password);
      navigate("/trip-details");
    } catch (err) {
      setError("Invalid email or password.");
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword() {
    setError("");
    setResetStatus("");
    if (!email.trim()) {
      setError("Enter your email above first, then tap Forgot Password.");
      return;
    }
    setResetting(true);
    try {
      await resetPassword(email.trim());
      setResetStatus(
        "Check your email for a link to reset your password."
      );
    } catch (err) {
      setResetStatus(
        "If that email has an account, a reset link has been sent."
      );
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <BrandHeader />
      <div className="px-6 py-10 flex flex-col justify-center">
        <div className="max-w-md w-full mx-auto">
          <h1 className="text-3xl font-display font-semibold text-slate-800 mb-6">
            Sign In
          </h1>

          <GoogleButton />

          {error && (
            <div className="bg-red-50 text-red-700 text-base rounded-lg p-3 mb-4">
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
              className="w-full border-2 border-slate-300 rounded-xl px-4 py-3.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              type="password"
              placeholder="Password"
              required
              className="w-full border-2 border-slate-300 rounded-xl px-4 py-3.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
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
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-lg py-4 min-h-[56px] rounded-2xl shadow-md transition disabled:opacity-50"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>

          <p className="text-center text-base text-slate-500 mt-6">
            Don't have an account?{" "}
            <Link to="/sign-up" className="text-blue-600 font-semibold">
              Create one
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
