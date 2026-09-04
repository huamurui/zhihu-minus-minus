import { Ionicons } from '@expo/vector-icons';
import {
  FlashList,
  type FlashListRef,
  useRecyclingState,
} from '@shopify/flash-list';
import {
  type InfiniteData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  View as NativeView,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import {
  Gesture,
  GestureDetector,
  type GestureType,
} from 'react-native-gesture-handler';
import Reanimated, {
  interpolate,
  runOnJS,
  SharedTransition,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import client from '@/api/client';
import {
  type AnswerDetail,
  deleteAnswer,
  type QuestionAnswersResponse,
} from '@/api/zhihu/answer';
import { addReadHistory } from '@/api/zhihu/history';
import { followMember, unfollowMember } from '@/api/zhihu/member';
import {
  followQuestion,
  getQuestion,
  unfollowQuestion,
  type ZhihuQuestionDetail,
} from '@/api/zhihu/question';
import { BouncyButton } from '@/components/BouncyButton';
import { LikeButton } from '@/components/LikeButton';
import { QueryErrorView } from '@/components/QueryErrorView';
import { ShareMenu } from '@/components/ShareMenu';
import { Text, useThemeColor, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { ZhihuContent } from '@/features/rich-content';
import { useCollectionAction } from '@/hooks/useCollectionAction';
import { useOptimisticToggle } from '@/hooks/useOptimisticToggle';
import { useScrollHeaderAnim } from '@/hooks/useScrollAnimation';
import { useViewableItems } from '@/hooks/useViewableItems';
import { useZhihuInfiniteQuery } from '@/hooks/useZhihuInfiniteQuery';
import { useCollectionStore } from '@/store/useCollectionStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import type { ZhihuAuthor } from '@/types/zhihu';
import { formatDate } from '@/utils/date';
import { refreshInfiniteQuery } from '@/utils/query';

const AnimatedFlashList = Reanimated.createAnimatedComponent(
  FlashList,
) as typeof FlashList;

type AnswerSort = 'default' | 'created';

interface AnswerItemHandle {
  measureFooter: (
    callback: (x: number, y: number, width: number, height: number) => void,
  ) => void;
  id: string;
}

interface AnswerItemProps {
  item: AnswerDetail;
  isExpanded: boolean;
  onToggle: (id: string, expanded: boolean) => void;
  onShare?: (item: AnswerDetail) => void;
  questionId: string;
  sortBy: AnswerSort;
  screenTranslateX: SharedValue<number>;
  scrollGesture: GestureType;
  onSwipeStart?: (author: ZhihuAuthor) => void;
  onSwipeComplete?: (author: ZhihuAuthor) => void;
  onSwipeCancel?: () => void;
}

const AnswerItem = forwardRef<AnswerItemHandle, AnswerItemProps>(
  (
    {
      item,
      isExpanded,
      onToggle,
      onShare,
      questionId,
      sortBy,
      screenTranslateX,
      scrollGesture,
      onSwipeStart,
      onSwipeComplete,
      onSwipeCancel,
    }: AnswerItemProps,
    ref,
  ) => {
    const { width: screenWidth } = useWindowDimensions();
    const colorScheme = useColorScheme();
    const router = useRouter();
    const _textColor = Colors[colorScheme].text;
    const queryClient = useQueryClient();
    const footerRef = useRef<NativeView>(null);

    const storeCollected = useCollectionStore((state) =>
      item?.id ? state.collectedStatusMap[item.id.toString()] : false,
    );
    const isCollected = storeCollected !== undefined ? storeCollected : false;
    const storeOffset = useCollectionStore((state) =>
      item?.id
        ? state.collectedStatusMap[item.id.toString()] !== undefined
          ? state.collectedCountOffsetMap[item.id.toString()] || 0
          : 0
        : 0,
    );
    const displayCount = (item.favlists_count || 0) + storeOffset;
    const { toggleCollect } = useCollectionAction();

    const primaryColor = useThemeColor({}, 'primary');
    const primaryTransparent = useThemeColor({}, 'primaryTransparent');
    const warningColor = useThemeColor({}, 'warning');

    const isFirstMount = useRef(true);
    const animationItemIdRef = useRef(item.id);
    const [measuredHeight, setMeasuredHeight] = useRecyclingState(0, [item.id]);
    // isMounted: ZhihuContent is only mounted after first expansion (perf optimization for long content)
    const [isMounted, setIsMounted] = useRecyclingState(
      () => isExpanded,
      [item.id],
    );
    const expandedProgress = useSharedValue(isExpanded ? 1 : 0);
    const borderProgress = useSharedValue(0);

    React.useLayoutEffect(() => {
      const itemChanged = animationItemIdRef.current !== item.id;
      animationItemIdRef.current = item.id;

      if (isFirstMount.current || itemChanged) {
        isFirstMount.current = false;
        expandedProgress.value = isExpanded ? 1 : 0;
        borderProgress.value = 0;
        if (isExpanded && !isMounted) {
          setIsMounted(true);
        }
        return;
      }

      expandedProgress.value = withTiming(isExpanded ? 1 : 0, {
        duration: 300,
      });

      if (isExpanded && !isMounted) {
        setIsMounted(true);
      }

      if (!isExpanded) {
        borderProgress.value = withSequence(
          withTiming(1, { duration: 150 }),
          withDelay(600, withTiming(0, { duration: 250 })),
        );
      }
    }, [
      borderProgress,
      expandedProgress,
      isExpanded,
      isMounted,
      item.id,
      setIsMounted,
    ]);

    const animatedContentStyle = useAnimatedStyle(() => {
      if (measuredHeight === 0) {
        return { height: 'auto' };
      }
      const height = interpolate(
        expandedProgress.value,
        [0, 1],
        [150, measuredHeight],
      );
      return { height };
    });

    const animatedReadMoreStyle = useAnimatedStyle(() => {
      const opacity = interpolate(expandedProgress.value, [0, 1], [1, 0]);
      return { opacity };
    });

    const animatedBorderStyle = useAnimatedStyle(() => {
      return {
        borderColor: primaryColor,
        opacity: borderProgress.value,
      };
    });

    const panGesture = useMemo(
      () =>
        Gesture.Pan()
          .enabled(Boolean(item.author?.url_token))
          .activeOffsetX(-15)
          .failOffsetY([-8, 8])
          .simultaneousWithExternalGesture(scrollGesture)
          .onStart(() => {
            if (item.author && onSwipeStart) {
              runOnJS(onSwipeStart)(item.author);
            }
          })
          .onUpdate((event) => {
            // 只允许向左侧滑动（偏移量 <= 0）
            screenTranslateX.value = Math.min(0, event.translationX);
          })
          .onEnd((event) => {
            if (event.translationX < -120 && item.author && onSwipeComplete) {
              screenTranslateX.value = withTiming(
                -screenWidth,
                { duration: 250 },
                (finished) => {
                  if (finished) {
                    runOnJS(onSwipeComplete)(item.author);
                  }
                },
              );
            } else {
              screenTranslateX.value = withTiming(0, { duration: 250 });
              if (onSwipeCancel) {
                runOnJS(onSwipeCancel)();
              }
            }
          })
          .onFinalize((_event, success) => {
            if (!success) {
              screenTranslateX.value = withTiming(0, { duration: 250 });
              if (onSwipeCancel) {
                runOnJS(onSwipeCancel)();
              }
            }
          }),
      [
        item.author,
        onSwipeComplete,
        onSwipeCancel,
        onSwipeStart,
        scrollGesture,
        screenTranslateX,
        screenWidth,
      ],
    );

    useImperativeHandle(ref, () => ({
      measureFooter: (callback) => footerRef.current?.measureInWindow(callback),
      id: item.id.toString(),
    }));

    const rawText = item.content?.replace(/<[^>]+>/g, '') || '';
    const isLongContent =
      rawText?.length > 120 ||
      item.content?.includes('<img') ||
      item.content?.includes('<figure');
    const excerpt = isLongContent ? `${rawText.substring(0, 100)}...` : rawText;

    const { fontSizeScale, lineHeightScale } = useSettingsStore();

    // Shared meta info component to avoid repetition
    const metaText = [
      item.created_time ? `发布于 ${formatDate(item.created_time)}` : null,
      item.updated_time ? `编辑于 ${formatDate(item.updated_time)}` : null,
      item.ip_info ? item.ip_info : null,
    ]
      .filter(Boolean)
      .join('  ·  ');

    const MetaInfo = metaText ? (
      <View
        style={{
          paddingTop: 4,
        }}
        className="bg-transparent"
      >
        <Text
          style={{
            fontSize: 12,
            color: Colors[colorScheme].textSecondary,
            opacity: 0.7,
          }}
        >
          {metaText}
        </Text>
      </View>
    ) : null;

    const followMutation = useOptimisticToggle<
      InfiniteData<QuestionAnswersResponse, number>
    >({
      queryKey: ['question-answers', questionId, sortBy],
      mutationFn: async () => {
        const pid = item.author?.url_token || item.author?.id;
        if (!pid) return;
        if (item.author?.is_following) return unfollowMember(pid);
        return followMember(pid);
      },
      isActive: item.author?.is_following,
      onUpdateCache: (old) => ({
        ...old,
        pages: old.pages.map((page) => ({
          ...page,
          data: page.data?.map((answer) =>
            answer.id.toString() === item.id?.toString()
              ? {
                  ...answer,
                  author: {
                    ...answer.author,
                    is_following: !answer.author.is_following,
                  },
                }
              : answer,
          ),
        })),
      }),
      successMessage: (isActive) => (isActive ? '已取消关注' : '已关注'),
    });

    const deleteMutation = useMutation({
      mutationFn: () => deleteAnswer(item.id),
      onSuccess: () => {
        Alert.alert('删除成功', '你的回答已删除喵！');
        queryClient.invalidateQueries({ queryKey: ['question-answers'] });
      },
    });

    const handleDelete = () => {
      Alert.alert('确认删除', '确定要删除这个回答吗？', [
        { text: '取消', style: 'cancel' },
        {
          text: '确认删除',
          style: 'destructive',
          onPress: () => deleteMutation.mutate(),
        },
      ]);
    };

    return (
      <GestureDetector gesture={panGesture}>
        <View
          style={{
            backgroundColor: Colors[colorScheme].backgroundSecondary,
            borderRadius: 12,
            position: 'relative',
          }}
          className="p-4 mb-2.5 mx-1.5"
        >
          {/* Glowing border hint overlay */}
          <Reanimated.View
            style={[
              animatedBorderStyle,
              {
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                borderRadius: 12,
                borderWidth: 2,
                pointerEvents: 'none',
                zIndex: 999,
              },
            ]}
          />
          <View className="flex-row items-center mb-3 bg-transparent">
            <Pressable
              onPress={() =>
                item.author?.url_token &&
                router.push(`/user/${item.author.url_token}`)
              }
              className="flex-row flex-1 items-center bg-transparent"
            >
              <Image
                source={{ uri: item.author?.avatar_url }}
                className="w-[34px] h-[34px] rounded-[17px]"
              />
              <View className="flex-1 ml-2.5 bg-transparent">
                <Text className="text-[15px] font-bold">
                  {item.author?.name}
                </Text>
                <Text
                  type="secondary"
                  className="text-xs mt-0.5"
                  numberOfLines={1}
                >
                  {item.author?.headline}
                </Text>
              </View>
            </Pressable>
            {!item.relationship?.is_author && (
              <Pressable
                className="px-3 py-1.5 rounded-[15px]"
                style={[
                  !item.author?.is_following && {
                    backgroundColor: primaryTransparent,
                  },
                  item.author?.is_following && {
                    backgroundColor: 'transparent',
                    borderColor: Colors[colorScheme].border,
                    borderWidth: 1,
                  },
                ]}
                onPress={() => followMutation.mutate()}
                disabled={followMutation.isPending}
                accessibilityState={{ disabled: followMutation.isPending }}
              >
                <Text
                  className="text-[13px] font-bold"
                  style={[
                    item.author?.is_following
                      ? { color: Colors[colorScheme].textSecondary }
                      : { color: primaryColor },
                  ]}
                >
                  {item.author?.is_following ? '已关注' : '关注'}
                </Text>
              </Pressable>
            )}
          </View>

          <View className="mt-1 bg-transparent">
            {!isLongContent ? (
              // Short content: render directly
              <View className="flex-1 bg-transparent">
                <ZhihuContent
                  objectId={item.id.toString()}
                  type="answer"
                  content={item.content}
                  segmentInfos={item.segment_infos}
                  linkCardInfo={item.link_card_info}
                  useNative={true}
                />
                {MetaInfo}
              </View>
            ) : !isMounted ? (
              // Long content, never expanded: plain-text excerpt styled like ZhihuContent <p>
              <View className="flex-1 bg-transparent">
                {/* Text + gradient overlay in a relative container */}
                <View style={{ position: 'relative', height: 180 }}>
                  <View style={{ height: 180, overflow: 'hidden' }}>
                    <Text
                      style={{
                        fontSize: 17 * fontSizeScale,
                        lineHeight: 17 * lineHeightScale,
                        color: Colors[colorScheme].text,
                        marginBottom: 14,
                      }}
                    >
                      {excerpt}
                    </Text>
                  </View>
                  {/* Gradient fades out the bottom of the text, tap to expand */}
                  <Pressable
                    onPress={() => onToggle(item.id.toString(), true)}
                    style={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      bottom: 0,
                      height: 150,
                    }}
                  >
                    <LinearGradient
                      colors={[
                        colorScheme === 'dark'
                          ? 'rgba(30, 30, 34, 0)'
                          : 'rgba(255, 255, 255, 0)',
                        colorScheme === 'dark'
                          ? 'rgba(30, 30, 34, 1)'
                          : 'rgba(255, 255, 255, 1)',
                      ]}
                      style={{
                        flex: 1,
                        justifyContent: 'flex-end',
                        alignItems: 'center',
                        paddingBottom: 6,
                      }}
                    >
                      <Text
                        className="text-[13px] font-bold"
                        style={{ color: primaryColor }}
                      >
                        展开全文
                      </Text>
                    </LinearGradient>
                  </Pressable>
                </View>
                {MetaInfo}
              </View>
            ) : (
              // Long content, mounted (expanded at least once): full ZhihuContent with animation
              <View
                className="flex-1 bg-transparent"
                style={{ position: 'relative' }}
              >
                <Reanimated.View
                  style={[
                    animatedContentStyle,
                    { overflow: 'hidden', alignSelf: 'stretch' },
                  ]}
                  className="bg-transparent"
                >
                  <View
                    onLayout={(e) => {
                      const h = e.nativeEvent.layout.height;
                      if (h > 0) {
                        setMeasuredHeight(h);
                      }
                    }}
                    style={{ width: '100%' }}
                    className="bg-transparent"
                  >
                    <ZhihuContent
                      objectId={item.id.toString()}
                      type="answer"
                      content={item.content}
                      segmentInfos={item.segment_infos}
                      linkCardInfo={item.link_card_info}
                    />
                    {MetaInfo}
                    <Pressable
                      onPress={() =>
                        item?.id && onToggle(item.id.toString(), false)
                      }
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        paddingVertical: 10,
                        marginTop: 4,
                      }}
                    >
                      <Text
                        className="text-[13px] font-bold mr-1"
                        style={{ color: primaryColor }}
                      >
                        收起回答
                      </Text>
                      <Ionicons
                        name="chevron-up"
                        size={14}
                        color={primaryColor}
                      />
                    </Pressable>
                  </View>
                </Reanimated.View>

                <Reanimated.View
                  style={[
                    animatedReadMoreStyle,
                    {
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      bottom: 0,
                      height: 100,
                    },
                  ]}
                  pointerEvents={isExpanded ? 'none' : 'auto'}
                >
                  <Pressable
                    onPress={() => onToggle(item.id.toString(), true)}
                    className="absolute inset-0"
                  >
                    <LinearGradient
                      colors={[
                        colorScheme === 'dark'
                          ? 'rgba(30, 30, 34, 0)'
                          : 'rgba(255, 255, 255, 0)',
                        colorScheme === 'dark'
                          ? 'rgba(30, 30, 34, 1)'
                          : 'rgba(255, 255, 255, 1)',
                      ]}
                      style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        top: 0,
                        bottom: 0,
                        justifyContent: 'flex-end',
                        alignItems: 'center',
                        paddingBottom: 6,
                      }}
                    >
                      <Text
                        className="text-[13px] font-bold"
                        style={{ color: primaryColor }}
                      >
                        展开全文
                      </Text>
                    </LinearGradient>
                  </Pressable>
                </Reanimated.View>
              </View>
            )}
          </View>

          <NativeView
            ref={footerRef}
            className="flex-row items-center pt-1 px-1 bg-transparent"
          >
            <View className="flex-row items-center bg-transparent">
              <LikeButton
                id={item.id}
                count={item.voteup_count}
                voted={item.relationship?.voting}
                type="answers"
                variant="ghost"
              />
            </View>
            <BouncyButton
              className="flex-row items-center  bg-transparent py-1.5 px-3 rounded-full"
              onPress={() =>
                router.push({
                  pathname: '/comments/[id]',
                  params: {
                    id: item.id,
                    type: 'answer',
                    count: item.comment_count,
                  },
                })
              }
            >
              <Ionicons
                name="chatbubble-outline"
                size={16}
                color={Colors[colorScheme].iconMuted}
              />
              <Text type="secondary" className="ml-1 text-xs font-semibold">
                {item.comment_count > 0 ? item.comment_count : '0'}
              </Text>
            </BouncyButton>
            <BouncyButton
              className="flex-row items-center  bg-transparent py-1.5 px-3 rounded-full"
              onPress={() => toggleCollect(item.id, 'answer', isCollected)}
            >
              <Ionicons
                name={isCollected ? 'star' : 'star-outline'}
                size={16}
                color={
                  isCollected ? warningColor : Colors[colorScheme].iconMuted
                }
              />
              {displayCount > 0 && (
                <Text
                  className="ml-1 text-xs font-semibold"
                  style={{
                    color: isCollected
                      ? warningColor
                      : Colors[colorScheme].iconMuted,
                  }}
                >
                  {displayCount}
                </Text>
              )}
            </BouncyButton>
            {item.relationship?.is_author && (
              <BouncyButton
                className="p-2 bg-transparent"
                style={{ borderRadius: 99 }}
                onPress={handleDelete}
              >
                <Ionicons
                  name="trash-outline"
                  size={18}
                  color={Colors[colorScheme].danger}
                />
              </BouncyButton>
            )}
            <BouncyButton
              className="ml-auto p-2 bg-transparent"
              style={{ borderRadius: 99 }}
              onPress={() => onShare?.(item)}
            >
              <Ionicons
                name="share-social-outline"
                size={18}
                color={Colors[colorScheme].textSecondary}
              />
            </BouncyButton>
          </NativeView>
        </View>
      </GestureDetector>
    );
  },
);

