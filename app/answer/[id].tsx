import { getAnswer } from '@/api/zhihu';
import { LikeButton } from '@/components/LikeButton';
import { Text, View, useThemeColor } from '@/components/Themed';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useRef } from 'react';
import { ActivityIndicator, Animated, Image, Pressable, ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import RenderHtml from 'react-native-render-html';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function AnswerDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const textColor = useThemeColor({}, 'text');
  const borderColor = useThemeColor({}, 'border');
  const surfaceColor = useThemeColor({}, 'surface');
  const backgroundColor = useThemeColor({}, 'background');

  // 动画相关
  const scrollY = useRef(new Animated.Value(0)).current;
  const lastScrollY = useRef(0);
  const headerVisible = useRef(new Animated.Value(0)).current;
  const isHeaderShowRef = useRef(false);

  const handleScroll = (event: any) => {
    const currentY = event.nativeEvent.contentOffset.y;
    const diff = currentY - lastScrollY.current;

    // 联动滚动逻辑：向下滚动超过300且向上滑时显示，下滑时隐藏
    if (currentY > 300) {
      if (diff < -15) { // 向上滑
        if (!isHeaderShowRef.current) {
          isHeaderShowRef.current = true;
          Animated.timing(headerVisible, {
            toValue: 1,
            duration: 250,
            useNativeDriver: true,
          }).start();
        }
      } else if (diff > 5) { // 向下滑
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

  const { data: answer, isLoading } = useQuery({
    queryKey: ['answer-detail', id],
    queryFn: () => getAnswer(id as string)
  });

  if (isLoading) return (
    <View type="default" style={styles.center}>
      <ActivityIndicator size="large" color="#0084ff" />
      <Text type="secondary" style={{ marginTop: 10 }}>正在斟酌文字...喵</Text>
    </View>
  );

  return (
    <View type="default" style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* 1. 动效 Header */}
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
          <View style={styles.stickyAuthor}>
            <Image source={{ uri: answer?.author?.avatar_url }} style={styles.stickyAvatar} />
            <Text style={styles.stickyName} numberOfLines={1}>{answer?.author?.name}</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>
      </Animated.View>

      {/* 2. 悬浮返回按钮 */}
      <Pressable
        onPress={() => router.back()}
        style={[styles.floatingBackBtn, { top: insets.top + 8 }]}
      >
        <Ionicons name="chevron-back" size={28} color={textColor} />
      </Pressable>

      <ScrollView
        style={styles.container}
        scrollEventThrottle={16}
        onScroll={handleScroll}
        contentContainerStyle={{ paddingBottom: 100 + insets.bottom }}
      >
        {/* 占位，让内容在返回按钮下方 */}
        <View style={{ height: insets.top + 45 }} />

        {/* 顶部问题连接 */}
        <Pressable
          style={styles.questionHeader}
          onPress={() => router.push(`/question/${answer?.question?.id}`)}
        >
          <Text style={styles.questionTitle}>
            {answer?.question?.title}
          </Text>
          <Ionicons name="chevron-forward" size={18} color="#999" />
        </Pressable>

        {/* 作者信息栏 */}
        <View style={styles.authorSection}>
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
        <View style={styles.contentBody}>
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
            }}
          />
          <Text type="secondary" style={styles.publishDate}>
            发布于 {answer?.created_time_name || '不久前'} · 著作权归作者所有
          </Text>
        </View>
      </ScrollView>

      {/* 3. 底部吸底交互栏 */}
      <View
        type="surface"
        style={[
          styles.footer,
          {
            paddingBottom: insets.bottom > 0 ? insets.bottom : 10,
            height: 60 + (insets.bottom > 0 ? insets.bottom : 15)
          }
        ]}
      >
        <View style={styles.voteBox}>
          <LikeButton
            id={answer?.id}
            count={answer?.voteup_count || 0}
            voted={answer?.relationship?.voting}
          />
          <View style={styles.downvote}>
            <Ionicons name="caret-down" size={20} color="#0084ff" />
          </View>
        </View>

        <View style={styles.footerRight}>
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
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  // 问题连接
  questionHeader: {
    marginHorizontal: 20,
    paddingVertical: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  questionTitle: { fontSize: 18, fontWeight: 'bold', flex: 1, marginRight: 10, lineHeight: 24 },
  // 作者栏
  authorSection: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    justifyContent: 'space-between'
  },
  authorMain: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  authorInfo: { marginLeft: 12, flex: 1 },
  authorName: { fontSize: 16, fontWeight: 'bold' },
  authorHeadline: { fontSize: 13, color: '#999', marginTop: 2 },
  followBtn: {
    backgroundColor: '#0084ff15',
    paddingHorizontal: 15,
    paddingVertical: 6,
    borderRadius: 6
  },
  followBtnText: { color: '#0084ff', fontWeight: 'bold', fontSize: 14 },
  // 正文
  contentBody: { paddingHorizontal: 20 },
  publishDate: { color: '#bbb', fontSize: 13, marginTop: 30, fontStyle: 'italic', paddingBottom: 20 },
  // 动效 Header
  stickyHeader: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  stickyHeaderContent: {
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
  },
  stickyAuthor: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center'
  },
  stickyAvatar: { width: 24, height: 24, borderRadius: 12, marginRight: 8 },
  stickyName: { fontSize: 15, fontWeight: '600' },
  floatingBackBtn: {
    position: 'absolute',
    left: 10,
    zIndex: 100,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // 底部工具栏
  footer: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#eee',
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
  },
  voteBox: { flexDirection: 'row', alignItems: 'center' },
  downvote: {
    width: 36,
    height: 36,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 6,
    backgroundColor: '#0084ff10'
  },
  footerRight: { flex: 1, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center' },
  footerAction: {
    alignItems: 'center',
    marginLeft: 22,
    flexDirection: 'row'
  },
  actionCount: { marginLeft: 4, color: '#888', fontSize: 13 }
});