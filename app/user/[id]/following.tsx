import apiClient from '@/api/client';
import { Text, View } from '@/components/Themed';
import { UserCard } from '@/components/UserCard';
import { FlashList } from '@shopify/flash-list';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';

export default function FollowingScreen() {
    const { id } = useLocalSearchParams();
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
        queryKey: ['user-following', id],
        queryFn: async ({ pageParam = 0 }) => {
            // 知乎关注的人接口通常是 followees
            const res = await apiClient.get(`/members/${id}/followees?limit=20&offset=${pageParam}`);
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

    const users = data?.pages.flatMap(page => page.data) || [];

    return (
        <View style={styles.container}>
            <Stack.Screen options={{ title: '关注列表' }} />
            <FlashList
                data={users}
                renderItem={({ item }) => <UserCard user={item} />}
                {...({ estimatedItemSize: 80 } as any)}
                onEndReached={() => hasNextPage && fetchNextPage()}
                onRefresh={refetch}
                refreshing={isRefetching}
                ListEmptyComponent={() => (
                    <View style={styles.empty}>
                        {isLoading ? <ActivityIndicator color="#0084ff" /> : <Text type="secondary">还没有关注任何人喵</Text>}
                    </View>
                )}
                ListFooterComponent={() => isFetchingNextPage ? <ActivityIndicator style={{ margin: 20 }} color="#0084ff" /> : null}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    empty: { padding: 50, alignItems: 'center' },
});
