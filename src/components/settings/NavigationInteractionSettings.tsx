import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { Platform, View as RNView, StyleSheet } from 'react-native';
import { BouncyButton } from '@/components/BouncyButton';
import { Section, SettingItem, SettingOptions } from '@/components/SettingItem';
import { Text, useThemeColor } from '@/components/Themed';
import { ThemedSwitch } from '@/components/ThemedSwitch';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { type TabKey, useSettingsStore } from '@/store/useSettingsStore';

const ANDROID_FEEDBACK_OPTIONS = [
  { value: 'ripple', label: '水波纹' },
  { value: 'scale-opacity', label: '缩放' },
] as const;

export function NavigationInteractionSettings() {
  const colorScheme = useColorScheme() ?? 'light';
  const tintColor = useThemeColor({}, 'primary');
  const previewBackground = useThemeColor({}, 'primary_26');
  const {
    androidFeedbackType,
    defaultTab,
    enableHapticFeedback,
    enableLargeScreenLayout,
    enablePressFeedback,
    localCityName,
    pressOpacity,
    pressScale,
    updateSettings,
    useNativeIOSBottomTabs,
    visibleTabs,
  } = useSettingsStore();

  const tabLabels: Record<TabKey, string> = {
    following: '关注',
    recommend: '推荐',
    local: localCityName || '同城',
    hot: '热榜',
    daily: '日报',
    publish: '发布',
    profile: '我的',
  };

  const toggleTab = (tab: TabKey) => {
    if (tab === 'profile') return;
    updateSettings({
      visibleTabs: visibleTabs.includes(tab)
        ? visibleTabs.filter((item) => item !== tab)
        : [...visibleTabs, tab],
    });
  };

  return (
    <>
      <Section title="双栏布局（试验性）" colorScheme={colorScheme}>
        <SettingItem
          label="启用双栏布局"
          icon="grid-outline"
          colorScheme={colorScheme}
        >
          <ThemedSwitch
            accessibilityLabel="启用双栏布局"
            accessibilityHint="试验性功能，开启后并排显示列表与详情"
            value={enableLargeScreenLayout}
            onValueChange={(value) =>
              updateSettings({ enableLargeScreenLayout: value })
            }
          />
        </SettingItem>
        <Text type="secondary" style={styles.feedbackHint}>
          试验性功能，布局和手势仍在完善。开启后并排显示列表与详情，不限制屏幕大小或横竖屏。长按两栏之间再拖动可调整栏宽，按住时显示指示器。切换时保留返回记录。
          {Platform.OS === 'ios'
            ? ' iOS 切换布局时页面会重新加载，滚动位置等临时状态可能重置。'
            : ' 切换时保留当前页面状态。'}
        </Text>
      </Section>

      {Platform.OS === 'ios' ? (
        <Section title="界面材质" colorScheme={colorScheme}>
          <SettingItem
            label="iOS 26+ 液态玻璃"
            icon="sparkles-outline"
            colorScheme={colorScheme}
          >
            <ThemedSwitch
              accessibilityLabel="iOS 26+ 液态玻璃"
              accessibilityHint="开启后，在支持的设备上为导航栏、悬浮操作栏、返回控件及底部标签栏启用系统原生液态玻璃材质"
              value={useNativeIOSBottomTabs}
              onValueChange={(value) =>
                updateSettings({ useNativeIOSBottomTabs: value })
              }
            />
          </SettingItem>
          <Text type="secondary" style={styles.feedbackHint}>
            在 iOS 26+ 设备上启用系统原生 Liquid Glass
            液态玻璃材质与原生标签栏；关闭后使用经典自绘界面与磨砂毛玻璃。
          </Text>
        </Section>
      ) : null}

      <Section title="底部导航栏" colorScheme={colorScheme}>
        {(Object.keys(tabLabels) as TabKey[]).map((tab) => (
          <SettingItem
            key={tab}
            label={tabLabels[tab]}
            icon={tab === 'profile' ? 'person-outline' : 'albums-outline'}
            colorScheme={colorScheme}
          >
            <ThemedSwitch
              value={visibleTabs.includes(tab)}
              onValueChange={() => toggleTab(tab)}
              disabled={tab === 'profile'}
            />
          </SettingItem>
        ))}
      </Section>

      <Section title="默认启动页" colorScheme={colorScheme}>
        <RNView style={styles.chipGrid}>
          {visibleTabs.map((tab) => {
            const selected = defaultTab === tab;
            return (
              <ChoiceChip
                key={tab}
                label={tabLabels[tab]}
                selected={selected}
                colorScheme={colorScheme}
                tintColor={tintColor}
                onPress={() => updateSettings({ defaultTab: tab })}
              />
            );
          })}
        </RNView>
      </Section>

      <Section title="按压反馈" colorScheme={colorScheme}>
        <SettingItem
          label="震动反馈"
          icon="phone-portrait-outline"
          colorScheme={colorScheme}
        >
          <ThemedSwitch
            value={enableHapticFeedback}
            onValueChange={(value) =>
              updateSettings({ enableHapticFeedback: value })
            }
          />
        </SettingItem>

        <SettingItem
          label="视觉反馈"
          icon="sparkles-outline"
          colorScheme={colorScheme}
        >
          <ThemedSwitch
            accessibilityLabel="视觉反馈"
            value={enablePressFeedback}
            onValueChange={(value) =>
              updateSettings({ enablePressFeedback: value })
            }
          />
        </SettingItem>
        <Text type="secondary" style={styles.feedbackHint}>
          关闭后无水波纹、缩放和透明度变化。震动由上方开关单独控制。
        </Text>

        {enablePressFeedback && Platform.OS === 'android' ? (
          <SettingItem
            label="反馈样式"
            icon="hardware-chip-outline"
            colorScheme={colorScheme}
          >
            <SettingOptions
              accessibilityLabel="反馈样式"
              options={ANDROID_FEEDBACK_OPTIONS}
              value={androidFeedbackType}
              onChange={(value) =>
                updateSettings({ androidFeedbackType: value })
              }
            />
          </SettingItem>
        ) : null}

        {enablePressFeedback &&
        (Platform.OS !== 'android' ||
          androidFeedbackType === 'scale-opacity') ? (
          <>
            <StepperSetting
              label="按压不透明度"
              icon="contrast-outline"
              value={pressOpacity.toFixed(2)}
              colorScheme={colorScheme}
              onDecrease={() =>
                updateSettings({
                  pressOpacity: Math.max(
                    0.5,
                    Number((pressOpacity - 0.05).toFixed(2)),
                  ),
                })
              }
              onIncrease={() =>
                updateSettings({
                  pressOpacity: Math.min(
                    1,
                    Number((pressOpacity + 0.05).toFixed(2)),
                  ),
                })
              }
            />
            <StepperSetting
              label="按压缩放比例"
              icon="expand-outline"
              value={pressScale.toFixed(2)}
              colorScheme={colorScheme}
              onDecrease={() =>
                updateSettings({
                  pressScale: Math.max(
                    0.88,
                    Number((pressScale - 0.01).toFixed(2)),
                  ),
                })
              }
              onIncrease={() =>
                updateSettings({
                  pressScale: Math.min(
                    1,
                    Number((pressScale + 0.01).toFixed(2)),
                  ),
                })
              }
            />
          </>
        ) : null}

        <SettingItem
          label="实时预览"
          icon="play-circle-outline"
          colorScheme={colorScheme}
        >
          <BouncyButton
            hapticFeedback
            style={[
              styles.previewButton,
              { backgroundColor: previewBackground },
            ]}
          >
            <Text style={[styles.previewText, { color: tintColor }]}>
              按我测试
            </Text>
          </BouncyButton>
        </SettingItem>
      </Section>
    </>
  );
}

