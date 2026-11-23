import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { BRAND } from "../../config/constants";

/**
 * "Continue with Google": sign in or sign up in one tap. New Google users finish
 * their account (phone + agreement) next. Hidden when branding auth.google is off.
 * Before launch, swap in Google's official sign-in button art (their branding rules).
 */
export default function GoogleButton({ next = "" }) {
  const { signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!BRAND.auth?.google) return null;

  async function go() {
    setBusy(true);
    setError("");
    try {
      const r = await signInWithGoogle();
      if (r.redirecting) return;
      const q = new URLSearchParams();
      if (next) q.set("next", next);
      if (r.isNew) {
        if (r.firstName) q.set("first", r.firstName);
        if (r.lastName) q.set("last", r.lastName);
        navigate(`/finish-account?${q}`);
      } else {
        navigate(next || "/");
      }
    } catch (e) {
      if (e?.code !== "auth/popup-closed-by-user") setError("Google sign-in didn't work. Try again, or use your email below.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-6">
      <button
        type="button"
        data-testid="google-signin"
        onClick={go}
        disabled={busy}
        className="w-full min-h-[56px] rounded-2xl border-2 border-slate-300 bg-white text-slate-800 font-bold text-lg shadow-sm disabled:opacity-50"
      >
        {busy ? "Opening Google…" : "Continue with Google"}
      </button>
      {error && <p className="text-sm text-red-700 mt-2">{error}</p>}
      <p className="text-center text-sm text-slate-500 mt-4">or use your email</p>
    </div>
  );
}
