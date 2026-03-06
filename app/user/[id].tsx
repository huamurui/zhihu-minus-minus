import apiClient from '@/api/client';
import { CreationCard } from '@/components/CreationCard';
import { Text, View, useThemeColor } from '@/components/Themed';
import { FlashList } from '@shopify/flash-list';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet } from 'react-native';

export default function UserDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'answers' | 'articles'>('answers');
  const [followLoading, setFollowLoading] = useState(false);

  const borderColor = useThemeColor({}, 'border');
  const primaryColor = '#0084ff';

  // 1. 获取用户信息
  const userInclude = 'answer_count,articles_count,follower_count,following_count,headline,cover_url,description,voteup_count,thanked_count,favorited_count,is_following';
  const { data: user, refetch: refetchUser } = useQuery({
    queryKey: ['user-detail', id],
    queryFn: async () => {
      try {
        const res = await apiClient.get(`/members/${id}?include=${userInclude}`);
        return res.data;
      } catch (err: any) {
        if (err.response?.status === 403) {
          // 403 可能是因为某些高级字段权限问题，尝试更稳妥的 include
          const fallbackInclude = 'follower_count,headline,cover_url,description,answer_count,articles_count';
          const res = await apiClient.get(`/members/${id}?include=${fallbackInclude}`);
          return res.data;
        }
        console.error('获取用户信息失败:', err);
        return null;
      }
    }
  });

  // 2. 获取创作列表 (Infinite Query)
  const {
    data: creationsData,
    isLoading: listLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch: refetchList,
    isRefetching
  } = useInfiniteQuery({
    queryKey: ['user-creations', id, activeTab],
    queryFn: async ({ pageParam = 0 }) => {
      try {
        const include = 'data[*].content,voteup_count,comment_count,created_time,updated_time';
        const res = await apiClient.get(`/members/${id}/${activeTab}?limit=20&offset=${pageParam}&include=${include}`);
        return res.data;
      } catch (err) {
        console.error('获取创作列表失败:', err);
        return { data: [], paging: { is_end: true } };
      }
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      if (!lastPage || lastPage.paging?.is_end) return undefined;
      const nextUrl = lastPage.paging?.next;
      if (!nextUrl) return undefined;
      const match = nextUrl.match(/offset=(\d+)/);
      return match ? parseInt(match[1]) : undefined;
    }
  });

  const creations = creationsData?.pages.flatMap(page => page.data) || [];

  const handleFollow = async () => {
    if (followLoading) return;
    setFollowLoading(true);
    try {
      if (user?.is_following) {
        await apiClient.delete(`/members/${id}/followers`);
      } else {
        await apiClient.post(`/members/${id}/followers`);
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
      <Image source={{ uri: user?.cover_url || 'https://picx.zhimg.com/v2-3975ba668e1c6670e309228892697843_b.jpg' }} style={styles.cover} />
      <View type="surface" style={styles.infoSection}>
        <View style={styles.avatarRow}>
          <Image source={{ uri: user?.avatar_url }} style={styles.avatar} />
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
        </View>
        <Text style={styles.name}>{user?.name}</Text>
        <Text type="secondary" style={styles.headline}>{user?.headline}</Text>

        {user?.description ? (
          <Text type="secondary" style={styles.description} numberOfLines={3}>
            {user.description}
          </Text>
        ) : null}

        <View style={[styles.statsRow, { backgroundColor: 'transparent' }]}>
          <View style={styles.statItem}>
            <Text style={styles.stat}>{user?.follower_count || 0}</Text>
            <Text type="secondary" style={styles.label}>粉丝</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.stat}>{user?.following_count || 0}</Text>
            <Text type="secondary" style={styles.label}>关注</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.stat}>{user?.voteup_count || 0}</Text>
            <Text type="secondary" style={styles.label}>赞同</Text>
          </View>
        </View>
      </View>

      {/* 创作切换 Tab */}
      <View type="surface" style={[styles.tabBar, { borderTopColor: borderColor, borderBottomColor: borderColor, borderBottomWidth: 0.5 }]}>
        <Pressable onPress={() => setActiveTab('answers')} style={[styles.tabItem, activeTab === 'answers' && { borderBottomWidth: 2, borderBottomColor: primaryColor }]}>
          <Text style={[styles.tabText, activeTab === 'answers' && { color: primaryColor }]}>回答 {user?.answer_count}</Text>
        </Pressable>
        <Pressable onPress={() => setActiveTab('articles')} style={[styles.tabItem, activeTab === 'articles' && { borderBottomWidth: 2, borderBottomColor: primaryColor }]}>
          <Text style={[styles.tabText, activeTab === 'articles' && { color: primaryColor }]}>文章 {user?.articles_count}</Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <FlashList
        data={creations}
        renderItem={({ item }: { item: any }) => <CreationCard item={item} type={activeTab === 'answers' ? 'answer' : 'article'} />}
        {...({ estimatedItemSize: 120 } as any)}
        keyExtractor={(item: any, index: number) => item.id?.toString() || index.toString()}
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) {
            fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.5}
        ListHeaderComponent={renderHeader}
        ListFooterComponent={() => (
          isFetchingNextPage ? (
            <ActivityIndicator style={{ margin: 20 }} color={primaryColor} />
          ) : (
            creations.length > 0 && !hasNextPage ? (
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
  tabBar: { flexDirection: 'row', borderTopWidth: 0.5, marginTop: 10 },
  tabItem: { flex: 1, paddingVertical: 15, alignItems: 'center' },
  tabText: { fontWeight: 'bold', color: '#999' },
  empty: { padding: 50, alignItems: 'center', backgroundColor: 'transparent' }
});
