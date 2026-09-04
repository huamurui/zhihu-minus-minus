import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Image, View as NativeView } from 'react-native';
import PagerView from 'react-native-pager-view';
import {
  getMemberFollowing,
  getMemberFollowingColumns,
  getMemberFollowingFavlists,
  getMemberFollowingQuestions,
  getMemberFollowingTopics,
  type ZhihuFollowingColumnItem,
  type ZhihuFollowingFavlistItem,
  type ZhihuFollowingQuestionItem,
  type ZhihuFollowingTopicContributionItem,
  type ZhihuMemberListItem,
} from '@/api/zhihu';
import { BouncyButton } from '@/components/BouncyButton';
import { QueryErrorView } from '@/components/QueryErrorView';
import { Text, useThemeColor, View } from '@/components/Themed';
import { UserCard } from '@/components/UserCard';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { refreshInfiniteQuery } from '@/utils/query';
import { getNextPageOffset } from '@/utils/userProfile';

const TABS = [
  { key: 'users', title: '关注的人' },
  { key: 'columns', title: '专栏' },
  { key: 'topics', title: '话题' },
  { key: 'questions', title: '问题' },
  { key: 'favlists', title: '收藏夹' },
] as const;

type FollowingTabKey = (typeof TABS)[number]['key'];
type FollowingListItem =
  | ZhihuMemberListItem
  | ZhihuFollowingColumnItem
  | ZhihuFollowingTopicContributionItem
  | ZhihuFollowingQuestionItem
  | ZhihuFollowingFavlistItem;

function getFollowingItemKey(item: FollowingListItem, tabKey: FollowingTabKey) {
  if (tabKey === 'topics') {
    return String((item as ZhihuFollowingTopicContributionItem).topic.id);
  }
  if (tabKey === 'users') {
    const member = item as ZhihuMemberListItem;
    return String(member.id || member.url_token);
  }
  return String(
    (
      item as
        | ZhihuFollowingColumnItem
        | ZhihuFollowingQuestionItem
        | ZhihuFollowingFavlistItem
    ).id,
  );
}

