/** Arrival windows. All times are America/New_York (ET) — Phenix City runs on Eastern. */
export type BookingWindow = { id: string; start: string; end: string; label: string };

export const BOOKING_WINDOWS: readonly BookingWindow[] = [
  { id: 'w0700', start: '07:00', end: '09:00', label: '7:00–9:00 AM ET' },
  { id: 'w0900', start: '09:00', end: '11:00', label: '9:00–11:00 AM ET' },
  { id: 'w1100', start: '11:00', end: '13:00', label: '11:00 AM–1:00 PM ET' },
  { id: 'w1300', start: '13:00', end: '15:00', label: '1:00–3:00 PM ET' },
  { id: 'w1500', start: '15:00', end: '17:00', label: '3:00–5:00 PM ET' },
];

export const WINDOW_BY_ID: ReadonlyMap<string, BookingWindow> = new Map(BOOKING_WINDOWS.map((w) => [w.id, w]));

export const SCHEDULING = {
  /** 0 = Sunday … 6 = Saturday. Mon–Sat open. */
  openWeekdays: [1, 2, 3, 4, 5, 6] as readonly number[],
  daysAhead: 21,
  /** Window must start at least this many minutes from now. */
  minLeadMinutes: 90,
} as const;
