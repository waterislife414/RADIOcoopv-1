// Demo sign-ins. Accounts are shared across tabs (localStorage); who is
// signed in is per tab (sessionStorage), so one tab can be the rider,
// another the driver and a third the dispatcher.
const KEY = "rc-demo-auth-v1";
const SESSION = "rc-demo-uid";

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch {
    return {};
  }
}
const write = (users) => localStorage.setItem(KEY, JSON.stringify(users));
const listeners = new Set();

export const accounts = {
  all: read,
  get: (uid) => read()[uid] || null,
  byEmail(email) {
    const e = String(email || "").trim().toLowerCase();
    const hit = Object.entries(read()).find(([, u]) => u.email === e);
    return hit ? { uid: hit[0], ...hit[1] } : null;
  },
  create(email, password, uid = `u${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`, claims = {}) {
    const users = read();
    users[uid] = { email: String(email).trim().toLowerCase(), password, claims };
    write(users);
    return uid;
  },
  update(uid, patch) {
    const users = read();
    if (users[uid]) users[uid] = { ...users[uid], ...patch };
    write(users);
  },
  setClaims(uid, claims) {
    accounts.update(uid, { claims });
  },
  remove(uid) {
    const users = read();
    delete users[uid];
    write(users);
    if (accounts.currentUid() === uid) accounts.signIn(null);
  },
  reset(users = {}) {
    write(users);
  },
  currentUid: () => sessionStorage.getItem(SESSION) || null,
  signIn(uid) {
    if (uid) sessionStorage.setItem(SESSION, uid);
    else sessionStorage.removeItem(SESSION);
    for (const l of listeners) l();
  },
  onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
