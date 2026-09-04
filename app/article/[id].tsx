import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import { BlurView } from 'expo-blur';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Image, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getArticle, getDailyDetail } from '@/api/zhihu';
import {
  fastCollectArticle,
  getArticleCollectionStatus,
  removeArticleFromCollection,
} from '@/api/zhihu/collection';
import {
  followColumn,
  getArticleColumnCard,
  unfollowColumn,
} from '@/api/zhihu/column';
import { addReadHistory } from '@/api/zhihu/history';
import { followMember, unfollowMember } from '@/api/zhihu/member';
import { BouncyButton } from '@/components/BouncyButton';
import { DownvoteButton } from '@/components/DownvoteButton';
import { LikeButton } from '@/components/LikeButton';
import { ActionSheet } from '@/components/overlays/ActionSheet';
import { ShareMenu } from '@/components/ShareMenu';
import { Text, ThemedIcon, useThemeColor, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { ZhihuContent } from '@/features/rich-content';
import { useOptimisticToggle } from '@/hooks/useOptimisticToggle';
import { useCollectionStore } from '@/store/useCollectionStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import type { ZhihuArticle } from '@/types/zhihu';
import { formatDate } from '@/utils/date';
import { showToast } from '@/utils/toast';

export default function ArticleDetail() {
  const colorScheme = useColorScheme();
  const primaryColor = useThemeColor({}, 'primary');
  const warningColor = useThemeColor({}, 'warning');
  const { id, source } = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const isDaily = source === 'daily';
  const textColor = Colors[colorScheme].text;
  const isDark = colorScheme === 'dark';

  const [isSharing, setIsSharing] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [isLiked, setIsLiked] = useState(false); // Local liked menu state (optional)

  const scrollY = useRef(new Animated.Value(0)).current;

  // 1. 获取日报详情
  const { data: dailyData, isLoading: dailyLoading } = useQuery({
    queryKey: ['daily-article', id],
    queryFn: () => getDailyDetail(id as string),
    enabled: source === 'daily',
    retry: (failureCount, err: any) =>
      err?.response?.status === 404 ? false : failureCount < 2,
  });

  // 2. 获取知乎普通文章详情
  const { data: zhihuData, isLoading: zhihuLoading } = useQuery({
    queryKey: ['zhihu-article', id],
    queryFn: () => getArticle(id as string),
    enabled: source !== 'daily',
    retry: (failureCount, err: any) =>
      err?.response?.status === 404 ? false : failureCount < 2,
  });

  const isLoading = isDaily ? dailyLoading : zhihuLoading;
  const data = isDaily ? dailyData : zhihuData;

  const enableBrowseHistory = useSettingsStore((s) => s.enableBrowseHistory);

  useEffect(() => {
    if (enableBrowseHistory && id) {
      addReadHistory({ content_token: id as string, content_type: 'article' });
    }
  }, [enableBrowseHistory, id]);

  // 3. 获取文章被收藏状态
  const { data: collectionStatus, refetch: refetchCollectionStatus } = useQuery(
    {
      queryKey: ['article-collection-status', id],
      queryFn: () => getArticleCollectionStatus(id as string),
      enabled: !!id && !isDaily && !isLoading,
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

  useEffect(() => {
    if (collectionStatus && id) {
      const activeCollected =
        collectionStatus?.data?.some((item: any) => item.is_favorited) || false;
      setCollectedStatus(id as string, activeCollected);
    }
  }, [collectionStatus, id, setCollectedStatus]);

  const collectMutation = useMutation({
    mutationFn: async () => {
      if (isCollected && favoritedCollection) {
        return removeArticleFromCollection(
          favoritedCollection.id,
          id as string,
        );
      }
      return fastCollectArticle(id as string);
    },
    onSuccess: (res) => {
      refetchCollectionStatus();
      if (!isCollected) {
        const folderName = res?.collection?.title || '默认收藏夹';
        useCollectionStore
          .getState()
          .showToast(id as string, 'article', `已收藏到「${folderName}」`);
      } else {
        showToast('已取消收藏');
      }
    },
    onError: (err: any) =>
      showToast(err.response?.data?.error?.message || '无法处理请求'),
  });

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

  const tintColor = useThemeColor({}, 'primary');
  const primaryTransparent = useThemeColor({}, 'primaryTransparent');

  const columnFollowMutation = useOptimisticToggle({
    queryKey: ['article-column-card', id],
    isActive: columnCard?.is_following,
    mutationFn: async () => {
      if (!columnCard) return;
      if (columnCard.is_following) return unfollowColumn(columnCard.id);
      return followColumn(columnCard.id);
    },
    onUpdateCache: (old: any) => ({
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

  if (isLoading) {
    return (
      <View className="flex-1 justify-center items-center">
        <ActivityIndicator size="large" color={primaryColor} />
        <Text className="mt-3">正赶往知识的荒原...喵</Text>
      </View>
    );
  }

  if (!data) {
    return (
      <View className="flex-1 justify-center items-center px-6">
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
          <Text className="text-xs font-bold" style={{ color: primaryColor }}>
            返回上一页
          </Text>
        </BouncyButton>
      </View>
    );
  }

  return (
    <View className="flex-1">
      {/* Hide native header */}
      <Stack.Screen options={{ headerShown: false }} />

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
              borderBottomColor: isDark
                ? 'rgba(255,255,255,0.1)'
                : 'rgba(0,0,0,0.1)',
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

        <BouncyButton
          onPress={() => setIsSharing(true)}
          className="w-10 h-10 justify-center items-center z-50 rounded-full"
        >
          <Ionicons name="share-outline" size={24} color={textColor} />
        </BouncyButton>
      </View>

      <Animated.ScrollView
        className="flex-1"
        style={{
          backgroundColor: isDark
            ? 'rgba(34, 34, 34, 0.85)'
            : 'rgba(255, 255, 255, 0.9)',
        }}
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true },
        )}
        contentContainerStyle={{
          paddingTop: isDaily ? 0 : insets.top + 60,
          paddingBottom: isDaily ? 100 + insets.bottom : 120 + insets.bottom,
        }}
      >
        {isDaily ? (
          <View className="w-full h-[300px] relative">
            <Image source={{ uri: data.image }} className="w-full h-full" />
            <View
              className="absolute bottom-0 p-5 w-full"
              style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
            >
              <Text className="text-white text-[22px] font-bold">
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
                <Image
                  source={{ uri: data.author?.avatar_url }}
                  className="w-11 h-11 rounded-full"
                />
                <View className="ml-3 flex-1 bg-transparent">
                  <Text className="text-base font-bold">
                    {data.author?.name}
                  </Text>
                  <Text
                    type="secondary"
                    className="text-[13px] text-tertiary dark:text-tertiary-dark mt-0.5"
                    numberOfLines={1}
                  >
                    {data.author?.headline}
                  </Text>
                </View>
              </BouncyButton>
              <BouncyButton
                className="px-[15px] py-1.5 rounded-[20px]"
                style={[
                  !data.author?.is_following
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
                    data.author?.is_following
                      ? { color: Colors[colorScheme].textSecondary }
                      : { color: tintColor },
                  ]}
                >
                  {data.author?.is_following ? '已关注' : '关注'}
                </Text>
              </BouncyButton>
            </View>
          </View>
        )}

        {/* Content Render */}
        <View className="px-[15px] bg-transparent mt-3">
          <ZhihuContent
            content={isDaily ? data.body : data.content}
            objectId={id as string}
            type="article"
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
                source={{ uri: columnCard.image_url }}
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
              <BouncyButton
                onPress={(e) => {
                  e.stopPropagation();
                  columnFollowMutation.mutate();
                }}
                className="px-4 py-1.5 rounded-full"
                style={[
                  {
                    backgroundColor: columnCard.is_following
                      ? 'transparent'
                      : tintColor,
                  },
                  columnCard.is_following && {
                    borderWidth: 1,
                    borderColor: Colors[colorScheme].border,
                  },
                ]}
              >
                <Text
                  style={{
                    color: columnCard.is_following
                      ? Colors[colorScheme].textSecondary
                      : Colors[colorScheme].textInverse,
                  }}
                  className="font-bold text-sm"
                >
                  {columnCard.is_following ? '已关注' : '关注'}
                </Text>
              </BouncyButton>
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

      {/* Floating Footer Actions for Standard Articles */}
      {!isDaily && (
        <View
          className="absolute left-5 right-5 z-[1000] shadow-black/10 shadow-[0_10px_20px] elevation-10"
          style={{ bottom: insets.bottom + 10 }}
        >
          <BlurView
            intensity={130}
            tint={isDark ? 'dark' : 'light'}
            className="rounded-[32px] overflow-hidden h-16"
            style={{
              backgroundColor: isDark
                ? 'rgba(26,26,26,0.8)'
                : 'rgba(255,255,255,0.85)',
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: 'rgba(150,150,150,0.1)',
            }}
          >
            <View className="flex-row items-center px-5 h-full bg-transparent">
              <View className="flex-row items-center bg-transparent">
                <LikeButton
                  id={id as string}
                  count={data.voteup_count || 0}
                  voted={data.relationship?.voting === 1 ? 1 : 0}
                  type="articles"
                  variant="minimal"
                />
                <View className="w-2.5 bg-transparent" />
                <DownvoteButton
                  id={id as string}
                  voted={data.relationship?.voting}
                  type="articles"
                  variant="minimal"
                />
              </View>
              <View className="flex-1 flex-row justify-end items-center bg-transparent">
                <BouncyButton
                  className="items-center justify-center ml-3 p-2 flex-row rounded-full bg-transparent"
                  onPress={() => router.push(`/comments/${id}?type=article`)}
                >
                  <ThemedIcon
                    name="chatbubble-outline"
                    size={24}
                    colorType="secondary"
                  />
                  {data.comment_count > 0 && (
                    <Text
                      type="secondary"
                      className="ml-1 text-[13px] font-medium"
                    >
                      {data.comment_count}
                    </Text>
                  )}
                </BouncyButton>
                <BouncyButton
                  className="items-center justify-center ml-3 p-2 flex-row rounded-full bg-transparent"
                  onPress={() => setMenuVisible(true)}
                >
                  <ThemedIcon
                    name="ellipsis-horizontal"
                    size={24}
                    colorType="secondary"
                  />
                </BouncyButton>
              </View>
            </View>
          </BlurView>
        </View>
      )}

      {/* Share Menu */}
      <ShareMenu
        visible={isSharing}
        onClose={() => setIsSharing(false)}
        type="article"
        data={
          data
            ? {
                id: id as string,
                title: data.title,
                author: data.author?.name,
                authorHeadline: data.author?.headline,
                url: isDaily ? undefined : `https://zhuanlan.zhihu.com/p/${id}`,
              }
            : null
        }
      />

      <ActionSheet
        visible={menuVisible && !isSharing}
        onClose={() => setMenuVisible(false)}
        title="文章操作"
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
            label: '分享文章',
            onPress: () => setIsSharing(true),
          },
        ]}
      />
    </View>
  );
}
