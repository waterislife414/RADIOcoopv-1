// Demo backend, part 1: a small document database that lives in the browser
// (localStorage, shared across tabs). It stands in for Firestore so the app
// and the real Cloud Functions code can run with no cloud project behind
// them. Used ONLY by the demo build (vite --mode demo); the production build
// never imports this folder.

const DB_KEY = "rc-demo-db-v1";
const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("rc-demo") : null;

export class Timestamp {
  constructor(ms) {
    this.ms = ms;
    this.seconds = Math.floor(ms / 1000);
    this.nanoseconds = (ms % 1000) * 1e6;
  }
  toMillis() {
    return this.ms;
  }
  toDate() {
    return new Date(this.ms);
  }
  static now() {
    return new Timestamp(Date.now());
  }
  static fromDate(d) {
    return new Timestamp(d.getTime());
  }
  static fromMillis(ms) {
    return new Timestamp(ms);
  }
}

class Op {
  constructor(kind, arg) {
    this.kind = kind;
    this.arg = arg;
  }
}
export const FieldValue = {
  serverTimestamp: () => new Op("ts"),
  increment: (n) => new Op("inc", n),
  arrayUnion: (...v) => new Op("union", v),
  arrayRemove: (...v) => new Op("remove", v),
  delete: () => new Op("del"),
};

const isPlain = (v) => v !== null && typeof v === "object" && !Array.isArray(v) && !(v instanceof Timestamp) && !(v instanceof Op) && !(v instanceof Date);

export function clone(v) {
  if (v instanceof Timestamp) return new Timestamp(v.ms);
  if (v instanceof Date) return new Timestamp(v.getTime());
  if (Array.isArray(v)) return v.map(clone);
  if (isPlain(v)) return Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => [k, clone(x)]));
  return v;
}

const same = (a, b) => JSON.stringify(a, replacer) === JSON.stringify(b, replacer);
function replacer(_k, v) {
  return v instanceof Timestamp ? { __ts: v.ms } : v;
}
function revive(v) {
  if (Array.isArray(v)) return v.map(revive);
  if (v && typeof v === "object") {
    if (typeof v.__ts === "number" && Object.keys(v).length === 1) return new Timestamp(v.__ts);
    for (const k of Object.keys(v)) v[k] = revive(v[k]);
  }
  return v;
}

// ---------------------------------------------------------------- state
let docs = {}; // path -> data
function load() {
  try {
    docs = revive(JSON.parse(localStorage.getItem(DB_KEY) || "{}"));
  } catch {
    docs = {};
  }
}
function save() {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(docs, (k, v) => (v instanceof Timestamp ? { __ts: v.ms } : v)));
  } catch (e) {
    console.warn("Demo data could not be saved:", e.message);
  }
}
load();

const listeners = new Set();
let notifyQueued = false;
function notifyAll() {
  if (notifyQueued) return;
  notifyQueued = true;
  setTimeout(() => {
    notifyQueued = false;
    for (const l of [...listeners]) {
      try {
        l();
      } catch (e) {
        console.error(e);
      }
    }
  }, 0);
}
channel?.addEventListener("message", (e) => {
  if (e.data === "changed") {
    load();
    notifyAll();
  }
});

// Second sync signal: other tabs writing localStorage fire "storage" even when BroadcastChannel is missed.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === DB_KEY) {
      load();
      notifyAll();
    }
  });
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ---------------------------------------------------------------- writes
function resolve(prev, next) {
  if (next instanceof Op) {
    if (next.kind === "ts") return Timestamp.now();
    if (next.kind === "inc") return (typeof prev === "number" ? prev : 0) + next.arg;
    if (next.kind === "union") {
      const out = Array.isArray(prev) ? [...prev] : [];
      for (const v of next.arg) if (!out.some((x) => same(x, v))) out.push(clone(v));
      return out;
    }
    if (next.kind === "remove") return (Array.isArray(prev) ? prev : []).filter((x) => !next.arg.some((v) => same(x, v)));
    return undefined; // del
  }
  if (isPlain(next)) {
    const out = {};
    for (const [k, v] of Object.entries(next)) {
      const r = resolve(undefined, v);
      if (r !== undefined) out[k] = r;
    }
    return out;
  }
  return clone(next);
}

function mergeInto(target, patch) {
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    if (isPlain(v) && !(v instanceof Op)) {
      if (!isPlain(target[k])) target[k] = {};
      mergeInto(target[k], v);
    } else {
      const r = resolve(target[k], v);
      if (r === undefined) delete target[k];
      else target[k] = r;
    }
  }
}

function setPath(target, dotted, value) {
  const parts = dotted.split(".");
  let o = target;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!isPlain(o[parts[i]])) o[parts[i]] = {};
    o = o[parts[i]];
  }
  const last = parts[parts.length - 1];
  const r = resolve(o[last], value);
  if (r === undefined) delete o[last];
  else o[last] = r;
}

