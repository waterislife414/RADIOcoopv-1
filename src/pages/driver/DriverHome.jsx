import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../config/firebase";
import { useAuth } from "../../context/AuthContext";
import BrandHeader from "../../components/BrandHeader";
import DriverDashboard from "../../components/driver/DriverDashboard";
import { COMPANY_PHONE_DISPLAY, COMPANY_PHONE_TEL } from "../../config/constants";

// Approved drivers get the dashboard. Everyone else sees where their
// application stands.
export default function DriverHome() {
  const { currentUser, isDriver, refreshClaims, logout } = useAuth();
  const [checking, setChecking] = useState(true);
  const [application, setApplication] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const claims = await refreshClaims();
      if (!claims.driver) {
        const snap = await getDoc(doc(db, "driver_applications", currentUser.uid)).catch(() => null);
        if (!cancelled) setApplication(snap?.exists() ? snap.data() : null);
      }
      if (!cancelled) setChecking(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.uid]);

  if (checking) {
    return (
      <div className="min-h-screen bg-navy-950 flex items-center justify-center">
        <p className="text-slate-400 text-base">Loading&hellip;</p>
      </div>
    );
  }

  if (isDriver) return <DriverDashboard />;

  let title = "No application yet";
  let body = "Fill out the driver application to get started.";
  if (application?.status === "pending") {
    title = "Application received";
    body = "The office is reviewing your paperwork. Once you're approved and assigned a car number, this page turns into your driver screen.";
  } else if (application?.status === "rejected") {
    title = "Application not approved";
    body = application.rejectReason || "Call the office if you have questions.";
  } else if (application?.status === "approved") {
    title = "Approved!";
    body = "Your driver access is being switched on. Close the app and reopen it, or sign out and back in.";
  }

  return (
    <div className="min-h-screen bg-white">
      <BrandHeader tagline="Driver" />
      <div className="px-6 py-10">
        <div className="max-w-md mx-auto text-center">
          <h1 className="text-3xl font-display font-semibold text-slate-800 mb-3">{title}</h1>
          <p className="text-slate-600 text-lg leading-relaxed mb-8">{body}</p>
          {!application && (
            <Link
              to="/become-a-driver"
              className="block w-full bg-blue-600 text-white font-bold text-lg py-4 rounded-2xl mb-4"
            >
              Become a Driver
            </Link>
          )}
          <a href={`tel:${COMPANY_PHONE_TEL}`} className="block text-blue-600 font-semibold text-lg mb-6">
            Call the office: {COMPANY_PHONE_DISPLAY}
          </a>
          <button onClick={logout} className="text-slate-400 font-semibold">
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
