import { getAnswer } from '@/api/zhihu';
import { LikeButton } from '@/components/LikeButton';
import { Text, View, useThemeColor } from '@/components/Themed';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import { Animated, Image, Pressable, ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import RenderHtml from 'react-native-render-html';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function AnswerDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const navigation = useNavigation();

  useEffect(() => {
    navigation.setOptions({ title: '回答' });
  }, [navigation]);
  const { width } = useWindowDimensions();
  const scrollY = useRef(new Animated.Value(0)).current;

  const textColor = useThemeColor({}, 'text');
  const borderColor = useThemeColor({}, 'border');
  const surfaceColor = useThemeColor({}, 'surface');
  // const subTextColor = useThemeColor({}, 'textSecondary');

  // 1. 扩充 API 请求：一次性拿齐问题标题、作者详情、回答内容
  const { data: answer, isLoading } = useQuery({
    queryKey: ['answer-detail', id],
    queryFn: () => getAnswer(id as string)
  });

  if (isLoading) return (
    <View style={styles.center}>
      <Text type="secondary">正在斟酌文字...喵</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.container}>
        {/* 顶部：所属问题导流槽 */}
        <Pressable
          style={[styles.questionHeader, { borderBottomColor: borderColor }]}
          onPress={() => router.push(`/question/${answer?.question?.id}`)}
        >
          <Text style={styles.questionTitle} numberOfLines={2}>
            {answer?.question?.title}
          </Text>
          <Ionicons name="chevron-forward" size={16} color="#999" />
        </Pressable>

        <ScrollView
          scrollEventThrottle={16}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: scrollY } } }],
            { useNativeDriver: false }
          )}
        >
          {/* 作者信息栏 */}
          <View style={[styles.authorSection, { backgroundColor: 'transparent' }]}>
            <Pressable onPress={() => router.push(`/user/${answer?.author?.id}`)} style={styles.authorMain}>
              <Image source={{ uri: answer?.author?.avatar_url }} style={styles.avatar} />
              <View style={styles.authorInfo}>
                <Text style={styles.authorName}>{answer?.author?.name}</Text>
                <Text type="secondary" style={styles.authorHeadline} numberOfLines={1}>{answer?.author?.headline}</Text>
              </View>
            </Pressable>
            <Pressable style={styles.followBtn}>
              <Text style={styles.followBtnText}>关注</Text>
            </Pressable>
          </View>

          {/* 回答正文 */}
          <View style={[styles.contentBody, { backgroundColor: 'transparent' }]}>
            <RenderHtml
              contentWidth={width - 40}
              source={{ html: answer?.content || '' }}
              tagsStyles={{
                p: { color: textColor, fontSize: 18, lineHeight: 28, marginBottom: 20 },
                b: { color: '#0084ff', fontWeight: 'bold' },
                img: { borderRadius: 12, marginVertical: 10 },
                blockquote: {
                  borderLeftWidth: 4,
                  borderLeftColor: '#0084ff',
                  paddingLeft: 15,
                  backgroundColor: surfaceColor,
                  paddingVertical: 10,
                  color: textColor
                },
                span: { color: textColor },
                div: { color: textColor },
                h1: { color: textColor },
                h2: { color: textColor },
                h3: { color: textColor },
              }}
            />

            <Text type="secondary" style={styles.publishDate}>发布于 {answer?.created_time_name || '不久前'} · 著作权归作者所有</Text>
          </View>

          <View style={{ height: 120, backgroundColor: 'transparent' }} />
        </ScrollView>

        {/* 底部吸底交互栏 - 核心灵魂 */}
        <View type="surface" style={[styles.footer, { borderTopColor: borderColor }]}>
          <View style={[styles.voteBox, { backgroundColor: 'transparent' }]}>
            <LikeButton
              id={answer?.id}
              count={answer?.voteup_count || 0}
              voted={answer?.relationship?.voting}
            />
            <View style={[styles.downvote, { backgroundColor: borderColor }]}>
              <Ionicons name="caret-down" size={20} color="#0084ff" />
            </View>
          </View>

          <View style={[styles.footerRight, { backgroundColor: 'transparent' }]}>
            <Pressable style={styles.footerAction} onPress={() => router.push(`/comments/${id}`)}>
              <Ionicons name="chatbubble-outline" size={22} color="#888" />
              <Text type="secondary" style={styles.actionCount}>{answer?.comment_count}</Text>
            </Pressable>

            <Pressable style={styles.footerAction}>
              <Ionicons name="star-outline" size={22} color="#888" />
            </Pressable>

            <Pressable style={styles.footerAction}>
              <Ionicons name="share-social-outline" size={22} color="#888" />
            </Pressable>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  // 问题导流头
  questionHeader: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 0.5,
    zIndex: 10,
  },
  questionTitle: { fontSize: 16, fontWeight: 'bold', flex: 1, marginRight: 10 },
  // 作者栏
  authorSection: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    justifyContent: 'space-between'
  },
  authorMain: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  authorInfo: { marginLeft: 12, flex: 1 },
  authorName: { fontSize: 16, fontWeight: 'bold' },
  authorHeadline: { fontSize: 12, color: '#999', marginTop: 2 },
  followBtn: {
    backgroundColor: '#0084ff15',
    paddingHorizontal: 15,
    paddingVertical: 6,
    borderRadius: 4
  },
  followBtnText: { color: '#0084ff', fontWeight: 'bold', fontSize: 14 },
  // 内容
  contentBody: { paddingHorizontal: 20 },
  publishDate: { color: '#bbb', fontSize: 13, marginTop: 30, fontStyle: 'italic' },
  // 吸底工具栏
  footer: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    height: 84, // 增加高度以容纳安全区域
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingBottom: 24,
    borderTopWidth: 0.5,
    elevation: 10,
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  voteBox: { flexDirection: 'row', alignItems: 'center' },
  downvote: {
    width: 36,
    height: 36,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 4
  },
  footerRight: { flex: 1, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center' },
  footerAction: {
    alignItems: 'center',
    marginLeft: 20,
    flexDirection: 'row'
  },
  actionCount: { marginLeft: 4, color: '#888', fontSize: 12 }
});