/** mutation: { type: 'set'|'update'|'delete', path, data, merge } */
function applyOne(m) {
  const before = docs[m.path] ? clone(docs[m.path]) : undefined;
  if (m.type === "delete") {
    delete docs[m.path];
  } else if (m.type === "set") {
    if (m.merge) {
      const cur = docs[m.path] ? clone(docs[m.path]) : {};
      mergeInto(cur, m.data);
      docs[m.path] = cur;
    } else {
      docs[m.path] = resolve(undefined, m.data);
    }
  } else if (m.type === "update") {
    if (!docs[m.path]) {
      const err = new Error(`No document to update: ${m.path}`);
      err.code = "not-found";
      throw err;
    }
    const cur = clone(docs[m.path]);
    for (const [k, v] of Object.entries(m.data)) {
      if (v === undefined) continue;
      setPath(cur, k, v);
    }
    docs[m.path] = cur;
  }
  return { path: m.path, before, after: docs[m.path] ? clone(docs[m.path]) : undefined };
}

// One writer at a time across tabs, so a transaction in one tab can't
// interleave with a write from another.
let holding = false;
async function locked(fn) {
  if (holding || !navigator.locks) return fn();
  return navigator.locks.request("rc-demo-db", async () => {
    holding = true;
    try {
      load();
      return await fn();
    } finally {
      holding = false;
    }
  });
}

const triggerHooks = new Set();
/** fn(change: {path, before, after}) is called after every committed write made in this tab. */
export function onCommitted(fn) {
  triggerHooks.add(fn);
}

function finish(changes) {
  const real = changes.filter((c) => !same(c.before, c.after));
  if (!real.length) return;
  save();
  channel?.postMessage("changed");
  notifyAll();
  for (const c of real) for (const h of triggerHooks) h(c);
}

export async function commit(mutations) {
  return locked(async () => {
    const snapshot = JSON.stringify(docs, replacer);
    try {
      const changes = mutations.map(applyOne);
      finish(changes);
    } catch (e) {
      docs = revive(JSON.parse(snapshot));
      throw e;
    }
  });
}

/** Runs fn(tx) with buffered writes; reads see committed data. */
export async function transaction(fn) {
  return locked(async () => {
    const buffered = [];
    const result = await fn(buffered);
    const snapshot = JSON.stringify(docs, replacer);
    try {
      finish(buffered.map(applyOne));
    } catch (e) {
      docs = revive(JSON.parse(snapshot));
      throw e;
    }
    return result;
  });
}

// ---------------------------------------------------------------- reads
export const readDoc = (path) => (docs[path] ? clone(docs[path]) : undefined);

const getField = (data, dotted) => dotted.split(".").reduce((o, k) => (o == null ? undefined : o[k]), data);
const norm = (v) => (v instanceof Timestamp ? v.ms : v instanceof Date ? v.getTime() : v);
function cmp(a, b) {
  a = norm(a);
  b = norm(b);
  if (a === b) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  return a < b ? -1 : 1;
}
function passes(data, [field, op, value]) {
  const v = getField(data, field);
  if (op === "==") return v === undefined ? value === null && false : same(norm(v), norm(value));
  if (op === "!=") return v !== undefined && !same(norm(v), norm(value));
  if (op === "in") return value.some((x) => same(norm(v), norm(x)));
  if (op === "array-contains") return Array.isArray(v) && v.some((x) => same(x, value));
  if (v === undefined || v === null) return false;
  const c = cmp(v, value);
  return op === "<" ? c < 0 : op === "<=" ? c <= 0 : op === ">" ? c > 0 : c >= 0;
}

/** q: { collection?: 'a/b/c', group?: 'days', filters: [[f,op,v]], order: [[f,dir]], limit } */
export function runQuery(q) {
  let rows = [];
  for (const path of Object.keys(docs)) {
    const i = path.lastIndexOf("/");
    const parent = path.slice(0, i);
    if (q.group ? parent.split("/").pop() !== q.group : parent !== q.collection) continue;
    const data = docs[path];
    if ((q.filters || []).every((f) => passes(data, f))) rows.push({ path, data: clone(data) });
  }
  for (const [field, dir] of [...(q.order || [])].reverse()) {
    rows = rows.filter((r) => getField(r.data, field) !== undefined);
    rows.sort((a, b) => cmp(getField(a.data, field), getField(b.data, field)) * (dir === "desc" ? -1 : 1));
  }
  if (!(q.order || []).length) rows.sort((a, b) => (a.path < b.path ? -1 : 1));
  return q.limit ? rows.slice(0, q.limit) : rows;
}

export const newId = () => Array.from(crypto.getRandomValues(new Uint8Array(15)), (b) => "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"[b % 62]).join("");

export function resetAll(seed = {}) {
  docs = clone(seed);
  save();
  channel?.postMessage("changed");
  notifyAll();
}
export const isEmpty = () => Object.keys(docs).length === 0;
export const sameValue = same;
