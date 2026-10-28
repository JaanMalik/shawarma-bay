'use client';

import { useEffect, useId, useImperativeHandle, useRef, useState, type Ref } from 'react';

import { publicConfig } from '@/lib/public-config';

export interface CardFieldsHandle {
  /** Returns a single-use Clover card token, or throws with a message for the customer. */
  tokenize(): Promise<string>;
}

interface CloverElement {
  mount(selector: string): void;
}
interface CloverInstance {
  elements(): { create(type: string, styles?: object): CloverElement };
  createToken(): Promise<{ token?: string; errors?: Record<string, string | undefined> }>;
}
declare global {
  interface Window {
    Clover?: new (key: string, options: { merchantId: string }) => CloverInstance;
  }
}

let sdkPromise: Promise<void> | null = null;
function loadSdk(): Promise<void> {
  if (window.Clover) return Promise.resolve();
  sdkPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = publicConfig.sdkUrl;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      sdkPromise = null;
      reject(new Error('Could not load the secure card form.'));
    };
    document.head.appendChild(script);
  });
  return sdkPromise;
}

/**
 * Card number, expiry, CVV, and ZIP fields hosted by Clover in iframes, so card details never
 * touch this site's servers. In demo mode a pretend card is shown instead.
 */
export function CardFields({ ref }: { ref: Ref<CardFieldsHandle> }) {
  return publicConfig.demo ? <DemoCardFields ref={ref} /> : <CloverCardFields ref={ref} />;
}

const FIELDS = [
  { type: 'CARD_NUMBER', label: 'Card number', span: 'col-span-2' },
  { type: 'CARD_DATE', label: 'Expiry (MM/YY)', span: '' },
  { type: 'CARD_CVV', label: 'CVV', span: '' },
  { type: 'CARD_POSTAL_CODE', label: 'ZIP code', span: 'col-span-2' },
] as const;

function CloverCardFields({ ref }: { ref: Ref<CardFieldsHandle> }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const clover = useRef<CloverInstance | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    loadSdk()
      .then(() => {
        if (cancelled || clover.current || !window.Clover) return;
        const instance = new window.Clover(publicConfig.publicKey, { merchantId: publicConfig.merchantId });
        const elements = instance.elements();
        const styles = { input: { fontSize: '16px', fontFamily: 'Inter, system-ui, sans-serif' } };
        for (const field of FIELDS) {
          elements.create(field.type, styles).mount(`#${id}-${field.type}`);
        }
        clover.current = instance;
        setState('ready');
      })
      .catch(() => !cancelled && setState('error'));
    return () => {
      cancelled = true;
    };
  }, [id]);

  useImperativeHandle(ref, () => ({
    async tokenize() {
      if (!clover.current) throw new Error('The card form is still loading. Try again in a moment.');
      const result = await clover.current.createToken();
      const firstError = result.errors && Object.values(result.errors).find(Boolean);
      if (!result.token) throw new Error(firstError || 'Check your card details and try again.');
      return result.token;
    },
  }));

  return (
    <div>
      <div className="grid grid-cols-2 gap-3">
        {FIELDS.map((field) => (
          <label key={field.type} className={`block ${field.span}`}>
            <span className="text-sm font-semibold">{field.label}</span>
            <div id={`${id}-${field.type}`} className="field mt-1 h-[52px] overflow-hidden py-0 [&_iframe]:h-full [&_iframe]:w-full" />
          </label>
        ))}
      </div>
      {state === 'loading' && <p className="mt-2 text-sm text-smoke">Loading secure card form…</p>}
      {state === 'error' && (
        <p className="mt-2 text-sm font-semibold text-sumac">
          The secure card form didn&rsquo;t load. Refresh the page, or choose pay at pickup.
        </p>
      )}
      <p className="mt-3 flex items-center gap-1.5 text-xs text-smoke">
        <LockIcon /> Card details go straight to Clover, the restaurant&rsquo;s payment processor.
      </p>
    </div>
  );
}

function DemoCardFields({ ref }: { ref: Ref<CardFieldsHandle> }) {
  const [outcome, setOutcome] = useState<'approve' | 'decline'>('approve');
  useImperativeHandle(ref, () => ({
    async tokenize() {
      return outcome === 'approve' ? 'demo_ok' : 'demo_decline';
    },
  }));
  return (
    <div className="rounded-2xl border-[1.5px] border-dashed border-ember bg-ember-soft/50 p-4">
      <p className="flex items-center gap-2 font-semibold">
        <LockIcon /> Demo card •••• 4242
      </p>
      <p className="mt-1 text-sm text-smoke">
        Demo mode: no real card is charged. Once Clover is connected, secure card fields appear here.
      </p>
      <label className="mt-3 flex items-center gap-2 text-sm">
        Pretend the bank will
        <select
          value={outcome}
          onChange={(e) => setOutcome(e.target.value as 'approve' | 'decline')}
          className="rounded-lg border border-line bg-white px-2 py-1"
        >
          <option value="approve">approve</option>
          <option value="decline">decline</option>
        </select>
      </label>
    </div>
  );
}

function LockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}
