export type Weekday = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';

/** Opening windows per day as "HH:MM" 24-hour pairs, in the restaurant's time zone. */
export type WeeklyHours = Record<Weekday, [open: string, close: string][]>;

const everyDay = (open: string, close: string): WeeklyHours => ({
  sun: [[open, close]],
  mon: [[open, close]],
  tue: [[open, close]],
  wed: [[open, close]],
  thu: [[open, close]],
  fri: [[open, close]],
  sat: [[open, close]],
});

/** Used in demo mode so the ordering flow can be tried at any hour. */
export const ALWAYS_OPEN: WeeklyHours = everyDay('00:00', '24:00');

export const restaurant = {
  name: 'Shawarma Bay',
  location: 'Deer Park',
  tagline: 'Halal shawarma, chapli kebab & masala fish',
  address: {
    line1: '786 Grand Blvd',
    city: 'Deer Park',
    state: 'NY',
    zip: '11729',
  },
  phone: '(516) 312-6987',
  phoneHref: 'tel:+15163126987',
  mapsUrl: 'https://maps.google.com/?q=Shawarma+Bay+786+Grand+Blvd+Deer+Park+NY+11729',
  timeZone: 'America/New_York',
  // Google lists 11 AM to 1 AM every day (shared by Jaan on 2026-10-28); closing runs past
  // midnight. The Clover Online page showed 9 PM, so confirm the online ordering hours with Shahzeb.
  hours: everyDay('11:00', '01:00'),
  /** Minutes the kitchen needs for an ASAP order. */
  prepMinutes: 20,
  /** Stop taking orders this many minutes before closing. */
  lastOrderMinutesBeforeClose: 15,
  /** Suffolk County, NY sales tax. Only used in demo mode; Clover calculates tax for real orders. */
  demoTaxRate: 0.08625,
} as const;

export type Restaurant = typeof restaurant;
