import { QRCodeSVG } from "qrcode.react";
import {
  APP_URL,
  COMPANY_PHONE_DISPLAY,
  OFFICE_ADDRESS,
  SERVICE_HOURS,
  COMPANY_WORDMARK,
  COPY,
} from "../config/constants";

export default function QRCode() {
  return (
    <div className="min-h-screen bg-navy-950 bg-grain px-6 py-12 flex flex-col items-center print:bg-white print:py-0 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-navy-900/50 via-transparent to-navy-950 print:hidden" />
      <div className="absolute -top-32 -right-24 h-80 w-80 rounded-full bg-blue-600/20 blur-[100px] print:hidden" />
      <div className="absolute bottom-0 -left-20 h-72 w-72 rounded-full bg-gold-500/[0.08] blur-[100px] print:hidden" />

      <div className="relative bg-white rounded-3xl shadow-2xl p-10 max-w-sm w-full text-center print:shadow-none print:border-2 print:border-slate-800 print:rounded-none">
        <h1 className="font-display font-bold text-3xl text-navy-950 leading-none">
          {COMPANY_WORDMARK}
        </h1>
        <p className="mt-1 text-xs font-bold tracking-[0.35em] text-gold-600 uppercase">
          Taxi Service
        </p>
        <p className="mt-3 text-sm font-semibold text-blue-700">{SERVICE_HOURS}</p>

        <div className="mt-6 mb-1">
          <p className="font-display font-bold text-2xl leading-tight text-navy-950">
            {COPY.qrHook}
          </p>
          <p className="text-sm text-slate-600 mt-2 leading-snug">
            {COPY.qrSubHook}
          </p>
        </div>

        <div className="flex justify-center my-6">
          <div className="p-4 rounded-2xl border-2 border-gold-400">
            <QRCodeSVG
              value={APP_URL}
              size={200}
              fgColor="#0A1420"
              bgColor="#FFFFFF"
              level="M"
              includeMargin
            />
          </div>
        </div>

        <p className="font-display font-semibold text-xl text-navy-950 mb-1">
          Scan to Book a Ride
        </p>
        <p className="text-base text-slate-500 mb-4">{COMPANY_PHONE_DISPLAY}</p>
        <div className="w-12 h-[2px] bg-gold-500 mx-auto mb-4" />
        <p className="text-xs text-slate-400 mb-1">{OFFICE_ADDRESS}</p>
        <p className="text-[10px] text-slate-400 italic">
          *Terms and conditions apply.
        </p>
      </div>

      <button
        onClick={() => window.print()}
        className="relative mt-8 bg-gradient-to-b from-gold-300 to-gold-500 hover:from-gold-300 hover:to-gold-400 text-navy-950 font-bold text-base px-8 py-3.5 rounded-xl shadow-luxury transition hover:-translate-y-0.5 print:hidden"
      >
        Print QR Sheet
      </button>
    </div>
  );
}
