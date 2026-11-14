import { Link } from "react-router-dom";
import BrandHeader from "../components/BrandHeader";
import ContactFooter from "../components/ContactFooter";
import LegalText from "../components/legal/LegalText";

const OTHERS = [
  ["/terms", "Terms of Service", "rider-terms"],
  ["/privacy", "Privacy Policy", "privacy"],
  ["/driver-agreement", "Driver Agreement", "driver-agreement"],
];

/** One legal document as a page, with links to the others. */
export default function LegalPage({ docId }) {
  return (
    <div className="min-h-screen bg-white">
      <BrandHeader />
      <div className="px-6 py-10">
        <div className="max-w-2xl mx-auto">
          <LegalText docIds={[docId]} />
          <div className="mt-8 pt-6 border-t border-slate-200 flex flex-wrap gap-x-5 gap-y-2 text-base">
            {OTHERS.filter(([, , id]) => id !== docId).map(([to, label]) => (
              <Link key={to} to={to} className="font-semibold text-blue-700 underline">
                {label}
              </Link>
            ))}
            <Link to="/" className="font-semibold text-slate-600">
              &larr; Back to Home
            </Link>
          </div>
        </div>
      </div>
      <ContactFooter />
    </div>
  );
}
