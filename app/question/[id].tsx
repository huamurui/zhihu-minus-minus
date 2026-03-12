import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useRef, useState, useCallback, useMemo, useEffect, forwardRef, useImperativeHandle } from 'react';
import { ActivityIndicator, Animated, Image, LayoutAnimation, Pressable, StyleSheet, useWindowDimensions, useColorScheme, View as NativeView } from 'react-native';
import Reanimated, { SharedTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';

import client from '@/api/client';
import { deleteAnswer } from '@/api/zhihu/answer';
import { followMember, unfollowMember } from '@/api/zhihu/member';
import { followQuestion, getQuestion, QUESTION_INCLUDE, unfollowQuestion } from '@/api/zhihu/question';
import { LikeButton } from '@/components/LikeButton';
import { Text, View, useThemeColor } from '@/components/Themed';
import { Alert } from 'react-native';
import { ZhihuContent } from '@/components/ZhihuContent';

// 使用 forwardRef 让父组件能直接测量 footer 位置
const AnswerItem = forwardRef(({ 
  item, 
  isExpanded, 
  onToggle 
}: { 
  item: any, 
  isExpanded: boolean, 
  onToggle: (id: string, expanded: boolean) => void 
}, ref) => {
  const { width } = useWindowDimensions();
  const router = useRouter();
  const textColor = useThemeColor({}, 'text');
  const queryClient = useQueryClient();
  const footerRef = useRef<NativeView>(null);

  // 暴露测量方法给父组件
  useImperativeHandle(ref, () => ({
    measureFooter: (cb: any) => {
      footerRef.current?.measureInWindow(cb);
    },
    id: item.id.toString()
  }));

  const rawText = item.content?.replace(/<[^>]+>/g, '') || '';
  const isLongContent = rawText.length > 120;
  const excerpt = isLongContent ? rawText.substring(0, 100) + '...' : rawText;

  const followMutation = useMutation({
    mutationFn: async () => {
      const pid = item.author.url_token || item.author.id;
      if (item.author?.is_following) return unfollowMember(pid);
      return followMember(pid);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['question-answers'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteAnswer(item.id),
    onSuccess: () => {
      Alert.alert('删除成功', '你的回答已删除喵！');
      queryClient.invalidateQueries({ queryKey: ['question-answers'] });
    }
  });

  const handleDelete = () => {
    Alert.alert('确认删除', '确定要删除这个回答吗？', [
      { text: '取消', style: 'cancel' },
      { text: '确认删除', style: 'destructive', onPress: () => deleteMutation.mutate() }
    ]);
  };

  return (
    <View type="surface" style={styles.card}>
      <View style={styles.authorRow}>
        <Pressable onPress={() => item.author?.url_token && router.push(`/user/${item.author.url_token}`)} style={{ flexDirection: 'row', flex: 1, alignItems: 'center' }}>
          <Image source={{ uri: item.author?.avatar_url }} style={styles.avatar} />
          <View style={styles.authorInfo} >
            <Text style={styles.authorName}>{item.author?.name}</Text>
            <Text type="secondary" style={styles.authorHeadline} numberOfLines={1}>{item.author?.headline}</Text>
          </View>
        </Pressable>
        {!item.relationship?.is_author && (
          <Pressable style={[styles.followBtn, item.author?.is_following && styles.followBtnActive]} onPress={() => followMutation.mutate()}>
            <Text style={[styles.followText, item.author?.is_following && styles.followTextActive]}>
              {item.author?.is_following ? '已关注' : '+ 关注'}
            </Text>
          </Pressable>
        )}
      </View>

      <View style={styles.contentContainer}>
        {isExpanded ? (
          <View style={{ flex: 1, backgroundColor: 'transparent' }}>
            <ZhihuContent objectId={item.id} type="answer" content={item.content} segmentInfos={item.segment_infos} />
            {isLongContent && (
              <Pressable onPress={() => onToggle(item.id.toString(), false)} style={styles.collapseBtn}>
                <Text style={styles.collapseText}>收起回答</Text><Ionicons name="chevron-up" size={14} color="#0084ff" />
              </Pressable>
            )}
          </View>
        ) : (
          <Pressable onPress={() => onToggle(item.id.toString(), true)} style={{ flexDirection: 'row', flex: 1 }}>
            <Text style={[styles.excerpt, { color: textColor }]}>
              {excerpt}{isLongContent && <Text style={styles.expandLabel}> 阅读全文</Text>}
            </Text>
            {(item.thumbnail || item.content_img?.length > 0) ? (
              <Image source={{ uri: item.thumbnail || item.content_img[0] }} style={styles.contentImage} resizeMode="cover" />
            ) : null}
          </Pressable>
        )}
      </View>

      {/* 使用 NativeView 确保 ref measure 可用 */}
      <NativeView ref={footerRef} style={[styles.footer, { borderTopWidth: 0.5, borderTopColor: '#eee', paddingHorizontal: 4 }]}>
        <View style={styles.voteGroup}>
          <LikeButton id={item.id} count={item.voteup_count} voted={item.relationship?.voting} type="answers" variant="minimal" />
        </View>
        <Pressable style={styles.commentBtn} onPress={() => router.push({ pathname: '/comments/[id]', params: { id: item.id, type: 'answer', count: item.comment_count } } as any)}>
          <Ionicons name="chatbubble-outline" size={18} color="#888" /><Text type="secondary" style={styles.commentCount}>{item.comment_count}</Text>
        </Pressable>
        {item.relationship?.is_author && (
          <Pressable style={styles.deleteBtn} onPress={handleDelete}><Ionicons name="trash-outline" size={18} color="#ff4d4f" /></Pressable>
        )}
        <Ionicons name="share-social-outline" size={18} color="#888" style={{ marginLeft: 'auto' }} />
      </NativeView>
    </View>
  );
});

const slowTransition = SharedTransition.duration(600);

export default function QuestionDetail() {
  const { id, title: initialTitle } = useLocalSearchParams<{ id: string, title?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const backgroundColor = useThemeColor({}, 'background');
  const textColor = useThemeColor({}, 'text');
  const queryClient = useQueryClient();
  const colorScheme = useColorScheme();
  const { height: screenHeight } = useWindowDimensions();

  const [sortBy, setSortBy] = useState<'default' | 'created'>('default');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [activeItem, setActiveItem] = useState<any>(null);

  // 动画状态
  const footerAnim = useRef(new Animated.Value(0)).current;
  const headerVisible = useRef(new Animated.Value(0)).current;
  const isHeaderShowRef = useRef(false);
  const isFloatingShown = useRef(false);
  
  // 核心：存储所有可见 AnswerItem 的实例引用
  const itemRefs = useRef(new Map<string, any>());
  const viewableIdsRef = useRef<string[]>([]);

  const toggleExpand = useCallback((id: string, expanded: boolean) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (expanded) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 20 }).current;

  const onViewableItemsChanged = useCallback(({ viewableItems }: any) => {
    viewableIdsRef.current = viewableItems.map((v: any) => v.item.id.toString());
    // 更新当前主导回答
    const candidate = viewableItems[0]?.item;
    if (candidate && candidate.id !== activeItem?.id) {
       setActiveItem(candidate);
    }
  }, [activeItem]);

  // 每 150ms 检查一次 footer 可见性，确保性能
  const lastCheckTime = useRef(0);

  const handleScroll = (event: any) => {
    const currentY = event.nativeEvent.contentOffset.y;
    const now = Date.now();

    // 1. 系统标题栏逻辑 (原有的滑出显示，滑进隐藏)
    if (currentY > 400) {
      const diff = currentY - (event.lastY || 0);
      if (diff < -15 && !isHeaderShowRef.current) {
        isHeaderShowRef.current = true;
        Animated.timing(headerVisible, { toValue: 1, duration: 250, useNativeDriver: true }).start();
      } else if (diff > 5 && isHeaderShowRef.current) {
        isHeaderShowRef.current = false;
        Animated.timing(headerVisible, { toValue: 0, duration: 200, useNativeDriver: true }).start();
      }
    } else if (currentY <= 100 && isHeaderShowRef.current) {
      isHeaderShowRef.current = false;
      Animated.timing(headerVisible, { toValue: 0, duration: 200, useNativeDriver: true }).start();
    }
    event.lastY = currentY;

    // 2. 悬浮工具栏探测逻辑 (真空探测)
    if (now - lastCheckTime.current > 100) {
      lastCheckTime.current = now;
      
      const currentViewableIds = viewableIdsRef.current;
      let anyFooterVisible = false;
      const promises: Promise<boolean>[] = [];

      currentViewableIds.forEach(id => {
        const ref = itemRefs.current.get(id);
        if (ref) {
          promises.push(new Promise(resolve => {
            ref.measureFooter((x: number, y: number, w: number, h: number) => {
              // 判定逻辑：footer 的 y 坐标是否在可视窗口内 [insets.top, screenHeight - insets.bottom]
              const isVisible = y > (insets.top + 40) && y < (screenHeight - 40);
              resolve(isVisible);
            });
          }));
        }
      });

      Promise.all(promises).then(results => {
        anyFooterVisible = results.some(r => r === true);
        
        // 判定条件：
        // A. 屏幕内没有任何 footer 
        // B. 且当前主导回答是展开状态
        // C. 且已经滑出卷首一定距离
        const shouldShow = !anyFooterVisible && 
                           activeItem && 
                           expandedIds.has(activeItem.id.toString()) && 
                           currentY > 300;

        if (shouldShow !== isFloatingShown.current) {
          isFloatingShown.current = shouldShow;
          Animated.spring(footerAnim, { 
            toValue: shouldShow ? 1 : 0, 
            useNativeDriver: true, 
            friction: 10, 
            tension: 50 
          }).start();
        }
      });
    }
  };

  const { data: question, isLoading: qLoading } = useQuery({
    queryKey: ['question', id],
    queryFn: async () => await getQuestion(id as string)
  });

  const followMutation = useMutation({
    mutationFn: async () => {
      if (question?.relationship?.is_following) return unfollowQuestion(id as string);
      return followQuestion(id as string);
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['question', id] });
      const previous = queryClient.getQueryData(['question', id]);
      queryClient.setQueryData(['question', id], (old: any) => ({
        ...old,
        relationship: { ...old?.relationship, is_following: !old?.relationship?.is_following },
        follower_count: old?.relationship?.is_following ? (old.follower_count - 1) : (old.follower_count + 1)
      }));
      return { previous };
    },
    onError: (err, variables, context) => context?.previous && queryClient.setQueryData(['question', id], context.previous),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['question', id] }),
  });

  const { data: answersData, isLoading: aLoading, fetchNextPage, hasNextPage, isFetchingNextPage, refetch, isRefetching } = useInfiniteQuery({
    queryKey: ['question-answers', id, sortBy],
    queryFn: async ({ pageParam = 0 }) => {
      const include = 'data[*].content,voteup_count,comment_count,author.name,author.avatar_url,author.headline,author.is_following,relationship.voting,relationship.is_author,created_time,segment_infos';
      const res = await client.get(`/questions/${id}/answers?include=${include}&limit=20&offset=${pageParam}&sort_by=${sortBy}`);
      return res.data;
    },
    initialPageParam: 0,
    getNextPageParam: (last) => {
      if (!last || last.paging?.is_end) return undefined;
      const match = last.paging?.next?.match(/offset=(\d+)/);
      return match ? parseInt(match[1]) : undefined;
    }
  });

  const answers = useMemo(() => answersData?.pages.flatMap(p => p.data) || [], [answersData]);

  const renderHeader = useMemo(() => (
    <View type="surface" style={[styles.header, { paddingTop: insets.top + 50 }]}>
      <Reanimated.View sharedTransitionTag={`title-${id}`} sharedTransitionStyle={slowTransition}>
        <Text style={styles.title}>{question?.title || initialTitle || '加载中...'}</Text>
      </Reanimated.View>
      {qLoading ? (
        <View style={{ height: 100, justifyContent: 'center' }}><ActivityIndicator size="small" color="#0084ff" /></View>
      ) : (
        <>
          {question?.topics && <View style={styles.topicsRow}>{question.topics.map((t: any) => <View key={t.id} style={styles.topicBadge}><Text style={styles.topicText}>{t.name}</Text></View>)}</View>}
          {question?.excerpt && <Text type="secondary" style={styles.qExcerpt}>{question.excerpt.replace(/<[^>]+>/g, '')}</Text>}
          <View style={styles.qMetaRow}><Text type="secondary" style={styles.qMetaText}>{question?.follower_count || 0} 关注 · {question?.visit_count || 0} 浏览</Text></View>
          <View style={styles.qActionRow}>
            <Pressable style={[styles.qActionBtn, question?.relationship?.is_following && styles.qActionBtnActive]} onPress={() => followMutation.mutate()}><Text style={[styles.qActionBtnText, question?.relationship?.is_following && styles.qActionBtnTextActive]}>{question?.relationship?.is_following ? '已关注' : '关注问题'}</Text></Pressable>
            <Pressable style={styles.qActionBtn} onPress={() => router.push({ pathname: '/comments/[id]', params: { id, type: 'question', count: question?.comment_count || 0 } } as any)}><Text style={styles.qActionBtnText}>{question?.comment_count || 0} 条评论</Text></Pressable>
            <Pressable style={styles.qActionBtn} onPress={() => router.push(`/question/write/${id}`)}><Text style={styles.qActionBtnText}>写回答</Text></Pressable>
          </View>
          <View style={styles.qStats}>
            <Text style={styles.qStatText}>{question?.answer_count || 0} 个回答</Text>
            <View style={styles.sortContainer}>
              <Pressable onPress={() => setSortBy('default')} style={[styles.sortBtn, sortBy === 'default' && styles.sortBtnActive]}><Text style={[styles.sortText, sortBy === 'default' && styles.sortTextActive]}>默认</Text></Pressable>
              <Pressable onPress={() => setSortBy('created')} style={[styles.sortBtn, sortBy === 'created' && styles.sortBtnActive]}><Text style={[styles.sortText, sortBy === 'created' && styles.sortTextActive]}>时间</Text></Pressable>
            </View>
          </View>
        </>
      )}
    </View>
  ), [qLoading, question, id, initialTitle, insets.top, sortBy, followMutation.isPending]);

  return (
    <View type="default" style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      
      {/* 顶部标题栏 */}
      <Animated.View style={[styles.stickyHeader, { backgroundColor, paddingTop: insets.top, opacity: headerVisible, transform: [{ translateY: headerVisible.interpolate({ inputRange: [0, 1], outputRange: [-insets.top - 50, 0] }) }], zIndex: 10 }]}>
        <View style={styles.stickyHeaderContent}><Text style={styles.stickyTitle} numberOfLines={1}>{question?.title || initialTitle}</Text></View>
      </Animated.View>
      
      {/* 返回按钮 */}
      <Pressable onPress={() => router.back()} style={[styles.floatingBackBtn, { top: insets.top + 8 }]}><Ionicons name="chevron-back" size={28} color={textColor} /></Pressable>
      
      <FlashList
        onScroll={handleScroll}
        data={qLoading ? [] : answers}
        estimatedItemSize={250}
        ListHeaderComponent={renderHeader}
        renderItem={({ item }) => (
          <AnswerItem 
            ref={(r) => {
              if (r) itemRefs.current.set(item.id.toString(), r);
              else itemRefs.current.delete(item.id.toString());
            }}
            item={item} 
            isExpanded={expandedIds.has(item.id.toString())} 
            onToggle={toggleExpand} 
          />
        )}
        keyExtractor={(item: any) => item.id.toString()}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        onEndReached={() => hasNextPage && !isFetchingNextPage && fetchNextPage()}
        onEndReachedThreshold={0.5}
        ListFooterComponent={() => isFetchingNextPage ? <ActivityIndicator style={{ marginVertical: 20 }} color="#0084ff" /> : (answers.length > 0 && !hasNextPage ? <Text type="secondary" style={{ textAlign: 'center', marginVertical: 20 }}>— 没有更多回答了 —</Text> : null)}
        onRefresh={refetch}
        refreshing={isRefetching}
      />

      {/* 悬浮交互条 */}
      <Animated.View style={[styles.floatingFooter, { bottom: insets.bottom + 15, transform: [{ translateY: footerAnim.interpolate({ inputRange: [0, 1], outputRange: [100, 0] }) }], opacity: footerAnim }]}>
        <BlurView intensity={95} tint={colorScheme === 'dark' ? 'dark' : 'light'} style={styles.blurContainer}>
           <View style={styles.floatingInner}>
              <View style={styles.floatLeft}>
                 <LikeButton id={activeItem?.id} count={activeItem?.voteup_count || 0} voted={activeItem?.relationship?.voting} type="answers" variant="ghost" />
                 <Pressable style={styles.floatComment} onPress={() => router.push({ pathname: '/comments/[id]', params: { id: activeItem?.id, type: 'answer', count: activeItem?.comment_count } } as any)}>
                    <Ionicons name="chatbubble-outline" size={20} color="#0084ff" /><Text style={styles.floatStatText}>{activeItem?.comment_count || 0}</Text>
                 </Pressable>
              </View>
              <View style={styles.floatDivider} />
              <Pressable style={styles.floatCollapse} onPress={() => activeItem && toggleExpand(activeItem.id.toString(), false)}>
                <Text style={styles.collapseHint}>收起回答</Text><Ionicons name="chevron-up" size={16} color="#0084ff" />
              </Pressable>
           </View>
        </BlurView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
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
  topicsRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 },
  topicBadge: { backgroundColor: 'rgba(0,132,255,0.1)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 15, marginRight: 8, marginBottom: 5 },
  topicText: { color: '#0084ff', fontSize: 12 },
  qMetaRow: { marginTop: 12 },
  qMetaText: { fontSize: 13 },
  qActionRow: { flexDirection: 'row', marginTop: 15, gap: 10 },
  qActionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,132,255,0.05)', paddingVertical: 8, borderRadius: 6 },
  qActionBtnActive: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#eee' },
  qActionBtnText: { color: '#0084ff', fontSize: 14, fontWeight: '500' },
  qActionBtnTextActive: { color: '#888' },
  card: { padding: 15, marginBottom: 6 },
  authorRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  avatar: { width: 34, height: 34, borderRadius: 17 },
  authorInfo: { flex: 1, marginLeft: 10 },
  authorName: { fontSize: 15, fontWeight: 'bold' },
  authorHeadline: { fontSize: 12, marginTop: 2 },
  followBtn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 15, backgroundColor: 'rgba(0,132,255,0.08)' },
  followBtnActive: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#eee' },
  followText: { color: '#0084ff', fontSize: 13, fontWeight: 'bold' },
  followTextActive: { color: '#999' },
  contentContainer: { marginVertical: 5 },
  excerpt: { fontSize: 15, lineHeight: 24, flex: 1 },
  expandLabel: { color: '#0084ff', fontWeight: '500' },
  contentImage: { width: 80, height: 60, borderRadius: 4, marginLeft: 12 },
  collapseBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, marginTop: 5 },
  collapseText: { color: '#0084ff', fontSize: 13, fontWeight: 'bold', marginRight: 4 },
  footer: { flexDirection: 'row', alignItems: 'center', marginTop: 12, paddingTop: 10 },
  voteGroup: { flexDirection: 'row', alignItems: 'center' },
  commentBtn: { flexDirection: 'row', alignItems: 'center', marginLeft: 25 },
  commentCount: { marginLeft: 5, fontSize: 13, color: '#888' },
  deleteBtn: { marginLeft: 20, padding: 5 },
  stickyHeader: { position: 'absolute', left: 0, right: 0 },
  stickyHeaderContent: { height: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 15 },
  stickyTitle: { flex: 1, fontSize: 16, fontWeight: 'bold', textAlign: 'center' },
  floatingBackBtn: { position: 'absolute', left: 10, zIndex: 100, width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  floatingFooter: { position: 'absolute', left: 20, right: 20, height: 54, borderRadius: 27, overflow: 'hidden', zIndex: 1000, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 10, elevation: 10 },
  blurContainer: { flex: 1 },
  floatingInner: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, justifyContent: 'space-between' },
  floatLeft: { flexDirection: 'row', alignItems: 'center' },
  floatComment: { flexDirection: 'row', alignItems: 'center', marginLeft: 20 },
  floatStatText: { marginLeft: 6, color: '#0084ff', fontWeight: '600', fontSize: 14 },
  floatDivider: { width: 1, height: 20, backgroundColor: 'rgba(0,132,255,0.1)', marginHorizontal: 10 },
  floatCollapse: { flexDirection: 'row', alignItems: 'center' },
  collapseHint: { color: '#0084ff', fontSize: 14, fontWeight: 'bold', marginRight: 4 }
});