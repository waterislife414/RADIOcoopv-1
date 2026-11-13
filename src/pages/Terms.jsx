import { Link } from "react-router-dom";
import BrandHeader from "../components/BrandHeader";
import ContactFooter from "../components/ContactFooter";
import { COMPANY_NAME } from "../config/constants";

export default function Terms() {
  return (
    <div className="min-h-screen bg-white">
      <BrandHeader />
      <div className="px-6 py-10">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-3xl font-display font-semibold text-slate-800 mb-6">
            Terms of Service &amp; Privacy Policy
          </h1>

          <section className="mb-8">
            <h2 className="text-xl font-bold text-slate-800 mb-2">
              Terms of Service
            </h2>
            <p className="text-slate-600 text-base leading-relaxed mb-3">
              By requesting a ride through {COMPANY_NAME}, you agree to pay the
              final fare determined by the cab meter or dispatcher-confirmed
              amount at the conclusion of your trip.
            </p>
            <p className="text-slate-600 text-base leading-relaxed mb-3 font-semibold">
              All rides are non-refundable. Once a ride has been dispatched or
              completed, no refund will be issued for the fare, any
              subscription charge, or any add-on fee.
            </p>
            <p className="text-slate-600 text-base leading-relaxed mb-3 font-semibold">
              Fare evasion, including refusal to pay, fraudulent payment
              methods, or fleeing without payment, will be prosecuted to the
              fullest extent permitted by law, including filing in small claims
              court. Under Georgia law (O.C.G.A. &sect; 16-8-5), obtaining
              transportation services without paying may constitute theft of
              services, and unresolved non-payment may be reported to local
              law enforcement and prosecuted under that statute.{" "}
              {COMPANY_NAME} reserves the right to pursue all available
              legal remedies to recover unpaid fares, associated fees, court
              costs, and reasonable attorney's fees.
            </p>
            <p className="text-slate-600 text-base leading-relaxed">
              Riders flagged for non-payment may be barred from future service
              at {COMPANY_NAME}'s sole discretion.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-800 mb-2">
              Privacy Policy
            </h2>
            <p className="text-slate-600 text-base leading-relaxed mb-3">
              For every ride request &mdash; including guest requests &mdash;
              we collect and temporarily retain your phone number, IP
              address, and pickup/drop-off location data.
            </p>
            <p className="text-slate-600 text-base leading-relaxed mb-3">
              This information is retained for 5 days for security and fraud
              -prevention purposes, after which unflagged guest ride records
              are automatically purged from our systems. Data associated with
              an account, an active flag, or an open legal matter is retained
              longer as necessary.
            </p>
            <p className="text-slate-600 text-base leading-relaxed">
              We do not sell your personal information to third parties.
            </p>
          </section>

          <Link to="/" className="inline-block mt-8 text-blue-600 text-base font-semibold">
            &larr; Back to Home
          </Link>
          <ContactFooter />
        </div>
      </div>
    </div>
  );
}
