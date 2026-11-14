// Demo stand-in for "firebase/functions": httpsCallable runs the real
// function handler in this browser instead of calling the cloud.
import { callFunction } from "../engine";
export const getFunctions = () => ({ type: "demo-functions" });
export const httpsCallable = (_functions, name) => async (data) => ({ data: await callFunction(name, data ?? {}) });
