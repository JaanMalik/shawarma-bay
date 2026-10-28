import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatMoney, restaurant, type OrderView } from '@shawarma-bay/core';

import { Button, Card, Display, ErrorNote } from '@/components/ui';
import { colors, radius, space } from '@/constants/theme';
import { api } from '@/lib/api';

export default function OrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [order, setOrder] = useState<OrderView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .order(id)
      .then(({ order }) => !cancelled && setOrder(order))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [id]);

  const done = () => router.dismissTo('/');

  return (
    <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.xl }]}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Text onPress={done} style={styles.headerDone} accessibilityRole="button">
              Done
            </Text>
          ),
        }}
      />
      {error ? (
        <View style={{ gap: space.md }}>
          <ErrorNote message={error} />
          <Button title={`Call ${restaurant.phone}`} onPress={() => Linking.openURL(restaurant.phoneHref)} />
        </View>
      ) : !order ? (
        <ActivityIndicator color={colors.ember} size="large" style={{ marginTop: space.xl }} />
      ) : (
        <>
          <View style={styles.hero}>
            <View style={styles.check}>
              <Text style={styles.checkMark}>✓</Text>
            </View>
            <Display style={styles.thanks}>Thanks, {order.customerName.split(' ')[0]}!</Display>
            <Text style={styles.heroText}>Your order is in and the kitchen has it.</Text>
          </View>

          <Card style={styles.facts}>
            <Fact label="Pickup" value={order.pickupLabel} />
            <Fact label="Order" value={`#${order.id.slice(-4)}`} />
            <Fact
              label="Payment"
              value={order.paidOnline ? `Paid ${formatMoney(order.total)}` : `Pay ${formatMoney(order.total)} at pickup`}
            />
          </Card>

          <Card style={{ marginTop: space.md }}>
            {order.lines.map((line, i) => (
              <View key={i} style={styles.line}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.lineName}>
                    {line.quantity} × {line.name}
                  </Text>
                  {line.modifiers.length > 0 && <Text style={styles.muted}>{line.modifiers.join(', ')}</Text>}
                  {line.note ? <Text style={[styles.muted, { fontStyle: 'italic' }]}>“{line.note}”</Text> : null}
                </View>
                <Text style={{ color: colors.coal }}>{formatMoney(line.total)}</Text>
              </View>
            ))}
            <View style={styles.totals}>
              <Row label="Subtotal" value={formatMoney(order.subtotal)} />
              <Row label="Tax" value={formatMoney(order.tax)} />
              {order.tip > 0 && <Row label="Tip" value={formatMoney(order.tip)} />}
              <Row label="Total" value={formatMoney(order.total)} bold />
            </View>
          </Card>

          <Card style={{ marginTop: space.md, gap: space.md }}>
            <Text style={styles.lineName}>
              {restaurant.address.line1}, {restaurant.address.city}
            </Text>
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <Button title="Directions" onPress={() => Linking.openURL(restaurant.mapsUrl)} style={{ flex: 1 }} />
              <Button title="Call" variant="ghost" onPress={() => Linking.openURL(restaurant.phoneHref)} style={{ flex: 1 }} />
            </View>
          </Card>
          <Button title="Back to the menu" variant="ghost" onPress={done} style={{ marginTop: space.lg }} />
        </>
      )}
    </ScrollView>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, minWidth: 90 }}>
      <Text style={styles.factLabel}>{label.toUpperCase()}</Text>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: bold ? space.sm : 2 }}>
      <Text style={bold ? styles.total : styles.muted}>{label}</Text>
      <Text style={bold ? styles.total : { color: colors.coal }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.md },
  headerDone: { color: colors.white, fontWeight: '700', fontSize: 17, paddingHorizontal: 8 },
  hero: { backgroundColor: colors.coal, borderRadius: radius.lg, padding: space.lg },
  check: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.herb,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkMark: { color: colors.white, fontSize: 22, fontWeight: '800' },
  thanks: { color: colors.white, fontSize: 40, lineHeight: 42, marginTop: space.md },
  heroText: { color: 'rgba(255,255,255,0.8)', fontSize: 16, marginTop: space.xs },
  facts: { marginTop: space.md, flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  factLabel: { fontSize: 11, fontWeight: '800', color: colors.smoke, letterSpacing: 1 },
  factValue: { fontSize: 16, fontWeight: '700', color: colors.coal, marginTop: 4 },
  line: { flexDirection: 'row', gap: space.md, marginBottom: space.md },
  lineName: { fontWeight: '700', fontSize: 16, color: colors.coal },
  muted: { color: colors.smoke, fontSize: 14 },
  totals: { borderTopWidth: 1, borderTopColor: colors.line, paddingTop: space.md },
  total: { fontWeight: '800', fontSize: 18, color: colors.coal },
});
