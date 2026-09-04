import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import React, { useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  type ScrollView as NativeScrollView,
  Pressable,
  StyleSheet,
} from 'react-native';
import Reanimated, {
  interpolate,
  SharedTransition,
  type SharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type AnswerDetail, deleteAnswer, getAnswer } from '@/api/zhihu';
import {
  fastCollectAnswer,
  getAnswerCollectionStatus,
  removeFromCollection,
} from '@/api/zhihu/collection';
import { followMember, unfollowMember } from '@/api/zhihu/member';
import { BouncyButton } from '@/components/BouncyButton';
import { DownvoteButton } from '@/components/DownvoteButton';
import { LikeButton } from '@/components/LikeButton';
import { ActionSheet } from '@/components/overlays/ActionSheet';
import { ShareMenu } from '@/components/ShareMenu';
import { Text, ThemedIcon, useThemeColor, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { RICH_CONTENT_STALE_TIME, ZhihuContent } from '@/features/rich-content';
import { useOptimisticToggle } from '@/hooks/useOptimisticToggle';
import { useScrollHeaderAnim } from '@/hooks/useScrollAnimation';
import { useCollectionStore } from '@/store/useCollectionStore';
import { formatDate } from '@/utils/date';
import { showToast } from '@/utils/toast';

const _slowTransition = SharedTransition.duration(600);

interface AnswerDetailViewProps {
  id: string;
  initialTitle?: string;
  questionId?: string;
  onScroll?: (y: number) => void;
  scrollY?: SharedValue<number>;
  isFocused?: boolean;
}

export const AnswerDetailView = ({
  id,
  questionId,
  onScroll,
  scrollY,
  isFocused = false,
}: AnswerDetailViewProps) => {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const colorScheme = useColorScheme();
  const backgroundColor = Colors[colorScheme].background;
  const _textColor = Colors[colorScheme].text;

  const scrollViewRef = useRef<NativeScrollView>(null);
  const { headerVisible, handleScroll } = useScrollHeaderAnim(
    300,
    onScroll,
    100,
    scrollY,
  );

  const headerAnimatedStyle = useAnimatedStyle(() => ({
    opacity: headerVisible.value,
    transform: [
      {
        translateY: interpolate(
          headerVisible.value,
          [0, 1],
          [-insets.top - 50, 0],
        ),
      },
    ],
  }));

  const [isLiked, setIsLiked] = React.useState(false);
  const [menuVisible, setMenuVisible] = React.useState(false);
  const [isSharing, setIsSharing] = React.useState(false);
  const [hasBeenFocused, setHasBeenFocused] = React.useState(isFocused);

  React.useEffect(() => {
    if (isFocused && !hasBeenFocused) {
      setHasBeenFocused(true);
    }
  }, [isFocused, hasBeenFocused]);

  const {
    data: answer,
    isLoading: queryLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['answer-detail', id],
    queryFn: () => getAnswer(id),
    enabled: isFocused,
    staleTime: RICH_CONTENT_STALE_TIME,
    retry: (failureCount, err: any) =>
      err?.response?.status === 404 ? false : failureCount < 2,
  });

  const followMutation = useOptimisticToggle<AnswerDetail>({
    queryKey: ['answer-detail', id],
    mutationFn: async () => {
      const author = answer?.author;
      if (!author) throw new Error('回答尚未加载');
      if (author.is_following)
        return unfollowMember(author.url_token || author.id);
      return followMember(author.url_token || author.id);
    },
    isActive: answer?.author?.is_following,
    onUpdateCache: (old) => ({
      ...old,
      author: {
        ...old.author,
        is_following: !old.author.is_following,
      },
    }),
    successMessage: (isActive) => (isActive ? '已取消关注' : '已关注'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteAnswer(id),
    onSuccess: () => {
      Alert.alert('删除成功', '你的回答已删除喵！');
      router.back();
    },
    onError: (err: any) =>
      Alert.alert(
        '删除失败',
        err.response?.data?.error?.message || '无法删除回答',
      ),
  });

  const handleDelete = () => {
    Alert.alert('确认删除', '确定要删除这个回答吗？此操作不可撤销喵！', [
      { text: '取消', style: 'cancel' },
      {
        text: '确认删除',
        style: 'destructive',
        onPress: () => deleteMutation.mutate(),
      },
    ]);
  };

  const { data: collectionStatus, refetch: refetchCollectionStatus } = useQuery(
    {
      queryKey: ['answer-collection-status', id],
      queryFn: () => getAnswerCollectionStatus(id),
      enabled: !!id && hasBeenFocused,
      staleTime: 60 * 1000, // 1 minute
    },
  );

  const setCollectedStatus = useCollectionStore(
    (state) => state.setCollectedStatus,
  );

  const isCollected = collectionStatus?.data?.some(
    (item: any) => item.is_favorited,
  );
  const favoritedCollection = collectionStatus?.data?.find(
    (item: any) => item.is_favorited,
  );

  const storeCollected = useCollectionStore(
    (state) => state.collectedStatusMap[id.toString()],
  );
  const rawIsFaved =
    answer?.reaction?.relation?.faved ||
    answer?.relationship?.is_favorited ||
    false;
  const _activeCollected =
    storeCollected !== undefined
      ? storeCollected
      : isCollected !== undefined
        ? isCollected
        : rawIsFaved;
  const storeOffset = useCollectionStore(
    (state) => state.collectedCountOffsetMap[id.toString()] || 0,
  );
  const _displayCount = (answer?.favlists_count || 0) + storeOffset;

  React.useEffect(() => {
    if (collectionStatus) {
      const activeCollected =
        collectionStatus?.data?.some((item: any) => item.is_favorited) || false;
      setCollectedStatus(id, activeCollected);
    }
  }, [collectionStatus, id, setCollectedStatus]);

  const collectMutation = useMutation({
    mutationFn: async () => {
      if (isCollected && favoritedCollection)
        return removeFromCollection(favoritedCollection.id, id);
      return fastCollectAnswer(id);
    },
    onSuccess: (res) => {
      refetchCollectionStatus();
      if (!isCollected) {
        const folderName = res?.collection?.title || '默认收藏夹';
        useCollectionStore
          .getState()
          .showToast(id, 'answer', `已收藏到「${folderName}」`);
      } else {
        showToast('已取消收藏');
      }
    },
    onError: (err: any) =>
      showToast(err.response?.data?.error?.message || '无法处理请求'),
  });

  const goToProfile = () => {
    const token = answer?.author?.url_token || answer?.author?.id;
    if (token) router.push(`/user/${token}`);
  };

  const getShareLink = () => {
    const actualQid = answer?.question?.id || questionId;
    return `https://www.zhihu.com/question/${actualQid}/answer/${id}`;
  };

  const primaryColor = useThemeColor({}, 'primary');
  const primaryTransparent = useThemeColor({}, 'primaryTransparent');
  const secondaryColor = useThemeColor({}, 'textSecondary');
  const warningColor = useThemeColor({}, 'warning');

  if (!hasBeenFocused) {
    return <View className="flex-1" />;
  }

  return (
    <View className="flex-1">
      {/* Header (On Scroll) */}
      <Reanimated.View
        className="absolute left-0 right-0 z-10"
        style={[
          {
            backgroundColor,
            paddingTop: insets.top,
          },
          headerAnimatedStyle,
        ]}
      >
        <View
          className="flex-row items-start px-[15px] justify-between bg-transparent"
          style={{ marginTop: 8, paddingBottom: 8 }}
        >
          <View className="w-10 bg-transparent" />
          <View className="flex-1 flex-col items-center bg-transparent">
            {/* 问题标题 */}
            <Pressable
              onPress={() =>
                router.push(`/question/${answer?.question?.id || questionId}`)
              }
              style={{ maxWidth: '90%', paddingTop: 6 }}
              className="bg-transparent"
            >
              <Text
                className="text-[17px] font-bold text-center"
                numberOfLines={1}
              >
                {answer?.question?.title || '加载中...'}
              </Text>
            </Pressable>

            {/* 用户头像 + 名字 */}
            <Pressable
              onPress={goToProfile}
              className="flex-row items-center justify-center mt-1 bg-transparent"
            >
              <Image
                source={{ uri: answer?.author?.avatar_url }}
                className="w-4 h-4 rounded-full mr-1"
              />
              <Text
                className="text-[11px] font-medium opacity-60"
                numberOfLines={1}
              >
                {answer?.author?.name || '知乎用户'}
              </Text>
            </Pressable>
          </View>
          <View className="w-10 bg-transparent" />
        </View>
      </Reanimated.View>

      <Reanimated.ScrollView
        ref={scrollViewRef}
        className="flex-1"
        style={{
          backgroundColor:
            colorScheme === 'dark'
              ? 'rgba(34, 34, 34, 0.85)'
              : 'rgba(255,255,255,0.9)',
        }}
        scrollEventThrottle={16}
        onScroll={handleScroll}
        contentContainerStyle={{
          paddingTop: insets.top + 76,
          paddingBottom: 100 + insets.bottom,
        }}
      >
        <View className="flex-row items-center px-5 pt-5 pb-4 justify-between bg-transparent">
          <Pressable
            onPress={goToProfile}
            className="flex-row items-center flex-1 bg-transparent"
          >
            <Image
              source={{ uri: answer?.author?.avatar_url }}
              className="w-11 h-11 rounded-full"
            />
            <View className="ml-3 flex-1 bg-transparent">
              <Text className="text-[16px] font-bold" numberOfLines={1}>
                {answer?.author?.name}
              </Text>
              <Text
                type="secondary"
                className="text-[13px] mt-0.5"
                numberOfLines={1}
              >
                {answer?.author?.headline}
              </Text>
            </View>
          </Pressable>
          <Pressable
            className="px-[15px] py-1.5 rounded-[20px]"
            style={[
              !answer?.author?.is_following
                ? { backgroundColor: primaryTransparent }
                : {
                    backgroundColor: 'transparent',
                    borderWidth: 1,
                    borderColor: Colors[colorScheme].border,
                  },
            ]}
            onPress={() => followMutation.mutate()}
            disabled={followMutation.isPending}
          >
            <Text
              className="text-sm font-bold"
              style={[
                answer?.author?.is_following
                  ? { color: Colors[colorScheme].textSecondary }
                  : { color: primaryColor },
              ]}
            >
              {answer?.author?.is_following ? '已关注' : '关注'}
            </Text>
          </Pressable>
        </View>

        {queryLoading ? (
          <View className="h-[200px] justify-center items-center bg-transparent">
            <ActivityIndicator size="small" color={primaryColor} />
            <Text type="secondary" className="mt-[15px]">
              正在斟酌文字...喵
            </Text>
          </View>
        ) : isError || (error as any)?.response?.status === 404 ? (
          <View className="h-[300px] justify-center items-center px-6 bg-transparent">
            <Ionicons name="compass-outline" size={48} color={secondaryColor} />
            <Text className="text-base font-bold mt-4 mb-2 text-foreground dark:text-foreground-dark">
              你似乎来到了没有知识存在的荒原
            </Text>
            <Text type="secondary" className="text-xs text-center mb-6">
              该回答可能已被删除、失效或暂不可见 喵~
            </Text>
            <BouncyButton
              onPress={() => router.back()}
              className="px-4 py-2 rounded-full"
              style={{ backgroundColor: primaryTransparent }}
            >
              <Text
                className="text-xs font-bold"
                style={{ color: primaryColor }}
              >
                返回上一页
              </Text>
            </BouncyButton>
          </View>
        ) : (
          <View className="px-5 pb-2 bg-transparent">
            <ZhihuContent
              content={answer?.content || ''}
              segmentInfos={answer?.segment_infos}
              objectId={id}
              type="answer"
              onRefresh={refetch}
            />
            {/* Meta info */}
            <View
              style={{
                marginTop: 20,
                paddingTop: 12,
              }}
              className="bg-transparent"
            >
              <Text
                style={{
                  fontSize: 12,
                  color: Colors[colorScheme].textSecondary,
                  opacity: 0.65,
                }}
              >
                {[
                  answer?.created_time
                    ? `发布于 ${formatDate(answer.created_time)}`
                    : answer?.created_time_name
                      ? `发布于 ${answer.created_time_name}`
                      : null,
                  answer?.updated_time
                    ? `编辑于 ${formatDate(answer.updated_time)}`
                    : null,
                  answer?.ip_info ? answer.ip_info : null,
                ]
                  .filter(Boolean)
                  .join('  ·  ')}
              </Text>
            </View>
          </View>
        )}
      </Reanimated.ScrollView>

      {/* Footer Actions */}
      <View
        className="absolute left-5 right-5 z-[1000] shadow-black/10 shadow-[0_10px_20px] elevation-10"
        style={{ bottom: insets.bottom }}
      >
        <BlurView
          intensity={130}
          tint={colorScheme === 'dark' ? 'dark' : 'light'}
          className="rounded-[32px] overflow-hidden h-16"
          style={{
            backgroundColor:
              colorScheme === 'dark'
                ? 'rgba(26,26,26,0.8)'
                : 'rgba(255,255,255,0.85)',
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: 'rgba(150,150,150,0.1)',
          }}
        >
          <View className="flex-row items-center px-5 h-full bg-transparent">
            <View className="flex-row items-center bg-transparent">
              <LikeButton
                id={answer?.id ?? ''}
                count={answer?.voteup_count || '-'}
                voted={answer?.reaction?.relation?.vote === 'UP' ? 1 : 0}
                variant="minimal"
              />
              <View className="w-2.5 bg-transparent" />
              <DownvoteButton
                id={answer?.id ?? ''}
                voted={answer?.relationship?.voting}
                variant="minimal"
              />
            </View>
            <View className="flex-1 flex-row justify-end items-center bg-transparent">
              <Pressable
                className="items-center ml-5 flex-row bg-transparent"
                onPress={() => router.push(`/comments/${id}?type=answer`)}
              >
                <ThemedIcon
                  name="chatbubble-outline"
                  size={24}
                  colorType="secondary"
                />
                {(answer?.comment_count ?? 0) > 0 && (
                  <Text
                    type="secondary"
                    className="ml-1 text-[13px] font-medium"
                  >
                    {answer?.comment_count}
                  </Text>
                )}
              </Pressable>
              <Pressable
                className="items-center ml-5 flex-row bg-transparent"
                onPress={() => setMenuVisible(true)}
              >
                <ThemedIcon
                  name="ellipsis-horizontal"
                  size={24}
                  colorType="secondary"
                />
              </Pressable>
            </View>
          </View>
        </BlurView>
      </View>

      <ShareMenu
        visible={isSharing}
        onClose={() => setIsSharing(false)}
        type="answer"
        data={
          answer
            ? {
                id: answer.id,
                title: answer.question?.title,
                author: answer.author?.name,
                authorHeadline: answer.author?.headline,
                url: getShareLink(),
              }
            : null
        }
      />

      <ActionSheet
        visible={menuVisible && !isSharing}
        onClose={() => setMenuVisible(false)}
        title="回答操作"
        options={[
          {
            key: 'like',
            icon: isLiked ? 'heart' : 'heart-outline',
            label: isLiked ? '取消喜欢' : '加入喜欢',
            color: isLiked ? Colors[colorScheme].danger : undefined,
            onPress: () => setIsLiked(!isLiked),
          },
          {
            key: 'collection',
            icon: isCollected ? 'star' : 'star-outline',
            label: isCollected ? '取消收藏' : '移至收藏',
            color: isCollected ? warningColor : undefined,
            onPress: () => collectMutation.mutate(),
          },
          {
            key: 'share',
            icon: 'share-social-outline',
            label: '分享回答',
            onPress: () => setIsSharing(true),
          },
          ...(answer?.relationship?.is_author
            ? [
                {
                  key: 'delete',
                  icon: 'trash-outline' as const,
                  label: '删除回答',
                  destructive: true,
                  onPress: handleDelete,
                },
              ]
            : []),
        ]}
      />
    </View>
  );
};
