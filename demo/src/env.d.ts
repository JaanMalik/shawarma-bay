/// <reference types="vite/client" />

// react-native-web ships without types; it implements the react-native API.
declare module 'react-native-web' {
  export * from 'react-native';
}

// Next.js generates these route helpers into web/.next/types. The demo only needs their shape.
type RouteContext<_Route extends string = string> = { params: Promise<Record<string, string>> };
type LayoutProps<_Route extends string = string> = { children: import('react').ReactNode };
