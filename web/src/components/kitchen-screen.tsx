'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { formatMoney, formatTime, type OrderView } from '@shawarma-bay/core';

import { publicConfig } from '@/lib/public-config';

import { LogoMark } from './brand';

type Stage = 'new' | 'preparing' | 'done';
const STAGES_KEY = 'shawarma-bay-kitchen-stages-v1';
const POLL_MS = 10_000;
const CHIME_REPEAT_MS = 20_000;

/**
 * Online orders for the restaurant's iPad. Orders are read from Clover every 10 seconds. Which
 * orders are being made or done is remembered on this device only.
 */
export function KitchenScreen() {
  const [auth, setAuth] = useState<'checking' | 'locked' | 'open'>('checking');
  const [orders, setOrders] = useState<OrderView[]>([]);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [offline, setOffline] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/kitchen/orders', { cache: 'no-store' });
      if (res.status === 401) {
        setAuth('locked');
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { orders: OrderView[] };
      setOrders(data.orders);
      setAuth('open');
      setLastSync(new Date());
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- first load of the order feed
    void load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  if (auth === 'checking') return <p className="p-8 text-white/60">Loading…</p>;
  if (auth === 'locked') return <PinPad onUnlocked={load} />;
  return <Board orders={orders} lastSync={lastSync} offline={offline} />;
}

function PinPad({ onUnlocked }: { onUnlocked: () => void }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(value: string) {
    setBusy(true);
    setError(null);
    unlockAudio();
    const res = await fetch('/api/kitchen/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: value }),
    }).catch(() => null);
    setBusy(false);
    if (res?.ok) return onUnlocked();
    const data = (await res?.json().catch(() => null)) as { error?: string } | null;
    setError(data?.error ?? 'Could not reach the server.');
    setPin('');
  }

  const press = (d: string) => {
    if (busy) return;
    const next = (pin + d).slice(0, 8);
    setPin(next);
    setError(null);
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-6 px-6">
      <LogoMark size={64} />
      <h1 className="display text-4xl">Online orders</h1>
      <div className="flex h-6 gap-3" aria-label={`${pin.length} digits entered`}>
        {Array.from({ length: Math.max(4, pin.length) }, (_, i) => (
          <span key={i} className={`h-4 w-4 rounded-full ${i < pin.length ? 'bg-ember' : 'bg-white/20'}`} />
        ))}
      </div>
      {error && <p className="text-center font-semibold text-[#ff9b8a]">{error}</p>}
      <div className="grid w-full grid-cols-3 gap-3">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <Key key={d} onClick={() => press(d)}>
            {d}
          </Key>
        ))}
        <Key onClick={() => setPin(pin.slice(0, -1))} label="Delete">
          ⌫
        </Key>
        <Key onClick={() => press('0')}>0</Key>
        <Key onClick={() => submit(pin)} label="Enter" accent disabled={pin.length === 0 || busy}>
          →
        </Key>
      </div>
      {publicConfig.demo && <p className="text-sm text-white/50">Demo PIN: 1234</p>}
    </div>
  );
}

function Key(props: { children: React.ReactNode; onClick: () => void; label?: string; accent?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      aria-label={props.label}
      className={`h-20 rounded-2xl text-3xl font-semibold active:scale-95 disabled:opacity-40 ${
        props.accent ? 'bg-ember' : 'bg-white/10'
      }`}
    >
      {props.children}
    </button>
  );
}

function useStages() {
  const [stages, setStages] = useState<Record<string, Stage>>({});
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restore this device's progress
      setStages(JSON.parse(localStorage.getItem(STAGES_KEY) ?? '{}'));
    } catch {
      // Start fresh.
    }
  }, []);
  const set = useCallback((id: string, stage: Stage) => {
    setStages((prev) => {
      const next = { ...prev, [id]: stage };
      try {
        localStorage.setItem(STAGES_KEY, JSON.stringify(next));
      } catch {
        // Ignore; progress just won't survive a reload.
      }
      return next;
    });
  }, []);
  return [stages, set] as const;
}

