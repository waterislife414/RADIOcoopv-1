import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { collection, getDocs, limit, orderBy, query, where, onSnapshot } from "firebase/firestore";
import { zoneForPoint } from "../../functions/lib/dispatchCore.mjs";
import { db } from "../config/firebase";
import { useAuth } from "../context/AuthContext";
import { memberDealsFor, DEALS } from "../lib/memberDeals";
import { loadStripe } from "@stripe/stripe-js";
import { submitRide, lastPayMethod, rememberedGuest } from "../lib/submitRide";
import PinPicker from "../components/PinPicker";
import AddressSearch from "../components/AddressSearch";
import { readLocationOnce } from "../utils/rideLive";
import { BRAND, COMPANY_EMAIL, COMPANY_PHONE_DISPLAY, STRIPE_PUBLISHABLE_KEY } from "../config/constants";
import { reverseGeocode } from "../lib/reverseGeocode";
import { consentIsCurrent, consentRecord } from "../legal/documents";

const RIDER_DOCS = ["rider-terms", "privacy"];
const stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY);

import { useRide } from "../context/RideContext";
import BrandHeader from "../components/BrandHeader";
import { recentPlacesFull, rememberPlaces } from "../utils/recentPlaces";
import { useTripEstimate } from "../lib/tripEstimate";
import { httpsCallable } from "firebase/functions";
import { functions } from "../config/firebase";
import { dollars } from "../../functions/lib/fareEstimate.mjs";

const mySavedCard = httpsCallable(functions, "mySavedCard");
const createPaymentIntent = httpsCallable(functions, "createPaymentIntent");
const RR = { headsUpMinutes: 4, lateCancelFee: 5, waitGraceMinutes: 2, noShowFee: 10, ...(BRAND.rideRules || {}) };
const WAIT = Number(BRAND.pricing?.fare?.WAIT_TIME_PER_MINUTE) || 0.35;
const brandName = (b) => ({ visa: "Visa", mastercard: "Mastercard", amex: "Amex", discover: "Discover" })[b] || "card";

