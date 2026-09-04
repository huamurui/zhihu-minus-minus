import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { View as RNView, StyleSheet } from 'react-native';
import { Text, useThemeColor } from '@/components/Themed';

/**
 * 共享的设置页 UI 原语。两个设置页（外观与定制 / 过滤与推荐）共用，
 * 避免各自的 Section/SettingItem 漂移。
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
}: {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  children: React.ReactNode;
  colorScheme: 'light' | 'dark';
}) {
  void colorScheme;
  const controlBackground = useThemeColor({}, 'controlBackground');
  const textColor = useThemeColor({}, 'text');

  return (
    <RNView style={styles.settingItem}>
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
      </RNView>
      {children}
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
});

/**
 * 多个设置页共用的 chip / 步进器布局原语（外观页已有等价的本地 styles，
 * 这里抽出来是为了让「过滤与推荐」页不必再复制一份）。
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
