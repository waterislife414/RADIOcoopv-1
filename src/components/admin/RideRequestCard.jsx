const TAG_STYLES = {
  cash: "bg-slate-700 text-white",
  card: "bg-blue-600 text-white",
  transfer: "bg-emerald-600 text-white",
};

export default function RideRequestCard({ ride, onAccept, onDecline, onFlag }) {
  const isAsap = ride.scheduleType !== "later";

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-3">
      <div className="flex justify-between items-start gap-2">
        <div>
          <p className="font-semibold text-slate-800">{ride.pickup}</p>
          <p className="text-sm text-slate-500">→ {ride.dropoff}</p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span
            className={`text-xs font-bold uppercase px-3 py-1 rounded-full ${
              TAG_STYLES[ride.paymentMethod] || "bg-slate-300 text-slate-800"
            }`}
          >
            {ride.paymentMethod}
          </span>
          <span
            className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
              isAsap ? "bg-blue-100 text-blue-700" : "bg-slate-200 text-slate-600"
            }`}
          >
            {isAsap
              ? "ASAP"
              : ride.scheduledFor
              ? new Date(ride.scheduledFor).toLocaleString([], {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })
              : "Scheduled"}
          </span>
          {ride.outOfArea && (
            <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
              Out of Area
            </span>
          )}
        </div>
      </div>

      <div className="text-xs text-slate-500 flex flex-wrap gap-x-4 gap-y-1">
        <span>{ride.passengers} pax</span>
        {ride.roundTrip && <span>Round trip</span>}
        {ride.stops?.length > 0 && <span>{ride.stops.length} stop(s)</span>}
        <span>{ride.estMiles} mi est.</span>
      </div>

      {ride.phone && (
        <a href={`tel:${ride.phone}`} className="text-blue-600 text-sm font-medium">
          {ride.phone}
        </a>
      )}

      <div className="flex gap-2 pt-1">
        <button
          onClick={() => onDecline(ride)}
          className="flex-1 bg-red-50 text-red-700 font-semibold text-sm py-2 rounded-xl"
        >
          DECLINE
        </button>
        <button
          onClick={() => onAccept(ride)}
          className="flex-1 bg-blue-600 text-white font-semibold text-sm py-2 rounded-xl"
        >
          ACCEPT
        </button>
        <button
          onClick={() => onFlag(ride)}
          className="flex-1 bg-slate-200 text-slate-700 font-semibold text-xs py-2 rounded-xl"
        >
          FLAG
        </button>
      </div>
    </div>
  );
}
