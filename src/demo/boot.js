// Demo start-up: example data on first visit, role from ?as=, simulated
// location, then the engine.
import * as core from "./core";
import { accounts } from "./accounts";
import { buildSeed, center, DEMO_USERS } from "./seed";
import { installGeo } from "./geo";
import { startEngine } from "./engine";

const VERSION_KEY = "rc-demo-seed";
const SEED_VERSION = "3";

export async function resetDemo() {
  accounts.reset(structuredClone(DEMO_USERS));
  localStorage.removeItem("rc-demo-files-v1");
  core.resetAll(buildSeed());
  localStorage.setItem(VERSION_KEY, SEED_VERSION);
}

export async function bootDemo() {
  if (core.isEmpty() || localStorage.getItem(VERSION_KEY) !== SEED_VERSION) await resetDemo();
  const url = new URL(window.location.href);
  const as = url.searchParams.get("as");
  if (as) {
    accounts.signIn(as === "guest" ? null : as);
    url.searchParams.delete("as");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  }
  // Real device GPS by default; the DEMO menu can still place this device on a zone.
  installGeo({ real: true });
  startEngine();
}