export default function FollowingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<FollowingTabKey>('users');
  const [_currentPage, setCurrentPage] = useState(0);
  const [visitedTabs, setVisitedTabs] = useState<Record<string, boolean>>({
    users: true,
  });
  const pagerRef = useRef<PagerView>(null);

  const colorScheme = useColorScheme();
  const borderColor = Colors[colorScheme].border;
  const tint = useThemeColor({}, 'primary');
  const textSecondaryColor = Colors[colorScheme].textSecondary;

  // 1. 关注的人 Query
  const usersQuery = useInfiniteQuery({
    queryKey: ['user-following-users', id],
    queryFn: ({ pageParam = 0 }) => getMemberFollowing(id, 20, pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      if (!lastPage || lastPage.paging?.is_end) return undefined;
      return getNextPageOffset(lastPage.paging?.next);
    },
    enabled: visitedTabs.users || activeTab === 'users',
  });

  // 2. 关注的专栏 Query
  const columnsQuery = useInfiniteQuery({
    queryKey: ['user-following-columns', id],
    queryFn: ({ pageParam = 0 }) =>
      getMemberFollowingColumns(id, pageParam, 20),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      if (!lastPage || lastPage.paging?.is_end) return undefined;
      return getNextPageOffset(lastPage.paging?.next);
    },
    enabled: visitedTabs.columns || activeTab === 'columns',
  });

  // 3. 关注的话题 Query
  const topicsQuery = useInfiniteQuery({
    queryKey: ['user-following-topics', id],
    queryFn: ({ pageParam = 0 }) => getMemberFollowingTopics(id, pageParam, 20),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      if (!lastPage || lastPage.paging?.is_end) return undefined;
      return getNextPageOffset(lastPage.paging?.next);
    },
    enabled: visitedTabs.topics || activeTab === 'topics',
  });

  // 4. 关注的问题 Query
  const questionsQuery = useInfiniteQuery({
    queryKey: ['user-following-questions', id],
    queryFn: ({ pageParam = 0 }) =>
      getMemberFollowingQuestions(id, pageParam, 20),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      if (!lastPage || lastPage.paging?.is_end) return undefined;
      return getNextPageOffset(lastPage.paging?.next);
    },
    enabled: visitedTabs.questions || activeTab === 'questions',
  });

  // 5. 关注的收藏夹 Query
  const favlistsQuery = useInfiniteQuery({
    queryKey: ['user-following-favlists', id],
    queryFn: ({ pageParam = 0 }) =>
      getMemberFollowingFavlists(id, pageParam, 20),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      if (!lastPage || lastPage.paging?.is_end) return undefined;
      return getNextPageOffset(lastPage.paging?.next);
    },
    enabled: visitedTabs.favlists || activeTab === 'favlists',
  });

  const getQueryState = (tabKey: FollowingTabKey) => {
    switch (tabKey) {
      case 'users':
        return {
          queryKey: ['user-following-users', id] as const,
          data: usersQuery.data?.pages.flatMap((page) => page.data) || [],
          isLoading: usersQuery.isLoading,
          isError: usersQuery.isError,
          isFetchingNextPage: usersQuery.isFetchingNextPage,
          hasNextPage: usersQuery.hasNextPage,
          fetchNextPage: usersQuery.fetchNextPage,
          refetch: usersQuery.refetch,
          isRefetching: usersQuery.isRefetching,
        };
      case 'columns':
        return {
          queryKey: ['user-following-columns', id] as const,
          data: columnsQuery.data?.pages.flatMap((page) => page.data) || [],
          isLoading: columnsQuery.isLoading,
          isError: columnsQuery.isError,
          isFetchingNextPage: columnsQuery.isFetchingNextPage,
          hasNextPage: columnsQuery.hasNextPage,
          fetchNextPage: columnsQuery.fetchNextPage,
          refetch: columnsQuery.refetch,
          isRefetching: columnsQuery.isRefetching,
        };
      case 'topics':
        return {
          queryKey: ['user-following-topics', id] as const,
          data: topicsQuery.data?.pages.flatMap((page) => page.data) || [],
          isLoading: topicsQuery.isLoading,
          isError: topicsQuery.isError,
          isFetchingNextPage: topicsQuery.isFetchingNextPage,
          hasNextPage: topicsQuery.hasNextPage,
          fetchNextPage: topicsQuery.fetchNextPage,
          refetch: topicsQuery.refetch,
          isRefetching: topicsQuery.isRefetching,
        };
      case 'questions':
        return {
          queryKey: ['user-following-questions', id] as const,
          data: questionsQuery.data?.pages.flatMap((page) => page.data) || [],
          isLoading: questionsQuery.isLoading,
          isError: questionsQuery.isError,
          isFetchingNextPage: questionsQuery.isFetchingNextPage,
          hasNextPage: questionsQuery.hasNextPage,
          fetchNextPage: questionsQuery.fetchNextPage,
          refetch: questionsQuery.refetch,
          isRefetching: questionsQuery.isRefetching,
        };
      case 'favlists':
        return {
          queryKey: ['user-following-favlists', id] as const,
          data: favlistsQuery.data?.pages.flatMap((page) => page.data) || [],
          isLoading: favlistsQuery.isLoading,
          isError: favlistsQuery.isError,
          isFetchingNextPage: favlistsQuery.isFetchingNextPage,
          hasNextPage: favlistsQuery.hasNextPage,
          fetchNextPage: favlistsQuery.fetchNextPage,
          refetch: favlistsQuery.refetch,
          isRefetching: favlistsQuery.isRefetching,
        };
      default:
        return {
          queryKey: ['user-following-unknown', id] as const,
          data: [],
          isLoading: false,
          isError: false,
          isFetchingNextPage: false,
          hasNextPage: false,
          fetchNextPage: () => {},
          refetch: async () => {},
          isRefetching: false,
        };
    }
  };

  const handleTabPress = (index: number) => {
    const tabKey = TABS[index].key;
    pagerRef.current?.setPage(index);
    setCurrentPage(index);
    setActiveTab(tabKey);
    setVisitedTabs((prev) => ({ ...prev, [tabKey]: true }));
  };

  const renderItem = ({
    item,
    tabKey,
  }: {
    item: FollowingListItem;
    tabKey: FollowingTabKey;
  }) => {
    if (tabKey === 'users') {
      const member = item as ZhihuMemberListItem;
      return (
        <UserCard
          user={member}
          invalidateQueryKeys={[['user-following-users', id]]}
        />
      );
    }
    if (tabKey === 'columns') {
      const column = item as ZhihuFollowingColumnItem;
      return (
        <BouncyButton
          className="flex-row items-center p-4"
          style={{ borderBottomWidth: 0.5, borderBottomColor: borderColor }}
          onPress={() => router.push(`/column/${column.id}`)}
        >
          <Image
            source={{ uri: column.image_url }}
            className="w-12 h-12 rounded-lg"
          />
          <View className="flex-1 ml-3 bg-transparent">
            <Text className="text-base font-semibold" numberOfLines={1}>
              {column.title}
            </Text>
            <Text
              type="secondary"
              className="text-[13px] mt-0.5"
              numberOfLines={1}
            >
              {column.intro || column.excerpt || '这个专栏没有简介喵'}
            </Text>
            <View className="flex-row mt-1 bg-transparent">
              <Text type="secondary" className="text-xs">
                {column.followers || 0} 关注者
              </Text>
              <Text type="secondary" className="text-xs ml-3">
                {column.articles_count || 0} 文章
              </Text>
            </View>
          </View>
        </BouncyButton>
      );
    }
    if (tabKey === 'topics') {
      const topic = (item as ZhihuFollowingTopicContributionItem).topic;
      if (!topic) return null;
      return (
        <BouncyButton
          className="flex-row items-center p-4"
          style={{ borderBottomWidth: 0.5, borderBottomColor: borderColor }}
          onPress={() => router.push(`/topic/${topic.id}`)}
        >
          <Image
            source={{ uri: topic.avatar_url }}
            className="w-12 h-12 rounded-lg"
          />
          <View className="flex-1 ml-3 bg-transparent">
            <Text className="text-base font-semibold" numberOfLines={1}>
              {topic.name}
            </Text>
            <Text
              type="secondary"
              className="text-[13px] mt-0.5"
              numberOfLines={1}
            >
              {topic.introduction || topic.excerpt || '这个话题没有简介喵'}
            </Text>
            <View className="flex-row mt-1 bg-transparent">
              <Text type="secondary" className="text-xs">
                {topic.followers_count || 0} 关注者
              </Text>
              <Text type="secondary" className="text-xs ml-3">
                {topic.questions_count || 0} 问题
              </Text>
            </View>
          </View>
        </BouncyButton>
      );
    }
    if (tabKey === 'questions') {
      const question = item as ZhihuFollowingQuestionItem;
      return (
        <BouncyButton
          className="p-4"
          style={{ borderBottomWidth: 0.5, borderBottomColor: borderColor }}
          onPress={() => router.push(`/question/${question.id}`)}
        >
          <Text className="text-base font-semibold" numberOfLines={2}>
            {question.title}
          </Text>
          <View className="flex-row mt-2 bg-transparent items-center">
            <Text type="secondary" className="text-xs">
              {question.answer_count || 0} 个回答
            </Text>
            <Text type="secondary" className="text-xs ml-3">
              {question.follower_count || 0} 人关注
            </Text>
            {question.author?.name && (
              <Text type="secondary" className="text-xs ml-auto">
                提问者: {question.author.name}
              </Text>
            )}
          </View>
        </BouncyButton>
      );
    }
    if (tabKey === 'favlists') {
      const favlist = item as ZhihuFollowingFavlistItem;
      return (
        <BouncyButton
          className="flex-row items-center p-4"
          style={{ borderBottomWidth: 0.5, borderBottomColor: borderColor }}
          onPress={() => router.push(`/collections/${favlist.id}`)}
        >
          <View
            className="w-12 h-12 rounded-lg justify-center items-center relative"
            style={{ backgroundColor: 'rgba(0,132,255,0.05)' }}
          >
            <Ionicons
              name={favlist.is_public ? 'folder' : 'folder-outline'}
              size={24}
              color={tint}
            />
          </View>
          <View className="flex-1 ml-3 bg-transparent">
            <Text className="text-base font-semibold" numberOfLines={1}>
              {favlist.title}
            </Text>
            <Text
              type="secondary"
              className="text-[13px] mt-0.5"
              numberOfLines={1}
            >
              {favlist.description ||
                `创建者: ${favlist.creator?.name || '匿名'}`}
            </Text>
            <View className="flex-row mt-1 bg-transparent">
              <Text type="secondary" className="text-xs">
                {favlist.answer_count || 0} 内容
              </Text>
              <Text type="secondary" className="text-xs ml-3">
                {favlist.follower_count || 0} 关注者
              </Text>
            </View>
          </View>
        </BouncyButton>
      );
    }
    return null;
  };

  return (
    <View className="flex-1">
      <Stack.Screen options={{ title: '关注' }} />

      {/* Tab bar */}
      <View
        className="flex-row h-11 border-b"
        style={{ borderBottomColor: borderColor }}
      >
        {TABS.map((tab, idx) => {
          const isActive = activeTab === tab.key;
          return (
            <BouncyButton
              key={tab.key}
              onPress={() => handleTabPress(idx)}
              className="flex-1 justify-center items-center h-full"
            >
              <Text
                className={`text-[13px] ${isActive ? 'font-bold' : ''}`}
                style={{ color: isActive ? tint : textSecondaryColor }}
              >
                {tab.title}
              </Text>
              {isActive && (
                <View
                  className="absolute bottom-0 w-8 h-[2px] rounded-full"
                  style={{ backgroundColor: tint }}
                />
              )}
            </BouncyButton>
          );
        })}
      </View>

      <PagerView
        ref={pagerRef}
        style={{ flex: 1 }}
        initialPage={0}
        onPageSelected={(e) => {
          const idx = e.nativeEvent.position;
          const tabKey = TABS[idx].key;
          setCurrentPage(idx);
          setActiveTab(tabKey);
          setVisitedTabs((prev) => ({ ...prev, [tabKey]: true }));
        }}
      >
        {TABS.map((tab) => {
          const query = getQueryState(tab.key);
          return (
            <NativeView key={tab.key} className="flex-1">
              <FlashList<FollowingListItem>
                data={query.data}
                keyExtractor={(item) => getFollowingItemKey(item, tab.key)}
                renderItem={({ item }) => renderItem({ item, tabKey: tab.key })}
                onEndReached={() => {
                  if (query.hasNextPage && !query.isFetchingNextPage) {
                    void query.fetchNextPage();
                  }
                }}
                onRefresh={() =>
                  void refreshInfiniteQuery(
                    queryClient,
                    query.queryKey,
                    query.refetch,
                  )
                }
                refreshing={query.isRefetching}
                ListEmptyComponent={() => (
                  <View className="p-[50px] items-center">
                    {query.isLoading ? (
                      <ActivityIndicator color={tint} />
                    ) : query.isError ? (
                      <QueryErrorView
                        compact
                        message={`${tab.title}加载失败`}
                        onRetry={() => void query.refetch()}
                      />
                    ) : (
                      <Text type="secondary">这里空空如也喵</Text>
                    )}
                  </View>
                )}
                ListFooterComponent={() =>
                  query.isFetchingNextPage ? (
                    <ActivityIndicator style={{ margin: 20 }} color={tint} />
                  ) : null
                }
              />
            </NativeView>
          );
        })}
      </PagerView>
    </View>
  );
}
