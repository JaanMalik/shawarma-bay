import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';

import { LogoMark } from '@web/components/brand';

import { MobileApp } from '../app/mobile-app';
import { sharedOrders } from '../mock/shared-orders';
import { clearAppStorage } from '../shims/async-storage';
import { SAMPLE_ORDER_IDS } from '../shims/demo-store';
import { cancelAuthSession } from '../shims/expo-web-browser';
import { storage } from '../storage';
import { OrderScreen, Website } from '../web/website';
import { FramePortal } from './frame-portal';

type View = 'website' | 'app' | 'ipad' | 'together';

const VIEWS: { id: View; label: string; short: string; wideOnly?: boolean }[] = [
  { id: 'website', label: 'Website', short: 'Website' },
  { id: 'app', label: 'Phone app', short: 'App' },
  { id: 'ipad', label: 'iPad orders', short: 'iPad' },
  { id: 'together', label: 'Side by side', short: 'Both', wideOnly: true },
];

/** Outer sizes of the device frames, in CSS pixels. */
const PHONE = { width: 414, height: 868, bezel: 12 };
const TABLET = { width: 1216, height: 856, bezel: 18 };
/** Below this stage size the app fills the screen instead of sitting in a phone frame. */
const FRAME_MIN = { width: 640, height: 600 };
/** Side by side needs room for both devices. */
const SIDE_BY_SIDE_MIN_WIDTH = 900;

const STAGES_KEY = 'shawarma-bay-kitchen-stages-v1';
/** The website's saved cart and checkout details (web/src/components). */
const WEBSITE_KEYS = ['shawarma-bay-cart-v1', 'shawarma-bay-customer-v1'];

/** The sample orders start as "being made", so only new test orders flash and chime. */
export function prepareKitchenStages({ reset = false } = {}) {
  let stages: Record<string, string> = {};
  if (!reset) {
    try {
      stages = JSON.parse(storage.get(STAGES_KEY) ?? '{}') as Record<string, string>;
    } catch {
      stages = {};
    }
  }
  for (const id of SAMPLE_ORDER_IDS) stages[id] ??= 'preparing';
  storage.set(STAGES_KEY, JSON.stringify(stages));
}

/**
 * Back to a fresh start: no test orders, empty carts, no saved names, and every screen at its
 * start. The iPad stays signed in.
 */
async function resetDemo() {
  cancelAuthSession();
  WEBSITE_KEYS.forEach((key) => storage.remove(key));
  clearAppStorage();
  prepareKitchenStages({ reset: true });
  await sharedOrders.clear();
}

function viewFromHash(): View | null {
  const name = window.location.hash.slice(1);
  return VIEWS.some((v) => v.id === name) ? (name as View) : null;
}

