import { BUSINESS } from '@/config/business';
import { BOOKING_WINDOWS, SCHEDULING, type BookingWindow } from '@/config/scheduling';

export const TZ = BUSINESS.timeZone;

type Parts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

function partsInZone(date: Date, timeZone: string): Parts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const map: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) map[p.type] = p.value;
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

/** Offset (ms) of `timeZone` from UTC at the given instant. */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const p = partsInZone(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** Wall-clock date + time in `timeZone` → UTC Date. DST-safe (two-pass). */
export function zonedToUtc(dateISO: string, timeHHmm: string, timeZone: string = TZ): Date {
  const [y, m, d] = dateISO.split('-').map(Number) as [number, number, number];
  const [hh, mm] = timeHHmm.split(':').map(Number) as [number, number];
  const guess = Date.UTC(y, m - 1, d, hh, mm, 0);
  let utc = guess - zoneOffsetMs(new Date(guess), timeZone);
  utc = guess - zoneOffsetMs(new Date(utc), timeZone);
  return new Date(utc);
}

/** YYYY-MM-DD for "today" in ET. */
export function todayISO(now: Date = new Date()): string {
  const p = partsInZone(now, TZ);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

export function addDaysISO(dateISO: string, days: number): string {
  const [y, m, d] = dateISO.split('-').map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function weekdayOfISO(dateISO: string): number {
  const [y, m, d] = dateISO.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function isOpenDay(dateISO: string): boolean {
  return SCHEDULING.openWeekdays.includes(weekdayOfISO(dateISO));
}

/** Upcoming open dates (ET), starting today. */
export function upcomingOpenDates(count: number = SCHEDULING.daysAhead, now: Date = new Date()): string[] {
  const out: string[] = [];
  let cursor = todayISO(now);
  for (let i = 0; out.length < count && i < count * 2; i++) {
    if (isOpenDay(cursor)) out.push(cursor);
    cursor = addDaysISO(cursor, 1);
  }
  return out;
}

export function windowRange(dateISO: string, w: BookingWindow): { start: Date; end: Date } {
  return { start: zonedToUtc(dateISO, w.start), end: zonedToUtc(dateISO, w.end) };
}

/** True when the window starts at least minLeadMinutes from now. */
export function isWindowBookable(dateISO: string, w: BookingWindow, now: Date = new Date()): boolean {
  if (!isOpenDay(dateISO)) return false;
  const { start } = windowRange(dateISO, w);
  return start.getTime() - now.getTime() >= SCHEDULING.minLeadMinutes * 60_000;
}

export function isDateInBookingRange(dateISO: string, now: Date = new Date()): boolean {
  const today = todayISO(now);
  const last = addDaysISO(today, SCHEDULING.daysAhead * 2);
  return dateISO >= today && dateISO <= last;
}

export const allWindows = BOOKING_WINDOWS;

const dateLabelFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' });
const longDateFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

/** Label for a date-only ISO string (rendered without TZ shift). */
export function formatDateISO(dateISO: string, long = false): string {
  const [y, m, d] = dateISO.split('-').map(Number) as [number, number, number];
  return (long ? longDateFmt : dateLabelFmt).format(new Date(Date.UTC(y, m - 1, d)));
}

const etDateTimeFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

export function formatET(date: Date | string): string {
  return `${etDateTimeFmt.format(typeof date === 'string' ? new Date(date) : date)} ET`;
}
