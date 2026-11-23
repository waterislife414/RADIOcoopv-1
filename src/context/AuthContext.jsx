import { createContext, useContext, useEffect, useState } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
} from "firebase/auth";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  collection,
  query,
  where,
  getCountFromServer,
} from "firebase/firestore";
import { auth, db } from "../config/firebase";
import { SUBSCRIPTION_TIERS } from "../config/constants";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isDriver, setIsDriver] = useState(false);
  const [isShop, setIsShop] = useState(false);
  const [loading, setLoading] = useState(true);

  // Re-reads role claims from the server. Needed right after a driver is
  // approved, since the old sign-in token doesn't have the new role yet.
  async function refreshClaims() {
    const user = auth.currentUser;
    if (!user) return { admin: false, driver: false };
    const tokenResult = await user.getIdTokenResult(true);
    const claims = { admin: !!tokenResult.claims.admin, driver: !!tokenResult.claims.driver, shop: !!tokenResult.claims.shop };
    setIsAdmin(claims.admin);
    setIsDriver(claims.driver);
    setIsShop(claims.shop || claims.admin);
    return claims;
  }

  async function refreshProfile(uid) {
    const snap = await getDoc(doc(db, "users", uid));
    if (snap.exists()) {
      setUserProfile(snap.data());
    }
  }

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        const tokenResult = await user.getIdTokenResult();
        setIsAdmin(!!tokenResult.claims.admin);
        setIsDriver(!!tokenResult.claims.driver);
        setIsShop(!!tokenResult.claims.shop || !!tokenResult.claims.admin);
        await refreshProfile(user.uid);
      } else {
        setUserProfile(null);
        setIsAdmin(false);
        setIsDriver(false);
        setIsShop(false);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  async function signup({ email, password, firstName, lastName, phone, address, dob, referredBy, legal }) {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const referralCode = cred.user.uid.slice(0, 8).toUpperCase();

    await setDoc(doc(db, "users", cred.user.uid), {
      uid: cred.user.uid,
      firstName,
      lastName,
      phone,
      email,
      address,
      dob,
      subscriptionTier: null,
      walletBalance: 0,
      active: true,
      referralCode,
      referredBy: referredBy || null,
      legal: legal || null,
      marketingOptIn: !!legal?.marketingOptIn,
      createdAt: serverTimestamp(),
    });

    await refreshProfile(cred.user.uid);
    return cred.user;
  }

  /**
   * "Continue with Google": one tap for most Android riders. New Google users then
   * finish their account (phone number + agreement) on /finish-account.
   * Returns { isNew, firstName, lastName, email } or { redirecting: true }.
   */
  async function signInWithGoogle() {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    let cred;
    try {
      cred = await signInWithPopup(auth, provider);
    } catch (e) {
      // Installed apps and some phones block pop-ups: go to Google and come back.
      if (["auth/popup-blocked", "auth/operation-not-supported-in-this-environment", "auth/cancelled-popup-request"].includes(e?.code)) {
        await signInWithRedirect(auth, provider);
        return { redirecting: true };
      }
      throw e;
    }
    const snap = await getDoc(doc(db, "users", cred.user.uid));
    if (snap.exists()) {
      setUserProfile(snap.data());
      return { isNew: false };
    }
    const [firstName = "", ...rest] = String(cred.user.displayName || "").trim().split(/\s+/);
    return { isNew: true, firstName, lastName: rest.join(" "), email: cred.user.email || "" };
  }

  /** Creates the profile for someone who signed in with Google (same fields as sign-up). */
  async function finishAccount({ firstName, lastName, phone, referredBy, legal }) {
    const user = auth.currentUser;
    if (!user) throw new Error("Not signed in.");
    await setDoc(doc(db, "users", user.uid), {
      uid: user.uid,
      firstName,
      lastName,
      phone,
      email: user.email || "",
      address: "",
      dob: "",
      subscriptionTier: null,
      walletBalance: 0,
      active: true,
      referralCode: user.uid.slice(0, 8).toUpperCase(),
      referredBy: referredBy || null,
      legal: legal || null,
      marketingOptIn: !!legal?.marketingOptIn,
      signInWith: "google",
      createdAt: serverTimestamp(),
    });
    await refreshProfile(user.uid);
  }

  async function login(email, password) {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    await refreshProfile(cred.user.uid);
    return cred;
  }

  async function logout() {
    return signOut(auth);
  }

  async function resetPassword(email) {
    return sendPasswordResetEmail(auth, email);
  }

  async function updateSubscriptionTier(tierKey) {
    if (!currentUser) throw new Error("Not signed in.");
    await updateDoc(doc(db, "users", currentUser.uid), {
      subscriptionTier: tierKey,
    });
    await refreshProfile(currentUser.uid);
  }

  // Records that this rider read and accepted the current Terms + Privacy.
  async function saveLegalConsent(record) {
    if (!currentUser) return;
    // Agreeing on a booking records the terms only; the promotions choice is
    // changed only when the rider ticks that box (never un-ticked by a booking).
    await updateDoc(doc(db, "users", currentUser.uid), { legal: record, ...(record.marketingOptIn ? { marketingOptIn: true } : {}) });
    await refreshProfile(currentUser.uid);
  }

  async function deactivateAccount() {
    if (!currentUser) throw new Error("Not signed in.");
    await updateDoc(doc(db, "users", currentUser.uid), {
      active: false,
    });
    await logout();
  }

  async function getRideCountAndPerk(uid) {
    const q = query(
      collection(db, "rides"),
      where("customerId", "==", uid),
      where("status", "==", "finished")
    );
    const snap = await getCountFromServer(q);
    const completedRides = snap.data().count;
    const ridesForFreeEntry =
      SUBSCRIPTION_TIERS.BASIC.ridesForFreeEntry || 10;
    const ridesSinceLastPerk = completedRides % ridesForFreeEntry;
    const ridesUntilFreePerk = ridesForFreeEntry - ridesSinceLastPerk;
    const hasFreeRideNow =
      completedRides > 0 && completedRides % ridesForFreeEntry === 0;
    return {
      completedRides,
      ridesForFreeEntry,
      ridesUntilFreePerk: hasFreeRideNow ? 0 : ridesUntilFreePerk,
      hasFreeRideNow,
    };
  }

  // Signed in (e.g. with Google) but no rider profile yet: Home offers to finish it.
  const needsProfile = !!currentUser && !loading && !userProfile && !isAdmin && !isDriver && !isShop;

  const value = {
    signInWithGoogle,
    finishAccount,
    needsProfile,
    currentUser,
    userProfile,
    isAdmin,
    isShop,
    isDriver,
    refreshClaims,
    loading,
    signup,
    saveLegalConsent,
    refreshProfile,
    login,
    logout,
    resetPassword,
    updateSubscriptionTier,
    deactivateAccount,
    getRideCountAndPerk,
    refreshProfile: () => currentUser && refreshProfile(currentUser.uid),
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
