import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  View as NativeView,
  Platform,
  ScrollView,
  type ScrollViewInstance,
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
  getContentCollectionMetadata,
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
import { GlassNavigationButton } from '@/components/navigation/GlassNavigationButton';
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
import { useFixedHeaderEntryProgress } from '@/features/adaptive-layout/PaneContext';
import { useMemberCreations } from '@/hooks/useMemberCreations';
import { useUserAnswersVotedByMe } from '@/hooks/useUserAnswersVotedByMe';
import { useUserColumns } from '@/hooks/useUserColumns';
import { useAuthStore } from '@/store/useAuthStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import type { ZhihuAuthor, ZhihuColumnSummary } from '@/types/zhihu';
import { getProfileAnswerReadingContext } from '@/utils/answerReadingContext';
import { formatFeedActionText } from '@/utils/feedActionText';
import type { MemberCreation } from '@/utils/memberCreations';
import {
  getProfileCoverState,
  getProfileHeaderOffset,
  getProfileSyncedOffset,
} from '@/utils/profileScroll';
import { refreshInfiniteQuery } from '@/utils/query';
import { parseZhihuUrl } from '@/utils/url';
import {
  getNextPageOffset,
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
  created?: number;
  created_time?: number;
  updated_time?: number;
  action_text?: string;
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
  action_text?: string;
  created_time?: number;
  action_time?: number;
  updated_time?: number;
  actor?: Partial<ZhihuAuthor>;
  source?: {
    action_text?: string;
    action_time?: number;
    created_time?: number;
    actor?: Partial<ZhihuAuthor>;
  };
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
  avatar?: string | string[];
  name?: string | string[];
  headline?: string | string[];
  tab?: string;
};

