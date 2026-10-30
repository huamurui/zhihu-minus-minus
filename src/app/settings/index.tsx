import Ionicons from '@expo/vector-icons/Ionicons';
import { type Href, Stack } from 'expo-router';
import type React from 'react';
import { useMemo, useState } from 'react';
import {
  Alert,
  View as RNView,
  ScrollView,
  StyleSheet,
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BouncyButton } from '@/components/BouncyButton';
import { Section } from '@/components/SettingItem';
import { Text, useThemeColor } from '@/components/Themed';
import { ThemedSwitch } from '@/components/ThemedSwitch';
import { ThemeModeSelector } from '@/components/ThemeModeSelector';
import { useColorScheme } from '@/components/useColorScheme';
import { usePaneRouter as useRouter } from '@/features/adaptive-layout/usePaneRouter';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useTelemetryStore } from '@/store/useTelemetryStore';

interface SettingsRouteRowProps {
  description: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
}

interface SearchEntry {
  description: string;
  href?: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  keywords: string;
  label: string;
  kind?: 'telemetry';
}

const SEARCH_ENTRIES: ReadonlyArray<SearchEntry> = [
  {
    label: 'App 图标',
    description: '更换主屏幕图标的配色',
    icon: 'apps-outline',
    href: '/settings/app-icon',
    keywords: 'app 图标 icon 主屏幕 桌面 颜色 换肤 个性化',
  },
  {
    label: '外观与阅读',
    description: '主题、字体、阅读、导航、启动页与按压反馈',
    icon: 'color-palette-outline',
    href: '/settings/appearance',
    keywords:
      '外观 阅读 回答详情 预览卡片 列表 阅读方式 正文 排版 原生 实验 tiqian super mini tiqian-super-mini native v2 网页 webview 主题 模式 深色 浅色 系统 颜色 字体 字号 行高 背景 对比度 表面 导航 底部 栏目 启动页 震动 触感 按压 视觉反馈 无反馈 水波纹 缩放 液态玻璃',
  },
  {
    label: '过滤与推荐',
    description: '内容过滤、去重、缓存与推荐请求参数',
    icon: 'filter-outline',
    href: '/settings/filter',
    keywords:
      '过滤 推荐 屏蔽 正则 regex 广告 营销 盐选 付费 微信 机构 低质量 去重 缓存 曝光 请求 参数',
  },
  {
    label: '功能开关',
    description: '正文排版、私信、浏览历史与列表预加载',
    icon: 'options-outline',
    href: '/settings/features',
    keywords:
      '功能 开关 正文 排版 原生 tiqian-super-mini native v2 webview 网页 渲染 私信 im 聊天 浏览 历史 记录 列表 提前 预加载 分页 加载 多页 同时 并行',
  },
  {
    label: '分享数据（App崩溃报告&匿名数据）',
    description: '控制 App 崩溃报告和匿名使用数据分享',
    icon: 'analytics-outline',
    keywords:
      '分享数据 隐私 统计 分析 analytics sentry 错误 崩溃 上报 匿名 诊断',
    kind: 'telemetry',
  },
  {
    label: '报错日志',
    description: '查看、复制或清除本机的脱敏报错记录',
    icon: 'document-text-outline',
    href: '/settings/diagnostics',
    keywords: '日志 报错 错误 闪退 崩溃 诊断 复制 反馈 log crash debug',
  },
  {
    label: '关于 知乎--',
    description: '版本、更新、反馈、项目与开源许可',
    icon: 'information-circle-outline',
    href: '/about',
    keywords:
      '关于 版本 更新 检查更新 反馈 建议 issue github 开源 许可 license',
  },
];

function SettingsRouteRow({
  description,
  icon,
  label,
  onPress,
}: SettingsRouteRowProps) {
  const primaryColor = useThemeColor({}, 'primary');
  const controlBackground = useThemeColor({}, 'controlBackground');
  const mutedColor = useThemeColor({}, 'textSecondary');

  return (
    <BouncyButton onPress={onPress} style={styles.routeRow}>
      <RNView
        style={[styles.iconWrapper, { backgroundColor: controlBackground }]}
      >
        <Ionicons name={icon} size={19} color={primaryColor} />
      </RNView>
      <RNView style={styles.routeCopy}>
        <Text style={styles.routeLabel}>{label}</Text>
        <Text type="secondary" style={styles.routeDescription}>
          {description}
        </Text>
      </RNView>
      <Ionicons name="chevron-forward" size={18} color={mutedColor} />
    </BouncyButton>
  );
}

