import { Linking } from 'react-native-web';

/**
 * The app's Directions and Call buttons use Linking.openURL, which react-native-web turns into
 * window.open. A claude.ai page can't open windows for most viewers, so follow a real link instead.
 */
export function installAppLinks() {
  Linking.openURL = async (url: string) => {
    const link = document.createElement('a');
    link.href = url;
    if (!url.startsWith('tel:')) {
      link.target = '_blank';
      link.rel = 'noopener';
    }
    document.body.appendChild(link);
    link.click();
    link.remove();
  };
}
