import { Platform } from 'react-native';

/** Same palette as the website: the storefront's charcoal and orange on warm paper. */
export const colors = {
  coal: '#1c1714',
  coal2: '#2a231e',
  smoke: '#6f655d',
  paper: '#fbf6ef',
  card: '#ffffff',
  line: '#eadfd2',
  ember: '#ea6a1c',
  emberDeep: '#c4520c',
  emberSoft: '#fde7d6',
  sumac: '#8e2b2b',
  errorSoft: '#fdeceb',
  herb: '#2f7a45',
  white: '#ffffff',
} as const;

export const fonts = {
  /** Condensed italic headings, like the sign. */
  display: Platform.select({
    ios: 'AvenirNextCondensed-HeavyItalic',
    android: 'sans-serif-condensed',
    default: "'Barlow Condensed', 'Arial Narrow', sans-serif",
  }),
} as const;

export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;
export const radius = { sm: 12, md: 16, lg: 22, pill: 999 } as const;
