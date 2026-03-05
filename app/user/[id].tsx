import apiClient from '@/api/client';
import { CreationCard } from '@/components/CreationCard';
import { useThemeStore } from '@/store/useThemeStore';
import { FlashList } from '@shopify/flash-list';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

export default function UserDetailScreen() {
  const { id } = useLocalSearchParams();
  const { isDark } = useThemeStore();
  const [activeTab, setActiveTab] = useState<'answers' | 'articles'>('answers');

  const theme = {
    bg: isDark ? '#000' : '#f6f6f6',
    card: isDark ? '#1a1a1a' : '#fff',
    text: isDark ? '#fff' : '#1a1a1a',
    primary: '#0084ff'
  };

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
    <View>
      <Image source={{ uri: user?.cover_url || 'https://picx.zhimg.com/v2-3975ba668e1c6670e309228892697843_b.jpg' }} style={styles.cover} />
      <View style={[styles.infoSection, { backgroundColor: theme.card }]}>
        <Image source={{ uri: user?.avatar_url }} style={styles.avatar} />
        <Text style={[styles.name, { color: theme.text }]}>{user?.name}</Text>
        <Text style={styles.headline}>{user?.headline}</Text>
        <View style={styles.statsRow}>
          <Text style={[styles.stat, { color: theme.text }]}>{user?.follower_count} <Text style={styles.label}>粉丝</Text></Text>
          <Text style={[styles.stat, { color: theme.text }]}>{user?.following_count || 0} <Text style={styles.label}>关注</Text></Text>
        </View>
      </View>
      
      {/* 创作切换 Tab */}
      <View style={[styles.tabBar, { backgroundColor: theme.card }]}>
        <Pressable onPress={() => setActiveTab('answers')} style={[styles.tabItem, activeTab === 'answers' && styles.activeTab]}>
          <Text style={[styles.tabText, activeTab === 'answers' && { color: theme.primary }]}>回答 {user?.answer_count}</Text>
        </Pressable>
        <Pressable onPress={() => setActiveTab('articles')} style={[styles.tabItem, activeTab === 'articles' && styles.activeTab]}>
          <Text style={[styles.tabText, activeTab === 'articles' && { color: theme.primary }]}>文章 {user?.articles_count}</Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <FlashList
        data={creations}
        renderItem={({ item }) => <CreationCard item={item} type={activeTab === 'answers' ? 'answer' : 'article'} />}
        estimatedItemSize={120}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={() => (
          <View style={styles.empty}><Text style={{color: '#999'}}>{listLoading ? '搬运中...' : '这里空空如也喵'}</Text></View>
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
  headline: { color: '#999', marginTop: 5, fontSize: 14 },
  statsRow: { flexDirection: 'row', marginTop: 15 },
  stat: { marginRight: 20, fontWeight: 'bold', fontSize: 16 },
  label: { fontWeight: 'normal', color: '#999', fontSize: 12 },
  tabBar: { flexDirection: 'row', borderTopWidth: 0.5, borderTopColor: '#eee', marginTop: 10 },
  tabItem: { flex: 1, paddingVertical: 15, alignItems: 'center' },
  activeTab: { borderBottomWidth: 2, borderBottomColor: '#0084ff' },
  tabText: { fontWeight: 'bold', color: '#999' },
  empty: { padding: 50, alignItems: 'center' }
});