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
function sectionsFor({ signedIn, isDriver, isAdmin, isShop }) {
  if (isShop && !isAdmin && !isDriver) {
    return [
      { title: "Shop", items: [{ to: "/shop", label: "Shop Board" }] },
      { title: "Company", items: [{ to: "/", label: "Home Page" }, { to: "/contact", label: "Contact Us" }] },
    ];
  }
  if (isDriver) {
    return [
      { title: "Driving", items: [{ to: "/driver", label: "Driver Home" }, { to: "/driver/profile", label: "My Profile" }] },
      {
        title: "My Car",
        items: [
          { to: "/driver/inspection?type=weekly", label: "Vehicle Inspection" },
          { to: "/driver/inspection?type=damage", label: "Report Damage" },
          { to: "/driver/inspection?type=repair", label: "Report a Problem" },
        ],
      },
      { title: "Company", items: [{ to: "/", label: "Home Page" }, { to: "/about", label: "About Us" }, { to: "/contact", label: "Contact Us" }, { to: "/qr", label: "QR Code" }] },
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
          { to: "/promotions", label: "Promotions" },
        ],
      },
      { title: "Company", items: [{ to: "/about", label: "About Us" }, { to: "/contact", label: "Contact Us" }, { to: "/help", label: "Help & Questions" }, { to: "/qr", label: "QR Code" }, ...(isAdmin ? [{ to: "/admin/dashboard", label: "Dispatch Desk" }, { to: "/shop", label: "Shop Board" }] : [])] },
      { title: "Legal", items: LEGAL.slice(0, 2) },
      { title: "Drivers", items: [{ to: "/driver/sign-in", label: "Driver Sign In" }, { to: "/become-a-driver", label: "Come Join Our Team" }] },
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
    { title: "Company", items: [{ to: "/about", label: "About Us" }, { to: "/contact", label: "Contact Us" }, { to: "/help", label: "Help & Questions" }, { to: "/promotions", label: "Promotions" }, { to: "/qr", label: "QR Code" }] },
    { title: "Legal", items: LEGAL },
    { title: "Drivers", items: [{ to: "/driver/sign-in", label: "Driver Sign In" }, { to: "/become-a-driver", label: "Come Join Our Team" }] },
  ];
}

/** The three-line menu, top right of every rider and driver page. */
// "Larger text" (like Uber's Simple mode): scales every rem-based size.
const TEXT_KEY = "rc-text-size";
function applyTextSize(large) {
  document.documentElement.classList.toggle("text-large", large);
}
function savedLarge() {
  try {
    return localStorage.getItem(TEXT_KEY) === "large";
  } catch {
    return false;
  }
}
if (typeof document !== "undefined") applyTextSize(savedLarge());

export default function SiteMenu() {
  const { currentUser, isDriver, isAdmin, isShop, logout } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [large, setLarge] = useState(savedLarge);
  const toggleLarge = () => {
    const next = !large;
    setLarge(next);
    applyTextSize(next);
    try {
      localStorage.setItem(TEXT_KEY, next ? "large" : "normal");
    } catch {
      // ignore
    }
  };

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (pathname.startsWith("/admin")) return null;
  const sections = sectionsFor({ signedIn: !!currentUser, isDriver, isAdmin, isShop });
  const who = isDriver ? "Driver menu" : currentUser ? "My menu" : "Menu";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        className="fixed top-10 right-3 z-40 h-11 w-11 rounded-full bg-navy-950/90 border border-gold-400/50 shadow-lg flex flex-col items-center justify-center gap-[5px] backdrop-blur"
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
              <button
                type="button"
                role="switch"
                aria-checked={large}
                onClick={toggleLarge}
                className={`mb-4 w-full flex items-center justify-between gap-3 rounded-2xl border-2 px-4 min-h-[56px] font-bold text-lg ${large ? "border-gold-400 bg-gold-400/15 text-gold-200" : "border-white/20 text-white"}`}
              >
                <span><span className="font-display text-2xl mr-2">Aa</span>Larger text</span>
                <span className={`rounded-full px-3 py-1 text-sm ${large ? "bg-gold-400 text-navy-950" : "bg-white/15"}`}>{large ? "On" : "Off"}</span>
              </button>
              <a href={`tel:${COMPANY_PHONE_TEL}`} className="mb-4 flex items-center justify-center gap-2 rounded-2xl bg-blue-600 min-h-[56px] font-bold text-lg">
                &#9742; Call {COMPANY_PHONE_DISPLAY}
              </a>
              {sections.map((s) => (
                <div key={s.title} className="mb-3">
                  <p className="px-3 pb-1 text-xs font-bold tracking-[0.25em] text-slate-300 uppercase">{s.title}</p>
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
