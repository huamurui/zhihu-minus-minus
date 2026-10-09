import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  type NativeScrollEvent,
  type ScrollView as NativeScrollView,
  type NativeSyntheticEvent,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getArticle, getDailyDetail } from '@/api/zhihu';
import { getAllContentCollectionStatus } from '@/api/zhihu/collection';
import {
  followColumn,
  getArticleColumnCard,
  unfollowColumn,
} from '@/api/zhihu/column';
import { recordReadHistory } from '@/api/zhihu/history';
import { followMember, unfollowMember } from '@/api/zhihu/member';
import { AnswerEndorsements } from '@/components/AnswerEndorsements';
import { BouncyButton } from '@/components/BouncyButton';
import {
  CONTENT_ACTION_BAR_HEIGHT,
  ContentActionBar,
  getContentActionBarBottom,
} from '@/components/ContentActionBar';
import { ContentActionButton } from '@/components/ContentActionButton';
import { FollowButton } from '@/components/FollowButton';
import { MoreActionsButton } from '@/components/MoreActionsButton';
import { QueryErrorView } from '@/components/QueryErrorView';
import { ReadingProgressNotice } from '@/components/ReadingProgressNotice';
import { SegmentedVoteCapsule } from '@/components/SegmentedVoteCapsule';
import { ShareMenu } from '@/components/ShareMenu';
import { StableAvatar } from '@/components/StableAvatar';
import { Text, ThemedIcon, useThemeColor, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { RICH_CONTENT_STALE_TIME, ZhihuContent } from '@/features/rich-content';
import { useOptimisticToggle } from '@/hooks/useOptimisticToggle';
import { useReadingProgress } from '@/hooks/useReadingProgress';
import { useCollectionStore } from '@/store/useCollectionStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import type { ZhihuArticle } from '@/types/zhihu';
import { formatDate } from '@/utils/date';
import { getCachedImageSource } from '@/utils/imageSource';
import { getZhihuErrorStatus } from '@/utils/zhihuError';

const ARTICLE_ACTION_BAR_OFFSET = 10;

export default function ArticleDetail() {
  const colorScheme = useColorScheme();
  const primaryColor = useThemeColor({}, 'primary');
  const linkColor = useThemeColor({}, 'link');
  const { id, source } = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const actionBarBottom = getContentActionBarBottom(
    insets.bottom,
    ARTICLE_ACTION_BAR_OFFSET,
  );
  const router = useRouter();

  const isDaily = source === 'daily';
  const textColor = Colors[colorScheme].text;

  const contentIdentity = `${isDaily ? 'daily' : 'article'}:${String(id ?? '')}`;
  const [openMenuIdentity, setOpenMenuIdentity] = useState<string | null>(null);
  const menuVisible = openMenuIdentity === contentIdentity;

  useEffect(() => {
    setOpenMenuIdentity((opened) =>
      opened === contentIdentity ? opened : null,
    );
  }, [contentIdentity]);

  const scrollY = useRef(new Animated.Value(0)).current;
  const scrollViewRef = useRef<NativeScrollView>(null);

  // 1. 获取日报详情
  const {
    data: dailyData,
    isLoading: dailyLoading,
    isError: dailyError,
    refetch: refetchDaily,
  } = useQuery({
    queryKey: ['daily-article', id],
    queryFn: () => getDailyDetail(id as string),
    enabled: source === 'daily',
    retry: (failureCount, err) =>
      getZhihuErrorStatus(err) === 404 ? false : failureCount < 2,
  });

  // 2. 获取知乎普通文章详情
  const {
    data: zhihuData,
    isLoading: zhihuLoading,
    isError: zhihuError,
    refetch: refetchZhihu,
  } = useQuery({
    queryKey: ['zhihu-article', id],
    queryFn: () => getArticle(id as string),
    enabled: source !== 'daily',
    staleTime: RICH_CONTENT_STALE_TIME,
    retry: (failureCount, err) =>
      getZhihuErrorStatus(err) === 404 ? false : failureCount < 2,
  });

  const isLoading = isDaily ? dailyLoading : zhihuLoading;
  const data = isDaily ? dailyData : zhihuData;
  const isError = isDaily ? dailyError : zhihuError;
  const refetchContent = isDaily ? refetchDaily : refetchZhihu;
  const authorAvatarUrl = !isDaily ? data?.author?.avatar_url : undefined;
  const readingProgress = useReadingProgress({
    contentKey: `${isDaily ? 'daily' : 'article'}:${String(id ?? '')}`,
    enabled: Boolean(id),
    ready: Boolean(data),
    scrollRef: scrollViewRef,
  });

  const enableBrowseHistory = useSettingsStore((s) => s.enableBrowseHistory);

  useEffect(() => {
    if (enableBrowseHistory && id && !isDaily) {
      recordReadHistory({
        content_token: id as string,
        content_type: 'article',
      });
    }
  }, [enableBrowseHistory, id, isDaily]);

  // 3. 获取文章被收藏状态
  const { data: collectionStatus, isFetchedAfterMount } = useQuery({
    queryKey: ['article-collection-status', id],
    queryFn: () => getAllContentCollectionStatus(id as string, 'article'),
    enabled: !!id && !isDaily && !isLoading,
    staleTime: 60 * 1000, // 1 minute
  });

  const setCollectedStatus = useCollectionStore(
    (state) => state.setCollectedStatus,
  );

  const statusCollected = collectionStatus?.data?.some(
    (item) => item.is_favorited,
  );
  const storeCollected = useCollectionStore(
    (state) => state.collectedStatusMap[String(id)],
  );
  const activeCollected = storeCollected ?? statusCollected;
  const storeCollectedRef = useRef(storeCollected);

  useEffect(() => {
    storeCollectedRef.current = storeCollected;
  }, [storeCollected]);

  useEffect(() => {
    if (
      collectionStatus &&
      id &&
      (isFetchedAfterMount || storeCollectedRef.current === undefined)
    ) {
      const activeCollected =
        collectionStatus?.data?.some((item) => item.is_favorited) || false;
      setCollectedStatus(id as string, activeCollected);
    }
  }, [collectionStatus, id, isFetchedAfterMount, setCollectedStatus]);

  // 4. 关注作者逻辑
  const followMutation = useOptimisticToggle<ZhihuArticle>({
    queryKey: ['zhihu-article', id],
    mutationFn: async () => {
      if (data?.author?.is_following) {
        return unfollowMember(data.author.url_token || data.author.id);
      }
      return followMember(data.author.url_token || data.author.id);
    },
    isActive: data?.author?.is_following,
    onUpdateCache: (old) => ({
      ...old,
      author: old.author
        ? {
            ...old.author,
            is_following: !old.author.is_following,
          }
        : old.author,
    }),
    successMessage: (isActive) => (isActive ? '已取消关注' : '已关注'),
  });

  // 5. 获取专栏卡片信息
  const { data: columnCard } = useQuery({
    queryKey: ['article-column-card', id],
    queryFn: () => getArticleColumnCard(id as string),
    enabled: !!id && !isDaily,
  });

  const primaryTransparent = useThemeColor({}, 'primaryTransparent');

  const columnFollowMutation = useOptimisticToggle<
    NonNullable<typeof columnCard>
  >({
    queryKey: ['article-column-card', id],
    isActive: columnCard?.is_following,
    mutationFn: async () => {
      if (!columnCard) return;
      if (columnCard.is_following) return unfollowColumn(columnCard.id);
      return followColumn(columnCard.id);
    },
    onUpdateCache: (old) => ({
      ...old,
      is_following: !old?.is_following,
    }),
    successMessage: (isActive) => (isActive ? '已取消关注' : '已关注专栏'),
  });

  const goToProfile = () => {
    const token = data?.author?.url_token || data?.author?.id;
    if (token) router.push(`/user/${token}`);
  };

  // Header Animation values
  const headerBgOpacity = scrollY.interpolate({
    inputRange: [0, 80],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const headerTitleOpacity = scrollY.interpolate({
    inputRange: [80, 140],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  if (isLoading && !data) {
    return (
      <View className="flex-1 justify-center items-center">
        <Stack.Screen options={{ headerShown: false, title: '正文' }} />
        <ActivityIndicator size="large" color={primaryColor} />
        <Text className="mt-3">正赶往知识的荒原...喵</Text>
      </View>
    );
  }

  if (!data) {
    if (isError) {
      return (
        <View className="flex-1 justify-center items-center px-6">
          <Stack.Screen options={{ headerShown: false, title: '正文' }} />
          <QueryErrorView
            message="正文加载失败"
            onRetry={() => void refetchContent()}
          />
        </View>
      );
    }
    return (
      <View className="flex-1 justify-center items-center px-6">
        <Stack.Screen options={{ headerShown: false, title: '正文' }} />
        <Ionicons
          name="compass-outline"
          size={48}
          color={Colors[colorScheme].textSecondary}
        />
        <Text className="text-base font-bold mt-4 mb-2">
          你似乎来到了没有知识存在的荒原
        </Text>
        <Text type="secondary" className="text-xs text-center mb-6">
          该文章可能已被删除、失效或暂不可见 喵~
        </Text>
        <BouncyButton
          onPress={() => router.back()}
          className="px-4 py-2 rounded-full"
          style={{ backgroundColor: primaryTransparent }}
        >
          <Text className="text-xs font-bold" style={{ color: linkColor }}>
            返回上一页
          </Text>
        </BouncyButton>
      </View>
    );
  }

  return (
    <View className="flex-1">
      {/* Hide native header */}
      <Stack.Screen options={{ headerShown: false, title: '正文' }} />

      {/* Floating Header Bar */}
      <View
        className="flex-row items-center justify-between px-2.5 absolute left-0 right-0 z-50"
        style={{
          top: 0,
          paddingTop: insets.top,
          height: 56 + insets.top,
          backgroundColor: 'transparent',
        }}
        pointerEvents="box-none"
      >
        <Animated.View
          style={[
            StyleSheet.absoluteFillObject,
            {
              backgroundColor: Colors[colorScheme].backgroundSecondary,
              opacity: headerBgOpacity,
              borderBottomWidth: StyleSheet.hairlineWidth,
              borderBottomColor: Colors[colorScheme].divider,
            },
          ]}
          pointerEvents="none"
        />

        <BouncyButton
          onPress={() => router.back()}
          className="w-10 h-10 justify-center items-center z-50 rounded-full"
        >
          <Ionicons name="chevron-back" size={28} color={textColor} />
        </BouncyButton>

        <Animated.View
          className="flex-1 mx-4"
          style={{ opacity: headerTitleOpacity }}
          pointerEvents="none"
        >
          <Text
            className="text-[16px] font-bold text-center"
            numberOfLines={1}
            style={{ color: textColor }}
          >
            {data.title}
          </Text>
        </Animated.View>

        <MoreActionsButton
          onPress={() => setOpenMenuIdentity(contentIdentity)}
        />
      </View>

      <Animated.ScrollView
        ref={scrollViewRef}
        className="flex-1"
        style={{
          backgroundColor: Colors[colorScheme].backgroundSecondary,
        }}
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          {
            useNativeDriver: true,
            listener: (event: NativeSyntheticEvent<NativeScrollEvent>) =>
              readingProgress.onScroll(event.nativeEvent.contentOffset.y),
          },
        )}
        onLayout={readingProgress.onLayout}
        onContentSizeChange={readingProgress.onContentSizeChange}
        onScrollEndDrag={readingProgress.commitProgress}
        onMomentumScrollEnd={readingProgress.commitProgress}
        contentContainerStyle={{
          paddingTop: isDaily ? 0 : insets.top + 60,
          paddingBottom: isDaily
            ? 100 + insets.bottom
            : CONTENT_ACTION_BAR_HEIGHT +
              56 +
              actionBarBottom -
              ARTICLE_ACTION_BAR_OFFSET,
        }}
      >
        {isDaily ? (
          <View className="w-full h-[300px] relative">
            <Image
              source={getCachedImageSource(data.image)}
              className="w-full h-full"
            />
            <View
              className="absolute bottom-0 p-5 w-full"
              style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
            >
              <Text
                className="text-[22px] font-bold"
                style={{ color: '#ffffff' }}
              >
                {data.title}
              </Text>
              {data.image_source && (
                <Text
                  className="text-right mt-2 text-[10px]"
                  style={{ color: 'rgba(255,255,255,0.7)' }}
                >
                  {data.image_source}
                </Text>
              )}
            </View>
          </View>
        ) : (
          <View className="p-5 pt-[10px]">
            <Text className="text-2xl font-bold leading-8 mb-5">
              {data.title}
            </Text>
            <View className="flex-row items-center justify-between bg-transparent mt-2">
              <BouncyButton
                onPress={goToProfile}
                className="flex-row items-center flex-1 bg-transparent"
              >
                <StableAvatar
                  uri={authorAvatarUrl}
                  className="w-11 h-11 rounded-full"
                />
                <View className="ml-3 flex-1 bg-transparent">
                  <Text className="text-base font-bold">
                    {data.author?.name}
                  </Text>
                  {data.author?.headline ? (
                    <Text
                      type="secondary"
                      className="text-[13px] text-tertiary dark:text-tertiary-dark mt-0.5"
                      numberOfLines={1}
                    >
                      {data.author.headline}
                    </Text>
                  ) : null}
                </View>
              </BouncyButton>
              <FollowButton
                following={Boolean(data.author?.is_following)}
                loading={followMutation.isPending}
                onPress={() => followMutation.mutate()}
              />
            </View>
          </View>
        )}

        {/* Content Render */}
        <View className="px-[15px] bg-transparent mt-3">
          {!isDaily && (
            <AnswerEndorsements endorsements={zhihuData?.endorsements} />
          )}
          <ZhihuContent
            content={isDaily ? data.body : data.content}
            objectId={id as string}
            type="article"
            variant={isDaily ? 'daily' : 'default'}
          />
        </View>

        {/* Column Card section */}
        {!isDaily && columnCard && (
          <View className="px-5 mt-8 mb-4 bg-transparent">
            <Text className="text-sm font-bold mb-3">收录于专栏</Text>
            <BouncyButton
              onPress={() => router.push(`/column/${columnCard.id}`)}
              className="flex-row items-center p-4 rounded-xl border"
              style={{
                borderColor: Colors[colorScheme].border,
                backgroundColor: Colors[colorScheme].surface,
              }}
            >
              <Image
                source={getCachedImageSource(columnCard.image_url)}
                className="w-12 h-12 rounded-lg"
              />
              <View className="flex-1 ml-3 bg-transparent">
                <Text className="text-base font-bold" numberOfLines={1}>
                  {columnCard.title}
                </Text>
                <Text
                  type="secondary"
                  className="text-xs mt-1"
                  numberOfLines={1}
                >
                  {columnCard.extra || `${columnCard.intro || '知乎专栏'}`}
                </Text>
              </View>
              <FollowButton
                following={Boolean(columnCard.is_following)}
                loading={columnFollowMutation.isPending}
                onPress={(event) => {
                  event.stopPropagation();
                  columnFollowMutation.mutate();
                }}
              />
            </BouncyButton>
          </View>
        )}

        {/* Publish time and copyright notice for standard articles */}
        {!isDaily && data.created && (
          <View className="px-5">
            <Text
              type="secondary"
              className="text-[#bbb] text-[13px] mt-[30px] italic pb-5"
            >
              发布于 {formatDate(data.created)}
            </Text>
          </View>
        )}
      </Animated.ScrollView>

      <ReadingProgressNotice
        visible={readingProgress.restoredOffset !== null}
        onBackToTop={readingProgress.scrollToTop}
        onDismiss={readingProgress.dismissRestoreNotice}
        bottomOffset={
          isDaily
            ? 20
            : CONTENT_ACTION_BAR_HEIGHT +
              24 +
              actionBarBottom -
              insets.bottom -
              ARTICLE_ACTION_BAR_OFFSET
        }
      />

      {/* Floating Footer Actions for Standard Articles */}
      {!isDaily && (
        <ContentActionBar
          bottomInset={insets.bottom}
          bottomOffset={ARTICLE_ACTION_BAR_OFFSET}
          leading={
            <SegmentedVoteCapsule
              id={id as string}
              count={data.voteup_count ?? 0}
              voted={data.relationship?.voting ?? 0}
              type="articles"
            />
          }
          trailing={
            <View className="flex-row items-center bg-transparent">
              <ContentActionButton
                accessibilityRole="button"
                accessibilityLabel="评论"
                className="items-center justify-center ml-2 px-2.5 py-1.5 flex-row bg-transparent"
                onPress={() => router.push(`/comments/${id}?type=article`)}
              >
                <ThemedIcon
                  name="chatbubble-outline"
                  size={20}
                  colorType="secondary"
                />
                {data.comment_count > 0 && (
                  <Text
                    type="secondary"
                    className="ml-1 text-[13px] font-semibold"
                  >
                    {data.comment_count}
                  </Text>
                )}
              </ContentActionButton>
              <MoreActionsButton
                style={{ marginLeft: 4 }}
                onPress={() => setOpenMenuIdentity(contentIdentity)}
              />
            </View>
          }
        />
      )}

      <ShareMenu
        visible={menuVisible}
        onClose={() => setOpenMenuIdentity(null)}
        type={isDaily ? 'daily' : 'article'}
        data={
          data
            ? {
                id: id as string,
                title: data.title,
                author: data.author?.name,
                authorHeadline: data.author?.headline,
                isCollected: isDaily ? undefined : activeCollected,
                url: isDaily
                  ? typeof dailyData?.share_url === 'string' &&
                    dailyData.share_url.trim()
                    ? dailyData.share_url
                    : `https://daily.zhihu.com/story/${id}`
                  : `https://zhuanlan.zhihu.com/p/${id}`,
              }
            : null
        }
      />
    </View>
  );
}
