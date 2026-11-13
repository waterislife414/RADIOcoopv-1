const TAG_STYLES = {
  cash: "bg-slate-700 text-white",
  card: "bg-blue-600 text-white",
  transfer: "bg-emerald-600 text-white",
};

export default function ActiveRideCard({ ride, onFinish, onFlag }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-3">
      <div className="flex justify-between items-start">
        <div>
          <p className="font-semibold text-slate-800">{ride.pickup}</p>
          <p className="text-sm text-slate-500">→ {ride.dropoff}</p>
        </div>
        <span
          className={`text-xs font-bold uppercase px-3 py-1 rounded-full ${
            TAG_STYLES[ride.paymentMethod] || "bg-slate-300 text-slate-800"
          }`}
        >
          {ride.paymentMethod}
        </span>
      </div>

      {ride.finalFare != null && (
        <p className="text-sm text-slate-600">
          Final fare: <span className="font-semibold">${ride.finalFare.toFixed(2)}</span>
        </p>
      )}

      {ride.phone && (
        <a href={`tel:${ride.phone}`} className="text-blue-600 text-sm font-medium">
          {ride.phone}
        </a>
      )}

      <div className="flex gap-2 pt-1">
        <button
          onClick={() => onFinish(ride)}
          className="flex-1 bg-emerald-600 text-white font-semibold text-sm py-2 rounded-xl"
        >
          FINISHED
        </button>
        <button
          onClick={() => onFlag(ride)}
          className="flex-1 bg-slate-200 text-slate-700 font-semibold text-xs py-2 rounded-xl"
        >
          FLAG FOR NON-PAYMENT
        </button>
      </div>
    </div>
  );
}
