import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { httpsCallable } from "firebase/functions";
import { functions } from "../config/firebase";
import { useAuth } from "../context/AuthContext";
import BrandHeader from "../components/BrandHeader";
import { COMPANY_NAME, COMPANY_PHONE_DISPLAY, COMPANY_PHONE_TEL } from "../config/constants";

const deleteMyAccount = httpsCallable(functions, "deleteMyAccount");

/**
 * Delete your account: the in-app path and the web page Google Play asks for
 * (link it as the account-deletion URL in the Play Console Data safety form).
 */
export default function DeleteAccount() {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function remove() {
    setBusy(true);
    setError("");
    try {
      await deleteMyAccount({ confirm: "DELETE" });
      setDone(true);
      try {
        await logout();
      } catch {
        // Already signed out when the sign-in was deleted.
      }
    } catch (e) {
      setError(e?.message || "We couldn't delete your account. Please call us.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <BrandHeader />
      <div className="px-6 py-8">
        <div className="max-w-md mx-auto space-y-5">
          <h1 className="text-3xl font-display font-semibold text-slate-800">Delete your account</h1>

          <div className="text-base text-slate-700 space-y-2" data-testid="delete-explainer">
            <p>Deleting your {COMPANY_NAME} account removes:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>your profile (name, phone, address, date of birth)</li>
              <li>your ID and face photos</li>
              <li>your sign-in</li>
            </ul>
            <p>We keep ride and payment records for business, tax and safety reasons, and a note of any unpaid fees.</p>
            <p>Have a membership? Cancel it first. Have a ride on the way? Finish or cancel it first.</p>
          </div>

          {done ? (
            <div data-testid="delete-done" className="rounded-2xl bg-emerald-50 border-2 border-emerald-500 p-4 text-emerald-900">
              <p className="font-bold">Your account is deleted.</p>
              <button type="button" onClick={() => navigate("/")} className="mt-2 font-semibold underline">
                Back to home
              </button>
            </div>
          ) : currentUser ? (
            <div className="space-y-3">
              {error && <p className="rounded-xl bg-red-50 border-2 border-red-300 text-red-800 p-3 text-sm font-semibold">{error}</p>}
              {!sure ? (
                <button
                  type="button"
                  data-testid="delete-start"
                  onClick={() => setSure(true)}
                  className="w-full min-h-[52px] rounded-full border-2 border-red-500 text-red-700 font-bold text-lg"
                >
                  Delete my account
                </button>
              ) : (
                <div className="rounded-2xl border-2 border-red-400 bg-red-50 p-4 space-y-3">
                  <p className="font-bold text-red-900">This can&rsquo;t be undone. Delete your account now?</p>
                  <button
                    type="button"
                    data-testid="delete-confirm"
                    disabled={busy}
                    onClick={remove}
                    className="w-full min-h-[52px] rounded-full bg-red-600 text-white font-bold text-lg disabled:opacity-60"
                  >
                    {busy ? "Deleting…" : "Yes, delete it"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSure(false)}
                    className="w-full min-h-[48px] rounded-full border-2 border-slate-300 font-bold text-slate-700"
                  >
                    Keep my account
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <Link to="/sign-in" className="block text-center min-h-[52px] leading-[52px] rounded-full bg-blue-600 text-white font-bold text-lg">
                Sign in to delete your account
              </Link>
              <p className="text-sm text-slate-600">
                Can&rsquo;t sign in? Call{" "}
                <a href={`tel:${COMPANY_PHONE_TEL}`} className="font-semibold text-blue-600 underline">{COMPANY_PHONE_DISPLAY}</a>{" "}
                and we&rsquo;ll delete it for you.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
