import { Link } from "react-router-dom";
import BrandHeader from "../components/BrandHeader";
import ContactFooter from "../components/ContactFooter";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-white">
      <BrandHeader />
      <div className="px-6 py-16 flex flex-col items-center justify-center text-center">
        <div className="max-w-md w-full">
          <h1 className="text-7xl font-display font-bold text-blue-600 mb-2">404</h1>
          <p className="text-slate-600 text-lg mb-8">
            That page doesn't exist. Let's get you back on route.
          </p>
          <Link
            to="/"
            className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-bold text-lg px-8 py-4 min-h-[56px] rounded-2xl shadow-md transition"
          >
            Back to Home
          </Link>
          <ContactFooter />
        </div>
      </div>
    </div>
  );
}
