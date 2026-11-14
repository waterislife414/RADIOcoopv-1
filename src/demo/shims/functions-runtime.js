// Demo stand-in for the "firebase-functions/v2/*" and "firebase-functions/params"
// modules: wraps each handler so the demo engine can call it in the browser.
export class HttpsError extends Error {
  constructor(code, message, details) {
    super(message);
    this.code = code;
    this.details = details;
  }
}
const pick = (a, b) => (typeof a === "function" ? [{}, a] : [a || {}, b]);
const wrap = (kind, opts, handler) => ({ __endpoint: { kind }, __demo: { kind, opts }, run: handler });

export const onCall = (a, b) => wrap("call", ...pick(a, b));
export const onRequest = (a, b) => wrap("request", ...pick(a, b));
export const onSchedule = (a, b) => wrap("schedule", typeof a === "string" ? { schedule: a } : a, b);
export const onTaskDispatched = (a, b) => wrap("task", ...pick(a, b));
const docTrigger = (type) => (a, b) => wrap(type, typeof a === "string" ? { document: a } : a, b);
export const onDocumentCreated = docTrigger("created");
export const onDocumentUpdated = docTrigger("updated");
export const onDocumentDeleted = docTrigger("deleted");
export const onDocumentWritten = docTrigger("written");

const param = (name) => ({ name, value: () => `demo-${name}` });
export const defineSecret = param;
export const defineString = param;
export const defineInt = (name) => ({ name, value: () => 0 });
export const setGlobalOptions = () => {};
export const logger = console;
