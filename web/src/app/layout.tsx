import type { Metadata, Viewport } from 'next';
import { Barlow_Condensed, Inter } from 'next/font/google';

import { restaurant } from '@shawarma-bay/core';

import './globals.css';

const display = Barlow_Condensed({
  variable: '--font-barlow-condensed',
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  style: ['normal', 'italic'],
});

const sans = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: {
    default: `${restaurant.name} ${restaurant.location} · Order online for pickup`,
    template: `%s · ${restaurant.name}`,
  },
  description: `${restaurant.tagline}. Order ahead for pickup at ${restaurant.address.line1}, ${restaurant.address.city}, ${restaurant.address.state}.`,
};

export const viewport: Viewport = {
  themeColor: '#1c1714',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} h-full`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
