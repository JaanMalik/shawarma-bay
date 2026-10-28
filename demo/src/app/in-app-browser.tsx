import { useEffect, useState } from 'react';

import { cancelAuthSession, useAuthSession, type AuthSession } from '../shims/expo-web-browser';
import { FramePortal } from '../shell/frame-portal';
import { Website } from '../web/website';

/**
 * The secure browser sheet the app opens for card payments, showing the website's /app-pay page
 * at phone size. It closes when the website hands back to the app, or on Cancel.
 */
export function InAppBrowser({ topInset }: { topInset: number }) {
  const session = useAuthSession();
  const [last, setLast] = useState<AuthSession | null>(null);

  useEffect(() => {
    if (session) {
      setLast(session);
      return;
    }
    const timer = setTimeout(() => setLast(null), 320);
    return () => clearTimeout(timer);
  }, [session]);

  const shown = session ?? last;
  if (!shown) return null;
  const url = new URL(shown.url, 'https://site.invalid');

  return (
    <div className="iab-layer">
      <div className={`iab-dim ${session ? '' : 'iab-dim-out'}`} />
      <div className={`iab-sheet ${session ? 'iab-in' : 'iab-out'}`} style={{ top: topInset + 10 }}>
        <div className="iab-bar">
          <button type="button" className="iab-cancel" onClick={cancelAuthSession}>
            Cancel
          </button>
          <span className="iab-address">
            <svg width="11" height="13" viewBox="0 0 24 28" aria-hidden="true">
              <rect x="3" y="12" width="18" height="14" rx="3" fill="currentColor" />
              <path d="M7 12V8a5 5 0 0 1 10 0v4" fill="none" stroke="currentColor" strokeWidth="3" />
            </svg>
            Shawarma Bay secure checkout
          </span>
        </div>
        <FramePortal key={shown.id} title="Shawarma Bay payment page" className="iab-frame">
          {(frameWindow) => <Website initialUrl={url.pathname + url.search} scrollWindow={() => frameWindow} />}
        </FramePortal>
      </div>
    </div>
  );
}
