import { restaurant, weeklyHoursRows } from '@shawarma-bay/core';

import { publicConfig } from '@/lib/public-config';

import { LogoMark } from './brand';

export function SiteFooter() {
  const { address } = restaurant;
  return (
    <footer id="visit" className="mt-auto bg-coal text-white/80">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-3">
        <div className="space-y-3">
          <div className="flex items-center gap-3 text-white">
            <LogoMark size={44} />
            <span className="display text-3xl">Shawarma Bay</span>
          </div>
          <p className="max-w-xs text-sm">{restaurant.tagline}. 100% halal.</p>
        </div>
        <div className="space-y-2 text-sm">
          <h2 className="display text-xl text-white">Visit</h2>
          <p>
            {address.line1}
            <br />
            {address.city}, {address.state} {address.zip}
          </p>
          <p className="flex gap-4">
            <a className="font-semibold text-ember hover:underline" href={restaurant.mapsUrl} target="_blank" rel="noreferrer">
              Directions
            </a>
            <a className="font-semibold text-ember hover:underline" href={restaurant.phoneHref}>
              {restaurant.phone}
            </a>
          </p>
        </div>
        <div className="space-y-2 text-sm">
          <h2 className="display text-xl text-white">Hours</h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            {weeklyHoursRows().map((row) => (
              <div key={row.days} className="contents">
                <dt>{row.days}</dt>
                <dd className="text-white">{row.hours}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
      {publicConfig.demo && (
        <p className="bg-ember px-4 py-2 text-center text-xs font-semibold text-white">
          Demo mode: no cards are charged, and orders aren&rsquo;t sent to Clover yet.
        </p>
      )}
    </footer>
  );
}
