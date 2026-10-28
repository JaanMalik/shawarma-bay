import { Redirect, useLocalSearchParams } from 'expo-router';

/**
 * The website's payment page sends customers back to shawarmabay://payment-complete?order=ID.
 * When the app opens from that link, go straight to the order.
 */
export default function PaymentComplete() {
  const { order } = useLocalSearchParams<{ order?: string }>();
  return order ? <Redirect href={{ pathname: '/order/[id]', params: { id: order } }} /> : <Redirect href="/" />;
}
