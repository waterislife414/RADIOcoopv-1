import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { auth, db, storage } from "../config/firebase";
import { useAuth } from "../context/AuthContext";
import BrandHeader from "../components/BrandHeader";
import ContactFooter from "../components/ContactFooter";
import { normalizePhone } from "../utils/phone";

const inputClass =
  "w-full border-2 border-slate-300 rounded-xl px-4 py-3.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-600";

// Become a Driver: creates the driver's login (email + password) and the
// application in one step. Malcolm approves it from the dispatcher
// terminal, assigns a car number, and the driver can then sign in.
export default function Careers() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [form, setForm] = useState({
    fullName: "",
    phone: "",
    email: currentUser?.email || "",
    password: "",
    confirmPassword: "",
    existingDriver: false,
    existingCarNumber: "",
    consentSigned: false,
  });
  const [dlFile, setDlFile] = useState(null);
  const [mvrFile, setMvrFile] = useState(null);
  const [resumeFile, setResumeFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function upload(uid, prefix, file) {
    if (!file) return "";
    const fileRef = ref(storage, `driver_applications/${uid}/${prefix}_${file.name}`);
    await uploadBytes(fileRef, file);
    return getDownloadURL(fileRef);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!form.consentSigned) {
      setError("You must sign the consent checkbox to continue.");
      return;
    }
    if (!dlFile) {
      setError("Please upload your Driver's License.");
      return;
    }
    if (!form.existingDriver && !mvrFile) {
      setError("Please upload your 7-Year MVR.");
      return;
    }
    if (!currentUser) {
      if (form.password.length < 8) {
        setError("Password must be at least 8 characters.");
        return;
      }
      if (form.password !== form.confirmPassword) {
        setError("Passwords don't match.");
        return;
      }
    }

    setSubmitting(true);
    try {
      let user = currentUser;
      if (!user) {
        const cred = await createUserWithEmailAndPassword(auth, form.email.trim(), form.password);
        user = cred.user;
      }

      const [dlImageUrl, mvrDocumentUrl, resumeUrl] = await Promise.all([
        upload(user.uid, "dl", dlFile),
        upload(user.uid, "mvr", mvrFile),
        upload(user.uid, "resume", resumeFile),
      ]);

      await setDoc(doc(db, "driver_applications", user.uid), {
        uid: user.uid,
        fullName: form.fullName.trim(),
        phone: normalizePhone(form.phone),
        email: user.email || form.email.trim(),
        existingDriver: form.existingDriver,
        existingCarNumber: form.existingDriver ? form.existingCarNumber.trim() : "",
        consentSigned: true,
        status: "pending",
        dlImageUrl,
        mvrDocumentUrl,
        resumeUrl,
        timestamp: serverTimestamp(),
      });

      navigate("/driver");
    } catch (err) {
      if (err?.code === "auth/email-already-in-use") {
        setError("That email already has an account. Sign in on the Driver Sign In page first, then come back here.");
      } else if (err?.code === "auth/invalid-email") {
        setError("That email address doesn't look right.");
      } else {
        setError("Submission failed. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <BrandHeader tagline="Drive With Us" />
      <div className="px-6 py-10">
        <div className="max-w-md mx-auto">
          <h1 className="text-3xl font-display font-semibold text-slate-800 mb-2">
            Become a Driver
          </h1>
          <p className="text-slate-600 text-base mb-2">
            Create your driver login and send your paperwork. Once you're
            approved and assigned a car, you'll sign in here to get calls.
          </p>
          <p className="text-base mb-6">
            <Link to="/driver/sign-in" className="text-blue-600 font-semibold">
              Already a driver? Sign in &rarr;
            </Link>
          </p>

          {error && (
            <div className="bg-red-50 text-red-700 text-base rounded-lg p-3 mb-4">{error}</div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-base font-semibold text-slate-700 mb-1.5">Full Name</label>
              <input
                type="text"
                required
                className={inputClass}
                value={form.fullName}
                onChange={(e) => update("fullName", e.target.value)}
              />
              <p className="text-xs text-slate-400 mt-1">Must match your driver's license.</p>
            </div>

            <div>
              <label className="block text-base font-semibold text-slate-700 mb-1.5">Phone</label>
              <input
                type="tel"
                required
                className={inputClass}
                value={form.phone}
                onChange={(e) => update("phone", e.target.value)}
              />
            </div>

            <div>
              <label className="block text-base font-semibold text-slate-700 mb-1.5">
                Email <span className="text-slate-400 font-normal">(this is your login)</span>
              </label>
              <input
                type="email"
                required
                disabled={!!currentUser}
                className={`${inputClass} disabled:bg-slate-100`}
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
              />
            </div>

            {!currentUser && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-base font-semibold text-slate-700 mb-1.5">Password</label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    className={inputClass}
                    value={form.password}
                    onChange={(e) => update("password", e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-base font-semibold text-slate-700 mb-1.5">Confirm</label>
                  <input
                    type="password"
                    required
                    autoComplete="new-password"
                    className={inputClass}
                    value={form.confirmPassword}
                    onChange={(e) => update("confirmPassword", e.target.value)}
                  />
                </div>
              </div>
            )}

            <label className="flex items-start gap-3 text-base text-slate-700 border-2 border-slate-200 rounded-xl p-4">
              <input
                type="checkbox"
                className="mt-1"
                checked={form.existingDriver}
                onChange={(e) => update("existingDriver", e.target.checked)}
              />
              <span>
                <span className="font-semibold">I already drive here</span>
                <span className="block text-sm text-slate-500">
                  Setting up the app for the car you already lease.
                </span>
              </span>
            </label>
            {form.existingDriver && (
              <div>
                <label className="block text-base font-semibold text-slate-700 mb-1.5">Your Car #</label>
                <input
                  type="text"
                  inputMode="numeric"
                  className={inputClass}
                  value={form.existingCarNumber}
                  onChange={(e) => update("existingCarNumber", e.target.value)}
                  placeholder="44"
                />
              </div>
            )}

            <div>
              <label className="block text-base font-semibold text-slate-700 mb-1.5">
                Driver's License (photo or PDF)
              </label>
              <input
                type="file"
                required
                accept=".pdf,.jpg,.jpeg,.png"
                className="w-full text-base"
                onChange={(e) => setDlFile(e.target.files[0])}
              />
            </div>

            <div>
              <label className="block text-base font-semibold text-slate-700 mb-1.5">
                7-Year MVR{" "}
                {form.existingDriver && <span className="text-slate-400 font-normal">(optional — already on file)</span>}
              </label>
              <input
                type="file"
                required={!form.existingDriver}
                accept=".pdf,.jpg,.jpeg,.png"
                className="w-full text-base"
                onChange={(e) => setMvrFile(e.target.files[0])}
              />
            </div>

            <div>
              <label className="block text-base font-semibold text-slate-700 mb-1.5">
                Resume <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <input
                type="file"
                accept=".pdf,.doc,.docx"
                className="w-full text-base"
                onChange={(e) => setResumeFile(e.target.files[0])}
              />
            </div>

            <label className="flex items-start gap-3 text-base text-slate-600 pt-2">
              <input
                type="checkbox"
                className="mt-1"
                checked={form.consentSigned}
                onChange={(e) => update("consentSigned", e.target.checked)}
              />
              <span>
                I consent to a background and motor vehicle record check, and
                I certify the information provided is accurate. This serves as
                my electronic signature.
              </span>
            </label>

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-lg py-4.5 rounded-2xl shadow-md transition disabled:opacity-50"
            >
              {submitting ? "Submitting..." : "Submit Application"}
            </button>
          </form>
          <ContactFooter />
        </div>
      </div>
    </div>
  );
}
