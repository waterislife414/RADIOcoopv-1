const TAG_STYLES = {
  cash: "bg-slate-700 text-white",
  card: "bg-blue-600 text-white",
  transfer: "bg-emerald-600 text-white",
};

const DISPATCH_LABELS = {
  pending: "DISPATCH",
  dispatched: "ON THE WAY",
  in_transit: "MARK PICKED UP",
};

function customerName(ride) {
  if (ride.firstName || ride.lastName) {
    return `${ride.firstName || ""} ${ride.lastName || ""}`.trim();
  }
  return ride.customerId === "guest" ? "Guest" : "Customer";
}

function StatusBadge({ status }) {
  if (!status) {
    return (
      <span className="text-xs font-bold uppercase px-2.5 py-1 rounded-full bg-slate-200 text-slate-600">
        Guest
      </span>
    );
  }
  return (
    <span className="text-xs font-bold uppercase px-2.5 py-1 rounded-full bg-gold-400/20 text-gold-600 border border-gold-400/40">
      {status.tier ? `${status.tier} Member` : "Member"}
      {status.hasFreeRideNow ? " · Free Ride!" : ""}
    </span>
  );
}

// What auto-dispatch is doing with this ride, for the dispatcher.
function AutoDispatchLine({ ride, carFor }) {
  const car = (id) => (carFor?.(id) ? `Car ${carFor(id)}` : "a car");
  const zone = ride.zoneLabel || (ride.zoneId ? ride.zoneId : null);
  let text = null;
  let tone = "bg-slate-100 text-slate-700";
  if (ride.status === "pending") {
    switch (ride.dispatchState) {
      case "offering":
        text = `\u{1F4DE} Offering to ${car(ride.offer?.driverId)}${ride.offer?.kind === "requested" ? " (requested)" : ""} \u00b7 ping ${ride.offer?.pings ?? 1}`;
        tone = "bg-amber-100 text-amber-800";
        break;
      case "pending_next":
        text = "Finding the next car\u2026";
        break;
      case "broadcast":
        text = `\u{1F4E3} Need a car${zone ? ` in ${zone}` : ""} \u00b7 sent to ${ride.broadcastTo?.length || 0}`;
        tone = "bg-amber-100 text-amber-800";
        break;
      case "escalated":
        text = `\u26A0 No car took it${zone ? ` (${zone})` : ""} \u2014 dispatch by hand`;
        tone = "bg-red-100 text-red-800 font-bold";
        break;
      case "scheduled":
        text = ride.dispatchAt ? `Auto-dispatch at ${new Date(ride.dispatchAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : null;
        break;
      default:
        break;
    }
  } else if (ride.carNumber) {
    text = `\u{1F695} Car ${ride.carNumber}`;
    tone = "bg-emerald-100 text-emerald-800 font-bold";
  }
  if (!text && !(ride.status === "pending" && ride.zoneAssignedAt && !ride.zoneId)) return null;
  return (
    <div className="flex flex-wrap gap-2 text-sm">
      {text && <span className={`px-3 py-1 rounded-full ${tone}`}>{text}</span>}
      {ride.status === "pending" && ride.zoneAssignedAt && !ride.zoneId && (
        <span className="px-3 py-1 rounded-full bg-slate-200 text-slate-700">No zone found</span>
      )}
    </div>
  );
}

export default function RideCard({ ride, customerStatus, carFor, onDispatchAdvance, onDismiss, onCaptureFare, onChargeWallet, onArchive }) {
  const isPending = ride.status === "pending";
  const isInTransit = ride.status === "in_transit";
  const isFinished = ride.status === "finished";
  const dispatchLabel = DISPATCH_LABELS[ride.status];

  return (
    <div
      className={`border-2 rounded-2xl p-5 shadow-sm space-y-3 ${
        ride.needsAccessibleVehicle
          ? "bg-blue-50 border-blue-400"
          : "bg-white border-slate-200"
      }`}
    >
      {ride.needsAccessibleVehicle && (
        <div className="flex items-center justify-center gap-2 bg-blue-600 text-white font-extrabold text-lg rounded-xl py-2.5 -mt-1">
          <span aria-hidden="true" className="text-2xl">&#9855;</span>
          SEND ACCESSIBLE VAN
        </div>
      )}
      <div className="flex justify-between items-start gap-2">
        <div>
          <p className="font-bold text-lg text-slate-900">{customerName(ride)}</p>
          <div className="flex items-center gap-2">
            <StatusBadge status={customerStatus} />
            {ride.wantsPriorityPass && (
              <span className="text-xs font-bold uppercase px-2 py-0.5 rounded-full bg-gold-400 text-navy-950">
                &#9733; VIP Pass
              </span>
            )}
          </div>
        </div>
        <span
          className={`text-xs font-bold uppercase px-3 py-1.5 rounded-full shrink-0 ${
            TAG_STYLES[ride.paymentMethod] || "bg-slate-300 text-slate-800"
          }`}
        >
          {ride.paymentMethod}
        </span>
      </div>

      <AutoDispatchLine ride={ride} carFor={carFor} />

      <div className="space-y-1.5">
        <p className="text-lg font-bold text-slate-900 leading-snug">
          &#8593; {ride.pickup}
        </p>
        <p className="text-lg font-bold text-slate-900 leading-snug">
          &#8595; {ride.dropoff}
        </p>
      </div>

      <div className="text-sm text-slate-500 flex flex-wrap gap-x-4 gap-y-1">
        <span>{ride.passengers} pax</span>
        {ride.roundTrip && <span>Round trip</span>}
        {ride.stops?.length > 0 && (
          <span>
            {ride.stops.length} {ride.stops.length === 1 ? "Stop" : "Stops"}
          </span>
        )}
        {ride.estMiles > 0 && <span>{ride.estMiles} mi est.</span>}
        {ride.scheduleType === "later" && ride.scheduledFor && (
          <span>Scheduled: {new Date(ride.scheduledFor).toLocaleString()}</span>
        )}
      </div>

      {ride.phone && (
        <a href={`tel:${ride.phone}`} className="text-blue-600 text-base font-semibold block">
          {ride.phone}
        </a>
      )}

      {!isFinished && (
        <div className="flex gap-2 pt-1">
          {isPending && (
            <button
              onClick={() => onDismiss(ride)}
              className="flex-1 bg-red-50 text-red-700 font-bold text-base py-3 rounded-xl"
            >
              DISMISS
            </button>
          )}
          <button
            onClick={() => onDispatchAdvance(ride)}
            className="flex-[2] bg-gradient-to-b from-gold-300 to-gold-500 text-navy-950 font-bold text-base py-3 rounded-xl"
          >
            {dispatchLabel}
          </button>
        </div>
      )}

      {ride.paymentMethod === "cash" && (isInTransit || isFinished) && (
        <div className="space-y-2">
          <div className="text-center bg-slate-100 rounded-xl py-3 font-bold text-slate-700 text-base tracking-wide">
            PAYING WITH CASH
          </div>
          {isFinished && (
            <button
              onClick={() => onArchive(ride)}
              className="w-full text-sm font-semibold text-slate-400 hover:text-slate-600"
            >
              Mark Settled / Remove from Active
            </button>
          )}
        </div>
      )}

      {ride.paymentMethod !== "cash" && (isInTransit || isFinished) && ride.finalFare == null && (
        <div className="space-y-2">
          <div className="text-center bg-amber-50 text-amber-700 rounded-xl py-3 font-bold text-base">
            Awaiting Customer Checkout&hellip;
          </div>
          {ride.customerId && ride.customerId !== "guest" && (
            <button
              onClick={() => onChargeWallet(ride)}
              className="w-full border-2 border-blue-300 text-blue-700 font-semibold text-sm py-2.5 rounded-xl"
            >
              Charge Customer's Wallet Balance
            </button>
          )}
          <button
            onClick={() => onCaptureFare(ride)}
            className="w-full border-2 border-slate-300 text-slate-600 font-semibold text-sm py-2.5 rounded-xl"
          >
            Force Manual Capture (rider can't pay themselves)
          </button>
        </div>
      )}

      {ride.finalFare != null && (
        <div className="space-y-2">
          <div className="text-center bg-emerald-50 text-emerald-700 rounded-xl py-3 font-bold text-base">
            Settled: ${ride.finalFare.toFixed(2)}
            {ride.tipAmount > 0 && ` (Tip: $${ride.tipAmount.toFixed(2)})`}
            {ride.settledBy === "dispatcher_override" && " · Manual"}
          </div>
          {isFinished && (
            <button
              onClick={() => onArchive(ride)}
              className="w-full text-sm font-semibold text-slate-400 hover:text-slate-600"
            >
              Remove from Active
            </button>
          )}
        </div>
      )}
    </div>
  );
}
