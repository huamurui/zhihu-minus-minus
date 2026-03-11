import { getSearchSuggest, searchContent } from '@/api/zhihu';
import { FeedCard } from '@/components/FeedCard';
import { Text, View, useThemeColor } from '@/components/Themed';
import { UserCard } from '@/components/UserCard';
import { useSearchStore } from '@/store/useSearchStore';
import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Stack, useNavigation, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';

export default function SearchScreen() {
    const router = useRouter();
    const navigation = useNavigation();
    const inputRef = useRef<TextInput>(null);
    const [query, setQuery] = useState('');
    const [debouncedQuery, setDebouncedQuery] = useState('');
    const [searchType, setSearchType] = useState('general'); // 'general' | 'people'
    const [isSearching, setIsSearching] = useState(false);

    const { history, addHistory, clearHistory, removeHistory } = useSearchStore();

    const tintColor = useThemeColor({}, 'tint');
    const backgroundColor = useThemeColor({}, 'background');
    const surfaceColor = useThemeColor({ light: '#f5f5f5', dark: '#1a1a1a' }, 'surface');
    const textColor = useThemeColor({}, 'text');
    const borderColor = useThemeColor({ light: '#eeeeee', dark: '#333333' }, 'border');

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
        queryKey: ['search-results', debouncedQuery, searchType],
        queryFn: ({ pageParam = 0 }) => searchContent(debouncedQuery, pageParam as number, 20, searchType),
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
            addHistory(query.trim());
            setIsSearching(true);
            setDebouncedQuery(query);
            Keyboard.dismiss();
        }
    };

    const renderSuggestion = ({ item }: { item: any }) => {
        const text = item.query;
        if (!query) return null;

        // 对搜索历史/建议中的关键字进行高亮
        const parts = text.split(new RegExp(`(${query})`, 'gi'));

        return (
            <Pressable
                style={styles.suggestionItem}
                onPress={() => {
                    setQuery(item.query);
                    addHistory(item.query);
                    setIsSearching(true);
                    Keyboard.dismiss();
                }}
            >
                <Ionicons name="search-outline" size={16} color="#888" style={styles.suggestionIcon} />
                <Text style={styles.suggestionText}>
                    {parts.map((p: string, i: number) => (
                        p.toLowerCase() === query.toLowerCase() ?
                            <Text key={i} style={{ color: tintColor, fontWeight: 'bold' }}>{p}</Text> :
                            p
                    ))}
                </Text>
            </Pressable>
        );
    };

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
        page.data?.map((item: any) => {
            if (searchType === 'people') {
                return item; // people search usually returns users directly or in object
            }
            return parseSearchResult(item);
        }).filter(Boolean)
    ) || [];

    const SearchTabs = () => (
        <View style={[styles.tabs, { borderBottomColor: borderColor, backgroundColor }]}>
            {[
                { label: '综合', value: 'general' },
                { label: '用户', value: 'people' },
            ].map((tab) => (
                <Pressable
                    key={tab.value}
                    onPress={() => setSearchType(tab.value)}
                    style={[
                        styles.tabItem,
                        searchType === tab.value && { borderBottomColor: tintColor }
                    ]}
                >
                    <Text style={[
                        styles.tabText,
                        searchType === tab.value && { color: tintColor, fontWeight: 'bold' }
                    ]}>
                        {tab.label}
                    </Text>
                </Pressable>
            ))}
        </View>
    );

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

            {isSearching && <SearchTabs />}

            {!isSearching && suggestions?.suggest && suggestions.suggest.length > 0 ? (
                <FlashList
                    data={suggestions.suggest}
                    renderItem={renderSuggestion}
                    {...({ estimatedItemSize: 50, keyboardShouldPersistTaps: "handled" } as any)}
                />
            ) : isSearching ? (
                <FlashList
                    data={flattenedResults}
                    key={searchType} // 切换类型时重新渲染以保证列表状态正确
                    renderItem={({ item }: { item: any }) => {
                        if (searchType === 'people') {
                            const userObj = item.object || item;
                            const highlight = item.highlight || {};
                            const displayUser = {
                                ...userObj,
                                name: HighlightText(highlight.title || userObj.name || '', tintColor),
                                headline: HighlightText(highlight.description || userObj.headline || '', tintColor),
                            };
                            return <UserCard user={displayUser} />;
                        }
                        return <FeedCard item={item} />;
                    }}
                    {...({
                        estimatedItemSize: searchType === 'people' ? 80 : 150,
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
                <ScrollView
                    style={{ flex: 1 }}
                    keyboardShouldPersistTaps="handled"
                    contentContainerStyle={{ padding: 15 }}
                >
                    {history.length > 0 ? (
                        <View>
                            <View style={styles.historyHeader}>
                                <Text style={styles.historyTitle}>搜索历史</Text>
                                <Pressable onPress={clearHistory} hitSlop={10}>
                                    <Ionicons name="trash-outline" size={18} color="#999" />
                                </Pressable>
                            </View>
                            <View style={styles.historyTags}>
                                {history.map((item, index) => (
                                    <View key={index} style={[styles.tagContainer, { backgroundColor: surfaceColor }]}>
                                        <Pressable
                                            onPress={() => {
                                                setQuery(item);
                                                addHistory(item);
                                                setIsSearching(true);
                                                Keyboard.dismiss();
                                            }}
                                            style={styles.tagTextBtn}
                                        >
                                            <Text style={styles.tagText}>{item}</Text>
                                        </Pressable>
                                        <Pressable
                                            onPress={() => removeHistory(item)}
                                            style={styles.tagRemoveBtn}
                                            hitSlop={5}
                                        >
                                            <Ionicons name="close" size={14} color="#999" />
                                        </Pressable>
                                    </View>
                                ))}
                            </View>
                        </View>
                    ) : (
                        <View style={[styles.empty, { marginTop: 100 }]}>
                            <Ionicons name="search" size={64} color={surfaceColor} />
                            <Text type="secondary" style={{ marginTop: 10 }}>搜索你想知道的内容</Text>
                        </View>
                    )}
                </ScrollView>
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
    empty: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    tabs: {
        flexDirection: 'row',
        paddingHorizontal: 15,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    tabItem: {
        paddingVertical: 12,
        marginRight: 25,
        borderBottomWidth: 2,
        borderBottomColor: 'transparent',
    },
    tabText: {
        fontSize: 15,
        color: '#666',
    },
    historyHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 15,
    },
    historyTitle: {
        fontSize: 16,
        fontWeight: 'bold',
    },
    historyTags: {
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    tagContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 15,
        paddingLeft: 12,
        paddingRight: 8,
        paddingVertical: 6,
        marginRight: 10,
        marginBottom: 10,
    },
    tagTextBtn: {
        marginRight: 4,
    },
    tagText: {
        fontSize: 14,
    },
    tagRemoveBtn: {
        padding: 2,
    },
});
