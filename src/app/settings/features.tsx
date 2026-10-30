import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, useRouter } from 'expo-router';
import { View as RNView, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BouncyButton } from '@/components/BouncyButton';
import { Section, SettingItem, SettingOptions } from '@/components/SettingItem';
import { Text, useThemeColor } from '@/components/Themed';
import { ThemedSwitch } from '@/components/ThemedSwitch';
import { useColorScheme } from '@/components/useColorScheme';
import {
  type DoubleTapAction,
  useSettingsStore,
} from '@/store/useSettingsStore';

const DOUBLE_TAP_ACTIONS: { value: DoubleTapAction; label: string }[] = [
  { value: 'off', label: '关闭' },
  { value: 'like', label: '点赞' },
  { value: 'comments', label: '评论区' },
];

export default function FeatureSettings() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme() ?? 'light';
  const canvasColor = useThemeColor({}, 'background');
  const mutedColor = useThemeColor({}, 'textSecondary');
  const {
    enableBrowseHistory,
    enableListPreload,
    enableParallelPaging,
    enablePrivateMessaging,
    doubleTapAction,
    updateSettings,
  } = useSettingsStore();

  return (
    <RNView style={[styles.container, { backgroundColor: canvasColor }]}>
      <Stack.Screen
        options={{ title: '功能开关', headerShadowVisible: false }}
      />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 40 },
        ]}
      >
        <RNView style={styles.intro}>
          <Text style={styles.introTitle}>按需要开启附加能力</Text>
          <Text type="secondary" style={styles.introBody}>
            这些功能可能改变内容渲染、增加网络请求，或在设备上保存额外记录；关闭后不会影响基础阅读。
          </Text>
        </RNView>

        <Section title="阅读与记录" colorScheme={colorScheme}>
          <SettingItem
            label="记录浏览历史"
            icon="time-outline"
            colorScheme={colorScheme}
          >
            <ThemedSwitch
              value={enableBrowseHistory}
              onValueChange={(value) =>
                updateSettings({ enableBrowseHistory: value })
              }
            />
          </SettingItem>
          <SettingItem
            label="列表预加载"
            icon="download-outline"
            colorScheme={colorScheme}
            help="提前加载下一页，会略微增加流量和耗电。"
          >
            <ThemedSwitch
              accessibilityLabel="列表预加载"
              value={enableListPreload}
              onValueChange={(value) =>
                updateSettings({ enableListPreload: value })
              }
            />
          </SettingItem>
          <SettingItem
            label="多页同时加载"
            icon="layers-outline"
            colorScheme={colorScheme}
            help="同时请求后面几页，会略微增加流量和耗电，也可能更容易触发知乎验证。"
          >
            <ThemedSwitch
              accessibilityLabel="多页同时加载"
              value={enableParallelPaging}
              onValueChange={(value) =>
                updateSettings({ enableParallelPaging: value })
              }
            />
          </SettingItem>
          <BouncyButton
            onPress={() => router.push('/settings/appearance')}
            accessibilityRole="button"
          >
            <SettingItem
              label="正文排版"
              icon="text-outline"
              colorScheme={colorScheme}
            >
              <Ionicons name="chevron-forward" size={18} color={mutedColor} />
            </SettingItem>
          </BouncyButton>
          <SettingItem
            label="双击正文"
            icon="hand-left-outline"
            colorScheme={colorScheme}
          >
            <SettingOptions
              accessibilityLabel="双击正文"
              options={DOUBLE_TAP_ACTIONS}
              value={doubleTapAction}
              onChange={(value) => updateSettings({ doubleTapAction: value })}
            />
          </SettingItem>
        </Section>

        <Section title="沟通" colorScheme={colorScheme}>
          <SettingItem
            label="启用私信功能（不建议）"
            icon="chatbubbles-outline"
            colorScheme={colorScheme}
          >
            <ThemedSwitch
              value={enablePrivateMessaging}
              onValueChange={(value) =>
                updateSettings({ enablePrivateMessaging: value })
              }
            />
          </SettingItem>
        </Section>
      </ScrollView>
    </RNView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16 },
  intro: { paddingHorizontal: 4, marginBottom: 24 },
  introTitle: { fontSize: 20, fontWeight: '700', marginBottom: 8 },
  introBody: { fontSize: 14, lineHeight: 22 },
});
