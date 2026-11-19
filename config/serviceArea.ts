/**
 * Mobile service coverage. Distances are approximate road-agnostic miles from the 36869 base
 * and should be sanity-checked by Kyle. Add/remove ZIPs freely; eligibility = approxMiles <= radiusMiles.
 */
export const SERVICE_AREA = {
  originZip: '36869',
  radiusMiles: 25,
} as const;

export type ZipEntry = {
  zip: string;
  city: string;
  state: 'AL' | 'GA';
  approxMiles: number;
  /** Force-include or force-exclude regardless of distance. */
  override?: 'include' | 'exclude';
};

export const SERVICE_ZIPS: readonly ZipEntry[] = [
  // Alabama
  { zip: '36869', city: 'Phenix City / Ladonia', state: 'AL', approxMiles: 0 },
  { zip: '36867', city: 'Phenix City', state: 'AL', approxMiles: 4 },
  { zip: '36868', city: 'Phenix City (PO Boxes)', state: 'AL', approxMiles: 4 },
  { zip: '36870', city: 'Phenix City (North / Lee Co.)', state: 'AL', approxMiles: 9 },
  { zip: '36875', city: 'Seale', state: 'AL', approxMiles: 11 },
  { zip: '36877', city: 'Smiths Station', state: 'AL', approxMiles: 14 },
  { zip: '36856', city: 'Fort Mitchell', state: 'AL', approxMiles: 14 },
  { zip: '36874', city: 'Salem', state: 'AL', approxMiles: 20 },
  { zip: '36858', city: 'Hatchechubbee', state: 'AL', approxMiles: 21 },
  { zip: '36860', city: 'Hurtsboro', state: 'AL', approxMiles: 27 },
  { zip: '36801', city: 'Opelika', state: 'AL', approxMiles: 29 },
  { zip: '36804', city: 'Opelika (South)', state: 'AL', approxMiles: 27 },
  { zip: '36830', city: 'Auburn', state: 'AL', approxMiles: 33 },
  // Georgia
  { zip: '31901', city: 'Columbus (Downtown)', state: 'GA', approxMiles: 5 },
  { zip: '31902', city: 'Columbus (PO Boxes)', state: 'GA', approxMiles: 5 },
  { zip: '31903', city: 'Columbus (South)', state: 'GA', approxMiles: 7 },
  { zip: '31906', city: 'Columbus (Midtown)', state: 'GA', approxMiles: 8 },
  { zip: '31904', city: 'Columbus (North)', state: 'GA', approxMiles: 10 },
  { zip: '31907', city: 'Columbus (East)', state: 'GA', approxMiles: 11 },
  { zip: '31905', city: 'Fort Benning (formerly Fort Moore)', state: 'GA', approxMiles: 12 },
  { zip: '31909', city: 'Columbus (Northeast)', state: 'GA', approxMiles: 14 },
  { zip: '31829', city: 'Upatoi', state: 'GA', approxMiles: 15 },
  { zip: '31820', city: 'Midland', state: 'GA', approxMiles: 16 },
  { zip: '31808', city: 'Fortson', state: 'GA', approxMiles: 19 },
  { zip: '31804', city: 'Cataula', state: 'GA', approxMiles: 22 },
  { zip: '31805', city: 'Cusseta', state: 'GA', approxMiles: 24 },
  { zip: '31811', city: 'Hamilton', state: 'GA', approxMiles: 25 },
  { zip: '31822', city: 'Pine Mountain', state: 'GA', approxMiles: 32 },
];

export type CoverageResult =
  | { status: 'mobile'; entry: ZipEntry; calloutFeeCents: number }
  | { status: 'shop-only'; entry: ZipEntry | null; reason: 'outside-radius' | 'not-listed' }
  | { status: 'invalid' };

export const isZip = (v: string) => /^\d{5}$/.test(v.trim());

export function findZip(zip: string): ZipEntry | null {
  return SERVICE_ZIPS.find((z) => z.zip === zip.trim()) ?? null;
}

export function isMobileEligible(entry: ZipEntry): boolean {
  if (entry.override === 'include') return true;
  if (entry.override === 'exclude') return false;
  return entry.approxMiles <= SERVICE_AREA.radiusMiles;
}

export function checkCoverage(zip: string, calloutFeeCents: number): CoverageResult {
  if (!isZip(zip)) return { status: 'invalid' };
  const entry = findZip(zip);
  if (!entry) return { status: 'shop-only', entry: null, reason: 'not-listed' };
  if (!isMobileEligible(entry)) return { status: 'shop-only', entry, reason: 'outside-radius' };
  return { status: 'mobile', entry, calloutFeeCents };
}

export const MOBILE_ZIPS = SERVICE_ZIPS.filter(isMobileEligible);
