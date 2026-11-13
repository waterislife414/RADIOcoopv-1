import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { addDoc, collection, serverTimestamp, updateDoc, doc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "../config/firebase";
import BrandHeader from "../components/BrandHeader";
import ContactFooter from "../components/ContactFooter";

export default function Careers() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    fullName: "",
    phone: "",
    email: "",
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

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!form.consentSigned) {
      setError("You must sign the consent checkbox to continue.");
      return;
    }
    if (!dlFile || !mvrFile) {
      setError("Please upload both your Driver's License and 7-Year MVR.");
      return;
    }

    setSubmitting(true);
    try {
      const appRef = await addDoc(collection(db, "driver_applications"), {
        fullName: form.fullName,
        phone: form.phone,
        email: form.email,
        consentSigned: true,
        status: "pending",
        dlImageUrl: "",
        mvrDocumentUrl: "",
        resumeUrl: "",
        timestamp: serverTimestamp(),
      });

      const dlRef = ref(
        storage,
        `driver_applications/${appRef.id}/dl_${dlFile.name}`
      );
      const mvrRef = ref(
        storage,
        `driver_applications/${appRef.id}/mvr_${mvrFile.name}`
      );

      await uploadBytes(dlRef, dlFile);
      await uploadBytes(mvrRef, mvrFile);

      const dlImageUrl = await getDownloadURL(dlRef);
      const mvrDocumentUrl = await getDownloadURL(mvrRef);

      let resumeUrl = "";
      if (resumeFile) {
        const resumeRef = ref(
          storage,
          `driver_applications/${appRef.id}/resume_${resumeFile.name}`
        );
        await uploadBytes(resumeRef, resumeFile);
        resumeUrl = await getDownloadURL(resumeRef);
      }

      await updateDoc(doc(db, "driver_applications", appRef.id), {
        dlImageUrl,
        mvrDocumentUrl,
        resumeUrl,
      });

      navigate("/");
    } catch (err) {
      setError("Submission failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <BrandHeader />
      <div className="px-6 py-10">
        <div className="max-w-md mx-auto">
          <h1 className="text-3xl font-display font-semibold text-slate-800 mb-2">
            Drive With Us
          </h1>
          <p className="text-slate-600 text-base mb-6">
            Upload your information and a 7-Year Motor Vehicle Report (MVR).
            Our team will review and contact you.
          </p>

          {error && (
            <div className="bg-red-50 text-red-700 text-base rounded-lg p-3 mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-base font-semibold text-slate-700 mb-1.5">
                Full Name
              </label>
              <input
                type="text"
                required
                className="w-full border-2 border-slate-300 rounded-xl px-4 py-3.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-600"
                value={form.fullName}
                onChange={(e) => update("fullName", e.target.value)}
              />
            </div>

            <div>
              <label className="block text-base font-semibold text-slate-700 mb-1.5">
                Phone
              </label>
              <input
                type="tel"
                required
                className="w-full border-2 border-slate-300 rounded-xl px-4 py-3.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-600"
                value={form.phone}
                onChange={(e) => update("phone", e.target.value)}
              />
            </div>

            <div>
              <label className="block text-base font-semibold text-slate-700 mb-1.5">
                Email
              </label>
              <input
                type="email"
                required
                className="w-full border-2 border-slate-300 rounded-xl px-4 py-3.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-600"
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
              />
            </div>

            <div>
              <label className="block text-base font-semibold text-slate-700 mb-1.5">
                Driver's License (image or PDF)
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
                7-Year MVR (PDF)
              </label>
              <input
                type="file"
                required
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
              <p className="text-sm text-slate-400 mt-1">
                Not required to apply — upload one if you'd like to share more about your experience.
              </p>
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
