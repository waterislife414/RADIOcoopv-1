import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";

const STORAGE_KEY = "radio_install_dismissed_until";

export default function InstallPrompt() {
  const location = useLocation();
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Never show on admin or driver routes
    if (location.pathname.startsWith("/admin") || location.pathname.startsWith("/driver")) {
      setShow(false);
      return;
    }

    // Check if dismissed within 7 days
    try {
      const dismissedUntil = localStorage.getItem(STORAGE_KEY);
      if (dismissedUntil && Date.now() < Number(dismissedUntil)) {
        return;
      }
    } catch {
      // ignore
    }

    // Check if already in standalone mode
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true;

    if (isStandalone) {
      return;
    }

    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShow(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    // If no beforeinstallprompt (e.g. iOS Safari), we can still show the manual prompt
    // after a short check or always on mobile browsers if not standalone.
    const isIOS = /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase());
    if (isIOS) {
      setShow(true);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, [location.pathname]);

  async function handleInstall() {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") {
        setShow(false);
      }
      setDeferredPrompt(null);
    }
  }

  function handleDismiss() {
    setShow(false);
    try {
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      localStorage.setItem(STORAGE_KEY, String(Date.now() + sevenDaysMs));
    } catch {
      // ignore
    }
  }

  if (!show) return null;

  const isIOS = /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase());

  return (
    <div
      data-testid="install-prompt"
      className="fixed bottom-0 left-0 right-0 z-50 bg-navy-900 border-t border-gold-500/30 text-white px-4 py-3 flex items-center justify-between shadow-2xl"
    >
      <div className="flex items-center space-x-3">
        <div className="w-10 h-10 rounded-xl bg-gold-500/20 flex items-center justify-center font-bold text-gold-400">
          Cab
        </div>
        <div>
          <p className="font-semibold text-sm">Radio Co-op Taxi</p>
          <p className="text-xs text-slate-300">
            {isIOS ? "Tap Share, then Add to Home Screen." : "Get the app for fast booking & perks."}
          </p>
        </div>
      </div>
      <div className="flex items-center space-x-2">
        {deferredPrompt && !isIOS && (
          <button
            type="button"
            onClick={handleInstall}
            className="bg-gold-500 text-navy-950 px-4 py-2 rounded-xl text-xs font-bold hover:bg-gold-400 transition"
          >
            Install app
          </button>
        )}
        <button
          type="button"
          onClick={handleDismiss}
          className="text-slate-400 hover:text-white p-2 text-lg font-bold"
          aria-label="Close"
        >
          &times;
        </button>
      </div>
    </div>
  );
}
