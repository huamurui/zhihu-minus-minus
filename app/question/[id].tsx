import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import { ActivityIndicator, Animated, Image, LayoutAnimation, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import RenderHtml from 'react-native-render-html';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import client from '@/api/client';
import { deleteAnswer } from '@/api/zhihu/answer';
import { followMember, unfollowMember } from '@/api/zhihu/member';
import { followQuestion, QUESTION_INCLUDE, unfollowQuestion } from '@/api/zhihu/question';
import { LikeButton } from '@/components/LikeButton';
import { Text, View, useThemeColor } from '@/components/Themed';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert } from 'react-native';

const AnswerItem = ({ item }: { item: any }) => {
  const { width } = useWindowDimensions();
  const router = useRouter();
  const textColor = useThemeColor({}, 'text');
  const queryClient = useQueryClient();

  // 改进摘要逻辑：如果正文本身就很短，则无需折叠
  const rawText = item.content?.replace(/<[^>]+>/g, '') || '';
  const isLongContent = rawText.length > 120;
  const excerpt = isLongContent ? rawText.substring(0, 100) + '...' : rawText;

  // 初始状态：如果内容短，直接展开
  const [expanded, setExpanded] = useState(!isLongContent);

  const followMutation = useMutation({
    mutationFn: async () => {
      if (item.author?.is_following) {
        return unfollowMember(item.author.url_token || item.author.id);
      } else {
        return followMember(item.author.url_token || item.author.id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['question-answers'] });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteAnswer(item.id),
    onSuccess: () => {
      Alert.alert('删除成功', '你的回答已删除喵！');
      queryClient.invalidateQueries({ queryKey: ['question-answers', item.question?.id || item.id] });
    },
    onError: (err: any) => {
      console.error(err.response?.data);
      Alert.alert('删除失败', err.response?.data?.error?.message || '无法删除回答');
    }
  });

  const handleDelete = () => {
    Alert.alert(
      '确认删除',
      '确定要删除这个回答吗？此操作不可撤销喵！',
      [
        { text: '取消', style: 'cancel' },
        { text: '确认删除', style: 'destructive', onPress: () => deleteMutation.mutate() }
      ]
    );
  };

  const toggleExpand = () => {
    if (!isLongContent) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(!expanded);
  };

  const goToProfile = () => {
    const token = item.author?.url_token || item.author?.id;
    if (token) {
      router.push(`/user/${token}`);
    }
  };

  return (
    <View type="surface" style={[styles.card]}>
      {/* 1. 作者信息栏 */}
      <View style={styles.authorRow}>
        <Pressable onPress={goToProfile} style={{ flexDirection: 'row', flex: 1, alignItems: 'center' }}>
          <Image source={{ uri: item.author?.avatar_url }} style={styles.avatar} />
          <View style={styles.authorInfo} >
            <Text style={styles.authorName}>{item.author?.name}</Text>
            <Text type="secondary" style={styles.authorHeadline} numberOfLines={1}>
              {item.author?.headline}
            </Text>
          </View>
        </Pressable>
        <Pressable
          style={[styles.followBtn, item.author?.is_following && styles.followBtnActive]}
          onPress={() => followMutation.mutate()}
          disabled={followMutation.isPending}
        >
          <Text style={[styles.followText, item.author?.is_following && styles.followTextActive]}>
            {item.author?.is_following ? '已关注' : '+ 关注'}
          </Text>
        </Pressable>
      </View>

      {/* 2. 内容部分 */}
      <Pressable onPress={toggleExpand} style={styles.contentContainer}>
        {expanded ? (
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
          <Text style={styles.excerpt}>
            {excerpt}
            {isLongContent && <Text style={styles.expandLabel}> 展开全文</Text>}
          </Text>
        )}
      </Pressable>

      {/* 3. 底部交互栏 */}
      <View style={styles.footer}>
        <View style={styles.voteGroup}>
          <LikeButton
            id={item.id}
            count={item.voteup_count}
            voted={item.relationship?.voting}
          />
          <View style={styles.downvoteBtn}>
            <Ionicons name="caret-down" size={18} color="#0084ff" />
          </View>
        </View>

        <Pressable
          style={styles.commentBtn}
          onPress={() => router.push(`/comments/${item.id}?type=answer`)}
        >
          <Ionicons name="chatbubble-ellipses-outline" size={18} color="#888" />
          <Text type="secondary" style={styles.commentCount}>{item.comment_count} 评论</Text>
        </Pressable>

        {item.relationship?.is_author && (
          <Pressable
            style={styles.deleteBtn}
            onPress={handleDelete}
            disabled={deleteMutation.isPending}
          >
            <Ionicons name="trash-outline" size={18} color="#ff4d4f" />
          </Pressable>
        )}

        <Ionicons name="share-social-outline" size={18} color="#888" style={{ marginLeft: 'auto' }} />
      </View>
    </View>
  );
};


export default function QuestionDetail() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const borderColor = useThemeColor({}, 'border');
  const backgroundColor = useThemeColor({}, 'background');
  const textColor = useThemeColor({}, 'text');
  const queryClient = useQueryClient();
  const [sortBy, setSortBy] = useState<'default' | 'created'>('default');


  // 动画相关
  const scrollY = useRef(new Animated.Value(0)).current;
  const lastScrollY = useRef(0);
  const headerVisible = useRef(new Animated.Value(0)).current;
  const isHeaderShowRef = useRef(false); // 使用 ref 避免频繁触发 re-render

  const handleScroll = (event: any) => {
    const currentY = event.nativeEvent.contentOffset.y;
    const diff = currentY - lastScrollY.current;

    // 联动滚动逻辑
    if (currentY > 400) {
      if (diff < -15) { // 较大幅度向上滑才触发显示
        if (!isHeaderShowRef.current) {
          isHeaderShowRef.current = true;
          Animated.timing(headerVisible, {
            toValue: 1,
            duration: 250,
            useNativeDriver: true,
          }).start();
        }
      } else if (diff > 5) { // 向下滑即隐藏
        if (isHeaderShowRef.current) {
          isHeaderShowRef.current = false;
          Animated.timing(headerVisible, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          }).start();
        }
      }
    } else if (currentY <= 100) {
      // 回到顶部区域强制隐藏
      if (isHeaderShowRef.current) {
        isHeaderShowRef.current = false;
        Animated.timing(headerVisible, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }).start();
      }
    }

    lastScrollY.current = currentY;
    scrollY.setValue(currentY);
  };

  // 1. 获取问题详情
  const { data: question, isLoading: qLoading } = useQuery({
    queryKey: ['question', id],
    queryFn: async () => {
      try {
        const res = await client.get(`/questions/${id}?include=${QUESTION_INCLUDE}`);
        return res.data || null;
      } catch (err) {
        console.error('获取问题详情失败:', err);
        return null;
      }
    }
  });

  // 关注/取关问题的 Mutation
  const followMutation = useMutation({
    mutationFn: async () => {
      if (question?.relationship?.is_following) {
        return unfollowQuestion(id as string);
      } else {
        return followQuestion(id as string);
      }
    },
    onMutate: async () => {
      // 乐观更新
      await queryClient.cancelQueries({ queryKey: ['question', id] });
      const previousQuestion = queryClient.getQueryData(['question', id]);

      queryClient.setQueryData(['question', id], (old: any) => ({
        ...old,
        relationship: {
          ...old?.relationship,
          is_following: !old?.relationship?.is_following,
        },
        follower_count: old?.relationship?.is_following
          ? ((old?.follower_count || 1) - 1)
          : ((old?.follower_count || 0) + 1)
      }));

      return { previousQuestion };
    },
    onError: (err, variables, context) => {
      if (context?.previousQuestion) {
        queryClient.setQueryData(['question', id], context.previousQuestion);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['question', id] });
    },
  });

  // 2. 获取回答列表 (Infinite Query)
  const {
    data: answersData,
    isLoading: aLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
    isRefetching
  } = useInfiniteQuery({
    queryKey: ['question-answers', id, sortBy],
    queryFn: async ({ pageParam = 0 }) => {
      try {
        const include = 'data[*].content,voteup_count,comment_count,author.name,author.avatar_url,author.headline,author.is_following,relationship.voting,relationship.is_author,created_time';
        const url = `/questions/${id}/answers?include=${include}&limit=20&offset=${pageParam}&sort_by=${sortBy}`;
        const res = await client.get(url);
        return res.data;
      } catch (err) {
        console.error('获取回答列表失败:', err);
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

  const answers = answersData?.pages.flatMap(page => page.data) || [];

  if (qLoading || aLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0084ff" />
      </View>
    );
  }

  return (
    <View type="default" style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* 1. 浮动手动 Header */}
      <Animated.View
        style={[
          styles.stickyHeader,
          {
            backgroundColor,
            paddingTop: insets.top,
            opacity: headerVisible,
            transform: [{
              translateY: headerVisible.interpolate({
                inputRange: [0, 1],
                outputRange: [-insets.top - 50, 0]
              })
            }],
            zIndex: 10,
          }
        ]}
      >
        <View style={styles.stickyHeaderContent}>
          <View style={{ width: 40 }} />
          <Text style={styles.stickyTitle} numberOfLines={1}>
            {question?.title}
          </Text>
          <View style={{ width: 40 }} />
        </View>
      </Animated.View>

      {/* 2. 始终显示的返回按钮 (层级最高) */}
      <Pressable
        onPress={() => router.back()}
        style={[styles.floatingBackBtn, { top: insets.top + 8 }]}
      >
        <Ionicons name="chevron-back" size={28} color={textColor} />
      </Pressable>

      <FlashList
        onScroll={handleScroll}
        data={answers || []}
        {...({ estimatedItemSize: 200 } as any)}
        ListHeaderComponent={
          <View type="surface" style={[styles.header, { paddingTop: insets.top + 50 }]}>
            {/* 话题标签 */}
            {question?.topics && question.topics.length > 0 && (
              <View style={styles.topicsRow}>
                {question.topics.map((topic: any) => (
                  <View key={topic.id} style={styles.topicBadge}>
                    <Text style={styles.topicText}>{topic.name}</Text>
                  </View>
                ))}
              </View>
            )}

            <Text style={styles.title}>{question?.title || '加载失败'}</Text>

            {question?.excerpt ? (
              <Text type="secondary" style={styles.qExcerpt}>
                {question.excerpt.replace(/<[^>]+>/g, '')}
              </Text>
            ) : null}

            {/* 关注与浏览人数 */}
            <View style={styles.qMetaRow}>
              <Text type="secondary" style={styles.qMetaText}>
                {question?.follower_count || 0} 关注 · {question?.visit_count || 0} 浏览
              </Text>
            </View>

            {/* 交互按钮 */}
            <View style={styles.qActionRow}>
              <Pressable
                style={[
                  styles.qActionBtn,
                  question?.relationship?.is_following && styles.qActionBtnActive
                ]}
                onPress={() => followMutation.mutate()}
                disabled={followMutation.isPending}
              >
                <Ionicons
                  name={question?.relationship?.is_following ? "checkmark" : "add"}
                  size={18}
                  color={question?.relationship?.is_following ? "#888" : "#0084ff"}
                />
                <Text style={[
                  styles.qActionBtnText,
                  question?.relationship?.is_following && styles.qActionBtnTextActive
                ]}>
                  {question?.relationship?.is_following ? '已关注' : '关注问题'}
                </Text>
              </Pressable>

              <Pressable
                style={styles.qActionBtn}
                onPress={() => router.push(`/comments/${id}?type=question`)}
              >
                <Ionicons name="chatbubble-outline" size={18} color="#0084ff" />
                <Text style={styles.qActionBtnText}>
                  {question?.comment_count || 0} 条评论
                </Text>
              </Pressable>

              <Pressable
                style={styles.qActionBtn}
                onPress={() => router.push(`/question/write/${id}`)}
              >
                <Ionicons name="create-outline" size={18} color="#0084ff" />
                <Text style={styles.qActionBtnText}>写回答</Text>
              </Pressable>

            </View>

            <View style={[styles.qStats]}>
              <Text style={styles.qStatText}>
                {question?.answer_count || 0} 个回答
              </Text>

              <View style={styles.sortContainer}>
                <Pressable
                  onPress={() => setSortBy('default')}
                  style={[styles.sortBtn, sortBy === 'default' && styles.sortBtnActive]}
                >
                  <Text style={[styles.sortText, sortBy === 'default' && styles.sortTextActive]}>默认</Text>
                </Pressable>
                <Pressable
                  onPress={() => setSortBy('created')}
                  style={[styles.sortBtn, sortBy === 'created' && styles.sortBtnActive]}
                >
                  <Text style={[styles.sortText, sortBy === 'created' && styles.sortTextActive]}>时间</Text>
                </Pressable>
              </View>
            </View>
          </View>
        }
        renderItem={({ item }: { item: any }) => <AnswerItem item={item} />}
        keyExtractor={(item: any) => item.id.toString()}
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) {
            fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          isFetchingNextPage ? (
            <ActivityIndicator style={{ marginVertical: 20 }} color="#0084ff" />
          ) : (
            answers.length > 0 && !hasNextPage ? (
              <Text type="secondary" style={{ textAlign: 'center', marginVertical: 20, fontSize: 13 }}>
                — 没有更多回答了 —
              </Text>
            ) : null
          )
        }
        onRefresh={refetch}
        refreshing={isRefetching}
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
  qStats: { marginTop: 15, paddingTop: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  qStatText: { color: '#888', fontWeight: '500' },
  sortContainer: { flexDirection: 'row', alignItems: 'center' },
  sortBtn: { marginLeft: 15, paddingVertical: 2, paddingHorizontal: 4 },
  sortBtnActive: { borderBottomWidth: 2, borderBottomColor: '#0084ff' },
  sortText: { fontSize: 13, color: '#888' },
  sortTextActive: { color: '#0084ff', fontWeight: 'bold' },
  // 新增样式
  topicsRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 },
  topicBadge: { backgroundColor: 'rgba(0,132,255,0.1)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 15, marginRight: 8, marginBottom: 5 },
  topicText: { color: '#0084ff', fontSize: 12 },
  qMetaRow: { marginTop: 12 },
  qMetaText: { fontSize: 13 },
  qActionRow: { flexDirection: 'row', marginTop: 15, gap: 10 },
  qActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,132,255,0.05)',
    paddingVertical: 8,
    borderRadius: 6
  },
  qActionBtnActive: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#eee' },
  qActionBtnText: { color: '#0084ff', fontSize: 14, fontWeight: '500', marginLeft: 4 },
  qActionBtnTextActive: { color: '#888' },
  // 回答卡片
  card: { padding: 15, marginBottom: 6, },
  authorRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  avatar: { width: 34, height: 34, borderRadius: 17 },
  authorInfo: { flex: 1, marginLeft: 10 },
  authorName: { fontSize: 15, fontWeight: 'bold' },
  authorHeadline: { fontSize: 12, marginTop: 2 },
  followBtn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 15, backgroundColor: 'rgba(0,132,255,0.08)' },
  followBtnActive: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#eee' },
  followText: { color: '#0084ff', fontSize: 13, fontWeight: 'bold' },
  followTextActive: { color: '#999' },
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
  deleteBtn: { marginLeft: 20, padding: 5 },
  // 动效 Header 样式
  stickyHeader: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  stickyHeaderContent: {
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
  },
  stickyTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  floatingBackBtn: {
    position: 'absolute',
    left: 10,
    zIndex: 100,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
});