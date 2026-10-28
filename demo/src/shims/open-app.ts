import { completeAuthSession } from './expo-web-browser';

/** The app lives on the same page in the demo, so finish its payment sheet instead of leaving. */
export function openApp(url: string) {
  completeAuthSession(url);
}
