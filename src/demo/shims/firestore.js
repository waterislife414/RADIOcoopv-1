// Demo stand-in for "firebase/firestore" (the client SDK), backed by ../core.
import * as core from "../core";

export const Timestamp = core.Timestamp;
export const serverTimestamp = core.FieldValue.serverTimestamp;
export const increment = core.FieldValue.increment;
export const arrayUnion = core.FieldValue.arrayUnion;
export const arrayRemove = core.FieldValue.arrayRemove;
export const deleteField = core.FieldValue.delete;
export const getFirestore = () => ({ type: "demo-firestore" });

const join = (segs) => segs.filter(Boolean).join("/");
const docRef = (path) => ({ kind: "doc", path, id: path.split("/").pop() });
const collRef = (path) => ({ kind: "query", collection: path, path, id: path.split("/").pop(), filters: [], order: [], limit: null });

export function collection(parent, ...segs) {
  return collRef(join([parent?.path && parent.kind === "doc" ? parent.path : "", ...segs]));
}
export function collectionGroup(_db, id) {
  return { kind: "query", group: id, filters: [], order: [], limit: null };
}
export function doc(parent, ...segs) {
  if (parent?.kind === "query") return docRef(join([parent.collection, segs[0] || core.newId()]));
  return docRef(join([parent?.kind === "doc" ? parent.path : "", ...segs]));
}
export const where = (field, op, value) => ({ t: "where", v: [field, op, value] });
export const orderBy = (field, dir = "asc") => ({ t: "order", v: [field, dir] });
export const limit = (n) => ({ t: "limit", v: n });
export function query(base, ...constraints) {
  const q = { ...base, filters: [...base.filters], order: [...base.order] };
  for (const c of constraints) {
    if (c.t === "where") q.filters.push(c.v);
    else if (c.t === "order") q.order.push(c.v);
    else if (c.t === "limit") q.limit = c.v;
  }
  return q;
}

function docSnap(path, data) {
  return { id: path.split("/").pop(), ref: docRef(path), exists: () => data !== undefined, data: () => (data === undefined ? undefined : core.clone(data)), get: (f) => data?.[f] };
}
function querySnap(q) {
  const list = core.runQuery(q).map((r) => docSnap(r.path, r.data));
  return { docs: list, size: list.length, empty: list.length === 0, forEach: (fn) => list.forEach(fn) };
}

export const getDoc = async (ref) => docSnap(ref.path, core.readDoc(ref.path));
export const getDocs = async (q) => querySnap(q);

export function onSnapshot(ref, next, _onError) {
  if (typeof next === "object") next = next.next;
  let last;
  const emit = () => {
    const snap = ref.kind === "doc" ? docSnap(ref.path, core.readDoc(ref.path)) : querySnap(ref);
    const sig = ref.kind === "doc" ? JSON.stringify(snap.data() ?? null) : JSON.stringify(snap.docs.map((d) => [d.id, d.data()]));
    if (sig === last) return;
    last = sig;
    next(snap);
  };
  const off = core.subscribe(emit);
  setTimeout(emit, 0);
  return off;
}

export const setDoc = (ref, data, opts) => core.commit([{ type: "set", path: ref.path, data, merge: !!(opts?.merge || opts?.mergeFields) }]);
export const updateDoc = (ref, data) => core.commit([{ type: "update", path: ref.path, data }]);
export const deleteDoc = (ref) => core.commit([{ type: "delete", path: ref.path }]);
export async function addDoc(coll, data) {
  const ref = doc(coll);
  await setDoc(ref, data);
  return ref;
}
export function writeBatch() {
  const m = [];
  return {
    set: (ref, data, opts) => m.push({ type: "set", path: ref.path, data, merge: !!opts?.merge }),
    update: (ref, data) => m.push({ type: "update", path: ref.path, data }),
    delete: (ref) => m.push({ type: "delete", path: ref.path }),
    commit: () => core.commit(m),
  };
}
export function runTransaction(_db, fn) {
  return core.transaction((buf) =>
    fn({
      get: async (ref) => docSnap(ref.path, core.readDoc(ref.path)),
      set: (ref, data, opts) => buf.push({ type: "set", path: ref.path, data, merge: !!opts?.merge }),
      update: (ref, data) => buf.push({ type: "update", path: ref.path, data }),
      delete: (ref) => buf.push({ type: "delete", path: ref.path }),
    })
  );
}
export const getCountFromServer = async (q) => ({ data: () => ({ count: core.runQuery(q).length }) });
export const startAfter = () => ({ t: "noop" });
