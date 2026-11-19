import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { QRCodeCanvas, QRCodeSVG } from "qrcode.react";
import {
  BRAND,
  APP_URL,
  COMPANY_NAME,
  COMPANY_PHONE_DISPLAY,
  COMPANY_PHONE_TEL,
  OFFICE_ADDRESS,
  SERVICE_HOURS,
  COMPANY_WORDMARK,
  COPY,
} from "../config/constants";

// Real builds: the QR always points at the permanent live address in
// branding.config.json (company.appUrl), so printed signs never go stale.
// Demo build (T44): it opens the demo itself, because the live site doesn't run
// the demo version. Demo links expire, so signs are printed from the real build.
const IS_DEMO = import.meta.env.MODE === "demo";
const QR_TARGET = IS_DEMO ? window.location.origin + "/" : APP_URL;
const URL_LABEL = QR_TARGET.replace(/^https?:\/\//, "").replace(/\/$/, "");
const FILE_NAME = `${COMPANY_NAME.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-qr-code.png`;
const C = {
  ink: BRAND.colors.navy["950"],
  gold: BRAND.colors.gold["600"],
  goldLine: BRAND.colors.gold["400"],
  blue: BRAND.colors.blue["700"],
  gray: BRAND.colors.slate["600"],
};

// Printing shows ONLY the sign: the app is hidden, the sign fills one Letter page.
const PRINT_CSS = `
#qr-print-sheet { display: none; }
@media print {
  @page { size: letter portrait; margin: 0.4in; }
  html, body { background: #fff !important; }
  body > *:not(#qr-print-sheet) { display: none !important; }
  #qr-print-sheet { display: flex !important; }
}
`;

function Sign({ qrSize, print = false }) {
  const t = print
    ? { name: "text-[44pt]", tag: "text-[13pt]", hours: "text-[14pt]", hook: "text-[28pt]", sub: "text-[13pt]", scan: "text-[26pt]", phone: "text-[28pt]", url: "text-[12pt]", small: "text-[10pt]" }
    : { name: "text-3xl", tag: "text-xs", hours: "text-sm", hook: "text-2xl", sub: "text-sm", scan: "text-xl", phone: "text-xl", url: "text-xs", small: "text-xs" };
  return (
    <>
      <h1 className={`font-display font-bold ${t.name} text-navy-950 leading-none`}>{COMPANY_WORDMARK}</h1>
      <p className={`mt-1 ${t.tag} font-bold tracking-[0.35em] text-gold-600 uppercase`}>Taxi Service</p>
      <p className={`mt-2 ${t.hours} font-semibold text-blue-700`}>{SERVICE_HOURS}</p>
      <p className={`mt-5 font-display font-bold ${t.hook} leading-tight text-navy-950`}>{COPY.qrHook}</p>
      <p className={`${t.sub} text-slate-600 mt-2 leading-snug`}>{COPY.qrSubHook}</p>
      <div className="flex justify-center my-5">
        <div className="p-3 rounded-2xl border-2 border-gold-400 bg-white">
          <QRCodeSVG
            role="img"
            aria-label={`QR code that opens ${URL_LABEL}`}
            title={`Opens ${URL_LABEL}`}
            value={QR_TARGET}
            size={qrSize}
            fgColor={C.ink}
            bgColor="#FFFFFF"
            level="H"
            marginSize={2}
          />
        </div>
      </div>
      <p className={`font-display font-semibold ${t.scan} text-navy-950`}>Scan to Book a Ride</p>
      {print ? (
        <p className={`${t.phone} font-bold text-navy-950 mt-1`}>{COMPANY_PHONE_DISPLAY}</p>
      ) : (
        <a href={`tel:${COMPANY_PHONE_TEL}`} className={`inline-block ${t.phone} font-bold text-navy-950 mt-1 py-1 underline underline-offset-4 decoration-gold-400`}>
          {COMPANY_PHONE_DISPLAY}
        </a>
      )}
      <p className={`${t.url} font-semibold text-slate-700 mt-1 break-all`} data-testid="qr-url">{URL_LABEL}</p>
      <div className="w-12 h-[2px] bg-gold-500 mx-auto my-3" />
      <p className={`${t.small} text-slate-600`}>{OFFICE_ADDRESS}</p>
      <p className={`${t.small} text-slate-600 italic`}>*Terms and conditions apply.</p>
    </>
  );
}

// Draws the sign as a phone-friendly picture (Letter shape) for print shops, flyers and posts.
async function makeSignPicture(qrCanvas) {
  const W = 1275, H = 1650; // Letter at 150 dpi
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  try {
    await Promise.all([
      document.fonts.load('700 96px "Fraunces"'),
      document.fonts.load('600 60px "Fraunces"'),
      document.fonts.load('700 40px "Inter"'),
    ]);
  } catch {
    /* fall back to system fonts */
  }
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 6;
  ctx.strokeRect(24, 24, W - 48, H - 48);
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  const text = (s, y, font, color, maxW = W - 140) => {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.fillText(s, W / 2, y, maxW);
  };
  const wrap = (s, y, font, color, lineH, maxW = W - 220) => {
    ctx.font = font;
    const lines = [];
    let line = "";
    for (const word of String(s).split(" ")) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width > maxW && line) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    if (line) lines.push(line);
    lines.forEach((l, i) => text(l, y + i * lineH, font, color, maxW));
    return y + (lines.length - 1) * lineH;
  };

  text(COMPANY_WORDMARK, 170, '700 104px "Fraunces", Georgia, serif', C.ink);
  text("T A X I   S E R V I C E", 230, '700 32px "Inter", Arial, sans-serif', C.gold);
  text(SERVICE_HOURS, 290, '700 36px "Inter", Arial, sans-serif', C.blue);
  text(COPY.qrHook, 385, '700 68px "Fraunces", Georgia, serif', C.ink);
  const subEnd = wrap(COPY.qrSubHook, 445, '400 32px "Inter", Arial, sans-serif', C.gray, 42);

  const qr = 700;
  const qrX = (W - qr) / 2;
  const qrY = subEnd + 45;
  ctx.strokeStyle = C.goldLine;
  ctx.lineWidth = 6;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(qrX - 24, qrY - 24, qr + 48, qr + 48, 32);
  else ctx.rect(qrX - 24, qrY - 24, qr + 48, qr + 48);
  ctx.stroke();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(qrCanvas, qrX, qrY, qr, qr);

  let y = qrY + qr + 105;
  text("Scan to Book a Ride", y, '600 60px "Fraunces", Georgia, serif', C.ink);
  y += 82;
  text(COMPANY_PHONE_DISPLAY, y, '700 60px "Inter", Arial, sans-serif', C.ink);
  y += 50;
  text(URL_LABEL, y, '600 30px "Inter", Arial, sans-serif', C.gray);
  y += 52;
  text(OFFICE_ADDRESS, y, '400 28px "Inter", Arial, sans-serif', C.gray);
  y += 38;
  text("*Terms and conditions apply.", y, 'italic 400 24px "Inter", Arial, sans-serif', C.gray);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  return new File([blob], FILE_NAME, { type: "image/png" });
}

