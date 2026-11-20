import React, { useEffect, useMemo, useRef } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { ActionIcon, type ActionIconName } from '@/components/ActionIcon';
import { BouncyButton } from '@/components/BouncyButton';
import { CollectionStarIcon } from '@/components/CollectionStarIcon';
import { Text, useThemeColor, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { ImpactFeedbackStyle, impactAsync } from '@/utils/haptics';
import { BottomSheet, type BottomSheetHandle } from './BottomSheet';

export interface ActionSheetOption {
  key: string;
  label: string;
  icon: ActionIconName;
  iconFamily?: 'ionicons' | 'collection-star';
  iconSolid?: boolean;
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
  hapticFeedback?: boolean;
  actionContextKey?: string;
}

export function ActionSheet({
  visible,
  onClose,
  title,
  subtitle,
  options,
  headerContent,
  cancelLabel = '取消',
  hapticFeedback = true,
  actionContextKey,
}: ActionSheetProps) {
  const colorScheme = useColorScheme();
  const primaryTransparent = useThemeColor({}, 'primaryTransparent');
  const sheetRef = useRef<BottomSheetHandle>(null);
  const pendingAction = useRef<ActionSheetOption['onPress'] | null>(null);
  const actionScope = useMemo(
    () => ({ actionContextKey, visible }),
    [actionContextKey, visible],
  );
  const currentScope = useRef(actionScope);
  currentScope.current = actionScope;
  const mounted = useRef(true);

  useEffect(() => {
    if (currentScope.current !== actionScope) return;
    mounted.current = true;
    pendingAction.current = null;
    return () => {
      mounted.current = false;
      pendingAction.current = null;
    };
  }, [actionScope]);

  useEffect(() => {
    if (!visible) pendingAction.current = null;
    if (visible && hapticFeedback) {
      void impactAsync(ImpactFeedbackStyle.Medium);
    }
  }, [visible, hapticFeedback]);

  const handleClosed = () => {
    if (!mounted.current || currentScope.current !== actionScope) return;
    const action = pendingAction.current;
    pendingAction.current = null;
    onClose();
    if (action) void action();
  };

  const close = () => sheetRef.current?.close();

  const selectOption = (option: ActionSheetOption) => {
    if (!visible || option.disabled || pendingAction.current) return;
    pendingAction.current = option.onPress;
    close();
  };

  const itemBackground = Colors[colorScheme].backgroundTertiary;
  const dividerColor = Colors[colorScheme].divider;

  return (
    <BottomSheet
      key={actionContextKey}
      ref={sheetRef}
      visible={visible}
      onClose={handleClosed}
      title={title}
      subtitle={subtitle}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
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
                <BouncyButton
                  accessibilityRole="button"
                  accessibilityLabel={option.label}
                  accessibilityState={{ disabled: option.disabled }}
                  disabled={option.disabled}
                  onPress={() => selectOption(option)}
                  style={[styles.option, option.disabled && styles.disabled]}
                >
                  <View
                    style={[
                      styles.optionIcon,
                      { backgroundColor: iconBackground },
                    ]}
                  >
                    {option.iconFamily === 'collection-star' ? (
                      <CollectionStarIcon
                        size={19}
                        color={iconColor}
                        filled={option.iconSolid === true}
                      />
                    ) : (
                      <ActionIcon
                        name={option.icon}
                        size={21}
                        color={iconColor}
                      />
                    )}
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
                </BouncyButton>
                {index < options.length - 1 ? (
                  <View
                    style={[styles.divider, { backgroundColor: dividerColor }]}
                  />
                ) : null}
              </React.Fragment>
            );
          })}
        </View>

        <BouncyButton
          accessibilityRole="button"
          accessibilityLabel={cancelLabel}
          onPress={close}
          style={[styles.cancel, { backgroundColor: itemBackground }]}
        >
          <Text type="secondary" style={styles.cancelLabel}>
            {cancelLabel}
          </Text>
        </BouncyButton>
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 0,
    flexShrink: 1,
  },
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
    borderRadius: 12,
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
