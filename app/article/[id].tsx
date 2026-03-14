import { getDailyDetail, getArticle } from '@/api/zhihu';
import { Text, View } from '@/components/Themed';
import { ZhihuContent } from '@/components/ZhihuContent';
import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { Image, ScrollView, StyleSheet, useWindowDimensions, ActivityIndicator, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from '@/components/useColorScheme';

import Colors from '@/constants/Colors';
export default function ArticleDetail() {
  const colorScheme = useColorScheme();
  const { id, source } = useLocalSearchParams();
  const { width } = useWindowDimensions();
  const textColor = Colors[colorScheme].text;
  const surfaceColor = Colors[colorScheme].surface;
  const router = useRouter();

  // 1. 获取日报详情
  const { data: dailyData, isLoading: dailyLoading } = useQuery({
    queryKey: ['daily-article', id],
    queryFn: () => getDailyDetail(id as string),
    enabled: source === 'daily'
  });

  // 2. 获取知乎普通文章详情
  const { data: zhihuData, isLoading: zhihuLoading } = useQuery({
    queryKey: ['zhihu-article', id],
    queryFn: () => getArticle(id as string),
    enabled: source !== 'daily'
  });

  const isLoading = source === 'daily' ? dailyLoading : zhihuLoading;
  const data = source === 'daily' ? dailyData : zhihuData;

  if (isLoading) return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={Colors[colorScheme].primary} />
      <Text style={{ marginTop: 12 }}>正赶往知识的荒原...喵</Text>
    </View>
  );

  if (!data) return <View style={styles.center}><Text>加载失败喵</Text></View>;

  const isDaily = source === 'daily';

  return (
    <ScrollView style={styles.container}>
      <Stack.Screen options={{ title: isDaily ? '知乎日报' : '文章' }} />
      
      {/* 顶部展示模块 */}
      {isDaily ? (
        <View style={styles.header}>
          <Image source={{ uri: data.image }} style={styles.topImage} />
          <View style={styles.overlay}>
            <Text style={styles.topTitle}>{data.title}</Text>
            {data.image_source && <Text style={styles.imageSource}>{data.image_source}</Text>}
          </View>
        </View>
      ) : (
        <View style={styles.zhihuArticleHeader}>
          <Text style={styles.zhihuTitle}>{data.title}</Text>
          <View style={styles.authorRow}>
            <Image source={{ uri: data.author?.avatar_url }} style={styles.authorAvatar} />
            <View style={styles.authorInfo}>
              <Text style={styles.authorName}>{data.author?.name}</Text>
              <Text type="secondary" style={styles.authorHeadline} numberOfLines={1}>{data.author?.headline}</Text>
            </View>
          </View>
        </View>
      )}

      {/* 内容渲染 */}
      <View style={{ paddingHorizontal: 15, backgroundColor: 'transparent' }}>
        <ZhihuContent 
          content={isDaily ? data.body : data.content} 
          objectId={id as string}
          type="article"
        />
      </View>

      {/* 底部信息 (针对普通文章) */}
      {!isDaily && (
        <View style={styles.footerInfo}>
          <Text type="secondary" style={styles.statsText}>
            {data.voteup_count || 0} 赞同 · {data.comment_count || 0} 评论
          </Text>
          <Pressable 
            style={[styles.commentBtn, { backgroundColor: surfaceColor }]}
            onPress={() => router.push(`/comments/${id}?type=article`)}
          >
            <Ionicons name="chatbubble-outline" size={18} color={Colors[colorScheme].primary} />
            <Text type="primary" style={styles.commentBtnText}>查看全部 {data.comment_count || 0} 条评论</Text>
          </Pressable>
        </View>
      )}

      <View style={{ height: 100, backgroundColor: 'transparent' }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { width: '100%', height: 300, position: 'relative' },
  topImage: { width: '100%', height: '100%' },
  overlay: { position: 'absolute', bottom: 0, padding: 20, width: '100%', backgroundColor: 'rgba(0,0,0,0.5)' },
  topTitle: { color: '#ffffff', fontSize: 22, fontWeight: 'bold' },
  imageSource: { color: 'rgba(255,255,255,0.7)', fontSize: 10, textAlign: 'right', marginTop: 8 },
  // 知乎普通文章头部
  zhihuArticleHeader: { padding: 20, paddingTop: 30 },
  zhihuTitle: { fontSize: 24, fontWeight: 'bold', lineHeight: 32, marginBottom: 20 },
  authorRow: { flexDirection: 'row', alignItems: 'center' },
  authorAvatar: { width: 44, height: 44, borderRadius: 22 },
  authorInfo: { marginLeft: 12, flex: 1 },
  authorName: { fontSize: 16, fontWeight: 'bold' },
  authorHeadline: { fontSize: 13, marginTop: 2 },
  // 底部信息
  footerInfo: { padding: 20, marginTop: 20, borderTopWidth: StyleSheet.hairlineWidth },
  statsText: { fontSize: 14, marginBottom: 15 },
  commentBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 15, borderRadius: 12 },
  commentBtnText: { fontWeight: 'bold', marginLeft: 8, fontSize: 15 },
});