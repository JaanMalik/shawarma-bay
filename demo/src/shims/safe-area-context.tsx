import { createContext, useContext, type ReactNode } from 'react';
import { View, type ViewProps } from 'react-native';

/** Safe-area insets come from the demo's phone frame (notch and home bar) instead of a device. */

export interface EdgeInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

const NO_INSETS: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 };
export const SafeAreaInsetsContext = createContext<EdgeInsets>(NO_INSETS);
export const initialWindowMetrics = null;

export function SafeAreaProvider({ insets = NO_INSETS, children }: { insets?: EdgeInsets; children: ReactNode }) {
  return <SafeAreaInsetsContext.Provider value={insets}>{children}</SafeAreaInsetsContext.Provider>;
}

export function useSafeAreaInsets(): EdgeInsets {
  return useContext(SafeAreaInsetsContext);
}

export function SafeAreaView({ style, edges: _edges, ...props }: ViewProps & { edges?: unknown }) {
  const insets = useSafeAreaInsets();
  return (
    <View
      {...props}
      style={[
        { paddingTop: insets.top, paddingRight: insets.right, paddingBottom: insets.bottom, paddingLeft: insets.left },
        style,
      ]}
    />
  );
}
