import type { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useMemo } from 'react';
import {
  Alert,
  View as RNView,
  ScrollView,
  StyleSheet,
  Switch,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { FeedItem } from '@/api/zhihu';
import { BouncyButton } from '@/components/BouncyButton';
import {
  Section,
  SettingItem,
  settingsChipStyles as s,
} from '@/components/SettingItem';
import { Text, useThemeColor } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { feedExposureRepository } from '@/storage/feedExposureRepository';
import { useSettingsStore } from '@/store/useSettingsStore';
import { computeFilterStats } from '@/utils/feedFilter';
import { showToast } from '@/utils/toast';

const QUALITY_LEVELS: {
  key: 'loose' | 'standard' | 'strict';
  label: string;
}[] = [
  { key: 'loose', label: '宽松' },
  { key: 'standard', label: '标准' },
  { key: 'strict', label: '严格' },
];

export default function FilterSettings() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme() ?? 'light';
  const queryClient = useQueryClient();
  const tintColor = useThemeColor({}, 'primary');
  const isDark = colorScheme === 'dark';

  const {
    enableLocalFeedFilter,
    filterMode,
    filterShowReason,
    filterBlockPaid,
    filterBlockAdPlatform,
    filterBlockZhihuSchool,
    filterBlockWeChat,
    filterBlockLabeled,
    filterBlockOrgAuthor,
    filterBlockAdvertiser,
    filterEnableQuality,
    filterQualityLevel,
    filterKeepFollowing,
    filterKeepUpvotedByFollowee,
    enableLocalFeedDedup,
    enableFeedCacheOnLaunch,
    updateSettings,
  } = useSettingsStore();

  // 实时效果条：读取已缓存的推荐流数据，本地跑一遍规则计算过滤率，
  // 不发请求。queryClient key 与 index.tsx 的 useInfiniteQuery 一致，
  // 这里用前缀匹配覆盖所有账号，filter 到 recommend tab。
  const stats = useMemo(() => {
    if (!enableLocalFeedFilter) return null;
    // react-query 的 getQueriesData 返回 unknown，这里收窄成 useInfiniteQuery
    // 的最小可见结构——只读页面里的元素数组，不假设其余字段。
    interface FeedCachePage {
      items?: unknown[];
    }
    interface FeedCacheData {
      pages?: FeedCachePage[];
    }
    const queries = queryClient.getQueriesData<FeedCacheData>({
      queryKey: ['zhihu-feed'],
    });
    const feedItems: unknown[] = [];
    for (const [key, data] of queries) {
      if (!Array.isArray(key) || key[2] !== 'recommend') continue;
      const items = data?.pages?.flatMap((p) => p.items ?? []) ?? [];
      for (const it of items) feedItems.push(it);
    }
    if (feedItems.length === 0) return null;
    return computeFilterStats(feedItems as FeedItem[], {
      blockPaid: filterBlockPaid,
      blockAdPlatform: filterBlockAdPlatform,
      blockZhihuSchool: filterBlockZhihuSchool,
      blockWeChat: filterBlockWeChat,
      blockLabeled: filterBlockLabeled,
      blockOrgAuthor: filterBlockOrgAuthor,
      blockAdvertiser: filterBlockAdvertiser,
      enableQuality: filterEnableQuality,
      qualityLevel: filterQualityLevel,
      keepFollowing: filterKeepFollowing,
      keepUpvotedByFollowee: filterKeepUpvotedByFollowee,
    });
  }, [
    enableLocalFeedFilter,
    queryClient,
    filterBlockPaid,
    filterBlockAdPlatform,
    filterBlockZhihuSchool,
    filterBlockWeChat,
    filterBlockLabeled,
    filterBlockOrgAuthor,
    filterBlockAdvertiser,
    filterEnableQuality,
    filterQualityLevel,
    filterKeepFollowing,
    filterKeepUpvotedByFollowee,
  ]);

  // 警告阈值随显示模式分档：隐藏模式 >50%、折叠模式 >70% 提示。
  // 过滤率过高会让自动补页持续触顶，推荐流频繁空白。
  const warnThreshold = filterMode === 'hide' ? 0.5 : 0.7;
  const warn = stats != null && stats.rate > warnThreshold;

  const switchProps = {
    trackColor: { true: tintColor },
  };

  return (
    <RNView
      style={[
        styles.container,
        {
          backgroundColor: isDark
            ? Colors.dark.background
            : Colors.light.controlBackground,
        },
      ]}
    >
      <Stack.Screen
        options={{ title: '过滤与推荐', headerShadowVisible: false }}
      />

      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 40,
        }}
      >
        {/* 实时效果条 */}
        {enableLocalFeedFilter && stats != null && (
          <RNView
            style={[
              styles.statsCard,
              {
                backgroundColor: Colors[colorScheme].backgroundSecondary,
                borderColor: warn ? Colors[colorScheme].warning : 'transparent',
              },
            ]}
          >
            <Text style={styles.statsTitle}>
              最近 {stats.total} 条内容将过滤 {stats.filtered} 条 ·{' '}
              {(stats.rate * 100).toFixed(0)}%
            </Text>
            <RNView
              style={[
                styles.statsBarTrack,
                { backgroundColor: Colors[colorScheme].controlBorder },
              ]}
            >
              <RNView
                style={{
                  width: `${Math.min(100, stats.rate * 100)}%`,
                  height: '100%',
                  borderRadius: 3,
                  backgroundColor: warn
                    ? Colors[colorScheme].warning
                    : tintColor,
                }}
              />
            </RNView>
            {warn && (
              <Text
                style={{
                  color: Colors[colorScheme].warning,
                  fontSize: 12,
                  marginTop: 6,
                }}
              >
                过滤率较高，推荐流可能频繁加载
              </Text>
            )}
          </RNView>
        )}

        {/* 启用总开关 */}
        <Section title="内容过滤" colorScheme={colorScheme}>
          <SettingItem
            label="启用内容过滤"
            icon="shield-checkmark-outline"
            colorScheme={colorScheme}
          >
            <Switch
              value={enableLocalFeedFilter}
              onValueChange={(val) =>
                updateSettings({ enableLocalFeedFilter: val })
              }
              {...switchProps}
            />
          </SettingItem>
        </Section>

        {enableLocalFeedFilter && (
          <>
            {/* 屏蔽推广与营销内容 */}
            <Section title="屏蔽推广与营销内容" colorScheme={colorScheme}>
              <Toggle
                label="知乎盐选付费内容"
                icon="diamond-outline"
                colorScheme={colorScheme}
                value={filterBlockPaid}
                onValueChange={(v) => updateSettings({ filterBlockPaid: v })}
                {...switchProps}
              />
              <Toggle
                label="知乎广告平台推广"
                icon="megaphone-outline"
                colorScheme={colorScheme}
                value={filterBlockAdPlatform}
                onValueChange={(v) =>
                  updateSettings({ filterBlockAdPlatform: v })
                }
                {...switchProps}
              />
              <Toggle
                label="知乎学堂课程卡片"
                icon="school-outline"
                colorScheme={colorScheme}
                value={filterBlockZhihuSchool}
                onValueChange={(v) =>
                  updateSettings({ filterBlockZhihuSchool: v })
                }
                {...switchProps}
              />
              <Toggle
                label="微信公众号引流文章"
                icon="logo-wechat"
                colorScheme={colorScheme}
                value={filterBlockWeChat}
                onValueChange={(v) => updateSettings({ filterBlockWeChat: v })}
                {...switchProps}
              />
              <Toggle
                label="带推广标记的内容"
                icon="pricetag-outline"
                colorScheme={colorScheme}
                value={filterBlockLabeled}
                onValueChange={(v) => updateSettings({ filterBlockLabeled: v })}
                {...switchProps}
              />
              <Toggle
                label="机构号发布的内容"
                icon="business-outline"
                colorScheme={colorScheme}
                value={filterBlockOrgAuthor}
                onValueChange={(v) =>
                  updateSettings({ filterBlockOrgAuthor: v })
                }
                {...switchProps}
              />
              <Toggle
                label="广告主发布的内容"
                icon="cash-outline"
                colorScheme={colorScheme}
                value={filterBlockAdvertiser}
                onValueChange={(v) =>
                  updateSettings({ filterBlockAdvertiser: v })
                }
                {...switchProps}
              />
            </Section>

            {/* 过滤低质量内容 */}
            <Section title="过滤低质量内容" colorScheme={colorScheme}>
              <Toggle
                label="启用质量过滤"
                icon="bar-chart-outline"
                colorScheme={colorScheme}
                value={filterEnableQuality}
                onValueChange={(v) =>
                  updateSettings({ filterEnableQuality: v })
                }
                {...switchProps}
              />
              <SettingItem
                label="过滤强度"
                icon="speedometer-outline"
                colorScheme={colorScheme}
              >
                <RNView style={s.row}>
                  {QUALITY_LEVELS.map((lvl, i) => (
                    <BouncyButton
                      key={lvl.key}
                      onPress={() =>
                        updateSettings({ filterQualityLevel: lvl.key })
                      }
                      style={[
                        s.tabChip,
                        {
                          backgroundColor:
                            Colors[colorScheme].backgroundTertiary,
                          marginLeft: i > 0 ? 8 : 0,
                        },
                        filterQualityLevel === lvl.key && {
                          backgroundColor: tintColor,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          s.tabChipText,
                          filterQualityLevel === lvl.key && {
                            color: Colors[colorScheme].textInverse,
                            fontWeight: 'bold',
                          },
                        ]}
                      >
                        {lvl.label}
                      </Text>
                    </BouncyButton>
                  ))}
                </RNView>
              </SettingItem>
            </Section>

            {/* 以下内容永不过滤 */}
            <Section title="以下内容永不过滤" colorScheme={colorScheme}>
              <Toggle
                label="我关注的人发布的"
                icon="heart-outline"
                colorScheme={colorScheme}
                value={filterKeepFollowing}
                onValueChange={(v) =>
                  updateSettings({ filterKeepFollowing: v })
                }
                {...switchProps}
              />
              <Toggle
                label="我关注的人赞同过的"
                icon="thumbs-up-outline"
                colorScheme={colorScheme}
                value={filterKeepUpvotedByFollowee}
                onValueChange={(v) =>
                  updateSettings({ filterKeepUpvotedByFollowee: v })
                }
                {...switchProps}
              />
            </Section>

            {/* 被过滤内容的显示方式 */}
            <Section title="被过滤内容的显示方式" colorScheme={colorScheme}>
              <SettingItem
                label="显示方式"
                icon="eye-outline"
                colorScheme={colorScheme}
              >
                <RNView style={s.row}>
                  <BouncyButton
                    onPress={() => updateSettings({ filterMode: 'collapse' })}
                    style={[
                      s.tabChip,
                      {
                        backgroundColor: Colors[colorScheme].backgroundTertiary,
                        marginRight: 8,
                      },
                      filterMode === 'collapse' && {
                        backgroundColor: tintColor,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        s.tabChipText,
                        filterMode === 'collapse' && {
                          color: Colors[colorScheme].textInverse,
                          fontWeight: 'bold',
                        },
                      ]}
                    >
                      折叠占位
                    </Text>
                  </BouncyButton>
                  <BouncyButton
                    onPress={() => updateSettings({ filterMode: 'hide' })}
                    style={[
                      s.tabChip,
                      {
                        backgroundColor: Colors[colorScheme].backgroundTertiary,
                      },
                      filterMode === 'hide' && { backgroundColor: tintColor },
                    ]}
                  >
                    <Text
                      style={[
                        s.tabChipText,
                        filterMode === 'hide' && {
                          color: Colors[colorScheme].textInverse,
                          fontWeight: 'bold',
                        },
                      ]}
                    >
                      直接隐藏
                    </Text>
                  </BouncyButton>
                </RNView>
              </SettingItem>
              {filterMode === 'collapse' && (
                <Toggle
                  label="显示过滤原因"
                  icon="information-circle-outline"
                  colorScheme={colorScheme}
                  value={filterShowReason}
                  onValueChange={(v) => updateSettings({ filterShowReason: v })}
                  {...switchProps}
                />
              )}
            </Section>
          </>
        )}

        {/* 推荐流（从「实验性功能」迁入） */}
        <Section title="推荐流" colorScheme={colorScheme}>
          <Toggle
            label="本地 Feed 去重"
            icon="layers-outline"
            colorScheme={colorScheme}
            value={enableLocalFeedDedup}
            onValueChange={(v) => updateSettings({ enableLocalFeedDedup: v })}
            {...switchProps}
          />
          <Toggle
            label="启动时保留推荐流"
            icon="bookmark-outline"
            colorScheme={colorScheme}
            value={enableFeedCacheOnLaunch}
            onValueChange={(v) =>
              updateSettings({ enableFeedCacheOnLaunch: v })
            }
            {...switchProps}
          />
          <SettingItem
            label="清除本地去重记录"
            icon="trash-bin-outline"
            colorScheme={colorScheme}
          >
            <BouncyButton
              onPress={() => {
                Alert.alert(
                  '清除本地去重记录',
                  '清除后，近期看过的推荐内容可能再次出现。',
                  [
                    { text: '取消', style: 'cancel' },
                    {
                      text: '清除',
                      style: 'destructive',
                      onPress: async () => {
                        try {
                          await feedExposureRepository.clearAll();
                          showToast('本地去重记录已清除');
                        } catch (error) {
                          console.error('清除本地去重记录失败', error);
                          showToast('清除失败，请稍后重试');
                        }
                      },
                    },
                  ],
                );
              }}
              className="px-3 py-1.5 rounded-full"
            >
              <Text style={{ color: Colors[colorScheme].danger }}>清除</Text>
            </BouncyButton>
          </SettingItem>
        </Section>
      </ScrollView>
    </RNView>
  );
}

// 内联 Toggle，避免每个开关都写一遍 SettingItem + Switch 模板
function Toggle({
  label,
  icon,
  colorScheme,
  value,
  onValueChange,
  trackColor,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  colorScheme: 'light' | 'dark';
  value: boolean;
  onValueChange: (val: boolean) => void;
  trackColor: { true: string; false?: string };
}) {
  return (
    <SettingItem label={label} icon={icon} colorScheme={colorScheme}>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={trackColor}
      />
    </SettingItem>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  statsCard: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: 1,
  },
  statsTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 10,
  },
  statsBarTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
});
