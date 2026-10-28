import { restaurant, type Weekday, type WeeklyHours } from './restaurant';

const WEEKDAYS: Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MINUTE = 60_000;

interface ZonedParts {
  weekday: Weekday;
  /** Minutes since local midnight. */
  minutes: number;
}

export function zonedParts(date: Date, timeZone: string = restaurant.timeZone): ZonedParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const weekday = get('weekday').slice(0, 3).toLowerCase() as Weekday;
  return { weekday, minutes: Number(get('hour')) * 60 + Number(get('minute')) };
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** Windows for one weekday as minute ranges; a close at or before the open runs past midnight. */
function windowsFor(day: Weekday, hours: WeeklyHours): [number, number][] {
  return hours[day].map(([open, close]) => {
    const start = toMinutes(open);
    let end = toMinutes(close);
    if (end <= start) end += 24 * 60;
    return [start, end];
  });
}

/**
 * Minutes until closing if the restaurant is open at `date`, otherwise null.
 */
export function minutesUntilClose(
  date: Date,
  hours: WeeklyHours = restaurant.hours,
  timeZone: string = restaurant.timeZone,
): number | null {
  const { weekday, minutes } = zonedParts(date, timeZone);
  const today = WEEKDAYS.indexOf(weekday);
  const yesterday = WEEKDAYS[(today + 6) % 7];
  for (const [start, end] of windowsFor(weekday, hours)) {
    if (minutes >= start && minutes < end) return end - minutes;
  }
  // A window that started yesterday and runs past midnight.
  for (const [start, end] of windowsFor(yesterday, hours)) {
    const shifted = minutes + 24 * 60;
    if (end > 24 * 60 && shifted >= start && shifted < end) return end - shifted;
  }
  return null;
}

export function isOpen(date: Date, hours: WeeklyHours = restaurant.hours): boolean {
  return minutesUntilClose(date, hours) !== null;
}

/** True while online orders are accepted: open, and not inside the last-order cutoff. */
export function isAcceptingOrders(date: Date, hours: WeeklyHours = restaurant.hours): boolean {
  const left = minutesUntilClose(date, hours);
  return left !== null && left > restaurant.lastOrderMinutesBeforeClose;
}

function localDateKey(date: Date, timeZone: string = restaurant.timeZone): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

/**
 * Pickup times customers can choose today, every `step` minutes, starting after the
 * kitchen's prep time and ending at the last-order cutoff. Only the current or next opening
 * window of the same day is offered, so a time label never means tomorrow.
 */
export function pickupSlots(
  now: Date,
  { step = 15, hours = restaurant.hours }: { step?: number; hours?: WeeklyHours } = {},
): string[] {
  const earliest = now.getTime() + restaurant.prepMinutes * MINUTE;
  // Time zone offsets are whole quarter hours, so rounding in UTC lands on local quarter hours.
  let t = Math.ceil(earliest / (step * MINUTE)) * step * MINUTE;
  const slots: string[] = [];
  const limit = now.getTime() + 24 * 60 * MINUTE;
  const today = localDateKey(now);
  const openNow = minutesUntilClose(now, hours) !== null;
  while (t < limit && slots.length < 96) {
    const slot = new Date(t);
    if (!openNow && slots.length === 0 && localDateKey(slot) !== today) break;
    const left = minutesUntilClose(slot, hours);
    if (left !== null && left >= restaurant.lastOrderMinutesBeforeClose) {
      slots.push(slot.toISOString());
    } else if (slots.length > 0) {
      break;
    }
    t += step * MINUTE;
  }
  return slots;
}

export function formatTime(date: Date | string, timeZone: string = restaurant.timeZone): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
  }).format(typeof date === 'string' ? new Date(date) : date);
}

function formatClock(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  const suffix = h < 12 || h === 24 ? 'AM' : 'PM';
  return `${hour12}:${String(m).padStart(2, '0')} ${suffix}`;
}

function windowLabel([open, close]: [string, string]): string {
  if (open === '00:00' && (close === '24:00' || close === '00:00')) return 'Open 24 hours';
  return `${formatClock(open)} – ${formatClock(close)}`;
}

/** "11:00 AM – 9:00 PM" for the restaurant's local day containing `date`. */
export function hoursLabel(date: Date, hours: WeeklyHours = restaurant.hours): string {
  const { weekday } = zonedParts(date);
  const windows = hours[weekday];
  if (windows.length === 0) return 'Closed today';
  return windows.map(windowLabel).join(', ');
}

/** Rows for an hours table, grouping days with the same windows. */
export function weeklyHoursRows(hours: WeeklyHours = restaurant.hours): { days: string; hours: string }[] {
  const names: Record<Weekday, string> = {
    mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun',
  };
  const order: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const label = (d: Weekday) =>
    hours[d].length === 0
      ? 'Closed'
      : hours[d].map(windowLabel).join(', ');
  const rows: { days: Weekday[]; hours: string }[] = [];
  for (const day of order) {
    const h = label(day);
    const last = rows[rows.length - 1];
    if (last && last.hours === h) last.days.push(day);
    else rows.push({ days: [day], hours: h });
  }
  return rows.map((r) => ({
    days:
      r.days.length === 7
        ? 'Every day'
        : r.days.length === 1
          ? names[r.days[0]]
          : `${names[r.days[0]]}–${names[r.days[r.days.length - 1]]}`,
    hours: r.hours,
  }));
}
