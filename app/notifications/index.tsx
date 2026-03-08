import { getNotifications, markAllNotificationsRead } from '@/api/zhihu';
import { Text, View, useThemeColor } from '@/components/Themed';
import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect, useNavigation, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet } from 'react-native';

const NOTIFICATION_TYPES = [
    { label: '全部', value: 'all' },
    { label: '赞同', value: 'like' },
    { label: '评论', value: 'comment' },
    { label: '关注', value: 'follow' },
    { label: '邀请', value: 'invite' },
];

export default function NotificationScreen() {
    const router = useRouter();
    const navigation = useNavigation();
    const queryClient = useQueryClient();
    const primaryColor = '#0084ff';
    const borderColor = useThemeColor({}, 'border');
    const [selectedType, setSelectedType] = useState('all');

    useEffect(() => {
        navigation.setOptions({ title: '消息通知' });
    }, [navigation]);

    const markReadMutation = useMutation({
        mutationFn: markAllNotificationsRead,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['me'] });
        }
    });

    useFocusEffect(
        useCallback(() => {
            markReadMutation.mutate();
        }, [])
    );

    const {
        data,
        isLoading,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
        refetch,
        isRefetching
    } = useInfiniteQuery({
        queryKey: ['notifications', selectedType],
        queryFn: ({ pageParam = '' }) => getNotifications(pageParam as string, selectedType),
        initialPageParam: '',
        getNextPageParam: (lastPage) => {
            if (!lastPage || lastPage.paging?.is_end) return undefined;
            return lastPage.paging?.next;
        }
    });

    const notifications = data?.pages.flatMap(page => page.data) || [];

    const getIconConfig = (item: any) => {
        const type = item.type;
        const verb = item.content?.verb || '';

        if (verb.includes('赞同') || verb.includes('喜欢') || type === 'MOMENT_VOTE_UP_ANSWER' || type === 'VOTE_UP_ANSWER') {
            return { name: "heart", color: "#f44336", bg: "#fef2f2" };
        }
        if (verb.includes('评论') || verb.includes('回复') || type.includes('COMMENT')) {
            return { name: "chatbubble-ellipses", color: "#0084ff", bg: "#eff6ff" };
        }
        if (verb.includes('关注') || type === 'FOLLOW_USER') {
            return { name: "person-add", color: "#4caf50", bg: "#f0fdf4" };
        }
        if (verb.includes('邀请') || type.includes('INVITE')) {
            return { name: "mail-open", color: "#ff9800", bg: "#fffbeb" };
        }

        return { name: "notifications", color: "#888", bg: "#f9fafb" };
    };

    const renderItem = ({ item }: { item: any }) => {
        const actor = item.content?.actors?.[0] || item.actors?.[0] || {};
        const target = item.content?.target || item.target || {};
        const time = new Date(item.create_time * 1000).toLocaleString();
        const iconConfig = getIconConfig(item);

        return (
            <Pressable
                style={({ pressed }) => [styles.card, { borderBottomColor: borderColor }, pressed && { opacity: 0.7 }]}
                onPress={() => {
                    const link = item.content?.target?.link;
                    if (link) {
                        if (link.includes('/answer/')) {
                            const id = link.split('/answer/')[1];
                            router.push(`/answer/${id}`);
                            return;
                        }
                        if (link.includes('/question/')) {
                            const id = link.split('/question/')[1];
                            router.push(`/question/${id}`);
                            return;
                        }
                    }

                    if (target.type === 'answer' || item.type === 'answer') {
                        router.push(`/answer/${target.id || item.id}`);
                    } else if (target.type === 'article') {
                        router.push(`/article/${target.id}`);
                    } else if (target.type === 'member') {
                        router.push(`/user/${target.id}`);
                    }
                }}
            >
                <View style={[styles.mainIconContainer, { backgroundColor: iconConfig.bg }]}>
                    <Ionicons name={iconConfig.name as any} size={28} color={iconConfig.color} />
                </View>

                <View style={[styles.content, { backgroundColor: 'transparent' }]}>
                    <View style={[styles.titleRow, { backgroundColor: 'transparent' }]}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'transparent' }}>
                            {actor.avatar_url && (
                                <Image source={{ uri: actor.avatar_url }} style={styles.miniAvatar} />
                            )}
                            <Text style={styles.actorName}>{actor.name || '系统通知'}</Text>
                        </View>
                        <Text type="secondary" style={styles.time}>{time}</Text>
                    </View>
                    <Text style={styles.actionText} numberOfLines={3}>
                        {item.content?.verb ? (
                            <Text style={{ color: iconConfig.color, fontWeight: 'bold' }}>{item.content.verb} </Text>
                        ) : null}
                        {item.content?.text || item.content?.title || item.content?.sub_text || (typeof item.content === 'string' ? item.content : '新的动态')}
                    </Text>
                    {item.content?.target?.text && (
                        <View style={[styles.targetPreview, { backgroundColor: borderColor + '20' }]}>
                            <Text numberOfLines={1} type="secondary" style={styles.targetPrefix}>
                                {item.content.target.text}
                            </Text>
                        </View>
                    )}
                </View>
            </Pressable>
        );
    };

    return (
        <View style={styles.container}>
            <View style={[styles.filterBar, { borderBottomColor: borderColor }]}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterContent}>
                    {NOTIFICATION_TYPES.map((type) => (
                        <Pressable
                            key={type.value}
                            onPress={() => setSelectedType(type.value)}
                            style={[
                                styles.filterChip,
                                selectedType === type.value && { backgroundColor: primaryColor + '15' }
                            ]}
                        >
                            <Text
                                style={[
                                    styles.filterText,
                                    selectedType === type.value && { color: primaryColor, fontWeight: 'bold' }
                                ]}
                            >
                                {type.label}
                            </Text>
                        </Pressable>
                    ))}
                </ScrollView>
            </View>

            <FlashList
                data={notifications}
                renderItem={renderItem}
                {...({ estimatedItemSize: 120 } as any)}
                onEndReached={() => {
                    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
                }}
                onRefresh={refetch}
                refreshing={isRefetching}
                contentContainerStyle={styles.listContent}
                ListEmptyComponent={() => (
                    <View style={styles.empty}>
                        {isLoading ? (
                            <ActivityIndicator color={primaryColor} />
                        ) : (
                            <Text type="secondary">暂无通知喵</Text>
                        )}
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
    filterBar: {
        height: 50,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    filterContent: {
        paddingHorizontal: 10,
        alignItems: 'center',
    },
    filterChip: {
        paddingHorizontal: 16,
        paddingVertical: 6,
        marginHorizontal: 4,
        borderRadius: 20,
    },
    filterText: {
        fontSize: 14,
    },
    listContent: {
        paddingBottom: 20,
    },
    card: {
        flexDirection: 'row',
        padding: 15,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    mainIconContainer: {
        width: 52,
        height: 52,
        borderRadius: 26,
        justifyContent: 'center',
        alignItems: 'center',
    },
    content: {
        marginLeft: 15,
        flex: 1,
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 6,
    },
    miniAvatar: {
        width: 20,
        height: 20,
        borderRadius: 10,
        marginRight: 6,
    },
    actorName: {
        fontWeight: 'bold',
        fontSize: 14,
    },
    time: {
        fontSize: 11,
    },
    actionText: {
        fontSize: 14,
        lineHeight: 20,
    },
    targetPreview: {
        marginTop: 8,
        padding: 8,
        borderRadius: 4,
    },
    targetPrefix: {
        fontSize: 12,
    },
    empty: {
        flex: 1,
        padding: 100,
        alignItems: 'center',
    }
});
