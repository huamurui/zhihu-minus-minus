import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useState } from 'react';
import { Pressable, View as RNView, StyleSheet } from 'react-native';
import { BouncyButton } from '@/components/BouncyButton';
import { Text, useThemeColor } from '@/components/Themed';

/**
 * 共享的设置页 UI 原语，避免各设置页的 Section/SettingItem 漂移。
 */
export function Section({
  title,
  children,
  colorScheme,
}: {
  title: string;
  children: React.ReactNode;
  colorScheme: 'light' | 'dark';
}) {
  void colorScheme;
  const cardBg = useThemeColor({}, 'backgroundSecondary');
  const dividerColor = useThemeColor({}, 'controlBorder');

  // Section 内子元素由调用处逐个写死，数量与顺序在编译期就已固定。
  const childArray = React.Children.toArray(children).filter(Boolean);

  return (
    <RNView style={styles.section}>
      <Text style={styles.sectionTitle} type="secondary">
        {title}
      </Text>
      <RNView style={[styles.sectionContent, { backgroundColor: cardBg }]}>
        {childArray.map((child, index) => {
          const isLast = index === childArray.length - 1;
          return (
            <RNView
              // biome-ignore lint/suspicious/noArrayIndexKey: childArray 来自 React.Children,子元素在调用处的 JSX 里逐个写死,数量与顺序在编译期就固定了。
              key={index}
            >
              {child}
              {!isLast && (
                <RNView
                  style={[styles.divider, { backgroundColor: dividerColor }]}
                />
              )}
            </RNView>
          );
        })}
      </RNView>
    </RNView>
  );
}

export function SettingItem({
  label,
  icon,
  children,
  colorScheme,
  stacked = false,
  help,
}: {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  children: React.ReactNode;
  colorScheme: 'light' | 'dark';
  /** 控件放到标签下方整行，用于放不下一行的选项组。 */
  stacked?: boolean;
  /** 标签旁显示问号，点按在行下方展开这句说明。 */
  help?: string;
}) {
  void colorScheme;
  const controlBackground = useThemeColor({}, 'controlBackground');
  const textColor = useThemeColor({}, 'text');
  const mutedColor = useThemeColor({}, 'textTertiary');
  const [helpVisible, setHelpVisible] = useState(false);

  const row = (
    <RNView style={[styles.settingItem, stacked && styles.stackedItem]}>
      <RNView style={styles.settingLabelContainer}>
        {icon && (
          <RNView
            style={[
              styles.iconWrapper,
              {
                backgroundColor: controlBackground,
              },
            ]}
          >
            <Ionicons name={icon} size={16} color={textColor} />
          </RNView>
        )}
        <Text style={styles.settingLabel}>{label}</Text>
        {help && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${label}说明`}
            accessibilityState={{ expanded: helpVisible }}
            hitSlop={10}
            onPress={() => setHelpVisible((visible) => !visible)}
            style={styles.helpButton}
          >
            <Ionicons name="help-circle-outline" size={17} color={mutedColor} />
          </Pressable>
        )}
      </RNView>
      {children}
    </RNView>
  );

  if (!help) return row;
  return (
    <RNView>
      {row}
      {helpVisible && (
        <Pressable
          accessibilityRole="text"
          onPress={() => setHelpVisible(false)}
          style={[styles.helpBubble, { backgroundColor: controlBackground }]}
        >
          <Text type="secondary" style={styles.helpText}>
            {help}
          </Text>
        </Pressable>
      )}
    </RNView>
  );
}

/**
 * 设置页的单选分段控件：灰色轨道里一排等宽选项，选中项用主题色浅底高亮。
 */
export function SettingOptions<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
  fill = false,
}: {
  options: ReadonlyArray<{ value: T; label: string }>;
  /** Undefined leaves every option unselected. */
  value: T | undefined;
  onChange: (value: T) => void;
  accessibilityLabel: string;
  /** 撑满整行、选项等宽；配合 `SettingItem stacked` 使用。 */
  fill?: boolean;
}) {
  const trackColor = useThemeColor({}, 'controlBackground');
  const borderColor = useThemeColor({}, 'controlBorder');
  const selectedColor = useThemeColor({}, 'primary_26');
  const primaryColor = useThemeColor({}, 'primary');
  const mutedColor = useThemeColor({}, 'textSecondary');

  return (
    <RNView
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.optionsTrack,
        fill && styles.filledTrack,
        { backgroundColor: trackColor, borderColor },
      ]}
    >
      {options.map((option) => {
        const isSelected = option.value === value;
        return (
          <BouncyButton
            key={option.value}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityState={{ checked: isSelected }}
            onPress={() => {
              if (!isSelected) onChange(option.value);
            }}
            style={[
              styles.option,
              fill && styles.filledOption,
              isSelected && { backgroundColor: selectedColor },
            ]}
          >
            <Text
              numberOfLines={1}
              style={[
                styles.optionLabel,
                { color: isSelected ? primaryColor : mutedColor },
                isSelected && styles.selectedOptionLabel,
              ]}
            >
              {option.label}
            </Text>
          </BouncyButton>
        );
      })}
    </RNView>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 28 },
  sectionTitle: {
    fontSize: 13,
    marginBottom: 8,
    marginLeft: 16,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionContent: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 48, // 避开 Icon 区域的分割线
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    minHeight: 52,
  },
  stackedItem: {
    flexDirection: 'column',
    alignItems: 'stretch',
    justifyContent: 'flex-start',
    gap: 12,
  },
  settingLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconWrapper: {
    width: 28,
    height: 28,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingLabel: { fontSize: 16 },
  helpButton: { marginLeft: -6 },
  helpBubble: {
    marginHorizontal: 16,
    marginTop: -6,
    marginBottom: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  helpText: { fontSize: 13, lineHeight: 19 },
  optionsTrack: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    padding: 3,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  filledTrack: { alignSelf: 'stretch' },
  option: {
    minWidth: 56,
    minHeight: 32,
    paddingHorizontal: 12,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filledOption: { flexGrow: 1, flexBasis: 0, minWidth: 0 },
  optionLabel: { fontSize: 13 },
  selectedOptionLabel: { fontWeight: '700' },
});

/**
 * 多个设置页共用的 chip / 步进器布局原语。
 */
export const settingsChipStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  smallBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  valueText: {
    width: 48,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: 'bold',
  },
  tabGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    padding: 16,
  },
  tabChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  tabChipText: { fontSize: 14 },
});
