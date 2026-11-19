/**
 * Isomorphic QR utility (works in Server Components and the browser).
 * - qrSvg(): crisp vector SVG with optional caption baked in (print/vinyl-ready).
 * - withUtm(): consistent UTM tagging for offline placements.
 * PNG export lives in lib/qr-png.ts (browser canvas) so labels render at any resolution.
 */
import QRCode from 'qrcode';

export type QrOptions = {
  label?: string;
  sublabel?: string;
  fg?: string;
  bg?: string;
  /** Quiet zone in modules. Keep ≥ 2 for print; 4 is spec. */
  margin?: number;
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
};

export type Utm = { source: string; medium?: string; campaign?: string; content?: string };

export function withUtm(url: string, utm: Utm): string {
  const u = new URL(url);
  u.searchParams.set('utm_source', utm.source);
  u.searchParams.set('utm_medium', utm.medium ?? 'qr');
  if (utm.campaign) u.searchParams.set('utm_campaign', utm.campaign);
  if (utm.content) u.searchParams.set('utm_content', utm.content);
  return u.toString();
}

const escapeXml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export async function qrMatrix(text: string, ecl: QrOptions['errorCorrectionLevel'] = 'M') {
  const qr = QRCode.create(text, { errorCorrectionLevel: ecl });
  return { size: qr.modules.size, isDark: (r: number, c: number) => Boolean(qr.modules.get(r, c)) };
}

/** Vector SVG: one <path> of 1×1 module squares, optional caption block below. */
export async function qrSvg(text: string, opts: QrOptions = {}): Promise<string> {
  const { fg = '#0F172A', bg = '#FFFFFF', margin = 4, errorCorrectionLevel = 'M', label, sublabel } = opts;
  const { size, isDark } = await qrMatrix(text, errorCorrectionLevel);
  const dim = size + margin * 2;
  let d = '';
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (isDark(r, c)) d += `M${c + margin} ${r + margin}h1v1h-1z`;
    }
  }
  const labelH = label ? (sublabel ? dim * 0.26 : dim * 0.17) : 0;
  const h = dim + labelH;
  const fontSize = dim * 0.085;
  const subSize = dim * 0.055;
  const text1 = label
    ? `<text x="${dim / 2}" y="${dim + fontSize * 0.95}" text-anchor="middle" font-family="Archivo, Arial, Helvetica, sans-serif" font-weight="800" font-size="${fontSize.toFixed(2)}" fill="${fg}">${escapeXml(label)}</text>`
    : '';
  const text2 = label && sublabel
    ? `<text x="${dim / 2}" y="${dim + fontSize * 0.95 + subSize * 1.5}" text-anchor="middle" font-family="Archivo, Arial, Helvetica, sans-serif" font-weight="500" font-size="${subSize.toFixed(2)}" fill="${fg}">${escapeXml(sublabel)}</text>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${h.toFixed(2)}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="${bg}"/><path fill="${fg}" d="${d}"/>${text1}${text2}</svg>`;
}

export function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