function profileRouteText(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default function UserDetailScreen() {
  const params = useLocalSearchParams<ProfileRouteParams>();
  return <UserProfileScreen key={params.id} params={params} />;
}

function UserProfileScreen({ params }: { params: ProfileRouteParams }) {
  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const profileEntry = useFixedHeaderEntryProgress();
  const profileEntryStyle = useMemo(
    () =>
      profileEntry && {
        transformOrigin: '50% 0%',
        transform: [
          {
            scale: profileEntry.interpolate({
              inputRange: [0, 1],
              outputRange: [1.06, 1],
            }),
          },
        ],
      },
    [profileEntry],
  );
  const { id, tab: initialTabParam } = params;
  const initialAvatar = profileRouteText(params.avatar);
  const initialName = profileRouteText(params.name);
  const initialHeadline = profileRouteText(params.headline);
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
  const [initialHeaderReady, setInitialHeaderReady] = useState(
    Platform.OS !== 'android',
  );
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
  const profileTabsScrollRef = useRef<ScrollViewInstance>(null);
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
    const synced = [...offsets];
    for (let index = 0; index < PROFILE_TABS.length; index += 1) {
      if (index === sourceIndex) continue;
      const offset = getProfileSyncedOffset(
        offsets[sourceIndex],
        offsets[index],
        collapseDistance,
      );
      synced[index] = offset;
      listRefs.current[index]?.scrollToOffset(offset);
    }
    // Offscreen or still-empty pages apply their scroll only once shown. Record
    // the target now so the header holds its place during the swipe instead of
    // easing toward a neighbour still at the top.
    scrollOffsets.value = synced;
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

  const creationsQuery = useMemberCreations(
    user,
    Boolean(visitedTabs.creations || activeTab === 'creations'),
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
        'data[*].comment_count,content,voteup_count,favlists_count,created,updated,title,excerpt,reaction,relationship.voting,is_favorited;data[*].author';
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
          pageCount: activitiesQuery.data?.pages.length ?? 0,
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
          data: creationsQuery.items,
          pageCount: creationsQuery.data?.pages.length ?? 0,
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
          pageCount: answersQuery.data?.pages.length ?? 0,
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
          pageCount: articlesQuery.data?.pages.length ?? 0,
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
          pageCount: questionsQuery.data?.pages.length ?? 0,
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
          pageCount: columnsQuery.data?.pages.length ?? 0,
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
          pageCount: pinsQuery.data?.pages.length ?? 0,
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
          pageCount: answersVotedByMeQuery.data?.pages.length ?? 0,
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

  const headerUser: ZhihuMember | undefined =
    user ??
    (isUserLoading
      ? {
          id,
          name: initialName ?? '',
          avatar_url: initialAvatar ?? '',
          headline: initialHeadline,
          type: 'people',
        }
      : undefined);
  const renderHeader = () =>
    headerUser ? (
      <ProfileHeader
        user={headerUser}
        initialAvatar={initialAvatar}
        initialName={initialName}
        initialHeadline={initialHeadline}
        isLoading={!user}
        isMe={isMe}
        followLoading={followLoading}
        topInset={navigationHeight}
        onFollow={() => void handleFollow()}
        onFollowers={() =>
          router.push(`/user/${user?.url_token || id}/followers`)
        }
        onFollowing={() =>
          router.push(`/user/${user?.url_token || id}/following`)
        }
        onMutual={() => router.push(`/user/${user?.url_token || id}/mutual`)}
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

  const renderItemContent = (
    item: unknown,
    tabKey: ProfileTabKey,
    // 创作 lists answers by publish time, whatever the 回答 tab's sort.
    answerSort: 'created' | 'voteups' = sortBy,
    actionInfo?: { text?: string; time?: number },
  ): ReactNode => {
    if (tabKey === 'columns')
      return <ProfileColumnCard column={item as ZhihuColumnSummary} />;
    if (tabKey === 'creations') {
      const creation = item as MemberCreation;
      const defaultActionText =
        creation.kind === 'answers'
          ? '回答了问题'
          : creation.kind === 'articles'
            ? '发表了文章'
            : '发布了想法';
      const text =
        creation.actionText ||
        (creation.actionTime ? defaultActionText : undefined);
      return renderItemContent(creation.item, creation.kind, 'created', {
        text,
        time: creation.actionTime,
      });
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

    const rawActionTime =
      actionInfo?.time ??
      (tabKey === 'activities'
        ? ((item as ProfileActivityItem)?.action_time ??
          (item as ProfileActivityItem)?.source?.action_time ??
          (item as ProfileActivityItem)?.created_time ??
          (item as ProfileActivityItem)?.source?.created_time ??
          (item as ProfileActivityItem)?.updated_time)
        : undefined) ??
      (typeof displayItem.created === 'number'
        ? displayItem.created
        : undefined) ??
      (typeof displayItem.created_time === 'number'
        ? displayItem.created_time
        : undefined) ??
      (typeof displayItem.updated_time === 'number'
        ? displayItem.updated_time
        : undefined);

    const actionTime =
      typeof rawActionTime === 'number' && Number.isFinite(rawActionTime)
        ? rawActionTime > 1e11
          ? Math.floor(rawActionTime / 1000)
          : rawActionTime
        : undefined;

    const defaultActivitiesActionText =
      tabKey === 'activities' && actionTime
        ? mappedType === 'answers'
          ? '回答了问题'
          : mappedType === 'articles'
            ? '发表了文章'
            : mappedType === 'pins'
              ? '发布了想法'
              : undefined
        : undefined;

    const itemActionText =
      actionInfo?.text ??
      (tabKey === 'activities'
        ? (item as ProfileActivityItem)?.action_text ||
          (item as ProfileActivityItem)?.source?.action_text ||
          (displayItem as { action_text?: string })?.action_text ||
          defaultActivitiesActionText
        : undefined);

    const actorName =
      (item as ProfileActivityItem)?.actor?.name ||
      (item as ProfileActivityItem)?.source?.actor?.name ||
      user?.name;

    const formattedActionText = formatFeedActionText(
      itemActionText,
      actorName,
      actionTime,
    );

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
      actionText: formattedActionText,
      created_time: actionTime,
      updated_time: actionTime,
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
      ...getContentCollectionMetadata(displayItem),
      voted:
        mappedType === 'videos'
          ? 0
          : (getContentVoteState(mappedType, displayItem) ?? 0),
      type: mappedType,
      videoSource: getZhihuVideoSource(rawType),
      // Every card on a member's page is theirs unless it names someone else.
      hideAuthor:
        tabKey !== 'votes' &&
        (!displayItem.author?.id || displayItem.author.id === user?.id),
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
            ? { scene: 'profile_answer', memberId: id, memberSort: answerSort }
            : getProfileAnswerReadingContext(
                displayItem.author ?? {},
                user ?? {},
                id,
                tabKey === 'answers' ? answerSort : 'created',
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
        options={{
          headerShown: false,
          title: user?.name || initialName || '个人主页',
        }}
      />
      {!user && !isUserLoading ? (
        <View style={{ paddingTop: navigationHeight }}>
          <QueryErrorView
            message="用户资料加载失败"
            onRetry={() => void refetchUser()}
          />
        </View>
      ) : (
        <Animated.View
          testID="profile-entry-content"
          pointerEvents="box-none"
          style={[StyleSheet.absoluteFill, profileEntryStyle]}
        >
          <NativeView style={StyleSheet.absoluteFill}>
            <AnimatedPagerView
              ref={pagerRef}
              style={{ flex: 1 }}
              initialPage={initialTabIndex}
              scrollEnabled
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
                      headerHeight={initialHeaderReady ? headerHeight : 0}
                      collapseDistance={collapseDistance}
                      viewportHeight={viewportHeight}
                      hideInitialLoadingIndicator={isUserLoading && !user}
                      bottomInset={insets.bottom}
                      offsets={scrollOffsets}
                      active={activeTab === tab.key}
                      keyExtractor={(item) => {
                        if (tab.key === 'creations') {
                          const creation = item as MemberCreation;
                          return `user-creation-${creation.kind}-${getProfileListItemKey(creation.item)}`;
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
                        ) : tab.key === 'creations' &&
                          !creationsQuery.isAuthenticated ? (
                          <View className="items-center py-20 bg-transparent">
                            <Text type="secondary">
                              登录后查看创作者的全部创作
                            </Text>
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
            {Platform.OS === 'android' ? (
              <NativeView
                key={user ? 'loaded' : 'loading'}
                testID="profile-initial-tabs-layout"
                pointerEvents={initialHeaderReady ? 'auto' : 'none'}
                accessibilityElementsHidden={!initialHeaderReady}
                importantForAccessibility={
                  initialHeaderReady ? 'auto' : 'no-hide-descendants'
                }
                style={{ opacity: initialHeaderReady ? 1 : 0 }}
                onLayout={(event) => {
                  if (!user || initialHeaderReady) return;
                  const { y, height } = event.nativeEvent.layout;
                  if (
                    Number.isFinite(y) &&
                    Number.isFinite(height) &&
                    height > 0
                  ) {
                    setHeaderHeight(y + height);
                    setInitialHeaderReady(true);
                  }
                }}
              >
                {renderTabsSelector()}
              </NativeView>
            ) : (
              renderTabsSelector()
            )}
          </Reanimated.View>
        </Animated.View>
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
        {headerUser ? (
          <Animated.View
            testID="profile-entry-toolbar-background"
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, profileEntryStyle]}
          >
            <ProfileToolbarBackground
              coverUrl={user?.cover_url}
              navigationHeight={navigationHeight}
              headerOffset={headerOffset}
            />
          </Animated.View>
        ) : null}
        <NativeView
          pointerEvents="box-none"
          testID="profile-toolbar-row"
          onLayout={(event) => {
            const height = event.nativeEvent.layout.height;
            if (Number.isFinite(height) && height > 0)
              setNavigationRowHeight(height);
          }}
          style={{
            minHeight: 56,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 12,
            paddingVertical: 6,
            gap: 10,
          }}
        >
          <GlassNavigationButton
            icon="back"
            accessibilityLabel="返回"
            onPress={() =>
              router.canGoBack() ? router.back() : router.replace('/(tabs)')
            }
            size={40}
            color={Colors[colorScheme].text}
            backgroundColor={`${Colors[colorScheme].backgroundSecondary}E8`}
          />
          <Reanimated.View
            pointerEvents="none"
            accessibilityElementsHidden={!compactHeader}
            style={[
              { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 9 },
              toolbarIdentityStyle,
            ]}
          >
            {headerUser?.avatar_url ? (
              <StableAvatar
                uri={headerUser.avatar_url}
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
                {headerUser?.name || initialName || '个人主页'}
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
          <GlassNavigationButton
            icon="search"
            accessibilityLabel="搜索此用户的创作"
            disabled={!user}
            onPress={() =>
              router.push({ pathname: '/user/[id]/search', params: { id } })
            }
            size={40}
            color={Colors[colorScheme].text}
            backgroundColor={`${Colors[colorScheme].backgroundSecondary}E8`}
          />
        </NativeView>
      </NativeView>
    </NativeView>
  );
}
