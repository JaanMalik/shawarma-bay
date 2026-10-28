import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  APP_SCHEME,
  encodeHandoff,
  formatMoney,
  formatTime,
  isAcceptingOrders,
  normalizePhone,
  pickupSlots,
  restaurant,
  type CartLine,
  type Pickup,
  type Quote,
} from '@shawarma-bay/core';

import { Button, Card, Display, ErrorNote, QuantityStepper, tap } from '@/components/ui';
import { colors, radius, space } from '@/constants/theme';
import { api, API_URL } from '@/lib/api';
import { useStore } from '@/lib/store';

type Method = 'card' | 'in_store';

export default function CartScreen() {
  const store = useStore();
  const { priced, config } = store;
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [name, setName] = useState(store.customer.name);
  const [phone, setPhone] = useState(store.customer.phone);
  const [pickupChoice, setPickupChoice] = useState<string>('asap');
  const [notes, setNotes] = useState('');
  const methods: Method[] = [
    ...(config?.onlinePayments && Platform.OS !== 'web' ? (['card'] as const) : []),
    ...(config?.payAtPickup ? (['in_store'] as const) : []),
  ];
  const [method, setMethod] = useState<Method>(methods[0] ?? 'in_store');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const lines: CartLine[] = useMemo(
    () => priced.map(({ itemId, quantity, modifierIds, note }) => ({ itemId, quantity, modifierIds, ...(note ? { note } : {}) })),
    [priced],
  );
  const linesKey = JSON.stringify(lines);

  useEffect(() => {
    if (lines.length === 0) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      api
        .quote(JSON.parse(linesKey))
        .then((q) => !cancelled && (setQuote(q), setError(null)))
        .catch((e: Error) => !cancelled && setError(e.message));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linesKey]);

  const now = new Date();
  const hours = config?.orderingHours ?? restaurant.hours;
  const accepting = isAcceptingOrders(now, hours);
  const slots = useMemo(() => pickupSlots(new Date(), { hours }).slice(0, 24), [hours]);
  const pickupValue = !accepting && pickupChoice === 'asap' ? (slots[0] ?? 'none') : pickupChoice;
  const closed = !accepting && slots.length === 0;

  if (priced.length === 0) {
    return (
      <View style={[styles.empty, { paddingBottom: insets.bottom }]}>
        <Display style={{ fontSize: 34 }}>Your order is empty</Display>
        <Text style={{ color: colors.smoke, marginVertical: space.md }}>Add something tasty from the menu first.</Text>
        <Button title="Browse the menu" onPress={() => router.back()} />
      </View>
    );
  }

  async function placeOrder() {
    setError(null);
    if (!name.trim()) return setError('Please enter your name.');
    if (!normalizePhone(phone)) return setError('Please enter a 10-digit phone number so we can reach you.');
    if (closed) return setError("We're closed for online orders right now.");
    const pickup: Pickup = pickupValue === 'asap' ? { type: 'asap' } : { type: 'scheduled', time: pickupValue };
    const customer = { name: name.trim(), phone };
    store.saveCustomer(customer);
    setBusy(true);
    try {
      if (method === 'in_store') {
        const { order } = await api.placeOrder({
          lines,
          customer,
          pickup,
          notes: notes.trim() || undefined,
          payment: { method: 'in_store' },
          source: 'app',
        });
        store.clear();
        router.replace({ pathname: '/order/[id]', params: { id: order.id } });
        return;
      }
      // Card payments happen on the website's secure payment page (Clover's card fields).
      const url = `${API_URL}/app-pay?order=${encodeHandoff({ lines, customer, pickup, notes: notes.trim() || undefined })}`;
      const result = await WebBrowser.openAuthSessionAsync(url, `${APP_SCHEME}://`);
      if (result.type === 'success') {
        const match = /[?&]order=([^&#]+)/.exec(result.url);
        const id = match ? decodeURIComponent(match[1]) : null;
        store.clear();
        // On Android the app link itself opens the order screen (see payment-complete.tsx).
        if (id && Platform.OS !== 'android') router.replace({ pathname: '/order/[id]', params: { id } });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Card>
          {priced.map((line) => (
            <View key={line.key} style={styles.line}>
              <View style={styles.lineTop}>
                <Text style={styles.lineName}>{line.name}</Text>
                <Text style={styles.lineTotal}>{formatMoney(line.lineTotal)}</Text>
              </View>
              {line.modifiers.length > 0 && <Text style={styles.muted}>{line.modifiers.map((m) => m.name).join(', ')}</Text>}
              {line.note ? <Text style={[styles.muted, { fontStyle: 'italic' }]}>“{line.note}”</Text> : null}
              <QuantityStepper small value={line.quantity} onChange={(q) => store.setQuantity(line.key, q)} label={line.name} />
            </View>
          ))}
          <Pressable onPress={() => router.back()}>
            <Text style={styles.link}>+ Add more items</Text>
          </Pressable>
        </Card>

        <Section title="Your details">
          <Text style={styles.label}>Name</Text>
          <TextInput style={styles.input} value={name} onChangeText={setName} autoComplete="name" textContentType="name" maxLength={60} />
          <Text style={[styles.label, { marginTop: space.md }]}>Mobile number</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
            placeholder="(516) 555-0123"
            placeholderTextColor={colors.smoke}
          />
        </Section>

        <Section title="Pickup time">
          {closed ? (
            <ErrorNote message="We're closed for online orders right now." />
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
              {accepting && (
                <Chip on={pickupValue === 'asap'} onPress={() => setPickupChoice('asap')} label={`ASAP (~${restaurant.prepMinutes} min)`} />
              )}
              {slots.map((s) => (
                <Chip key={s} on={pickupValue === s} onPress={() => setPickupChoice(s)} label={formatTime(s)} />
              ))}
            </ScrollView>
          )}
          <Text style={[styles.muted, { marginTop: space.sm }]}>
            Pick up at {restaurant.address.line1}, {restaurant.address.city}.
          </Text>
        </Section>

        <Section title="Notes for the kitchen">
          <TextInput
            style={[styles.input, { minHeight: 64, textAlignVertical: 'top' }]}
            value={notes}
            onChangeText={setNotes}
            multiline
            maxLength={200}
            placeholder="Anything we should know? (optional)"
            placeholderTextColor={colors.smoke}
          />
        </Section>

        <Section title="Payment">
          <View style={{ gap: space.sm }}>
            {methods.includes('card') && (
              <Choice on={method === 'card'} onPress={() => setMethod('card')} title="Pay now" detail="Card, on Clover's secure page" />
            )}
            {methods.includes('in_store') && (
              <Choice on={method === 'in_store'} onPress={() => setMethod('in_store')} title="Pay at pickup" detail="Cash or card at the counter" />
            )}
          </View>
        </Section>

        <Card style={{ marginTop: space.md }}>
          <Row label="Subtotal" value={quote ? formatMoney(quote.subtotal) : '…'} />
          <Row label="Tax" value={quote ? formatMoney(quote.tax) : '…'} />
          <View style={[styles.lineTop, { marginTop: space.sm }]}>
            <Text style={styles.total}>Total</Text>
            <Text style={styles.total}>{quote ? formatMoney(quote.total) : '…'}</Text>
          </View>
          {method === 'card' && <Text style={styles.muted}>You can add a tip on the payment page.</Text>}
        </Card>
        {error ? (
          <View style={{ marginTop: space.md }}>
            <ErrorNote message={error} />
          </View>
        ) : null}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
        <Button
          title={method === 'card' ? 'Continue to payment' : 'Place order'}
          onPress={placeOrder}
          loading={busy}
          disabled={!quote || closed || methods.length === 0}
        />
        {config?.demo && <Text style={[styles.muted, { textAlign: 'center', marginTop: 6 }]}>Demo mode: no card is charged, and this order isn&apos;t sent to Clover.</Text>}
      </View>
    </KeyboardAvoidingView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card style={{ marginTop: space.md }}>
      <Display style={{ fontSize: 24, marginBottom: space.md }}>{title}</Display>
      {children}
    </Card>
  );
}

function Chip({ on, onPress, label }: { on: boolean; onPress: () => void; label: string }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: on }}
      onPress={() => {
        tap();
        onPress();
      }}
      style={[styles.chip, on && styles.chipOn]}
    >
      <Text style={[styles.chipText, on && { color: colors.emberDeep }]}>{label}</Text>
    </Pressable>
  );
}

function Choice({ on, onPress, title, detail }: { on: boolean; onPress: () => void; title: string; detail: string }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: on }}
      onPress={() => {
        tap();
        onPress();
      }}
      style={[styles.choice, on && styles.chipOn]}
    >
      <View style={[styles.radio, on && { borderColor: colors.ember }]}>{on && <View style={styles.radioDot} />}</View>
      <View>
        <Text style={{ fontWeight: '700', color: colors.coal, fontSize: 16 }}>{title}</Text>
        <Text style={styles.muted}>{detail}</Text>
      </View>
    </Pressable>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={[styles.lineTop, { marginBottom: 4 }]}>
      <Text style={styles.muted}>{label}</Text>
      <Text style={{ color: colors.coal }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.md, paddingBottom: space.xl },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.lg },
  line: { gap: 6, paddingBottom: space.md, marginBottom: space.md, borderBottomWidth: 1, borderBottomColor: colors.line },
  lineTop: { flexDirection: 'row', justifyContent: 'space-between', gap: space.md },
  lineName: { flex: 1, fontWeight: '700', fontSize: 16, color: colors.coal },
  lineTotal: { fontVariant: ['tabular-nums'], color: colors.coal },
  muted: { color: colors.smoke, fontSize: 14 },
  link: { color: colors.emberDeep, fontWeight: '700' },
  label: { fontWeight: '600', marginBottom: 6, color: colors.coal },
  input: {
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: radius.sm,
    backgroundColor: colors.white,
    paddingHorizontal: space.md,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.coal,
  },
  chip: {
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: colors.white,
  },
  chipOn: { borderColor: colors.ember, backgroundColor: colors.emberSoft },
  chipText: { fontWeight: '600', color: colors.coal },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: space.md,
    backgroundColor: colors.white,
  },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.smoke, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.ember },
  total: { fontWeight: '800', fontSize: 18, color: colors.coal },
  footer: { paddingHorizontal: space.md, paddingTop: space.md, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.paper },
});
