import { useEffect, useState } from "react";
import ProfilePhoto from "../components/ProfilePhoto";
import { useNavigate, Link } from "react-router-dom";
import { doc, updateDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "../config/firebase";
import { useAuth } from "../context/AuthContext";
import BrandHeader from "../components/BrandHeader";
import CurrentRideStatus from "../components/CurrentRideStatus";
import ConfirmModal from "../components/admin/ConfirmModal";
import { SUBSCRIPTION_TIERS, HUB_NAME } from "../config/constants";

export default function Profile() {
  const {
    currentUser,
    userProfile,
    getRideCountAndPerk,
    resetPassword,
    deactivateAccount,
  } = useAuth();
  const navigate = useNavigate();

  const [perk, setPerk] = useState(null);
  const [showDeactivate, setShowDeactivate] = useState(false);
  const [idUploading, setIdUploading] = useState(false);
  const [idUploadError, setIdUploadError] = useState("");

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

          <div className="border-2 border-slate-200 rounded-2xl p-5 mb-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold text-lg text-slate-800">Your Plan</h2>
              <span className="text-sm font-bold uppercase text-blue-600">
                {tierInfo ? tierInfo.name : "Standard"}
              </span>
            </div>
            {!tierKey && (
              <button
                onClick={() => navigate("/subscribe/BASIC")}
                className="w-full bg-gradient-to-b from-gold-300 to-gold-500 text-navy-950 font-bold text-base py-3.5 rounded-xl disabled:opacity-50"
              >
                Upgrade to Basic &mdash; ${SUBSCRIPTION_TIERS.BASIC.monthlyPrice}/mo
              </button>
            )}
            {tierKey === "BASIC" && (
              <button
                onClick={() => navigate("/subscribe/PREMIUM")}
                className="w-full bg-gradient-to-b from-gold-300 to-gold-500 text-navy-950 font-bold text-base py-3.5 rounded-xl disabled:opacity-50"
              >
                Upgrade to Premium &mdash; ${SUBSCRIPTION_TIERS.PREMIUM.monthlyPrice}/mo
              </button>
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

          {/* Perk tracker */}
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

          {/* SMS Ride Alerts add-on */}
          <div className="border-2 border-slate-200 rounded-2xl p-5 mb-5">
            <h2 className="font-bold text-lg text-slate-800 mb-1">SMS Ride Alerts</h2>
            {["active", "trialing"].includes(userProfile.smsAddonStatus) ? (
              <p className="text-base text-emerald-600 font-semibold">
                &#10003; Active &mdash; you'll get texts when your driver is on the way.
              </p>
            ) : (
              <>
                <p className="text-base text-slate-600 mb-3">
                  Get a text the moment your driver is dispatched, in
                  addition to email. $15/mo, separate from your Basic/Premium
                  plan.
                </p>
                <Link
                  to="/subscribe/SMS_ADDON"
                  className="block w-full text-center bg-slate-800 hover:bg-slate-900 text-white font-bold py-3 rounded-xl"
                >
                  Add SMS Alerts &mdash; $15/mo
                </Link>
              </>
            )}
          </div>

          {/* ID Verification for birthday credit */}
          <div className="border-2 border-slate-200 rounded-2xl p-5 mb-5">
            <h2 className="font-bold text-lg text-slate-800 mb-1">
              Birthday Ride Credit
            </h2>
            {userProfile.idVerified ? (
              <p className="text-base text-emerald-600 font-semibold">
                &#10003; ID verified &mdash; you'll automatically get $5 wallet
                credit on your birthday every year.
              </p>
            ) : userProfile.idImageUrl ? (
              <p className="text-base text-amber-600 font-semibold">
                ID submitted &mdash; pending review. You'll get $5 wallet
                credit on your birthday once verified.
              </p>
            ) : (
              <>
                <p className="text-base text-slate-600 mb-3">
                  Upload a photo of your driver's license or state ID to
                  unlock an automatic $5 wallet credit every year on your
                  birthday. This also confirms your name matches your ID, as
                  required to ride with us.
                </p>
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png"
                  onChange={handleIdUpload}
                  disabled={idUploading}
                  className="w-full text-base"
                />
                {idUploadError && (
                  <p className="text-sm text-red-600 mt-2">{idUploadError}</p>
                )}
                {idUploading && (
                  <p className="text-sm text-slate-500 mt-2">Uploading&hellip;</p>
                )}
              </>
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
