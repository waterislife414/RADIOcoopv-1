import { useEffect, useState } from "react";
import ProfilePhoto from "../components/ProfilePhoto";
import { Link, useNavigate } from "react-router-dom";
import { doc, updateDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "../config/firebase";
import { useAuth } from "../context/AuthContext";
import BrandHeader from "../components/BrandHeader";
import CurrentRideStatus from "../components/CurrentRideStatus";
import ConfirmModal from "../components/admin/ConfirmModal";
import { SUBSCRIPTION_TIERS, HUB_NAME, PROMO_CODES } from "../config/constants";
import { memberDealsFor, DEALS, tierReward } from "../lib/memberDeals";

const money = (c) => `$${(c / 100).toFixed(2)}`;

/** Your deals: ride credit, rides to the next reward, Price Lock. Plain and short. */
function YourDeals({ profile }) {
  const d = memberDealsFor(profile);
  if (!d) return null;
  const every = d.every;
  const done = every - d.ridesToNext;
  return (
    <div className="border-2 border-emerald-500 bg-emerald-50 rounded-2xl p-5 mb-5" data-testid="your-deals">
      <h2 className="font-bold text-lg text-slate-800 mb-2">Your deals</h2>
      <p className="text-base text-slate-800" data-testid="deals-credit">
        Ride credit: <span className="font-bold">{money(d.creditCents)}</span>
        {d.creditCents > 0 ? " (comes off your next card ride)" : ""}
      </p>
      {d.rewardCents > 0 ? (
        <>
          <div className="w-full bg-white rounded-full h-3 my-2 overflow-hidden">
            <div className="bg-emerald-600 h-3 rounded-full" style={{ width: `${(done / every) * 100}%` }} />
          </div>
          <p className="text-sm text-slate-700" data-testid="deals-next">
            {d.ridesToNext} more ride{d.ridesToNext === 1 ? "" : "s"} to your next {money(d.rewardCents)} off.
          </p>
        </>
      ) : (
        <p className="text-sm text-slate-700 mt-1">
          Members get {money(tierReward("BASIC"))} off every {every}th ride.{" "}
          <Link to="/join" className="font-semibold text-blue-700 underline">See plans</Link>
        </p>
      )}
      {DEALS.priceLock && <p className="text-sm text-slate-700 mt-1">Price Lock is on: card rides never cost more than the price shown.</p>}
    </div>
  );
}

export default function Profile() {
  const {
    currentUser,
    userProfile,
    getRideCountAndPerk,
    resetPassword,
    deactivateAccount,
  } = useAuth();
  // "Verify your ID" links land on the ID section.
  useEffect(() => {
    if (window.location.hash === "#verify-id" && userProfile) document.getElementById("verify-id")?.scrollIntoView({ block: "start" });
  }, [userProfile]);
  const navigate = useNavigate();

  const [perk, setPerk] = useState(null);
  const [showDeactivate, setShowDeactivate] = useState(false);
  const [idUploading, setIdUploading] = useState(false);
  const [idUploadError, setIdUploadError] = useState("");
  const [faceUploading, setFaceUploading] = useState(false);
  const [faceUploadError, setFaceUploadError] = useState("");
  const [openPerks, setOpenPerks] = useState({});
  const [showDealsOptin, setShowDealsOptin] = useState(false);

  useEffect(() => {
    try {
      const hideUntil = localStorage.getItem("dealsOptInHideUntil");
      if (hideUntil && Date.now() < Number(hideUntil)) {
        setShowDealsOptin(false);
        return;
      }
    } catch {}
    if (userProfile && userProfile.marketingOptIn !== true) {
      setShowDealsOptin(true);
    } else {
      setShowDealsOptin(false);
    }
  }, [userProfile]);

  async function handleAcceptDeals() {
    if (!currentUser) return;
    try {
      await updateDoc(doc(db, "users", currentUser.uid), {
        marketingOptIn: true,
      });
      setShowDealsOptin(false);
    } catch {}
  }

  function handleHideDeals() {
    try {
      const future = Date.now() + 30 * 24 * 60 * 60 * 1000;
      localStorage.setItem("dealsOptInHideUntil", String(future));
    } catch {}
    setShowDealsOptin(false);
  }

  function togglePerks(tier) {
    setOpenPerks((prev) => ({ ...prev, [tier]: !prev[tier] }));
  }

  async function handleIdUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    setIdUploading(true);
    setIdUploadError("");
    try {
      const idRef = ref(storage, `id_verification/${currentUser.uid}/${file.name}`);
      await uploadBytes(idRef, file);
      const idImageUrl = await getDownloadURL(idRef);
      await updateDoc(doc(db, "users", currentUser.uid), {
        idImageUrl,
        idVerified: false,
        idSubmittedAt: new Date().toISOString(),
      });
    } catch (err) {
      setIdUploadError("Could not upload. Please try again.");
    } finally {
      setIdUploading(false);
    }
  }

  async function handleFaceUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    setFaceUploading(true);
    setFaceUploadError("");
    try {
      const faceRef = ref(storage, `id_verification/${currentUser.uid}/face-${Date.now()}`);
      await uploadBytes(faceRef, file);
      const faceImageUrl = await getDownloadURL(faceRef);
      await updateDoc(doc(db, "users", currentUser.uid), {
        faceImageUrl,
      });
    } catch (err) {
      setFaceUploadError("Could not upload. Please try again.");
    } finally {
      setFaceUploading(false);
    }
  }
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (currentUser) {
      getRideCountAndPerk(currentUser.uid).then(setPerk);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  if (!userProfile) {
    return (
      <div className="min-h-screen bg-white">
        <BrandHeader />
        <div className="px-6 py-16 text-center text-slate-500">Loading profile...</div>
      </div>
    );
  }

  const tierKey = userProfile.subscriptionTier;
  const tierInfo = tierKey ? SUBSCRIPTION_TIERS[tierKey] : null;

  async function handlePasswordReset() {
    setBusy(true);
    setStatus("");
    try {
      await resetPassword(userProfile.email);
      setStatus("Check your email for a link to reset your password.");
    } catch (err) {
      setStatus("Could not send reset email. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeactivate() {
    setShowDeactivate(false);
    await deactivateAccount();
    navigate("/");
  }

  return (
    <div className="min-h-screen bg-white">
      <BrandHeader />
      <div className="px-6 py-8">
        <div className="max-w-md mx-auto">
          {showDealsOptin && (
            <div data-testid="deals-optin" className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-5 mb-6 text-center space-y-3">
              <p className="font-bold text-lg text-slate-900">Don't miss out on what you could be saving</p>
              <p className="text-sm text-slate-700">Get the latest deals in your area by text and email.</p>
              <button
                type="button"
                data-testid="deals-yes"
                onClick={handleAcceptDeals}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-4 rounded-xl shadow transition"
              >
                Yes, send me deals
              </button>
              <div>
                <button
                  type="button"
                  data-testid="deals-no"
                  onClick={handleHideDeals}
                  className="text-xs text-slate-500 underline hover:text-slate-700 mt-1"
                >
                  Not now
                </button>
              </div>
            </div>
          )}

          <div className="bg-gradient-to-b from-navy-950 to-navy-900 bg-grain relative overflow-hidden rounded-2xl px-6 py-7 text-center mb-6">
            <p className="font-display font-bold text-2xl text-white">
              Welcome to the {HUB_NAME}, {userProfile.firstName}!
            </p>
            <p className="text-gold-300 text-sm mt-1 font-semibold tracking-wide uppercase">
              {tierInfo ? `${tierInfo.name} Member` : "Standard Account"}
            </p>
          </div>

          <CurrentRideStatus />

          {status && (
            <div className="bg-blue-50 text-blue-700 text-base rounded-lg p-3 mb-4">
              {status}
            </div>
          )}

          {/* Plan */}
          <ProfilePhoto />

          <div className="border-2 border-slate-200 rounded-2xl p-5 mb-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-lg text-slate-800">Your Plan</h2>
              <span className="text-sm font-bold uppercase text-blue-600">
                {tierInfo ? tierInfo.name : "Standard"}
              </span>
            </div>

            {/* Free Tier / Standard */}
            <div className="border border-slate-200 rounded-xl p-3">
              <div className="flex justify-between items-center cursor-pointer" onClick={() => togglePerks("free")}>
                <span className="font-semibold text-slate-800">Free Tier</span>
                <span className="text-xs text-blue-600 font-semibold">{openPerks["free"] ? "Hide perks" : "What you get"}</span>
              </div>
              {openPerks["free"] && (
                <ul className="mt-2 text-sm text-slate-600 space-y-1" data-testid="perks-free">
                  <li>&bull; Text driver updates</li>
                  <li>&bull; Seasonal and special offers</li>
                </ul>
              )}
            </div>

            {/* Basic Tier */}
            <div className="border border-slate-200 rounded-xl p-3">
              <div className="flex justify-between items-center cursor-pointer" onClick={() => togglePerks("BASIC")}>
                <span className="font-semibold text-slate-800">Basic (&mdash; ${SUBSCRIPTION_TIERS.BASIC.monthlyPrice}/mo)</span>
                <span className="text-xs text-blue-600 font-semibold">{openPerks["BASIC"] ? "Hide perks" : "What you get"}</span>
              </div>
              {openPerks["BASIC"] && (
                <ul className="mt-2 text-sm text-slate-600 space-y-1" data-testid="perks-BASIC">
                  <li>&bull; Everything in Free</li>
                  <li>&bull; See driver live on map</li>
                  <li>&bull; Driver photo and name</li>
                </ul>
              )}
            </div>

            {/* Premium Tier */}
            <div className="border border-slate-200 rounded-xl p-3">
              <div className="flex justify-between items-center cursor-pointer" onClick={() => togglePerks("PREMIUM")}>
                <span className="font-semibold text-slate-800">Premium (&mdash; ${SUBSCRIPTION_TIERS.PREMIUM.monthlyPrice}/mo)</span>
                <span className="text-xs text-blue-600 font-semibold">{openPerks["PREMIUM"] ? "Hide perks" : "What you get"}</span>
              </div>
              {openPerks["PREMIUM"] && (
                <ul className="mt-2 text-sm text-slate-600 space-y-1" data-testid="perks-PREMIUM">
                  <li>&bull; Everything in Basic</li>
                  <li>&bull; Message or call driver</li>
                  <li>&bull; 3 priority rides monthly</li>
                </ul>
              )}
            </div>

            {!tierKey && (
              <>
                <button
                  onClick={() => navigate("/subscribe/BASIC")}
                  className="w-full bg-gradient-to-b from-gold-300 to-gold-500 text-navy-950 font-bold text-base py-3.5 rounded-xl disabled:opacity-50"
                >
                  Upgrade to Basic &mdash; ${SUBSCRIPTION_TIERS.BASIC.monthlyPrice}/mo
                </button>
                <p className="text-xs text-center text-slate-500">Try the next level free</p>
              </>
            )}
            {tierKey === "BASIC" && (
              <>
                <button
                  onClick={() => navigate("/subscribe/PREMIUM")}
                  className="w-full bg-gradient-to-b from-gold-300 to-gold-500 text-navy-950 font-bold text-base py-3.5 rounded-xl disabled:opacity-50"
                >
                  Upgrade to Premium &mdash; ${SUBSCRIPTION_TIERS.PREMIUM.monthlyPrice}/mo
                </button>
                <p className="text-xs text-center text-slate-500">Try the next level free</p>
              </>
            )}
            {tierKey === "PREMIUM" && (
              <p className="text-base text-slate-500 text-center">
                You're on our top tier &mdash; thank you!
              </p>
            )}
          </div>

          {userProfile.referralCode && (
            <div className="border-2 border-emerald-500 bg-emerald-50 rounded-2xl p-5 mb-5 text-center">
              <h2 className="font-bold text-lg text-slate-800">Your Referral Code</h2>
              <p className="font-mono text-3xl font-bold tracking-widest text-emerald-700 my-2">{userProfile.referralCode}</p>
              <p className="text-sm text-slate-600">Give it to a friend. When they become a member, you get a ride credit.</p>
            </div>
          )}

          <YourDeals profile={userProfile} />

          {/* Perk tracker: hidden until checkout really takes the free entry off (branding promo.FREE_ENTRY_ACTIVE). */}
          {PROMO_CODES.FREE_ENTRY_ACTIVE && (
            <div className="border-2 border-slate-200 rounded-2xl p-5 mb-5">
              <h2 className="font-bold text-lg text-slate-800 mb-3">Ride Perks</h2>
              {perk ? (
                <>
                  <div className="w-full bg-slate-100 rounded-full h-3 mb-2 overflow-hidden">
                    <div
                      className="bg-gold-500 h-3 rounded-full transition-all"
                      style={{
                        width: `${
                          ((perk.ridesForFreeEntry - perk.ridesUntilFreePerk) /
                            perk.ridesForFreeEntry) *
                          100
                        }%`,
                      }}
                    />
                  </div>
                  <p className="text-base text-slate-600">
                    {perk.hasFreeRideNow
                      ? "You have a free ride entry available on your next trip!"
                      : `${perk.ridesUntilFreePerk} more completed ${
                          perk.ridesUntilFreePerk === 1 ? "ride" : "rides"
                        } until your next free entry.`}
                  </p>
                  <p className="text-sm text-slate-500 mt-1">
                    {perk.completedRides} completed rides total
                  </p>
                </>
              ) : (
                <p className="text-base text-slate-500">Loading...</p>
              )}
            </div>
          )}

          {/* ID check: app rides, and the birthday credit */}
          <div id="verify-id" className="border-2 border-slate-200 rounded-2xl p-5 mb-5">
            <h2 className="font-bold text-lg text-slate-800 mb-1">
              Verify your ID
            </h2>
            {userProfile.idVerified ? (
              <p className="text-base text-emerald-600 font-semibold">
                &#10003; ID verified. Your card rides go straight to a driver in the app, and you get a $5 credit on your
                birthday every year.
              </p>
            ) : userProfile.idImageUrl || userProfile.faceImageUrl ? (
              <p className="text-base text-amber-600 font-semibold">
                Pending review
              </p>
            ) : (
              <div className="space-y-4">
                <p className="text-base text-slate-600">
                  Send a photo of your driver&rsquo;s license or state ID and a face photo. Once our office checks it, your card rides go
                  straight to a driver in the app, and you get a $5 credit on your birthday.
                </p>
                <div>
                  <p className="text-sm font-semibold text-slate-700 mb-1">1. ID photo</p>
                  <input
                    type="file"
                    accept=".jpg,.jpeg,.png" aria-label="Upload ID photo"
                    onChange={handleIdUpload}
                    disabled={idUploading}
                    className="w-full text-base"
                  />
                  {idUploadError && (
                    <p className="text-sm text-red-600 mt-1">{idUploadError}</p>
                  )}
                  {idUploading && (
                    <p className="text-sm text-slate-500 mt-1">Uploading ID&hellip;</p>
                  )}
                  {userProfile.idImageUrl && (
                    <p className="text-sm text-emerald-600 mt-1">&#10003; ID photo uploaded</p>
                  )}
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-700 mb-1">2. Face photo</p>
                  <label className="inline-block cursor-pointer bg-blue-600 text-white font-semibold px-4 py-2 rounded-xl text-sm">
                    Take a face photo
                    <input
                      type="file"
                      accept="image/*"
                      capture="user"
                      hidden
                      data-testid="face-upload"
                      onChange={handleFaceUpload}
                      disabled={faceUploading}
                    />
                  </label>
                  {faceUploadError && (
                    <p className="text-sm text-red-600 mt-1">{faceUploadError}</p>
                  )}
                  {faceUploading && (
                    <p className="text-sm text-slate-500 mt-1">Uploading face photo&hellip;</p>
                  )}
                  {userProfile.faceImageUrl && (
                    <p className="text-sm text-emerald-600 mt-1">&#10003; Face photo uploaded</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Wallet */}
          <div className="border-2 border-slate-200 rounded-2xl p-5 mb-5">
            <h2 className="font-bold text-lg text-slate-800 mb-1">Wallet Balance</h2>
            <p className="text-3xl font-display font-bold text-slate-900 mb-4">
              ${(userProfile.walletBalance || 0).toFixed(2)}
            </p>
            <p className="text-sm text-slate-500">
              To add money to your wallet, call or stop by the office. Your balance can pay for rides.
            </p>
          </div>

          {/* Account settings */}
          <div className="border-2 border-slate-200 rounded-2xl p-5 mb-5 space-y-3">
            <h2 className="font-bold text-lg text-slate-800 mb-1">Account Settings</h2>
            <button
              onClick={handlePasswordReset}
              disabled={busy}
              className="w-full border-2 border-slate-300 text-slate-700 font-semibold py-3 rounded-xl disabled:opacity-50"
            >
              Send Password Reset Email
            </button>
            <button
              onClick={() => setShowDeactivate(true)}
              className="w-full text-red-600 font-semibold py-2 text-base"
            >
              Deactivate Account
            </button>
            <Link to="/delete-account" data-testid="delete-account-link" className="block text-center text-slate-500 font-semibold py-1 text-sm underline">
              Delete my account
            </Link>
          </div>
        </div>
      </div>

      {showDeactivate && (
        <ConfirmModal
          title="Deactivate your account?"
          message="You'll be signed out and won't be able to book rides until reactivated by dispatch."
          confirmLabel="Deactivate"
          danger
          onConfirm={handleDeactivate}
          onCancel={() => setShowDeactivate(false)}
        />
      )}
    </div>
  );
}
