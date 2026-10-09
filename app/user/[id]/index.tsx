import Ionicons from '@expo/vector-icons/Ionicons';
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  View as NativeView,
  ScrollView,
  StyleSheet,
} from 'react-native';
import PagerView, {
  type PagerViewOnPageScrollEvent,
} from 'react-native-pager-view';
import Reanimated, {
  interpolate,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useEvent,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  type FeedItem,
  followMember,
  getContentVoteCount,
  getContentVoteState,
  getMe,
  getMemberActivities,
  getMemberRelations,
  getMemberWithFallback,
  MEMBER_ANSWERS_INCLUDE,
  unfollowMember,
  type ZhihuMember,
} from '@/api/zhihu';
import { addReadHistory } from '@/api/zhihu/history';
import { BouncyButton } from '@/components/BouncyButton';
import { FeedCard } from '@/components/FeedCard';
import { FollowButton } from '@/components/FollowButton';
import { ProfileColumnCard } from '@/components/profile/ProfileColumnCard';
import { ProfileToolbarBackground } from '@/components/profile/ProfileCover';
import { ProfileHeader } from '@/components/profile/ProfileHeader';
import {
  ProfileTabList,
  type ProfileTabListHandle,
} from '@/components/profile/ProfileTabList';
import { getProfileFeedBody } from '@/components/profile/profileSearchResults';
import {
  getInitialProfileTab,
  PROFILE_TABS,
  type ProfileTabKey,
} from '@/components/profile/profileTabs';
import { QueryErrorView } from '@/components/QueryErrorView';
import { StableAvatar } from '@/components/StableAvatar';
import { Text, useThemeColor, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { useUserAnswersVotedByMe } from '@/hooks/useUserAnswersVotedByMe';
import { useUserColumns } from '@/hooks/useUserColumns';
import { useUserCreations } from '@/hooks/useUserCreations';
import { useAuthStore } from '@/store/useAuthStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import type { ZhihuAuthor, ZhihuColumnSummary } from '@/types/zhihu';
import { getProfileAnswerReadingContext } from '@/utils/answerReadingContext';
import {
  getProfileCoverState,
  getProfileHeaderOffset,
  getProfileSyncedOffset,
} from '@/utils/profileScroll';
import { refreshInfiniteQuery } from '@/utils/query';
import { parseZhihuUrl } from '@/utils/url';
import {
  getNextPageOffset,
  getRecentActivityTargetId,
  isOwnMemberProfile,
  normalizeUserFeedType,
  type UserFeedType,
} from '@/utils/userProfile';
import { getZhihuVideoSource } from '@/utils/zhihuVideo';

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
  answer_type?: unknown;
  paid_info?: unknown;
  content_need_truncated?: unknown;
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

const AnimatedPagerView = Reanimated.createAnimatedComponent(PagerView);

type ProfileRouteParams = {
  id: string;
  avatar?: string;
  tab?: string;
};

export default function UserDetailScreen() {
  const params = useLocalSearchParams<ProfileRouteParams>();
  return <UserProfileScreen key={params.id} params={params} />;
}

function UserProfileScreen({ params }: { params: ProfileRouteParams }) {
  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const { id, avatar: initialAvatar, tab: initialTabParam } = params;
  const router = useRouter();
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

  const [headerHeight, setHeaderHeight] = useState(0);
  const [tabBarHeight, setTabBarHeight] = useState(52);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [navigationRowHeight, setNavigationRowHeight] = useState(56);
  const navigationHeight = insets.top + navigationRowHeight;
  const collapseDistance = Math.max(
    0,
    headerHeight - navigationHeight - tabBarHeight,
  );
  const [compactHeader, setCompactHeader] = useState(false);
  const [profileTabViewportWidth, setProfileTabViewportWidth] = useState(0);
  const [tabLayoutVersion, setTabLayoutVersion] = useState(0);
  const pagerRef = useRef<PagerView>(null);
  const profileTabsScrollRef = useRef<ScrollView>(null);
  const profileTabLayoutsRef = useRef<
    Array<{ x: number; width: number } | undefined>
  >([]);
  const listRefs = useRef<Array<ProfileTabListHandle | null>>([]);
  const activeIndexRef = useRef(initialTabIndex);
  const pagerProgress = useSharedValue(initialTabIndex);
  const scrollOffsets = useSharedValue<number[]>(
    Array(PROFILE_TABS.length).fill(0),
  );
  const maxScroll = useSharedValue(0);
  const profileTabXs = useSharedValue<number[]>([]);
  const profileTabWidths = useSharedValue<number[]>([]);

  useEffect(() => {
    maxScroll.value = collapseDistance;
  }, [collapseDistance, maxScroll]);

  const headerOffset = useDerivedValue(() =>
    getProfileHeaderOffset(
      scrollOffsets.value,
      pagerProgress.value,
      maxScroll.value,
    ),
  );
  const headerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -headerOffset.value }],
  }));
  const compactOpacity = useDerivedValue(() => {
    const distance = maxScroll.value;
    if (distance <= 0) return 0;
    return Math.min(
      getProfileCoverState(headerOffset.value).blurOpacity,
      interpolate(
        headerOffset.value,
        [distance * 0.35, distance * 0.7],
        [0, 1],
        'clamp',
      ),
    );
  });
  const toolbarIdentityStyle = useAnimatedStyle(() => ({
    opacity: compactOpacity.value,
    transform: [{ translateY: (1 - compactOpacity.value) * 8 }],
  }));
  useAnimatedReaction(
    () => compactOpacity.value > 0.7,
    (value, previous) => {
      if (value !== previous) runOnJS(setCompactHeader)(value);
    },
  );

  const pageScrollHandler = useEvent<PagerViewOnPageScrollEvent>(
    (event) => {
      'worklet';
      if (event.eventName.endsWith('onPageScroll')) {
        pagerProgress.value = event.position + event.offset;
      }
    },
    ['onPageScroll'],
  );

  const profileTabIndicatorStyle = useAnimatedStyle(() => {
    const progress = Math.max(
      0,
      Math.min(PROFILE_TABS.length - 1, pagerProgress.value),
    );
    const leftIndex = Math.floor(progress);
    const rightIndex = Math.ceil(progress);
    const fraction = progress - leftIndex;
    const leftWidth = profileTabWidths.value[leftIndex] || 0;
    const rightWidth = profileTabWidths.value[rightIndex] || leftWidth;
    const leftX = profileTabXs.value[leftIndex] || 0;
    const rightX = profileTabXs.value[rightIndex] || leftX;
    const width = leftWidth + (rightWidth - leftWidth) * fraction;
    return {
      opacity: leftWidth > 0 ? 1 : 0,
      width: Math.min(32, width),
      transform: [
        {
          translateX:
            leftX +
            (rightX - leftX) * fraction +
            (width - Math.min(32, width)) / 2,
        },
      ],
    };
  });

  const recordProfileTabLayout = (idx: number, x: number, width: number) => {
    const previous = profileTabLayoutsRef.current[idx];
    if (previous?.x === x && previous.width === width) return;
    profileTabLayoutsRef.current[idx] = { x, width };
    profileTabXs.value = PROFILE_TABS.map(
      (_, i) => profileTabLayoutsRef.current[i]?.x || 0,
    );
    profileTabWidths.value = PROFILE_TABS.map(
      (_, i) => profileTabLayoutsRef.current[i]?.width || 0,
    );
    setTabLayoutVersion((version) => version + 1);
  };

  const scrollProfileTabIntoView = (idx: number, animated: boolean) => {
    const layout = profileTabLayoutsRef.current[idx];
    if (!layout || profileTabViewportWidth <= 0) return;
    profileTabsScrollRef.current?.scrollTo({
      x: Math.max(0, layout.x + layout.width / 2 - profileTabViewportWidth / 2),
      animated,
    });
  };

  // Recenter after rotation, font changes or newly loaded counts resize tabs.
  useEffect(() => {
    if (tabLayoutVersion === 0 || profileTabViewportWidth <= 0) return;
    const layout = profileTabLayoutsRef.current[activeIndexRef.current];
    if (!layout) return;
    profileTabsScrollRef.current?.scrollTo({
      x: Math.max(0, layout.x + layout.width / 2 - profileTabViewportWidth / 2),
      animated: false,
    });
  }, [profileTabViewportWidth, tabLayoutVersion]);

  const syncLists = (sourceIndex: number) => {
    const offsets = scrollOffsets.value;
    for (let index = 0; index < PROFILE_TABS.length; index += 1) {
      if (index === sourceIndex) continue;
      const offset = getProfileSyncedOffset(
        offsets[sourceIndex],
        offsets[index],
        collapseDistance,
      );
      listRefs.current[index]?.scrollToOffset(offset);
    }
  };

  const handleTabPress = (index: number) => {
    syncLists(activeIndexRef.current);
    const tab = PROFILE_TABS[index].key;
    setVisitedTabs((previous) => ({ ...previous, [tab]: true }));
    pagerRef.current?.setPage(index);
    scrollProfileTabIntoView(index, true);
  };

  const primaryColor = useThemeColor({}, 'primary');
  const onPrimaryColor = useThemeColor({}, 'onPrimary');
  const linkColor = useThemeColor({}, 'link');

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

  const creationsQuery = useUserCreations(
    user,
    Boolean(visitedTabs.creations || activeTab === 'creations'),
  );
  const creationTargets = useMemo(
    () =>
      new Map(
        creationsQuery.activities.flatMap((activity) => {
          const target = activity.target;
          const targetId = target && getRecentActivityTargetId(target);
          const type = normalizeUserFeedType(target?.type);
          return target && targetId !== undefined && type
            ? [[`${type}:${targetId}`, target] as const]
            : [];
        }),
      ),
    [creationsQuery.activities],
  );

  const answersVotedByMeQuery = useUserAnswersVotedByMe(
    user,
    Boolean(visitedTabs.votes || activeTab === 'votes'),
  );

  // 2. 回答 Query
  const answersQuery = useInfiniteQuery({
    queryKey: ['user-answers', id, sortBy],
    queryFn: ({ pageParam = 0 }) => {
      const targetId = (user?.url_token || id) as string;
      return getMemberRelations(targetId, 'answers', {
        include: MEMBER_ANSWERS_INCLUDE,
        offset: pageParam,
        limit: 20,
        sort_by: sortBy,
        ws_qiangzhisafe: 0,
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

  const columnsQuery = useUserColumns(
    user,
    Boolean(visitedTabs.columns || activeTab === 'columns'),
  );

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
          isFetchNextPageError: activitiesQuery.isFetchNextPageError,
          isFetching: activitiesQuery.isFetching,
          hasNextPage: activitiesQuery.hasNextPage,
          fetchNextPage: activitiesQuery.fetchNextPage,
          refetch: activitiesQuery.refetch,
        };
      case 'creations':
        return {
          queryKey: creationsQuery.queryKey,
          data: creationsQuery.feedItems,
          isLoading: creationsQuery.isLoading,
          isError: creationsQuery.isError,
          isFetchingNextPage: creationsQuery.isFetchingNextPage,
          isFetchNextPageError: creationsQuery.isFetchNextPageError,
          isFetching: creationsQuery.isFetching,
          hasNextPage: creationsQuery.hasNextPage,
          fetchNextPage: creationsQuery.fetchNextPage,
          refetch: creationsQuery.refetch,
        };
      case 'answers':
        return {
          queryKey: ['user-answers', id, sortBy] as const,
          data:
            answersQuery.data?.pages.flatMap((page) => page.data || []) || [],
          isLoading: answersQuery.isLoading,
          isError: answersQuery.isError,
          isFetchingNextPage: answersQuery.isFetchingNextPage,
          isFetchNextPageError: answersQuery.isFetchNextPageError,
          isFetching: answersQuery.isFetching,
          hasNextPage: answersQuery.hasNextPage,
          fetchNextPage: answersQuery.fetchNextPage,
          refetch: answersQuery.refetch,
        };
      case 'articles':
        return {
          queryKey: ['user-articles', id] as const,
          data:
            articlesQuery.data?.pages.flatMap((page) => page.data || []) || [],
          isLoading: articlesQuery.isLoading,
          isError: articlesQuery.isError,
          isFetchingNextPage: articlesQuery.isFetchingNextPage,
          isFetchNextPageError: articlesQuery.isFetchNextPageError,
          isFetching: articlesQuery.isFetching,
          hasNextPage: articlesQuery.hasNextPage,
          fetchNextPage: articlesQuery.fetchNextPage,
          refetch: articlesQuery.refetch,
        };
      case 'questions':
        return {
          queryKey: ['user-questions', id] as const,
          data:
            questionsQuery.data?.pages.flatMap((page) => page.data || []) || [],
          isLoading: questionsQuery.isLoading,
          isError: questionsQuery.isError,
          isFetchingNextPage: questionsQuery.isFetchingNextPage,
          isFetchNextPageError: questionsQuery.isFetchNextPageError,
          isFetching: questionsQuery.isFetching,
          hasNextPage: questionsQuery.hasNextPage,
          fetchNextPage: questionsQuery.fetchNextPage,
          refetch: questionsQuery.refetch,
        };
      case 'columns':
        return {
          queryKey: columnsQuery.queryKey,
          data: columnsQuery.columns,
          isLoading: columnsQuery.isLoading,
          isError: columnsQuery.isError,
          isFetchingNextPage: columnsQuery.isFetchingNextPage,
          isFetchNextPageError: columnsQuery.isFetchNextPageError,
          isFetching: columnsQuery.isFetching,
          hasNextPage: columnsQuery.hasNextPage,
          fetchNextPage: columnsQuery.fetchNextPage,
          refetch: columnsQuery.refetch,
        };
      case 'pins':
        return {
          queryKey: ['user-pins', id] as const,
          data: pinsQuery.data?.pages.flatMap((page) => page.data || []) || [],
          isLoading: pinsQuery.isLoading,
          isError: pinsQuery.isError,
          isFetchingNextPage: pinsQuery.isFetchingNextPage,
          isFetchNextPageError: pinsQuery.isFetchNextPageError,
          isFetching: pinsQuery.isFetching,
          hasNextPage: pinsQuery.hasNextPage,
          fetchNextPage: pinsQuery.fetchNextPage,
          refetch: pinsQuery.refetch,
        };
      case 'votes':
        return {
          queryKey: answersVotedByMeQuery.queryKey,
          data: answersVotedByMeQuery.answers,
          isLoading:
            answersVotedByMeQuery.isAuthenticated &&
            answersVotedByMeQuery.isLoading,
          isError:
            answersVotedByMeQuery.isAuthenticated &&
            answersVotedByMeQuery.isError,
          isFetchingNextPage:
            answersVotedByMeQuery.isAuthenticated &&
            answersVotedByMeQuery.isFetchingNextPage,
          isFetchNextPageError:
            answersVotedByMeQuery.isAuthenticated &&
            answersVotedByMeQuery.isFetchNextPageError,
          isFetching:
            answersVotedByMeQuery.isAuthenticated &&
            answersVotedByMeQuery.isFetching,
          hasNextPage:
            answersVotedByMeQuery.isAuthenticated &&
            answersVotedByMeQuery.hasNextPage,
          fetchNextPage: answersVotedByMeQuery.fetchNextPage,
          refetch: answersVotedByMeQuery.refetch,
        };
    }
  };

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

  const renderHeader = () =>
    user ? (
      <ProfileHeader
        user={user}
        initialAvatar={initialAvatar}
        isMe={isMe}
        followLoading={followLoading}
        topInset={navigationHeight}
        onFollow={() => void handleFollow()}
        onFollowers={() =>
          router.push(`/user/${user.url_token || id}/followers`)
        }
        onFollowing={() =>
          router.push(`/user/${user.url_token || id}/following`)
        }
        onMutual={() => router.push(`/user/${user.url_token || id}/mutual`)}
      />
    ) : null;

  const renderTabsSelector = () => (
    <View
      style={{
        backgroundColor: Colors[colorScheme].background,
        marginBottom: 4,
        minHeight: 52,
      }}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        if (height > 0) setTabBarHeight(height);
        if (width !== profileTabViewportWidth) {
          setProfileTabViewportWidth(width);
        }
      }}
    >
      <ScrollView
        ref={profileTabsScrollRef}
        horizontal
        bounces={false}
        keyboardShouldPersistTaps="handled"
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ minWidth: '100%' }}
      >
        <NativeView className="flex-row" style={{ minWidth: '100%' }}>
          {PROFILE_TABS.map((tab, idx) => {
            const count =
              tab.key === 'votes'
                ? answersVotedByMeQuery.total
                : tab.key === 'columns'
                  ? columnsQuery.total
                  : tab.countKey
                    ? user?.[tab.countKey]
                    : undefined;
            const countStr =
              count !== undefined && (count > 0 || tab.key === 'votes')
                ? ` ${count}`
                : '';
            const isActive = activeTab === tab.key;
            return (
              <BouncyButton
                key={tab.key}
                accessibilityRole="tab"
                accessibilityLabel={tab.label}
                accessibilityState={{ selected: isActive }}
                onPress={() => handleTabPress(idx)}
                onLayout={(event) => {
                  const { x, width } = event.nativeEvent.layout;
                  recordProfileTabLayout(idx, x, width);
                }}
                style={{
                  minWidth: Math.max(
                    72,
                    profileTabViewportWidth / PROFILE_TABS.length,
                  ),
                  minHeight: 52,
                  paddingVertical: 12,
                  paddingHorizontal: 16,
                  flexShrink: 0,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text
                  numberOfLines={1}
                  className="font-bold text-[14px]"
                  style={{
                    fontSize: 14,
                    lineHeight: 21,
                    color: isActive
                      ? linkColor
                      : Colors[colorScheme].textSecondary,
                  }}
                >
                  {tab.label}
                  {countStr}
                </Text>
              </BouncyButton>
            );
          })}
          <Reanimated.View
            pointerEvents="none"
            style={[
              {
                position: 'absolute',
                left: 0,
                bottom: 0,
                height: 2.5,
                borderRadius: 2,
                backgroundColor: primaryColor,
              },
              profileTabIndicatorStyle,
            ]}
          />
        </NativeView>
      </ScrollView>
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
          <BouncyButton
            key={item.key}
            onPress={() => setSortBy(item.key)}
            className="px-3 py-1 mr-2.5 rounded"
            style={[
              sortBy === item.key && {
                backgroundColor: Colors[colorScheme].primaryTransparent,
              },
            ]}
          >
            <Text
              type={sortBy === item.key ? 'primary' : 'secondary'}
              className="text-[13px]"
              style={[
                { fontSize: 13, lineHeight: 20 },
                sortBy === item.key && { fontWeight: 'bold' },
              ]}
            >
              {item.label}
            </Text>
          </BouncyButton>
        ))}
      </View>
    );
  };

  const renderItemContent = (item: unknown, tabKey: ProfileTabKey) => {
    if (tabKey === 'columns')
      return <ProfileColumnCard column={item as ZhihuColumnSummary} />;
    if (tabKey === 'creations') {
      const feedItem = item as FeedItem;
      const target = creationTargets.get(`${feedItem.type}:${feedItem.id}`);
      return (
        <FeedCard
          item={{ ...feedItem, ...getProfileFeedBody(target) }}
          answerContext={getProfileAnswerReadingContext(
            target?.author ?? {},
            user ?? {},
            id,
          )}
        />
      );
    }
    const displayItem = getProfileContentItem(item, tabKey);
    if (!displayItem) return null;

    const rawType = displayItem.type;
    const mappedType: UserFeedType =
      tabKey === 'votes'
        ? 'answers'
        : normalizeUserFeedType(rawType) || 'answers';
    const fallbackAuthor = tabKey === 'votes' ? undefined : user;
    const itemId =
      typeof displayItem.id === 'string'
        ? displayItem.id.trim()
        : typeof displayItem.id === 'number' &&
            Number.isSafeInteger(displayItem.id) &&
            displayItem.id >= 0
          ? String(displayItem.id)
          : undefined;
    const answerIdFromUrl =
      mappedType === 'answers' && typeof displayItem.url === 'string'
        ? parseZhihuUrl(displayItem.url)?.match(/^\/answer\/(\d+)$/)?.[1]
        : undefined;
    const contentId = itemId || answerIdFromUrl;
    if (mappedType === 'answers' && !contentId) return null;

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
      id: contentId || String(displayItem.url),
      title: displayItem.question?.title || displayItem.title || '',
      questionId:
        displayItem.question?.id?.toString() ||
        (rawType === 'question' ? displayItem.id?.toString() : undefined),
      author: {
        id: displayItem.author?.id || fallbackAuthor?.id || '',
        url_token:
          displayItem.author?.url_token || fallbackAuthor?.url_token || '',
        name: displayItem.author?.name || fallbackAuthor?.name || '匿名用户',
        avatar:
          displayItem.author?.avatar_url ||
          fallbackAuthor?.avatar_url ||
          'https://picx.zhimg.com/v2-abed1a8c04702bc9e7ba3d3d82bc7591_s.jpg',
        headline:
          displayItem.author?.headline || fallbackAuthor?.headline || '',
      },
      excerpt: getExcerptText(),
      ...getProfileFeedBody(displayItem),
      image: imageUrl,
      voteCount:
        mappedType === 'videos'
          ? 0
          : (getContentVoteCount(mappedType, displayItem) ?? 0),
      commentCount:
        displayItem.comment_count ??
        displayItem.reaction?.statistics?.comments ??
        0,
      favlistsCount:
        displayItem.favlists_count ??
        displayItem.favorite_count ??
        displayItem.reaction?.statistics?.favorites ??
        0,
      voted:
        mappedType === 'videos'
          ? 0
          : (getContentVoteState(mappedType, displayItem) ?? 0),
      type: mappedType,
      videoSource: getZhihuVideoSource(rawType),
    };

    return (
      <FeedCard
        item={feedItem}
        answerContext={
          // The member's answers endpoint itself identifies the owner even
          // when an item omits author identity; activity/vote tabs do not.
          tabKey === 'answers' &&
          !displayItem.author?.id &&
          !displayItem.author?.url_token
            ? { scene: 'profile_answer', memberId: id, memberSort: sortBy }
            : getProfileAnswerReadingContext(
                displayItem.author ?? {},
                user ?? {},
                id,
                tabKey === 'answers' ? sortBy : 'created',
              )
        }
      />
    );
  };

  const activeMeta = PROFILE_TABS.find((tab) => tab.key === activeTab);
  const activeCount =
    activeTab === 'votes'
      ? answersVotedByMeQuery.total
      : activeTab === 'columns'
        ? columnsQuery.total
        : activeMeta?.countKey
          ? user?.[activeMeta.countKey]
          : undefined;

  return (
    <NativeView
      style={{ flex: 1, backgroundColor: Colors[colorScheme].background }}
      onLayout={(event) => setViewportHeight(event.nativeEvent.layout.height)}
    >
      <Stack.Screen
        options={{ headerShown: false, title: user?.name || '个人主页' }}
      />
      {isUserLoading ? (
        <View className="flex-1 items-center justify-center bg-transparent">
          <ActivityIndicator color={primaryColor} />
        </View>
      ) : !user ? (
        <View style={{ paddingTop: navigationHeight }}>
          <QueryErrorView
            message="用户资料加载失败"
            onRetry={() => void refetchUser()}
          />
        </View>
      ) : (
        <>
          <NativeView style={StyleSheet.absoluteFill}>
            <AnimatedPagerView
              ref={pagerRef}
              style={{ flex: 1 }}
              initialPage={initialTabIndex}
              onPageScroll={pageScrollHandler}
              onPageScrollStateChanged={(event) => {
                if (event.nativeEvent.pageScrollState === 'dragging')
                  syncLists(activeIndexRef.current);
              }}
              onPageSelected={(event) => {
                const index = event.nativeEvent.position;
                const tab = PROFILE_TABS[index]?.key;
                if (!tab) return;
                activeIndexRef.current = index;
                setActiveTab(tab);
                setVisitedTabs((previous) =>
                  previous[tab] ? previous : { ...previous, [tab]: true },
                );
                scrollProfileTabIntoView(index, true);
              }}
            >
              {PROFILE_TABS.map((tab, index) => {
                const query = getTabQueryState(tab.key);
                return (
                  <NativeView
                    key={tab.key}
                    collapsable={false}
                    style={{ width: '100%', height: '100%' }}
                  >
                    <ProfileTabList
                      ref={(ref) => {
                        listRefs.current[index] = ref;
                      }}
                      index={index}
                      label={tab.label}
                      query={{
                        ...query,
                        isLoading: query.isLoading || !visitedTabs[tab.key],
                        refresh: () =>
                          Promise.all([
                            refetchUser(),
                            tab.key === 'creations'
                              ? creationsQuery.refresh()
                              : tab.key === 'votes'
                                ? answersVotedByMeQuery.refresh()
                                : refreshInfiniteQuery(
                                    queryClient,
                                    query.queryKey,
                                  ),
                          ]),
                      }}
                      headerHeight={headerHeight}
                      collapseDistance={collapseDistance}
                      viewportHeight={viewportHeight}
                      bottomInset={insets.bottom}
                      offsets={scrollOffsets}
                      active={activeTab === tab.key}
                      keyExtractor={(item) => {
                        if (tab.key === 'creations') {
                          const content = item as FeedItem;
                          return `user-creation-${content.type}-${content.id}`;
                        }
                        return `user-item-${tab.key}-${getProfileListItemKey(item)}`;
                      }}
                      renderItem={(item) => renderItemContent(item, tab.key)}
                      listHeader={
                        tab.key === 'answers'
                          ? renderAnswersSortSelector()
                          : undefined
                      }
                      emptyState={
                        tab.key === 'votes' ? (
                          <View className="items-center py-20 bg-transparent">
                            <Text type="secondary">
                              {answersVotedByMeQuery.isAuthenticated
                                ? '暂无我赞同过的回答'
                                : '登录后查看我赞同过的回答'}
                            </Text>
                            {!answersVotedByMeQuery.isAuthenticated && (
                              <BouncyButton
                                accessibilityRole="button"
                                accessibilityLabel="登录"
                                onPress={() => router.push('/login')}
                                style={{
                                  marginTop: 16,
                                  paddingHorizontal: 20,
                                  paddingVertical: 10,
                                  borderRadius: 8,
                                  backgroundColor: primaryColor,
                                }}
                              >
                                <Text
                                  style={{
                                    color: onPrimaryColor,
                                    fontWeight: '600',
                                  }}
                                >
                                  登录
                                </Text>
                              </BouncyButton>
                            )}
                          </View>
                        ) : undefined
                      }
                    />
                  </NativeView>
                );
              })}
            </AnimatedPagerView>
          </NativeView>
          <Reanimated.View
            pointerEvents="box-none"
            testID="profile-collapsible-header"
            onLayout={(event) => {
              const height = event.nativeEvent.layout.height;
              if (height > 0) setHeaderHeight(height);
            }}
            style={[
              {
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                zIndex: 10,
                backgroundColor: Colors[colorScheme].background,
              },
              headerAnimatedStyle,
            ]}
          >
            {renderHeader()}
            {renderTabsSelector()}
          </Reanimated.View>
        </>
      )}
      <NativeView
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          zIndex: 20,
          paddingTop: insets.top,
        }}
      >
        {user ? (
          <ProfileToolbarBackground
            coverUrl={user.cover_url}
            navigationHeight={navigationHeight}
            headerOffset={headerOffset}
          />
        ) : null}
        <NativeView
          pointerEvents="box-none"
          onLayout={(event) =>
            setNavigationRowHeight(event.nativeEvent.layout.height)
          }
          style={{
            minHeight: 56,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 12,
            paddingVertical: 6,
            gap: 10,
          }}
        >
          <BouncyButton
            accessibilityRole="button"
            accessibilityLabel="返回"
            onPress={() =>
              router.canGoBack() ? router.back() : router.replace('/(tabs)')
            }
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: `${Colors[colorScheme].backgroundSecondary}E8`,
            }}
          >
            <Ionicons
              name="arrow-back"
              size={23}
              color={Colors[colorScheme].text}
            />
          </BouncyButton>
          <Reanimated.View
            pointerEvents="none"
            accessibilityElementsHidden={!compactHeader}
            style={[
              { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 9 },
              toolbarIdentityStyle,
            ]}
          >
            {user?.avatar_url ? (
              <StableAvatar
                uri={user.avatar_url}
                style={{ width: 30, height: 30, borderRadius: 15 }}
              />
            ) : null}
            <View style={{ flex: 1 }}>
              <Text
                numberOfLines={1}
                style={{
                  fontSize: 15,
                  lineHeight: 23,
                  fontWeight: '700',
                }}
              >
                {user?.name || '个人主页'}
              </Text>
              <Text
                numberOfLines={1}
                type="secondary"
                style={{ fontSize: 11, lineHeight: 17 }}
              >
                {`${activeMeta?.label || '个人主页'}${activeCount === undefined ? '' : ` · ${activeCount}`}`}
              </Text>
            </View>
          </Reanimated.View>
          {compactHeader && user && !isMe && (
            <FollowButton
              following={Boolean(user.is_following)}
              loading={followLoading}
              accessibilityLabel={user.is_following ? '取消关注' : '关注用户'}
              onPress={() => void handleFollow()}
            />
          )}
          <BouncyButton
            accessibilityRole="button"
            accessibilityLabel="搜索此用户的创作"
            disabled={!user}
            onPress={() =>
              router.push({ pathname: '/user/[id]/search', params: { id } })
            }
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: `${Colors[colorScheme].backgroundSecondary}E8`,
            }}
          >
            <Ionicons
              name="search"
              size={20}
              color={Colors[colorScheme].text}
            />
          </BouncyButton>
        </NativeView>
      </NativeView>
    </NativeView>
  );
}
