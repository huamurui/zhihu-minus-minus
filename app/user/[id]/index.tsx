import { Ionicons } from '@expo/vector-icons';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  View as NativeView,
  Pressable,
  TextInput,
} from 'react-native';
import PagerView from 'react-native-pager-view';
import Reanimated, {
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  type FeedItem,
  followMember,
  getMe,
  getMemberActivities,
  getMemberRelations,
  getMemberWithFallback,
  searchContent,
  unfollowMember,
  type ZhihuMember,
} from '@/api/zhihu';
import { addReadHistory } from '@/api/zhihu/history';
import { FeedCard } from '@/components/FeedCard';
import { QueryErrorView } from '@/components/QueryErrorView';
import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { useAuthStore } from '@/store/useAuthStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import type { ZhihuAuthor, ZhihuSearchResultItem } from '@/types/zhihu';
import { refreshInfiniteQuery } from '@/utils/query';
import {
  getNextPageOffset,
  isOwnMemberProfile,
  normalizeUserFeedType,
  type UserFeedType,
} from '@/utils/userProfile';

const AnimatedFlashList = Reanimated.createAnimatedComponent(FlashList);

interface ProfileContentSegment {
  type?: string;
  content?: string;
  url?: string;
}

interface ProfileContentItem {
  id?: string | number;
  url?: string;
  type?: string;
  title?: string;
  excerpt?: string;
  content?: string | ProfileContentSegment[];
  image_url?: string;
  thumbnail?: string;
  voteup_count?: number;
  reaction_count?: number;
  like_count?: number;
  comment_count?: number;
  favlists_count?: number;
  favorite_count?: number;
  answer_count?: number;
  follower_count?: number;
  author?: Partial<ZhihuAuthor>;
  question?: {
    id?: string | number;
    title?: string;
    name?: string;
  };
  relationship?: {
    voting?: number;
  };
  reaction?: {
    statistics?: {
      comments?: number;
      favorites?: number;
    };
  };
  thumbnail_info?: {
    thumbnails?: Array<{ url?: string }>;
  };
}

interface ProfileActivityItem {
  id?: string | number;
  url?: string;
  target?: ProfileContentItem;
}

function getProfileContentItem(
  item: unknown,
  tabKey: ProfileTabKey,
): ProfileContentItem | null {
  if (!item || typeof item !== 'object') return null;
  const activityItem = item as ProfileActivityItem;
  const displayItem =
    tabKey === 'activities'
      ? activityItem.target || activityItem
      : activityItem;
  if (!displayItem.id && !displayItem.url) return null;
  return displayItem;
}

function getProfileListItemKey(item: unknown) {
  if (!item || typeof item !== 'object') return 'invalid-profile-item';
  const profileItem = item as ProfileActivityItem;
  return String(
    profileItem.id ||
      profileItem.target?.id ||
      profileItem.url ||
      profileItem.target?.url,
  );
}

const PROFILE_TABS = [
  { key: 'activities', label: '动态', countKey: undefined },
  { key: 'answers', label: '回答', countKey: 'answer_count' },
  { key: 'articles', label: '文章', countKey: 'articles_count' },
  { key: 'questions', label: '提问', countKey: 'question_count' },
  { key: 'pins', label: '想法', countKey: 'pins_count' },
] as const;

type ProfileTabKey = (typeof PROFILE_TABS)[number]['key'];

function getInitialProfileTab(tab: string | undefined): ProfileTabKey {
  return PROFILE_TABS.some((profileTab) => profileTab.key === tab)
    ? (tab as ProfileTabKey)
    : 'answers';
}