export default function QRCode() {
  const qrCanvas = useRef(null);
  const [picture, setPicture] = useState(null);
  const [note, setNote] = useState("");

  // Build the picture ahead of time so Save works on the first tap (phones only
  // allow sharing straight from a tap).
  useEffect(() => {
    let alive = true;
    if (!qrCanvas.current) return undefined;
    makeSignPicture(qrCanvas.current)
      .then((file) => alive && setPicture(file))
      .catch(() => alive && setPicture(null));
    return () => {
      alive = false;
    };
  }, []);

  const flash = (msg) => {
    setNote(msg);
    setTimeout(() => setNote(""), 3000);
  };

  const savePicture = async () => {
    if (!picture) return;
    try {
      if (navigator.canShare?.({ files: [picture] })) {
        await navigator.share({ files: [picture], title: COMPANY_NAME });
        return;
      }
    } catch (e) {
      if (e?.name === "AbortError") return;
    }
    const url = URL.createObjectURL(picture);
    const a = document.createElement("a");
    a.href = url;
    a.download = FILE_NAME;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    flash("Saved");
  };

  const shareLink = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: COMPANY_NAME, text: COPY.qrHook, url: QR_TARGET });
        return;
      }
    } catch (e) {
      if (e?.name === "AbortError") return;
    }
    try {
      await navigator.clipboard.writeText(QR_TARGET);
      flash("Link copied");
    } catch {
      flash(URL_LABEL);
    }
  };

  const btn = "min-h-[52px] rounded-xl font-bold text-base px-4 transition";

  return (
    <div className="min-h-screen bg-navy-950 bg-grain px-5 pt-10 pb-20 flex flex-col items-center relative overflow-hidden" data-testid="qr-page">
      <style>{PRINT_CSS}</style>
      <div className="absolute inset-0 bg-gradient-to-b from-navy-900/50 via-transparent to-navy-950" />

      <div className="relative bg-white rounded-3xl shadow-2xl px-6 py-8 max-w-sm w-full text-center" data-testid="qr-sign">
        <Sign qrSize={240} />
      </div>
      <QRCodeCanvas ref={qrCanvas} value={QR_TARGET} size={700} fgColor={C.ink} bgColor="#FFFFFF" level="H" marginSize={2} className="hidden" aria-hidden="true" />

      <div className="relative mt-6 w-full max-w-sm grid grid-cols-3 gap-2">
        <button type="button" onClick={() => window.print()} className={`${btn} bg-gradient-to-b from-gold-300 to-gold-500 text-navy-950`} data-testid="qr-print">
          Print
        </button>
        <button type="button" onClick={savePicture} disabled={!picture} className={`${btn} bg-white text-navy-950 disabled:opacity-50`} data-testid="qr-save">
          Save
        </button>
        <button type="button" onClick={shareLink} className={`${btn} bg-white text-navy-950`} data-testid="qr-share">
          Share
        </button>
      </div>
      {IS_DEMO && <p className="relative mt-3 text-xs text-gold-200">Demo code. Print signs from the live app.</p>}
      <p className="relative mt-3 min-h-[1.5rem] text-sm font-semibold text-gold-200" role="status" aria-live="polite">
        {note}
      </p>

      {createPortal(
        <div id="qr-print-sheet" className="w-full h-[10in] overflow-hidden flex-col items-center justify-center text-center bg-white border-[3px] border-navy-950 px-10 py-8">
          <Sign qrSize={420} print />
        </div>,
        document.body,
      )}
    </div>
  );
}
