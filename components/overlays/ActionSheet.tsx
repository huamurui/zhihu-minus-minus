import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Text, useThemeColor, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { ImpactFeedbackStyle, impactAsync } from '@/utils/haptics';
import { BottomSheet, type BottomSheetHandle } from './BottomSheet';

export interface ActionSheetOption {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => unknown;
  destructive?: boolean;
  color?: string;
  iconBackgroundColor?: string;
  disabled?: boolean;
}

interface ActionSheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  options: ActionSheetOption[];
  headerContent?: React.ReactNode;
  cancelLabel?: string;
}

export function ActionSheet({
  visible,
  onClose,
  title,
  subtitle,
  options,
  headerContent,
  cancelLabel = '取消',
}: ActionSheetProps) {
  const colorScheme = useColorScheme();
  const primaryTransparent = useThemeColor({}, 'primaryTransparent');
  const sheetRef = useRef<BottomSheetHandle>(null);
  const pendingAction = useRef<ActionSheetOption['onPress'] | null>(null);

  useEffect(() => {
    if (visible) void impactAsync(ImpactFeedbackStyle.Medium);
  }, [visible]);

  const handleClosed = () => {
    onClose();
    const action = pendingAction.current;
    pendingAction.current = null;
    if (action) void action();
  };

  const close = () => sheetRef.current?.close();

  const selectOption = (option: ActionSheetOption) => {
    if (option.disabled) return;
    pendingAction.current = option.onPress;
    close();
  };

  const itemBackground = Colors[colorScheme].backgroundTertiary;
  const dividerColor = Colors[colorScheme].divider;

  return (
    <BottomSheet
      ref={sheetRef}
      visible={visible}
      onClose={handleClosed}
      title={title}
      subtitle={subtitle}
    >
      <View style={styles.body}>
        {headerContent}
        <View style={[styles.optionGroup, { backgroundColor: itemBackground }]}>
          {options.map((option, index) => {
            const iconColor = option.destructive
              ? Colors[colorScheme].danger
              : option.color || Colors[colorScheme].text;
            const iconBackground =
              option.iconBackgroundColor ||
              (option.destructive
                ? `${Colors[colorScheme].danger}1A`
                : primaryTransparent);

            return (
              <React.Fragment key={option.key}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={option.label}
                  accessibilityState={{ disabled: option.disabled }}
                  disabled={option.disabled}
                  onPress={() => selectOption(option)}
                  android_ripple={{ color: dividerColor }}
                  style={[styles.option, option.disabled && styles.disabled]}
                >
                  <View
                    style={[
                      styles.optionIcon,
                      { backgroundColor: iconBackground },
                    ]}
                  >
                    <Ionicons name={option.icon} size={21} color={iconColor} />
                  </View>
                  <View style={styles.optionCopy}>
                    <Text
                      style={[
                        styles.optionLabel,
                        { color: Colors[colorScheme].text },
                        option.destructive && styles.destructiveLabel,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </View>
                </Pressable>
                {index < options.length - 1 ? (
                  <View
                    style={[styles.divider, { backgroundColor: dividerColor }]}
                  />
                ) : null}
              </React.Fragment>
            );
          })}
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={cancelLabel}
          onPress={close}
          android_ripple={{ color: dividerColor }}
          style={[styles.cancel, { backgroundColor: itemBackground }]}
        >
          <Text type="secondary" style={styles.cancelLabel}>
            {cancelLabel}
          </Text>
        </Pressable>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: {
    width: '100%',
    paddingHorizontal: 20,
  },
  optionGroup: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
  },
  option: {
    width: '100%',
    minHeight: 56,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  optionIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  optionLabel: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600',
  },
  destructiveLabel: {
    fontWeight: '700',
  },
  optionCopy: {
    flex: 1,
    justifyContent: 'center',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 62,
  },
  cancel: {
    width: '100%',
    minHeight: 52,
    marginTop: 12,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelLabel: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
  },
  disabled: {
    opacity: 0.45,
  },
});