const slowTransition = SharedTransition.duration(600);

export default function QuestionDetail() {
  const { id, title: initialTitle } = useLocalSearchParams<{
    id: string;
    title?: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const backgroundColor = Colors[colorScheme].background;
  const textColor = Colors[colorScheme].text;
  const queryClient = useQueryClient();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const screenTranslateX = useSharedValue(0);
  const scrollGesture = useMemo(() => Gesture.Native(), []);
  const [swipedAuthor, setSwipedAuthor] = useState<ZhihuAuthor | null>(null);

  const animatedScreenStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: screenTranslateX.value }],
    };
  });

  const animatedPreviewStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: screenTranslateX.value + screenWidth }],
    };
  });

  const handleSwipeComplete = (author: ZhihuAuthor) => {
    if (author?.url_token) {
      router.push(`/user/${author.url_token}`);
    }
    setTimeout(() => {
      screenTranslateX.value = 0;
      setSwipedAuthor(null);
    }, 500);
  };

  const [isRestored, setIsRestored] = useState(false);

  const [sortBy, setSortBy] = useState<AnswerSort>('default');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [_menuVisible, _setMenuVisible] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState<AnswerDetail | null>(
    null,
  );
  const [detailExpanded, setDetailExpanded] = useState(false);

  const itemRefs = useRef(new Map<string, AnswerItemHandle>());
  const {
    activeItem,
    viewableIdsRef,
    viewabilityConfig,
    onViewableItemsChanged,
  } = useViewableItems<AnswerDetail>();

  const storeFloatingCollected = useCollectionStore((state) =>
    activeItem?.id ? state.collectedStatusMap[activeItem.id.toString()] : false,
  );
  const isFloatingCollected =
    storeFloatingCollected !== undefined ? storeFloatingCollected : false;
  const storeFloatingOffset = useCollectionStore((state) =>
    activeItem?.id
      ? state.collectedStatusMap[activeItem.id.toString()] !== undefined
        ? state.collectedCountOffsetMap[activeItem.id.toString()] || 0
        : 0
      : 0,
  );
  const displayFloatingCount =
    (activeItem?.favlists_count || 0) + storeFloatingOffset;
  const { toggleCollect: toggleFloatingCollect } = useCollectionAction();

  const footerAnim = useSharedValue(0);

  const isFloatingShown = useRef(false);
  const flashListRef = useRef<FlashListRef<AnswerDetail>>(null);
  const {
    data: answersData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
    isRefetching,
    isPending: answersPending,
    isError: answersError,
  } = useZhihuInfiniteQuery<QuestionAnswersResponse>({
    queryKey: ['question-answers', id, sortBy],
    queryFn: async ({ pageParam = 0 }) => {
      const include =
        'data[*].content,excerpt,voteup_count,comment_count,favlists_count,author.name,author.avatar_url,author.headline,author.is_following,relationship.voting,relationship.is_author,created_time,updated_time,ip_info,segment_infos';
      const res = await client.get<QuestionAnswersResponse>(
        `/questions/${id}/answers?include=${include}&limit=20&offset=${pageParam}&sort_by=${sortBy}`,
      );
      return res.data;
    },
    initialPageParam: 0,
  });

  const handleRefresh = useCallback(() => {
    return refreshInfiniteQuery(
      queryClient,
      ['question-answers', id, sortBy],
      refetch,
    );
  }, [queryClient, id, sortBy, refetch]);

  const answers = useMemo(() => {
    const all = answersData?.pages.flatMap((page) => page.data) || [];
    const seen = new Set<string>();
    return all.filter((item) => {
      const id = item?.id?.toString();
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }, [answersData]);

  const enableBrowseHistory = useSettingsStore((s) => s.enableBrowseHistory);

  const recordedAnswerIds = useRef(new Set<string>());

  const handleToggleExpand = useCallback(
    (id: string, expanded: boolean) => {
      setExpandedIds((prev) => {
        const next = new Set(prev);
        if (expanded) next.add(id);
        else next.delete(id);
        return next;
      });

      if (
        expanded &&
        enableBrowseHistory &&
        !recordedAnswerIds.current.has(id)
      ) {
        recordedAnswerIds.current.add(id);
        addReadHistory({ content_token: id, content_type: 'answer' });
      }

      if (!expanded) {
        // Collapsing: scroll back to the item to prevent losing context
        // Use setTimeout to ensure the list has updated its layout
        setTimeout(() => {
          const index = answers.findIndex(
            (answer) => answer.id.toString() === id,
          );
          if (index >= 0) {
            flashListRef.current?.scrollToIndex({
              index: index,
              animated: true,
              viewOffset: insets.top + 50, // Match header height exactly
            });
          }
        }, 100);
      }
    },
    [answers, insets.top, enableBrowseHistory],
  );

  const getShareLink = (answer: AnswerDetail) => {
    const aid = answer?.id;
    return `https://www.zhihu.com/question/${id}/answer/${aid}`;
  };

  const lastCheckTime = useRef(0);

  const handleScrollEffects = useCallback(
    (currentY: number) => {
      // if (!qLoading && isRestored && currentY > 0) {
      //   saveProgress(id as string, currentY);
      // }

      const now = Date.now();

      if (now - lastCheckTime.current > 100) {
        lastCheckTime.current = now;
        const currentViewableIds = viewableIdsRef.current;
        let anyFooterVisible = false;
        const promises: Promise<boolean>[] = [];

        currentViewableIds.forEach((id) => {
          const ref = itemRefs.current.get(id);
          if (ref) {
            promises.push(
              new Promise((resolve) => {
                ref.measureFooter(
                  (_x: number, y: number, _w: number, _h: number) => {
                    const isVisible =
                      y > insets.top + 40 && y < screenHeight - 40;
                    resolve(isVisible);
                  },
                );
              }),
            );
          }
        });

        Promise.all(promises).then((results) => {
          anyFooterVisible = results.some((r) => r === true);
          const shouldShow = Boolean(
            !anyFooterVisible &&
              activeItem &&
              expandedIds.has(activeItem.id.toString()) &&
              currentY > 300,
          );

          if (shouldShow !== isFloatingShown.current) {
            isFloatingShown.current = shouldShow;
            footerAnim.value = withTiming(shouldShow ? 1 : 0, {
              duration: 220,
            });
          }
        });
      }
    },
    [
      activeItem,
      expandedIds,
      footerAnim,
      insets.top,
      screenHeight,
      viewableIdsRef,
    ],
  );

  const { headerVisible, handleScroll } = useScrollHeaderAnim(
    400,
    handleScrollEffects,
    100,
  );

  const headerAnimatedStyle = useAnimatedStyle(() => ({
    opacity: headerVisible.value,
    transform: [
      {
        translateY: interpolate(
          headerVisible.value,
          [0, 1],
          [-insets.top - 120, 0],
        ),
      },
    ],
  }));

  const footerAnimatedStyle = useAnimatedStyle(() => ({
    opacity: footerAnim.value,
    transform: [
      {
        translateY: interpolate(footerAnim.value, [0, 1], [100, 0]),
      },
    ],
  }));

  const primaryColor = useThemeColor({}, 'primary');
  const primaryTransparent = useThemeColor({}, 'primaryTransparent');

  const {
    data: question,
    isLoading: qLoading,
    isError: questionError,
    refetch: refetchQuestion,
  } = useQuery({
    queryKey: ['question', id],
    queryFn: async () => await getQuestion(id as string),
  });

  const followMutation = useOptimisticToggle<ZhihuQuestionDetail>({
    queryKey: ['question', id],
    isActive: question?.relationship?.is_following,
    mutationFn: async () => {
      if (question?.relationship?.is_following)
        return unfollowQuestion(id as string);
      return followQuestion(id as string);
    },
    onUpdateCache: (old) => ({
      ...old,
      relationship: {
        ...old?.relationship,
        is_following: !old?.relationship?.is_following,
      },
      follower_count: old.relationship?.is_following
        ? Math.max(0, (old.follower_count ?? 0) - 1)
        : (old.follower_count ?? 0) + 1,
    }),
    successMessage: (isActive) => (isActive ? '已取消关注' : '已关注问题'),
  });

  // 恢复进度逻辑已禁用
  React.useEffect(() => {
    if (!qLoading && question && answers.length > 0 && !isRestored) {
      setIsRestored(true);
      /*
      const savedProgress = getProgress(id as string);
      if (savedProgress > 0) {
        setTimeout(() => {
          flashListRef.current?.scrollToOffset({
            offset: savedProgress,
            animated: false,
          });
          setIsRestored(true);
        }, 300); // Question page is heavier, give it more time
      } else {
        setIsRestored(true);
      }
      */
    }
  }, [qLoading, question, answers.length, isRestored]);

  React.useEffect(() => {
    if (enableBrowseHistory && question?.id) {
      addReadHistory({
        content_token: String(question.id),
        content_type: 'question',
      });
    }
  }, [enableBrowseHistory, question?.id]);

  const renderHeader = useMemo(
    () => (
      <View
        type="surface"
        className="p-5 mb-4 rounded-b-[24px]"
        style={{ paddingTop: insets.top + 50 }}
      >
        <Reanimated.View
          sharedTransitionTag={`title-${id}`}
          sharedTransitionStyle={slowTransition}
          className="bg-transparent"
        >
          <Text className="text-[21px] font-bold leading-7">
            {question?.title || initialTitle || '加载中...'}
          </Text>
        </Reanimated.View>
        {qLoading ? (
          <View className="h-[100px] justify-center bg-transparent">
            <ActivityIndicator size="small" color={primaryColor} />
          </View>
        ) : questionError && !question ? (
          <QueryErrorView
            compact
            message="问题详情加载失败"
            onRetry={() => void refetchQuestion()}
          />
        ) : (
          <>
            {question?.topics && (
              <View className="flex-row flex-wrap mb-2.5 mt-2 bg-transparent">
                {question.topics.map((topic) => (
                  <Pressable
                    key={topic.id}
                    onPress={() => router.push(`/topic/${topic.id}`)}
                    className="px-2.5 py-1 rounded-[15px] mr-2 mb-1"
                    style={{ backgroundColor: primaryTransparent }}
                  >
                    <Text className="text-xs" style={{ color: primaryColor }}>
                      {topic.name}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
            {question?.detail ? (
              <View className="mt-2.5 bg-transparent">
                {detailExpanded ? (
                  <View className="bg-transparent">
                    <ZhihuContent
                      content={question.detail}
                      objectId={id as string}
                      type="question"
                    />
                    <Pressable
                      onPress={() => setDetailExpanded(false)}
                      className="flex-row items-center justify-center py-1 mt-1"
                    >
                      <Text
                        style={{ color: primaryColor }}
                        className="text-[13px] font-bold mr-1"
                      >
                        收起
                      </Text>
                      <Ionicons
                        name="chevron-up"
                        size={14}
                        color={primaryColor}
                      />
                    </Pressable>
                  </View>
                ) : (
                  <Pressable onPress={() => setDetailExpanded(true)}>
                    <Text type="secondary" className="text-sm leading-5">
                      {question.excerpt?.replace(/<[^>]+>/g, '') || ''}
                    </Text>
                    <Text
                      style={{ color: primaryColor }}
                      className="text-[13px] font-bold mt-1"
                    >
                      展开全文
                    </Text>
                  </Pressable>
                )}
              </View>
            ) : question?.excerpt ? (
              <Text type="secondary" className="mt-2.5 text-sm leading-5">
                {question.excerpt.replace(/<[^>]+>/g, '')}
              </Text>
            ) : null}
            <View className="mt-3 bg-transparent">
              <Text type="secondary" className="text-[13px]">
                {question?.follower_count || 0} 关注 ·{' '}
                {question?.visit_count || 0} 浏览
              </Text>
            </View>
            <View className="flex-row mt-[15px] gap-2.5 bg-transparent">
              <Pressable
                className="flex-1 flex-row items-center justify-center py-2 rounded-md"
                style={[
                  { backgroundColor: primaryTransparent },
                  question?.relationship?.is_following && {
                    backgroundColor: 'transparent',
                    borderWidth: 1,
                    borderColor: Colors[colorScheme].border,
                  },
                ]}
                onPress={() => followMutation.mutate()}
                disabled={followMutation.isPending}
                accessibilityState={{ disabled: followMutation.isPending }}
              >
                <Text
                  className="text-sm font-medium"
                  style={[
                    question?.relationship?.is_following
                      ? { color: Colors[colorScheme].textSecondary }
                      : { color: primaryColor },
                  ]}
                >
                  {question?.relationship?.is_following ? '已关注' : '关注问题'}
                </Text>
              </Pressable>
              <Pressable
                className="flex-1 flex-row items-center justify-center py-2 rounded-md"
                style={{ backgroundColor: primaryTransparent }}
                onPress={() =>
                  router.push({
                    pathname: '/comments/[id]',
                    params: {
                      id,
                      type: 'question',
                      count: question?.comment_count || 0,
                    },
                  })
                }
              >
                <Text
                  className="text-sm font-medium"
                  style={{ color: primaryColor }}
                >
                  {question?.comment_count || 0} 条评论
                </Text>
              </Pressable>
              <Pressable
                className="flex-1 flex-row items-center justify-center py-2 rounded-md"
                style={{ backgroundColor: primaryTransparent }}
                onPress={() => router.push(`/question/write/${id}`)}
              >
                <Text
                  className="text-sm font-medium"
                  style={{ color: primaryColor }}
                >
                  写回答
                </Text>
              </Pressable>
            </View>
            <View className="mt-[15px] pt-3 flex-row justify-between items-center bg-transparent">
              <Text className="font-medium text-[15px]">
                {question?.answer_count || 0} 个回答
              </Text>
              <View className="flex-row items-center bg-transparent">
                <Pressable
                  onPress={() => setSortBy('default')}
                  className="ml-[15px] px-1 py-0.5"
                  style={[
                    sortBy === 'default' && {
                      borderBottomWidth: 2,
                      borderBottomColor: primaryColor,
                    },
                  ]}
                >
                  <Text
                    type={sortBy === 'default' ? 'primary' : 'secondary'}
                    className="text-[13px]"
                    style={[sortBy === 'default' && { fontWeight: 'bold' }]}
                  >
                    默认
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setSortBy('created')}
                  className="ml-[15px] px-1 py-0.5"
                  style={[
                    sortBy === 'created' && {
                      borderBottomWidth: 2,
                      borderBottomColor: primaryColor,
                    },
                  ]}
                >
                  <Text
                    type={sortBy === 'created' ? 'primary' : 'secondary'}
                    className="text-[13px]"
                    style={[sortBy === 'created' && { fontWeight: 'bold' }]}
                  >
                    时间
                  </Text>
                </Pressable>
              </View>
            </View>
          </>
        )}
      </View>
    ),
    [
      qLoading,
      question,
      id,
      initialTitle,
      insets.top,
      sortBy,
      followMutation.mutate,
      followMutation.isPending,
      colorScheme,
      detailExpanded,
      primaryColor,
      primaryTransparent,
      questionError,
      refetchQuestion,
      router.push,
    ],
  );

  return (
    <View type="default" className="flex-1">
      <Stack.Screen options={{ headerShown: false }} />

      <ShareMenu
        visible={isSharing}
        onClose={() => {
          setIsSharing(false);
          setSelectedAnswer(null);
        }}
        type="answer"
        data={
          selectedAnswer
            ? {
                id: selectedAnswer.id,
                title: question?.title,
                author: selectedAnswer.author?.name,
                authorHeadline: selectedAnswer.author?.headline,
                url: getShareLink(selectedAnswer),
              }
            : null
        }
      />

      <Reanimated.View style={[{ flex: 1 }, animatedScreenStyle]}>
        {/* 顶部标题栏 */}
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
            className="flex-row items-start bg-transparent"
            style={{
              minHeight: 56,
              paddingTop: 17,
              paddingBottom: 8,
              paddingLeft: 52,
              paddingRight: 16,
            }}
          >
            <Text
              className="flex-1 text-[16px] font-bold text-left"
              style={{ color: textColor, lineHeight: 22 }}
            >
              {question?.title || initialTitle}
            </Text>
          </View>
        </Reanimated.View>

        {/* 返回按钮 */}
        <Pressable
          onPress={() => router.back()}
          className="absolute left-2.5 z-[100] w-10 h-10 justify-center items-center"
          style={{ top: insets.top + 8 }}
        >
          <Ionicons name="chevron-back" size={28} color={textColor} />
        </Pressable>

        <GestureDetector gesture={scrollGesture}>
          <AnimatedFlashList<AnswerDetail>
            ref={flashListRef}
            onScroll={handleScroll}
            data={qLoading ? [] : answers}
            ListHeaderComponent={renderHeader}
            renderItem={({ item }) => (
              <AnswerItem
                ref={(r) => {
                  const answerId = item.id.toString();
                  if (r) itemRefs.current.set(answerId, r);
                  else itemRefs.current.delete(answerId);
                }}
                item={item}
                isExpanded={
                  item?.id ? expandedIds.has(item.id.toString()) : false
                }
                onToggle={handleToggleExpand}
                onShare={(ans) => {
                  setSelectedAnswer(ans);
                  setIsSharing(true);
                }}
                questionId={id}
                sortBy={sortBy}
                screenTranslateX={screenTranslateX}
                scrollGesture={scrollGesture}
                onSwipeStart={setSwipedAuthor}
                onSwipeComplete={handleSwipeComplete}
                onSwipeCancel={() => setSwipedAuthor(null)}
              />
            )}
            keyExtractor={(item) => `ans-${item.id.toString()}`}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
            onEndReached={() =>
              hasNextPage && !isFetchingNextPage && fetchNextPage()
            }
            onEndReachedThreshold={0.5}
            ListEmptyComponent={
              qLoading ? null : answersPending ? (
                <ActivityIndicator
                  style={{ marginTop: 60 }}
                  color={primaryColor}
                />
              ) : answersError ? (
                <QueryErrorView
                  message="回答列表加载失败"
                  onRetry={() => void refetch()}
                />
              ) : (
                <Text type="secondary" className="text-center mt-16 text-sm">
                  暂无回答
                </Text>
              )
            }
            ListFooterComponent={() =>
              isFetchingNextPage ? (
                <ActivityIndicator
                  style={{ marginVertical: 20 }}
                  color={primaryColor}
                />
              ) : answers?.length > 0 && !hasNextPage ? (
                <Text type="secondary" className="text-center my-5">
                  — 没有更多回答了 —
                </Text>
              ) : null
            }
            onRefresh={handleRefresh}
            refreshing={isRefetching}
          />
        </GestureDetector>

        <Reanimated.View
          className="absolute left-5 right-5 h-[54px] rounded-[27px] overflow-hidden z-[1000] shadow-black/20 shadow-lg elevation-10"
          style={[
            {
              bottom: insets.bottom,
            },
            footerAnimatedStyle,
          ]}
        >
          <BlurView
            intensity={95}
            tint={colorScheme}
            className="flex-1"
            style={{
              backgroundColor:
                colorScheme === 'dark'
                  ? 'rgba(26,26,26,0.8)'
                  : 'rgba(255,255,255,0.85)',
            }}
          >
            <View className="flex-1 flex-row items-center px-5 justify-between bg-transparent">
              <View className="flex-row items-center bg-transparent">
                <LikeButton
                  id={activeItem?.id ?? ''}
                  count={activeItem?.voteup_count || 0}
                  voted={activeItem?.relationship?.voting}
                  type="answers"
                  variant="ghost"
                />
                <Pressable
                  className="flex-row items-center ml-5 bg-transparent"
                  onPress={() => {
                    if (!activeItem) return;
                    router.push({
                      pathname: '/comments/[id]',
                      params: {
                        id: activeItem.id,
                        type: 'answer',
                        count: activeItem.comment_count,
                      },
                    });
                  }}
                >
                  <Ionicons
                    name="chatbubble-outline"
                    size={20}
                    color={Colors[colorScheme].textSecondary}
                  />
                  <Text
                    className=" text-sm font-bold"
                    style={{ color: Colors[colorScheme].textSecondary }}
                  >
                    {activeItem?.comment_count || 0}
                  </Text>
                </Pressable>

                <Pressable
                  className="flex-row items-center ml-5 bg-transparent"
                  onPress={() =>
                    activeItem?.id &&
                    toggleFloatingCollect(
                      activeItem.id,
                      'answer',
                      isFloatingCollected,
                    )
                  }
                >
                  <Ionicons
                    name={isFloatingCollected ? 'star' : 'star-outline'}
                    size={20}
                    color={
                      isFloatingCollected
                        ? Colors[colorScheme].warningAccent
                        : Colors[colorScheme].textSecondary
                    }
                  />
                  {displayFloatingCount > 0 && (
                    <Text
                      className=" text-sm font-bold"
                      style={{
                        color: isFloatingCollected
                          ? Colors[colorScheme].warningAccent
                          : Colors[colorScheme].textSecondary,
                      }}
                    >
                      {displayFloatingCount}
                    </Text>
                  )}
                </Pressable>

                {activeItem?.id &&
                  expandedIds.has(activeItem.id.toString()) && (
                    <Pressable
                      className="flex-row items-center ml-5 bg-transparent"
                      onPress={() =>
                        handleToggleExpand(activeItem.id.toString(), false)
                      }
                    >
                      <Ionicons
                        name="chevron-up-circle-outline"
                        size={20}
                        color={primaryColor}
                      />
                      <Text
                        className=" text-sm font-bold"
                        style={{ color: primaryColor }}
                      >
                        收起
                      </Text>
                    </Pressable>
                  )}
              </View>
              <Pressable
                className="flex-row items-center bg-transparent"
                onPress={() => {
                  setSelectedAnswer(activeItem);
                  setIsSharing(true);
                }}
              >
                <Ionicons
                  name="share-outline"
                  size={22}
                  color={Colors[colorScheme].textSecondary}
                />
              </Pressable>
            </View>
          </BlurView>
        </Reanimated.View>
      </Reanimated.View>

      {/* Immersive profile preview panel pulled from the right */}
      {swipedAuthor && (
        <Reanimated.View
          style={[
            {
              position: 'absolute',
              top: 0,
              bottom: 0,
              width: screenWidth,
              backgroundColor: Colors[colorScheme].background,
              zIndex: 9999,
              paddingTop: insets.top + 60,
              paddingHorizontal: 25,
            },
            animatedPreviewStyle,
          ]}
        >
          <View className="items-center bg-transparent mt-10">
            <Image
              source={{ uri: swipedAuthor.avatar_url }}
              style={{ width: 90, height: 90, borderRadius: 45 }}
            />
            <Text
              className="text-xl font-bold mt-4"
              style={{ color: textColor }}
            >
              {swipedAuthor.name}
            </Text>
            {swipedAuthor.headline ? (
              <Text
                type="secondary"
                className="text-center mt-2 px-5 text-sm"
                numberOfLines={2}
              >
                {swipedAuthor.headline}
              </Text>
            ) : null}

            <View
              className="mt-10 px-5 py-2.5 rounded-full flex-row items-center"
              style={{
                backgroundColor: Colors[colorScheme].backgroundTertiary,
              }}
            >
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: '600',
                  color: Colors[colorScheme].textSecondary,
                  marginRight: 6,
                }}
              >
                正在载入个人主页
              </Text>
              <Ionicons
                name="arrow-forward"
                size={16}
                color={Colors[colorScheme].textSecondary}
              />
            </View>
          </View>
        </Reanimated.View>
      )}

      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
    </View>
  );
}
