import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import RenderHtml from 'react-native-render-html';

import client from '@/api/client';
import { LikeButton } from '@/components/LikeButton';
import { Text, View, useThemeColor } from '@/components/Themed';

// 单个回答组件：处理内部的“展开/折叠”逻辑
const AnswerItem = ({ item }: { item: any }) => {
  const [expanded, setExpanded] = useState(false);
  const { width } = useWindowDimensions();
  const router = useRouter();

  const textColor = useThemeColor({}, 'text');
  const borderColor = useThemeColor({}, 'border');

  // 简单去除 HTML 标签获取纯文本摘要
  const excerpt = item.content?.replace(/<[^>]+>/g, '').substring(0, 100) + '...';

  return (
    <View type="surface" style={[styles.card, { borderBottomColor: borderColor }]}>
      {/* 1. 作者信息栏 */}
      <View style={[styles.authorRow, { backgroundColor: 'transparent' }]}>
        <Image source={{ uri: item.author?.avatar_url }} style={styles.avatar} />
        <View style={styles.authorInfo}>
          <Text style={styles.authorName}>{item.author?.name}</Text>
          <Text type="secondary" style={styles.authorHeadline} numberOfLines={1}>
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
              p: { color: textColor, fontSize: 16, lineHeight: 24, marginBottom: 10 },
              img: { borderRadius: 8, marginVertical: 8 },
              span: { color: textColor },
              div: { color: textColor },
            }}
          />
        ) : (
          // 折叠状态：显示纯文本摘要
          <Text style={styles.excerpt}>
            {excerpt}
            <Text style={styles.expandLabel}> 展开全文</Text>
          </Text>
        )}
      </Pressable>

      {/* 3. 底部交互栏 */}
      <View style={[styles.footer, { backgroundColor: 'transparent' }]}>
        <View style={styles.voteGroup}>
          <LikeButton count={item.voteup_count} />
          <View style={[styles.downvoteBtn, { backgroundColor: borderColor }]}>
            <Ionicons name="caret-down" size={18} color="#0084ff" />
          </View>
        </View>

        <Pressable
          style={styles.commentBtn}
          onPress={() => router.push(`/comments/${item.id}`)}
        >
          <Ionicons name="chatbubble-ellipses-outline" size={18} color="#888" />
          <Text type="secondary" style={styles.commentCount}>{item.comment_count} 评论</Text>
        </Pressable>

        <Ionicons name="share-social-outline" size={18} color="#888" style={{ marginLeft: 'auto' }} />
      </View>
    </View>
  );
};

export default function QuestionDetail() {
  const { id } = useLocalSearchParams();
  const borderColor = useThemeColor({}, 'border');
  // 1. 获取问题详情
  const { data: question, isLoading: qLoading, error: qError } = useQuery({
    queryKey: ['question', id],
    queryFn: async () => {
      try {
        const res = await client.get(`/questions/${id}?include=content,excerpt,answer_count`);
        return res.data || null;
      } catch (err) {
        console.error('获取问题详情失败:', err);
        return null;
      }
    }
  });

  // 2. 获取回答列表
  const { data: answers, isLoading: aLoading } = useQuery({
    queryKey: ['question-answers', id],
    queryFn: async () => {
      try {
        const include = 'data[*].content,voteup_count,comment_count,author.name,author.avatar_url,author.headline';
        const res = await client.get(`/questions/${id}/answers?include=${include}&limit=20`);
        return res.data.data || [];
      } catch (err) {
        console.error('获取回答列表失败:', err);
        return [];
      }
    }
  });

  if (qLoading || aLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0084ff" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlashList
        data={answers || []}
        {...({ estimatedItemSize: 200 } as any)}
        ListHeaderComponent={
          <View type="surface" style={styles.header}>
            <Text style={styles.title}>{question?.title || '加载失败'}</Text>
            {question?.excerpt ? (
              <Text type="secondary" style={styles.qExcerpt}>
                {question.excerpt.replace(/<[^>]+>/g, '')}
              </Text>
            ) : null}
            <View style={[styles.qStats, { borderTopColor: borderColor }]}>
              <Text style={styles.qStatText}>
                {question?.answer_count || 0} 个回答
              </Text>
            </View>
          </View>
        }
        renderItem={({ item }: { item: any }) => <AnswerItem item={item} />}
        keyExtractor={(item: any) => item.id.toString()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  // 问题头部
  header: { padding: 20, marginBottom: 8 },
  title: { fontSize: 21, fontWeight: 'bold', lineHeight: 28 },
  qExcerpt: { marginTop: 10, fontSize: 14, lineHeight: 20 },
  qStats: { marginTop: 15, borderTopWidth: 0.5, paddingTop: 12 },
  qStatText: { color: '#0084ff', fontWeight: 'bold' },
  // 回答卡片
  card: { padding: 15, marginBottom: 2, borderBottomWidth: 0.5 },
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
  commentCount: { marginLeft: 5, fontSize: 13 },
});