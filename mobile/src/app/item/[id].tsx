import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CartError, formatMoney, priceCart } from '@shawarma-bay/core';

import { Button, Display, ErrorNote, QuantityStepper, tap } from '@/components/ui';
import { colors, radius, space } from '@/constants/theme';
import { useStore } from '@/lib/store';

export default function ItemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { menu, add } = useStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [chosen, setChosen] = useState<string[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const item = menu?.items[id];
  if (!menu || !item) {
    return (
      <View style={{ padding: space.lg }}>
        <ErrorNote message="This item is no longer on the menu." />
      </View>
    );
  }

  const groups = item.modifierGroupIds.map((g) => menu.modifierGroups[g]).filter(Boolean);
  const unit =
    item.price + groups.flatMap((g) => g.modifiers).filter((m) => chosen.includes(m.id)).reduce((s, m) => s + m.price, 0);

  function toggle(groupId: string, modifierId: string) {
    const group = menu!.modifierGroups[groupId];
    tap();
    setError(null);
    setChosen((prev) => {
      const inGroup = group.modifiers.map((m) => m.id);
      if (prev.includes(modifierId)) return prev.filter((x) => x !== modifierId);
      if (group.max === 1) return [...prev.filter((x) => !inGroup.includes(x)), modifierId];
      if (group.max !== null && prev.filter((x) => inGroup.includes(x)).length >= group.max) return prev;
      return [...prev, modifierId];
    });
  }

  function addToOrder() {
    const line = { itemId: item!.id, quantity, modifierIds: chosen, note: note.trim() || undefined };
    try {
      priceCart(menu!, [line]);
    } catch (e) {
      setError(e instanceof CartError ? e.message : 'Something is off with this item.');
      return;
    }
    add(line);
    router.back();
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Display style={styles.name}>{item.name}</Display>
        {item.description ? <Text style={styles.desc}>{item.description}</Text> : null}
        <Text style={styles.price}>{formatMoney(item.price)}</Text>

        {groups.map((group) => {
          const picked = group.modifiers.filter((m) => chosen.includes(m.id)).length;
          const rule =
            group.min > 0 && group.min === group.max
              ? `Choose ${group.min}`
              : group.min > 0
                ? `Choose at least ${group.min}`
                : 'Optional';
          return (
            <View key={group.id} style={{ marginTop: space.lg }}>
              <View style={styles.groupHeader}>
                <Text style={styles.groupName}>{group.name}</Text>
                <Text style={[styles.rule, picked < group.min && { color: colors.emberDeep, fontWeight: '700' }]}>{rule}</Text>
              </View>
              {group.modifiers.map((m) => {
                const on = chosen.includes(m.id);
                return (
                  <Pressable
                    key={m.id}
                    accessibilityRole={group.max === 1 ? 'radio' : 'checkbox'}
                    accessibilityState={{ checked: on, disabled: !m.available }}
                    disabled={!m.available}
                    onPress={() => toggle(group.id, m.id)}
                    style={[styles.option, on && styles.optionOn, !m.available && { opacity: 0.45 }]}
                  >
                    <View style={[styles.check, group.max === 1 && { borderRadius: 10 }, on && styles.checkOn]}>
                      {on ? <Text style={styles.checkMark}>✓</Text> : null}
                    </View>
                    <Text style={styles.optionText}>{m.name}</Text>
                    {m.price > 0 ? <Text style={styles.optionPrice}>+{formatMoney(m.price)}</Text> : null}
                  </Pressable>
                );
              })}
            </View>
          );
        })}

        <Text style={[styles.groupName, { marginTop: space.lg }]}>Special instructions</Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="E.g. no onions, extra sauce"
          placeholderTextColor={colors.smoke}
          maxLength={140}
          multiline
          style={styles.input}
        />
        {error ? (
          <View style={{ marginTop: space.md }}>
            <ErrorNote message={error} />
          </View>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
        <QuantityStepper value={quantity} onChange={setQuantity} min={1} label={item.name} />
        <Button
          title={`Add · ${formatMoney(unit * quantity)}`}
          onPress={addToOrder}
          disabled={!item.available}
          style={{ flex: 1 }}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.lg, paddingBottom: space.xl },
  name: { fontSize: 36, lineHeight: 38 },
  desc: { color: colors.smoke, fontSize: 16, marginTop: space.sm },
  price: { fontWeight: '700', fontSize: 17, marginTop: space.sm, color: colors.coal },
  groupHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: space.sm },
  groupName: { fontWeight: '700', fontSize: 17, color: colors.coal },
  rule: { color: colors.smoke },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: 14,
    marginBottom: space.sm,
  },
  optionOn: { borderColor: colors.ember, backgroundColor: colors.emberSoft },
  check: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.smoke,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: colors.ember, borderColor: colors.ember },
  checkMark: { color: colors.white, fontSize: 13, fontWeight: '800' },
  optionText: { flex: 1, fontSize: 16, color: colors.coal },
  optionPrice: { color: colors.smoke },
  input: {
    marginTop: space.sm,
    minHeight: 70,
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: radius.sm,
    backgroundColor: colors.white,
    padding: space.md,
    fontSize: 16,
    textAlignVertical: 'top',
    color: colors.coal,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.paper,
  },
});
