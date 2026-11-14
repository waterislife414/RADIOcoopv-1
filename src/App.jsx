import { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { RideProvider } from "./context/RideContext";
import { RequireAdmin, RequireAuth, RequireDriverSignIn } from "./components/ProtectedRoute";

import About from "./pages/About";
import DriverAgreement from "./pages/DriverAgreement";
import AdStrip from "./components/AdStrip";
import SiteMenu from "./components/SiteMenu";
import Home from "./pages/Home";
import Careers from "./pages/Careers";
import Terms from "./pages/Terms";
import Privacy from "./pages/Privacy";
import Contact from "./pages/Contact";
import TripDetails from "./pages/TripDetails";
import Help from "./pages/Help";
import Promotions from "./pages/Promotions";
import FastPass from "./pages/FastPass";
import PaymentSelection from "./pages/PaymentSelection";
import Success from "./pages/Success";
import SignIn from "./pages/SignIn";
import SignUp from "./pages/SignUp";
import QRCode from "./pages/QRCode";
import NotFound from "./pages/NotFound";
import Profile from "./pages/Profile";
import SubscriptionCheckout from "./pages/SubscriptionCheckout";
import ChoosePlan from "./pages/ChoosePlan";
import CompareRideshare from "./pages/CompareRideshare";
import PostSignupUpsell from "./pages/PostSignupUpsell";

// Dispatcher/admin code is only downloaded when someone actually navigates
// there, so a customer booking a ride on their phone never fetches it.
const AdminLogin = lazy(() => import("./pages/admin/AdminLogin"));
const DispatcherDashboard = lazy(() => import("./pages/admin/DispatcherDashboard"));
const VehicleInspection = lazy(() => import("./pages/driver/VehicleInspection"));
const ShopBoard = lazy(() => import("./pages/ShopBoard"));
const DriversAdmin = lazy(() => import("./pages/admin/DriversAdmin"));
const ZoneEditor = lazy(() => import("./pages/admin/ZoneEditor"));
const DriverProfile = lazy(() => import("./pages/driver/DriverProfile"));
const LiveMap = lazy(() => import("./pages/admin/LiveMap"));
const LeaseAdmin = lazy(() => import("./pages/admin/LeaseAdmin"));
const PayoutStatement = lazy(() => import("./pages/admin/PayoutStatement"));
// Driver screens load only for drivers, same as the dispatcher terminal.
const DriverSignIn = lazy(() => import("./pages/driver/DriverSignIn"));
const DriverHome = lazy(() => import("./pages/driver/DriverHome"));

function AdminLoadingFallback() {
  return (
    <div className="min-h-screen bg-navy-950 flex items-center justify-center">
      <p className="text-slate-500 text-base">Loading...</p>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <RideProvider>
        <BrowserRouter>
          <AdStrip position="top" />
          <SiteMenu />
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/about" element={<About />} />
            <Route
              path="/driver/profile"
              element={
                <Suspense fallback={<AdminLoadingFallback />}>
                  <DriverProfile />
                </Suspense>
              }
            />
            <Route
              path="/driver/inspection"
              element={
                <Suspense fallback={<AdminLoadingFallback />}>
                  <VehicleInspection />
                </Suspense>
              }
            />
            <Route
              path="/shop"
              element={
                <Suspense fallback={<AdminLoadingFallback />}>
                  <ShopBoard />
                </Suspense>
              }
            />
            <Route path="/driver-agreement" element={<DriverAgreement />} />
            <Route path="/sign-in" element={<SignIn />} />
            <Route path="/sign-up" element={<SignUp />} />
            <Route path="/careers" element={<Careers />} />
            <Route path="/become-a-driver" element={<Careers />} />
            <Route
              path="/driver/sign-in"
              element={
                <Suspense fallback={<AdminLoadingFallback />}>
                  <DriverSignIn />
                </Suspense>
              }
            />
            <Route
              path="/driver"
              element={
                <RequireDriverSignIn>
                  <Suspense fallback={<AdminLoadingFallback />}>
                    <DriverHome />
                  </Suspense>
                </RequireDriverSignIn>
              }
            />
            <Route path="/terms" element={<Terms />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/qr" element={<QRCode />} />
            <Route path="/join" element={<ChoosePlan />} />
            <Route path="/promotions" element={<Promotions />} />
            <Route path="/help" element={<Help />} />
            <Route path="/compare" element={<CompareRideshare />} />
            <Route path="/welcome" element={<PostSignupUpsell />} />

            <Route path="/trip-details" element={<TripDetails />} />
            <Route path="/fast-pass" element={<FastPass />} />
            <Route path="/payment" element={<PaymentSelection />} />
            <Route path="/success" element={<Success />} />
            <Route
              path="/profile"
              element={
                <RequireAuth>
                  <Profile />
                </RequireAuth>
              }
            />
            <Route
              path="/subscribe/:tier"
              element={
                <RequireAuth>
                  <SubscriptionCheckout />
                </RequireAuth>
              }
            />

            <Route
              path="/admin/login"
              element={
                <Suspense fallback={<AdminLoadingFallback />}>
                  <AdminLogin />
                </Suspense>
              }
            />
            <Route
              path="/admin/dashboard"
              element={
                <RequireAdmin>
                  <Suspense fallback={<AdminLoadingFallback />}>
                    <DispatcherDashboard />
                  </Suspense>
                </RequireAdmin>
              }
            />

            <Route
              path="/admin/drivers"
              element={
                <RequireAdmin>
                  <Suspense fallback={<AdminLoadingFallback />}>
                    <DriversAdmin />
                  </Suspense>
                </RequireAdmin>
              }
            />

            <Route
              path="/admin/zones"
              element={
                <RequireAdmin>
                  <Suspense fallback={<AdminLoadingFallback />}>
                    <ZoneEditor />
                  </Suspense>
                </RequireAdmin>
              }
            />

            <Route
              path="/admin/map"
              element={
                <RequireAdmin>
                  <Suspense fallback={<AdminLoadingFallback />}>
                    <LiveMap />
                  </Suspense>
                </RequireAdmin>
              }
            />

            <Route
              path="/admin/lease"
              element={
                <RequireAdmin>
                  <Suspense fallback={<AdminLoadingFallback />}>
                    <LeaseAdmin />
                  </Suspense>
                </RequireAdmin>
              }
            />

            <Route
              path="/admin/payouts/:payoutId"
              element={
                <RequireAdmin>
                  <Suspense fallback={<AdminLoadingFallback />}>
                    <PayoutStatement />
                  </Suspense>
                </RequireAdmin>
              }
            />

            <Route path="*" element={<NotFound />} />
          </Routes>
          <AdStrip position="bottom" />
        </BrowserRouter>
      </RideProvider>
    </AuthProvider>
  );
}
