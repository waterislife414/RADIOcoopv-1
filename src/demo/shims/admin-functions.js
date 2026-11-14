// Demo stand-in for "firebase-admin/functions" (Cloud Tasks queue).
import { addTimer } from "../engine-timers";
export const getFunctions = () => ({ taskQueue: () => ({ enqueue: async (data, opts) => addTimer(data, opts?.scheduleDelaySeconds || 0) }) });
