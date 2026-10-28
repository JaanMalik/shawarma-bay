import * as Haptics from 'expo-haptics';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextProps,
  type ViewStyle,
} from 'react-native';

import { colors, fonts, radius, space } from '@/constants/theme';

export function tap() {
  if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
}

export function Display({ style, ...props }: TextProps) {
  return <Text {...props} style={[styles.display, style]} />;
}

export function Button({
  title,
  onPress,
  disabled,
  loading,
  variant = 'primary',
  left,
  right,
  style,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'ghost';
  left?: ReactNode;
  right?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const primary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading }}
      disabled={disabled || loading}
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [
        styles.button,
        primary ? styles.buttonPrimary : styles.buttonGhost,
        (disabled || loading) && { opacity: 0.5 },
        pressed && { transform: [{ scale: 0.98 }], opacity: 0.9 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={primary ? colors.white : colors.coal} />
      ) : (
        <>
          {left}
          <Text style={[styles.buttonText, !primary && { color: colors.coal }]}>{title}</Text>
          {right}
        </>
      )}
    </Pressable>
  );
}

export function QuantityStepper({
  value,
  onChange,
  min = 0,
  max = 20,
  label,
  small,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  label: string;
  small?: boolean;
}) {
  const size = small ? 32 : 44;
  return (
    <View style={styles.stepper}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={value - 1 <= 0 ? `Remove ${label}` : `One less ${label}`}
        disabled={value <= min}
        onPress={() => {
          tap();
          onChange(value - 1);
        }}
        style={[styles.stepperButton, { width: size, height: size }, value <= min && { opacity: 0.35 }]}
      >
        <Text style={styles.stepperGlyph}>−</Text>
      </Pressable>
      <Text style={styles.stepperValue}>{value}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`One more ${label}`}
        disabled={value >= max}
        onPress={() => {
          tap();
          onChange(value + 1);
        }}
        style={[styles.stepperButton, { width: size, height: size }, value >= max && { opacity: 0.35 }]}
      >
        <Text style={styles.stepperGlyph}>+</Text>
      </Pressable>
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <View style={styles.error} accessibilityRole="alert">
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

export const styles = StyleSheet.create({
  display: {
    fontFamily: fonts.display,
    fontStyle: Platform.OS === 'ios' ? 'normal' : 'italic',
    fontWeight: Platform.OS === 'ios' ? undefined : '800',
    textTransform: 'uppercase',
    color: colors.coal,
    letterSpacing: 0.3,
  },
  button: {
    minHeight: 52,
    borderRadius: radius.pill,
    paddingHorizontal: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  buttonPrimary: { backgroundColor: colors.ember },
  buttonGhost: { borderWidth: 1.5, borderColor: colors.coal },
  buttonText: { color: colors.white, fontSize: 17, fontWeight: '700' },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: radius.pill,
    backgroundColor: colors.white,
    alignSelf: 'flex-start',
  },
  stepperButton: { alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill },
  stepperGlyph: { fontSize: 20, fontWeight: '700', color: colors.coal },
  stepperValue: { minWidth: 24, textAlign: 'center', fontWeight: '600', fontSize: 16, color: colors.coal },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space.md,
  },
  error: { backgroundColor: colors.errorSoft, borderRadius: radius.sm, padding: space.md },
  errorText: { color: colors.sumac, fontWeight: '600' },
});
