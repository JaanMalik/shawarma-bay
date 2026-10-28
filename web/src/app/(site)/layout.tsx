import { CartProvider } from '@/components/cart-provider';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { getMenu } from '@/server/ordering';

export default async function SiteLayout({ children }: LayoutProps<'/'>) {
  const menu = await getMenu();
  return (
    <CartProvider menu={menu}>
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </CartProvider>
  );
}
