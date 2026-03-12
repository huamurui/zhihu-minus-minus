import { deleteAnswer, getAnswer } from '@/api/zhihu';
import { fastCollectAnswer, getAnswerCollectionStatus, removeFromCollection } from '@/api/zhihu/collection';
import { followMember, unfollowMember } from '@/api/zhihu/member';
import { ZhihuContent } from '@/components/ZhihuContent';
import { DownvoteButton } from '@/components/DownvoteButton';
import { LikeButton } from '@/components/LikeButton';
import { Text, View, useThemeColor } from '@/components/Themed';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useRef } from 'react';
import { ActivityIndicator, Alert, AlertButton, Animated, Image, LayoutAnimation, Modal, Pressable, ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import Reanimated, { SharedTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { useColorScheme } from '@/components/useColorScheme';

const slowTransition = SharedTransition.duration(600);

export default function AnswerDetailScreen() {
  const { id, title: initialTitle, questionId } = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const queryClient = useQueryClient();
  const colorScheme = useColorScheme();
  const tintColor = useThemeColor({}, 'tint');
  const textColor = useThemeColor({}, 'text');
  const borderColor = useThemeColor({}, 'border');
  const surfaceColor = useThemeColor({}, 'surface');
  const backgroundColor = useThemeColor({}, 'background');

  // 动画相关
  const scrollY = useRef(new Animated.Value(0)).current;
  const lastScrollY = useRef(0);
  const headerVisible = useRef(new Animated.Value(0)).current;
  const isHeaderShowRef = useRef(false);

  // 本地喜欢状态 (Heart)
  const [isLiked, setIsLiked] = React.useState(false);
  const [menuVisible, setMenuVisible] = React.useState(false);

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

  const { data: answer, isLoading: queryLoading, refetch } = useQuery({
    queryKey: ['answer-detail', id],
    queryFn: () => getAnswer(id as string)
  });

  const followMutation = useMutation({
    mutationFn: async () => {
      if (answer?.author?.is_following) {
        return unfollowMember(answer.author.url_token || answer.author.id);
      } else {
        return followMember(answer.author.url_token || answer.author.id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['answer-detail', id] });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteAnswer(id as string),
    onSuccess: () => {
      Alert.alert('删除成功', '你的回答已删除喵！');
      router.back();
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

  // 收藏相关
  const { data: collectionStatus, refetch: refetchCollectionStatus } = useQuery({
    queryKey: ['answer-collection-status', id],
    queryFn: () => getAnswerCollectionStatus(id as string),
    enabled: !!id,
  });

  const isCollected = collectionStatus?.data?.some((item: any) => item.is_favorited);
  const favoritedCollection = collectionStatus?.data?.find((item: any) => item.is_favorited);

  const collectMutation = useMutation({
    mutationFn: async () => {
      if (isCollected && favoritedCollection) {
        return removeFromCollection(favoritedCollection.id, id as string);
      } else {
        return fastCollectAnswer(id as string);
      }
    },
    onSuccess: (res) => {
      refetchCollectionStatus();
      if (!isCollected) {
        Alert.alert('收藏成功', `已收藏到「${res?.collection?.title || '我的收藏'}」喵！`);
      } else {
        // Alert.alert('已取消收藏', '喵！');
      }
    },
    onError: (err: any) => {
      console.error(err);
      Alert.alert('操作失败', err.response?.data?.error?.message || '无法处理收藏请求');
    }
  });

  const goToProfile = () => {
    const token = answer?.author?.url_token || answer?.author?.id;
    if (token) {
      router.push(`/user/${token}`);
    }
  };

  const handleMore = () => {
    const options: AlertButton[] = [
      {
        text: isLiked ? '❤️ 已喜欢' : '🤍 喜欢',
        onPress: () => setIsLiked(!isLiked),
      },
      {
        text: isCollected ? '🌟 已收藏' : '⭐ 收藏',
        onPress: () => collectMutation.mutate(),
      },
      {
        text: '📤 分享',
        onPress: () => {/* 分享逻辑 */ },
      },
    ];

    if (answer?.relationship?.is_author) {
      options.push({
        text: '🗑️ 删除回答',
        onPress: handleDelete,
      });
    }

    options.push({ text: '取消', style: 'cancel' });

    Alert.alert('更多操作', undefined, options);
  };

  const isLoading = queryLoading;

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
          <Pressable onPress={goToProfile} style={styles.stickyAuthor}>
            <Image source={{ uri: answer?.author?.avatar_url }} style={styles.stickyAvatar} />
            <Text style={styles.stickyName} numberOfLines={1}>{answer?.author?.name || '知乎用户'}</Text>
          </Pressable>
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
          onPress={() => router.push(`/question/${answer?.question?.id || questionId}`)}
        >
          {/* 这里的 Reanimated 负责接管动效 */}
          <Reanimated.View
            sharedTransitionTag={`title-${questionId || id}`}
            sharedTransitionStyle={slowTransition}
          >
            <Text style={styles.questionTitle}>
              {answer?.question?.title || initialTitle || '加载中...'}
            </Text>
          </Reanimated.View>
          {!isLoading && <Ionicons name="chevron-forward" size={18} color="#999" />}
        </Pressable>

        {isLoading ? (
          <View style={{ height: 200, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="small" color="#0084ff" />
            <Text type="secondary" style={{ marginTop: 15 }}>正在斟酌文字...喵</Text>
          </View>
        ) : (
          <>
            {/* 作者信息栏 */}
            <View style={styles.authorSection}>
              <Pressable onPress={goToProfile} style={styles.authorMain}>
                <Image source={{ uri: answer?.author?.avatar_url }} style={styles.avatar} />
                <View style={styles.authorInfo}>
                  <Text style={styles.authorName}>{answer?.author?.name}</Text>
                  <Text type="secondary" style={styles.authorHeadline} numberOfLines={1}>{answer?.author?.headline}</Text>
                </View>
              </Pressable>
              <Pressable
                style={[styles.followBtn, answer?.author?.is_following && styles.followBtnActive]}
                onPress={() => followMutation.mutate()}
                disabled={followMutation.isPending}
              >
                <Text style={[styles.followBtnText, answer?.author?.is_following && styles.followBtnTextActive]}>
                  {answer?.author?.is_following ? '已关注' : '关注'}
                </Text>
              </Pressable>
            </View>

            {/* 回答正文 */}
            <View style={styles.contentBody}>
              <ZhihuContent
                content={answer?.content || ''}
                segmentInfos={answer?.segment_infos}
                objectId={id as string}
                type="answer"
                onRefresh={refetch}
              />
              <Text type="secondary" style={styles.publishDate}>
                发布于 {answer?.created_time ? new Date(answer.created_time * 1000).toLocaleDateString() : (answer?.created_time_name || '不久前')} · 著作权归作者所有
              </Text>
            </View>
          </>
        )}
      </ScrollView>

      {/* 3. 底部吸底交互栏 (采用首页同款悬浮设计) */}
      <View style={[styles.footerContainer, { bottom: insets.bottom + 20 }]}>
        <BlurView
          intensity={130}
          tint={colorScheme === 'dark' ? 'dark' : 'light'}
          style={[
            styles.footerBlur,
            { backgroundColor: colorScheme === 'dark' ? 'rgba(26,26,26,0.8)' : 'rgba(255,255,255,0.85)' }
          ]}
        >
          <View style={styles.footerContent}>
            {/* 左侧：赞同(含数量)和反对 */}
            <View style={styles.footerLeft}>
              <LikeButton
                id={answer?.id}
                count={answer?.voteup_count || '-'}
                voted={answer?.relationship?.voting}
                variant="minimal"
              />
              <View style={{ width: 10 }} />
              <DownvoteButton
                id={answer?.id}
                voted={answer?.relationship?.voting}
                variant="minimal"
              />
            </View>

            {/* 右侧：评论 + 更多 */}
            <View style={styles.footerRight}>
              <Pressable style={styles.footerAction} onPress={() => router.push(`/comments/${id}?type=answer`)}>
                <Ionicons name="chatbubble-outline" size={24} color="#888" />
                {answer?.comment_count > 0 && (
                  <Text type="secondary" style={styles.actionCount}>{answer?.comment_count}</Text>
                )}
              </Pressable>

              <Pressable style={styles.footerAction} onPress={() => setMenuVisible(true)}>
                <Ionicons name="ellipsis-horizontal" size={24} color="#888" />
              </Pressable>
            </View>
          </View>
        </BlurView>
      </View>

      {/* 4. 自定义更多操作菜单 (Bottom Sheet 风格) */}
      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setMenuVisible(false)}
        >
          <View style={[styles.menuSheet, { backgroundColor: surfaceColor, paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.menuHeader}>
              <View style={styles.menuKnob} />
            </View>

            <View style={styles.menuOptions}>
              <MenuOption
                icon={isLiked ? "heart" : "heart-outline"}
                label={isLiked ? "取消喜欢" : "加入喜欢"}
                color={isLiked ? "#ff4d4f" : undefined}
                onPress={() => { setIsLiked(!isLiked); setMenuVisible(false); }}
              />
              <MenuOption
                icon={isCollected ? "star" : "star-outline"}
                label={isCollected ? "取消收藏" : "移至收藏"}
                color={isCollected ? "#ffb400" : undefined}
                onPress={() => { collectMutation.mutate(); setMenuVisible(false); }}
              />
              <MenuOption
                icon="share-social-outline"
                label="分享回答"
                onPress={() => setMenuVisible(false)}
              />
              {answer?.relationship?.is_author && (
                <View style={styles.menuDivider} />
              )}
              {answer?.relationship?.is_author && (
                <MenuOption
                  icon="trash-outline"
                  label="删除回答"
                  color="#ff4d4f"
                  onPress={() => { handleDelete(); setMenuVisible(false); }}
                />
              )}
            </View>

            <Pressable style={styles.menuCancel} onPress={() => setMenuVisible(false)}>
              <Text style={styles.menuCancelText}>取消</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
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
    borderRadius: 20
  },
  followBtnActive: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#eee'
  },
  followBtnText: { color: '#0084ff', fontWeight: 'bold', fontSize: 14 },
  followBtnTextActive: { color: '#999' },
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
  // 底部悬浮工具栏 (首页同款)
  footerContainer: {
    position: 'absolute',
    left: 20,
    right: 20,
    zIndex: 1000,
    // 增加阴影提升悬浮感
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 10,
  },
  footerBlur: {
    borderRadius: 32,
    overflow: 'hidden',
    height: 64,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(150,150,150,0.1)',
  },
  footerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    height: '100%',
  },
  voteBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent'
  },
  footerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent'
  },
  footerRight: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    backgroundColor: 'transparent'
  },
  footerAction: {
    alignItems: 'center',
    marginLeft: 20,
    flexDirection: 'row',
    backgroundColor: 'transparent'
  },
  actionCount: { marginLeft: 4, color: '#888', fontSize: 13, fontWeight: '500' },
  // 底部菜单
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  menuSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  menuHeader: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  menuKnob: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#ddd',
  },
  menuOptions: {
    paddingVertical: 10,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 10,
  },
  menuIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(150,150,150,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 0,
    marginRight: 15,
  },
  menuLabel: {
    fontSize: 16,
    fontWeight: '500',
  },
  menuDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(150,150,150,0.15)',
    marginVertical: 5,
  },
  menuCancel: {
    paddingVertical: 18,
    marginTop: 10,
    alignItems: 'center',
  },
  menuCancelText: {
    fontSize: 16,
    fontWeight: 'bold',
  }
});

function MenuOption({ icon, label, onPress, color }: any) {
  const textColor = useThemeColor({}, 'text');
  return (
    <Pressable style={styles.menuItem} onPress={onPress}>
      <View style={styles.menuIcon}>
        <Ionicons name={icon} size={26} color={color || textColor} />
      </View>
      <Text style={[styles.menuLabel, { color: textColor }]}>{label}</Text>
    </Pressable>
  );
}
