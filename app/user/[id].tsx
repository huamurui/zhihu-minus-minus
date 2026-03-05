import apiClient from '@/api/client';
import { CreationCard } from '@/components/CreationCard';
import { Text, View, useThemeColor } from '@/components/Themed';
import { FlashList } from '@shopify/flash-list';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Image, Pressable, StyleSheet } from 'react-native';

export default function UserDetailScreen() {
  const { id } = useLocalSearchParams();
  const [activeTab, setActiveTab] = useState<'answers' | 'articles'>('answers');

  const borderColor = useThemeColor({}, 'border');
  const primaryColor = '#0084ff';

  // 1. 获取用户信息
  const { data: user } = useQuery({
    queryKey: ['user-detail', id],
    queryFn: async () => {
      const res = await apiClient.get(`/members/${id}?include=answer_count,articles_count,follower_count,headline,cover_url,description`);
      return res.data;
    }
  });

  // 2. 获取创作列表
  const { data: creations, isLoading: listLoading } = useQuery({
    queryKey: ['user-creations', id, activeTab],
    queryFn: async () => {
      const res = await apiClient.get(`/members/${id}/${activeTab}?limit=20&include=data[*].content,voteup_count,comment_count`);
      return res.data.data;
    }
  });

  const renderHeader = () => (
    <View style={{ backgroundColor: 'transparent' }}>
      <Image source={{ uri: user?.cover_url || 'https://picx.zhimg.com/v2-3975ba668e1c6670e309228892697843_b.jpg' }} style={styles.cover} />
      <View type="surface" style={styles.infoSection}>
        <Image source={{ uri: user?.avatar_url }} style={styles.avatar} />
        <Text style={styles.name}>{user?.name}</Text>
        <Text type="secondary" style={styles.headline}>{user?.headline}</Text>
        <View style={[styles.statsRow, { backgroundColor: 'transparent' }]}>
          <Text style={styles.stat}>{user?.follower_count} <Text type="secondary" style={styles.label}>粉丝</Text></Text>
          <Text style={styles.stat}>{user?.following_count || 0} <Text type="secondary" style={styles.label}>关注</Text></Text>
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
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={() => (
          <View style={styles.empty}><Text type="secondary">{listLoading ? '搬运中...' : '这里空空如也喵'}</Text></View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  cover: { height: 140, width: '100%' },
  infoSection: { padding: 20, paddingTop: 0 },
  avatar: { width: 80, height: 80, borderRadius: 40, borderWidth: 3, borderColor: '#fff', marginTop: -40 },
  name: { fontSize: 22, fontWeight: 'bold', marginTop: 10 },
  headline: { marginTop: 5, fontSize: 14 },
  statsRow: { flexDirection: 'row', marginTop: 15 },
  stat: { marginRight: 20, fontWeight: 'bold', fontSize: 16 },
  label: { fontWeight: 'normal', fontSize: 12 },
  tabBar: { flexDirection: 'row', borderTopWidth: 0.5, marginTop: 10 },
  tabItem: { flex: 1, paddingVertical: 15, alignItems: 'center' },
  tabText: { fontWeight: 'bold', color: '#999' },
  empty: { padding: 50, alignItems: 'center', backgroundColor: 'transparent' }
});
