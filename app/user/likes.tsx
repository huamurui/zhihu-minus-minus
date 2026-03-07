import apiClient from '@/api/client';
import { CreationCard } from '@/components/CreationCard';
import { Text, View, useThemeColor } from '@/components/Themed';
import { FlashList } from '@shopify/flash-list';
import { useInfiniteQuery } from '@tanstack/react-query';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

export default function MyLikesScreen() {
    const [activeTab, setActiveTab] = useState<'answers' | 'articles'>('answers');
    const primaryColor = '#0084ff';
    const borderColor = useThemeColor({}, 'border');

    const {
        data,
        isLoading,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
        refetch,
        isRefetching
    } = useInfiniteQuery({
        queryKey: ['my-likes', activeTab],
        queryFn: async ({ pageParam = 0 }) => {
            const endpoint = activeTab === 'answers' ? 'voted_answers' : 'voted_articles';
            const res = await apiClient.get(`/members/me/${endpoint}?limit=20&offset=${pageParam}&include=data[*].content,voteup_count,comment_count,created_time,updated_time,excerpt,question.title,relationship.voting`);
            return res.data;
        },
        initialPageParam: 0,
        getNextPageParam: (lastPage) => {
            if (!lastPage || lastPage.paging?.is_end) return undefined;
            const nextUrl = lastPage.paging?.next;
            const match = nextUrl?.match(/offset=(\d+)/);
            return match ? parseInt(match[1]) : undefined;
        }
    });

    const listItems = data?.pages.flatMap(page => page.data) || [];

    return (
        <View style={styles.container}>
            <View style={[styles.tabBar, { borderBottomColor: borderColor }]}>
                <Pressable
                    style={[styles.tabItem, activeTab === 'answers' && styles.activeTab]}
                    onPress={() => setActiveTab('answers')}
                >
                    <Text style={[styles.tabText, activeTab === 'answers' && { color: primaryColor }]}>回答</Text>
                </Pressable>
                <Pressable
                    style={[styles.tabItem, activeTab === 'articles' && styles.activeTab]}
                    onPress={() => setActiveTab('articles')}
                >
                    <Text style={[styles.tabText, activeTab === 'articles' && { color: primaryColor }]}>文章</Text>
                </Pressable>
            </View>

            <FlashList
                data={listItems}
                renderItem={({ item }: { item: any }) => (
                    <CreationCard
                        item={item}
                        type={activeTab === 'answers' ? 'answer' : 'article'}
                    />
                )}
                {...({ estimatedItemSize: 150 } as any)}
                onEndReached={() => {
                    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
                }}
                onRefresh={refetch}
                refreshing={isRefetching}
                ListEmptyComponent={() => (
                    <View style={styles.empty}>
                        {isLoading ? <ActivityIndicator color={primaryColor} /> : <Text type="secondary">还没有点赞过内容喵</Text>}
                    </View>
                )}
                ListFooterComponent={() => (
                    isFetchingNextPage ? <ActivityIndicator style={{ margin: 20 }} color={primaryColor} /> : null
                )}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    tabBar: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
    tabItem: { flex: 1, paddingVertical: 15, alignItems: 'center' },
    activeTab: { borderBottomWidth: 2, borderBottomColor: '#0084ff' },
    tabText: { fontWeight: 'bold', color: '#888' },
    empty: { flex: 1, padding: 100, alignItems: 'center' }
});