function useStageSize(ref: React.RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

type Placement = { show: false } | { show: true; framed: false } | { show: true; framed: true; x: number; y: number; scale: number };

interface Layout {
  phone: Placement;
  tablet: Placement;
  notes: { x: number; y: number; width: number } | null;
  labels: { text: string; x: number; y: number; width: number }[];
}

const HIDDEN: Placement = { show: false };
const FULL: Placement = { show: true, framed: false };

function layoutFor(view: View, width: number, height: number): Layout {
  const pad = 28;
  const empty: Layout = { phone: HIDDEN, tablet: HIDDEN, notes: null, labels: [] };
  if (view === 'website' || width === 0) return empty;
  if (view === 'ipad') return { ...empty, tablet: FULL };

  const roomy = width >= FRAME_MIN.width && height >= FRAME_MIN.height;
  if (view === 'together' && width >= SIDE_BY_SIDE_MIN_WIDTH && roomy) {
    const gap = Math.max(32, Math.min(72, width * 0.04));
    const labelSpace = 34;
    const scale = Math.min(1, (height - pad * 2 - labelSpace) / PHONE.height, (width - pad * 2 - gap) / (PHONE.width + TABLET.width));
    const groupWidth = (PHONE.width + TABLET.width) * scale + gap;
    const x = (width - groupWidth) / 2;
    const y = labelSpace + (height - labelSpace - PHONE.height * scale) / 2;
    const tabletX = x + PHONE.width * scale + gap;
    const tabletY = y + ((PHONE.height - TABLET.height) * scale) / 2;
    return {
      phone: { show: true, framed: true, x, y, scale },
      tablet: { show: true, framed: true, x: tabletX, y: tabletY, scale },
      notes: null,
      labels: [
        { text: 'Customer’s phone', x, y: y - labelSpace, width: PHONE.width * scale },
        { text: 'Restaurant iPad', x: tabletX, y: tabletY - labelSpace, width: TABLET.width * scale },
      ],
    };
  }

  // The app on its own (also "side by side" when there isn't room for both).
  if (!roomy) return { ...empty, phone: FULL };
  const scale = Math.min(1, (height - pad * 2) / PHONE.height, (width - pad * 2) / PHONE.width);
  const notesWidth = 340;
  const gap = 72;
  const withNotes = width >= PHONE.width * scale + notesWidth + gap + pad * 2;
  const groupWidth = PHONE.width * scale + (withNotes ? notesWidth + gap : 0);
  const x = (width - groupWidth) / 2;
  const y = (height - PHONE.height * scale) / 2;
  return {
    ...empty,
    phone: { show: true, framed: true, x: withNotes ? x + notesWidth + gap : x, y, scale },
    notes: withNotes ? { x, y: height / 2, width: notesWidth } : null,
  };
}

function deviceStyle(placement: Placement): CSSProperties {
  if (!placement.show) return { display: 'none' };
  if (!placement.framed) return {};
  return { transform: `translate(${placement.x}px, ${placement.y}px) scale(${placement.scale})` };
}

export function DemoShell() {
  const [view, setView] = useState<View>(() => viewFromHash() ?? 'website');
  // Bumped by a reset so the website, app, and iPad start over.
  const [run, setRun] = useState(0);
  const stageRef = useRef<HTMLDivElement>(null);
  const stage = useStageSize(stageRef);
  const wide = stage.width >= SIDE_BY_SIDE_MIN_WIDTH || (stage.width === 0 && window.innerWidth >= SIDE_BY_SIDE_MIN_WIDTH);
  const layout = useMemo(() => layoutFor(view, stage.width, stage.height), [view, stage.width, stage.height]);
  const siteScroll = useRef(0);

  useEffect(() => {
    const onHash = () => {
      const next = viewFromHash();
      if (next) setView(next);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // The website scrolls the page; the other views fill the screen. Come back to the same spot.
  useLayoutEffect(() => {
    document.documentElement.dataset.demoView = view;
    if (view === 'website') window.scrollTo({ top: siteScroll.current, behavior: 'instant' });
  }, [view]);

  function choose(next: View) {
    if (view === 'website') siteScroll.current = window.scrollY;
    setView(next);
    if (window.location.hash !== `#${next}`) window.location.hash = next;
  }

  const phoneFramed = layout.phone.show && layout.phone.framed;
  const appInsets = useMemo(
    () => (phoneFramed ? { top: 50, right: 0, bottom: 28, left: 0 } : { top: 0, right: 0, bottom: 0, left: 0 }),
    [phoneFramed],
  );

  return (
    <div className="demo-root" data-view={view}>
      <DemoBar
        view={view}
        wide={wide}
        onChoose={choose}
        onReset={async () => {
          await resetDemo();
          siteScroll.current = 0;
          if (view === 'website') window.scrollTo({ top: 0, behavior: 'instant' });
          setRun((r) => r + 1);
        }}
      />

      <div className="demo-site" hidden={view !== 'website'}>
        <Website key={run} scrollWindow={() => window} />
      </div>

      <div className="demo-stage" ref={stageRef} hidden={view === 'website'}>
        {layout.labels.map((label) => (
          <p key={label.text} className="demo-label" style={{ left: label.x, top: label.y, width: label.width }}>
            {label.text}
          </p>
        ))}

        {layout.notes && (
          <aside className="demo-notes" style={{ left: layout.notes.x, top: layout.notes.y, width: layout.notes.width }}>
            <p className="demo-eyebrow">iPhone and Android app</p>
            <h1 className="demo-heading">Order in a few taps</h1>
            <p>
              This is the app customers download. It shows the same menu as the website, and its orders go to the
              same iPad screen in the restaurant.
            </p>
            {wide && (
              <button type="button" className="demo-link" onClick={() => choose('together')}>
                See it next to the iPad →
              </button>
            )}
          </aside>
        )}

        <div className={`device device-phone ${phoneFramed ? 'is-framed' : 'is-full'}`} style={deviceStyle(layout.phone)}>
          <div className="device-screen phone-screen">
            <MobileApp key={run} insets={appInsets} />
            {phoneFramed && <PhoneStatusBar />}
            {phoneFramed && <span className="phone-home" aria-hidden="true" />}
          </div>
        </div>

        <div
          className={`device device-tablet ${layout.tablet.show && layout.tablet.framed ? 'is-framed' : 'is-full'}`}
          style={deviceStyle(layout.tablet)}
        >
          <div className="device-screen tablet-screen">
            <FramePortal key={run} title="Restaurant iPad order screen" className="tablet-frame">
              {() => <OrderScreen />}
            </FramePortal>
          </div>
        </div>
      </div>
    </div>
  );
}

function DemoBar({
  view,
  wide,
  onChoose,
  onReset,
}: {
  view: View;
  wide: boolean;
  onChoose(view: View): void;
  onReset(): Promise<void>;
}) {
  const views = VIEWS.filter((v) => wide || !v.wideOnly);
  return (
    <header className="demo-bar">
      <div className="demo-brand">
        <LogoMark size={26} />
        <span className="demo-brand-name">Shawarma Bay</span>
        <span className="demo-tag">Demo</span>
      </div>
      <nav className="demo-switch" aria-label="Choose what to show">
        {views.map((v) => (
          <button key={v.id} type="button" aria-pressed={view === v.id} onClick={() => onChoose(v.id)}>
            <span className="demo-switch-long">{v.label}</span>
            <span className="demo-switch-short">{v.short}</span>
          </button>
        ))}
      </nav>
      <div className="demo-tools">
        <SyncNote />
        <ResetButton onReset={onReset} />
      </div>
    </header>
  );
}

function SyncNote() {
  const state = useSyncExternalStore(sharedOrders.subscribe, sharedOrders.syncState, sharedOrders.syncState);
  if (state === 'connecting') return null;
  return (
    <span className={`demo-sync ${state === 'shared' ? 'is-shared' : ''}`}>
      {state === 'shared' ? 'Orders sync across your devices' : 'Orders stay on this device'}
    </span>
  );
}

function ResetButton({ onReset }: { onReset(): Promise<void> }) {
  const [step, setStep] = useState<'idle' | 'confirm' | 'busy' | 'done'>('idle');

  useEffect(() => {
    if (step !== 'confirm' && step !== 'done') return;
    const timer = setTimeout(() => setStep('idle'), 3000);
    return () => clearTimeout(timer);
  }, [step]);

  const label = { idle: 'Reset demo', confirm: 'Confirm reset', busy: 'Resetting…', done: 'Fresh start' }[step];
  return (
    <button
      type="button"
      className={`demo-reset ${step === 'confirm' ? 'is-confirming' : ''}`}
      title="Clears test orders, carts, and saved names"
      disabled={step === 'busy'}
      onClick={async () => {
        if (step !== 'confirm') return setStep('confirm');
        setStep('busy');
        await onReset().catch(() => {});
        setStep('done');
      }}
    >
      {label}
    </button>
  );
}

function PhoneStatusBar() {
  const [time, setTime] = useState(() => clock());
  useEffect(() => {
    const timer = setInterval(() => setTime(clock()), 15_000);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className="phone-status" aria-hidden="true">
      <span className="phone-time">{time}</span>
      <span className="phone-island" />
      <span className="phone-icons">
        <svg width="18" height="12" viewBox="0 0 18 12">
          <rect x="0" y="8" width="3" height="4" rx="1" fill="currentColor" />
          <rect x="5" y="5.5" width="3" height="6.5" rx="1" fill="currentColor" />
          <rect x="10" y="3" width="3" height="9" rx="1" fill="currentColor" />
          <rect x="15" y="0" width="3" height="12" rx="1" fill="currentColor" />
        </svg>
        <svg width="16" height="12" viewBox="0 0 16 12">
          <path d="M8 11.5l2.4-2.9a3.6 3.6 0 0 0-4.8 0z" fill="currentColor" />
          <path d="M3.9 6.6a6.2 6.2 0 0 1 8.2 0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M1.3 3.7a10 10 0 0 1 13.4 0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <svg width="27" height="13" viewBox="0 0 27 13">
          <rect x="0.5" y="0.5" width="23" height="12" rx="3.5" fill="none" stroke="currentColor" strokeOpacity="0.4" />
          <rect x="2" y="2" width="18" height="9" rx="2" fill="currentColor" />
          <path d="M25 4.5v4a2 2 0 0 0 0-4z" fill="currentColor" fillOpacity="0.4" />
        </svg>
      </span>
    </div>
  );
}

function clock() {
  return new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(/\s?[AP]M$/, '');
}
