import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useRide } from "../context/RideContext";
import BrandHeader from "../components/BrandHeader";
import CurrentRideStatus from "../components/CurrentRideStatus";
import LineStatus from "../components/LineStatus";
import {
  COMPANY_PHONE_DISPLAY,
  COMPANY_PHONE_TEL,
  COMPANY_EMAIL,
  GOOGLE_REVIEW_LINK,
} from "../config/constants";

import { calcFareRange, calcSavings } from "../config/fareCalc";
import { estimateFromMiles } from "../lib/tripEstimate";
import { dollars } from "../../functions/lib/fareEstimate.mjs";

function calcEstimate(ride, miles) {
  const { low, high } = calcFareRange(ride, miles);
  return { low: low.toFixed(2), high: high.toFixed(2) };
}

// Settings not filled in yet (like "[INSERT_EMAIL]") are hidden, not shown as broken links.
const isPlaceholder = (v) => !v || String(v).startsWith("[INSERT");

export default function Success() {
  const { currentUser, userProfile } = useAuth();
  const { ride: bookedRide, resetRide } = useRide();
  // Keep this ride's details for this page, then clear the booking so the next
  // one starts fresh (new agreement for guests, no leftover Fast Pass or addresses).
  const [ride] = useState(bookedRide);
  // Guests have no account to look their ride up by: keep its id for this visit
  // (for "you're 3rd in line" and the Day Pass offer after paying for it).
  const [guestRideId] = useState(() => {
    try {
      if (bookedRide.lastRideId) sessionStorage.setItem("rc-last-ride", bookedRide.lastRideId);
      return bookedRide.lastRideId || sessionStorage.getItem("rc-last-ride");
    } catch {
      return bookedRide.lastRideId || null;
    }
  });
  useEffect(() => {
    resetRide();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Priced on the booking screen: show the same number here, no typing.
  const est = estimateFromMiles(ride.estMiles, ride, { signedIn: !!currentUser });
  const estSavings = est && !ride.roundTrip ? calcSavings(est.miles, ride.passengers) : null;
  const [milesInput, setMilesInput] = useState("");
  const [estimate, setEstimate] = useState(null);
  const [savings, setSavings] = useState(null);

  function handleEstimate() {
    const miles = parseFloat(milesInput) || 0;
    setEstimate(calcEstimate(ride, miles));
    setSavings(ride.outOfArea ? null : calcSavings(miles, ride.passengers));
  }

  return (
    <div className="min-h-screen bg-white">
      <BrandHeader />
      <div className="px-6 py-10 flex flex-col items-center justify-center text-center">
        <div className="max-w-md w-full">
          <div className="text-6xl mb-4">&#9989;</div>
          <h1 className="text-3xl font-display font-semibold text-slate-800 mb-2">Ride requested!</h1>
          <p className="text-slate-500 text-base mb-6">
            {/* Same tests the server uses to decide app vs. radio dispatch. */}
            {!currentUser || ride.paymentMethod === "cash" || ride.callIn || userProfile?.idVerified !== true
              ? "Our dispatcher will send your car and may call you."
              : "The app is finding your driver now."}
          </p>

          {est && (
            <div data-testid="success-price" className="border-2 border-emerald-500 bg-emerald-50 rounded-2xl p-5 text-left mb-6">
              <p className="text-sm font-bold uppercase tracking-wider text-emerald-800">Your price</p>
              <p className="text-3xl font-extrabold text-slate-900">About {dollars(ride.paymentMethod === "card" ? est.totalCents : est.fareCents)}</p>
              <p className="text-sm text-slate-600 mt-1">
                {ride.paymentMethod === "card" ? "Same price as cash. At drop-off, tap Pay on your driver's phone. " : ""}The meter sets the final fare. No surge, ever.
              </p>
              {estSavings && estSavings.savings > 0 && (
                <p className="text-sm font-semibold text-emerald-700 mt-1.5">
                  About {dollars(Math.round(estSavings.savings * 100))} less than the national Uber/Lyft average.{" "}
                  <Link to="/compare" className="underline">How we figure it</Link>
                </p>
              )}
            </div>
          )}

          {currentUser && <CurrentRideStatus />}
          {!currentUser && guestRideId && (
            <div className="mb-4">
              <LineStatus
                rideId={guestRideId}
                onDone={() => {
                  try {
                    sessionStorage.removeItem("rc-last-ride");
                  } catch {
                    // Nothing stored.
                  }
                }}
              />
            </div>
          )}
          {!currentUser && (
            <a
              href={`tel:${COMPANY_PHONE_TEL}`}
              className="block text-center min-h-[52px] leading-[52px] rounded-2xl border-2 border-blue-300 bg-blue-50 text-blue-700 font-bold text-lg mb-6"
            >
              &#9742; Need to change or cancel? Call {COMPANY_PHONE_DISPLAY}
            </a>
          )}

          <div className="grid grid-cols-1 gap-3.5 mb-8">
            <a
              href={`tel:${COMPANY_PHONE_TEL}`}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-lg py-4 min-h-[56px] rounded-full shadow-md transition"
            >
              Call Office
            </a>
            {!isPlaceholder(COMPANY_EMAIL) && (
              <a
                href={`mailto:${COMPANY_EMAIL}`}
                className="bg-slate-300 hover:bg-slate-400 text-slate-800 font-bold text-lg py-4 min-h-[56px] rounded-full shadow-md transition"
              >
                Email Us
              </a>
            )}
            {!isPlaceholder(GOOGLE_REVIEW_LINK) && (
              <a
                href={GOOGLE_REVIEW_LINK}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-lg py-4 min-h-[56px] rounded-full transition"
              >
                Leave a Google Review
              </a>
            )}
          </div>

          {!est && (
          <div className="border-2 border-slate-300 rounded-2xl p-5 text-left">
              <p className="text-base font-semibold text-slate-700 mb-2">
                Want a rough price?
              </p>
              <a
                href={`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(ride.pickup || "")}&destination=${encodeURIComponent(ride.dropoff || "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-center text-sm font-semibold text-blue-600 mb-3"
              >
                Look up the real distance on Google Maps &rarr;
              </a>
              <div className="flex gap-2 mb-3">
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  placeholder="Estimated miles"
                  value={milesInput}
                  onChange={(e) => setMilesInput(e.target.value)}
                  className="flex-1 border-2 border-slate-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
                <button
                  onClick={handleEstimate}
                  className="bg-slate-800 hover:bg-slate-900 text-white font-bold text-base px-6 rounded-xl"
                >
                  Go
                </button>
              </div>
  
              {estimate && (
                <div className="text-center mb-3">
                  <p className="text-3xl font-bold text-slate-800">
                    ${estimate.low} - ${estimate.high}
                  </p>
                  {savings && savings.savings > 0 && (
                    <p className="text-sm font-semibold text-emerald-600 mt-1.5">
                      That's about ${savings.savings.toFixed(2)} ({savings.percent.toFixed(0)}%)
                      less than the national Uber/Lyft average.{" "}
                      <Link to="/compare" className="underline">See how we calculate this</Link>
                    </p>
                  )}
                </div>
              )}
  
              <p className="text-sm text-slate-500 text-center">
                Rough estimate only. Final price determined by cab meter.
              </p>
            </div>
          )}


          <Link
            to="/"
            onClick={resetRide}
            className="inline-block mt-8 text-blue-600 text-base font-semibold"
          >
            &larr; Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