export default function UserDetailScreen() {
  const colorScheme = useColorScheme();
  const _insets = useSafeAreaInsets();
  const {
    id,
    avatar: initialAvatar,
    tab: initialTabParam,
  } = useLocalSearchParams<{
    id: string;
    avatar?: string;
    tab?: string;
  }>();
  const router = useRouter();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const initialTab = getInitialProfileTab(initialTabParam);
  const initialTabIndex = PROFILE_TABS.findIndex(
    (profileTab) => profileTab.key === initialTab,
  );

  const [activeTab, setActiveTab] = useState<ProfileTabKey>(initialTab);
  const [visitedTabs, setVisitedTabs] = useState<Record<string, boolean>>({
    [initialTab]: true,
  });
  const [sortBy, setSortBy] = useState<'created' | 'voteups'>('created');
  const [followLoading, setFollowLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');

  // 动态测量 Header 高度
  const [headerHeight, setHeaderHeight] = useState(420);
  const maxScroll = useSharedValue(370);

  const pagerRef = useRef<PagerView>(null);
  const panStart = useRef({ x: 0, y: 0 });

  // 1. 各个 Tab 的独立滚动高度 (Shared Value)
  const scrollYActivities = useSharedValue(0);
  const scrollYAnswers = useSharedValue(0);
  const scrollYArticles = useSharedValue(0);
  const scrollYQuestions = useSharedValue(0);
  const scrollYPins = useSharedValue(0);

  // 2. 列表引用，用于程序控制滚动以对齐 Header 高度
  const listRefs = useRef<Array<FlashListRef<unknown> | null>>([
    null,
    null,
    null,
    null,
    null,
  ]);

  // 3. 当前活跃的 Tab 索引与 PagerView 滑动状态
  const activeIndex = useSharedValue(initialTabIndex);
  const activeIndexRef = useRef(initialTabIndex);
  const pagerPosition = useSharedValue(initialTabIndex);
  const pagerOffset = useSharedValue(0);

  // 获取对应 Tab 索引的 shared value
  const getSharedValue = (idx: number) => {
    if (idx === 0) return scrollYActivities;
    if (idx === 1) return scrollYAnswers;
    if (idx === 2) return scrollYArticles;
    if (idx === 3) return scrollYQuestions;
    return scrollYPins;
  };

  // 4. 绑定各 Tab 的 Scroll Handler
  const scrollHandler0 = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollYActivities.value = e.contentOffset.y;
    },
  });
  const scrollHandler1 = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollYAnswers.value = e.contentOffset.y;
    },
  });
  const scrollHandler2 = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollYArticles.value = e.contentOffset.y;
    },
  });
  const scrollHandler3 = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollYQuestions.value = e.contentOffset.y;
    },
  });
  const scrollHandler4 = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollYPins.value = e.contentOffset.y;
    },
  });

  // 5. 根据当前滑动进度和各个 Tab 的滚动高度，插值计算出 Header 的 translateY
  const headerAnimatedStyle = useAnimatedStyle(() => {
    const p = pagerPosition.value;
    const o = pagerOffset.value;

    const idx1 = Math.max(0, Math.min(4, Math.floor(p)));
    const idx2 = Math.max(0, Math.min(4, Math.ceil(p + o)));

    const y1 =
      idx1 === 0
        ? scrollYActivities.value
        : idx1 === 1
          ? scrollYAnswers.value
          : idx1 === 2
            ? scrollYArticles.value
            : idx1 === 3
              ? scrollYQuestions.value
              : scrollYPins.value;

    const y2 =
      idx2 === 0
        ? scrollYActivities.value
        : idx2 === 1
          ? scrollYAnswers.value
          : idx2 === 2
            ? scrollYArticles.value
            : idx2 === 3
              ? scrollYQuestions.value
              : scrollYPins.value;

    // 滑动过程中平滑插值
    const currentScrollY = y1 + (y2 - y1) * o;

    const translateY = interpolate(
      currentScrollY,
      [0, maxScroll.value],
      [0, -maxScroll.value],
      'clamp',
    );

    return {
      transform: [{ translateY }],
    };
  });

  // 6. 同步滚动高度以防止跳动
  const syncLists = (currentIdx: number) => {
    const currentScrollY = getSharedValue(currentIdx).value;
    const collapsedHeight = Math.min(currentScrollY, maxScroll.value);

    // 将其他未达到当前折叠高度的 Tab 列表，程序滚动到对应的折叠高度上
    for (let i = 0; i < PROFILE_TABS.length; i++) {
      if (i !== currentIdx) {
        const val = getSharedValue(i);
        if (val.value < collapsedHeight) {
          val.value = collapsedHeight;
          listRefs.current[i]?.scrollToOffset({
            offset: collapsedHeight,
            animated: false,
          });
        }
      }
    }
  };

  // Tapping tab button sync & transition
  const handleTabPress = (idx: number) => {
    const currentIdx = activeIndexRef.current;
    const currentScrollY = getSharedValue(currentIdx).value;
    const collapsedHeight = Math.min(currentScrollY, maxScroll.value);

    const val = getSharedValue(idx);
    if (val.value < collapsedHeight) {
      val.value = collapsedHeight;
      listRefs.current[idx]?.scrollToOffset({
        offset: collapsedHeight,
        animated: false,
      });
    }

    pagerRef.current?.setPage(idx);
    const tab = PROFILE_TABS[idx].key;
    setActiveTab(tab);
    activeIndex.value = idx;
    activeIndexRef.current = idx;
  };

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchQuery(searchQuery), 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    navigation.setOptions({ title: '个人主页' });
  }, [navigation]);

  const borderColor = Colors[colorScheme].border;
  const { primaryColor: customPrimaryColor } = useSettingsStore();
  const primaryColor = customPrimaryColor || Colors[colorScheme].primary;

  const { cookies, me: storedMe } = useAuthStore();
  const { data: fetchedMe } = useQuery({
    queryKey: ['me'],
    queryFn: () => getMe(),
    enabled: !!cookies,
  });
  const me = fetchedMe || storedMe;

  const {
    data: user,
    isLoading: isUserLoading,
    isError: isUserError,
    refetch: refetchUser,
  } = useQuery({
    queryKey: ['user-detail', id],
    queryFn: () => getMemberWithFallback(id),
    enabled: !!id,
  });
  const isMe = isOwnMemberProfile(id, me, user);

  const enableBrowseHistory = useSettingsStore((s) => s.enableBrowseHistory);

  useEffect(() => {
    if (cookies && enableBrowseHistory && user?.id) {
      void addReadHistory({
        content_token: String(user.id),
        content_type: 'profile',
      }).catch(() => {
        console.warn('记录用户主页浏览历史失败');
      });
    }
  }, [cookies, enableBrowseHistory, user?.id]);

  // 1. 动态 Query
  const activitiesQuery = useInfiniteQuery({
    queryKey: ['user-activities', id],
    queryFn: ({ pageParam = 0 }) => {
      const targetId = (user?.url_token || id) as string;
      return getMemberActivities(targetId, 20, pageParam);
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      if (!lastPage || lastPage.paging?.is_end) return undefined;
      return getNextPageOffset(lastPage.paging?.next);
    },
    enabled: !!user && (visitedTabs.activities || activeTab === 'activities'),
  });

  // 2. 回答 Query
  const answersQuery = useInfiniteQuery({
    queryKey: ['user-answers', id, sortBy],
    queryFn: ({ pageParam = 0 }) => {
      const targetId = (user?.url_token || id) as string;
      const include =
        'data[*].is_normal,admin_closed_comment,content,voteup_count,comment_count,favlists_count,created_time,updated_time,excerpt,reaction,relationship.voting,relationship.is_author,relationship.is_thanked;data[*].author;data[*].question.title';
      return getMemberRelations(targetId, 'answers', {
        limit: 20,
        offset: pageParam,
        include,
        sort_by: sortBy,
      });
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      if (!lastPage || lastPage.paging?.is_end) return undefined;
      return getNextPageOffset(lastPage.paging?.next);
    },
    enabled: !!user && (visitedTabs.answers || activeTab === 'answers'),
  });

  // 3. 提问 Query
  const questionsQuery = useInfiniteQuery({
    queryKey: ['user-questions', id],
    queryFn: ({ pageParam = 0 }) => {
      const targetId = (user?.url_token || id) as string;
      const include =
        'data[*].created,answer_count,follower_count,admin_closed_comment,title,reaction,relationship.is_following;data[*].author';
      return getMemberRelations(targetId, 'questions', {
        limit: 20,
        offset: pageParam,
        include,
      });
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      if (!lastPage || lastPage.paging?.is_end) return undefined;
      return getNextPageOffset(lastPage.paging?.next);
    },
    enabled: !!user && (visitedTabs.questions || activeTab === 'questions'),
  });

  // 4. 文章 Query
  const articlesQuery = useInfiniteQuery({
    queryKey: ['user-articles', id],
    queryFn: ({ pageParam = 0 }) => {
      const targetId = (user?.url_token || id) as string;
      const include =
        'data[*].comment_count,content,voteup_count,favlists_count,created,updated,title,excerpt,reaction,relationship.voting;data[*].author';
      return getMemberRelations(targetId, 'articles', {
        limit: 20,
        offset: pageParam,
        include,
      });
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      if (!lastPage || lastPage.paging?.is_end) return undefined;
      return getNextPageOffset(lastPage.paging?.next);
    },
    enabled: !!user && (visitedTabs.articles || activeTab === 'articles'),
  });

  // 5. 想法 Query
  const pinsQuery = useInfiniteQuery({
    queryKey: ['user-pins', id],
    queryFn: ({ pageParam = 0 }) => {
      const targetId = (user?.url_token || id) as string;
      const include =
        'data[*].content,reaction_count,comment_count,created,reaction,relationship.voting;data[*].author';
      return getMemberRelations(targetId, 'pins', {
        limit: 20,
        offset: pageParam,
        include,
      });
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      if (!lastPage || lastPage.paging?.is_end) return undefined;
      return getNextPageOffset(lastPage.paging?.next);
    },
    enabled: !!user && (visitedTabs.pins || activeTab === 'pins'),
  });

  const getTabQueryState = (tabKey: ProfileTabKey) => {
    switch (tabKey) {
      case 'activities':
        return {
          queryKey: ['user-activities', id] as const,
          data:
            activitiesQuery.data?.pages.flatMap((page) => page.data || []) ||
            [],
          isLoading: activitiesQuery.isLoading,
          isError: activitiesQuery.isError,
          isFetchingNextPage: activitiesQuery.isFetchingNextPage,
          hasNextPage: activitiesQuery.hasNextPage,
          fetchNextPage: activitiesQuery.fetchNextPage,
          refetch: activitiesQuery.refetch,
          isRefetching: activitiesQuery.isRefetching,
        };
      case 'answers':
        return {
          queryKey: ['user-answers', id, sortBy] as const,
          data:
            answersQuery.data?.pages.flatMap((page) => page.data || []) || [],
          isLoading: answersQuery.isLoading,
          isError: answersQuery.isError,
          isFetchingNextPage: answersQuery.isFetchingNextPage,
          hasNextPage: answersQuery.hasNextPage,
          fetchNextPage: answersQuery.fetchNextPage,
          refetch: answersQuery.refetch,
          isRefetching: answersQuery.isRefetching,
        };
      case 'articles':
        return {
          queryKey: ['user-articles', id] as const,
          data:
            articlesQuery.data?.pages.flatMap((page) => page.data || []) || [],
          isLoading: articlesQuery.isLoading,
          isError: articlesQuery.isError,
          isFetchingNextPage: articlesQuery.isFetchingNextPage,
          hasNextPage: articlesQuery.hasNextPage,
          fetchNextPage: articlesQuery.fetchNextPage,
          refetch: articlesQuery.refetch,
          isRefetching: articlesQuery.isRefetching,
        };
      case 'questions':
        return {
          queryKey: ['user-questions', id] as const,
          data:
            questionsQuery.data?.pages.flatMap((page) => page.data || []) || [],
          isLoading: questionsQuery.isLoading,
          isError: questionsQuery.isError,
          isFetchingNextPage: questionsQuery.isFetchingNextPage,
          hasNextPage: questionsQuery.hasNextPage,
          fetchNextPage: questionsQuery.fetchNextPage,
          refetch: questionsQuery.refetch,
          isRefetching: questionsQuery.isRefetching,
        };
      case 'pins':
        return {
          queryKey: ['user-pins', id] as const,
          data: pinsQuery.data?.pages.flatMap((page) => page.data || []) || [],
          isLoading: pinsQuery.isLoading,
          isError: pinsQuery.isError,
          isFetchingNextPage: pinsQuery.isFetchingNextPage,
          hasNextPage: pinsQuery.hasNextPage,
          fetchNextPage: pinsQuery.fetchNextPage,
          refetch: pinsQuery.refetch,
          isRefetching: pinsQuery.isRefetching,
        };
    }
  };

  const {
    data: searchResults,
    fetchNextPage: fetchNextSearchPage,
    hasNextPage: hasNextSearchPage,
    isFetchingNextPage: isFetchingNextSearchPage,
    isLoading: searchLoading,
    isError: isSearchError,
    isRefetching: isRefetchingSearch,
    refetch: refetchSearch,
  } = useInfiniteQuery({
    queryKey: ['user-creations-search', user?.id, debouncedSearchQuery],
    queryFn: ({ pageParam = 0 }) =>
      searchContent(debouncedSearchQuery, pageParam, 20, 'general', {
        restricted_scene: 'member',
        restricted_field: 'member_hash_id',
        restricted_value: user?.id,
      }),
    enabled: debouncedSearchQuery.length > 0 && !!user?.id,
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      if (lastPage.paging?.is_end) return undefined;
      return getNextPageOffset(lastPage.paging?.next);
    },
  });

  const HighlightText = (
    text: string,
    highlightColor: string = primaryColor,
  ) => {
    if (!text) return '';
    const decodedText = text
      .replace(/&lt;em&gt;/g, '[[EM]]')
      .replace(/&lt;\/em&gt;/g, '[[/EM]]')
      .replace(/<em>/g, '[[EM]]')
      .replace(/<\/em>/g, '[[/EM]]')
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ');
    const parts = decodedText.split(/(\[\[EM\]\].*?\[\[\/EM\]\])/gs);
    return (
      <React.Fragment>
        {parts.map((part, i) =>
          part.startsWith('[[EM]]') && part.endsWith('[[/EM]]') ? (
            <Text
              // biome-ignore lint/suspicious/noArrayIndexKey: parts 是同一段文本按 [[EM]] 标记 split 出的片段,数量与顺序由该次渲染的文本唯一决定,不增删也不重排。
              key={i}
              type="primary"
              className="font-bold"
              style={{ color: highlightColor }}
            >
              {part.replace(/\[\[\/?EM\]\]/g, '')}
            </Text>
          ) : (
            part
          ),
        )}
      </React.Fragment>
    );
  };

  const parseSearchResult = (item: ZhihuSearchResultItem): FeedItem | null => {
    const obj = item.object as ProfileContentItem;
    if (!obj || obj.id === null || obj.id === undefined) return null;
    const feedType = normalizeUserFeedType(obj.type);
    if (!feedType) return null;
    const highlight = item.highlight || {};
    return {
      id: String(obj.id),
      type: feedType,
      title: highlight.title
        ? HighlightText(highlight.title)
        : obj.question?.name || obj.title || '无标题',
      titleString: obj.question?.name || obj.title || '无标题',
      excerpt: highlight.description
        ? HighlightText(highlight.description)
        : obj.excerpt || '',
      image: obj.thumbnail_info?.thumbnails?.[0]?.url || null,
      voteCount: obj.voteup_count || 0,
      commentCount: obj.comment_count || 0,
      author: {
        id: obj.author?.id || user?.id || '',
        name: obj.author?.name || user?.name || '匿名用户',
        avatar: obj.author?.avatar_url || user?.avatar_url || '',
        url_token: obj.author?.url_token || user?.url_token,
      },
      questionId:
        obj.question?.id !== undefined
          ? String(obj.question.id)
          : obj.id !== undefined
            ? String(obj.id)
            : undefined,
      voted: obj.relationship?.voting || 0,
      favlistsCount: obj.favlists_count || obj.favorite_count || 0,
    };
  };

  const isSearching = debouncedSearchQuery.length > 0;
  const currentListItems = isSearching
    ? searchResults?.pages.flatMap(
        (page) =>
          page.data
            ?.map(parseSearchResult)
            .filter((item): item is FeedItem => item !== null) || [],
      ) || []
    : [];

  const refreshSearch = React.useCallback(() => {
    return refreshInfiniteQuery(
      queryClient,
      ['user-creations-search', user?.id, debouncedSearchQuery],
      refetchSearch,
    );
  }, [debouncedSearchQuery, queryClient, refetchSearch, user?.id]);

  const handleFollow = async () => {
    if (followLoading || !user) return;
    if (!cookies) {
      router.push('/login');
      return;
    }
    setFollowLoading(true);
    try {
      const targetId = (user?.url_token || id) as string;
      const nextIsFollowing = !user.is_following;
      const response = user.is_following
        ? await unfollowMember(targetId)
        : await followMember(targetId);
      queryClient.setQueryData<ZhihuMember>(
        ['user-detail', id],
        (currentMember) =>
          currentMember
            ? {
                ...currentMember,
                is_following: nextIsFollowing,
                follower_count:
                  response.follower_count ??
                  Math.max(
                    0,
                    (currentMember.follower_count || 0) +
                      (nextIsFollowing ? 1 : -1),
                  ),
              }
            : currentMember,
      );
      void refetchUser();

      const myIdentifiers = [me?.id, me?.url_token].filter(
        (identifier): identifier is string => typeof identifier === 'string',
      );
      await Promise.all(
        myIdentifiers.flatMap((identifier) => [
          queryClient.invalidateQueries({
            queryKey: ['me-detail', identifier],
            exact: true,
          }),
          queryClient.invalidateQueries({
            queryKey: ['user-following-users', identifier],
            exact: true,
          }),
        ]),
      );
    } catch {
      console.error('关注操作失败');
      Alert.alert('提示', '操作失败，请重试');
    } finally {
      setFollowLoading(false);
    }
  };

  const renderHeader = () => (
    <View className="bg-transparent">
      <Image
        source={{
          uri:
            user?.cover_url ||
            'https://picx.zhimg.com/v2-3975ba668e1c6670e309228892697843_b.jpg',
        }}
        className="h-[120px] w-full"
      />
      <View type="surface" className="px-5 pt-0 pb-4 rounded-b-[24px]">
        <View className="flex-row justify-between items-end -mt-10">
          <Reanimated.Image
            source={{ uri: user?.avatar_url || (initialAvatar as string) }}
            className="w-20 h-20 rounded-[40px] border-4 border-white dark:border-[#1e1e22]"
            sharedTransitionTag={`avatar-${user?.url_token || id}`}
          />
          {!isMe && (
            <Pressable
              className="px-5 h-9 rounded-full justify-center items-center mb-1.5"
              style={[
                user?.is_following
                  ? {
                      backgroundColor: 'transparent',
                      borderColor: borderColor,
                      borderWidth: 1,
                    }
                  : { backgroundColor: primaryColor },
              ]}
              onPress={handleFollow}
              disabled={followLoading}
            >
              {followLoading ? (
                <ActivityIndicator
                  size="small"
                  color={
                    user?.is_following
                      ? Colors[colorScheme].textSecondary
                      : Colors[colorScheme].textInverse
                  }
                />
              ) : (
                <Text
                  className="font-bold text-sm"
                  style={[
                    { color: Colors[colorScheme].textInverse },
                    user?.is_following && {
                      color: Colors[colorScheme].textSecondary,
                    },
                  ]}
                >
                  {user?.is_following ? '已关注' : '关注'}
                </Text>
              )}
            </Pressable>
          )}
        </View>
        <Text className="text-[22px] font-bold mt-2.5">{user?.name}</Text>
        <Text type="secondary" className="mt-1.5 text-sm">
          {user?.headline || '知乎用户'}
        </Text>

        {user?.description ? (
          <Text
            type="secondary"
            className="mt-2.5 text-[13px] leading-[18px]"
            numberOfLines={3}
          >
            {user.description}
          </Text>
        ) : null}

        {!isMe && (user?.mutual_followees_count || 0) > 0 && (
          <Pressable
            className="flex-row items-center mt-[15px] p-2.5 rounded-lg bg-black/5 dark:bg-white/5"
            onPress={() => router.push(`/user/${user?.url_token || id}/mutual`)}
          >
            <Text className="text-[13px]">
              <Text className="font-bold">{user?.mutual_followees_count}</Text>{' '}
              位共同关注
            </Text>
            <Image
              source={{
                uri: 'https://pic1.zhimg.com/v2-abed1a8c04702bc9e7ba3d3d82bc7591_s.jpg',
              }}
              className="w-5 h-5 rounded-full ml-2"
            />
          </Pressable>
        )}

        <View className="flex-row mt-5 pt-[15px] bg-transparent">
          <Pressable
            className="mr-[30px] items-center"
            onPress={() =>
              router.push(`/user/${user?.url_token || id}/followers`)
            }
          >
            <Text className="font-bold text-lg">
              {user?.follower_count || 0}
            </Text>
            <Text type="secondary" className="text-xs mt-0.5">
              关注者
            </Text>
          </Pressable>
          <Pressable
            className="mr-[30px] items-center"
            onPress={() =>
              router.push(`/user/${user?.url_token || id}/following`)
            }
          >
            <Text className="font-bold text-lg">
              {user?.following_count || 0}
            </Text>
            <Text type="secondary" className="text-xs mt-0.5">
              关注
            </Text>
          </Pressable>
          <View className="items-center">
            <Text className="font-bold text-lg">{user?.voteup_count || 0}</Text>
            <Text type="secondary" className="text-xs mt-0.5">
              赞同
            </Text>
          </View>
        </View>
      </View>
    </View>
  );

  const renderSearchBar = () => (
    <View className="pb-1 pt-1 bg-transparent">
      <View
        className="flex-row items-center rounded-3xl mx-[15px] my-2.5 pr-2.5 h-9"
        style={{ backgroundColor: Colors[colorScheme].backgroundTertiary }}
      >
        <Ionicons
          name="search"
          size={16}
          color={Colors[colorScheme].textTertiary}
          className="ml-2.5"
        />
        <TextInput
          className="flex-1 text-sm px-2.5 h-full py-0"
          style={{
            color: Colors[colorScheme].text,
            textAlignVertical: 'center',
          }}
          placeholder={`搜索 ${user?.name || '用户'} 的创作...`}
          placeholderTextColor={Colors[colorScheme].textTertiary}
          value={searchQuery}
          onChangeText={setSearchQuery}
          returnKeyType="search"
        />
        {searchQuery.length > 0 && (
          <Pressable onPress={() => setSearchQuery('')} className="p-[5px]">
            <Ionicons
              name="close-circle"
              size={16}
              color={Colors[colorScheme].textTertiary}
            />
          </Pressable>
        )}
      </View>
    </View>
  );

  const renderTabsSelector = () => (
    <View className="flex-row bg-transparent my-1 border-b border-gray-100 dark:border-gray-800">
      {PROFILE_TABS.map((tab, idx) => {
        const count = tab.countKey ? user?.[tab.countKey] : undefined;
        const countStr = count !== undefined && count > 0 ? ` ${count}` : '';
        const isActive = activeTab === tab.key;
        return (
          <Pressable
            key={tab.key}
            onPress={() => handleTabPress(idx)}
            className="flex-1 py-2 items-center"
            style={
              isActive && {
                borderBottomWidth: 2.5,
                borderBottomColor: primaryColor,
              }
            }
          >
            <Text
              className="font-bold text-[14px]"
              style={{
                color: isActive
                  ? primaryColor
                  : Colors[colorScheme].textSecondary,
              }}
            >
              {tab.label}
              {countStr}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  const renderAnswersSortSelector = () => {
    return (
      <View
        className="flex-row px-[15px] py-2.5 bg-transparent"
        style={{ borderBottomWidth: 0 }}
      >
        {(
          [
            { key: 'created', label: '最新' },
            { key: 'voteups', label: '赞同' },
          ] as const
        ).map((item) => (
          <Pressable
            key={item.key}
            onPress={() => setSortBy(item.key)}
            className="px-3 py-1 mr-2.5 rounded"
            style={[
              sortBy === item.key && {
                backgroundColor: 'rgba(0,132,255,0.08)',
              },
            ]}
          >
            <Text
              type={sortBy === item.key ? 'primary' : 'secondary'}
              className="text-[13px]"
              style={[sortBy === item.key && { fontWeight: 'bold' }]}
            >
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>
    );
  };

  const renderItemContent = (item: unknown, tabKey: ProfileTabKey) => {
    const displayItem = getProfileContentItem(item, tabKey);
    if (!displayItem) return null;

    const rawType = displayItem.type;
    const mappedType: UserFeedType =
      normalizeUserFeedType(rawType) || 'answers';

    const getExcerptText = () => {
      if (rawType === 'pin') {
        if (Array.isArray(displayItem.content)) {
          return displayItem.content
            .filter((c) => c.type === 'text')
            .map((c) => c.content)
            .join('')
            .replace(/<[^>]+>/g, '')
            .substring(0, 150);
        }
        if (typeof displayItem.content === 'string') {
          return (displayItem.content as string)
            .replace(/<[^>]+>/g, '')
            .substring(0, 150);
        }
      }
      const raw = displayItem.excerpt || displayItem.content || '';
      if (typeof raw === 'string')
        return raw.replace(/<[^>]+>/g, '').substring(0, 150);
      return '';
    };

    const imageUrl =
      displayItem.image_url ||
      displayItem.thumbnail ||
      (rawType === 'pin' && Array.isArray(displayItem.content)
        ? displayItem.content.find((content) => content.type === 'image')?.url
        : null) ||
      null;

    const feedItem: FeedItem = {
      id: displayItem.id?.toString() || String(displayItem.url),
      title: displayItem.question?.title || displayItem.title || '',
      questionId:
        displayItem.question?.id?.toString() ||
        (rawType === 'question' ? displayItem.id?.toString() : undefined),
      author: {
        id: displayItem.author?.id || user?.id || '',
        url_token: displayItem.author?.url_token || user?.url_token || '',
        name: displayItem.author?.name || user?.name || '匿名用户',
        avatar:
          displayItem.author?.avatar_url ||
          user?.avatar_url ||
          'https://picx.zhimg.com/v2-abed1a8c04702bc9e7ba3d3d82bc7591_s.jpg',
        headline: displayItem.author?.headline || user?.headline || '',
      },
      excerpt: getExcerptText(),
      image: imageUrl,
      voteCount:
        mappedType === 'pins'
          ? displayItem.reaction_count || displayItem.like_count || 0
          : displayItem.voteup_count || 0,
      commentCount:
        displayItem.comment_count ??
        displayItem.reaction?.statistics?.comments ??
        0,
      favlistsCount:
        displayItem.favlists_count ??
        displayItem.favorite_count ??
        displayItem.reaction?.statistics?.favorites ??
        0,
      voted: displayItem.relationship?.voting || 0,
      type: mappedType,
    };

    return <FeedCard item={feedItem} />;
  };

  return (
    <View
      className="flex-1"
      style={{ backgroundColor: Colors[colorScheme].background }}
    >
      {isUserLoading ? (
        <View className="flex-1 items-center justify-center bg-transparent">
          <ActivityIndicator color={primaryColor} />
        </View>
      ) : isUserError || !user ? (
        <QueryErrorView
          message="用户资料加载失败"
          onRetry={() => void refetchUser()}
        />
      ) : isSearching ? (
        <FlashList<FeedItem>
          data={currentListItems}
          renderItem={({ item }) => <FeedCard item={item} />}
          keyExtractor={(item) => `user-search-item-${item.id}`}
          scrollEventThrottle={16}
          ListHeaderComponent={
            <View className="bg-transparent">
              {renderHeader()}
              {renderSearchBar()}
            </View>
          }
          ListFooterComponent={
            <View className="bg-transparent">
              {searchLoading || isFetchingNextSearchPage ? (
                <ActivityIndicator
                  style={{ margin: 20 }}
                  color={primaryColor}
                />
              ) : currentListItems.length > 0 && !hasNextSearchPage ? (
                <Text type="secondary" className="text-center p-5 text-xs">
                  — 已经到底了喵 —
                </Text>
              ) : null}
            </View>
          }
          ListEmptyComponent={
            searchLoading ? null : isSearchError ? (
              <QueryErrorView
                message="搜索结果加载失败"
                onRetry={() => void refreshSearch()}
              />
            ) : (
              <View className="items-center py-20 bg-transparent">
                <Text type="secondary">没有找到相关创作</Text>
              </View>
            )
          }
          onEndReached={() => {
            if (hasNextSearchPage && !isFetchingNextSearchPage)
              fetchNextSearchPage();
          }}
          onEndReachedThreshold={0.5}
          onRefresh={() => void refreshSearch()}
          refreshing={isRefetchingSearch}
        />
      ) : (
        <View style={{ flex: 1 }}>
          {/* Header 绝对定位在最顶层，且水平完全不跟随 PagerView 滑动 */}
          <Reanimated.View
            onLayout={(e) => {
              const height = e.nativeEvent.layout.height;
              if (height > 0 && height !== headerHeight) {
                setHeaderHeight(height);
                maxScroll.value = height - 50; // 减去 Tab 栏高度，以保留 Tab 栏悬停在顶部
              }
            }}
            style={[
              headerAnimatedStyle,
              {
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                zIndex: 100,
                backgroundColor: Colors[colorScheme].background,
              },
            ]}
            onStartShouldSetResponder={(evt) => {
              panStart.current = {
                x: evt.nativeEvent.pageX,
                y: evt.nativeEvent.pageY,
              };
              return false;
            }}
            onMoveShouldSetResponder={(evt) => {
              const deltaX = Math.abs(
                evt.nativeEvent.pageX - panStart.current.x,
              );
              const deltaY = Math.abs(
                evt.nativeEvent.pageY - panStart.current.y,
              );
              // 拦截横向手势，使得在 Header 上的左滑右滑完全不发生切屏
              return deltaX > deltaY && deltaX > 10;
            }}
            onResponderTerminationRequest={() => true}
          >
            {renderHeader()}
            {renderSearchBar()}
            {renderTabsSelector()}
          </Reanimated.View>

          {/* 底部 PagerView 进行左右切屏，Header 不会参与左右平移 */}
          <PagerView
            ref={pagerRef}
            style={{ flex: 1 }}
            initialPage={initialTabIndex}
            onPageScroll={(e) => {
              pagerPosition.value = e.nativeEvent.position;
              pagerOffset.value = e.nativeEvent.offset;
            }}
            onPageScrollStateChanged={(e) => {
              const state = e.nativeEvent.pageScrollState;
              if (state === 'dragging') {
                syncLists(activeIndexRef.current);
              } else if (state === 'idle') {
                const tab = PROFILE_TABS[activeIndexRef.current].key;
                setVisitedTabs((prev) => {
                  if (prev[tab]) return prev;
                  return { ...prev, [tab]: true };
                });
              }
            }}
            onPageSelected={(e) => {
              const idx = e.nativeEvent.position;
              const tab = PROFILE_TABS[idx].key;
              setActiveTab(tab);
              activeIndex.value = idx;
              activeIndexRef.current = idx;

              // 亚像素微调滚动，强行触发 FlashList 的可见区重绘，防止显示空白
              const currentScrollY = getSharedValue(idx).value;
              if (currentScrollY > 0) {
                requestAnimationFrame(() => {
                  listRefs.current[idx]?.scrollToOffset({
                    offset: currentScrollY + 0.1,
                    animated: false,
                  });
                });
              }
            }}
          >
            {PROFILE_TABS.map((tab, idx) => {
              const query = getTabQueryState(tab.key);
              return (
                <NativeView key={tab.key} className="flex-1">
                  <AnimatedFlashList
                    ref={(ref: FlashListRef<unknown> | null) => {
                      listRefs.current[idx] = ref;
                    }}
                    data={query.data}
                    renderItem={({ item }: { item: unknown }) =>
                      renderItemContent(item, tab.key)
                    }
                    keyExtractor={(item: unknown) =>
                      `user-item-${tab.key}-${getProfileListItemKey(item)}`
                    }
                    contentContainerStyle={{ paddingTop: headerHeight }}
                    scrollEventThrottle={16}
                    drawDistance={1000}
                    removeClippedSubviews={false}
                    onScroll={
                      idx === 0
                        ? scrollHandler0
                        : idx === 1
                          ? scrollHandler1
                          : idx === 2
                            ? scrollHandler2
                            : idx === 3
                              ? scrollHandler3
                              : scrollHandler4
                    }
                    ListHeaderComponent={
                      tab.key === 'answers' ? renderAnswersSortSelector() : null
                    }
                    ListFooterComponent={
                      <View className="bg-transparent">
                        {query.isLoading || query.isFetchingNextPage ? (
                          <ActivityIndicator
                            style={{ margin: 20 }}
                            color={primaryColor}
                          />
                        ) : query.data.length > 0 && !query.hasNextPage ? (
                          <Text
                            type="secondary"
                            className="text-center p-5 text-xs"
                          >
                            — 已经到底了喵 —
                          </Text>
                        ) : null}
                      </View>
                    }
                    ListEmptyComponent={
                      query.isLoading ? null : query.isError ? (
                        <QueryErrorView
                          message={`${tab.label}加载失败`}
                          onRetry={() => void query.refetch()}
                        />
                      ) : (
                        <View className="items-center py-20 bg-transparent">
                          <Text type="secondary">暂无{tab.label}内容</Text>
                        </View>
                      )
                    }
                    onEndReached={() => {
                      if (query.hasNextPage && !query.isFetchingNextPage) {
                        query.fetchNextPage();
                      }
                    }}
                    onEndReachedThreshold={0.5}
                    onRefresh={() =>
                      void refreshInfiniteQuery(
                        queryClient,
                        query.queryKey,
                        query.refetch,
                      )
                    }
                    refreshing={query.isRefetching}
                  />
                </NativeView>
              );
            })}
          </PagerView>
        </View>
      )}
    </View>
  );
}
