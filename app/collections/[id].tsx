import { getCollection, getCollectionDetail } from '@/api/zhihu';
import { CreationCard } from '@/components/CreationCard';
import { Text, View, useThemeColor } from '@/components/Themed';
import { FlashList } from '@shopify/flash-list';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';

export default function CollectionDetailScreen() {
    const { id } = useLocalSearchParams();
    const navigation = useNavigation();
    const primaryColor = '#0084ff';
    const borderColor = useThemeColor({}, 'border');

    useEffect(() => {
        navigation.setOptions({ title: '收藏夹' });
    }, [navigation]);

    // 1. 获取收藏夹基本信息
    const { data: collection } = useQuery({
        queryKey: ['collection-detail', id],
        queryFn: () => getCollection(id as string)
    });

    // 2. 获取收藏夹内容
    const {
        data: listData,
        isLoading,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
        refetch,
        isRefetching
    } = useInfiniteQuery({
        queryKey: ['collection-contents', id],
        queryFn: ({ pageParam = 0 }) => getCollectionDetail(id as string, 20, pageParam as number),
        initialPageParam: 0,
        getNextPageParam: (lastPage) => {
            if (!lastPage || lastPage.paging?.is_end) return undefined;
            const nextUrl = lastPage.paging?.next;
            const match = nextUrl?.match(/offset=(\d+)/);
            return match ? parseInt(match[1]) : undefined;
        }
    });

    const contents = listData?.pages.flatMap(page => page.data) || [];

    return (
        <View style={styles.container}>
            <View style={[styles.header, { borderBottomColor: borderColor }]}>
                <Text style={styles.headerTitle}>{collection?.title || '收藏夹内容'}</Text>
                {collection?.description ? (
                    <Text type="secondary" style={styles.headerDesc}>{collection.description}</Text>
                ) : null}
            </View>

            <FlashList
                data={contents}
                renderItem={({ item }: { item: any }) => {
                    let type: 'answer' | 'article' | 'pin' = 'answer';
                    if (item.type === 'article') type = 'article';
                    else if (item.type === 'pin') type = 'pin';
                    return <CreationCard item={item} type={type} />;
                }}
                {...({ estimatedItemSize: 150 } as any)}
                onEndReached={() => {
                    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
                }}
                onRefresh={refetch}
                refreshing={isRefetching}
                ListEmptyComponent={() => (
                    <View style={styles.empty}>
                        {isLoading ? <ActivityIndicator color={primaryColor} /> : <Text type="secondary">这个收藏夹空空如也喵</Text>}
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
    header: { padding: 20, borderBottomWidth: StyleSheet.hairlineWidth },
    headerTitle: { fontSize: 20, fontWeight: 'bold' },
    headerDesc: { fontSize: 14, marginTop: 10, lineHeight: 20 },
    empty: { flex: 1, padding: 100, alignItems: 'center' }
});
