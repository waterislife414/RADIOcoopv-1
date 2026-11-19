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
}) {
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState([]);
  const [searched, setSearched] = useState(false);
  const blurTimer = useRef(null);

  useEffect(() => {
    const query = String(value || "").trim();
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
  }, [value]);

  function handleBlur() {
    blurTimer.current = setTimeout(() => {
      setOpen(false);
    }, 200);
  }

  function handleFocus() {
    if (blurTimer.current) clearTimeout(blurTimer.current);
    if (results.length > 0) setOpen(true);
  }

  const showNotFound = searched && results.length === 0 && String(value || "").trim().length >= 6;

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
      {open && results.length > 0 && (
        <div className="absolute left-0 right-0 z-30 mt-1 bg-white border-2 border-slate-200 rounded-xl shadow-lg max-h-60 overflow-y-auto">
          {results.map((r, i) => (
            <button
              key={i}
              type="button"
              data-testid={`${testid}-option`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onPick(r);
                setOpen(false);
                setResults([]);
              }}
              className="w-full text-left px-4 py-3 hover:bg-slate-50 border-b border-slate-100 last:border-b-0 min-h-[48px]"
            >
              {r.name && <p className="font-semibold text-slate-800 text-base">{r.name}</p>}
              <p className="text-sm text-slate-500 truncate">{r.address}</p>
            </button>
          ))}
        </div>
      )}
      {showNotFound && open && (
        <p className="text-xs text-slate-500 mt-1.5">
          Can't find it? Type the full address, drop a pin, or{" "}
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
              String(value || "").trim() + " Columbus GA"
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 font-semibold underline"
          >
            search Google Maps
          </a>
        </p>
      )}
    </div>
  );
}
