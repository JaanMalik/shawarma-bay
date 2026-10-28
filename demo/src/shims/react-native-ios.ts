import { Platform as WebPlatform } from 'react-native-web';

export * from 'react-native-web';

/**
 * The cart screen leaves out card payments in the web build of the app (customers on the web use
 * the website). The demo shows what an iPhone gets, so this screen sees iOS.
 */
export const Platform = {
  ...WebPlatform,
  OS: 'ios' as const,
  select<T>(spec: { ios?: T; native?: T; default?: T }): T | undefined {
    return spec.ios ?? spec.native ?? spec.default;
  },
};
