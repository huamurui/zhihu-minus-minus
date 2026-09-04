import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Stack, useNavigation, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
} from 'react-native';
import { getSearchSuggest, searchContent } from '@/api/zhihu';
import { BouncyButton } from '@/components/BouncyButton';
import { FeedCard } from '@/components/FeedCard';
import { Text, useThemeColor, View } from '@/components/Themed';
import { UserCard } from '@/components/UserCard';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { useSearchStore } from '@/store/useSearchStore';

/** 转义正则元字符，避免用户输入（如 "C++"）构造出非法正则 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export default function SearchScreen() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const _navigation = useNavigation();
  const inputRef = useRef<TextInput>(null);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [searchType, setSearchType] = useState('general');
  const [isSearching, setIsSearching] = useState(false);

  const { history, addHistory, clearHistory, removeHistory } = useSearchStore();

  const tintColor = useThemeColor({}, 'primary');
  const backgroundColor = useThemeColor({}, 'background');
  const surfaceColor = Colors[colorScheme].backgroundTertiary;
  const textColor = useThemeColor({}, 'text');
  const borderColor = useThemeColor({}, 'border');

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(handler);
  }, [query]);

  const { data: suggestions } = useQuery({
    queryKey: ['search-suggest', debouncedQuery],
    queryFn: () => getSearchSuggest(debouncedQuery),
    enabled: debouncedQuery.length > 0 && !isSearching,
  });

  const {
    data: searchResults,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery({
    queryKey: ['search-results', debouncedQuery, searchType],
    queryFn: ({ pageParam = 0 }) =>
      searchContent(debouncedQuery, pageParam as number, 20, searchType),
    enabled: isSearching && debouncedQuery.length > 0,
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      if (lastPage.paging?.is_end) return undefined;
      const nextUrl = lastPage.paging?.next;
      const match = nextUrl?.match(/offset=(\d+)/);
      return match ? parseInt(match[1], 10) : undefined;
    },
  });

  const handleSearch = () => {
    if (query.trim()) {
      addHistory(query.trim());
      setIsSearching(true);
      setDebouncedQuery(query);
      Keyboard.dismiss();
    }
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

  const parseSearchResult = (item: any) => {
    const obj = item.object;
    if (!obj) return null;
    const highlight = item.highlight || {};
    if (obj.type === 'people') {
      return {
        ...obj,
        type: 'peoples',
        name: highlight.title ? HighlightText(highlight.title) : obj.name,
        headline: highlight.description
          ? HighlightText(highlight.description)
          : obj.headline,
      };
    }
    return {
      id: obj.id ?? obj.question?.id ?? '',
      type: `${obj.type}s`,
      title: highlight.title
        ? HighlightText(highlight.title)
        : obj.question?.name || obj.title || '无标题',
      titleString: obj.question?.name || obj.title || '无标题',
      excerpt: highlight.description
        ? HighlightText(highlight.description)
        : obj.excerpt || '',
      image: obj.thumbnail_info?.thumbnails?.[0]?.url || null,
      voteCount: obj.voteup_count || 0,
      commentCount: obj.comment_count || 0,
      author: {
        id: obj.author?.id,
        name: obj.author?.name || '匿名用户',
        avatar: obj.author?.avatar_url,
        url_token: obj.author?.url_token,
      },
      questionId: obj.question?.id || obj.id,
      voted: obj.relationship?.voting || 0,
    };
  };

  const flattenedResults =
    searchResults?.pages.flatMap((page) =>
      page.data
        ?.map((item: any) =>
          searchType === 'people' ? item : parseSearchResult(item),
        )
        .filter(Boolean),
    ) || [];

  const renderSuggestion = ({ item }: { item: any }) => {
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
        onPress={() => {
          setQuery(item.query);
          addHistory(item.query);
          setIsSearching(true);
          Keyboard.dismiss();
        }}
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
                style={{ color: tintColor, fontWeight: 'bold' }}
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
              color: searchType === tab.value ? tintColor : '#666',
              fontWeight: searchType === tab.value ? 'bold' : 'normal',
            }}
          >
            {tab.label}
          </Text>
        </BouncyButton>
      ))}
    </View>
  );

  return (
    <View className="flex-1">
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View className="pt-[45px] pb-2.5 px-[5px]" style={{ backgroundColor }}>
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
                setIsSearching(false);
              }}
              onSubmitEditing={handleSearch}
              autoFocus
              returnKeyType="search"
            />
            {query.length > 0 && (
              <BouncyButton
                className="p-1 rounded-full"
                onPress={() => {
                  setQuery('');
                  setIsSearching(false);
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
            <Text style={{ color: tintColor, fontWeight: 'bold' }}>搜索</Text>
          </BouncyButton>
        </View>
      </View>

      {isSearching && <SearchTabs />}

      {!isSearching &&
      suggestions?.suggest &&
      suggestions.suggest.length > 0 ? (
        <FlashList
          data={suggestions.suggest}
          renderItem={renderSuggestion}
          {...({
            estimatedItemSize: 50,
            keyboardShouldPersistTaps: 'handled',
          } as any)}
        />
      ) : isSearching ? (
        <FlashList
          data={flattenedResults}
          key={searchType}
          renderItem={({ item }: { item: any }) => {
            if (searchType === 'people') {
              const userObj = item.object || item;
              const highlight = item.highlight || {};
              const displayUser = {
                ...userObj,
                name:
                  typeof userObj.name === 'string'
                    ? HighlightText(highlight.title || userObj.name || '')
                    : userObj.name,
                headline:
                  typeof userObj.headline === 'string'
                    ? HighlightText(
                        highlight.description || userObj.headline || '',
                      )
                    : userObj.headline,
              };
              return <UserCard user={displayUser} />;
            }
            if (item.type === 'peoples') return <UserCard user={item} />;
            return <FeedCard item={item} />;
          }}
          {...({
            estimatedItemSize: searchType === 'people' ? 80 : 150,
            onEndReached: () =>
              hasNextPage && !isFetchingNextPage && fetchNextPage(),
            onEndReachedThreshold: 0.5,
            ListFooterComponent: isFetchingNextPage ? (
              <ActivityIndicator style={{ padding: 20 }} color={tintColor} />
            ) : null,
            ListEmptyComponent: !isLoading ? (
              <View className="flex-1 justify-center items-center">
                <Text type="secondary">没有找到相关内容</Text>
              </View>
            ) : (
              <ActivityIndicator style={{ marginTop: 50 }} color={tintColor} />
            ),
          } as any)}
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
                      onPress={() => {
                        setQuery(item);
                        addHistory(item);
                        setIsSearching(true);
                        Keyboard.dismiss();
                      }}
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
