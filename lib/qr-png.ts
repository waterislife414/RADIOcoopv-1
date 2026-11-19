/** Browser-only: high-res PNG with caption, rendered on canvas from the QR matrix. */
import { qrMatrix, type QrOptions } from '@/lib/qr';

export async function qrPngBlob(text: string, opts: QrOptions & { sizePx?: number } = {}): Promise<Blob> {
  const { fg = '#0F172A', bg = '#FFFFFF', margin = 4, errorCorrectionLevel = 'M', label, sublabel, sizePx = 2048 } = opts;
  const { size, isDark } = await qrMatrix(text, errorCorrectionLevel);
  const dim = size + margin * 2;
  const scale = Math.max(1, Math.floor(sizePx / dim));
  const w = dim * scale;
  const labelH = label ? Math.round(w * (sublabel ? 0.26 : 0.17)) : 0;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = w + labelH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = fg;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (isDark(r, c)) ctx.fillRect((c + margin) * scale, (r + margin) * scale, scale, scale);
    }
  }
  if (label) {
    await document.fonts?.ready;
    const fs = Math.round(w * 0.085);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.font = `800 ${fs}px "Archivo Variable", Archivo, Arial, sans-serif`;
    ctx.fillText(label, w / 2, w + fs * 0.95, w * 0.94);
    if (sublabel) {
      const ss = Math.round(w * 0.055);
      ctx.font = `500 ${ss}px "Archivo Variable", Archivo, Arial, sans-serif`;
      ctx.fillText(sublabel, w / 2, w + fs * 0.95 + ss * 1.5, w * 0.94);
    }
  }
  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encode failed'))), 'image/png'),
  );
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
