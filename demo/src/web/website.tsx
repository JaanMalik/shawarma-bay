import { useEffect, useState } from 'react';

import type { Menu } from '@shawarma-bay/core';

import AppPayPage from '@web/app/(site)/app-pay/page';
import CheckoutPage from '@web/app/(site)/checkout/page';
import OrderPage from '@web/app/(site)/order/[id]/page';
import HomePage from '@web/app/(site)/page';
import KitchenLayout from '@web/app/kitchen/layout';
import { CartProvider } from '@web/components/cart-provider';
import { KitchenScreen } from '@web/components/kitchen-screen';
import { SiteFooter } from '@web/components/site-footer';
import { SiteHeader } from '@web/components/site-header';

import { useWebRouter, WebRouterProvider } from '../shims/next-navigation';

let menuRequest: Promise<Menu> | null = null;
const loadMenu = () => (menuRequest ??= fetch('/api/menu').then((res) => res.json() as Promise<Menu>));

/** The website as app/(site)/layout.tsx renders it, around the page for the current address. */
export function Website({ initialUrl = '/', scrollWindow }: { initialUrl?: string; scrollWindow?: () => Window }) {
  const [menu, setMenu] = useState<Menu | null>(null);

  useEffect(() => {
    let live = true;
    loadMenu().then((m) => live && setMenu(m));
    return () => {
      live = false;
    };
  }, []);

  if (!menu) return <div className="min-h-dvh" />;
  return (
    <WebRouterProvider initial={initialUrl} scrollWindow={scrollWindow}>
      <CartProvider menu={menu}>
        <div className="flex min-h-dvh flex-col">
          <SiteHeader />
          <main className="flex-1">
            <SitePage />
          </main>
          <SiteFooter />
        </div>
      </CartProvider>
    </WebRouterProvider>
  );
}

function SitePage() {
  const { pathname } = useWebRouter().location;
  if (pathname === '/checkout') return <CheckoutPage />;
  if (pathname.startsWith('/order/')) return <OrderPage key={pathname} />;
  if (pathname === '/app-pay') return <AppPayPage />;
  return <HomePage />;
}

/** The restaurant's order screen (/kitchen), checking for orders every second in the demo. */
export function OrderScreen() {
  return (
    <KitchenLayout>
      <KitchenScreen pollMs={1000} />
    </KitchenLayout>
  );
}
