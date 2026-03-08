import { followMember, getMe, getMember, getMemberActivities, getMemberRelations, unfollowMember } from '@/api/zhihu';
import { CreationCard } from '@/components/CreationCard';
import { Text, useThemeColor, View } from '@/components/Themed';
import { FlashList } from '@shopify/flash-list';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet } from 'react-native';

export default function UserDetailScreen() {
    const { id } = useLocalSearchParams();
    const router = useRouter();
    const navigation = useNavigation();
    const [activeTab, setActiveTab] = useState<'activities' | 'answers' | 'questions' | 'articles' | 'pins'>('activities');
    const [sortBy, setSortBy] = useState<'created' | 'voteups'>('created');
    const [followLoading, setFollowLoading] = useState(false);

    useEffect(() => {
        navigation.setOptions({ title: '个人主页' });
    }, [navigation]);

    const borderColor = useThemeColor({}, 'border');
    const primaryColor = '#0084ff';

    // 0. 获取 "我" 的信息 (用于判断是否是自己)
    const { data: me } = useQuery({
        queryKey: ['me'],
        queryFn: () => getMe()
    });

    const isMe = me?.id === id;

    // 1. 获取用户信息
    const { data: user, refetch: refetchUser } = useQuery({
        queryKey: ['user-detail', id],
        queryFn: async () => {
            try {
                return await getMember(id as string);
            } catch (err: any) {
                if (err.response?.status === 403) {
                    const fallbackInclude = 'follower_count,headline,cover_url,description,answer_count,articles_count';
                    return await getMember(id as string, fallbackInclude);
                }
                return null;
            }
        }
    });

    // 2. 获取列表 (Infinite Query)
    const {
        data: listData,
        isLoading: listLoading,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
        refetch: refetchList,
        isRefetching
    } = useInfiniteQuery({
        queryKey: ['user-list', id, activeTab, sortBy],
        queryFn: async ({ pageParam = 0 }) => {
            try {
                const targetId = user?.url_token || id;
                if (activeTab === 'activities') {
                    return await getMemberActivities(targetId, 20, pageParam as number);
                }

                let include = '';
                if (activeTab === 'answers') {
                    include = 'data[*].content,voteup_count,comment_count,created_time,updated_time,excerpt,question.title,relationship.voting,relationship.is_thanked';
                } else if (activeTab === 'questions') {
                    include = 'data[*].created,answer_count,follower_count,author,admin_closed_comment,relationship.is_following';
                } else if (activeTab === 'articles') {
                    include = 'data[*].comment_count,content,voteup_count,created,updated,title,excerpt,relationship.voting';
                } else if (activeTab === 'pins') {
                    include = 'data[*].content,reaction_count,comment_count,created,relationship.voting';
                }

                return await getMemberRelations(targetId, activeTab, {
                    limit: 20,
                    offset: pageParam as number,
                    include,
                    sort_by: activeTab === 'answers' ? sortBy : undefined
                });
            } catch (err) {
                console.error(`获取${activeTab}列表失败:`, err);
                return { data: [], paging: { is_end: true } };
            }
        },
        initialPageParam: 0 as number | string,
        getNextPageParam: (lastPage) => {
            if (!lastPage || lastPage.paging?.is_end) return undefined;
            const nextUrl = lastPage.paging?.next;
            if (!nextUrl) return undefined;
            const match = nextUrl.match(/offset=(\d+)/);
            return match ? match[1] : undefined;
        }
    });

    const listItems = listData?.pages.flatMap(page => page.data) || [];

    const handleFollow = async () => {
        if (followLoading) return;
        setFollowLoading(true);
        try {
            const targetId = user?.url_token || id;
            if (user?.is_following) {
                await unfollowMember(targetId);
            } else {
                await followMember(targetId);
            }
            refetchUser();
        } catch (err) {
            console.error('关注操作失败:', err);
            Alert.alert('提示', '操作失败，请重试');
        } finally {
            setFollowLoading(false);
        }
    };

    const renderHeader = () => (
        <View style={{ backgroundColor: 'transparent' }}>
            <Image
                source={{ uri: user?.cover_url || 'https://picx.zhimg.com/v2-3975ba668e1c6670e309228892697843_b.jpg' }}
                style={styles.cover}
            />
            <View type="surface" style={styles.infoSection}>
                <View style={styles.avatarRow}>
                    <Image source={{ uri: user?.avatar_url }} style={styles.avatar} />
                    {!isMe && (
                        <Pressable
                            onPress={handleFollow}
                            style={[
                                styles.followBtn,
                                user?.is_following ? styles.followedBtn : { backgroundColor: primaryColor }
                            ]}
                        >
                            {followLoading ? (
                                <ActivityIndicator size="small" color={user?.is_following ? "#888" : "#fff"} />
                            ) : (
                                <Text style={[styles.followBtnText, user?.is_following && { color: '#888' }]}>
                                    {user?.is_following ? '已关注' : '+ 关注'}
                                </Text>
                            )}
                        </Pressable>
                    )}
                </View>
                <Text style={styles.name}>{user?.name}</Text>
                <Text type="secondary" style={styles.headline}>{user?.headline}</Text>

                {user?.description ? (
                    <Text type="secondary" style={styles.description} numberOfLines={3}>
                        {user.description}
                    </Text>
                ) : null}

                {!isMe && (user?.mutual_followees_count || 0) > 0 && (
                    <Pressable
                        style={styles.mutualRow}
                        onPress={() => router.push(`/user/${user?.url_token || id}/mutual`)}
                    >
                        <Text style={styles.mutualText}>
                            <Text style={{ fontWeight: 'bold' }}>{user.mutual_followees_count}</Text> 位共同关注
                        </Text>
                        <Image
                            source={{ uri: 'https://pic1.zhimg.com/v2-abed1a8c04702bc9e7ba3d3d82bc7591_s.jpg' }}
                            style={styles.mutualAvatar}
                        />
                    </Pressable>
                )}

                <View style={[styles.statsRow, { backgroundColor: 'transparent' }]}>
                    <Pressable style={styles.statItem} onPress={() => router.push(`/user/${user?.url_token || id}/followers`)}>
                        <Text style={styles.stat}>{user?.follower_count || 0}</Text>
                        <Text type="secondary" style={styles.label}>关注者</Text>
                    </Pressable>
                    <Pressable style={styles.statItem} onPress={() => router.push(`/user/${user?.url_token || id}/following`)}>
                        <Text style={styles.stat}>{user?.following_count || 0}</Text>
                        <Text type="secondary" style={styles.label}>关注</Text>
                    </Pressable>
                    <View style={styles.statItem}>
                        <Text style={styles.stat}>{user?.voteup_count || 0}</Text>
                        <Text type="secondary" style={styles.label}>赞同</Text>
                    </View>
                </View>
            </View>

            <View type="surface" style={{ borderTopWidth: 0.5, borderTopColor: borderColor, borderBottomWidth: 0.5, borderBottomColor: borderColor }}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabBar}>
                    {[
                        { key: 'activities', label: '动态' },
                        { key: 'answers', label: '回答', count: user?.answer_count },
                        { key: 'questions', label: '提问', count: user?.question_count },
                        { key: 'articles', label: '文章', count: user?.articles_count },
                        { key: 'pins', label: '想法', count: user?.pins_count },
                    ].map((tab) => (
                        <Pressable
                            key={tab.key}
                            onPress={() => setActiveTab(tab.key as any)}
                            style={[styles.tabItem, activeTab === tab.key && { borderBottomWidth: 2, borderBottomColor: primaryColor }]}
                        >
                            <Text style={[styles.tabText, activeTab === tab.key && { color: primaryColor }]}>
                                {tab.label} {tab.count !== undefined && tab.count > 0 ? tab.count : ''}
                            </Text>
                        </Pressable>
                    ))}
                </ScrollView>
                {activeTab === 'answers' && (
                    <View style={styles.sortBar}>
                        {[
                            { key: 'created', label: '最新' },
                            { key: 'voteups', label: '赞同' },
                        ].map((item) => (
                            <Pressable
                                key={item.key}
                                onPress={() => setSortBy(item.key as any)}
                                style={[styles.sortItem, sortBy === item.key && styles.activeSortItem]}
                            >
                                <Text style={[styles.sortText, sortBy === item.key && { color: primaryColor, fontWeight: 'bold' }]}>
                                    {item.label}
                                </Text>
                            </Pressable>
                        ))}
                    </View>
                )}
            </View>
        </View>
    );

    const renderItem = ({ item }: { item: any }) => {
        let displayItem = item;
        if (activeTab === 'activities') {
            displayItem = item.target || item;
        }

        if (!displayItem || (!displayItem.id && !displayItem.url)) return null;

        let type: 'answer' | 'article' | 'question' | 'pin' | 'video' = 'answer';
        const itemType = displayItem.type;

        if (itemType === 'article') type = 'article';
        else if (itemType === 'question') type = 'question';
        else if (itemType === 'pin') type = 'pin';
        else if (itemType === 'zvideo' || itemType === 'video') type = 'video';

        return <CreationCard item={displayItem} type={type} />;
    };

    return (
        <View style={styles.container}>
            <FlashList
                data={listItems}
                renderItem={renderItem}
                {...({ estimatedItemSize: 120 } as any)}
                keyExtractor={(item: any, index: number) => {
                    const itemId = item.id || item.target?.id || index;
                    return `${activeTab}-${itemId}-${index}`;
                }}
                onEndReached={() => {
                    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
                }}
                onEndReachedThreshold={0.5}
                ListHeaderComponent={renderHeader}
                ListFooterComponent={() => (
                    isFetchingNextPage ? (
                        <ActivityIndicator style={{ margin: 20 }} color={primaryColor} />
                    ) : (
                        listItems.length > 0 && !hasNextPage ? (
                            <Text type="secondary" style={styles.footerMsg}>— 已经到底了喵 —</Text>
                        ) : null
                    )
                )}
                ListEmptyComponent={() => (
                    <View style={styles.empty}>
                        {listLoading ? (
                            <ActivityIndicator size="small" color={primaryColor} />
                        ) : (
                            <Text type="secondary">这里空空如也喵</Text>
                        )}
                    </View>
                )}
                onRefresh={refetchList}
                refreshing={isRefetching}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    cover: { height: 140, width: '100%' },
    infoSection: { padding: 20, paddingTop: 0 },
    avatarRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: -40 },
    avatar: { width: 80, height: 80, borderRadius: 40, borderWidth: 3, borderColor: '#fff' },
    followBtn: { paddingHorizontal: 20, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', marginBottom: 5 },
    followedBtn: { backgroundColor: '#f0f0f0' },
    followBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
    name: { fontSize: 22, fontWeight: 'bold', marginTop: 10 },
    headline: { marginTop: 5, fontSize: 14, color: '#666' },
    description: { marginTop: 10, fontSize: 13, lineHeight: 18 },
    statsRow: { flexDirection: 'row', marginTop: 20, borderTopWidth: 0.5, borderTopColor: '#f0f0f0', paddingTop: 15 },
    statItem: { marginRight: 30, alignItems: 'center' },
    stat: { fontWeight: 'bold', fontSize: 18 },
    label: { fontSize: 12, marginTop: 2 },
    footerMsg: { textAlign: 'center', padding: 20, fontSize: 12 },
    tabBar: { flexDirection: 'row' },
    tabItem: { paddingHorizontal: 20, paddingVertical: 15, alignItems: 'center' },
    tabText: { fontWeight: 'bold', color: '#999' },
    empty: { padding: 50, alignItems: 'center', backgroundColor: 'transparent' },
    mutualRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 15,
        padding: 10,
        backgroundColor: 'rgba(0,0,0,0.02)',
        borderRadius: 8
    },
    mutualText: { fontSize: 13, color: '#666' },
    mutualAvatar: { width: 20, height: 20, borderRadius: 10, marginLeft: 8 },
    sortBar: {
        flexDirection: 'row',
        paddingHorizontal: 15,
        paddingVertical: 10,
        backgroundColor: 'rgba(0,0,0,0.01)',
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: '#eee'
    },
    sortItem: {
        paddingHorizontal: 12,
        paddingVertical: 4,
        marginRight: 10,
        borderRadius: 4,
    },
    activeSortItem: {
        backgroundColor: 'rgba(0,132,255,0.08)',
    },
    sortText: {
        fontSize: 13,
        color: '#888',
    },
});
