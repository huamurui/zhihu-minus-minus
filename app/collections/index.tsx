import { getMyCollections } from '@/api/zhihu';
import { Text, View, useThemeColor } from '@/components/Themed';
import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useNavigation, useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

export default function MyCollectionsScreen() {
    const router = useRouter();
    const navigation = useNavigation();
    const primaryColor = '#0084ff';
    const borderColor = useThemeColor({}, 'border');

    useEffect(() => {
        navigation.setOptions({ title: '我的收藏夹' });
    }, [navigation]);

    const {
        data,
        isLoading,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
        refetch,
        isRefetching
    } = useInfiniteQuery({
        queryKey: ['my-collections'],
        queryFn: ({ pageParam = 0 }) => getMyCollections(20, pageParam as number),
        initialPageParam: 0,
        getNextPageParam: (lastPage) => {
            if (!lastPage || lastPage.paging?.is_end) return undefined;
            const nextUrl = lastPage.paging?.next;
            const match = nextUrl?.match(/offset=(\d+)/);
            return match ? parseInt(match[1]) : undefined;
        }
    });

    const collections = data?.pages.flatMap(page => page.data) || [];

    const renderItem = ({ item }: { item: any }) => {
        return (
            <Pressable
                style={({ pressed }) => [styles.card, { borderBottomColor: borderColor }, pressed && { opacity: 0.7 }]}
                onPress={() => router.push(`/collections/${item.id}`)}
            >
                <View style={styles.iconBox}>
                    <Ionicons name="folder" size={24} color={primaryColor} />
                </View>
                <View style={styles.content}>
                    <Text style={styles.title}>{item.title}</Text>
                    <Text type="secondary" style={styles.meta}>
                        {item.answer_count || 0} 内容 · {item.follower_count || 0} 关注
                    </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#ccc" />
            </Pressable>
        );
    };

    return (
        <View style={styles.container}>
            <FlashList
                data={collections}
                renderItem={renderItem}
                {...({ estimatedItemSize: 80 } as any)}
                onEndReached={() => {
                    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
                }}
                onRefresh={refetch}
                refreshing={isRefetching}
                ListEmptyComponent={() => (
                    <View style={styles.empty}>
                        {isLoading ? (
                            <ActivityIndicator color={primaryColor} />
                        ) : (
                            <Text type="secondary">你还没有收藏夹喵</Text>
                        )}
                    </View>
                )}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    card: {
        flexDirection: 'row',
        padding: 15,
        alignItems: 'center',
        borderBottomWidth: StyleSheet.hairlineWidth
    },
    iconBox: {
        width: 48,
        height: 48,
        borderRadius: 8,
        backgroundColor: 'rgba(0,132,255,0.05)',
        justifyContent: 'center',
        alignItems: 'center'
    },
    content: { marginLeft: 15, flex: 1 },
    title: { fontSize: 16, fontWeight: 'bold' },
    meta: { fontSize: 13, marginTop: 4 },
    empty: { flex: 1, padding: 100, alignItems: 'center' }
});
