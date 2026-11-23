import { useEffect, useState, useRef } from "react";
import { searchPlaces } from "../lib/placeSearch";

export default function AddressSearch({
  id,
  value,
  onChange,
  onPick,
  placeholder,
  className,
  testid,
  onPin,
  recents = [],
}) {
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState([]);
  const [searched, setSearched] = useState(false);
  const blurTimer = useRef(null);

  const trimmed = String(value || "").trim();
  const showRecents = open && trimmed.length < 3 && recents.length > 0;
  // Recents are strings, or { text, lat, lng } when the map point was saved too.
  const activeResults = showRecents ? recents.map((p) => (typeof p === "string" ? { address: p } : { address: p.text, lat: p.lat, lng: p.lng })) : results;

  useEffect(() => {
    const query = trimmed;
    if (query.length < 3) {
      setResults([]);
      setSearched(false);
      return;
    }
    const controller = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await searchPlaces(query, controller.signal);
        setResults(res);
        setSearched(true);
      } catch {
        setResults([]);
        setSearched(true);
      }
    }, 350);

    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [trimmed]);

  function handleBlur() {
    blurTimer.current = setTimeout(() => {
      setOpen(false);
    }, 200);
  }

  function handleFocus() {
    if (blurTimer.current) clearTimeout(blurTimer.current);
    setOpen(true);
  }

  const showNotFound = searched && results.length === 0 && trimmed.length >= 6;

  return (
    <div className="relative">
      <input
        id={id}
        type="text"
        className={className}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={handleFocus}
        onBlur={handleBlur}
      />
      {open && activeResults.length > 0 && (
        <div className="absolute left-0 right-0 z-30 mt-1 bg-white border-2 border-slate-200 rounded-xl shadow-lg max-h-60 overflow-y-auto">
          {showRecents && <p className="px-4 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">Recent places</p>}
          {activeResults.map((r, i) => (
            <button
              key={i}
              type="button"
              data-testid={`${testid}-option`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                if (showRecents) {
                  // A recent with its map point is a full pick; otherwise just the text.
                  if (typeof r.lat === "number") onPick({ text: r.address, address: r.address, lat: r.lat, lng: r.lng });
                  else onChange(r.address);
                } else {
                  // For search results, call onPick with the result object
                  onPick(r);
                }
                setOpen(false);
                setResults([]);
              }}
              className="w-full text-left px-4 py-3 hover:bg-slate-50 border-b border-slate-100 last:border-b-0 min-h-[48px]"
            >
              {r.name && <p className="font-semibold text-slate-800 text-base">{r.name}</p>}
              <p className="text-sm text-slate-500 truncate">{r.address}</p>
            </button>
          ))}
          {onPin && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setOpen(false);
                onPin();
              }}
              className="w-full text-left px-4 py-3 hover:bg-slate-50 min-h-[48px] text-base font-semibold text-blue-600"
            >
              &#128205; Drop a pin on the map
            </button>
          )}
        </div>
      )}
      {(showNotFound || (onPin && trimmed.length < 3)) && open && !(activeResults.length > 0) && (
        <p className="text-xs text-slate-500 mt-1.5 flex items-center justify-between">
          <span>
            {showNotFound ? "Can't find it? Type full address or" : "Type address or"}
          </span>
          {onPin && (
            <button
              type="button"
              onClick={onPin}
              className="text-blue-600 font-semibold underline"
            >
              drop a pin
            </button>
          )}
        </p>
      )}
    </div>
  );
}
