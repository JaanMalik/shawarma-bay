'use client';

import { useEffect, useRef, useState } from 'react';

import { CartError, formatMoney, priceCart, type MenuItem } from '@shawarma-bay/core';

import { useCart } from './cart-provider';
import { QuantityStepper } from './quantity-stepper';

/** Pick options and quantity for one item, then add it to the cart. */
export function ItemDialog({ item, onClose }: { item: MenuItem | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (item && !dialog.open) dialog.showModal();
    if (!item && dialog.open) dialog.close();
  }, [item]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className="m-auto w-[min(34rem,calc(100vw-2rem))] max-h-[min(44rem,calc(100dvh-2rem))] rounded-3xl bg-card p-0 text-coal shadow-2xl"
    >
      {item && <ItemForm key={item.id} item={item} onDone={onClose} />}
    </dialog>
  );
}

function ItemForm({ item, onDone }: { item: MenuItem; onDone: () => void }) {
  const { menu, add } = useCart();
  const [chosen, setChosen] = useState<string[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const groups = item.modifierGroupIds.map((id) => menu.modifierGroups[id]).filter(Boolean);
  const unit = item.price + groups.flatMap((g) => g.modifiers).filter((m) => chosen.includes(m.id)).reduce((s, m) => s + m.price, 0);

  function toggle(groupId: string, modifierId: string) {
    const group = menu.modifierGroups[groupId];
    setError(null);
    setChosen((prev) => {
      const inGroup = group.modifiers.map((m) => m.id);
      if (prev.includes(modifierId)) return prev.filter((id) => id !== modifierId);
      if (group.max === 1) return [...prev.filter((id) => !inGroup.includes(id)), modifierId];
      const count = prev.filter((id) => inGroup.includes(id)).length;
      if (group.max !== null && count >= group.max) return prev;
      return [...prev, modifierId];
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const line = { itemId: item.id, quantity, modifierIds: chosen, note: note.trim() || undefined };
    try {
      priceCart(menu, [line]);
    } catch (err) {
      setError(err instanceof CartError ? err.message : 'Something is off with this item.');
      return;
    }
    add(line);
    onDone();
  }

  return (
    <form onSubmit={submit} className="flex max-h-[inherit] flex-col">
      <div className="flex items-start justify-between gap-4 border-b border-line px-6 pb-4 pt-6">
        <div>
          <h2 className="display text-3xl">{item.name}</h2>
          {item.description && <p className="mt-1 text-smoke">{item.description}</p>}
          <p className="mt-2 font-semibold">{formatMoney(item.price)}</p>
        </div>
        <button
          type="button"
          onClick={onDone}
          className="-mr-2 rounded-full p-2 text-smoke hover:bg-paper hover:text-coal"
          aria-label="Close"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
        {groups.map((group) => {
          const picked = group.modifiers.filter((m) => chosen.includes(m.id)).length;
          const rule =
            group.min > 0 && group.min === group.max
              ? `Choose ${group.min}`
              : group.min > 0
                ? `Choose at least ${group.min}`
                : group.max
                  ? `Optional, up to ${group.max}`
                  : 'Optional';
          return (
            <fieldset key={group.id}>
              <legend className="flex w-full items-baseline justify-between">
                <span className="font-bold">{group.name}</span>
                <span className={`text-sm ${group.min > picked ? 'font-semibold text-ember-deep' : 'text-smoke'}`}>
                  {rule}
                </span>
              </legend>
              <div className="mt-2 grid gap-2">
                {group.modifiers.map((m) => {
                  const on = chosen.includes(m.id);
                  return (
                    <label
                      key={m.id}
                      className={`flex cursor-pointer items-center justify-between rounded-xl border-[1.5px] px-4 py-3 ${
                        on ? 'border-ember bg-ember-soft' : 'border-line'
                      } ${m.available ? '' : 'cursor-not-allowed opacity-50'}`}
                    >
                      <span className="flex items-center gap-3">
                        <input
                          type={group.max === 1 ? 'radio' : 'checkbox'}
                          name={group.id}
                          checked={on}
                          disabled={!m.available}
                          onChange={() => toggle(group.id, m.id)}
                          className="h-4 w-4 accent-[var(--color-ember)]"
                        />
                        {m.name}
                        {!m.available && <span className="text-xs">(sold out)</span>}
                      </span>
                      {m.price > 0 && <span className="text-sm text-smoke">+{formatMoney(m.price)}</span>}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          );
        })}

        <label className="block">
          <span className="font-bold">Special instructions</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={140}
            rows={2}
            placeholder="E.g. no onions, extra sauce"
            className="field mt-2 resize-none"
          />
        </label>
        {error && (
          <p role="alert" className="rounded-xl bg-[#fdeceb] px-4 py-3 text-sm font-semibold text-sumac">
            {error}
          </p>
        )}
      </div>

      <div className="flex items-center gap-3 border-t border-line px-6 py-4">
        <QuantityStepper value={quantity} onChange={setQuantity} min={1} label={item.name} />
        <button type="submit" className="btn btn-primary flex-1" disabled={!item.available}>
          {item.available ? `Add to order · ${formatMoney(unit * quantity)}` : 'Sold out'}
        </button>
      </div>
    </form>
  );
}
