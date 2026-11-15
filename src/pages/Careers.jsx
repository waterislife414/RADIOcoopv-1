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
import ConsentModal from "../components/legal/ConsentModal";
import { SCREENING_QUESTIONS } from "../config/driverScreening";
import LegalText from "../components/legal/LegalText";
import { LEGAL_VERSION } from "../legal/documents";

const inputClass =
  "w-full border-2 border-slate-300 rounded-xl px-4 py-3.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-600";
const labelClass = "block text-base font-semibold text-slate-700 mb-1.5";

function Check({ checked, onChange, children }) {
  return (
    <label className={`flex items-start gap-3 text-base rounded-xl border-2 p-4 ${checked ? "border-emerald-500 bg-emerald-50" : "border-slate-200"}`}>
      <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-emerald-600" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="text-slate-700">{children}</span>
    </label>
  );
}

function FileField({ label, note, file, onFile, accept = ".pdf,.jpg,.jpeg,.png", required }) {
  return (
    <div>
      <label className={labelClass}>
        {label} {required ? <span className="text-red-600">*</span> : <span className="text-slate-500 font-normal">(optional)</span>}
      </label>
      <input type="file" accept={accept} aria-label={label} className="w-full text-base" onChange={(e) => onFile(e.target.files[0] || null)} />
      {file ? <p className="text-xs text-emerald-700 mt-1">&#10003; {file.name}</p> : note && <p className="text-xs text-slate-500 mt-1">{note}</p>}
    </div>
  );
}

// Come Join Our Team: page 1 is the driver's details and paperwork, page 2
// is the screening questions. Submitting opens the Driver Agreement pop-up;
// agreeing creates the login and files the application for Malcolm to review.
export default function Careers() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    fullName: "",
    phone: "",
    email: currentUser?.email || "",
    password: "",
    confirmPassword: "",
    existingDriver: false,
    existingCarNumber: "",
    dlNumber: "",
    dlState: "GA",
    backgroundConsent: false,
    truthful: false,
    contactOk: false,
  });
  const [answers, setAnswers] = useState({});
  const [explain, setExplain] = useState("");
  const [dlFile, setDlFile] = useState(null);
  const [mvrFile, setMvrFile] = useState(null);
  const [resumeFile, setResumeFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [askConsent, setAskConsent] = useState(false);
  const [error, setError] = useState("");

  const update = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  async function upload(uid, prefix, file) {
    if (!file) return "";
    const fileRef = ref(storage, `driver_applications/${uid}/${prefix}_${file.name}`);
    await uploadBytes(fileRef, file);
    return getDownloadURL(fileRef);
  }

  function pageOneProblem() {
    if (form.dlNumber.trim().length < 4) return "Enter your driver's license number.";
    if (!dlFile) return "Upload a photo or PDF of your driver's license.";
    if (!mvrFile) return "Upload your 7-year Motor Vehicle Record (MVR).";
    if (!currentUser) {
      if (form.password.length < 8) return "Password must be at least 8 characters.";
      if (form.password !== form.confirmPassword) return "Passwords don't match.";
    }
    if (!form.truthful || !form.contactOk) return "Please check both boxes at the bottom.";
    return "";
  }

  function next(e) {
    e.preventDefault();
    const problem = pageOneProblem();
    setError(problem);
    if (!problem) {
      setStep(2);
      window.scrollTo(0, 0);
    }
  }

  function authorize(e) {
    e.preventDefault();
    if (!form.backgroundConsent) {
      setError("Check the box to authorize the background check, or contact the office.");
      return;
    }
    setError("");
    setStep(3);
    window.scrollTo(0, 0);
  }

  function submit(e) {
    e.preventDefault();
    const missing = SCREENING_QUESTIONS.filter((q) => !answers[q.id]);
    if (missing.length) {
      setError(`Please answer all ${SCREENING_QUESTIONS.length} questions.`);
      return;
    }
    setError("");
    setAskConsent(true);
  }

  async function file(agreement) {
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
        dlNumber: form.dlNumber.trim().toUpperCase(),
        dlState: form.dlState.trim().toUpperCase(),
        consentSigned: true,
        attestation: { truthful: true, contactOk: true, signedAt: new Date().toISOString() },
        backgroundAuthorization: { doc: "background-check", version: LEGAL_VERSION, authorizedAt: new Date().toISOString() },
        screening: { answers, explanation: explain.trim() },
        agreement,
        status: "pending",
        dlImageUrl,
        mvrDocumentUrl,
        resumeUrl,
        timestamp: serverTimestamp(),
      });
      navigate("/driver");
    } catch (err) {
      setAskConsent(false);
      if (err?.code === "auth/email-already-in-use") {
        setError("That email already has an account. Sign in on the Driver Sign In page first, then come back here.");
        setStep(1);
      } else if (err?.code === "auth/invalid-email") {
        setError("That email address doesn't look right.");
        setStep(1);
      } else {
        setError("Submission failed. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <BrandHeader tagline="Come Join Our Team" />
      <div className="px-6 py-10">
        <div className="max-w-md mx-auto">
          <p className="text-xs font-bold tracking-[0.25em] text-blue-700 uppercase">Step {step} of 3</p>
          <h1 className="text-3xl font-display font-semibold text-slate-800 mb-2">
            {step === 1 ? "Apply to Drive" : step === 2 ? "Background Check" : "Screening Questions"}
          </h1>
          <p className="text-slate-600 text-base mb-2">
            {step === 1
              ? "Create your driver login and send your paperwork. Once you're approved and assigned a car, you'll sign in to get calls."
              : step === 2
                ? "Federal law requires this notice on its own page."
                : "Answer honestly. A “Yes” on a record question does not automatically disqualify you — the office reviews every application."}
          </p>
          {step === 1 && (
            <p className="text-base mb-6">
              <Link to="/driver/sign-in" className="text-blue-600 font-semibold">
                Already a driver? Sign in &rarr;
              </Link>
            </p>
          )}

          {error && <div className="bg-red-50 text-red-700 text-base rounded-lg p-3 my-4">{error}</div>}

          {step === 1 ? (
            <form onSubmit={next} className="space-y-4">
              <div>
                <label className={labelClass}>Full Name <span className="text-red-600">*</span></label>
                <input type="text" required className={inputClass} aria-label="Full name" value={form.fullName} onChange={(e) => update("fullName", e.target.value)} />
                <p className="text-xs text-slate-500 mt-1">Must match your driver's license.</p>
              </div>
              <div>
                <label className={labelClass}>Phone <span className="text-red-600">*</span></label>
                <input type="tel" required className={inputClass} aria-label="Phone" value={form.phone} onChange={(e) => update("phone", e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>
                  Email <span className="text-red-600">*</span> <span className="text-slate-500 font-normal">(this is your login)</span>
                </label>
                <input type="email" required disabled={!!currentUser} className={`${inputClass} disabled:bg-slate-100`} aria-label="Email" value={form.email} onChange={(e) => update("email", e.target.value)} />
              </div>
              {!currentUser && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Password</label>
                    <input type="password" required minLength={8} autoComplete="new-password" className={inputClass} aria-label="Password" value={form.password} onChange={(e) => update("password", e.target.value)} />
                  </div>
                  <div>
                    <label className={labelClass}>Confirm</label>
                    <input type="password" required autoComplete="new-password" className={inputClass} aria-label="Confirm password" value={form.confirmPassword} onChange={(e) => update("confirmPassword", e.target.value)} />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-[1fr_5.5rem] gap-3">
                <div>
                  <label className={labelClass}>Driver's License # <span className="text-red-600">*</span></label>
                  <input type="text" required autoComplete="off" className={`${inputClass} uppercase`} aria-label="Driver's license number" value={form.dlNumber} onChange={(e) => update("dlNumber", e.target.value)} />
                </div>
                <div>
                  <label className={labelClass}>State</label>
                  <input type="text" required maxLength={2} className={`${inputClass} uppercase text-center`} aria-label="License state" value={form.dlState} onChange={(e) => update("dlState", e.target.value)} />
                </div>
              </div>

              <Check checked={form.existingDriver} onChange={(v) => update("existingDriver", v)}>
                <span className="font-semibold">I already drive here</span>
                <span className="block text-sm text-slate-500">Setting up the app for the car you already lease.</span>
              </Check>
              {form.existingDriver && (
                <div>
                  <label className={labelClass}>Your Car #</label>
                  <input type="text" inputMode="numeric" className={inputClass} aria-label="Your car number" value={form.existingCarNumber} onChange={(e) => update("existingCarNumber", e.target.value)} placeholder="44" />
                </div>
              )}

              <FileField label="Driver's License (photo or PDF)" required file={dlFile} onFile={setDlFile} />
              <FileField label="7-Year MVR (Motor Vehicle Record)" required file={mvrFile} onFile={setMvrFile} note="You can order it from your state's driver services office (Georgia DDS or Alabama ALEA)." />
              <FileField label="Resume" file={resumeFile} onFile={setResumeFile} accept=".pdf,.doc,.docx" />

              <div className="pt-2 space-y-3">
                <Check checked={form.truthful} onChange={(v) => update("truthful", v)}>
                  I certify that everything in this application is true, complete and honest. I understand that false or missing information can disqualify me or end my contract.
                </Check>
                <Check checked={form.contactOk} onChange={(v) => update("contactOk", v)}>
                  I agree to be contacted by phone, text message and email about this application and the job.
                </Check>
                <p className="text-xs text-slate-500">Checking these boxes serves as my electronic signature.</p>
              </div>

              <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-lg py-4 min-h-[56px] rounded-2xl shadow-md transition">
                Next &rarr;
              </button>
            </form>
          ) : step === 2 ? (
            <form onSubmit={authorize} className="space-y-4">
              <div className="rounded-2xl border-2 border-slate-300 p-5" data-testid="fcra-disclosure">
                <LegalText docIds={["background-check"]} />
              </div>
              <Check checked={form.backgroundConsent} onChange={(v) => update("backgroundConsent", v)}>
                I have read the disclosure above and I authorize the background check.
              </Check>
              <div className="grid grid-cols-[auto_1fr] gap-3">
                <button type="button" onClick={() => { setStep(1); setError(""); }} className="px-5 rounded-2xl border-2 border-slate-300 font-bold text-slate-600">
                  &larr; Back
                </button>
                <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-lg py-4 min-h-[56px] rounded-2xl shadow-md transition">
                  Next: Screening Questions &rarr;
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              {SCREENING_QUESTIONS.map((q, i) => (
                <fieldset key={q.id} className="border-2 border-slate-200 rounded-2xl p-4">
                  <legend className="sr-only">{q.text}</legend>
                  <p className="text-base font-semibold text-slate-800 mb-3">
                    {i + 1}. {q.text}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {["yes", "no"].map((v) => (
                      <label key={v} className={`text-center rounded-xl border-2 py-3 font-bold cursor-pointer ${answers[q.id] === v ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600"}`}>
                        <input type="radio" name={q.id} value={v} className="sr-only" checked={answers[q.id] === v} onChange={() => setAnswers((a) => ({ ...a, [q.id]: v }))} />
                        {v === "yes" ? "Yes" : "No"}
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
              <div>
                <label className={labelClass}>
                  Anything you'd like us to know? <span className="text-slate-500 font-normal">(optional)</span>
                </label>
                <textarea rows={3} className={inputClass} aria-label="Anything you'd like us to know" value={explain} onChange={(e) => setExplain(e.target.value)} placeholder="If you answered Yes to a record question, you can explain here." />
              </div>
              <div className="grid grid-cols-[auto_1fr] gap-3">
                <button type="button" onClick={() => { setStep(2); setError(""); }} className="px-5 rounded-2xl border-2 border-slate-300 font-bold text-slate-600">
                  &larr; Back
                </button>
                <button type="submit" disabled={submitting} className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-lg py-4 min-h-[56px] rounded-2xl shadow-md transition disabled:opacity-50">
                  {submitting ? "Submitting..." : "Review Agreement & Submit"}
                </button>
              </div>
            </form>
          )}

          <ConsentModal
            open={askConsent}
            docIds={["driver-agreement", "privacy"]}
            busy={submitting}
            confirmLabel="Agree & Submit Application"
            contactLabel="I agree to be contacted by phone call, text message and email about this application and the job."
            promoLabel="Yes, send me company offers and news by text and email."
            onClose={() => setAskConsent(false)}
            onAccept={file}
          />
          <ContactFooter />
        </div>
      </div>
    </div>
  );
}
