import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { View as RNView, ScrollView, StyleSheet, Switch } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BouncyButton } from '@/components/BouncyButton';
import { Text, useThemeColor } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { ZhihuContent } from '@/features/rich-content';
import { getRichContentDevFixture } from '@/features/rich-content/dev/fixtures';
import { useSettingsStore } from '@/store/useSettingsStore';

export default function RichContentFixtureDetailScreen() {
  const params = useLocalSearchParams<{ caseId?: string | string[] }>();
  const caseId = Array.isArray(params.caseId)
    ? params.caseId[0]
    : params.caseId;
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme() ?? 'light';
  const primaryColor = useThemeColor({}, 'primary');
  const backgroundColor = useThemeColor({}, 'background');
  const surfaceColor = useThemeColor({}, 'backgroundSecondary');
  const borderColor = useThemeColor({}, 'border');
  const { useWebView, updateSettings } = useSettingsStore();
  const scrollViewRef = useRef<ScrollView>(null);
  const [mountIndex, setMountIndex] = useState(0);
  const [interactionsEnabled, setInteractionsEnabled] = useState(false);

  const fixture = useMemo(
    () => (caseId ? getRichContentDevFixture(caseId) : null),
    [caseId],
  );

  useEffect(() => {
    if (!caseId) return;
    setInteractionsEnabled(false);
    setMountIndex(0);
    scrollViewRef.current?.scrollTo({ y: 0, animated: false });
  }, [caseId]);

  if (!fixture) {
    return (
      <RNView style={[styles.centered, { backgroundColor }]}>
        <Stack.Screen options={{ title: '案例不存在' }} />
        <Ionicons
          name="document-outline"
          size={40}
          color={Colors[colorScheme].textTertiary}
        />
        <Text type="secondary" style={styles.missingText}>
          manifest 中没有找到 {caseId || '这个案例'}。
        </Text>
      </RNView>
    );
  }

  const usesStructuredPinContent = Boolean(fixture.contentArray);
  const rendererLabel = usesStructuredPinContent
    ? 'Pin 结构化内容'
    : useWebView
      ? 'WebView / DOM'
      : 'RNRH';

  return (
    <RNView style={[styles.screen, { backgroundColor }]}>
      <Stack.Screen options={{ title: '案例详情' }} />
      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={{ paddingBottom: insets.bottom + 36 }}
      >
        <RNView style={styles.header}>
          <Text style={styles.fixtureId}>{fixture.id}</Text>
          {fixture.title ? (
            <Text style={styles.title}>{fixture.title}</Text>
          ) : null}
          <Text type="secondary" style={styles.meta}>
            {fixture.sourceType} · {fixture.contentPath}
          </Text>
          <Text type="secondary" style={styles.meta}>
            {fixture.segmentInfos?.length ?? 0} 条 segment_infos
          </Text>
          <Text type="secondary" style={styles.meta}>
            {fixture.traits.join(' · ')}
          </Text>

          <RNView
            style={[
              styles.toolbar,
              { backgroundColor: surfaceColor, borderColor },
            ]}
          >
            <RNView style={styles.rendererControl}>
              <Text type="secondary" style={styles.toolbarLabel}>
                渲染器
              </Text>
              <RNView style={styles.rendererButtons}>
                <BouncyButton
                  onPress={() => updateSettings({ useWebView: false })}
                  disabled={usesStructuredPinContent}
                  style={[
                    styles.rendererButton,
                    !useWebView && !usesStructuredPinContent
                      ? { backgroundColor: primaryColor }
                      : { borderColor },
                  ]}
                >
                  <Text
                    style={[
                      styles.rendererButtonText,
                      !useWebView && !usesStructuredPinContent
                        ? { color: Colors[colorScheme].textInverse }
                        : undefined,
                    ]}
                  >
                    RNRH
                  </Text>
                </BouncyButton>
                <BouncyButton
                  onPress={() => updateSettings({ useWebView: true })}
                  disabled={usesStructuredPinContent}
                  style={[
                    styles.rendererButton,
                    useWebView && !usesStructuredPinContent
                      ? { backgroundColor: primaryColor }
                      : { borderColor },
                  ]}
                >
                  <Text
                    style={[
                      styles.rendererButtonText,
                      useWebView && !usesStructuredPinContent
                        ? { color: Colors[colorScheme].textInverse }
                        : undefined,
                    ]}
                  >
                    WebView
                  </Text>
                </BouncyButton>
              </RNView>
            </RNView>
            <BouncyButton
              onPress={() => setMountIndex((value) => value + 1)}
              style={[styles.remountButton, { borderColor }]}
            >
              <Ionicons name="refresh" size={15} color={primaryColor} />
              <Text style={[styles.remountText, { color: primaryColor }]}>
                重新挂载
              </Text>
            </BouncyButton>
          </RNView>
          <Text type="secondary" style={styles.rendererHint}>
            当前：{rendererLabel}。切换项与“外观与定制”中的实验设置共用。
          </Text>

          <RNView
            style={[
              styles.interactionRow,
              { backgroundColor: surfaceColor, borderColor },
            ]}
          >
            <RNView style={styles.interactionText}>
              <Text style={styles.interactionTitle}>正文交互</Text>
              <Text
                type="secondary"
                style={[
                  styles.interactionHint,
                  interactionsEnabled
                    ? { color: Colors[colorScheme].warning }
                    : undefined,
                ]}
              >
                {interactionsEnabled
                  ? '已打开；段落操作可能使用 fixture 中的真实对象 ID 发起请求。'
                  : '默认关闭，打开后可测试图片、链接、选择与段落操作。'}
              </Text>
            </RNView>
            <Switch
              value={interactionsEnabled}
              onValueChange={setInteractionsEnabled}
              trackColor={{ true: primaryColor }}
            />
          </RNView>
        </RNView>

        <RNView
          pointerEvents={interactionsEnabled ? 'auto' : 'none'}
          style={styles.content}
        >
          <ZhihuContent
            key={`${fixture.id}:${rendererLabel}:${mountIndex}`}
            content={fixture.content}
            contentArray={fixture.contentArray}
            segmentInfos={fixture.segmentInfos}
            linkCardInfo={fixture.linkCardInfo}
            objectId={fixture.objectId}
            type={fixture.rendererType}
          />
        </RNView>
      </ScrollView>
    </RNView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  missingText: { fontSize: 14, marginTop: 12, textAlign: 'center' },
  header: { paddingHorizontal: 16, paddingTop: 16 },
  fixtureId: { fontSize: 13, fontWeight: '700', marginBottom: 6 },
  title: { fontSize: 18, lineHeight: 26, fontWeight: '700', marginBottom: 6 },
  meta: { fontSize: 12, lineHeight: 18 },
  toolbar: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    padding: 12,
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
  },
  rendererControl: { flex: 1 },
  toolbarLabel: { fontSize: 11, marginBottom: 7 },
  rendererButtons: { flexDirection: 'row', gap: 8 },
  rendererButton: {
    minWidth: 74,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    alignItems: 'center',
  },
  rendererButtonText: { fontSize: 12, fontWeight: '600' },
  remountButton: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
  },
  remountText: { fontSize: 12, fontWeight: '600', marginLeft: 4 },
  rendererHint: { fontSize: 11, lineHeight: 17, marginTop: 7 },
  interactionRow: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    padding: 12,
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  interactionText: { flex: 1, marginRight: 12 },
  interactionTitle: { fontSize: 13, fontWeight: '700' },
  interactionHint: { fontSize: 11, lineHeight: 17, marginTop: 2 },
  content: { paddingHorizontal: 16, paddingTop: 18 },
});
