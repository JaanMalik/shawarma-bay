import path from 'node:path';
import { fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

/**
 * Builds the website, the mobile app (through react-native-web), and the iPad order screen into
 * one static page. The real components are used as they are; only the pieces that need a server
 * or a phone (Next.js routing, Expo Router, storage, the API) are swapped for in-browser stand-ins
 * from src/shims.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const web = path.resolve(here, '../web/src');
const mobile = path.resolve(here, '../mobile/src');
const shims = path.resolve(here, 'src/shims');

/** Packages replaced wherever they are imported. */
const packageShims: Record<string, string> = {
  'next/link': 'next-link.tsx',
  'next/navigation': 'next-navigation.tsx',
  'next/headers': 'next-headers.ts',
  'next/cache': 'next-cache.ts',
  'server-only': 'empty.ts',
  'node:crypto': 'node-crypto.ts',
  'expo-router': 'expo-router.tsx',
  'expo-web-browser': 'expo-web-browser.ts',
  'expo-haptics': 'expo-haptics.ts',
  'expo-splash-screen': 'expo-splash-screen.ts',
  'expo-status-bar': 'expo-status-bar.ts',
  '@react-native-async-storage/async-storage': 'async-storage.ts',
  'react-native-safe-area-context': 'safe-area-context.tsx',
};

/** Files of the real app replaced by a demo version (the shim may still import the original). */
const fileShims: Record<string, string> = {
  [path.join(web, 'server/http.ts')]: 'server-http.ts',
  [path.join(web, 'server/kitchen-auth.ts')]: 'kitchen-auth.ts',
  [path.join(web, 'server/demo-store.ts')]: 'demo-store.ts',
  [path.join(web, 'lib/open-app.ts')]: 'open-app.ts',
};

function demoResolver(): Plugin {
  return {
    name: 'shawarma-bay-demo-resolver',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (packageShims[source]) return path.join(shims, packageShims[source]);
      if (!importer || importer.includes('/node_modules/')) return null;

      if (source === 'react-native') {
        // The cart screen offers card payments on phones only, so it sees an iPhone.
        if (importer === path.join(mobile, 'app/cart.tsx')) return path.join(shims, 'react-native-ios.ts');
        return this.resolve('react-native-web', importer, { ...options, skipSelf: true });
      }

      let target = source;
      if (source.startsWith('@web/')) target = path.join(web, source.slice(5));
      else if (source.startsWith('@mobile/')) target = path.join(mobile, source.slice(8));
      else if (source.startsWith('@/')) {
        // Both apps use "@/" for their own src folder.
        if (importer.startsWith(mobile)) target = path.join(mobile, source.slice(2));
        else if (importer.startsWith(web)) target = path.join(web, source.slice(2));
      }

      const resolved = await this.resolve(target, importer, { ...options, skipSelf: true });
      if (resolved && fileShims[resolved.id] && !importer.startsWith(shims)) {
        return path.join(shims, fileShims[resolved.id]);
      }
      return resolved;
    },
  };
}

export default defineConfig({
  root: here,
  plugins: [demoResolver(), react(), tailwindcss()],
  resolve: { dedupe: ['react', 'react-dom'] },
  define: {
    // Same origin as the page, where the in-browser API answers.
    'process.env.EXPO_PUBLIC_API_URL': JSON.stringify(''),
    // No Clover settings, so the website code runs in demo mode.
    'process.env': '{}',
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    cssCodeSplit: false,
    modulePreload: false,
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    chunkSizeWarningLimit: 4000,
  },
});
