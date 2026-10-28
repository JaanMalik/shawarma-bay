import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

const BLANK = '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"></head><body></body></html>';
/** How long to wait for the frame before rendering in place instead. */
const FRAME_TIMEOUT_MS = 3000;

/**
 * Renders into an iframe of its own, so the website's phone and tablet layouts (which follow the
 * window's width) apply at the frame's size. The components still run in this page; the frame
 * only provides the document, with this page's styles copied in. If the page isn't allowed to
 * reach into the frame, the content renders in place instead, at this page's breakpoints.
 */
export function FramePortal({
  title,
  className,
  style,
  bodyClassName = '',
  children,
}: {
  title: string;
  className?: string;
  style?: CSSProperties;
  bodyClassName?: string;
  children: (frameWindow: Window) => ReactNode;
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [frame, setFrame] = useState<{ body: HTMLElement; win: Window } | null>(null);
  const [inPlace, setInPlace] = useState(false);
  const bodyClass = useRef(bodyClassName);

  useEffect(() => {
    const iframe = ref.current;
    if (!iframe) return;
    let ready = false;
    const readable = () => {
      try {
        return iframe.contentDocument;
      } catch {
        return null;
      }
    };
    const setup = () => {
      const doc = readable();
      const win = iframe.contentWindow;
      // Wait for the srcdoc document; the frame briefly holds an empty about:blank first.
      if (ready || !doc?.body || !win || doc.URL !== 'about:srcdoc') return;
      if (!doc.body.dataset.ready) {
        for (const node of document.querySelectorAll('style, link[rel="stylesheet"]')) {
          doc.head.appendChild(doc.importNode(node, true));
        }
        doc.body.className = bodyClass.current;
        doc.body.dataset.ready = 'true';
      }
      ready = true;
      setFrame({ body: doc.body, win });
    };
    const onLoad = () => {
      setup();
      if (!ready && !readable()) setInPlace(true);
    };
    iframe.addEventListener('load', onLoad);
    if (readable()?.readyState === 'complete') setup();
    const timer = setTimeout(() => !ready && setInPlace(true), FRAME_TIMEOUT_MS);
    return () => {
      iframe.removeEventListener('load', onLoad);
      clearTimeout(timer);
    };
  }, []);

  if (inPlace) {
    return (
      <div className={`${className ?? ''} frame-in-place ${bodyClassName}`} style={style}>
        {children(window)}
      </div>
    );
  }
  return (
    <iframe ref={ref} title={title} srcDoc={BLANK} className={className} style={style}>
      {frame && createPortal(children(frame.win), frame.body)}
    </iframe>
  );
}
