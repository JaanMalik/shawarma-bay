import { useRouter } from 'expo-router';
import { useMemo, useRef } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatMoney, hoursLabel, isOpen, restaurant, type MenuItem } from '@shawarma-bay/core';

import { Button, Display, ErrorNote, tap } from '@/components/ui';
import { colors, radius, space } from '@/constants/theme';
import { useStore } from '@/lib/store';

export default function MenuScreen() {
  const { menu, config, loadError, reload, count, subtotal } = useStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const list = useRef<SectionList<MenuItem>>(null);

  const sections = useMemo(
    () =>
      (menu?.categories ?? []).map((c) => ({
        title: c.name,
        data: c.itemIds.map((id) => menu!.items[id]).filter(Boolean),
      })),
    [menu],
  );

  if (!menu) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: colors.coal }]}>
        {loadError ? (
          <View style={{ gap: space.md, padding: space.lg }}>
            <ErrorNote message={loadError} />
            <Button title="Try again" onPress={reload} />
          </View>
        ) : (
          <ActivityIndicator color={colors.ember} size="large" />
        )}
      </SafeAreaView>
    );
  }

  const now = new Date();
  const hours = config?.hours ?? restaurant.hours;
  const open = isOpen(now, hours);

  return (
    <View style={{ flex: 1, backgroundColor: colors.paper }}>
      <SectionList
        ref={list}
        sections={sections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ paddingBottom: 120 + insets.bottom }}
        ListHeaderComponent={
          <View>
            <View style={[styles.hero, { paddingTop: insets.top + space.lg }]}>
              <View style={styles.heroCircle} />
              <View style={styles.status}>
                <View style={[styles.dot, { backgroundColor: open ? '#4cc26b' : '#e0614f' }]} />
                <Text style={styles.statusText}>
                  {open ? 'Open now' : 'Closed now'} · {hoursLabel(now, hours)}
                </Text>
              </View>
              <Display style={styles.title}>Shawarma Bay</Display>
              <Display style={[styles.title, { color: colors.ember }]}>Deer Park</Display>
              <Text style={styles.tagline}>{restaurant.tagline}. Order ahead for pickup.</Text>
              <Pressable onPress={() => Linking.openURL(restaurant.phoneHref)} accessibilityRole="link">
                <Text style={styles.phone}>
                  {restaurant.address.line1} · {restaurant.phone}
                </Text>
              </Pressable>
              {config?.demo && <Text style={styles.demo}>Demo mode: orders aren&apos;t sent to Clover yet.</Text>}
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chips}
            >
              {sections.map((s, i) => (
                <Pressable
                  key={s.title}
                  onPress={() => {
                    tap();
                    list.current?.scrollToLocation({ sectionIndex: i, itemIndex: 0, viewOffset: 48 });
                  }}
                  style={styles.chip}
                >
                  <Text style={styles.chipText}>{s.title}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        }
        renderSectionHeader={({ section }) => <Display style={styles.sectionTitle}>{section.title}</Display>}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${item.name}, ${formatMoney(item.price)}`}
            disabled={!item.available}
            onPress={() => {
              tap();
              router.push({ pathname: '/item/[id]', params: { id: item.id } });
            }}
            style={({ pressed }) => [styles.item, pressed && { borderColor: colors.ember }, !item.available && { opacity: 0.5 }]}
          >
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={styles.itemName}>{item.name}</Text>
              {item.tags?.length ? (
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {item.tags.map((t) => (
                    <Text key={t} style={styles.tag}>
                      {t.toUpperCase()}
                    </Text>
                  ))}
                </View>
              ) : null}
              {item.description ? <Text style={styles.itemDesc}>{item.description}</Text> : null}
              <Text style={styles.itemPrice}>{item.available ? formatMoney(item.price) : 'Sold out'}</Text>
            </View>
            <View style={styles.plus}>
              <Text style={styles.plusText}>+</Text>
            </View>
          </Pressable>
        )}
      />

      {count > 0 && (
        <View style={[styles.cartBar, { paddingBottom: insets.bottom + space.sm }]}>
          <Button
            title="View order"
            onPress={() => router.push('/cart')}
            left={
              <View style={styles.cartCount}>
                <Text style={styles.cartCountText}>{count}</Text>
              </View>
            }
            right={<Text style={styles.cartTotal}>{formatMoney(subtotal)}</Text>}
            style={{ justifyContent: 'space-between' }}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  hero: {
    backgroundColor: colors.coal,
    paddingHorizontal: space.lg,
    paddingBottom: space.xl,
    overflow: 'hidden',
  },
  heroCircle: {
    position: 'absolute',
    right: -80,
    top: -80,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: colors.ember,
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: space.md,
  },
  dot: { width: 9, height: 9, borderRadius: 5 },
  statusText: { color: colors.white, fontWeight: '600', fontSize: 13 },
  title: { color: colors.white, fontSize: 52, lineHeight: 54 },
  tagline: { color: 'rgba(255,255,255,0.8)', fontSize: 16, marginTop: space.md, lineHeight: 22 },
  phone: { color: colors.ember, fontWeight: '700', marginTop: space.sm },
  demo: {
    marginTop: space.md,
    color: colors.white,
    backgroundColor: colors.emberDeep,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    fontSize: 12,
    fontWeight: '700',
    overflow: 'hidden',
  },
  chips: { gap: space.sm, paddingHorizontal: space.md, paddingVertical: space.md },
  chip: {
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.white,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipText: { fontWeight: '600', color: colors.coal },
  sectionTitle: { fontSize: 32, marginTop: space.lg, marginBottom: space.sm, marginHorizontal: space.md },
  item: {
    flexDirection: 'row',
    gap: space.md,
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: space.md,
    marginHorizontal: space.md,
    marginBottom: space.sm,
  },
  itemName: { fontSize: 17, fontWeight: '700', color: colors.coal },
  itemDesc: { color: colors.smoke, fontSize: 14 },
  itemPrice: { fontWeight: '600', color: colors.coal, marginTop: 2 },
  tag: {
    alignSelf: 'flex-start',
    backgroundColor: colors.emberSoft,
    color: colors.emberDeep,
    fontSize: 11,
    fontWeight: '800',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  plus: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.ember,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plusText: { color: colors.white, fontSize: 22, fontWeight: '700', marginTop: -2 },
  cartBar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: space.md, paddingTop: space.sm },
  cartCount: { backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 2 },
  cartCountText: { color: colors.white, fontWeight: '700' },
  cartTotal: { color: colors.white, fontWeight: '700', fontSize: 17 },
});
