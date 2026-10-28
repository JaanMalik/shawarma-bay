'use client';

import Link from 'next/link';
import { useState } from 'react';

import { formatMoney, type MenuItem } from '@shawarma-bay/core';

import { useCart } from './cart-provider';
import { ItemDialog } from './item-dialog';
import { QuantityStepper } from './quantity-stepper';

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function MenuBrowser() {
  const { menu } = useCart();
  const [open, setOpen] = useState<MenuItem | null>(null);

  return (
    <div id="menu" className="mx-auto max-w-6xl px-4 pb-32 sm:px-6 lg:pb-16">
      <nav
        aria-label="Menu sections"
        className="sticky top-[62px] z-20 -mx-4 mb-6 flex gap-2 overflow-x-auto border-b border-line bg-paper/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6"
      >
        {menu.categories.map((c) => (
          <a
            key={c.id}
            href={`#${slug(c.name)}`}
            className="shrink-0 rounded-full border-[1.5px] border-line bg-white px-4 py-1.5 text-sm font-semibold hover:border-ember hover:text-ember-deep"
          >
            {c.name}
          </a>
        ))}
      </nav>

      <div className="grid gap-10 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-12">
          {menu.categories.map((category) => (
            <section key={category.id} id={slug(category.name)} aria-labelledby={`${slug(category.name)}-title`}>
              <h2 id={`${slug(category.name)}-title`} className="display mb-4 text-4xl">
                {category.name}
              </h2>
              <ul className="grid gap-3 sm:grid-cols-2">
                {category.itemIds.map((id) => {
                  const item = menu.items[id];
                  return (
                    <li key={id}>
                      <ItemCard item={item} onOpen={() => setOpen(item)} />
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
        <aside className="hidden lg:block">
          <div className="sticky top-36">
            <CartPanel />
          </div>
        </aside>
      </div>

      <MobileCartBar />
      <ItemDialog item={open} onClose={() => setOpen(null)} />
    </div>
  );
}

function ItemCard({ item, onOpen }: { item: MenuItem; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={!item.available}
      className="card group flex h-full w-full items-start justify-between gap-4 p-4 text-left transition hover:border-ember hover:shadow-[0_6px_24px_-12px_rgb(234_106_28/0.5)] disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span className="space-y-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-bold leading-snug">{item.name}</span>
          {item.tags?.map((tag) => (
            <span key={tag} className="rounded-full bg-ember-soft px-2 py-0.5 text-[0.7rem] font-bold uppercase tracking-wide text-ember-deep">
              {tag}
            </span>
          ))}
        </span>
        {item.description && <span className="block text-sm text-smoke">{item.description}</span>}
        <span className="block pt-1 font-semibold">{item.available ? formatMoney(item.price) : 'Sold out'}</span>
      </span>
      <span
        aria-hidden="true"
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ember text-xl font-bold text-white transition group-hover:bg-ember-deep"
      >
        +
      </span>
      <span className="sr-only">Add {item.name}</span>
    </button>
  );
}

function CartPanel() {
  const { priced, subtotal, count, setQuantity, ready } = useCart();
  return (
    <div className="card p-5">
      <h2 className="display text-2xl">Your order</h2>
      {!ready ? null : count === 0 ? (
        <p className="mt-3 text-sm text-smoke">Pick something from the menu to get started.</p>
      ) : (
        <>
          <ul className="mt-4 space-y-4">
            {priced.map((line) => (
              <li key={line.key} className="space-y-2">
                <div className="flex justify-between gap-3 text-sm">
                  <span className="font-semibold">{line.name}</span>
                  <span className="tabular-nums">{formatMoney(line.lineTotal)}</span>
                </div>
                {line.modifiers.length > 0 && (
                  <p className="text-xs text-smoke">{line.modifiers.map((m) => m.name).join(', ')}</p>
                )}
                {line.note && <p className="text-xs italic text-smoke">“{line.note}”</p>}
                <QuantityStepper size="sm" value={line.quantity} onChange={(q) => setQuantity(line.key, q)} label={line.name} />
              </li>
            ))}
          </ul>
          <div className="mt-5 flex justify-between border-t border-line pt-4 font-bold">
            <span>Subtotal</span>
            <span className="tabular-nums">{formatMoney(subtotal)}</span>
          </div>
          <Link href="/checkout" className="btn btn-primary mt-4 w-full">
            Checkout
          </Link>
        </>
      )}
    </div>
  );
}

function MobileCartBar() {
  const { count, subtotal, ready } = useCart();
  if (!ready || count === 0) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 p-3 lg:hidden">
      <Link
        href="/checkout"
        className="btn btn-primary w-full justify-between py-4 text-base shadow-[0_10px_30px_-10px_rgb(0_0_0/0.5)]"
      >
        <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-sm">{count}</span>
        <span>View order</span>
        <span className="tabular-nums">{formatMoney(subtotal)}</span>
      </Link>
    </div>
  );
}
