// Demo stand-in for "firebase/auth".
import { accounts } from "../accounts";

const err = (code, message) => Object.assign(new Error(message), { code });

function userFor(uid) {
  const u = uid && accounts.get(uid);
  if (!u) return null;
  return {
    uid,
    get email() {
      return accounts.get(uid)?.email || u.email;
    },
    getIdTokenResult: async () => ({ claims: { ...(accounts.get(uid)?.claims || {}) } }),
    getIdToken: async () => "demo-token",
    reload: async () => {},
  };
}

const authObj = {
  get currentUser() {
    return userFor(accounts.currentUid());
  },
};
export const getAuth = () => authObj;

export function onAuthStateChanged(_auth, cb) {
  const emit = () => cb(authObj.currentUser);
  setTimeout(emit, 0);
  return accounts.onChange(emit);
}
export async function signInWithEmailAndPassword(_auth, email, password) {
  const u = accounts.byEmail(email);
  if (!u || u.password !== password) throw err("auth/invalid-credential", "Wrong email or password.");
  accounts.signIn(u.uid);
  return { user: userFor(u.uid) };
}
export async function createUserWithEmailAndPassword(_auth, email, password) {
  if (accounts.byEmail(email)) throw err("auth/email-already-in-use", "That email already has an account.");
  if (String(password).length < 6) throw err("auth/weak-password", "Password should be at least 6 characters.");
  const uid = accounts.create(email, password);
  accounts.signIn(uid);
  return { user: userFor(uid) };
}
export async function signOut() {
  accounts.signIn(null);
}
export async function sendPasswordResetEmail() {}
export const EmailAuthProvider = { credential: (email, password) => ({ email, password }) };
export async function reauthenticateWithCredential(user, cred) {
  if (accounts.get(user.uid)?.password !== cred.password) throw err("auth/wrong-password", "Wrong password.");
}
export async function updateEmail(user, email) {
  accounts.update(user.uid, { email: String(email).trim().toLowerCase() });
}
export async function updatePassword(user, password) {
  accounts.update(user.uid, { password });
}
