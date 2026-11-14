import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import ConsentModal from "../components/legal/ConsentModal";
import { consentIsCurrent } from "../legal/documents";

const RIDER_DOCS = ["rider-terms", "privacy"];
import { useRide } from "../context/RideContext";
import BrandHeader from "../components/BrandHeader";
import {
  SURROUNDING_SERVICE_CITIES,
  OUT_OF_AREA_MINIMUM_FARE,
  OUT_OF_AREA_ENTRY_FEE,
  FARE_CONFIG,
  COPY,
  LOCAL_AREA_SHORT_LABEL,
} from "../config/constants";

const includedMiles = Math.floor(
  (OUT_OF_AREA_MINIMUM_FARE - OUT_OF_AREA_ENTRY_FEE) / FARE_CONFIG.PER_MILE
);

export default function TripDetails() {
  const { currentUser, userProfile, saveLegalConsent } = useAuth();
  // Guests agree on every booking. Signed-in riders agree once per version.
  const alreadyAgreed = !!currentUser && consentIsCurrent(userProfile?.legal, RIDER_DOCS);
  const [askConsent, setAskConsent] = useState(false);
  const { ride, updateRide, addStop, removeStop } = useRide();
  const navigate = useNavigate();

  const [stopInput, setStopInput] = useState("");
  const [showStops, setShowStops] = useState(ride.stops.length > 0);
  const [scheduleType, setScheduleType] = useState(ride.scheduleType);
  const [error, setError] = useState("");
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState("");

  // Optional: attaches the rider's GPS pin so the ride lands in the right
  // zone and the driver can navigate straight to them.
  function shareLocation() {
    if (!navigator.geolocation) {
      setLocateError("Your phone can't share location here. Type your address instead.");
      return;
    }
    setLocating(true);
    setLocateError("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        updateRide({ pickupLat: pos.coords.latitude, pickupLng: pos.coords.longitude });
        setLocating(false);
      },
      () => {
        setLocateError("Couldn't get your location. Type your address instead.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }

  useEffect(() => {
    if (!currentUser || !userProfile) return;
    const updates = {};
    if (userProfile.phone && !ride.phone) updates.phone = userProfile.phone;
    if (userProfile.firstName && !ride.guestFirstName)
      updates.guestFirstName = userProfile.firstName;
    if (userProfile.lastName && !ride.guestLastName)
      updates.guestLastName = userProfile.lastName;
    if (Object.keys(updates).length > 0) updateRide(updates);
    // Only re-run when the signed-in identity itself changes, not when the
    // ride fields we're about to set change — otherwise this effect updates
    // its own dependencies and loops forever, freezing the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, userProfile]);

  function handleAddStop() {
    if (stopInput.trim()) {
      addStop(stopInput.trim());
      setStopInput("");
    }
  }

  function handleContinue() {
    if (!ride.guestFirstName.trim() || !ride.guestLastName.trim()) {
      setError("First and last name are required.");
      return;
    }
    if (!ride.pickup.trim() || !ride.dropoff.trim()) {
      setError("Pickup and drop-off are required.");
      return;
    }
    if (ride.outOfArea && !ride.outOfAreaCity) {
      setError("Please select which area you're headed to.");
      return;
    }
    if (!ride.phone || ride.phone.replace(/\D/g, "").length < 10) {
      setError("A valid phone number is required so dispatch can reach you.");
      return;
    }
    if (scheduleType === "later" && !ride.scheduledFor) {
      setError("Please choose a date/time for your scheduled ride.");
      return;
    }
    if (!alreadyAgreed) {
      setAskConsent(true);
      return;
    }
    proceed(userProfile.legal);
  }

  function proceed(consent) {
    if (!alreadyAgreed && currentUser) saveLegalConsent(consent).catch(() => {});
    updateRide({ scheduleType, consent });
    navigate(ride.wantsPriorityPass ? "/fast-pass" : "/payment");
  }

  return (
    <div className="min-h-screen bg-white">
      <BrandHeader />
      <div className="px-6 py-8">
        <div className="max-w-md mx-auto">
          <h1 className="text-3xl font-display font-semibold text-slate-800 mb-6">
            Trip Details
          </h1>

          {error && (
            <div className="bg-red-50 text-red-700 text-base rounded-lg p-3 mb-4">
              {error}
            </div>
          )}

          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-base font-semibold text-slate-700 mb-1.5">
                  First Name
                </label>
                <input
                  type="text"
                  className="w-full border-2 border-slate-300 rounded-xl px-4 py-3.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                  value={ride.guestFirstName}
                  onChange={(e) => updateRide({ guestFirstName: e.target.value })}
                  placeholder="Jane"
                />
              </div>
              <div>
                <label className="block text-base font-semibold text-slate-700 mb-1.5">
                  Last Name
                </label>
                <input
                  type="text"
                  className="w-full border-2 border-slate-300 rounded-xl px-4 py-3.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                  value={ride.guestLastName}
                  onChange={(e) => updateRide({ guestLastName: e.target.value })}
                  placeholder="Doe"
                />
              </div>
            </div>

            <div>
              <label className="block text-base font-semibold text-slate-700 mb-1.5">
                Pickup Location
              </label>
              <input
                type="text"
                className="w-full border-2 border-slate-300 rounded-xl px-4 py-3.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                value={ride.pickup}
                onChange={(e) => updateRide({ pickup: e.target.value })}
                placeholder={COPY.pickupPlaceholder}
              />
              <button
                type="button"
                onClick={shareLocation}
                disabled={locating}
                className={`mt-2 w-full rounded-xl py-2.5 text-base font-semibold border-2 transition ${
                  typeof ride.pickupLat === "number"
                    ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                    : "border-slate-300 text-slate-700"
                }`}
              >
                {typeof ride.pickupLat === "number"
                  ? "✓ Your location is attached — drivers find you faster"
                  : locating
                    ? "Finding you…"
                    : "\u{1F4CD} Share my location with the driver"}
              </button>
              {locateError && <p className="text-sm text-red-600 mt-1">{locateError}</p>}
            </div>

            <div>
              <label className="block text-base font-semibold text-slate-700 mb-1.5">
                Drop-off Location
              </label>
              <input
                type="text"
                className="w-full border-2 border-slate-300 rounded-xl px-4 py-3.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                value={ride.dropoff}
                onChange={(e) => updateRide({ dropoff: e.target.value })}
                placeholder={COPY.dropoffPlaceholder}
              />
            </div>

            {/* Out of area: simple yes/no first, details only reveal after they engage */}
            <div className="border-2 border-slate-300 rounded-xl px-4 py-3.5">
              <div className="flex items-center justify-between">
                <span className="text-base font-semibold text-slate-700">
                  Is this trip outside {LOCAL_AREA_SHORT_LABEL}?
                </span>
                <button
                  type="button"
                  onClick={() =>
                    updateRide({
                      outOfArea: !ride.outOfArea,
                      outOfAreaCity: "",
                    })
                  }
                  className={`w-12 h-7 rounded-full transition ${
                    ride.outOfArea ? "bg-amber-500" : "bg-slate-300"
                  } relative shrink-0`}
                >
                  <span
                    className={`absolute top-1 w-5 h-5 bg-white rounded-full transition ${
                      ride.outOfArea ? "left-6" : "left-1"
                    }`}
                  />
                </button>
              </div>

              {ride.outOfArea && (
                <div className="mt-4 pt-4 border-t border-slate-200 space-y-3">
                  <div>
                    <label className="block text-sm font-semibold text-slate-600 mb-1.5">
                      Which area?
                    </label>
                    <select
                      className="w-full border-2 border-slate-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-600"
                      value={ride.outOfAreaCity}
                      onChange={(e) => updateRide({ outOfAreaCity: e.target.value })}
                    >
                      <option value="">Select an area&hellip;</option>
                      {SURROUNDING_SERVICE_CITIES.map((city) => (
                        <option key={city} value={city}>
                          {city}
                        </option>
                      ))}
                    </select>
                  </div>

                  {ride.outOfAreaCity && (
                    <div className="bg-amber-50 border border-amber-300 rounded-xl p-3.5">
                      <p className="text-sm text-slate-700 leading-relaxed">
                        Trips to {ride.outOfAreaCity} start with a $
                        {OUT_OF_AREA_ENTRY_FEE.toFixed(2)} entry fee, and the
                        meter runs as normal from there. There's a $
                        {OUT_OF_AREA_MINIMUM_FARE.toFixed(0)} minimum fare
                        &mdash; that typically covers about {includedMiles}{" "}
                        miles before the meter adds more.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="block text-base font-semibold text-slate-700 mb-1.5">
                Phone Number
              </label>
              <input
                type="tel"
                required
                className="w-full border-2 border-slate-300 rounded-xl px-4 py-3.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                value={ride.phone}
                onChange={(e) => updateRide({ phone: e.target.value })}
                placeholder="(706) 555-0100"
              />
              <p className="text-sm text-slate-500 mt-1.5">
                Dispatch will text or call this number about your ride.
              </p>
            </div>

            <div>
              <label className="block text-base font-semibold text-slate-700 mb-1.5">
                Passengers
              </label>
              <select
                className="w-full border-2 border-slate-300 rounded-xl px-4 py-3.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                value={ride.passengers}
                onChange={(e) => updateRide({ passengers: parseInt(e.target.value, 10) })}
              >
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    {n} {n === 1 ? "Passenger" : "Passengers"}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-between border-2 border-slate-300 rounded-xl px-4 py-3.5">
              <span className="text-base font-semibold text-slate-700">
                Add Stops (Flexible)
              </span>
              <button
                type="button"
                onClick={() => setShowStops((s) => !s)}
                className={`w-12 h-7 rounded-full transition ${
                  showStops ? "bg-blue-600" : "bg-slate-300"
                } relative`}
              >
                <span
                  className={`absolute top-1 w-5 h-5 bg-white rounded-full transition ${
                    showStops ? "left-6" : "left-1"
                  }`}
                />
              </button>
            </div>

            {showStops && (
              <div className="pl-2 space-y-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    className="flex-1 border-2 border-slate-300 rounded-xl px-4 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-600"
                    placeholder="Suggested stop address"
                    value={stopInput}
                    onChange={(e) => setStopInput(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={handleAddStop}
                    className="bg-slate-300 hover:bg-slate-400 px-4 rounded-xl text-slate-800 font-semibold"
                  >
                    Add
                  </button>
                </div>
                {ride.stops.map((s, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between bg-slate-100 rounded-lg px-3 py-2 text-base"
                  >
                    <span>{s}</span>
                    <button
                      type="button"
                      onClick={() => removeStop(i)}
                      className="text-red-500 font-semibold"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between border-2 border-slate-300 rounded-xl px-4 py-3.5">
              <span className="text-base font-semibold text-slate-700">Round Trip</span>
              <button
                type="button"
                onClick={() => updateRide({ roundTrip: !ride.roundTrip })}
                className={`w-12 h-7 rounded-full transition ${
                  ride.roundTrip ? "bg-blue-600" : "bg-slate-300"
                } relative`}
              >
                <span
                  className={`absolute top-1 w-5 h-5 bg-white rounded-full transition ${
                    ride.roundTrip ? "left-6" : "left-1"
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between border-2 border-slate-300 rounded-xl px-4 py-3.5">
              <span className="text-base font-semibold text-slate-700 flex items-center gap-2">
                <span aria-hidden="true">&#9855;</span> Need a Handicap-Accessible Vehicle?
              </span>
              <button
                type="button"
                onClick={() => updateRide({ needsAccessibleVehicle: !ride.needsAccessibleVehicle })}
                className={`w-12 h-7 rounded-full transition shrink-0 ${
                  ride.needsAccessibleVehicle ? "bg-blue-600" : "bg-slate-300"
                } relative`}
              >
                <span
                  className={`absolute top-1 w-5 h-5 bg-white rounded-full transition ${
                    ride.needsAccessibleVehicle ? "left-6" : "left-1"
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between border-2 border-gold-400/50 bg-gold-50 rounded-xl px-4 py-3.5">
              <span className="text-base font-semibold text-slate-700">
                &#9733; VIP for a Day &mdash; $5 Fast Pass
              </span>
              <button
                type="button"
                onClick={() => updateRide({ wantsPriorityPass: !ride.wantsPriorityPass })}
                className={`w-12 h-7 rounded-full transition shrink-0 ${
                  ride.wantsPriorityPass ? "bg-gold-500" : "bg-slate-300"
                } relative`}
              >
                <span
                  className={`absolute top-1 w-5 h-5 bg-white rounded-full transition ${
                    ride.wantsPriorityPass ? "left-6" : "left-1"
                  }`}
                />
              </button>
            </div>
            <p className="text-xs text-slate-400 -mt-2">
              Moves you up the dispatcher's queue for this ride. The $5 is
              paid on its own before checkout. (Premium members still dispatch first.)
            </p>

            {currentUser && (
              <div className="border-2 border-slate-300 rounded-xl p-4 space-y-3">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setScheduleType("now")}
                    className={`flex-1 py-3 rounded-xl font-semibold text-base ${
                      scheduleType === "now"
                        ? "bg-blue-600 text-white"
                        : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    Ride Now
                  </button>
                  <button
                    type="button"
                    onClick={() => setScheduleType("later")}
                    className={`flex-1 py-3 rounded-xl font-semibold text-base ${
                      scheduleType === "later"
                        ? "bg-blue-600 text-white"
                        : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    Schedule Later
                  </button>
                </div>

                {scheduleType === "later" && (
                  <div className="space-y-3 pt-2">
                    <input
                      type="datetime-local"
                      className="w-full border-2 border-slate-300 rounded-xl px-4 py-3.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-600"
                      value={ride.scheduledFor || ""}
                      onChange={(e) => updateRide({ scheduledFor: e.target.value })}
                    />
                    <label className="flex items-center gap-2 text-base text-slate-600">
                      <input
                        type="checkbox"
                        checked={ride.recurring}
                        onChange={(e) => updateRide({ recurring: e.target.checked })}
                      />
                      Make this a recurring ride
                    </label>
                  </div>
                )}
              </div>
            )}
          </div>

          <button
            onClick={handleContinue}
            className="w-full mt-8 bg-blue-600 hover:bg-blue-700 text-white font-bold text-lg py-4.5 rounded-full shadow-luxury transition hover:-translate-y-0.5 duration-200"
          >
            Continue to Payment
          </button>
          <ConsentModal
            open={askConsent}
            docIds={RIDER_DOCS}
            confirmLabel="Agree & Continue"
            onClose={() => setAskConsent(false)}
            onAccept={(record) => {
              setAskConsent(false);
              proceed(record);
            }}
          />
        </div>
      </div>
    </div>
  );
}
