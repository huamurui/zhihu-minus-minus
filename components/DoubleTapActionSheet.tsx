import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { BouncyButton } from '@/components/BouncyButton';
import { BottomSheet } from '@/components/overlays/BottomSheet';
import { Text, useThemeColor, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { useDoubleTapSetupStore } from '@/store/useDoubleTapSetupStore';
import {
  type DoubleTapAction,
  useSettingsStore,
} from '@/store/useSettingsStore';

const OPTIONS: {
  value: DoubleTapAction;
  label: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  {
    value: 'off',
    label: '关闭',
    description: '双击正文不执行任何操作',
    icon: 'close-circle-outline',
  },
  {
    value: 'like',
    label: '点赞',
    description: '双击正文点赞，已点赞不会取消',
    icon: 'heart-outline',
  },
  {
    value: 'comments',
    label: '打开评论区',
    description: '双击正文进入评论区',
    icon: 'chatbubble-outline',
  },
];

/**
 * First-use picker for the double-tap action. Saving writes the shared setting
 * so answers, articles, and pins all follow it from the next double tap.
 */
export function DoubleTapActionSheet() {
  const visible = useDoubleTapSetupStore((state) => state.visible);
  const hide = useDoubleTapSetupStore((state) => state.hide);
  const updateSettings = useSettingsStore((state) => state.updateSettings);
  const [selected, setSelected] = useState<DoubleTapAction>('off');

  // Always start from the default choice for a fresh first-use prompt.
  useEffect(() => {
    if (visible) setSelected('off');
  }, [visible]);

  const colorScheme = useColorScheme();
  const primaryColor = useThemeColor({}, 'primary');
  const onPrimary = useThemeColor({}, 'onPrimary');
  const itemBackground = Colors[colorScheme].backgroundTertiary;

  return (
    <BottomSheet
      visible={visible}
      onClose={hide}
      title="双击正文的动作"
      subtitle="之后可在设置页修改"
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.group, { backgroundColor: itemBackground }]}>
          {OPTIONS.map((option, index) => {
            const checked = selected === option.value;
            return (
              <View key={option.value}>
                <BouncyButton
                  accessibilityRole="radio"
                  accessibilityLabel={option.label}
                  accessibilityState={{ selected: checked }}
                  onPress={() => setSelected(option.value)}
                  className="flex-row items-center px-4 py-3.5 bg-transparent"
                >
                  <Ionicons
                    name={checked ? 'radio-button-on' : 'radio-button-off'}
                    size={20}
                    color={
                      checked ? primaryColor : Colors[colorScheme].textSecondary
                    }
                  />
                  <View className="flex-1 ml-3 bg-transparent">
                    <Text style={styles.optionLabel}>{option.label}</Text>
                    <Text type="secondary" style={styles.optionDescription}>
                      {option.description}
                    </Text>
                  </View>
                </BouncyButton>
                {index < OPTIONS.length - 1 && (
                  <View
                    style={[
                      styles.divider,
                      { backgroundColor: Colors[colorScheme].divider },
                    ]}
                  />
                )}
              </View>
            );
          })}
        </View>

        <BouncyButton
          accessibilityRole="button"
          accessibilityLabel="保存"
          onPress={() => {
            updateSettings({ doubleTapAction: selected });
            hide();
          }}
          style={[styles.saveButton, { backgroundColor: primaryColor }]}
        >
          <Text style={[styles.saveLabel, { color: onPrimary }]}>保存</Text>
        </BouncyButton>
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0 },
  body: { paddingHorizontal: 16, paddingBottom: 16 },
  group: { borderRadius: 12, overflow: 'hidden' },
  optionLabel: { fontSize: 16, fontWeight: '600' },
  optionDescription: { fontSize: 12, marginTop: 2 },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 47 },
  saveButton: {
    marginTop: 20,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveLabel: { fontSize: 16, fontWeight: '700' },
});
