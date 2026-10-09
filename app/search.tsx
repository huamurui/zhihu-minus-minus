import Ionicons from '@expo/vector-icons/Ionicons';
import { FlashList } from '@shopify/flash-list';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getSearchSuggest, searchContent } from '@/api/zhihu';
import type { FeedItem } from '@/api/zhihu/feed';
import { BouncyButton } from '@/components/BouncyButton';
import { FeedCard } from '@/components/FeedCard';
import { BottomSheet } from '@/components/overlays/BottomSheet';
import { QueryErrorView } from '@/components/QueryErrorView';
import { Text, useThemeColor, View } from '@/components/Themed';
import type { UserCardMember } from '@/components/UserCard';
import { UserCard } from '@/components/UserCard';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { getZhihuNextOffset } from '@/hooks/useZhihuInfiniteQuery';
import { useSearchStore } from '@/store/useSearchStore';
import type {
  ZhihuSearchResultItem,
  ZhihuSearchSuggestItem,
} from '@/types/zhihu';
import { getZhihuVideoSource } from '@/utils/zhihuVideo';

type ParsedPeople = Omit<UserCardMember, 'id' | 'name' | 'headline'> & {
  id: string;
  type: 'peoples';
  name: React.ReactNode;
  headline?: React.ReactNode;
};
type SearchListItem = FeedItem | ParsedPeople;

