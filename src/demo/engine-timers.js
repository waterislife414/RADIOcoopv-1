// Demo timers: stand in for Cloud Tasks (the 15-second call pings).
import * as core from "./core";
export function addTimer(data, delaySec) {
  return core.commit([{ type: "set", path: `demoTimers/${core.newId()}`, data: { dueAt: Date.now() + delaySec * 1000, data } }]);
}
