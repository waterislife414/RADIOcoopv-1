// Auto-accept is a setting on this phone (hands stay on the wheel).
const AUTO_KEY = "rc-auto-accept";

export function autoAcceptOn() {
  try {
    return localStorage.getItem(AUTO_KEY) === "1";
  } catch {
    return false;
  }
}

export function setAutoAccept(on) {
  try {
    localStorage.setItem(AUTO_KEY, on ? "1" : "0");
  } catch {
    // No storage: the switch just won't stick.
  }
}