/** 转义正则元字符，避免用户输入（如 "C++"）构造出非法正则 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const SEARCH_CONTENT_FILTERS = [
  { label: '全部', value: undefined },
  { label: '回答', value: 'answer' as const },
  { label: '文章', value: 'article' as const },
  { label: '视频', value: 'zvideo' as const },
];

const SEARCH_SORT_FILTERS = [
  { label: '综合', value: undefined },
  { label: '最新发布', value: 'created_time' as const },
  { label: '最多赞同', value: 'upvoted_count' as const },
];

const SEARCH_TIME_FILTERS = [
  { label: '不限时间', value: undefined },
  { label: '一天内', value: 'a_day' as const },
  { label: '一周内', value: 'a_week' as const },
  { label: '一个月内', value: 'a_month' as const },
  { label: '三个月内', value: 'three_months' as const },
  { label: '半年内', value: 'half_a_year' as const },
  { label: '一年内', value: 'a_year' as const },
];

export default function SearchScreen() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [searchType, setSearchType] = useState('general');
  const [contentFilter, setContentFilter] = useState<
    'answer' | 'article' | 'zvideo' | undefined
  >();
  const [sortFilter, setSortFilter] = useState<
    'created_time' | 'upvoted_count' | undefined
  >();
  const [timeFilter, setTimeFilter] = useState<
    | 'a_day'
    | 'a_week'
    | 'a_month'
    | 'three_months'
    | 'half_a_year'
    | 'a_year'
    | undefined
  >();
  const [submittedQuery, setSubmittedQuery] = useState<string | null>(null);
  const isSearching = submittedQuery !== null;
  const [filterSheetVisible, setFilterSheetVisible] = useState(false);

  const { history, addHistory, clearHistory, removeHistory } = useSearchStore();

  const tintColor = useThemeColor({}, 'primary');
  const linkColor = useThemeColor({}, 'link');
  const onPrimaryColor = useThemeColor({}, 'onPrimary');
  const secondaryTextColor = useThemeColor({}, 'textSecondary');
  const backgroundColor = useThemeColor({}, 'background');
  const surfaceColor = useThemeColor({}, 'backgroundTertiary');
  const selectedSurfaceColor = useThemeColor({}, 'primaryTransparent');
  const textColor = useThemeColor({}, 'text');
  const borderColor = useThemeColor({}, 'border');

  const activeFilterCount =
    Number(contentFilter !== undefined) +
    Number(sortFilter !== undefined) +
    Number(timeFilter !== undefined);

  const activeFilterLabels = [
    contentFilter
      ? `类型：${SEARCH_CONTENT_FILTERS.find((item) => item.value === contentFilter)?.label}`
      : null,
    sortFilter
      ? `排序：${SEARCH_SORT_FILTERS.find((item) => item.value === sortFilter)?.label}`
      : null,
    timeFilter
      ? `时间：${SEARCH_TIME_FILTERS.find((item) => item.value === timeFilter)?.label}`
      : null,
  ].filter((label): label is string => Boolean(label));
  const emptyStateIcon =
    activeFilterCount > 0 ? 'options-outline' : 'search-outline';

  const clearFilters = () => {
    setContentFilter(undefined);
    setSortFilter(undefined);
    setTimeFilter(undefined);
  };

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(handler);
  }, [query]);

  const { data: suggestions } = useQuery({
    queryKey: ['search-suggest', debouncedQuery],
    queryFn: ({ signal }) => getSearchSuggest(debouncedQuery, { signal }),
    enabled: debouncedQuery.length > 0 && !isSearching,
  });

  const {
    data: searchResults,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetching,
    isFetchNextPageError,
    isLoading,
    isError,
    refetch,
  } = useInfiniteQuery({
    queryKey: [
      'search-results',
      submittedQuery,
      searchType,
      searchType === 'general' ? contentFilter : undefined,
      searchType === 'general' ? sortFilter : undefined,
      searchType === 'general' ? timeFilter : undefined,
    ],
    queryFn: ({ pageParam = 0, signal }) =>
      searchContent(submittedQuery ?? '', pageParam, 20, searchType, {
        vertical: searchType === 'general' ? contentFilter : undefined,
        sort: searchType === 'general' ? sortFilter : undefined,
        time_interval: searchType === 'general' ? timeFilter : undefined,
        signal,
      }),
    enabled: Boolean(submittedQuery),
    initialPageParam: 0,
    getNextPageParam: (lastPage, _pages, lastPageParam) => {
      const nextOffset = getZhihuNextOffset(lastPage);
      return nextOffset !== undefined && nextOffset > lastPageParam
        ? nextOffset
        : undefined;
    },
  });

  const handleSearch = (value = query) => {
    const term = value.trim();
    if (!term) return;
    setQuery(term);
    setSubmittedQuery(term);
    addHistory(term);
    Keyboard.dismiss();
  };

  const HighlightText = (text: string) => {
    if (!text) return '';
    const decodedText = text
      .replace(/&lt;em&gt;/g, '[[EM]]')
      .replace(/&lt;\/em&gt;/g, '[[/EM]]')
      .replace(/<em>/g, '[[EM]]')
      .replace(/<\/em>/g, '[[/EM]]')
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ');
    const parts = decodedText.split(/(\[\[EM\]\].*?\[\[\/EM\]\])/gs);
    return (
      <React.Fragment>
        {parts.map((part, i) => {
          if (part.startsWith('[[EM]]') && part.endsWith('[[/EM]]')) {
            return (
              <Text
                // biome-ignore lint/suspicious/noArrayIndexKey: parts 是同一段文本按 [[EM]] 标记 split 出的片段,数量与顺序由该次渲染的文本唯一决定,不增删也不重排。
                key={i}
                type="primary"
                className="font-bold"
              >
                {part.replace(/\[\[\/?EM\]\]/g, '')}
              </Text>
            );
          }
          return part;
        })}
      </React.Fragment>
    );
  };

  const parseSearchResult = (
    item: ZhihuSearchResultItem,
  ): FeedItem | ParsedPeople | null => {
    const obj = item.object;
    if (!obj) return null;
    if (!String(obj.id ?? '').trim()) return null;
    const highlight = item.highlight || {};
    if (obj.type === 'people') {
      return {
        ...obj,
        type: 'peoples',
        id: String(obj.id),
        avatar_url: obj.avatar_url || '',
        name: highlight.title ? HighlightText(highlight.title) : obj.name || '',
        headline: highlight.description
          ? HighlightText(highlight.description)
          : obj.headline || undefined,
      };
    }
    if (
      !['answer', 'article', 'pin', 'question', 'zvideo', 'video'].includes(
        obj.type,
      )
    ) {
      return null;
    }
    return {
      id: String(obj.id),
      type:
        obj.type === 'answer'
          ? 'answers'
          : obj.type === 'article'
            ? 'articles'
            : obj.type === 'pin'
              ? 'pins'
              : obj.type === 'question'
                ? 'questions'
                : 'videos',
      videoSource: getZhihuVideoSource(obj.type),
      ...(obj.type === 'answer' &&
        Array.isArray(obj.endorsements) && { endorsements: obj.endorsements }),
      title: highlight.title
        ? HighlightText(highlight.title)
        : obj.question?.title || obj.question?.name || obj.title || '无标题',
      titleString:
        obj.question?.title || obj.question?.name || obj.title || '无标题',
      excerpt: highlight.description
        ? HighlightText(highlight.description)
        : obj.excerpt || '',
      image: obj.thumbnail_info?.thumbnails?.[0]?.url || null,
      voteCount: obj.voteup_count || 0,
      commentCount: obj.comment_count || 0,
      author: {
        id: String(obj.author?.id || ''),
        name: obj.author?.name || '匿名用户',
        avatar: obj.author?.avatar_url || '',
        url_token: obj.author?.url_token,
      },
      questionId: String(obj.question?.id || obj.id || ''),
      voted: obj.relationship?.voting || 0,
    };
  };

  const seenResults = new Set<string>();
  const flattenedResults: SearchListItem[] =
    searchResults?.pages.flatMap((page) =>
      (page.data ?? []).flatMap((rawItem) => {
        const item = parseSearchResult(rawItem);
        if (!item || (searchType === 'people' && item.type !== 'peoples'))
          return [];
        const key = `${item.type}:${item.id}`;
        if (seenResults.has(key)) return [];
        seenResults.add(key);
        return [item];
      }),
    ) ?? [];

  const renderSuggestion = ({ item }: { item: ZhihuSearchSuggestItem }) => {
    const text = item.query;
    if (!query) return null;
    const parts = text.split(new RegExp(`(${escapeRegExp(query)})`, 'gi'));
    return (
      <BouncyButton
        className="flex-row items-center p-[15px]"
        style={{
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: Colors[colorScheme].border,
        }}
        onPress={() => handleSearch(item.query)}
      >
        <Ionicons
          name="search-outline"
          size={16}
          color={Colors[colorScheme].iconMuted}
          style={{ marginRight: 15 }}
        />
        <Text className="text-base">
          {parts.map((p: string, i: number) =>
            p.toLowerCase() === query.toLowerCase() ? (
              <Text
                // biome-ignore lint/suspicious/noArrayIndexKey: parts 是搜索词按 query split 出的片段,数量与顺序由该次渲染的建议文本唯一决定。
                key={i}
                style={{ color: linkColor, fontWeight: 'bold' }}
              >
                {p}
              </Text>
            ) : (
              p
            ),
          )}
        </Text>
      </BouncyButton>
    );
  };

  const SearchTabs = () => (
    <View
      className="flex-row px-[15px]"
      style={{
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: borderColor,
        backgroundColor,
      }}
    >
      {[
        { label: '综合', value: 'general' },
        { label: '用户', value: 'people' },
      ].map((tab) => (
        <BouncyButton
          key={tab.value}
          onPress={() => setSearchType(tab.value)}
          className="py-3 mr-[25px]"
          style={{
            borderBottomWidth: 2,
            borderBottomColor:
              searchType === tab.value ? tintColor : 'transparent',
          }}
        >
          <Text
            className="text-[15px]"
            style={{
              color: searchType === tab.value ? linkColor : secondaryTextColor,
              fontWeight: searchType === tab.value ? 'bold' : 'normal',
            }}
          >
            {tab.label}
          </Text>
        </BouncyButton>
      ))}
    </View>
  );

  const FilterRow = ({
    title,
    options,
    selected,
    onSelect,
  }: {
    title: string;
    options: ReadonlyArray<{ label: string; value: string | undefined }>;
    selected: string | undefined;
    onSelect: (value: string | undefined) => void;
  }) => (
    <View className="flex-row items-center mb-2">
      <Text type="secondary" className="w-[58px] text-xs">
        {title}
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingRight: 15 }}
      >
        {options.map((option) => {
          const active = option.value === selected;
          return (
            <BouncyButton
              key={option.value ?? 'all'}
              onPress={() => onSelect(option.value)}
              className="mr-2 px-3 py-1 rounded-full"
              style={{
                backgroundColor: active ? selectedSurfaceColor : surfaceColor,
              }}
            >
              <Text
                className="text-xs"
                style={{
                  color: active ? linkColor : textColor,
                  fontWeight: active ? '600' : '400',
                }}
              >
                {option.label}
              </Text>
            </BouncyButton>
          );
        })}
      </ScrollView>
    </View>
  );

  return (
    <View className="flex-1">
      <Stack.Screen options={{ headerShown: false, title: '搜索' }} />

      {/* Header */}
      <View
        className="pb-2.5 px-[5px]"
        style={{ backgroundColor, paddingTop: insets.top + 8 }}
      >
        <View className="flex-row items-center">
          <BouncyButton
            onPress={() => router.back()}
            className="p-2 rounded-full"
            hitSlop={15}
          >
            <Ionicons name="chevron-back" size={28} color={textColor} />
          </BouncyButton>
          <Pressable
            onPress={() => inputRef.current?.focus()}
            className="flex-row items-center rounded-full px-3 h-9 flex-1"
            style={{ backgroundColor: surfaceColor }}
          >
            <Ionicons
              name="search"
              size={18}
              color={Colors[colorScheme].iconMuted}
              style={{ marginRight: 8 }}
            />
            <TextInput
              ref={inputRef}
              className="flex-1 text-sm py-0"
              style={{ color: textColor }}
              placeholder="搜索知乎内容..."
              placeholderTextColor={Colors[colorScheme].textTertiary}
              value={query}
              onChangeText={(text) => {
                setQuery(text);
                setSubmittedQuery(null);
              }}
              onSubmitEditing={() => handleSearch()}
              autoFocus
              returnKeyType="search"
            />
            {query.length > 0 && (
              <BouncyButton
                className="p-1 rounded-full"
                onPress={() => {
                  setQuery('');
                  setSubmittedQuery(null);
                  inputRef.current?.focus();
                }}
                hitSlop={15}
              >
                <Ionicons
                  name="close-circle"
                  size={18}
                  color={Colors[colorScheme].textTertiary}
                />
              </BouncyButton>
            )}
          </Pressable>
          <BouncyButton
            onPress={() => {
              Keyboard.dismiss();
              handleSearch();
            }}
            className="px-2.5 py-2 rounded-full"
            hitSlop={15}
          >
            <Text style={{ color: linkColor, fontWeight: 'bold' }}>搜索</Text>
          </BouncyButton>
        </View>
      </View>

      {isSearching && <SearchTabs />}

      {isSearching && searchType === 'general' && (
        <View
          className="flex-row items-center px-[15px] py-2"
          style={{
            backgroundColor,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: borderColor,
          }}
        >
          <BouncyButton
            className="flex-row items-center px-3 py-1.5 rounded-full"
            style={{ backgroundColor: surfaceColor }}
            onPress={() => setFilterSheetVisible(true)}
          >
            <Ionicons
              name="options-outline"
              size={15}
              color={activeFilterCount > 0 ? tintColor : textColor}
            />
            <Text
              className="ml-1.5 text-xs"
              style={{
                color: activeFilterCount > 0 ? tintColor : textColor,
                fontWeight: '600',
              }}
            >
              筛选
            </Text>
            {activeFilterCount > 0 ? (
              <View
                className="ml-1.5 min-w-[17px] h-[17px] rounded-full items-center justify-center"
                style={{ backgroundColor: tintColor }}
              >
                <Text
                  className="text-[10px] font-bold"
                  style={{ color: onPrimaryColor }}
                >
                  {activeFilterCount}
                </Text>
              </View>
            ) : null}
          </BouncyButton>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="flex-1 ml-2"
            contentContainerStyle={{ paddingRight: 4 }}
          >
            {activeFilterLabels.length > 0 ? (
              activeFilterLabels.map((label) => (
                <BouncyButton
                  key={label}
                  className="flex-row items-center px-2.5 py-1 rounded-full mr-1.5"
                  style={{
                    backgroundColor: selectedSurfaceColor,
                  }}
                  onPress={() => setFilterSheetVisible(true)}
                >
                  <Text
                    className="text-xs"
                    style={{ color: tintColor }}
                    numberOfLines={1}
                  >
                    {label}
                  </Text>
                  <Ionicons
                    name="chevron-down"
                    size={12}
                    color={tintColor}
                    style={{ marginLeft: 3 }}
                  />
                </BouncyButton>
              ))
            ) : (
              <Text type="tertiary" className="text-xs ml-1 py-1">
                综合结果
              </Text>
            )}
          </ScrollView>

          {activeFilterCount > 0 ? (
            <BouncyButton className="ml-1 px-1" onPress={clearFilters}>
              <Text type="secondary" className="text-xs">
                重置
              </Text>
            </BouncyButton>
          ) : null}
        </View>
      )}

      <BottomSheet
        visible={filterSheetVisible}
        onClose={() => setFilterSheetVisible(false)}
        title="筛选搜索结果"
        subtitle={
          activeFilterCount > 0
            ? `已选择 ${activeFilterCount} 项`
            : '按你的阅读目标调整结果'
        }
        height="58%"
      >
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 15, paddingVertical: 12 }}
          showsVerticalScrollIndicator={false}
        >
          <FilterRow
            title="类型"
            options={SEARCH_CONTENT_FILTERS}
            selected={contentFilter}
            onSelect={(value) =>
              setContentFilter(
                value as 'answer' | 'article' | 'zvideo' | undefined,
              )
            }
          />
          <FilterRow
            title="排序"
            options={SEARCH_SORT_FILTERS}
            selected={sortFilter}
            onSelect={(value) =>
              setSortFilter(
                value as 'created_time' | 'upvoted_count' | undefined,
              )
            }
          />
          <FilterRow
            title="时间"
            options={SEARCH_TIME_FILTERS}
            selected={timeFilter}
            onSelect={(value) =>
              setTimeFilter(
                value as
                  | 'a_day'
                  | 'a_week'
                  | 'a_month'
                  | 'three_months'
                  | 'half_a_year'
                  | 'a_year'
                  | undefined,
              )
            }
          />
          <View className="flex-row items-center mt-3">
            <BouncyButton
              className="flex-1 items-center py-2.5 rounded-xl mr-2"
              style={{ backgroundColor: surfaceColor }}
              onPress={clearFilters}
            >
              <Text type="secondary" className="text-sm font-semibold">
                清除条件
              </Text>
            </BouncyButton>
            <BouncyButton
              className="flex-1 items-center py-2.5 rounded-xl"
              style={{ backgroundColor: tintColor }}
              onPress={() => setFilterSheetVisible(false)}
            >
              <Text
                className="text-sm font-semibold"
                style={{ color: onPrimaryColor }}
              >
                完成
              </Text>
            </BouncyButton>
          </View>
        </ScrollView>
      </BottomSheet>

      {isSearching && flattenedResults.length > 0 ? (
        <View
          className="flex-row items-center px-[15px] py-2"
          style={{ backgroundColor }}
        >
          <Text type="secondary" className="text-xs">
            “{submittedQuery}”的结果
          </Text>
          <View className="flex-1" />
          <Text type="tertiary" className="text-xs">
            已加载 {flattenedResults.length} 条
          </Text>
        </View>
      ) : null}

      {!isSearching &&
      query.trim() === debouncedQuery &&
      debouncedQuery.length > 0 &&
      suggestions?.suggest &&
      suggestions.suggest.length > 0 ? (
        <FlashList
          data={suggestions.suggest}
          keyExtractor={(item) => item.query}
          renderItem={renderSuggestion}
          {...({
            estimatedItemSize: 50,
            keyboardShouldPersistTaps: 'handled',
          } as object)}
        />
      ) : isSearching ? (
        <FlashList
          data={flattenedResults}
          key={JSON.stringify([
            submittedQuery,
            searchType,
            ...(searchType === 'general'
              ? [contentFilter, sortFilter, timeFilter]
              : []),
          ])}
          keyExtractor={(item) => `${item.type}:${item.id}`}
          renderItem={({ item }: { item: SearchListItem }) => {
            if (item.type === 'peoples') return <UserCard user={item} />;
            return <FeedCard item={item} />;
          }}
          {...({
            estimatedItemSize: searchType === 'people' ? 80 : 150,
            contentContainerStyle: {
              paddingTop: 4,
              paddingBottom: insets.bottom + 18,
            },
            onEndReached: () =>
              hasNextPage &&
              !isFetching &&
              !isFetchNextPageError &&
              fetchNextPage({ cancelRefetch: false }),
            onEndReachedThreshold: 0.5,
            ListFooterComponent: isFetchingNextPage ? (
              <ActivityIndicator style={{ padding: 20 }} color={tintColor} />
            ) : isFetchNextPageError ? (
              <QueryErrorView
                compact
                message="更多搜索结果加载失败"
                onRetry={() => void fetchNextPage({ cancelRefetch: false })}
              />
            ) : null,
            ListEmptyComponent: isError ? (
              <QueryErrorView
                message="搜索失败"
                onRetry={() => void refetch()}
              />
            ) : !isLoading ? (
              <View className="flex-1 items-center justify-center px-10 py-24">
                <Ionicons
                  name={emptyStateIcon}
                  size={38}
                  color={Colors[colorScheme].textTertiary}
                />
                <Text className="mt-3 text-base font-semibold">
                  没有找到相关内容
                </Text>
                <Text
                  type="secondary"
                  className="mt-1 text-center text-sm leading-5"
                >
                  {activeFilterCount > 0
                    ? '可以放宽筛选条件，或者换一个关键词试试'
                    : '可以换一个关键词，或者试试更具体的描述'}
                </Text>
                {activeFilterCount > 0 ? (
                  <BouncyButton
                    className="mt-4 px-4 py-2 rounded-full"
                    style={{ backgroundColor: surfaceColor }}
                    onPress={clearFilters}
                  >
                    <Text style={{ color: tintColor }}>清除筛选</Text>
                  </BouncyButton>
                ) : null}
              </View>
            ) : (
              <ActivityIndicator style={{ marginTop: 50 }} color={tintColor} />
            ),
          } as object)}
        />
      ) : (
        <ScrollView
          className="flex-1"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 15 }}
        >
          {history.length > 0 ? (
            <View>
              <View className="flex-row justify-between items-center mb-[15px]">
                <Text className="text-base font-bold">搜索历史</Text>
                <BouncyButton
                  className="p-2 rounded-full"
                  onPress={clearHistory}
                  hitSlop={10}
                >
                  <Ionicons
                    name="trash-outline"
                    size={18}
                    color={Colors[colorScheme].textTertiary}
                  />
                </BouncyButton>
              </View>
              <View className="flex-row flex-wrap">
                {history.map((item) => (
                  <View
                    key={item}
                    className="flex-row items-center rounded-[15px] pl-3 pr-2 py-1.5 mr-2.5 mb-2.5"
                    style={{ backgroundColor: surfaceColor }}
                  >
                    <BouncyButton
                      onPress={() => handleSearch(item)}
                      className="mr-1 px-1 py-0.5 rounded-full"
                    >
                      <Text className="text-sm">{item}</Text>
                    </BouncyButton>
                    <BouncyButton
                      onPress={() => removeHistory(item)}
                      className="p-0.5 rounded-full"
                      hitSlop={5}
                    >
                      <Ionicons
                        name="close"
                        size={14}
                        color={Colors[colorScheme].textTertiary}
                      />
                    </BouncyButton>
                  </View>
                ))}
              </View>
            </View>
          ) : (
            <View className="flex-1 justify-center items-center mt-[100px]">
              <Ionicons name="search" size={64} color={surfaceColor} />
              <Text type="secondary" className="mt-2.5">
                搜索你想知道的内容
              </Text>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}
