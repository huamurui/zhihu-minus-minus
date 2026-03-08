import { getReadHistory } from '@/api/zhihu';
import { Text, View } from '@/components/Themed';
import { FlashList } from '@shopify/flash-list';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

export default function HistoryScreen() {
    const router = useRouter();
    const {
        data,
        isLoading,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
        refetch,
        isRefetching
    } = useInfiniteQuery({
        queryKey: ['read-history'],
        queryFn: ({ pageParam = 0 }) => getReadHistory(20, pageParam as number),
        initialPageParam: 0,
        getNextPageParam: (lastPage: any) => {
            if (!lastPage || lastPage.paging?.is_end) return undefined;
            const nextUrl = lastPage.paging?.next;
            const match = nextUrl?.match(/offset=(\d+)/);
            return match ? parseInt(match[1]) : undefined;
        }
    });

    const historyItems = data?.pages.flatMap((page: any) => page.data) || [];

    const renderItem = ({ item }: { item: any }) => {
        // 适配提供的最近浏览数据结构
        const rawData = item.data;
        if (!rawData) return null;

        const extra = rawData.extra;
        const type = extra?.content_type || 'answer';

        // 过滤个人主页等类型
        if (type === 'profile') return null;

        const mappedItem = {
            id: extra?.content_token,
            title: rawData.header?.title,
            excerpt: rawData.content?.summary,
            stat_text: rawData.matrix?.[0]?.data?.text || '',
            updated_time: extra?.read_time,
        };

        return (
            <Pressable onPress={() => router.push(`/${type}/${mappedItem.id}`)}>
                <View type="surface" style={styles.card}>
                    <Text style={styles.title} numberOfLines={2}>
                        {mappedItem.title}
                    </Text>
                    {mappedItem.excerpt ? (
                        <Text type="secondary" style={styles.excerpt} numberOfLines={3}>
                            {mappedItem.excerpt}
                        </Text>
                    ) : null}
                    <View style={[styles.footer, { backgroundColor: 'transparent' }]}>
                        <Text type="secondary" style={styles.statText}>
                            {mappedItem.stat_text}
                        </Text>
                        <Text type="secondary" style={styles.statText}>
                            {mappedItem.updated_time ? new Date(mappedItem.updated_time * 1000).toLocaleDateString() : ''}
                        </Text>
                    </View>
                </View>
            </Pressable>
        );
    };

    return (
        <View style={styles.container}>
            <Stack.Screen options={{ title: '最近浏览' }} />
            <FlashList
                data={historyItems}
                renderItem={renderItem}
                {...({ estimatedItemSize: 100 } as any)}
                keyExtractor={(item: any, index: number) => {
                    const id = item.data?.extra?.content_token || index;
                    return `history-${id}-${index}`;
                }}
                onEndReached={() => {
                    if (hasNextPage && !isFetchingNextPage) {
                        fetchNextPage();
                    }
                }}
                onEndReachedThreshold={0.5}
                ListFooterComponent={() => (
                    isFetchingNextPage ? (
                        <ActivityIndicator style={{ margin: 20 }} color="#0084ff" />
                    ) : (
                        historyItems.length > 0 && !hasNextPage ? (
                            <Text type="secondary" style={styles.footerMsg}>— 已经到底了喵 —</Text>
                        ) : null
                    )
                )}
                ListEmptyComponent={() => (
                    <View style={styles.empty}>
                        {isLoading ? (
                            <ActivityIndicator size="small" color="#0084ff" />
                        ) : (
                            <Text type="secondary">这里空空如也喵</Text>
                        )}
                    </View>
                )}
                onRefresh={refetch}
                refreshing={isRefetching}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    card: { padding: 15, marginBottom: 2, marginTop: 1 },
    title: { fontSize: 16, fontWeight: 'bold', marginBottom: 8, lineHeight: 22 },
    excerpt: { fontSize: 14, lineHeight: 20 },
    footer: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
    statText: { fontSize: 12 },
    footerMsg: { textAlign: 'center', padding: 20, fontSize: 12 },
    empty: { padding: 50, alignItems: 'center' },
});
