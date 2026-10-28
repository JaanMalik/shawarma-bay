import type { AnchorHTMLAttributes, ReactNode } from 'react';

import { useOptionalWebRouter } from './next-navigation';

type Href = string | { pathname?: string; query?: Record<string, string>; hash?: string };

function toHref(href: Href): string {
  if (typeof href === 'string') return href;
  const query = href.query ? `?${new URLSearchParams(href.query)}` : '';
  return `${href.pathname ?? ''}${query}${href.hash ?? ''}`;
}

/** next/link: moves within the site's in-memory address instead of loading a new page. */
export default function Link({
  href,
  replace,
  scroll: _scroll,
  prefetch: _prefetch,
  onClick,
  children,
  ...rest
}: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  href: Href;
  replace?: boolean;
  scroll?: boolean;
  prefetch?: boolean | null;
  children?: ReactNode;
}) {
  const router = useOptionalWebRouter();
  const url = toHref(href);
  return (
    <a
      {...rest}
      href={url}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented || !router) return;
        e.preventDefault();
        router.navigate(url, replace ? 'replace' : 'push');
      }}
    >
      {children}
    </a>
  );
}
