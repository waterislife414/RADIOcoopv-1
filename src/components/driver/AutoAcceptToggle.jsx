import { useState } from "react";
import { autoAcceptOn, setAutoAccept } from "./autoAccept";

/** On the driver's status card: calls are taken for him after a short countdown. */
export default function AutoAcceptToggle({ seconds = 3 }) {
  const [on, setOn] = useState(autoAcceptOn);
  return (
    <label className="flex items-center justify-between gap-3 rounded-2xl bg-white/5 border border-white/15 px-4 py-3" data-testid="auto-accept-toggle">
      <span>
        <span className="block font-bold">Auto-accept calls</span>
        <span className="block text-sm text-slate-400">Calls are taken for you after {seconds} seconds unless you tap Decline.</span>
      </span>
      <input
        type="checkbox"
        role="switch"
        aria-label="Auto-accept calls"
        className="h-6 w-6 accent-emerald-500"
        checked={on}
        onChange={(e) => {
          setAutoAccept(e.target.checked);
          setOn(e.target.checked);
        }}
      />
    </label>
  );
}
