import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { collection, getDocs, limit, orderBy, query, where } from "firebase/firestore";
import { db } from "../config/firebase";
import { useAuth } from "../context/AuthContext";
import ConsentModal from "../components/legal/ConsentModal";
import PinPicker from "../components/PinPicker";
import { readLocationOnce } from "../utils/rideLive";
import { BRAND, COMPANY_EMAIL, COMPANY_PHONE_DISPLAY } from "../config/constants";

const RIDER_DOCS = ["rider-terms", "privacy"];
import { useRide } from "../context/RideContext";
import BrandHeader from "../components/BrandHeader";
import { recentPlaces, rememberPlaces } from "../utils/recentPlaces";
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

function looksLikeStreetAddress(s) {
  const str = String(s || "").trim();
  if (!/\d{1,6}\s+\S+/.test(str)) return false;
  const words = str.split(/\s+/);
  return words.length >= 2;
}

function RecentChips({ places, current, onPick, label }) {
  const list = places.filter((p) => p !== current);
  if (!list.length) return null;
  return (
    <div className="mt-2">
      <p className="text-sm text-slate-600 mb-1.5">{label}</p>
      <div className="flex flex-wrap gap-2">
        {list.slice(0, 4).map((p) => (
          <button key={p} type="button" onClick={() => onPick(p)} className="min-h-[44px] max-w-full truncate rounded-full border-2 border-blue-200 bg-blue-50 px-4 text-base font-semibold text-blue-800">
            &#128339; {p}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function TripDetails() {
  const { currentUser, userProfile, saveLegalConsent } = useAuth();
  // Every rider reads and agrees to the terms on every booking.
  const [askConsent, setAskConsent] = useState(false);
  const [locBlocked, setLocBlocked] = useState(null);
  const [going, setGoing] = useState(false);
  const [secondOk, setSecondOk] = useState(false);
  const [recent] = useState(recentPlaces);
  const { ride, updateRide, addStop, removeStop } = useRide();
  const navigate = useNavigate();

  const [stopInput, setStopInput] = useState("");
  const [showStops, setShowStops] = useState(ride.stops.length > 0);
  const [scheduleType, setScheduleType] = useState(ride.scheduleType);
  const sharing = ride.shareLocation !== false;
  // A Priority Day Pass bought earlier today covers this ride too.
  const laterDay = scheduleType === "later" && ride.scheduledFor && new Date(ride.scheduledFor).getTime() > (userProfile?.dayPass?.expiresAt || 0);
  const dayPass = userProfile?.dayPass?.expiresAt > Date.now() && !laterDay ? userProfile.dayPass : null;
  const premium = userProfile?.subscriptionTier === "PREMIUM";
  const [error, setError] = useState("");
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState("");
  const [pickerTarget, setPickerTarget] = useState(null); // 'pickup' | 'dropoff' | null

  // Optional: attaches the rider's GPS pin so the ride lands in the right
  // zone and the driver can navigate straight to them.
  async function shareLocation() {
    if (!navigator.geolocation) {
      setLocateError("Your phone can't share location here. Type your address instead.");
      return;
    }
    setLocating(true);
    setLocateError("");
    const getFix = (opts) => new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, opts));
    try {
      let pos;
      try {
        pos = await getFix({ enableHighAccuracy: false, maximumAge: 120000, timeout: 10000 });
      } catch (err) {
        if (err?.code === 1) throw err;
        pos = await getFix({ enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
      }
      updateRide({ pickupLat: pos.coords.latitude, pickupLng: pos.coords.longitude });
    } catch (err) {
      setLocateError(err?.code === 1 ? "Location is blocked. Turn it on in your phone settings, or type your address." : "We couldn't find you right now. Drop a pin or type your address.");
    } finally {
      setLocating(false);
    }
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

  async function handleContinue() {
    if (!ride.guestFirstName.trim() || !ride.guestLastName.trim()) {
      setError("First and last name are required.");
      return;
    }
    const hasGpsPickup = typeof ride.pickupLat === "number" && typeof ride.pickupLng === "number";
    const hasGpsDropoff = typeof ride.dropoffLat === "number" && typeof ride.dropoffLng === "number";

    const pickupValid = hasGpsPickup || looksLikeStreetAddress(ride.pickup);
    const dropoffValid = hasGpsDropoff || looksLikeStreetAddress(ride.dropoff);

    if (!pickupValid || !dropoffValid) {
      setError("Please enter a full street address or drop a pin. Not sure? Tap Use my location or Find it on Google Maps.");
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
    if (scheduleType === "later" && ride.scheduledFor && new Date(ride.scheduledFor).getTime() < Date.now() + 10 * 60000) {
      setError("Pick a time at least 10 minutes from now, or choose Ride Now.");
      return;
    }
    if (scheduleType === "later" && !ride.scheduledFor) {
      setError("Please choose a date/time for your scheduled ride.");
      return;
    }
    // One ride at a time unless they mean it (booking for someone else).
    if (currentUser && !secondOk) {
      try {
        const q = query(
          collection(db, "rides"),
          where("customerId", "==", currentUser.uid),
          where("status", "in", ["pending", "dispatched", "in_transit"]),
          orderBy("timestamp", "desc"),
          limit(1)
        );
        if (!(await getDocs(q)).empty) {
          setSecondOk(true);
          setError("You already have a ride on the way (see Home). To book another one, for someone else, tap Continue again.");
          return;
        }
      } catch {
        // Can't check right now: let them book.
      }
    }
    setAskConsent(true);
  }

  // App rides share the rider's location so the driver can find them.
  // Location turned off on purpose = a call-in ride the office dispatches.
  async function proceed(consent) {
    if (!sharing) return finish(consent, { callIn: true, bookedFrom: null });
    if (scheduleType === "later") return finish(consent, { callIn: false, bookedFrom: null });
    setGoing(true);
    const r = await readLocationOnce();
    setGoing(false);
    if (r.denied) return setLocBlocked({ consent });
    finish(consent, { callIn: false, bookedFrom: r.fix || null });
  }

  function finish(consent, extra) {
    setLocBlocked(null);
    rememberPlaces(ride.pickup, ride.dropoff);
    if (currentUser) saveLegalConsent(consent).catch(() => {});
    const pass = dayPass ? { wantsPriorityPass: true, fastPassId: dayPass.id } : {};
    updateRide({ scheduleType, consent, shareLocation: !extra.callIn, ...extra, ...pass });
    navigate(dayPass || !ride.wantsPriorityPass ? "/payment" : "/fast-pass");
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
              <label htmlFor="pickup" className="block text-base font-semibold text-slate-700 mb-1.5">
                Pickup Location
              </label>
              <input
                id="pickup"
                type="text"
                className="w-full border-2 border-slate-300 rounded-xl px-4 py-3.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                value={ride.pickup}
                onChange={(e) => updateRide({ pickup: e.target.value })}
                placeholder={COPY.pickupPlaceholder}
              />
              <div className="mt-1 flex justify-between items-center text-sm">
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ride.pickup)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="find-on-maps-pickup"
                  className="text-blue-600 font-semibold hover:underline"
                >
                  Find it on Google Maps
                </a>
                <button
                  type="button"
                  data-testid="pin-pickup"
                  onClick={() => setPickerTarget("pickup")}
                  className="text-blue-600 font-semibold hover:underline"
                >
                  Drop a pin {typeof ride.pickupLat === "number" && <span className="text-emerald-600">✓ Pin set</span>}
                </button>
              </div>
              <RecentChips places={recent} current={ride.pickup} label="Recent places" onPick={(p) => updateRide({ pickup: p })} />
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
              <label htmlFor="dropoff" className="block text-base font-semibold text-slate-700 mb-1.5">
                Drop-off Location
              </label>
              <input
                id="dropoff"
                type="text"
                className="w-full border-2 border-slate-300 rounded-xl px-4 py-3.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                value={ride.dropoff}
                onChange={(e) => updateRide({ dropoff: e.target.value })}
                placeholder={COPY.dropoffPlaceholder}
              />
              <div className="mt-1 flex justify-between items-center text-sm">
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ride.dropoff)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="find-on-maps-dropoff"
                  className="text-blue-600 font-semibold hover:underline"
                >
                  Find it on Google Maps
                </a>
                <button
                  type="button"
                  data-testid="pin-dropoff"
                  onClick={() => setPickerTarget("dropoff")}
                  className="text-blue-600 font-semibold hover:underline"
                >
                  Drop a pin {typeof ride.dropoffLat === "number" && <span className="text-emerald-600">✓ Pin set</span>}
                </button>
              </div>
              <RecentChips places={recent} current={ride.dropoff} label="Recent places" onPick={(p) => updateRide({ dropoff: p })} />
            </div>

            {/* Out of area: simple yes/no first, details only reveal after they engage */}
            <div className="border-2 border-slate-300 rounded-xl px-4 py-3.5">
              <div className="flex items-center justify-between">
                <span className="text-base font-semibold text-slate-700">
                  Is this trip outside {LOCAL_AREA_SHORT_LABEL}?
                </span>
                <button role="switch" aria-checked={!!(ride.outOfArea)} aria-label="Trip outside the local area"
                  type="button"
                  onClick={() =>
                    updateRide({
                      outOfArea: !ride.outOfArea,
                      outOfAreaCity: "",
                    })
                  }
                  className={`w-12 h-7 rounded-full transition after:absolute after:-inset-2.5 after:content-[''] ${
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
                    <label htmlFor="area-select" className="block text-sm font-semibold text-slate-600 mb-1.5">
                      Which area?
                    </label>
                    <select
                      id="area-select"
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
              <label htmlFor="passengers-select" className="block text-base font-semibold text-slate-700 mb-1.5">
                Passengers
              </label>
              <select
                id="passengers-select"
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
              <button role="switch" aria-checked={!!(showStops)} aria-label="Add stops"
                type="button"
                onClick={() => setShowStops((s) => !s)}
                className={`w-12 h-7 rounded-full transition after:absolute after:-inset-2.5 after:content-[''] ${
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
                    <span className="min-w-0 break-all">{s}</span>
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
              <button role="switch" aria-checked={!!(ride.roundTrip)} aria-label="Round trip"
                type="button"
                onClick={() => updateRide({ roundTrip: !ride.roundTrip })}
                className={`w-12 h-7 rounded-full transition after:absolute after:-inset-2.5 after:content-[''] ${
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
              <button role="switch" aria-checked={!!(ride.needsAccessibleVehicle)} aria-label="Handicap-accessible vehicle"
                type="button"
                onClick={() => updateRide({ needsAccessibleVehicle: !ride.needsAccessibleVehicle })}
                className={`w-12 h-7 rounded-full transition after:absolute after:-inset-2.5 after:content-[''] shrink-0 ${
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

{!premium && (
              <div className="flex flex-col gap-2 border-2 border-gold-400/50 bg-amber-50 rounded-xl px-4 py-5">
                <div className="flex items-center justify-between w-full">
                  <span className="text-base font-semibold text-slate-700">
                    &#9733; {BRAND.copy.dayPass.title} &mdash; {dayPass ? "active until midnight" : BRAND.copy.dayPass.price}
                  </span>
                  <button role="switch" aria-checked={!!(dayPass || ride.wantsPriorityPass)} aria-label={BRAND.copy.dayPass.title}
                    type="button"
                    disabled={!!dayPass}
                    onClick={() => updateRide({ wantsPriorityPass: !ride.wantsPriorityPass })}
                    className={`w-12 h-7 rounded-full transition after:absolute after:-inset-2.5 after:content-[''] shrink-0 ${
                      dayPass || ride.wantsPriorityPass ? "bg-gold-500" : "bg-slate-300"
                    } relative`}
                  >
                    <span
                      className={`absolute top-1 w-5 h-5 bg-white rounded-full transition ${
                        dayPass || ride.wantsPriorityPass ? "left-6" : "left-1"
                      }`}
                    />
                  </button>
                </div>
                <p className="text-2xl font-extrabold text-navy-950">Skip the line all day</p>
                <p className="text-base text-slate-700">Live driver updates</p>
                <p className="text-base text-slate-700">Access to call your driver</p>
                <p className="text-xs text-slate-500">Paid at checkout.</p>
              </div>
            )}

            <div className="flex items-center justify-between border-2 border-slate-200 rounded-xl px-4 py-3.5">
              <span className="text-base font-semibold text-slate-700">&#128205; Share my location with my driver</span>
              <button role="switch" aria-checked={sharing} aria-label="Share my location with my driver"
                type="button"
                onClick={() => updateRide({ shareLocation: !sharing })}
                className={`w-12 h-7 rounded-full transition after:absolute after:-inset-2.5 after:content-[''] shrink-0 ${
                  sharing ? "bg-blue-600" : "bg-slate-300"
                } relative`}
              >
                <span className={`absolute top-1 w-5 h-5 bg-white rounded-full transition ${sharing ? "left-6" : "left-1"}`} />
              </button>
            </div>
            {currentUser && userProfile && userProfile.idVerified !== true && (
              <p className="rounded-xl bg-amber-50 border-2 border-amber-300 px-4 py-3 text-sm text-amber-900">
                {userProfile.idImageUrl
                  ? "Your ID is waiting for our office to check it. Until then, our dispatcher sends your rides."
                  : "Your ID isn't checked yet, so our dispatcher sends this ride."}{" "}
                {!userProfile.idImageUrl && (
                  <Link to="/profile#verify-id" className="font-bold underline">
                    Verify your ID to get app rides
                  </Link>
                )}
              </p>
            )}
            <p className={`text-xs -mt-2 ${sharing ? "text-slate-500" : "text-amber-800 font-semibold"}`}>
              {sharing
                ? "Your driver sees where you are until pickup, so they can find you even if the address is off."
                : "Without your location, your ride goes to our dispatcher like a phone call."}
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

          <p className="text-xs text-slate-500 mt-6 mb-3" data-testid="address-disclaimer">
            Check your addresses before you book. You are responsible for the pickup and drop-off information you enter. If it is wrong, the company is not responsible, and the normal cancellation fee still applies. Anything about the trip is between you and your driver.
          </p>

          <button
            onClick={handleContinue}
            className="w-full mt-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-lg py-4 min-h-[56px] rounded-full shadow-luxury transition hover:-translate-y-0.5 duration-200"
            disabled={going}
          >
            {going ? "Checking your location\u2026" : "Continue to Payment"}
          </button>

          <div className="mt-4 text-center">
            {COMPANY_EMAIL.startsWith("[INSERT") ? (
              <Link to="/contact" className="text-sm font-semibold text-blue-600 hover:underline">
                Need help? Contact us
              </Link>
            ) : (
              <a href={`mailto:${COMPANY_EMAIL}`} className="text-sm font-semibold text-blue-600 hover:underline">
                Need help? Contact us
              </a>
            )}
          </div>

          {locBlocked && (
            <div className="fixed inset-0 z-[80] bg-black/60 flex items-end sm:items-center justify-center p-3" role="dialog" aria-modal="true" aria-label="Location is off">
              <div className="w-full max-w-sm rounded-3xl bg-white p-6 space-y-3 text-center">
                <p className="text-xl font-bold text-slate-800">Location is off</p>
                <p className="text-slate-600 text-sm">
                  Turn on Location for this site so your driver can find you.
                </p>
                <button type="button" onClick={() => proceed(locBlocked.consent)} className="w-full min-h-[48px] rounded-xl bg-blue-600 text-white font-bold text-base">
                  Try again
                </button>
                <button
                  type="button"
                  onClick={() => finish(locBlocked.consent, { callIn: true, bookedFrom: null })}
                  className="w-full min-h-[48px] rounded-xl border-2 border-slate-300 font-bold text-slate-700 text-base"
                >
                  Call-in ride
                </button>
              </div>
            </div>
          )}

          {pickerTarget && (
            <PinPicker
              title={pickerTarget === "pickup" ? "Pin Pickup Location" : "Pin Drop-off Location"}
              initialLat={pickerTarget === "pickup" ? ride.pickupLat : ride.dropoffLat}
              initialLng={pickerTarget === "pickup" ? ride.pickupLng : ride.dropoffLng}
              onClose={() => setPickerTarget(null)}
              onPick={({ lat, lng }) => {
                if (pickerTarget === "pickup") {
                  updateRide({
                    pickupLat: lat,
                    pickupLng: lng,
                    pickup: !ride.pickup || !looksLikeStreetAddress(ride.pickup) ? "Pin dropped" : ride.pickup,
                  });
                } else {
                  updateRide({
                    dropoffLat: lat,
                    dropoffLng: lng,
                    dropoff: !ride.dropoff || !looksLikeStreetAddress(ride.dropoff) ? "Pin dropped" : ride.dropoff,
                  });
                }
              }}
            />
          )}

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
