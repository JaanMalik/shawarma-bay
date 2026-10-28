import * as configRoute from '@web/app/api/config/route';
import * as kitchenOrdersRoute from '@web/app/api/kitchen/orders/route';
import * as kitchenSessionRoute from '@web/app/api/kitchen/session/route';
import * as menuRoute from '@web/app/api/menu/route';
import * as orderRoute from '@web/app/api/orders/[id]/route';
import * as ordersRoute from '@web/app/api/orders/route';
import * as quoteRoute from '@web/app/api/quote/route';

/**
 * The website's API, answered inside the page: fetch('/api/…') from the website, the app, and the
 * order screen goes to the real route handlers in web/src/app/api, running in demo mode.
 */

type Handler = (request: Request, context: { params: Promise<Record<string, string>> }) => Response | Promise<Response>;
type RouteModule = Partial<Record<string, Handler>>;

const routes: [RegExp, RouteModule, string[]][] = [
  [/^\/api\/menu$/, menuRoute as RouteModule, []],
  [/^\/api\/config$/, configRoute as RouteModule, []],
  [/^\/api\/quote$/, quoteRoute as RouteModule, []],
  [/^\/api\/orders$/, ordersRoute as RouteModule, []],
  [/^\/api\/orders\/([^/]+)$/, orderRoute as RouteModule, ['id']],
  [/^\/api\/kitchen\/session$/, kitchenSessionRoute as RouteModule, []],
  [/^\/api\/kitchen\/orders$/, kitchenOrdersRoute as RouteModule, []],
];

/** A short wait where a real network would make one, so "Placing your order…" is visible. */
function latency(method: string, path: string) {
  if (method === 'POST' && path === '/api/orders') return 900;
  if (method === 'POST') return 150;
  return 0;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function installMockApi() {
  const realFetch = window.fetch.bind(window);
  const pageHost = new URL(document.baseURI).host;

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input instanceof Request ? input : String(input), init);
    const url = new URL(request.url);
    if (url.host !== pageHost || !url.pathname.startsWith('/api/')) return realFetch(input, init);

    for (const [pattern, route, keys] of routes) {
      const match = pattern.exec(url.pathname);
      if (!match) continue;
      const handler = route[request.method];
      if (!handler) return Response.json({ error: 'Method not allowed' }, { status: 405 });
      const params = Object.fromEntries(keys.map((k, i) => [k, decodeURIComponent(match[i + 1])]));
      await wait(latency(request.method, url.pathname));
      return handler(request, { params: Promise.resolve(params) });
    }
    return Response.json({ error: 'Not found' }, { status: 404 });
  };
}
