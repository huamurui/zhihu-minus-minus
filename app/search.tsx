import { getSearchSuggest, searchContent } from '@/api/zhihu';
import { FeedCard } from '@/components/FeedCard';
import { Text, View, useThemeColor } from '@/components/Themed';
import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Stack, useNavigation, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, StyleSheet, TextInput } from 'react-native';

export default function SearchScreen() {
    const router = useRouter();
    const navigation = useNavigation();
    const inputRef = useRef<TextInput>(null);
    const [query, setQuery] = useState('');
    const [debouncedQuery, setDebouncedQuery] = useState('');
    const [isSearching, setIsSearching] = useState(false);

    const tintColor = useThemeColor({}, 'tint');
    const backgroundColor = useThemeColor({}, 'background');
    const surfaceColor = useThemeColor({ light: '#f5f5f5', dark: '#1a1a1a' }, 'surface');
    const textColor = useThemeColor({}, 'text');

    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedQuery(query);
        }, 300);
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
        isLoading
    } = useInfiniteQuery({
        queryKey: ['search-results', debouncedQuery],
        queryFn: ({ pageParam = 0 }) => searchContent(debouncedQuery, pageParam as number),
        enabled: isSearching && debouncedQuery.length > 0,
        initialPageParam: 0,
        getNextPageParam: (lastPage) => {
            if (lastPage.paging?.is_end) return undefined;
            // 从 next URL 中提取 offset
            const nextUrl = lastPage.paging?.next;
            const match = nextUrl?.match(/offset=(\d+)/);
            return match ? parseInt(match[1]) : undefined;
        },
    });

    const handleSearch = () => {
        if (query.trim()) {
            setIsSearching(true);
            setDebouncedQuery(query);
        }
    };

    const renderSuggestion = ({ item }: { item: any }) => (
        <Pressable
            style={styles.suggestionItem}
            onPress={() => {
                setQuery(item.query);
                setIsSearching(true);
            }}
        >
            <Ionicons name="search-outline" size={16} color="#888" style={styles.suggestionIcon} />
            <Text style={styles.suggestionText}>{item.query}</Text>
        </Pressable>
    );

    const HighlightText = (text: string, highlightColor: string) => {
        if (!text) return '';

        // 同时处理转义和不转义的 em 标签，并对 HTML 实体进行解码
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

        // 使用正则表达式分割文本，保留 [[EM]]...[[/EM]] 部分
        const parts = decodedText.split(/(\[\[EM\]\].*?\[\[\/EM\]\])/gs);

        return (
            <React.Fragment>
                {parts.map((part, i) => {
                    if (part.startsWith('[[EM]]') && part.endsWith('[[/EM]]')) {
                        return (
                            <Text key={i} style={{ color: highlightColor, fontWeight: 'bold' }}>
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

        // 适配 FeedCard 的数据格式
        return {
            id: obj.id,
            type: obj.type + 's', // answers, articles etc
            title: highlight.title ? HighlightText(highlight.title, tintColor) : (obj.question?.name || obj.title || '无标题'),
            excerpt: highlight.description ? HighlightText(highlight.description, tintColor) : (obj.excerpt || ''),
            image: obj.thumbnail_info?.thumbnails?.[0]?.url || null,
            voteCount: obj.voteup_count || 0,
            commentCount: obj.comment_count || 0,
            author: {
                id: obj.author?.id,
                name: obj.author?.name || '匿名用户',
                avatar: obj.author?.avatar_url,
                url_token: obj.author?.url_token
            },
            questionId: obj.question?.id || obj.id,
            voted: obj.relationship?.voting || 0
        };
    };

    const flattenedResults = searchResults?.pages.flatMap(page =>
        page.data?.map((item: any) => parseSearchResult(item)).filter(Boolean)
    ) || [];

    return (
        <View style={styles.container}>
            <Stack.Screen options={{ headerShown: false }} />

            {/* 自定义稳定 Header */}
            <View style={[styles.header, { backgroundColor }]}>
                <View style={styles.headerTop}>
                    <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={15}>
                        <Ionicons name="chevron-back" size={28} color={textColor} />
                    </Pressable>

                    <Pressable
                        onPress={() => inputRef.current?.focus()}
                        style={[styles.searchBar, { backgroundColor: surfaceColor }]}
                    >
                        <Ionicons name="search" size={18} color="#888" style={styles.searchIcon} />
                        <TextInput
                            ref={inputRef}
                            style={[styles.input, { color: textColor }]}
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
                        style={styles.searchBtn}
                        hitSlop={15}
                    >
                        <Text style={{ color: tintColor, fontWeight: 'bold' }}>搜索</Text>
                    </Pressable>
                </View>
            </View>

            {!isSearching && suggestions?.suggest && suggestions.suggest.length > 0 ? (
                <FlashList
                    data={suggestions.suggest}
                    renderItem={renderSuggestion}
                    {...({ estimatedItemSize: 50, keyboardShouldPersistTaps: "handled" } as any)}
                />
            ) : isSearching ? (
                <FlashList
                    data={flattenedResults}
                    renderItem={({ item }) => <FeedCard item={item} />}
                    {...({
                        estimatedItemSize: 150,
                        onEndReached: () => hasNextPage && !isFetchingNextPage && fetchNextPage(),
                        onEndReachedThreshold: 0.5,
                        ListFooterComponent: isFetchingNextPage ? <ActivityIndicator style={{ padding: 20 }} /> : null,
                        ListEmptyComponent: !isLoading ? (
                            <View style={styles.empty}>
                                <Text type="secondary">没有找到相关内容</Text>
                            </View>
                        ) : <ActivityIndicator style={{ marginTop: 50 }} />
                    } as any)}
                />
            ) : (
                <View style={styles.empty}>
                    <Ionicons name="search" size={64} color={surfaceColor} />
                    <Text type="secondary" style={{ marginTop: 10 }}>搜索你想知道的内容</Text>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    searchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 20,
        paddingHorizontal: 12,
        height: 36,
        flex: 1,
    },
    header: {
        paddingTop: 45, // 适配状态栏
        paddingBottom: 10,
        paddingHorizontal: 5,
    },
    headerTop: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    backBtn: {
        paddingHorizontal: 5,
    },
    searchIcon: { marginRight: 8 },
    input: {
        flex: 1,
        fontSize: 14,
        paddingVertical: 0,
    },
    searchBtn: { paddingHorizontal: 10 },
    suggestionItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 15,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: '#eee',
    },
    suggestionIcon: { marginRight: 15 },
    suggestionText: { fontSize: 16 },
    empty: { flex: 1, justifyContent: 'center', alignItems: 'center' }
});
