'use client';

import { useEffect, useState } from 'react';

import { hoursLabel, isAcceptingOrders, isOpen } from '@shawarma-bay/core';

type Status = { open: boolean; accepting: boolean; hours: string };

/** Open/closed badge. It depends on the visitor's clock, so it renders after hydration. */
export function OpenStatus({ tone = 'dark' }: { tone?: 'dark' | 'light' }) {
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setStatus({ open: isOpen(now), accepting: isAcceptingOrders(now), hours: hoursLabel(now) });
    };
    update();
    const timer = setInterval(update, 60_000);
    return () => clearInterval(timer);
  }, []);

  const base =
    tone === 'dark' ? 'bg-white/10 text-white ring-1 ring-white/15' : 'bg-white text-coal ring-1 ring-line';
  if (!status) return <span className={`inline-flex h-8 w-48 rounded-full ${base}`} aria-hidden="true" />;

  return (
    <span className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-semibold ${base}`}>
      <span className={`h-2.5 w-2.5 rounded-full ${status.open ? 'bg-[#4cc26b]' : 'bg-[#e0614f]'}`} aria-hidden="true" />
      {status.open
        ? status.accepting
          ? `Open now · ${status.hours}`
          : `Closing soon · ${status.hours}`
        : `Closed now · Today ${status.hours}`}
    </span>
  );
}
