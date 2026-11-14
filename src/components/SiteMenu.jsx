import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { COMPANY_WORDMARK, COMPANY_PHONE_DISPLAY, COMPANY_PHONE_TEL } from "../config/constants";

const LEGAL = [
  { to: "/terms", label: "Terms of Service" },
  { to: "/privacy", label: "Privacy Policy" },
  { to: "/driver-agreement", label: "Driver Agreement" },
];

// Three menus: visitors, signed-in riders, and drivers.
function sectionsFor({ signedIn, isDriver, isAdmin }) {
  if (isDriver) {
    return [
      { title: "Driving", items: [{ to: "/driver", label: "Driver Home" }, { to: "/driver/profile", label: "My Profile" }] },
      { title: "Company", items: [{ to: "/", label: "Home Page" }, { to: "/about", label: "About Us" }, { to: "/contact", label: "Contact Us" }] },
      { title: "Legal", items: LEGAL },
    ];
  }
  if (signedIn) {
    return [
      {
        title: "Ride",
        items: [
          { to: "/", label: "Home" },
          { to: "/trip-details", label: "Book a Ride" },
          { to: "/profile", label: "My Profile" },
          { to: "/join", label: "Membership" },
          { to: "/compare", label: "Compare Rates" },
        ],
      },
      { title: "Company", items: [{ to: "/about", label: "About Us" }, { to: "/contact", label: "Contact Us" }, ...(isAdmin ? [{ to: "/admin/dashboard", label: "Dispatch Desk" }] : [])] },
      { title: "Legal", items: LEGAL.slice(0, 2) },
    ];
  }
  return [
    {
      title: "Ride",
      items: [
        { to: "/", label: "Home" },
        { to: "/sign-in", label: "Log In" },
        { to: "/sign-up", label: "Sign Up" },
        { to: "/trip-details", label: "Continue as Guest" },
        { to: "/compare", label: "Compare Rates" },
      ],
    },
    { title: "Company", items: [{ to: "/about", label: "About Us" }, { to: "/contact", label: "Contact Us" }] },
    { title: "Drivers", items: [{ to: "/driver/sign-in", label: "Driver Sign In" }, { to: "/become-a-driver", label: "Apply to Drive" }] },
    { title: "Legal", items: LEGAL },
  ];
}

/** The three-line menu, top right of every rider and driver page. */
export default function SiteMenu() {
  const { currentUser, isDriver, isAdmin, logout } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (pathname.startsWith("/admin")) return null;
  const sections = sectionsFor({ signedIn: !!currentUser, isDriver, isAdmin });
  const who = isDriver ? "Driver menu" : currentUser ? "My menu" : "Menu";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        className="fixed top-3 right-3 z-40 h-11 w-11 rounded-full bg-navy-950/90 border border-gold-400/50 shadow-lg flex flex-col items-center justify-center gap-[5px] backdrop-blur"
      >
        <span className="block h-0.5 w-5 bg-gold-300 rounded" />
        <span className="block h-0.5 w-5 bg-gold-300 rounded" />
        <span className="block h-0.5 w-5 bg-gold-300 rounded" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={who}>
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <nav className="absolute right-0 top-0 h-full w-[84%] max-w-sm bg-navy-950 text-white shadow-2xl flex flex-col border-l border-gold-400/30">
            <div className="px-5 pt-5 pb-4 border-b border-white/10 flex items-start">
              <div className="flex-1">
                <p className="font-display text-2xl font-semibold leading-none">{COMPANY_WORDMARK}</p>
                <p className="mt-1.5 text-[11px] font-semibold tracking-[0.3em] text-gold-400 uppercase">{who}</p>
                {currentUser && <p className="mt-2 text-sm text-slate-400 break-all">{currentUser.email}</p>}
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close menu" className="text-3xl leading-none text-slate-300 px-1">
                &times;
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-3">
              {sections.map((s) => (
                <div key={s.title} className="mb-3">
                  <p className="px-3 pb-1 text-[11px] font-bold tracking-[0.25em] text-slate-500 uppercase">{s.title}</p>
                  {s.items.map((it) => (
                    <Link
                      key={it.to + it.label}
                      to={it.to}
                      className={`block px-3 py-2.5 rounded-xl text-lg ${pathname === it.to ? "bg-white/10 text-gold-300 font-semibold" : "text-slate-100 hover:bg-white/5"}`}
                    >
                      {it.label}
                    </Link>
                  ))}
                </div>
              ))}
            </div>

            <div className="p-4 border-t border-white/10 space-y-2">
              <a href={`tel:${COMPANY_PHONE_TEL}`} className="block text-center rounded-xl py-3 font-bold bg-gradient-to-b from-gold-300 to-gold-500 text-navy-950">
                Call {COMPANY_PHONE_DISPLAY}
              </a>
              {currentUser && (
                <button
                  type="button"
                  onClick={async () => {
                    await logout();
                    setOpen(false);
                    navigate("/");
                  }}
                  className="w-full rounded-xl py-2.5 font-semibold text-slate-300 border border-white/15"
                >
                  Sign Out
                </button>
              )}
            </div>
          </nav>
        </div>
      )}
    </>
  );
}