function Board({ orders, lastSync, offline }: { orders: OrderView[]; lastSync: Date | null; offline: boolean }) {
  const [stages, setStage] = useStages();
  const [sound, setSound] = useState(true);
  const stageOf = (o: OrderView): Stage => stages[o.id] ?? 'new';
  const active = orders.filter((o) => stageOf(o) !== 'done').sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const done = orders.filter((o) => stageOf(o) === 'done');
  const newCount = active.filter((o) => stageOf(o) === 'new').length;

  useWakeLock();
  useChime(sound && newCount > 0);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-3">
        <div className="flex items-center gap-3">
          <LogoMark size={36} />
          <h1 className="display text-3xl">Online orders</h1>
          {newCount > 0 && (
            <span className="animate-pulse rounded-full bg-ember px-3 py-1 text-sm font-bold">{newCount} new</span>
          )}
        </div>
        <div className="flex items-center gap-3 text-sm text-white/60">
          <span className={offline ? 'font-semibold text-[#ff9b8a]' : ''}>
            {offline ? 'Connection lost, retrying…' : lastSync ? `Updated ${formatTime(lastSync)}` : ''}
          </span>
          <button
            type="button"
            onClick={() => {
              unlockAudio();
              setSound(!sound);
            }}
            className={`rounded-full px-3 py-1.5 font-semibold ${sound ? 'bg-white/15 text-white' : 'bg-[#5a2a24] text-white'}`}
          >
            {sound ? 'Sound on' : 'Sound off'}
          </button>
        </div>
      </header>

      {publicConfig.demo && (
        <p className="bg-ember px-4 py-1.5 text-center text-sm font-semibold">
          Demo mode: these are sample and test orders, not real ones.
        </p>
      )}

      <main className="flex-1 p-5">
        {active.length === 0 ? (
          <div className="grid h-full min-h-[50dvh] place-items-center text-center text-white/50">
            <div>
              <p className="display text-4xl text-white/70">No open orders</p>
              <p className="mt-2">New online orders show up here with a chime.</p>
            </div>
          </div>
        ) : (
          <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {active.map((o) => (
              <li key={o.id}>
                <OrderTicket order={o} stage={stageOf(o)} onStage={(s) => setStage(o.id, s)} />
              </li>
            ))}
          </ul>
        )}

        {done.length > 0 && (
          <details className="mt-8">
            <summary className="cursor-pointer text-white/60">Done today ({done.length})</summary>
            <ul className="mt-3 divide-y divide-white/10 rounded-2xl bg-white/5">
              {done.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-4 px-4 py-3">
                  <span>
                    <span className="font-semibold">{o.customerName}</span>
                    <span className="text-white/50"> · #{o.id.slice(-4)} · {formatMoney(o.total)}</span>
                  </span>
                  <button type="button" className="text-sm font-semibold text-ember" onClick={() => setStage(o.id, 'preparing')}>
                    Reopen
                  </button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </main>
    </div>
  );
}

function OrderTicket({ order, stage, onStage }: { order: OrderView; stage: Stage; onStage: (s: Stage) => void }) {
  const isNew = stage === 'new';
  return (
    <article
      className={`flex h-full flex-col rounded-3xl bg-white text-coal ${isNew ? 'ring-4 ring-ember' : ''}`}
      aria-label={`Order for ${order.customerName}`}
    >
      <div className="flex items-start justify-between gap-3 border-b border-line px-5 pb-3 pt-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-smoke">
            #{order.id.slice(-4)} · {order.source === 'app' ? 'App' : 'Website'} · {formatTime(order.createdAt)}
          </p>
          <h2 className="mt-1 text-2xl font-bold">{order.customerName}</h2>
          {order.customerPhone && (
            <a href={`tel:${order.customerPhone.replace(/\D/g, '')}`} className="text-smoke">
              {order.customerPhone}
            </a>
          )}
        </div>
        <div className="text-right">
          <p className="text-xs font-bold uppercase tracking-wider text-smoke">Pickup</p>
          <p className="text-xl font-bold">{order.pickupLabel}</p>
        </div>
      </div>

      <ul className="flex-1 space-y-2 px-5 py-4">
        {order.lines.map((line, i) => (
          <li key={i} className="text-lg leading-snug">
            <span className="mr-2 inline-grid min-w-8 place-items-center rounded-lg bg-coal px-1.5 font-bold text-white">
              {line.quantity}
            </span>
            <span className="font-semibold">{line.name}</span>
            {line.modifiers.length > 0 && <span className="block pl-10 text-base text-smoke">{line.modifiers.join(', ')}</span>}
            {line.note && <span className="block pl-10 text-base font-semibold text-sumac">“{line.note}”</span>}
          </li>
        ))}
      </ul>

      {order.notes && (
        <p className="mx-5 mb-3 rounded-xl bg-ember-soft px-3 py-2 font-semibold text-ember-deep">Note: {order.notes}</p>
      )}

      <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3">
        <span
          className={`rounded-full px-3 py-1 text-sm font-bold ${
            order.paidOnline ? 'bg-herb-soft text-herb' : 'bg-[#fdeceb] text-sumac'
          }`}
        >
          {order.paidOnline ? `PAID ${formatMoney(order.total)}` : `COLLECT ${formatMoney(order.total)}`}
        </span>
        {isNew ? (
          <button type="button" onClick={() => onStage('preparing')} className="btn btn-primary px-6 text-lg">
            Start
          </button>
        ) : (
          <button type="button" onClick={() => onStage('done')} className="btn bg-herb px-6 text-lg text-white">
            Ready
          </button>
        )}
      </div>
    </article>
  );
}

// ---- Sound and screen ----

let audio: AudioContext | null = null;

/** Browsers only allow sound after a tap, so this runs on the PIN entry and the sound button. */
function unlockAudio() {
  try {
    audio ??= new AudioContext();
    void audio.resume();
  } catch {
    // No Web Audio; the screen still flashes.
  }
}

function playChime() {
  if (!audio || audio.state !== 'running') return;
  const start = audio.currentTime;
  [880, 1320, 1760].forEach((freq, i) => {
    const osc = audio!.createOscillator();
    const gain = audio!.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const t = start + i * 0.18;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.4, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    osc.connect(gain).connect(audio!.destination);
    osc.start(t);
    osc.stop(t + 0.5);
  });
}

function useChime(active: boolean) {
  const activeRef = useRef(active);
  useEffect(() => {
    activeRef.current = active;
    if (!active) return;
    playChime();
    const timer = setInterval(() => activeRef.current && playChime(), CHIME_REPEAT_MS);
    return () => clearInterval(timer);
  }, [active]);
}

/** Keeps the iPad screen from sleeping while the order screen is open. */
function useWakeLock() {
  useEffect(() => {
    let lock: { release(): Promise<void> } | null = null;
    const request = async () => {
      try {
        const nav = navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<{ release(): Promise<void> }> } };
        lock = (await nav.wakeLock?.request('screen')) ?? null;
      } catch {
        // Not supported or not allowed; set Auto-Lock to Never on the iPad instead.
      }
    };
    void request();
    const onVisible = () => document.visibilityState === 'visible' && void request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release();
    };
  }, []);
}
