import { httpsCallable } from "firebase/functions";
import app, { functions } from "../config/firebase";
import { BRAND, FIREBASE_CONFIG } from "../config/constants";

const VAPID_KEY = BRAND.dispatch?.pushVapidKey || "";
const SW_KEYS = ["apiKey", "authDomain", "projectId", "storageBucket", "messagingSenderId", "appId"];

export function pushAvailable() {
  return !!VAPID_KEY && "serviceWorker" in navigator && "Notification" in window;
}

export function pushPermission() {
  return pushAvailable() ? Notification.permission : "unsupported";
}

/**
 * Asks for notification permission (call from a tap) and registers this
 * phone for call alerts. Returns 'granted' | 'denied' | 'default' | 'unsupported'.
 */
export async function enableDriverPush() {
  if (!pushAvailable()) return "unsupported";
  const perm = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
  if (perm !== "granted") return perm;
  const { getMessaging, getToken, isSupported } = await import("firebase/messaging");
  if (!(await isSupported())) return "unsupported";
  const params = new URLSearchParams(
    Object.fromEntries(SW_KEYS.filter((k) => FIREBASE_CONFIG[k]).map((k) => [k, FIREBASE_CONFIG[k]]))
  );
  const reg = await navigator.serviceWorker.register(`/firebase-messaging-sw.js?${params}`, {
    scope: "/firebase-cloud-messaging-push-scope",
  });
  const token = await getToken(getMessaging(app), { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg });
  if (token) await httpsCallable(functions, "registerPushToken")({ token });
  return "granted";
}
