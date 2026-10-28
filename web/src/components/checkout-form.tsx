'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import {
  appReturnUrl,
  formatMoney,
  formatTime,
  hoursLabel,
  isAcceptingOrders,
  normalizePhone,
  pickupSlots,
  restaurant,
  tipOptions,
  type CartLine,
  type CheckoutHandoff,
  type Pickup,
  type PricedLine,
} from '@shawarma-bay/core';

import { placeOrder, useQuote } from '@/lib/api-client';
import { openApp } from '@/lib/open-app';
import { publicConfig } from '@/lib/public-config';

import { CardFields, type CardFieldsHandle } from './card-fields';
import { useCart } from './cart-provider';
import { QuantityStepper } from './quantity-stepper';

const CUSTOMER_KEY = 'shawarma-bay-customer-v1';

type Method = 'card' | 'in_store';

function useClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    // The pickup times depend on the visitor's clock, so they're worked out after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/** Checkout for the website's own cart. */
export function CheckoutForm() {
  const cart = useCart();
  const router = useRouter();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(CUSTOMER_KEY) ?? 'null') as { name?: string; phone?: string } | null;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- prefill from a previous order
      if (saved?.name) setName(saved.name);
      if (saved?.phone) setPhone(saved.phone);
    } catch {
      // No saved details.
    }
  }, []);

  if (cart.ready && cart.count === 0) {
    return (
      <div className="card mx-auto max-w-lg p-8 text-center">
        <h1 className="display text-4xl">Your order is empty</h1>
        <p className="mt-2 text-smoke">Add something tasty from the menu first.</p>
        <Link href="/#menu" className="btn btn-primary mt-6">
          Browse the menu
        </Link>
      </div>
    );
  }

  const lines: CartLine[] = cart.priced.map(({ itemId, quantity, modifierIds, note }) => ({
    itemId,
    quantity,
    modifierIds,
    ...(note ? { note } : {}),
  }));

  return (
    <PaymentStep
      lines={lines}
      editable
      customer={{ name, phone, setName, setPhone }}
      onPlaced={(id) => {
        try {
          localStorage.setItem(CUSTOMER_KEY, JSON.stringify({ name: name.trim(), phone }));
        } catch {
          // Not critical.
        }
        cart.clear();
        router.push(`/order/${id}?placed=1`);
      }}
    />
  );
}

/** Payment page the mobile app opens for card payments, with the order passed in the URL. */
export function AppPayForm({ handoff }: { handoff: CheckoutHandoff }) {
  const [doneId, setDoneId] = useState<string | null>(null);
  if (doneId) {
    const href = appReturnUrl(doneId);
    return (
      <div className="card mx-auto max-w-lg p-8 text-center">
        <h1 className="display text-4xl">Order placed!</h1>
        <p className="mt-2 text-smoke">Returning you to the app…</p>
        <a href={href} className="btn btn-primary mt-6">
          Back to the app
        </a>
      </div>
    );
  }
  return (
    <PaymentStep
      lines={handoff.lines}
      fixed={{ customer: handoff.customer, pickup: handoff.pickup, notes: handoff.notes }}
      forceCard
      onPlaced={(id) => {
        setDoneId(id);
        openApp(appReturnUrl(id));
      }}
    />
  );
}

interface PaymentStepProps {
  lines: CartLine[];
  editable?: boolean;
  /** Website checkout: the customer fills these in. */
  customer?: { name: string; phone: string; setName(v: string): void; setPhone(v: string): void };
  /** App handoff: already chosen in the app. */
  fixed?: { customer: { name: string; phone: string }; pickup: Pickup; notes?: string };
  forceCard?: boolean;
  onPlaced(id: string): void;
}

