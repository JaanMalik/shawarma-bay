import { restaurant } from '@shawarma-bay/core';

import { MenuBrowser } from '@/components/menu-browser';
import { OpenStatus } from '@/components/open-status';

export default function HomePage() {
  return (
    <>
      <section className="relative overflow-hidden bg-coal text-white">
        <div
          aria-hidden="true"
          className="absolute -right-20 -top-20 h-44 w-44 rounded-full bg-ember lg:-right-10 lg:-top-24 lg:h-[28rem] lg:w-[28rem]"
        />
        <div
          aria-hidden="true"
          className="absolute right-40 top-40 hidden h-56 w-56 rounded-full border-[10px] border-white/10 lg:block"
        />
        <div className="relative mx-auto max-w-6xl px-4 pb-14 pt-12 sm:px-6 sm:pb-20 sm:pt-20">
          <OpenStatus />
          <h1 className="display mt-6 max-w-3xl text-[3.6rem] sm:text-[6rem]">
            Shawarma Bay
            <span className="block text-ember">Deer Park</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg text-white/80">
            {restaurant.tagline}. Order ahead and we&rsquo;ll have it hot and ready for pickup at{' '}
            {restaurant.address.line1}.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href="#menu" className="btn btn-primary px-6 py-3.5 text-lg">
              Start your order
            </a>
            <a href={restaurant.phoneHref} className="btn btn-ghost px-6 py-3.5 text-lg text-white">
              Call {restaurant.phone}
            </a>
          </div>
          <ul className="mt-10 flex flex-wrap gap-x-6 gap-y-2 text-sm font-semibold uppercase tracking-wider text-white/60">
            <li>100% halal</li>
            <li>Ready in about {restaurant.prepMinutes} min</li>
            <li>Pickup only</li>
          </ul>
        </div>
      </section>
      <div className="h-8" />
      <MenuBrowser />
    </>
  );
}
