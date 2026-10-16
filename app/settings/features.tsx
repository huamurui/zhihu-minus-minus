import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, useRouter } from 'expo-router';
import { View as RNView, ScrollView, StyleSheet, Switch } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BouncyButton } from '@/components/BouncyButton';
import {
  Section,
  SettingItem,
  settingsChipStyles as s,
} from '@/components/SettingItem';
import { Text, useThemeColor } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import {
  type DoubleTapAction,
  useSettingsStore,
} from '@/store/useSettingsStore';

const DOUBLE_TAP_ACTIONS: { key: DoubleTapAction; label: string }[] = [
  { key: 'off', label: '关闭' },
  { key: 'like', label: '点赞' },
  { key: 'comments', label: '评论区' },
];

export default function FeatureSettings() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme() ?? 'light';
  const canvasColor = useThemeColor({}, 'background');
  const tintColor = useThemeColor({}, 'primary');
  const mutedColor = useThemeColor({}, 'textSecondary');
  const {
    enableBrowseHistory,
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
            <Switch
              value={enableBrowseHistory}
              onValueChange={(value) =>
                updateSettings({ enableBrowseHistory: value })
              }
              trackColor={{ true: tintColor }}
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
            <RNView style={s.row}>
              {DOUBLE_TAP_ACTIONS.map((option, index) => (
                <BouncyButton
                  key={option.key}
                  accessibilityRole="button"
                  accessibilityLabel={`双击正文：${option.label}`}
                  onPress={() =>
                    updateSettings({ doubleTapAction: option.key })
                  }
                  style={[
                    s.tabChip,
                    {
                      backgroundColor: Colors[colorScheme].backgroundTertiary,
                      marginLeft: index > 0 ? 8 : 0,
                    },
                    doubleTapAction === option.key && {
                      backgroundColor: tintColor,
                    },
                  ]}
                >
                  <Text
                    style={[
                      s.tabChipText,
                      doubleTapAction === option.key && {
                        color: Colors[colorScheme].onPrimary,
                        fontWeight: 'bold',
                      },
                    ]}
                  >
                    {option.label}
                  </Text>
                </BouncyButton>
              ))}
            </RNView>
          </SettingItem>
        </Section>

        <Section title="沟通" colorScheme={colorScheme}>
          <SettingItem
            label="启用私信功能（不建议）"
            icon="chatbubbles-outline"
            colorScheme={colorScheme}
          >
            <Switch
              value={enablePrivateMessaging}
              onValueChange={(value) =>
                updateSettings({ enablePrivateMessaging: value })
              }
              trackColor={{ true: tintColor }}
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
