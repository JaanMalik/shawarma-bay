import RootLayout from '@mobile/app/_layout';
import CartScreen from '@mobile/app/cart';
import MenuScreen from '@mobile/app/index';
import ItemScreen from '@mobile/app/item/[id]';
import OrderScreen from '@mobile/app/order/[id]';
import PaymentComplete from '@mobile/app/payment-complete';

import { RouterProvider } from '../shims/expo-router';
import { SafeAreaProvider, type EdgeInsets } from '../shims/safe-area-context';
import { InAppBrowser } from './in-app-browser';

/** The app's screens by Expo Router file name (mobile/src/app). */
const routes = {
  index: MenuScreen,
  'item/[id]': ItemScreen,
  cart: CartScreen,
  'order/[id]': OrderScreen,
  'payment-complete': PaymentComplete,
};

/** The mobile app, rendered with react-native-web inside the demo phone. */
export function MobileApp({ insets }: { insets: EdgeInsets }) {
  return (
    <SafeAreaProvider insets={insets}>
      <RouterProvider routes={routes}>
        <RootLayout />
      </RouterProvider>
      <InAppBrowser topInset={insets.top} />
    </SafeAreaProvider>
  );
}
