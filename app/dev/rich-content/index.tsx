import { Ionicons } from '@expo/vector-icons';
import { type Href, Stack, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, View as RNView, StyleSheet, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BouncyButton } from '@/components/BouncyButton';
import { Text, useThemeColor } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import {
  getRichContentFixtureSummaries,
  type RichContentFixtureSummary,
} from '@/features/rich-content/dev/fixtures';

function getFixtureStats(fixture: RichContentFixtureSummary): string {
  const { expected } = fixture;
  const parts = [
    expected.paragraphs != null ? `${expected.paragraphs} 段` : null,
    expected.activeImages != null ? `${expected.activeImages} 图` : null,
    expected.formulaImages != null ? `${expected.formulaImages} 公式` : null,
    expected.videoBoxes != null ? `${expected.videoBoxes} 视频` : null,
    expected.segmentInfos != null ? `${expected.segmentInfos} 段交互` : null,
  ];
  return parts.filter(Boolean).join(' · ');
}

export default function RichContentFixturesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme() ?? 'light';
  const primaryColor = useThemeColor({}, 'primary');
  const backgroundColor = useThemeColor({}, 'background');
  const surfaceColor = useThemeColor({}, 'backgroundSecondary');
  const borderColor = useThemeColor({}, 'border');
  const [query, setQuery] = useState('');

  const fixtures = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const allFixtures = getRichContentFixtureSummaries();
    if (!normalizedQuery) return allFixtures;
    return allFixtures.filter((fixture) =>
      [fixture.id, fixture.sourceType, ...fixture.traits]
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [query]);

  const openFixture = (fixture: RichContentFixtureSummary) => {
    router.push({
      pathname: '/dev/rich-content/[caseId]',
      params: { caseId: fixture.id },
    } as Href);
  };

  return (
    <RNView style={[styles.screen, { backgroundColor }]}>
      <Stack.Screen options={{ title: '富文本测试案例' }} />

      <FlatList
        data={fixtures}
        keyExtractor={(fixture) => fixture.id}
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 32,
        }}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <RNView>
            <RNView
              style={[
                styles.notice,
                { backgroundColor: `${primaryColor}12`, borderColor },
              ]}
            >
              <Ionicons name="bug-outline" size={20} color={primaryColor} />
              <RNView style={styles.noticeText}>
                <Text style={styles.noticeTitle}>仅开发构建可用</Text>
                <Text type="secondary" style={styles.noticeBody}>
                  页面读取 fixture manifest；新增并登记 case
                  后会自动出现在这里。
                </Text>
              </RNView>
            </RNView>

            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="搜索 ID、类型或 trait"
              placeholderTextColor={Colors[colorScheme].textTertiary}
              autoCapitalize="none"
              autoCorrect={false}
              clearButtonMode="while-editing"
              style={[
                styles.search,
                {
                  color: Colors[colorScheme].text,
                  backgroundColor: surfaceColor,
                  borderColor,
                },
              ]}
            />

            <Text type="secondary" style={styles.count}>
              {fixtures.length} 个稳定案例
            </Text>
          </RNView>
        }
        renderItem={({ item }) => (
          <BouncyButton
            onPress={() => openFixture(item)}
            style={[
              styles.card,
              { backgroundColor: surfaceColor, borderColor },
            ]}
          >
            <RNView style={styles.cardHeader}>
              <Text style={styles.cardTitle}>{item.id}</Text>
              <Ionicons
                name="chevron-forward"
                size={18}
                color={Colors[colorScheme].tabIconDefault}
              />
            </RNView>
            <Text type="secondary" style={styles.meta}>
              {item.sourceType} · {item.contentPath}
            </Text>
            <Text type="secondary" style={styles.meta}>
              {getFixtureStats(item)}
            </Text>
            <RNView style={styles.traits}>
              {item.traits.map((trait) => (
                <RNView
                  key={trait}
                  style={[
                    styles.trait,
                    { backgroundColor: `${primaryColor}12` },
                  ]}
                >
                  <Text style={[styles.traitText, { color: primaryColor }]}>
                    {trait}
                  </Text>
                </RNView>
              ))}
            </RNView>
          </BouncyButton>
        )}
        ItemSeparatorComponent={() => <RNView style={styles.separator} />}
        ListEmptyComponent={
          <RNView style={styles.empty}>
            <Text type="secondary">没有匹配的案例</Text>
          </RNView>
        }
      />
    </RNView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  notice: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    flexDirection: 'row',
    padding: 14,
    marginBottom: 14,
  },
  noticeText: { flex: 1, marginLeft: 10 },
  noticeTitle: { fontSize: 14, fontWeight: '700' },
  noticeBody: { fontSize: 12, lineHeight: 18, marginTop: 2 },
  search: {
    minHeight: 44,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 15,
  },
  count: { fontSize: 12, marginTop: 10, marginBottom: 8 },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    padding: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTitle: { flex: 1, fontSize: 15, fontWeight: '700', marginRight: 8 },
  meta: { fontSize: 12, lineHeight: 18, marginTop: 4 },
  traits: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  trait: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  traitText: { fontSize: 10, lineHeight: 14 },
  separator: { height: 10 },
  empty: { alignItems: 'center', paddingVertical: 48 },
});
