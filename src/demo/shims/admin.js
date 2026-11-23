// Demo stand-in for "firebase-admin": the same calls the Cloud Functions
// make, answered by the in-browser database (../core) and demo accounts.
import * as core from "../core";
import { accounts } from "../accounts";

class DocRef {
  constructor(path) {
    this.path = path;
    this.id = path.split("/").pop();
  }
  get parent() {
    return new Query({ collection: this.path.split("/").slice(0, -1).join("/") });
  }
  collection(name) {
    return new Query({ collection: `${this.path}/${name}` });
  }
  async get() {
    return snap(this.path, core.readDoc(this.path));
  }
  set(data, opts) {
    return core.commit([{ type: "set", path: this.path, data, merge: !!opts?.merge }]);
  }
  update(data, ...rest) {
    if (typeof data === "string") data = { [data]: rest[0] };
    return core.commit([{ type: "update", path: this.path, data }]);
  }
  delete() {
    return core.commit([{ type: "delete", path: this.path }]);
  }
}

class Query {
  constructor(q) {
    this.q = { filters: [], order: [], limit: null, ...q };
    this.path = q.collection;
    this.id = q.collection?.split("/").pop();
  }
  get parent() {
    const segs = (this.q.collection || "").split("/");
    return segs.length > 1 ? new DocRef(segs.slice(0, -1).join("/")) : null;
  }
  doc(id) {
    return new DocRef(`${this.q.collection}/${id || core.newId()}`);
  }
  async add(data) {
    const ref = this.doc();
    await ref.set(data);
    return ref;
  }
  where(f, op, v) {
    return new Query({ ...this.q, filters: [...this.q.filters, [f, op, v]] });
  }
  orderBy(f, dir = "asc") {
    return new Query({ ...this.q, order: [...this.q.order, [f, dir]] });
  }
  limit(n) {
    return new Query({ ...this.q, limit: n });
  }
  count() {
    return { get: async () => ({ data: () => ({ count: core.runQuery(this.q).length }) }) };
  }
  async get() {
    return qsnap(this.q);
  }
}

function snap(path, data) {
  return { id: path.split("/").pop(), ref: new DocRef(path), exists: data !== undefined, data: () => (data === undefined ? undefined : core.clone(data)), get: (f) => data?.[f] };
}
function qsnap(q) {
  const docs = core.runQuery(q).map((r) => snap(r.path, r.data));
  return { docs, size: docs.length, empty: docs.length === 0, forEach: (fn) => docs.forEach(fn) };
}

const writer = (buf) => ({
  set: (ref, data, opts) => (buf.push({ type: "set", path: ref.path, data, merge: !!opts?.merge }), undefined),
  create: (ref, data) => (buf.push({ type: "set", path: ref.path, data }), undefined),
  update: (ref, data, ...rest) => (buf.push({ type: "update", path: ref.path, data: typeof data === "string" ? { [data]: rest[0] } : data }), undefined),
  delete: (ref) => (buf.push({ type: "delete", path: ref.path }), undefined),
});

const db = {
  collection: (path) => new Query({ collection: path }),
  doc: (path) => new DocRef(path),
  collectionGroup: (id) => new Query({ group: id }),
  getAll: async (...refs) => refs.map((r) => snap(r.path, core.readDoc(r.path))),
  batch() {
    const buf = [];
    return { ...writer(buf), commit: () => core.commit(buf) };
  },
  runTransaction: (fn) =>
    core.transaction((buf) =>
      fn({
        get: async (target) => (target instanceof Query ? qsnap(target.q) : snap(target.path, core.readDoc(target.path))),
        getAll: async (...refs) => refs.map((r) => snap(r.path, core.readDoc(r.path))),
        ...writer(buf),
      })
    ),
};

export function firestore() {
  return db;
}
firestore.FieldValue = core.FieldValue;
firestore.Timestamp = core.Timestamp;

export const auth = () => ({
  async getUser(uid) {
    const u = accounts.get(uid);
    if (!u) throw new Error("No such user");
    return { uid, email: u.email, customClaims: u.claims || {} };
  },
  async setCustomUserClaims(uid, claims) {
    accounts.setClaims(uid, claims || {});
  },
  async deleteUser(uid) {
    accounts.remove(uid);
  },
});
export const messaging = () => ({ sendEachForMulticast: async ({ tokens }) => ({ responses: tokens.map(() => ({ success: true })) }) });
export const initializeApp = () => ({});
export const apps = [{}];

export const _snap = snap;
const admin = { firestore, auth, messaging, initializeApp, apps };
export default admin;
