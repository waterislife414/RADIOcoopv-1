import { buildBoard } from "../../../functions/lib/dispatchCore.mjs";

const DOT = {
  green: "bg-emerald-500 text-white",
  red: "bg-red-500 text-white",
  "blue-ring": "border-[5px] border-blue-400 bg-transparent",
  "blue-filled": "bg-blue-500 text-white",
  moving: "bg-slate-400 text-white",
};
const TITLE = { green: "On call", red: "Waiting", "blue-ring": "You", "blue-filled": "You (on call)", moving: "Moving" };

function Dot({ d, kind, showCars, dark, onClick }) {
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
      title={`${showCars ? `Car ${d.carNumber}${d.radioOnly ? " (radio)" : ""} · ` : ""}${d.status === "offered" ? "Being offered a call" : TITLE[kind]}`}
      className={`inline-flex items-center justify-center rounded-full font-bold ${size} ${DOT[kind]} ${offered} ${radio} ${onClick ? "hover:scale-110 transition" : ""}`}
    >
      {showCars ? d.carNumber : null}
    </Tag>
  );
}

/**
 * The pegboard. Each zone: green (on call) first, then red (waiting) in line
 * order. Driver view: own dot is blue (ring = waiting, filled = on call), no
 * car numbers, and only zones he's certified for. Dispatcher view: car numbers.
 */
export default function ZoneBoard({ drivers, zones, viewer = null, variant = "driver", onCarClick = null }) {
  const dark = variant === "driver";
  const showCars = variant === "dispatcher";
  const { moving, rows } = buildBoard({ drivers, zones, viewerId: viewer?.id ?? null, viewer });

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
              <Dot key={d.id} d={d} kind={d.dot} showCars={showCars} dark={dark} onClick={onCarClick} />
            ))}
          </div>
        </div>
      ))}

      {dark && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 pt-3 text-xs text-slate-500">
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-emerald-500" />On call</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-red-500" />Waiting</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full border-[3px] border-blue-400" />Your spot</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-blue-500" />You, on call</span>
        </div>
      )}
    </div>
  );
}
