export default function ConfirmModal({ title, message, confirmLabel, danger, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-6">
      <div className="bg-white rounded-2xl p-6 w-full max-w-xs">
        <h3 className="font-bold text-lg text-slate-800 mb-2">{title}</h3>
        {message && <p className="text-base text-slate-600 mb-5">{message}</p>}
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 bg-slate-200 text-slate-700 font-semibold py-3 rounded-xl"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 text-white font-semibold py-3 rounded-xl ${
              danger ? "bg-red-600" : "bg-blue-600"
            }`}
          >
            {confirmLabel || "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
