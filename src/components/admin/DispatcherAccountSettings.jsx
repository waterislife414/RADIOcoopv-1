import { useState } from "react";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updateEmail,
  updatePassword,
} from "firebase/auth";
import { auth } from "../../config/firebase";

// Lets the dispatcher change their own login email and/or password from
// inside the terminal — no developer access needed. Firebase requires a
// fresh sign-in for security-sensitive changes like this, so we
// re-verify the current password first before applying any update.
export default function DispatcherAccountSettings({ onClose }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave(e) {
    e.preventDefault();
    setError("");
    setStatus("");

    if (!currentPassword) {
      setError("Enter the current dispatcher password to confirm this change.");
      return;
    }
    if (!newEmail && !newPassword) {
      setError("Enter a new email and/or new password to update.");
      return;
    }
    if (newPassword && newPassword !== confirmPassword) {
      setError("New password and confirmation don't match.");
      return;
    }
    if (newPassword && newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }

    setSaving(true);
    try {
      const user = auth.currentUser;
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);

      if (newEmail) {
        await updateEmail(user, newEmail.trim());
      }
      if (newPassword) {
        await updatePassword(user, newPassword);
      }

      setStatus("Dispatcher login updated. Use the new credentials next time you sign in.");
      setCurrentPassword("");
      setNewEmail("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      if (err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") {
        setError("Current password is incorrect.");
      } else if (err.code === "auth/requires-recent-login") {
        setError("For security, please sign out and back in, then try again.");
      } else if (err.code === "auth/email-already-in-use") {
        setError("That email is already in use by another account.");
      } else {
        setError("Could not update login. Please try again.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full sm:max-w-sm p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="font-display font-bold text-xl text-slate-800 mb-1">
          Dispatcher Login Settings
        </h2>
        <p className="text-sm text-slate-500 mb-5">
          Change the email or password used to sign in to this terminal. Only
          your business has access to this — no one else can make this
          change for you.
        </p>

        <form onSubmit={handleSave} className="space-y-3.5">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">
              Current Password
            </label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full border-2 border-slate-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-600"
              autoComplete="current-password"
            />
          </div>

          <div className="pt-1 border-t border-slate-100" />

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">
              New Login Email <span className="text-slate-500 font-normal">(optional)</span>
            </label>
            <input
              type="email"
              placeholder="dispatch@yourcompany.com"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="w-full border-2 border-slate-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-600"
              autoComplete="email"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">
              New Password <span className="text-slate-500 font-normal">(optional)</span>
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full border-2 border-slate-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-600"
              autoComplete="new-password"
            />
          </div>

          {newPassword && (
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                Confirm New Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full border-2 border-slate-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-600"
                autoComplete="new-password"
              />
            </div>
          )}

          {error && (
            <div className="bg-red-50 text-red-700 text-sm rounded-lg p-3">{error}</div>
          )}
          {status && (
            <div className="bg-emerald-50 text-emerald-700 text-sm rounded-lg p-3">{status}</div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border-2 border-slate-300 text-slate-600 font-semibold py-3 rounded-xl"
            >
              Close
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-[2] bg-blue-600 text-white font-bold py-3 rounded-xl disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