export default function TripDetails() {
  const navigate = useNavigate();
  const { currentUser, userProfile } = useAuth();
  const { ride, updateRide, addStop, removeStop } = useRide();
  const rideRef = useRef(ride);
  rideRef.current = ride;

  const [loadingLoc, setLoadingLoc] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [card, setCard] = useState(null);
  const [savedCardLoading, setSavedCardLoading] = useState(true);
  const [guestName, setGuestName] = useState(ride.guestName || rememberedGuest().name);
  const [guestPhone, setGuestPhone] = useState(ride.guestPhone || rememberedGuest().phone);
  const [paymentMethod, setPaymentMethod] = useState(ride.paymentMethod || lastPayMethod() || "card");
  const [consentAgreed, setConsentAgreed] = useState(false);
  const [dealsAgreed, setDealsAgreed] = useState(false);
  const [showLegalModal, setShowLegalModal] = useState(false);
  const [recentPlaces, setRecentPlaces] = useState([]);

  useEffect(() => {
    setRecentPlaces(recentPlacesFull());
  }, []);

  const estimate = useTripEstimate(ride, { signedIn: !!currentUser });

  useEffect(() => {
    if (!currentUser) {
      setSavedCardLoading(false);
      return;
    }
    mySavedCard()
      .then(({ data }) => setCard(data?.hasCard ? data : null))
      .catch(() => {})
      .finally(() => setSavedCardLoading(false));
  }, [currentUser]);

  async function useCurrentLocation() {
    setLoadingLoc(true);
    setError("");
    try {
      const pos = await readLocationOnce();
      updateRide({ pickupLat: pos.coords.latitude, pickupLng: pos.coords.longitude });
      reverseGeocode(pos.coords.latitude, pos.coords.longitude).then((text) => {
        if (text && !rideRef.current.pickup) updateRide({ pickup: text });
      });
    } catch (e) {
      setError(e?.message || "Could not get your location.");
    } finally {
      setLoadingLoc(false);
    }
  }

  async function handleBook(e) {
    e.preventDefault();
    setError("");

    if (!ride.pickup) {
      setError("Please enter a pickup location.");
      return;
    }
    if (!ride.dropoff) {
      setError("Please enter a drop-off location.");
      return;
    }

    if (!currentUser) {
      if (!guestName.trim() || !guestPhone.trim()) {
        setError("Please enter your name and phone number.");
        return;
      }
    }

    if (!consentAgreed) {
      setError("Please agree to the terms to book.");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        ...ride,
        guestName: currentUser ? null : guestName.trim(),
        guestPhone: currentUser ? null : guestPhone.trim(),
        paymentMethod,
        consent: {
          agreed: true,
          timestamp: Date.now(),
          version: BRAND.policies?.legalVersion || "2026-11-23.5",
          deals: !!dealsAgreed,
        },
      };

      const result = await submitRide(payload);
      rememberPlaces(ride.pickup, ride.dropoff);
      navigate(`/ride/${result.rideId}`);
    } catch (err) {
      setError(err?.message || "Booking failed. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <BrandHeader />
      <div className="px-6 py-8 max-w-xl mx-auto">
        <h1 className="text-3xl font-display font-semibold text-slate-800 mb-6">Where to?</h1>

        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-2xl text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleBook} className="space-y-6">
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 space-y-4">
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
                  Pickup Location
                </label>
                <button
                  type="button"
                  onClick={useCurrentLocation}
                  disabled={loadingLoc}
                  className="text-xs font-semibold text-blue-700 hover:underline"
                >
                  {loadingLoc ? "Locating..." : "Use current location"}
                </button>
              </div>
              <AddressSearch
                value={ride.pickup}
                onChange={(val) => updateRide({ pickup: val, pickupLat: null, pickupLng: null })}
                onSelect={(place) =>
                  updateRide({ pickup: place.text, pickupLat: place.lat, pickupLng: place.lng })
                }
                placeholder={BRAND.copy?.pickupPlaceholder || "123 Broadway, Columbus GA"}
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                Drop-off Location
              </label>
              <AddressSearch
                value={ride.dropoff}
                onChange={(val) => updateRide({ dropoff: val, dropoffLat: null, dropoffLng: null })}
                onSelect={(place) =>
                  updateRide({ dropoff: place.text, dropoffLat: place.lat, dropoffLng: place.lng })
                }
                placeholder={BRAND.copy?.dropoffPlaceholder || "456 14th St, Phenix City AL"}
              />
            </div>

            {recentPlaces.length > 0 && (
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Recent places</p>
                <div className="flex flex-wrap gap-2">
                  {recentPlaces.map((p, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() =>
                        updateRide({
                          dropoff: p.text,
                          dropoffLat: p.lat ?? null,
                          dropoffLng: p.lng ?? null,
                        })
                      }
                      className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-xl font-medium transition"
                    >
                      {p.text}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {!currentUser && (
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 space-y-4">
              <h2 className="font-semibold text-slate-800">Your Contact Info</h2>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder="Full Name"
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-slate-800 text-base focus:outline-none focus:ring-2 focus:ring-blue-600"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Phone Number
                </label>
                <input
                  type="tel"
                  value={guestPhone}
                  onChange={(e) => setGuestPhone(e.target.value)}
                  placeholder="(706) 555-0199"
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-slate-800 text-base focus:outline-none focus:ring-2 focus:ring-blue-600"
                  required
                />
              </div>
            </div>
          )}

          {estimate && (
            <div className="bg-blue-50 border border-blue-100 rounded-3xl p-6 space-y-2">
              <div className="flex justify-between items-baseline">
                <span className="text-sm font-semibold text-blue-900">Estimated Fare</span>
                <span className="text-2xl font-bold text-blue-950">
                  {dollars(estimate.lowCents)} – {dollars(estimate.highCents)}
                </span>
              </div>
              <p className="text-xs text-blue-700">
                Estimated distance: {estimate.miles.toFixed(1)} miles. The meter sets the final fare. No surge, ever.
              </p>
            </div>
          )}

          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 space-y-4">
            <h2 className="font-semibold text-slate-800">Payment Method</h2>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setPaymentMethod("card")}
                className={`py-3 px-4 rounded-2xl font-semibold text-sm border transition ${
                  paymentMethod === "card"
                    ? "border-blue-600 bg-blue-50 text-blue-900"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                Card / App
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod("cash")}
                className={`py-3 px-4 rounded-2xl font-semibold text-sm border transition ${
                  paymentMethod === "cash"
                    ? "border-blue-600 bg-blue-50 text-blue-900"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                Cash to Driver
              </button>
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={consentAgreed}
                onChange={(e) => setConsentAgreed(e.target.checked)}
                className="mt-1 h-5 w-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                required
              />
              <span className="text-xs text-slate-600 leading-relaxed">
                When you tap below, you agree to the{" "}
                <Link to="/terms" target="_blank" className="text-blue-700 underline font-semibold">
                  Terms
                </Link>{" "}
                and{" "}
                <Link to="/privacy" target="_blank" className="text-blue-700 underline font-semibold">
                  Privacy Policy
                </Link>
                , and to calls and texts about your rides.
              </span>
            </label>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={dealsAgreed}
                onChange={(e) => setDealsAgreed(e.target.checked)}
                className="mt-1 h-5 w-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-xs text-slate-600 leading-relaxed">
                Send me local deals, ride credits, and member updates (optional).
              </span>
            </label>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full min-h-[56px] bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-2xl shadow-md transition disabled:opacity-50"
          >
            {submitting ? "Booking..." : "Agree & Book Ride"}
          </button>
        </form>
      </div>
    </div>
  );
}