function PaymentStep({ lines, editable, customer, fixed, forceCard, onPlaced }: PaymentStepProps) {
  const cart = useCart();
  const now = useClock();
  const { quote, error: quoteError } = useQuote(lines);
  const cardRef = useRef<CardFieldsHandle>(null);

  const methods: Method[] = forceCard
    ? ['card']
    : ([publicConfig.onlinePayments && 'card', publicConfig.payAtPickup && 'in_store'].filter(Boolean) as Method[]);
  const [method, setMethod] = useState<Method>(methods[0] ?? 'in_store');
  const [tipPercent, setTipPercent] = useState<number>(0);
  const [customTip, setCustomTip] = useState('');
  const [pickupChoice, setPickupChoice] = useState<string>('asap');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hours = publicConfig.orderingHours;
  const accepting = now ? isAcceptingOrders(now, hours) : true;
  const slots = now ? pickupSlots(now, { hours }) : [];
  const effectivePickup = !accepting && pickupChoice === 'asap' ? (slots[0] ?? 'none') : pickupChoice;
  const closedForToday = now !== null && !accepting && slots.length === 0;

  const subtotal = quote?.subtotal ?? 0;
  const tip =
    method !== 'card'
      ? 0
      : tipPercent === -1
        ? Math.max(0, Math.round(Number(customTip || '0') * 100))
        : Math.round((subtotal * tipPercent) / 100);
  const total = quote ? quote.total + tip : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const who = fixed?.customer ?? { name: customer!.name.trim(), phone: customer!.phone };
    if (!who.name) return setError('Please enter your name.');
    if (!normalizePhone(who.phone)) return setError('Please enter a 10-digit phone number so we can reach you.');
    if (closedForToday) return setError('We are closed for online orders right now.');
    const pickup: Pickup =
      fixed?.pickup ?? (effectivePickup === 'asap' ? { type: 'asap' } : { type: 'scheduled', time: effectivePickup });

    setSubmitting(true);
    try {
      let payment: { method: 'in_store' } | { method: 'card'; token: string; tip: number } = { method: 'in_store' };
      if (method === 'card') {
        const token = await cardRef.current!.tokenize();
        payment = { method: 'card', token, tip };
      }
      const { order } = await placeOrder({
        lines,
        customer: who,
        pickup,
        notes: fixed ? fixed.notes : notes.trim() || undefined,
        payment,
        source: fixed ? 'app' : 'web',
      });
      onPlaced(order.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setSubmitting(false);
    }
  }

  const summaryLines: (PricedLine & { key?: string })[] = editable ? cart.priced : (quote?.lines ?? []);

  return (
    <form onSubmit={submit} className="grid gap-8 lg:grid-cols-[1fr_24rem]">
      <div className="space-y-6">
        {customer && (
          <Section title="Your details">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-semibold">Name</span>
                <input
                  className="field mt-1"
                  value={customer.name}
                  onChange={(e) => customer.setName(e.target.value)}
                  autoComplete="name"
                  maxLength={60}
                  required
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold">Mobile number</span>
                <input
                  className="field mt-1"
                  value={customer.phone}
                  onChange={(e) => customer.setPhone(e.target.value)}
                  autoComplete="tel"
                  inputMode="tel"
                  placeholder="(516) 555-0123"
                  required
                />
              </label>
            </div>
            <p className="mt-2 text-xs text-smoke">We only use your number to reach you about this order.</p>
          </Section>
        )}

        {fixed && (
          <Section title="Pickup">
            <p>
              <strong>{fixed.customer.name}</strong> · {fixed.customer.phone}
            </p>
            <p className="text-smoke">
              {fixed.pickup.type === 'asap' ? 'As soon as possible' : `At ${formatTime(fixed.pickup.time)}`}
            </p>
          </Section>
        )}

        {!fixed && (
          <Section title="Pickup time">
            {closedForToday ? (
              <p className="rounded-xl bg-[#fdeceb] px-4 py-3 font-semibold text-sumac">
                We&rsquo;re closed for online orders right now. Today&rsquo;s hours: {now && hoursLabel(now)}.
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <Choice
                  name="pickup"
                  checked={effectivePickup === 'asap'}
                  disabled={!accepting}
                  onChange={() => setPickupChoice('asap')}
                  title="As soon as possible"
                  detail={accepting && now ? `Ready around ${formatTime(new Date(now.getTime() + restaurant.prepMinutes * 60_000))}` : 'Not available yet'}
                />
                <label
                  className={`flex flex-col rounded-2xl border-[1.5px] px-4 py-3 ${
                    effectivePickup !== 'asap' ? 'border-ember bg-ember-soft' : 'border-line bg-white'
                  }`}
                >
                  <span className="font-semibold">Schedule for later</span>
                  <select
                    className="mt-1 bg-transparent text-smoke outline-none"
                    value={effectivePickup === 'asap' ? '' : effectivePickup}
                    onChange={(e) => setPickupChoice(e.target.value || 'asap')}
                    aria-label="Pickup time"
                  >
                    <option value="">Pick a time today</option>
                    {slots.map((s) => (
                      <option key={s} value={s}>
                        {formatTime(s)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
            <p className="mt-3 text-sm text-smoke">
              Pick up at {restaurant.address.line1}, {restaurant.address.city}.
            </p>
          </Section>
        )}

        {!fixed && (
          <Section title="Notes for the kitchen">
            <textarea
              className="field resize-none"
              rows={2}
              maxLength={200}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything we should know? (optional)"
            />
          </Section>
        )}

        <Section title="Payment">
          {methods.length > 1 && (
            <div className="mb-4 grid gap-3 sm:grid-cols-2">
              <Choice
                name="method"
                checked={method === 'card'}
                onChange={() => setMethod('card')}
                title="Pay now"
                detail="Card, secured by Clover"
              />
              <Choice
                name="method"
                checked={method === 'in_store'}
                onChange={() => setMethod('in_store')}
                title="Pay at pickup"
                detail="Cash or card at the counter"
              />
            </div>
          )}
          {method === 'card' && (
            <>
              <div className="mb-4">
                <p className="mb-2 text-sm font-semibold">Add a tip for the kitchen</p>
                <div className="flex flex-wrap gap-2">
                  {[{ percent: 0, amount: 0 }, ...tipOptions(subtotal)].map((o) => (
                    <button
                      key={o.percent}
                      type="button"
                      onClick={() => setTipPercent(o.percent)}
                      className={`rounded-full border-[1.5px] px-4 py-2 text-sm font-semibold ${
                        tipPercent === o.percent ? 'border-ember bg-ember-soft' : 'border-line bg-white'
                      }`}
                    >
                      {o.percent === 0 ? 'No tip' : `${o.percent}% · ${formatMoney(o.amount)}`}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setTipPercent(-1)}
                    className={`rounded-full border-[1.5px] px-4 py-2 text-sm font-semibold ${
                      tipPercent === -1 ? 'border-ember bg-ember-soft' : 'border-line bg-white'
                    }`}
                  >
                    Other
                  </button>
                </div>
                {tipPercent === -1 && (
                  <label className="mt-2 flex max-w-48 items-center gap-2">
                    <span className="font-semibold">$</span>
                    <input
                      className="field"
                      inputMode="decimal"
                      value={customTip}
                      onChange={(e) => setCustomTip(e.target.value.replace(/[^0-9.]/g, ''))}
                      aria-label="Tip amount in dollars"
                    />
                  </label>
                )}
              </div>
              <CardFields ref={cardRef} />
            </>
          )}
          {method === 'in_store' && (
            <p className="text-smoke">You&rsquo;ll pay when you pick up your order.</p>
          )}
        </Section>
      </div>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="card p-5">
          <h2 className="display text-2xl">Your order</h2>
          <ul className="mt-4 space-y-4">
            {summaryLines.map((line, i) => (
              <li key={line.key ?? i} className="space-y-1.5">
                <div className="flex justify-between gap-3">
                  <span className="font-semibold">
                    {!editable && `${line.quantity} × `}
                    {line.name}
                  </span>
                  <span className="tabular-nums">{formatMoney(line.lineTotal)}</span>
                </div>
                {line.modifiers.length > 0 && (
                  <p className="text-sm text-smoke">{line.modifiers.map((m) => m.name).join(', ')}</p>
                )}
                {line.note && <p className="text-sm italic text-smoke">“{line.note}”</p>}
                {editable && line.key && (
                  <QuantityStepper
                    size="sm"
                    value={line.quantity}
                    onChange={(q) => cart.setQuantity(line.key!, q)}
                    label={line.name}
                  />
                )}
              </li>
            ))}
          </ul>
          {editable && (
            <Link href="/#menu" className="mt-4 inline-block text-sm font-semibold text-ember-deep hover:underline">
              + Add more items
            </Link>
          )}

          <dl className="mt-5 space-y-1.5 border-t border-line pt-4 text-sm">
            <Row label="Subtotal" value={quote ? formatMoney(quote.subtotal) : '…'} />
            <Row label="Tax" value={quote ? formatMoney(quote.tax) : '…'} />
            {tip > 0 && <Row label="Tip" value={formatMoney(tip)} />}
            <div className="flex justify-between pt-2 text-lg font-bold">
              <dt>Total</dt>
              <dd className="tabular-nums">{total !== null ? formatMoney(total) : '…'}</dd>
            </div>
          </dl>

          {(error || quoteError) && (
            <p role="alert" className="mt-4 rounded-xl bg-[#fdeceb] px-4 py-3 text-sm font-semibold text-sumac">
              {error ?? quoteError}
            </p>
          )}

          <button
            type="submit"
            className="btn btn-primary mt-5 w-full py-4 text-lg"
            disabled={submitting || !quote || closedForToday || methods.length === 0}
          >
            {submitting
              ? 'Placing your order…'
              : method === 'card'
                ? `Pay ${total !== null ? formatMoney(total) : ''} & place order`
                : 'Place order'}
          </button>
          {publicConfig.demo && (
            <p className="mt-3 text-center text-xs text-smoke">Demo mode: no card is charged, and this order isn&rsquo;t sent to Clover.</p>
          )}
        </div>
      </aside>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card p-5 sm:p-6">
      <h2 className="display mb-4 text-2xl">{title}</h2>
      {children}
    </section>
  );
}

function Choice(props: {
  name: string;
  checked: boolean;
  disabled?: boolean;
  onChange(): void;
  title: string;
  detail: string;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-2xl border-[1.5px] px-4 py-3 ${
        props.checked ? 'border-ember bg-ember-soft' : 'border-line bg-white'
      } ${props.disabled ? 'cursor-not-allowed opacity-50' : ''}`}
    >
      <input
        type="radio"
        name={props.name}
        checked={props.checked}
        disabled={props.disabled}
        onChange={props.onChange}
        className="mt-1 h-4 w-4 accent-[var(--color-ember)]"
      />
      <span>
        <span className="block font-semibold">{props.title}</span>
        <span className="block text-sm text-smoke">{props.detail}</span>
      </span>
    </label>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-smoke">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
