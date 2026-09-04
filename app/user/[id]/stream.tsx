import { Ionicons } from '@expo/vector-icons';
import {
  FlashList,
  type FlashListRef,
  type ListRenderItemInfo,
  type ViewToken,
} from '@shopify/flash-list';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Image,
  LayoutAnimation,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  View as NativeView,
  Platform,
  Pressable,
  UIManager,
  useWindowDimensions,
} from 'react-native';
import Reanimated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  getMemberActivities,
  getMemberRelations,
  getMemberWithFallback,
} from '@/api/zhihu';
import type { ZhihuMemberActivity } from '@/api/zhihu/member';
import { BouncyButton } from '@/components/BouncyButton';
import { LikeButton } from '@/components/LikeButton';
import { QueryErrorView } from '@/components/QueryErrorView';
import { ShareMenu } from '@/components/ShareMenu';
import { Text, useThemeColor, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { ZhihuContent } from '@/features/rich-content';
import { useCollectionAction } from '@/hooks/useCollectionAction';
import { useCollectionStore } from '@/store/useCollectionStore';
import type { ZhihuMemberRelation } from '@/types/zhihu';
import { formatDate } from '@/utils/date';
import { getNextPageOffset } from '@/utils/userProfile';

type StreamTab = 'activities' | 'answers' | 'questions' | 'articles' | 'pins';
type StreamItemType = 'answer' | 'article' | 'question' | 'pin' | 'video';
type StreamApiItem = ZhihuMemberActivity | ZhihuMemberRelation;

interface StreamContentSegment {
  type?: string;
  content?: string;
  data_draft_title?: string;
}

interface StreamContentItem {
  id: string | number;
  type?: string;
  url?: string;
  title?: string;
  content?: string | StreamContentSegment[];
  excerpt?: string;
  voteup_count?: number;
  like_count?: number;
  reaction_count?: number;
  comment_count?: number;
  favlists_count?: number;
  favlistsCount?: number;
  favorite_count?: number;
  answer_count?: number;
  follower_count?: number;
  created?: number;
  created_time?: number;
  updated?: number;
  updated_time?: number;
  link_card_info?: Record<string, string>;
  author?: { name?: string; headline?: string };
  question?: { id?: string | number; title?: string };
  relationship?: { voting?: number };
  reaction?: {
    statistics?: {
      favorites?: number;
      like_count?: number;
    };
  };
}

interface StreamItemHandle {
  measureFooter: (
    callback: (x: number, y: number, width: number, height: number) => void,
  ) => void;
  id: string;
}

interface StreamItemProps {
  item: StreamContentItem;
  type: StreamItemType;
  isExpanded: boolean;
  onToggle: (id: string, expanded: boolean) => void;
  onShare: (item: StreamContentItem) => void;
  isHighlighted: boolean;
  isCollapsedHighlighted?: boolean;
}

function getDisplayItem(
  item: StreamApiItem,
  activeTab: StreamTab,
): StreamContentItem | null {
  const candidate =
    activeTab === 'activities' && 'target' in item && item.target
      ? item.target
      : item;

  if (!candidate || typeof candidate !== 'object' || !('id' in candidate)) {
    return null;
  }
  if (candidate.id === null || candidate.id === undefined) return null;

  return candidate as StreamContentItem;
}

function normalizeStreamTab(type: string | undefined): StreamTab {
  return type === 'activities' ||
    type === 'answers' ||
    type === 'questions' ||
    type === 'articles' ||
    type === 'pins'
    ? type
    : 'answers';
}

const StreamItem = forwardRef<StreamItemHandle, StreamItemProps>(
  (
    {
      item,
      type,
      isExpanded,
      onToggle,
      onShare,
      isCollapsedHighlighted,
    }: StreamItemProps,
    ref,
  ) => {
    const colorScheme = useColorScheme();
    const router = useRouter();
    const footerRef = useRef<NativeView>(null);

    const warningColor = useThemeColor({}, 'warning');
    const primaryColor = useThemeColor({}, 'primary');
    const isCollectable = type === 'answer' || type === 'article';
    const storeCollected = useCollectionStore((state) =>
      item?.id ? state.collectedStatusMap[item.id.toString()] : false,
    );
    const isCollected = storeCollected !== undefined ? storeCollected : false;
    const storeOffset = useCollectionStore((state) =>
      item?.id ? state.collectedCountOffsetMap[item.id.toString()] || 0 : 0,
    );
    const displayCount =
      (item?.favlists_count ??
        item?.favlistsCount ??
        item?.favorite_count ??
        item?.reaction?.statistics?.favorites ??
        0) + storeOffset;
    const { toggleCollect } = useCollectionAction();

    useImperativeHandle(ref, () => ({
      measureFooter: (callback) => footerRef.current?.measureInWindow(callback),
      id: item.id.toString(),
    }));

    const getFullContent = () => {
      if (!item) return '';
      if (type === 'pin' && Array.isArray(item.content)) {
        return item.content
          .map((segment) => {
            if (segment.type === 'text') return segment.content;
            if (segment.type === 'link_card')
              return `[链接: ${segment.data_draft_title || '查看详情'}]`;
            return '';
          })
          .join('\n')
          .replace(/<[^>]+>/g, '');
      }
      const content = item.content || item.excerpt || '';
      if (typeof content === 'string') {
        return content.replace(/<[^>]+>/g, '');
      }
      return '';
    };

    const getExcerpt = () => {
      if (!item) return '';

      if (type === 'pin') {
        if (Array.isArray(item.content)) {
          return item.content
            .filter((segment) => segment.type === 'text')
            .map((segment) => segment.content)
            .join('')
            .replace(/<[^>]+>/g, '')
            .substring(0, 100);
        }
        if (typeof item.content === 'string') {
          return item.content.replace(/<[^>]+>/g, '').substring(0, 100);
        }
      }

      const content = item.excerpt || item.content || '';
      if (typeof content === 'string') {
        return content.replace(/<[^>]+>/g, '').substring(0, 100);
      }
      return '';
    };

    const getTitle = () => {
      if (type === 'pin') return '发布了想法';
      if (type === 'video') return item.title || '发布了视频';
      return item.title || item.question?.title || '未知内容';
    };

    const handlePress = () => {
      if (type === 'answer' || type === 'article' || type === 'pin') {
        onToggle(item.id.toString(), !isExpanded);
        return;
      }
      if (type === 'video') {
        router.push({
          pathname: '/video/[id]',
          params: { id: item.id, title: item.title },
        });
      } else {
        router.push({
          pathname: `/${type}/[id]`,
          params: {
            id: item.id,
            title: item.title || item.question?.title,
            questionId: item.question?.id,
          },
        });
      }
    };

    const fullText = getFullContent();
    const isLongContent =
      (type === 'answer' || type === 'article' || type === 'pin') &&
      (fullText.length > 120 ||
        (typeof item.content === 'string' &&
          (item.content.includes('<img') || item.content.includes('<figure'))));
    const itemTimestamp =
      item.updated_time ?? item.updated ?? item.created_time ?? item.created;

    return (
      <BouncyButton
        onPress={handlePress}
        style={[
          {
            backgroundColor: Colors[colorScheme].backgroundSecondary,
            borderRadius: 12,
            borderWidth: 1.5,
            borderColor: isCollapsedHighlighted ? primaryColor : 'transparent',
          },
          isCollapsedHighlighted && {
            shadowColor: primaryColor,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.3,
            shadowRadius: 6,
            elevation: 5,
          },
        ]}
        className="p-4 mb-2.5"
      >
        <Reanimated.View
          sharedTransitionTag={`title-${item.question?.id || item.id}`}
        >
          <Text
            className="text-lg font-bold mb-1.5 leading-6 text-foreground dark:text-foreground-dark"
            numberOfLines={isExpanded ? undefined : 2}
          >
            {getTitle()}
          </Text>
        </Reanimated.View>

        <View className="bg-transparent mt-1">
          {!isLongContent ? (
            <View className="flex-1 bg-transparent">
              {type === 'answer' || type === 'article' || type === 'pin' ? (
                <ZhihuContent
                  objectId={item.id?.toString()}
                  type={type === 'pin' ? 'pin' : type}
                  content={
                    typeof item.content === 'string' ? item.content : undefined
                  }
                  contentArray={
                    type === 'pin' && Array.isArray(item.content)
                      ? item.content
                      : undefined
                  }
                  linkCardInfo={item.link_card_info}
                  useNative={true}
                />
              ) : (
                <Text
                  type="secondary"
                  className="text-[17px]"
                  style={{ lineHeight: 27 }}
                  numberOfLines={3}
                >
                  {getExcerpt()}
                </Text>
              )}
            </View>
          ) : isExpanded ? (
            <View className="flex-1 bg-transparent">
              <ZhihuContent
                objectId={item.id?.toString()}
                type={type === 'pin' ? 'pin' : type}
                content={
                  typeof item.content === 'string' ? item.content : undefined
                }
                contentArray={
                  type === 'pin' && Array.isArray(item.content)
                    ? item.content
                    : undefined
                }
                linkCardInfo={item.link_card_info}
                useNative={true}
              />
              <BouncyButton
                onPress={() => item?.id && onToggle(item.id.toString(), false)}
                className="flex-row items-center justify-center py-2.5 mt-1 bg-transparent"
              >
                <Text
                  type="primary"
                  className="text-[13px] font-bold mr-1"
                  style={{ color: primaryColor }}
                >
                  收起
                  {type === 'answer'
                    ? '回答'
                    : type === 'article'
                      ? '文章'
                      : '想法'}
                </Text>
                <Ionicons name="chevron-up" size={14} color={primaryColor} />
              </BouncyButton>
            </View>
          ) : (
            <Pressable
              onPress={() => item?.id && onToggle(item.id.toString(), true)}
              style={{ maxHeight: 150, overflow: 'hidden' }}
              className="flex-1"
            >
              <Text
                type="secondary"
                className="text-[17px]"
                style={{ lineHeight: 27 }}
                numberOfLines={5}
              >
                {getExcerpt()}
              </Text>
              <Pressable
                onPress={() => item?.id && onToggle(item.id.toString(), true)}
                className="absolute inset-x-0 bottom-0 h-24 z-[100]"
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
                    type="primary"
                    className="text-[13px] font-bold"
                    style={{ color: primaryColor }}
                  >
                    展开全文
                  </Text>
                </LinearGradient>
              </Pressable>
            </Pressable>
          )}
        </View>

        <NativeView
          ref={footerRef}
          className="flex-row justify-between mt-4 items-center bg-transparent"
        >
          {type !== 'question' && type !== 'video' ? (
            <View className="flex-row items-center bg-transparent">
              <LikeButton
                id={item.id}
                count={
                  item.voteup_count ??
                  (type === 'pin'
                    ? item.reaction_count || item.like_count
                    : 0) ??
                  0
                }
                voted={item.relationship?.voting || 0}
                type={
                  type === 'article'
                    ? 'articles'
                    : type === 'pin'
                      ? 'pins'
                      : 'answers'
                }
                variant="ghost"
              />
              <BouncyButton
                onPress={() => {
                  const commentType =
                    type === 'article'
                      ? 'article'
                      : type === 'pin'
                        ? 'pin'
                        : 'answer';
                  router.push(
                    `/comments/${item.id}?type=${commentType}&count=${item.comment_count || 0}`,
                  );
                }}
                className="flex-row items-center justify-center ml-3 p-2 rounded-full bg-transparent"
              >
                <Ionicons
                  name="chatbubble-outline"
                  size={16}
                  color={Colors[colorScheme].iconMuted}
                />
                <Text className="text-muted ml-1 text-xs font-semibold">
                  {(item.comment_count ?? 0) > 0 ? item.comment_count : '评论'}
                </Text>
              </BouncyButton>
              {isCollectable && (
                <BouncyButton
                  onPress={() => toggleCollect(item.id, type, isCollected)}
                  className="flex-row items-center justify-center ml-3 p-2 rounded-full bg-transparent"
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
              )}
            </View>
          ) : (
            <Text
              type="secondary"
              className="text-xs text-tertiary dark:text-tertiary-dark"
            >
              {type === 'question'
                ? `${item.answer_count || 0} 回答 · ${item.follower_count || 0} 关注`
                : `${item.reaction?.statistics?.like_count || item.voteup_count || 0} 赞同 · ${item.comment_count || 0} 评论`}
            </Text>
          )}

          <View className="flex-row items-center bg-transparent ml-auto">
            <Text
              type="secondary"
              className="text-xs text-tertiary dark:text-tertiary-dark mr-3"
            >
              {itemTimestamp ? formatDate(itemTimestamp) : ''}
            </Text>
            <BouncyButton
              onPress={() => onShare(item)}
              className="p-1 -mr-1 bg-transparent"
            >
              <Ionicons
                name="ellipsis-horizontal"
                size={18}
                color={Colors[colorScheme].iconMuted}
              />
            </BouncyButton>
          </View>
        </NativeView>
      </BouncyButton>
    );
  },
);

export default function UserStreamScreen() {
  const { id, type, initialId } = useLocalSearchParams<{
    id: string;
    type: string;
    initialId?: string;
  }>();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const primaryColor = useThemeColor({}, 'primary');
  const insets = useSafeAreaInsets();
  const flashListRef = useRef<FlashListRef<StreamApiItem>>(null);
  const [hasScrolledToInitial, setHasScrolledToInitial] = useState(false);

  const activeTab = normalizeStreamTab(type);

  const { height: screenHeight } = useWindowDimensions();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [isSharing, setIsSharing] = useState(false);
  const [selectedAnswer, setSelectedAnswer] =
    useState<StreamContentItem | null>(null);

  const footerAnim = useSharedValue(0);
  const isFloatingShown = useRef(false);
  const lastCheckTime = useRef(0);
  const itemRefs = useRef(new Map<string, StreamItemHandle | null>());
  const itemLayouts = useRef(new Map<string, { y: number; height: number }>());
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  const [activeItem, setActiveItem] = useState<StreamContentItem | null>(null);
  const viewableIdsRef = useRef<string[]>([]);
  const viewabilityConfig = useRef({
    viewAreaCoveragePercentThreshold: 20,
  }).current;

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken<StreamApiItem>[] }) => {
      const ids: string[] = [];
      let firstActive: StreamContentItem | null = null;

      viewableItems.forEach((viewToken) => {
        if (viewToken.item) {
          const displayItem = getDisplayItem(viewToken.item, activeTab);
          if (displayItem) {
            const idStr = displayItem.id.toString();
            ids.push(idStr);
            if (!firstActive) {
              firstActive = displayItem;
            }
          }
        }
      });

      viewableIdsRef.current = ids;
      if (firstActive) {
        setActiveItem(firstActive);
      }
    },
  ).current;

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const currentY = event.nativeEvent.contentOffset.y;
    const now = Date.now();

    if (now - lastCheckTime.current > 50) {
      lastCheckTime.current = now;

      if (activeItem?.id && expandedIds.has(activeItem.id.toString())) {
        const layout = itemLayouts.current.get(activeItem.id.toString());
        if (layout) {
          const headerHeight = 56;
          const viewportHeight =
            screenHeight - headerHeight - insets.top - insets.bottom;
          const footerRelY = layout.y + layout.height - currentY;

          // Footer is visible if its relative Y is within the viewport
          const isFooterVisible =
            footerRelY > 50 && footerRelY < viewportHeight - 20;
          const shouldShow = !isFooterVisible && currentY > 300;

          if (shouldShow !== isFloatingShown.current) {
            isFloatingShown.current = shouldShow;
            footerAnim.value = withSpring(shouldShow ? 1 : 0, {
              damping: 18,
              stiffness: 180,
            });
          }
        }
      } else {
        if (isFloatingShown.current) {
          isFloatingShown.current = false;
          footerAnim.value = withSpring(0, {
            damping: 18,
            stiffness: 180,
          });
        }
      }
    }
  };

  const footerAnimatedStyle = useAnimatedStyle(() => ({
    opacity: footerAnim.value,
    transform: [
      {
        translateY: 100 * (1 - footerAnim.value),
      },
    ],
  }));

  // 1. Fetch User Profile Details
  const {
    data: user,
    isLoading: isUserLoading,
    isError: isUserError,
    refetch: refetchUser,
  } = useQuery({
    queryKey: ['user-detail', id],
    queryFn: () => getMemberWithFallback(id),
  });

  // 2. Infinite Query for specific content type stream
  const {
    data: streamData,
    isLoading: streamLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isError: isStreamError,
    refetch: refetchStream,
  } = useInfiniteQuery({
    queryKey: ['user-stream', id, activeTab],
    queryFn: ({ pageParam = 0 }) => {
      const targetId = user?.url_token || id;
      if (activeTab === 'activities') {
        return getMemberActivities(targetId, 10, pageParam);
      }

      let include = '';
      if (activeTab === 'answers')
        include =
          'data[*].content,data[*].voteup_count,data[*].comment_count,data[*].created_time,data[*].updated_time,data[*].excerpt,data[*].question.title,data[*].relationship.voting,data[*].relationship.is_thanked';
      else if (activeTab === 'questions')
        include =
          'data[*].created,data[*].answer_count,data[*].follower_count,data[*].author,data[*].admin_closed_comment,data[*].relationship.is_following';
      else if (activeTab === 'articles')
        include =
          'data[*].comment_count,data[*].content,data[*].voteup_count,data[*].created,data[*].updated,data[*].title,data[*].excerpt,data[*].relationship.voting';
      else if (activeTab === 'pins')
        include =
          'data[*].content,data[*].reaction_count,data[*].comment_count,data[*].created,data[*].relationship.voting';

      return getMemberRelations(targetId, activeTab, {
        limit: 10,
        offset: pageParam,
        include,
      });
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      if (!lastPage || lastPage.paging?.is_end) return undefined;
      return getNextPageOffset(lastPage.paging?.next);
    },
    enabled: !!user,
  });

  const streamItems =
    streamData?.pages.flatMap((page) => page.data || []) || [];

  // Scroll to clicked/initial item if found in loaded stream
  useEffect(() => {
    if (initialId && streamItems.length > 0 && !hasScrolledToInitial) {
      const index = streamItems.findIndex((item) => {
        const displayItem = getDisplayItem(item, activeTab);
        return displayItem?.id.toString() === initialId.toString();
      });
      if (index !== -1) {
        setHasScrolledToInitial(true);
        setTimeout(() => {
          flashListRef.current?.scrollToIndex({
            index,
            animated: true,
            viewPosition: 0,
          });
        }, 300);
      }
    }
  }, [streamItems, initialId, hasScrolledToInitial, activeTab]);

  const handleToggleExpand = useCallback(
    (id: string, expanded: boolean) => {
      if (
        Platform.OS === 'android' &&
        UIManager.setLayoutAnimationEnabledExperimental
      ) {
        UIManager.setLayoutAnimationEnabledExperimental(true);
      }
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

      setExpandedIds((prev) => {
        const next = new Set(prev);
        if (expanded) next.add(id);
        else next.delete(id);
        return next;
      });

      if (!expanded) {
        setHighlightedId(id);
        setTimeout(() => {
          setHighlightedId((current) => (current === id ? null : current));
        }, 1500);

        // Collapsing: scroll back to the item to prevent losing context
        setTimeout(() => {
          const index = streamItems.findIndex(
            (item) => getDisplayItem(item, activeTab)?.id.toString() === id,
          );
          if (index >= 0) {
            flashListRef.current?.scrollToIndex({
              index: index,
              animated: true,
              viewOffset: insets.top + 56,
            });
          }
        }, 100);
      }
    },
    [streamItems, activeTab, insets.top],
  );

  const renderItemContent = ({ item }: ListRenderItemInfo<StreamApiItem>) => {
    const displayItem = getDisplayItem(item, activeTab);
    if (!displayItem) return null;

    let itemType: 'answer' | 'article' | 'question' | 'pin' | 'video' =
      'answer';
    const typeStr = displayItem.type;
    if (typeStr === 'article') itemType = 'article';
    else if (typeStr === 'question') itemType = 'question';
    else if (typeStr === 'pin') itemType = 'pin';
    else if (typeStr === 'zvideo' || typeStr === 'video') itemType = 'video';

    const isHighlighted =
      initialId && displayItem.id?.toString() === initialId?.toString();

    return (
      <View
        className="py-0.5 bg-transparent"
        style={
          isHighlighted && {
            borderLeftWidth: 3,
            borderLeftColor: primaryColor,
          }
        }
        onLayout={(event) => {
          const { y, height } = event.nativeEvent.layout;
          if (displayItem?.id) {
            itemLayouts.current.set(displayItem.id.toString(), { y, height });
          }
        }}
      >
        <StreamItem
          ref={(r) => {
            itemRefs.current.set(displayItem.id.toString(), r);
          }}
          item={displayItem}
          type={itemType}
          isExpanded={expandedIds.has(displayItem.id.toString())}
          onToggle={handleToggleExpand}
          onShare={(ans) => {
            setSelectedAnswer(ans);
            setIsSharing(true);
          }}
          isHighlighted={!!isHighlighted}
          isCollapsedHighlighted={highlightedId === displayItem.id.toString()}
        />
      </View>
    );
  };

  const getTypeName = () => {
    if (activeTab === 'answers') return '回答';
    if (activeTab === 'articles') return '文章';
    if (activeTab === 'questions') return '提问';
    if (activeTab === 'pins') return '想法';
    return '动态';
  };

  return (
    <View
      type="default"
      className="flex-1"
      style={{
        backgroundColor: Colors[colorScheme].background,
      }}
    >
      <Stack.Screen options={{ headerShown: false }} />
      {isUserLoading ? (
        <View className="flex-1 items-center justify-center bg-transparent">
          <ActivityIndicator color={primaryColor} />
        </View>
      ) : isUserError || !user ? (
        <QueryErrorView
          message="用户资料加载失败"
          onRetry={() => void refetchUser()}
        />
      ) : (
        <>
          {/* 1. Header Bar */}
          <View
            className="flex-row items-center px-4 py-3 border-b border-gray-100 dark:border-gray-800"
            style={{
              paddingTop: insets.top,
              backgroundColor: Colors[colorScheme].background,
            }}
          >
            <BouncyButton
              onPress={() => router.back()}
              className="p-1 -ml-1 bg-transparent"
            >
              <Ionicons
                name="chevron-back"
                size={24}
                color={Colors[colorScheme].text}
              />
            </BouncyButton>

            {/* User Mini Profile */}
            <BouncyButton
              onPress={() => router.push(`/user/${user?.url_token || id}`)}
              className="flex-row items-center ml-2 flex-1 bg-transparent"
            >
              <Image
                source={{
                  uri:
                    user?.avatar_url ||
                    'https://picx.zhimg.com/v2-abed1a8c04702bc9e7ba3d3d82bc7591_l.jpg',
                }}
                className="w-8 h-8 rounded-full"
              />
              <View className="ml-2 bg-transparent flex-1">
                <Text className="font-bold text-sm" numberOfLines={1}>
                  {user?.name || '加载中...'}
                </Text>
                <Text
                  type="secondary"
                  className="text-[11px]"
                  numberOfLines={1}
                >
                  {user?.headline || '查看全部个人主页'}
                </Text>
              </View>
            </BouncyButton>

            {/* Content Type Badge */}
            <View
              className="px-2.5 py-1 rounded-full ml-2"
              style={{ backgroundColor: 'rgba(0,132,255,0.08)' }}
            >
              <Text type="primary" className="text-xs font-bold">
                {getTypeName()}流
              </Text>
            </View>
          </View>

          {/* 2. Content Stream List */}
          <FlashList<StreamApiItem>
            ref={flashListRef}
            onScroll={handleScroll}
            data={streamItems}
            keyExtractor={(item) => {
              const displayItem = getDisplayItem(item, activeTab);
              return `stream-${displayItem?.id ?? item.url ?? 'unknown'}`;
            }}
            renderItem={renderItemContent}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
            onEndReached={() => {
              if (hasNextPage && !isFetchingNextPage) fetchNextPage();
            }}
            onEndReachedThreshold={0.5}
            contentContainerStyle={{ paddingVertical: 10, paddingBottom: 50 }}
            ListEmptyComponent={
              streamLoading ? (
                <ActivityIndicator
                  style={{ marginTop: 100 }}
                  color={primaryColor}
                />
              ) : isStreamError ? (
                <QueryErrorView
                  message="内容流加载失败"
                  onRetry={() => void refetchStream()}
                />
              ) : (
                <Text type="secondary" className="text-center mt-20 text-sm">
                  暂无内容流 喵~
                </Text>
              )
            }
            ListFooterComponent={
              isFetchingNextPage ? (
                <ActivityIndicator
                  style={{ margin: 20 }}
                  color={primaryColor}
                />
              ) : streamItems.length > 0 && !hasNextPage ? (
                <Text type="secondary" className="text-center p-5 text-xs">
                  — 已经到底了喵 —
                </Text>
              ) : null
            }
          />

          <ShareMenu
            visible={isSharing}
            onClose={() => {
              setIsSharing(false);
              setSelectedAnswer(null);
            }}
            type={
              selectedAnswer?.type === 'article'
                ? 'article'
                : selectedAnswer?.type === 'pin'
                  ? 'pin'
                  : selectedAnswer?.type === 'question'
                    ? 'question'
                    : selectedAnswer?.type === 'zvideo' ||
                        selectedAnswer?.type === 'video'
                      ? 'video'
                      : 'answer'
            }
            data={
              selectedAnswer
                ? {
                    id: selectedAnswer.id,
                    title:
                      selectedAnswer.title ||
                      selectedAnswer.question?.title ||
                      '想法',
                    author: selectedAnswer.author?.name || user?.name,
                    authorHeadline:
                      selectedAnswer.author?.headline || user?.headline,
                    content:
                      selectedAnswer.excerpt ||
                      (typeof selectedAnswer.content === 'string'
                        ? selectedAnswer.content
                        : ''),
                  }
                : null
            }
          />

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
                  {activeItem && (
                    <LikeButton
                      id={activeItem.id}
                      count={
                        activeItem.reaction?.statistics?.like_count ||
                        activeItem.voteup_count ||
                        activeItem.reaction_count ||
                        0
                      }
                      voted={activeItem.relationship?.voting || 0}
                      type={
                        activeItem.type === 'article'
                          ? 'articles'
                          : activeItem.type === 'pin'
                            ? 'pins'
                            : 'answers'
                      }
                      variant="ghost"
                    />
                  )}
                  <BouncyButton
                    className="flex-row items-center justify-center ml-3 p-2 rounded-full bg-transparent"
                    onPress={() => {
                      const commentType =
                        activeItem?.type === 'article'
                          ? 'article'
                          : activeItem?.type === 'pin'
                            ? 'pin'
                            : 'answer';
                      router.push(
                        `/comments/${activeItem?.id}?type=${commentType}&count=${activeItem?.comment_count || 0}`,
                      );
                    }}
                  >
                    <Ionicons
                      name="chatbubble-outline"
                      size={20}
                      color={primaryColor}
                    />
                    <Text
                      type="primary"
                      className=" text-sm font-bold"
                      style={{ color: primaryColor }}
                    >
                      {activeItem?.comment_count || 0}
                    </Text>
                  </BouncyButton>

                  {activeItem?.id &&
                    expandedIds.has(activeItem.id.toString()) && (
                      <BouncyButton
                        className="flex-row items-center justify-center ml-3 p-2 rounded-full bg-transparent"
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
                          type="primary"
                          className=" text-sm font-bold"
                          style={{ color: primaryColor }}
                        >
                          收起
                        </Text>
                      </BouncyButton>
                    )}
                </View>
                <BouncyButton
                  className="flex-row items-center justify-center p-2 rounded-full bg-transparent"
                  onPress={() => {
                    setSelectedAnswer(activeItem);
                    setIsSharing(true);
                  }}
                >
                  <Ionicons
                    name="share-outline"
                    size={22}
                    color={primaryColor}
                  />
                </BouncyButton>
              </View>
            </BlurView>
          </Reanimated.View>
        </>
      )}
    </View>
  );
}
