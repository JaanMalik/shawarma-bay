import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'Online orders',
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: 'SB Orders', statusBarStyle: 'black-translucent' },
};

export const viewport: Viewport = {
  themeColor: '#1c1714',
};

export default function KitchenLayout({ children }: LayoutProps<'/kitchen'>) {
  return <div className="min-h-dvh bg-coal text-white">{children}</div>;
}
