import { useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import BrandHeader from "../components/BrandHeader";
import ConsentModal from "../components/legal/ConsentModal";
import { normalizePhone } from "../utils/phone";

/** After "Continue with Google": name (filled in), phone, agreement. Then you're in. */
export default function FinishAccount() {
  const { currentUser, userProfile, finishAccount } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("next") || "";
  const [form, setForm] = useState({ firstName: params.get("first") || "", lastName: params.get("last") || "", phone: "", referredBy: "" });
  const [askConsent, setAskConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!currentUser) return <Navigate to="/sign-in" replace />;
  if (userProfile) return <Navigate to={next || "/"} replace />;
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const phone = normalizePhone(form.phone);

  async function create(legal) {
    setBusy(true);
    try {
      await finishAccount({ ...form, phone, legal });
      navigate(next || "/welcome");
    } catch {
      setAskConsent(false);
      setError("Couldn't finish your account. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <BrandHeader />
      <div className="px-6 py-10">
        <form
          className="max-w-md mx-auto space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError("");
            if (!form.firstName.trim() || !form.lastName.trim()) return setError("Enter your first and last name.");
            if (phone.length !== 10) return setError("Enter a 10-digit phone number so your driver can reach you.");
            setAskConsent(true);
          }}
        >
          <h1 className="text-3xl font-display font-semibold text-slate-800">Almost done</h1>
          <p className="text-slate-600">Your driver needs your name and a number to reach you.</p>
          {error && <p className="bg-red-50 text-red-700 rounded-lg p-3">{error}</p>}
          <div className="grid grid-cols-2 gap-3">
            <input aria-label="First name" placeholder="First name" value={form.firstName} onChange={(e) => set("firstName", e.target.value)} className="border-2 border-slate-300 rounded-xl px-4 py-3.5 text-base" />
            <input aria-label="Last name" placeholder="Last name" value={form.lastName} onChange={(e) => set("lastName", e.target.value)} className="border-2 border-slate-300 rounded-xl px-4 py-3.5 text-base" />
          </div>
          <input
            type="tel"
            inputMode="tel"
            aria-label="Phone"
            placeholder="Phone (706) 555-0100"
            data-testid="finish-phone"
            value={form.phone}
            onChange={(e) => set("phone", e.target.value)}
            className="w-full border-2 border-slate-300 rounded-xl px-4 py-3.5 text-base"
          />
          <input aria-label="Referral code" placeholder="Referral code (optional)" value={form.referredBy} onChange={(e) => set("referredBy", e.target.value)} className="w-full border-2 border-slate-300 rounded-xl px-4 py-3.5 text-base" />
          <button type="submit" data-testid="finish-account" className="w-full min-h-[56px] rounded-2xl bg-blue-600 text-white font-bold text-lg">
            Finish
          </button>
        </form>
        <ConsentModal
          open={askConsent}
          docIds={["rider-terms", "privacy"]}
          busy={busy}
          quick
          title="Before you join"
          confirmLabel="Agree & Finish"
          onClose={() => setAskConsent(false)}
          onAccept={create}
        />
      </div>
    </div>
  );
}
