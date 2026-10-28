import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';

/**
 * Next.js routing for the demo page: each copy of the website (the page itself, and the one
 * inside the app's payment sheet) keeps its own address in memory, since the demo page can't
 * change the browser's address.
 */

export interface WebLocation {
  pathname: string;
  search: string;
  hash: string;
}

interface WebRouter {
  location: WebLocation;
  params: Record<string, string>;
  navigate(href: string, mode?: 'push' | 'replace'): void;
  back(): void;
}

const WebRouterContext = createContext<WebRouter | null>(null);

/** Dynamic routes of the website, as in app/(site)/. */
const DYNAMIC_ROUTES = [{ pattern: /^\/order\/([^/]+)$/, keys: ['id'] }];

function parse(href: string, from?: WebLocation): WebLocation {
  const base = `https://site.invalid${from ? from.pathname + from.search : '/'}`;
  const url = new URL(href, base);
  return { pathname: url.pathname, search: url.search, hash: url.hash };
}

function paramsOf(pathname: string): Record<string, string> {
  for (const { pattern, keys } of DYNAMIC_ROUTES) {
    const match = pattern.exec(pathname);
    if (match) return Object.fromEntries(keys.map((k, i) => [k, decodeURIComponent(match[i + 1])]));
  }
  return {};
}

export function WebRouterProvider({
  initial = '/',
  scrollWindow,
  children,
}: {
  initial?: string;
  /** The window this copy of the site scrolls in (the page, or the payment sheet's frame). */
  scrollWindow?: () => Window | null | undefined;
  children: ReactNode;
}) {
  const [history, setHistory] = useState<WebLocation[]>(() => [parse(initial)]);
  const location = history[history.length - 1];
  const [navigations, setNavigations] = useState(0);
  const scrolledFor = useRef(0);

  const navigate = useCallback((href: string, mode: 'push' | 'replace' = 'push') => {
    setHistory((prev) => {
      const next = parse(href, prev[prev.length - 1]);
      return mode === 'replace' ? [...prev.slice(0, -1), next] : [...prev, next];
    });
    setNavigations((n) => n + 1);
  }, []);

  const back = useCallback(() => {
    setHistory((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
    setNavigations((n) => n + 1);
  }, []);

  // Like a page load: go to the #section if there is one, otherwise to the top.
  useLayoutEffect(() => {
    if (navigations === scrolledFor.current) return;
    scrolledFor.current = navigations;
    const win = scrollWindow?.() ?? window;
    const target = location.hash ? win.document.getElementById(decodeURIComponent(location.hash.slice(1))) : null;
    // Instant, as on a new page (the site's CSS asks for smooth scrolling within a page).
    if (target) target.scrollIntoView({ behavior: 'instant' });
    else win.scrollTo({ top: 0, behavior: 'instant' });
  }, [navigations, location, scrollWindow]);

  const value = useMemo(
    () => ({ location, params: paramsOf(location.pathname), navigate, back }),
    [location, navigate, back],
  );
  return <WebRouterContext.Provider value={value}>{children}</WebRouterContext.Provider>;
}

export function useOptionalWebRouter(): WebRouter | null {
  return useContext(WebRouterContext);
}

export function useWebRouter(): WebRouter {
  const router = useContext(WebRouterContext);
  if (!router) throw new Error('The website needs a WebRouterProvider.');
  return router;
}

export function useRouter() {
  const { navigate, back } = useWebRouter();
  return useMemo(
    () => ({
      push: (href: string) => navigate(href, 'push'),
      replace: (href: string) => navigate(href, 'replace'),
      back,
      forward() {},
      refresh() {},
      prefetch() {},
    }),
    [navigate, back],
  );
}

export function usePathname(): string {
  return useWebRouter().location.pathname;
}

export function useSearchParams(): URLSearchParams {
  const { search } = useWebRouter().location;
  return useMemo(() => new URLSearchParams(search), [search]);
}

export function useParams<T extends Record<string, string> = Record<string, string>>(): T {
  return useWebRouter().params as T;
}

export function notFound(): never {
  throw new Error('Not found');
}

export function redirect(href: string): never {
  throw new Error(`Redirect to ${href} is not supported in the demo`);
}
