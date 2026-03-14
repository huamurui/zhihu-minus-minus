import { getSearchSuggest, searchContent } from '@/api/zhihu';
import { FeedCard } from '@/components/FeedCard';
import { Text, View } from '@/components/Themed';
import { UserCard } from '@/components/UserCard';
import { useSearchStore } from '@/store/useSearchStore';
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
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';

export default function SearchScreen() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const navigation = useNavigation();
  const inputRef = useRef<TextInput>(null);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [searchType, setSearchType] = useState('general');
  const [isSearching, setIsSearching] = useState(false);

  const { history, addHistory, clearHistory, removeHistory } = useSearchStore();

  const tintColor = Colors[colorScheme].tint;
  const backgroundColor = Colors[colorScheme].background;
  const surfaceColor = colorScheme === 'dark' ? '#1a1a1a' : '#f5f5f5';
  const textColor = Colors[colorScheme].text;
  const borderColor = Colors[colorScheme].border;

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
      return match ? parseInt(match[1]) : undefined;
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

  const HighlightText = (text: string, highlightColor: string) => {
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
                key={i}
                style={{ color: highlightColor, fontWeight: 'bold' }}
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
        name: highlight.title
          ? HighlightText(highlight.title, tintColor)
          : obj.name,
        headline: highlight.description
          ? HighlightText(highlight.description, tintColor)
          : obj.headline,
      };
    }
    return {
      id: obj.id,
      type: obj.type + 's',
      title: highlight.title
        ? HighlightText(highlight.title, tintColor)
        : obj.question?.name || obj.title || '无标题',
      excerpt: highlight.description
        ? HighlightText(highlight.description, tintColor)
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
    const parts = text.split(new RegExp(`(${query})`, 'gi'));
    return (
      <Pressable
        className="flex-row items-center p-[15px]"
        style={{
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: '#eee',
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
          color="#888"
          style={{ marginRight: 15 }}
        />
        <Text className="text-base">
          {parts.map((p: string, i: number) =>
            p.toLowerCase() === query.toLowerCase() ? (
              <Text key={i} style={{ color: tintColor, fontWeight: 'bold' }}>
                {p}
              </Text>
            ) : (
              p
            ),
          )}
        </Text>
      </Pressable>
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
        <Pressable
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
        </Pressable>
      ))}
    </View>
  );

  return (
    <View className="flex-1">
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View className="pt-[45px] pb-2.5 px-[5px]" style={{ backgroundColor }}>
        <View className="flex-row items-center">
          <Pressable
            onPress={() => router.back()}
            className="px-[5px]"
            hitSlop={15}
          >
            <Ionicons name="chevron-back" size={28} color={textColor} />
          </Pressable>
          <Pressable
            onPress={() => inputRef.current?.focus()}
            className="flex-row items-center rounded-full px-3 h-9 flex-1"
            style={{ backgroundColor: surfaceColor }}
          >
            <Ionicons
              name="search"
              size={18}
              color="#888"
              style={{ marginRight: 8 }}
            />
            <TextInput
              ref={inputRef}
              className="flex-1 text-sm py-0"
              style={{ color: textColor }}
              placeholder="搜索知乎内容..."
              placeholderTextColor="#999"
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
              <Pressable
                onPress={() => {
                  setQuery('');
                  setIsSearching(false);
                  inputRef.current?.focus();
                }}
                hitSlop={15}
              >
                <Ionicons name="close-circle" size={18} color="#999" />
              </Pressable>
            )}
          </Pressable>
          <Pressable
            onPress={() => {
              Keyboard.dismiss();
              handleSearch();
            }}
            className="px-2.5"
            hitSlop={15}
          >
            <Text style={{ color: tintColor, fontWeight: 'bold' }}>搜索</Text>
          </Pressable>
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
                    ? HighlightText(
                        highlight.title || userObj.name || '',
                        tintColor,
                      )
                    : userObj.name,
                headline:
                  typeof userObj.headline === 'string'
                    ? HighlightText(
                        highlight.description || userObj.headline || '',
                        tintColor,
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
              <ActivityIndicator style={{ padding: 20 }} />
            ) : null,
            ListEmptyComponent: !isLoading ? (
              <View className="flex-1 justify-center items-center">
                <Text type="secondary">没有找到相关内容</Text>
              </View>
            ) : (
              <ActivityIndicator style={{ marginTop: 50 }} />
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
                <Pressable onPress={clearHistory} hitSlop={10}>
                  <Ionicons name="trash-outline" size={18} color="#999" />
                </Pressable>
              </View>
              <View className="flex-row flex-wrap">
                {history.map((item, index) => (
                  <View
                    key={index}
                    className="flex-row items-center rounded-[15px] pl-3 pr-2 py-1.5 mr-2.5 mb-2.5"
                    style={{ backgroundColor: surfaceColor }}
                  >
                    <Pressable
                      onPress={() => {
                        setQuery(item);
                        addHistory(item);
                        setIsSearching(true);
                        Keyboard.dismiss();
                      }}
                      className="mr-1"
                    >
                      <Text className="text-sm">{item}</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => removeHistory(item)}
                      className="p-0.5"
                      hitSlop={5}
                    >
                      <Ionicons name="close" size={14} color="#999" />
                    </Pressable>
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
