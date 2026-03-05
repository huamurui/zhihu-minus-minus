import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import RenderHtml from 'react-native-render-html';

import client from '@/api/client';
import { LikeButton } from '@/components/LikeButton';
import { useThemeStore } from '@/store/useThemeStore';

// 单个回答组件：处理内部的“展开/折叠”逻辑
const AnswerItem = ({ item, isDark }: { item: any, isDark: boolean }) => {
  const [expanded, setExpanded] = useState(false);
  const { width } = useWindowDimensions();
  const router = useRouter();

  const theme = {
    card: isDark ? '#1e1e1e' : '#fff',
    text: isDark ? '#eee' : '#1a1a1a',
    subText: isDark ? '#888' : '#666',
    border: isDark ? '#333' : '#eee'
  };

  // 简单去除 HTML 标签获取纯文本摘要
  const excerpt = item.content?.replace(/<[^>]+>/g, '').substring(0, 100) + '...';

  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
      {/* 1. 作者信息栏 */}
      <View style={styles.authorRow}>
        <Image source={{ uri: item.author?.avatar_url }} style={styles.avatar} />
        <View style={styles.authorInfo}>
          <Text style={[styles.authorName, { color: theme.text }]}>{item.author?.name}</Text>
          <Text style={[styles.authorHeadline, { color: theme.subText }]} numberOfLines={1}>
            {item.author?.headline}
          </Text>
        </View>
        <Pressable style={styles.followBtn}>
          <Text style={styles.followText}>+ 关注</Text>
        </Pressable>
      </View>

      {/* 2. 内容部分 */}
      <Pressable onPress={() => setExpanded(!expanded)} style={styles.contentContainer}>
        {expanded ? (
          // 展开状态：显示富文本
          <RenderHtml
            contentWidth={width - 30}
            source={{ html: item.content }}
            tagsStyles={{
              p: { color: theme.text, fontSize: 16, lineHeight: 24, marginBottom: 10 },
              img: { borderRadius: 8, marginVertical: 8 }
            }}
          />
        ) : (
          // 折叠状态：显示纯文本摘要
          <Text style={[styles.excerpt, { color: theme.text }]}>
            {excerpt}
            <Text style={styles.expandLabel}> 展开全文</Text>
          </Text>
        )}
      </Pressable>

      {/* 3. 底部交互栏 */}
      <View style={styles.footer}>
        <View style={styles.voteGroup}>
          <LikeButton count={item.voteup_count} />
          <View style={[styles.downvoteBtn, { backgroundColor: isDark ? '#333' : '#f0f7ff' }]}>
            <Ionicons name="caret-down" size={18} color="#0084ff" />
          </View>
        </View>

        <Pressable 
          style={styles.commentBtn}
          onPress={() => router.push(`/comments/${item.id}`)}
        >
          <Ionicons name="chatbubble-ellipses-outline" size={18} color="#888" />
          <Text style={styles.commentCount}>{item.comment_count} 评论</Text>
        </Pressable>

        <Ionicons name="share-social-outline" size={18} color="#888" style={{marginLeft: 'auto'}} />
      </View>
    </View>
  );
};

export default function QuestionDetail() {
  const { id } = useLocalSearchParams();
  const { isDark } = useThemeStore();

  // 1. 获取问题详情
  const { data: question, isLoading: qLoading } = useQuery({
    queryKey: ['question', id],
    queryFn: async () => {
      const res = await client.get(`/questions/${id}?include=content,excerpt,answer_count`);
      return res.data;
    }
  });

  // 2. 获取回答列表 (增加 include 字段以获取头像和头衔)
  const { data: answers, isLoading: aLoading, refetch } = useQuery({
    queryKey: ['question-answers', id],
    queryFn: async () => {
      const include = 'data[*].content,voteup_count,comment_count,author.name,author.avatar_url,author.headline';
      const res = await client.get(`/questions/${id}/answers?include=${include}&limit=20`);
      return res.data.data;
    }
  });

  if (qLoading || aLoading) return <ActivityIndicator style={{ marginTop: 50 }} />;

  return (
    <View style={[styles.container, { backgroundColor: isDark ? '#121212' : '#f4f4f4' }]}>
      <FlashList
        data={answers}
        keyExtractor={(item) => item.id.toString()}
        estimatedItemSize={200}
        onRefresh={refetch}
        refreshing={aLoading}
        ListHeaderComponent={() => (
          <View style={[styles.header, { backgroundColor: isDark ? '#1e1e1e' : '#fff' }]}>
            <Text style={[styles.title, { color: isDark ? '#fff' : '#000' }]}>{question?.title}</Text>
            {question?.excerpt && (
              <Text style={[styles.qExcerpt, { color: isDark ? '#aaa' : '#666' }]} numberOfLines={3}>
                {question.excerpt.replace(/<[^>]+>/g, '')}
              </Text>
            )}
            <View style={styles.qStats}>
              <Text style={styles.qStatText}>{question?.answer_count} 个回答 · 关注问题</Text>
            </View>
          </View>
        )}
        renderItem={({ item }) => <AnswerItem item={item} isDark={isDark} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  // 问题头部
  header: { padding: 20, marginBottom: 8 },
  title: { fontSize: 21, fontWeight: 'bold', lineHeight: 28 },
  qExcerpt: { marginTop: 10, fontSize: 14, lineHeight: 20 },
  qStats: { marginTop: 15, borderTopWidth: 0.5, borderTopColor: '#eee', paddingTop: 12 },
  qStatText: { color: '#0084ff', fontWeight: 'bold' },
  // 回答卡片
  card: { padding: 15, marginBottom: 2 },
  authorRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  avatar: { width: 34, height: 34, borderRadius: 17 },
  authorInfo: { flex: 1, marginLeft: 10 },
  authorName: { fontSize: 15, fontWeight: 'bold' },
  authorHeadline: { fontSize: 12, marginTop: 2 },
  followBtn: { backgroundColor: '#0084ff15', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 4 },
  followText: { color: '#0084ff', fontSize: 13, fontWeight: 'bold' },
  // 内容
  contentContainer: { marginVertical: 5 },
  excerpt: { fontSize: 15, lineHeight: 24 },
  expandLabel: { color: '#0084ff', fontWeight: '500' },
  // 底部交互
  footer: { flexDirection: 'row', alignItems: 'center', marginTop: 15, paddingTop: 10 },
  voteGroup: { flexDirection: 'row', alignItems: 'center' },
  downvoteBtn: { width: 34, height: 34, borderRadius: 4, justifyContent: 'center', alignItems: 'center', marginLeft: 4 },
  commentBtn: { flexDirection: 'row', alignItems: 'center', marginLeft: 20 },
  commentCount: { marginLeft: 5, color: '#888', fontSize: 13 },
});