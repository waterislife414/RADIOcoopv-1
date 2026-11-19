import { useState } from 'react';

export default function ManualAddress({ testid = 'manual-address', onDone, onCancel }) {
  const [street, setStreet] = useState('');
  const [apt, setApt] = useState('');
  const [city, setCity] = useState('');
  const [zip, setZip] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const trimmedStreet = street.trim();
  const trimmedCity = city.trim();
  const trimmedZip = zip.trim();

  const hasNumber = /^\d/.test(trimmedStreet);
  const isValidZip = /^\d{5}$/.test(trimmedZip);
  const isValid = hasNumber && trimmedStreet.length > 0 && trimmedCity.length > 0 && isValidZip;

  const zipNum = parseInt(trimmedZip, 10);
  const state = (zipNum >= 35000 && zipNum <= 36999) ? 'AL' : 'GA';

  async function handleUse() {
    if (!isValid || busy) return;
    setBusy(true);
    setErrorMsg('');

    const text = `${trimmedStreet}${apt.trim() ? ' Apt ' + apt.trim() : ''}, ${trimmedCity}, ${state} ${trimmedZip}`;
    
    let lat = null;
    let lng = null;

    try {
      const attempt = `${text}`;
      const url =
        "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress" +
        `?address=${encodeURIComponent(attempt)}&benchmark=4&format=json`;
      const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
      if (res.ok) {
        const json = await res.json();
        const match = json?.result?.addressMatches?.[0];
        if (match?.coordinates) {
          lat = match.coordinates.y;
          lng = match.coordinates.x;
        }
      }
    } catch (err) {
      console.warn("Geocode failed:", err.message);
    }

    if (lat == null || lng == null) {
      setErrorMsg("We couldn't place this on the map. Your driver will use the address.");
      setTimeout(() => {
        setBusy(false);
        onDone?.({ text, lat: null, lng: null });
      }, 1500);
    } else {
      setBusy(false);
      onDone?.({ text, lat, lng });
    }
  }

  return (
    <div className="space-y-4 p-4 bg-white rounded-2xl shadow-sm border border-slate-200" data-testid={testid}>
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1">Street number and name</label>
        <input
          type="text"
          value={street}
          onChange={(e) => setStreet(e.target.value)}
          placeholder="123 Main St"
          className="w-full border-2 border-slate-300 rounded-xl px-4 py-3 text-base text-slate-900 focus:outline-none focus:border-blue-600"
          data-testid={`${testid}-street`}
        />
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1">Apt or unit (optional)</label>
        <input
          type="text"
          value={apt}
          onChange={(e) => setApt(e.target.value)}
          placeholder="Apt 4B"
          className="w-full border-2 border-slate-300 rounded-xl px-4 py-3 text-base text-slate-900 focus:outline-none focus:border-blue-600"
          data-testid={`${testid}-apt`}
        />
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1">City</label>
        <input
          type="text"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder="Columbus"
          className="w-full border-2 border-slate-300 rounded-xl px-4 py-3 text-base text-slate-900 focus:outline-none focus:border-blue-600"
          data-testid={`${testid}-city`}
        />
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1">ZIP</label>
        <input
          type="text"
          inputMode="numeric"
          maxLength={5}
          value={zip}
          onChange={(e) => setZip(e.target.value.replace(/\D/g, '').slice(0, 5))}
          placeholder="31901"
          className="w-full border-2 border-slate-300 rounded-xl px-4 py-3 text-base text-slate-900 focus:outline-none focus:border-blue-600"
          data-testid={`${testid}-zip`}
        />
      </div>

      {errorMsg && (
        <p className="text-sm text-amber-600 font-medium">{errorMsg}</p>
      )}

      <div className="pt-2 flex flex-col gap-3">
        <button
          type="button"
          disabled={!isValid || busy}
          onClick={handleUse}
          className={`w-full min-h-[48px] rounded-xl font-bold text-base px-6 transition-colors ${
            isValid && !busy
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-slate-200 text-slate-400 cursor-not-allowed'
          }`}
          data-testid={`${testid}-use`}
        >
          {busy ? 'Checking address...' : 'Use this address'}
        </button>

        <button
          type="button"
          onClick={onCancel}
          className="text-sm font-semibold text-slate-600 hover:text-slate-900 text-center py-2"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
