const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const usdWhole = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export function formatCents(cents: number): string {
  return usd.format(cents / 100);
}

/** $89 instead of $89.00 when whole-dollar. */
export function formatCentsShort(cents: number): string {
  return cents % 100 === 0 ? usdWhole.format(cents / 100) : usd.format(cents / 100);
}

/** "12.5" | "$12.50" → 1250. Returns null for invalid input. */
export function dollarsToCents(input: string | number): number | null {
  const n = typeof input === 'number' ? input : Number(String(input).replace(/[$,\s]/g, ''));
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

export const ppmToPercent = (ppm: number) => ppm / 10_000;
export const percentToPpm = (pct: number) => Math.round(pct * 10_000);
export const formatPpm = (ppm: number) => `${(ppm / 10_000).toFixed(3).replace(/0+$/, '').replace(/\.$/, '')}%`;
