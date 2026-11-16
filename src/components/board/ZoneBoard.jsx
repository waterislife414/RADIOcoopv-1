import { buildBoard } from "../../../functions/lib/dispatchCore.mjs";

const DOT = {
  green: "bg-orange-500 text-white", // on a call
  red: "bg-green-600 text-white", // ready, waiting in line
  "blue-ring": "border-[5px] border-blue-400 bg-transparent",
  "blue-filled": "bg-blue-500 text-white",
  moving: "bg-blue-600 text-white",
};
const TITLE = { green: "On a call", red: "Ready", "blue-ring": "You", "blue-filled": "You (on call)", moving: "Moving" };

function Dot({ d, kind, showCars, dark, onClick, gpsWarn = null }) {
  const size = showCars ? "h-9 min-w-9 px-1.5 text-sm" : "h-7 w-7";
  const offered =
    d.status === "offered"
      ? `ring-2 ring-amber-400 ring-offset-2 ${dark ? "ring-offset-navy-950" : "ring-offset-white"} animate-pulse`
      : "";
  const radio = d.radioOnly ? "outline outline-2 outline-dashed outline-slate-500 outline-offset-1" : "";
  const Tag = onClick ? "button" : "span";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick ? () => onClick(d) : undefined}
      title={`${showCars ? `Car ${d.carNumber}${d.radioOnly ? " (radio)" : ""} · ` : ""}${
        d.status === "offered" ? "Being offered a call" : d.radioCall ? "On a radio call" : TITLE[kind]
      }${gpsWarn ? ` · GPS shows ${gpsWarn}` : ""}`}
      className={`relative inline-flex items-center justify-center rounded-full font-bold ${size} ${DOT[kind]} ${offered} ${radio} ${onClick ? "hover:scale-110 transition" : ""}`}
    >
      {showCars ? d.carNumber : null}
      {showCars && d.radioCall && (
        <span className="absolute -top-2 -right-2 text-xs" aria-label="radio call">
          {"\u{1F4FB}"}
        </span>
      )}
      {showCars && gpsWarn && (
        <span className="absolute -bottom-1.5 -right-1.5 h-4 w-4 rounded-full bg-amber-400 text-navy-950 text-[10px] leading-4 font-extrabold" aria-label={`GPS shows ${gpsWarn}`}>
          !
        </span>
      )}
    </Tag>
  );
}

/**
 * The pegboard. Each zone: green (on call) first, then red (waiting) in line
 * order. Driver view: own dot is blue (ring = waiting, filled = on call), no
 * car numbers, and only zones he's certified for. Dispatcher view: car numbers.
 */
export default function ZoneBoard({ drivers, zones, viewer = null, variant = "driver", onCarClick = null, gps = null }) {
  const dark = variant === "driver";
  const showCars = variant === "dispatcher";
  const { moving, rows } = buildBoard({ drivers, zones, viewerId: viewer?.id ?? null, viewer });
  // Dispatcher view: flag an app driver whose phone is in a different zone than his spot on the board.
  const gpsWarnFor = (d) => {
    const g = gps?.[d.id];
    if (!g?.zoneId || !d.zoneId || d.radioOnly || g.zoneId === d.zoneId || Date.now() - (g.at || 0) > 5 * 60000) return null;
    return zones.find((z) => z.id === g.zoneId)?.label || "another zone";
  };

  const rowCls = dark ? "border-white/10" : "border-slate-200";
  const labelCls = dark ? "text-slate-200" : "text-slate-700";
  const muted = dark ? "text-slate-600" : "text-slate-500";

  return (
    <div className={dark ? "" : "bg-white rounded-2xl border border-slate-200 p-4"}>
      <div className={`flex items-center gap-3 py-2.5 border-b ${rowCls}`}>
        <span className={`w-32 shrink-0 font-bold ${dark ? "text-sky-300" : "text-sky-700"}`}>{"\u{1F695}"} Moving</span>
        <div className="flex flex-wrap gap-1.5">
          {moving.length === 0 && <span className={muted}>&mdash;</span>}
          {moving.map((d) => (
            <Dot key={d.id} d={d} kind={viewer && d.id === viewer.id ? "blue-ring" : "moving"} showCars={showCars} dark={dark} onClick={onCarClick} />
          ))}
        </div>
      </div>

      {rows.map((r) => (
        <div key={r.zoneId} className={`flex items-center gap-3 py-2.5 border-b last:border-b-0 ${rowCls}`}>
          <span className={`w-32 shrink-0 font-semibold ${r.line.length ? labelCls : muted}`}>{r.label}</span>
          <div className="flex flex-wrap gap-1.5">
            {r.line.length === 0 && <span className={muted}>&mdash;</span>}
            {r.line.map((d) => (
              <Dot
                key={d.id}
                d={d}
                kind={d.dot}
                showCars={showCars}
                dark={dark}
                onClick={onCarClick}
                gpsWarn={gpsWarnFor(d)}
              />
            ))}
          </div>
        </div>
      ))}

      {!dark && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 pt-3 text-xs text-slate-500" data-testid="board-key">
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-green-600" />Ready, waiting in line (first on the left)</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-green-600 ring-2 ring-amber-400 ring-offset-1" />Being offered a call</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-orange-500" />On a call</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-blue-600" />Moving</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full outline outline-2 outline-dashed outline-slate-500" />Radio-only car</span>
        </div>
      )}
      {dark && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 pt-3 text-xs text-slate-500">
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-orange-500" />On call</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-green-600" />Ready</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full border-[3px] border-blue-400" />Your spot</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-blue-500" />You, on call</span>
        </div>
      )}
    </div>
  );
}