function ChoiceChip({
  colorScheme,
  label,
  onPress,
  selected,
  tintColor,
}: {
  colorScheme: 'light' | 'dark';
  label: string;
  onPress: () => void;
  selected: boolean;
  tintColor: string;
}) {
  return (
    <BouncyButton
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: selected
            ? tintColor
            : Colors[colorScheme].backgroundTertiary,
        },
      ]}
    >
      <Text
        style={[
          styles.chipText,
          selected && {
            color: Colors[colorScheme].onPrimary,
            fontWeight: '700',
          },
        ]}
      >
        {label}
      </Text>
    </BouncyButton>
  );
}

function StepperSetting({
  colorScheme,
  icon,
  label,
  onDecrease,
  onIncrease,
  value,
}: {
  colorScheme: 'light' | 'dark';
  icon: ComponentProps<typeof Ionicons>['name'];
  label: string;
  onDecrease: () => void;
  onIncrease: () => void;
  value: string;
}) {
  return (
    <SettingItem label={label} icon={icon} colorScheme={colorScheme}>
      <RNView style={styles.stepper}>
        <StepperButton
          icon="remove"
          colorScheme={colorScheme}
          onPress={onDecrease}
        />
        <Text style={styles.stepperValue}>{value}</Text>
        <StepperButton
          icon="add"
          colorScheme={colorScheme}
          onPress={onIncrease}
        />
      </RNView>
    </SettingItem>
  );
}

function StepperButton({
  colorScheme,
  icon,
  onPress,
}: {
  colorScheme: 'light' | 'dark';
  icon: 'add' | 'remove';
  onPress: () => void;
}) {
  return (
    <BouncyButton
      onPress={onPress}
      style={[
        styles.stepperButton,
        { backgroundColor: Colors[colorScheme].backgroundTertiary },
      ]}
    >
      <Ionicons name={icon} size={18} color={Colors[colorScheme].text} />
    </BouncyButton>
  );
}

const styles = StyleSheet.create({
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    padding: 16,
  },
  feedbackHint: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 12,
    lineHeight: 18,
  },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  chipText: { fontSize: 14 },
  stepper: { flexDirection: 'row', alignItems: 'center' },
  stepperButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperValue: {
    width: 50,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '700',
  },
  previewButton: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 18,
  },
  previewText: { fontSize: 13, fontWeight: '700' },
});
