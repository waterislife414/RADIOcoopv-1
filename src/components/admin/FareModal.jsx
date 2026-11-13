import { useState } from "react";

export default function FareModal({ title, onConfirm, onCancel }) {
  const [fare, setFare] = useState("");

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-6">
      <div className="bg-white rounded-2xl p-6 w-full max-w-xs">
        <h3 className="font-semibold text-slate-800 mb-4">{title}</h3>
        <input
          type="number"
          step="0.01"
          min="0"
          autoFocus
          placeholder="Final Fare ($)"
          className="w-full border border-slate-300 rounded-xl px-4 py-3 mb-4 focus:outline-none focus:ring-2 focus:ring-blue-600"
          value={fare}
          onChange={(e) => setFare(e.target.value)}
        />
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 bg-slate-200 text-slate-700 font-semibold py-3 rounded-xl"
          >
            Cancel
          </button>
          <button
            onClick={() => fare && onConfirm(parseFloat(fare))}
            className="flex-1 bg-blue-600 text-white font-semibold py-3 rounded-xl"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