function TelemetrySettingRow() {
  const primaryColor = useThemeColor({}, 'primary');
  const controlBackground = useThemeColor({}, 'controlBackground');
  const enabled = useTelemetryStore((state) => state.enabled);
  const setEnabled = useTelemetryStore((state) => state.setEnabled);

  return (
    <RNView style={styles.telemetryRow}>
      <RNView
        style={[styles.iconWrapper, { backgroundColor: controlBackground }]}
      >
        <Ionicons name="analytics-outline" size={19} color={primaryColor} />
      </RNView>
      <RNView style={styles.routeCopy}>
        <Text style={styles.routeLabel}>分享数据</Text>
        <Text type="secondary" style={styles.routeDescription}>
          App崩溃报告 & 匿名统计
        </Text>
      </RNView>
      <ThemedSwitch value={enabled} onValueChange={setEnabled} />
    </RNView>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme() ?? 'light';
  const canvasColor = useThemeColor({}, 'background');
  const cardColor = useThemeColor({}, 'backgroundSecondary');
  const controlBorder = useThemeColor({}, 'controlBorder');
  const dangerColor = useThemeColor({}, 'danger');
  const mutedColor = useThemeColor({}, 'textSecondary');
  const textColor = useThemeColor({}, 'text');
  const [searchQuery, setSearchQuery] = useState('');
  const resetSettings = useSettingsStore((state) => state.resetSettings);
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
  const searchResults = useMemo(() => {
    if (!normalizedQuery) return [];
    return SEARCH_ENTRIES.filter((entry) =>
      `${entry.label} ${entry.description} ${entry.keywords}`
        .toLocaleLowerCase()
        .includes(normalizedQuery),
    );
  }, [normalizedQuery]);

  const confirmReset = () => {
    Alert.alert(
      '恢复默认设置',
      '外观、导航、内容过滤和功能开关都会恢复默认值。账号与本地内容不会被删除。',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '恢复默认',
          style: 'destructive',
          onPress: resetSettings,
        },
      ],
    );
  };

  return (
    <RNView style={[styles.container, { backgroundColor: canvasColor }]}>
      <Stack.Screen options={{ title: '设置', headerShadowVisible: false }} />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 40 },
        ]}
      >
        <RNView
          style={[
            styles.searchBox,
            { backgroundColor: cardColor, borderColor: controlBorder },
          ]}
        >
          <Ionicons name="search-outline" size={19} color={mutedColor} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="搜索设置"
            placeholderTextColor={mutedColor}
            style={[styles.searchInput, { color: textColor }]}
            returnKeyType="search"
            autoCorrect={false}
          />
          {searchQuery ? (
            <BouncyButton
              accessibilityLabel="清除搜索"
              onPress={() => setSearchQuery('')}
              style={styles.clearButton}
            >
              <Ionicons name="close-circle" size={19} color={mutedColor} />
            </BouncyButton>
          ) : null}
        </RNView>

        {normalizedQuery ? (
          searchResults.length > 0 ? (
            <Section
              title={`搜索结果 · ${searchResults.length}`}
              colorScheme={colorScheme}
            >
              {searchResults.map((entry) => {
                if (entry.kind === 'telemetry') {
                  return <TelemetrySettingRow key={entry.label} />;
                }
                if (!entry.href) return null;
                return (
                  <SettingsRouteRow
                    key={entry.href}
                    icon={entry.icon}
                    label={entry.label}
                    description={entry.description}
                    onPress={() => router.push(entry.href as Href)}
                  />
                );
              })}
            </Section>
          ) : (
            <RNView
              style={[styles.emptySearch, { backgroundColor: cardColor }]}
            >
              <Ionicons name="search-outline" size={28} color={mutedColor} />
              <Text style={styles.emptyTitle}>没有找到相关设置</Text>
              <Text type="secondary" style={styles.emptyDescription}>
                试试“主题”“图标”“过滤”或“历史”
              </Text>
            </RNView>
          )
        ) : (
          <>
            <Section title="显示模式" colorScheme={colorScheme}>
              <ThemeModeSelector />
            </Section>

            <Section title="个性化" colorScheme={colorScheme}>
              <SettingsRouteRow
                icon="color-palette-outline"
                label="外观与阅读"
                description="主题、字体、阅读、导航与按压反馈"
                onPress={() => router.push('/settings/appearance')}
              />
            </Section>

            <Section title="内容与功能" colorScheme={colorScheme}>
              <SettingsRouteRow
                icon="filter-outline"
                label="过滤与推荐"
                description="内容过滤、去重、缓存与请求参数"
                onPress={() => router.push('/settings/filter')}
              />
              <SettingsRouteRow
                icon="options-outline"
                label="功能开关"
                description="WebView、私信、浏览历史与预加载"
                onPress={() => router.push('/settings/features' as Href)}
              />
            </Section>

            <Section title="分享数据" colorScheme={colorScheme}>
              <TelemetrySettingRow />
            </Section>

            <Section title="关于与支持" colorScheme={colorScheme}>
              <SettingsRouteRow
                icon="document-text-outline"
                label="报错日志"
                description="查看、复制或清除本机的脱敏报错记录"
                onPress={() => router.push('/settings/diagnostics' as Href)}
              />
              <SettingsRouteRow
                icon="information-circle-outline"
                label="关于 知乎--"
                description="版本、更新、反馈与开源信息"
                onPress={() => router.push('/about' as Href)}
              />
            </Section>

            <BouncyButton
              onPress={confirmReset}
              style={[styles.resetButton, { borderColor: `${dangerColor}40` }]}
            >
              <Ionicons name="refresh-outline" size={18} color={dangerColor} />
              <Text style={[styles.resetText, { color: dangerColor }]}>
                恢复默认设置
              </Text>
            </BouncyButton>
          </>
        )}
      </ScrollView>
    </RNView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16 },
  searchBox: {
    height: 48,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    marginBottom: 24,
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchInput: { flex: 1, height: 48, fontSize: 15, marginLeft: 10 },
  clearButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeRow: {
    minHeight: 70,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  telemetryRow: {
    minHeight: 70,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconWrapper: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeCopy: { flex: 1, marginHorizontal: 12 },
  routeLabel: { fontSize: 16, fontWeight: '600' },
  routeDescription: { fontSize: 12, lineHeight: 18, marginTop: 2 },
  emptySearch: {
    paddingVertical: 36,
    paddingHorizontal: 20,
    borderRadius: 14,
    alignItems: 'center',
  },
  emptyTitle: { fontSize: 16, fontWeight: '600', marginTop: 12 },
  emptyDescription: { fontSize: 13, marginTop: 5 },
  resetButton: {
    minHeight: 50,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetText: { fontSize: 15, fontWeight: '600' },
});
