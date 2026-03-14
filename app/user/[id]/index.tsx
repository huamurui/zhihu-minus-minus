import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
} from 'react-native';
import Reanimated from 'react-native-reanimated';
import {
  followMember,
  getMe,
  getMember,
  getMemberActivities,
  getMemberRelations,
  searchContent,
  unfollowMember,
} from '@/api/zhihu';
import { CreationCard } from '@/components/CreationCard';
import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';

export default function UserDetailScreen() {
  const colorScheme = useColorScheme();
  const { id, avatar: initialAvatar } = useLocalSearchParams();
  const router = useRouter();
  const navigation = useNavigation();
  const [activeTab, setActiveTab] = useState<
    'activities' | 'answers' | 'questions' | 'articles' | 'pins'
  >('activities');
  const [sortBy, setSortBy] = useState<'created' | 'voteups'>('created');
  const [followLoading, setFollowLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchQuery(searchQuery), 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    navigation.setOptions({ title: '个人主页' });
  }, [navigation]);

  const borderColor = Colors[colorScheme].border;
  const primaryColor = '#0084ff';

  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => getMe() });
  const isMe = me?.id === id;

  const { data: user, refetch: refetchUser } = useQuery({
    queryKey: ['user-detail', id],
    queryFn: async () => {
      try {
        return await getMember(id as string);
      } catch (err: any) {
        if (err.response?.status === 403)
          return await getMember(
            id as string,
            'follower_count,headline,cover_url,description,answer_count,articles_count',
          );
        return null;
      }
    },
  });

  const {
    data: listData,
    isLoading: listLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch: refetchList,
    isRefetching,
  } = useInfiniteQuery({
    queryKey: ['user-list', id, activeTab, sortBy],
    queryFn: async ({ pageParam = 0 }) => {
      try {
        const targetId = user?.url_token || id;
        if (activeTab === 'activities')
          return await getMemberActivities(targetId, 20, pageParam as number);

        let include = '';
        if (activeTab === 'answers')
          include =
            'data[*].content,voteup_count,comment_count,created_time,updated_time,excerpt,question.title,relationship.voting,relationship.is_thanked';
        else if (activeTab === 'questions')
          include =
            'data[*].created,answer_count,follower_count,author,admin_closed_comment,relationship.is_following';
        else if (activeTab === 'articles')
          include =
            'data[*].comment_count,content,voteup_count,created,updated,title,excerpt,relationship.voting';
        else if (activeTab === 'pins')
          include =
            'data[*].content,reaction_count,comment_count,created,relationship.voting';

        return await getMemberRelations(targetId, activeTab, {
          limit: 20,
          offset: pageParam as number,
          include,
          sort_by: activeTab === 'answers' ? sortBy : undefined,
        });
      } catch (err) {
        console.error(`获取${activeTab}列表失败:`, err);
        return { data: [], paging: { is_end: true } };
      }
    },
    initialPageParam: 0 as number | string,
    getNextPageParam: (lastPage) => {
      if (!lastPage || lastPage.paging?.is_end) return undefined;
      const match = lastPage.paging?.next?.match(/offset=(\d+)/);
      return match ? match[1] : undefined;
    },
  });

  const listItems = listData?.pages.flatMap((page) => page.data) || [];

  const {
    data: searchResults,
    fetchNextPage: fetchNextSearchPage,
    hasNextPage: hasNextSearchPage,
    isFetchingNextPage: isFetchingNextSearchPage,
    isLoading: searchLoading,
    refetch: refetchSearch,
  } = useInfiniteQuery({
    queryKey: ['user-creations-search', user?.id, debouncedSearchQuery],
    queryFn: ({ pageParam = 0 }) =>
      searchContent(debouncedSearchQuery, pageParam as number, 20, 'general', {
        restricted_scene: 'member',
        restricted_field: 'member_hash_id',
        restricted_value: user?.id,
      }),
    enabled: debouncedSearchQuery.length > 0 && !!user?.id,
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      if (lastPage.paging?.is_end) return undefined;
      const match = lastPage.paging?.next?.match(/offset=(\d+)/);
      return match ? parseInt(match[1]) : undefined;
    },
  });

  const isSearching = debouncedSearchQuery.length > 0;
  const currentListItems = isSearching
    ? searchResults?.pages.flatMap((page) => page.data || []) || []
    : listItems;

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
            <Text key={i} type="primary" className="font-bold">
              {part.replace(/\[\[\/?EM\]\]/g, '')}
            </Text>
          ) : (
            part
          ),
        )}
      </React.Fragment>
    );
  };

  const handleFollow = async () => {
    if (followLoading) return;
    setFollowLoading(true);
    try {
      const targetId = user?.url_token || id;
      if (user?.is_following) await unfollowMember(targetId);
      else await followMember(targetId);
      refetchUser();
    } catch (err) {
      console.error('关注操作失败:', err);
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
        className="h-[140px] w-full"
      />
      <View type="surface" className="px-5 pt-0 pb-5">
        <View className="flex-row justify-between items-end -mt-10">
          <Reanimated.Image
            source={{ uri: user?.avatar_url || (initialAvatar as string) }}
            className="w-20 h-20 rounded-[40px] border-4 border-white dark:border-[#1a1a1a]"
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
                  : { backgroundColor: Colors[colorScheme].primary },
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
                      : '#fff'
                  }
                />
              ) : (
                <Text
                  className="font-bold text-sm"
                  style={[
                    { color: '#fff' },
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
          {user?.headline}
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
              <Text className="font-bold">{user.mutual_followees_count}</Text>{' '}
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

        <View
          className="flex-row mt-5 pt-[15px] bg-transparent"
          style={{ borderTopWidth: 0.5, borderTopColor: borderColor }}
        >
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

      {/* 创作搜索栏 */}
      <View type="surface" className="px-[15px] pb-[15px] pt-1.5">
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
            className="flex-1 text-sm px-2.5 h-full"
            style={{ color: Colors[colorScheme].text }}
            placeholder={`搜索 ${user?.name || '用户'} 的创作...`}
            placeholderTextColor={Colors[colorScheme].textTertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
          />
          {isSearching && searchQuery.length > 0 && (
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

      <View
        type="surface"
        style={{
          borderTopWidth: 0.5,
          borderTopColor: borderColor,
          borderBottomWidth: 0.5,
          borderBottomColor: borderColor,
        }}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[isSearching && { opacity: 0.5 }]}
          className="flex-row"
        >
          {[
            { key: 'activities', label: '动态' },
            { key: 'answers', label: '回答', count: user?.answer_count },
            { key: 'questions', label: '提问', count: user?.question_count },
            { key: 'articles', label: '文章', count: user?.articles_count },
            { key: 'pins', label: '想法', count: user?.pins_count },
          ].map((tab) => (
            <Pressable
              key={tab.key}
              onPress={() => {
                if (!isSearching) setActiveTab(tab.key as any);
              }}
              className="px-5 py-[15px] items-center"
              style={[
                !isSearching &&
                  activeTab === tab.key && {
                    borderBottomWidth: 2,
                    borderBottomColor: primaryColor,
                  },
              ]}
            >
              <Text
                className="font-bold"
                style={[
                  !isSearching &&
                    activeTab === tab.key && { color: primaryColor },
                ]}
              >
                {tab.label}{' '}
                {tab.count !== undefined && tab.count > 0 ? tab.count : ''}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
        {isSearching && (
          <View
            className="px-5 py-2.5"
            style={{
              borderBottomWidth: StyleSheet.hairlineWidth,
              borderBottomColor: borderColor,
              backgroundColor: 'rgba(0,132,255,0.05)',
            }}
          >
            <Text
              className="text-[13px] font-bold"
              style={{ color: primaryColor }}
            >
              搜索结果
            </Text>
          </View>
        )}
        {!isSearching && activeTab === 'answers' && (
          <View
            className="flex-row px-[15px] py-2.5 bg-black/5 dark:bg-white/5"
            style={{
              borderBottomWidth: StyleSheet.hairlineWidth,
              borderBottomColor: borderColor,
            }}
          >
            {[
              { key: 'created', label: '最新' },
              { key: 'voteups', label: '赞同' },
            ].map((item) => (
              <Pressable
                key={item.key}
                onPress={() => setSortBy(item.key as any)}
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
        )}
      </View>
    </View>
  );

  const renderItem = ({ item }: { item: any }) => {
    if (isSearching) {
      const obj = item.object;
      const highlight = item.highlight || {};
      if (!obj) return null;
      let type: 'answer' | 'article' | 'question' | 'pin' | 'video' = 'answer';
      if (obj.type === 'article') type = 'article';
      else if (obj.type === 'question') type = 'question';
      else if (obj.type === 'pin') type = 'pin';
      else if (obj.type === 'zvideo') type = 'video';
      const displayItem = {
        ...obj,
        title: highlight.title
          ? highlight.title.replace(/<[^>]+>/g, '')
          : obj.title,
      };
      return (
        <CreationCard
          item={displayItem}
          type={type}
          excerpt={
            highlight.description
              ? (HighlightText(highlight.description) as any)
              : undefined
          }
        />
      );
    }

    let displayItem = item;
    if (activeTab === 'activities') displayItem = item.target || item;
    if (!displayItem || (!displayItem.id && !displayItem.url)) return null;

    let type: 'answer' | 'article' | 'question' | 'pin' | 'video' = 'answer';
    const itemType = displayItem.type;
    if (itemType === 'article') type = 'article';
    else if (itemType === 'question') type = 'question';
    else if (itemType === 'pin') type = 'pin';
    else if (itemType === 'zvideo' || itemType === 'video') type = 'video';

    return <CreationCard item={displayItem} type={type} />;
  };

  return (
    <View className="flex-1">
      <FlashList
        data={currentListItems}
        renderItem={renderItem}
        {...({ estimatedItemSize: 120 } as any)}
        keyExtractor={(item: any, index: number) =>
          `${activeTab}-${item.id || item.target?.id || index}-${index}`
        }
        onEndReached={() => {
          if (isSearching) {
            if (hasNextSearchPage && !isFetchingNextSearchPage)
              fetchNextSearchPage();
          } else {
            if (hasNextPage && !isFetchingNextPage) fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.5}
        ListHeaderComponent={renderHeader}
        ListFooterComponent={() =>
          isFetchingNextPage || isFetchingNextSearchPage ? (
            <ActivityIndicator
              style={{ margin: 20 }}
              color={Colors[colorScheme].primary}
            />
          ) : currentListItems.length > 0 &&
            !(isSearching ? hasNextSearchPage : hasNextPage) ? (
            <Text type="secondary" className="text-center p-5 text-xs">
              — 已经到底了喵 —
            </Text>
          ) : null
        }
        ListEmptyComponent={() => (
          <View className="p-[50px] items-center bg-transparent">
            {listLoading || searchLoading ? (
              <ActivityIndicator
                size="small"
                color={Colors[colorScheme].primary}
              />
            ) : (
              <Text type="secondary">
                {isSearching ? '没有找到匹配的创作' : '这里空空如也喵'}
              </Text>
            )}
          </View>
        )}
        onRefresh={isSearching ? refetchSearch : refetchList}
        refreshing={isSearching ? false : isRefetching}
      />
    </View>
  );
}
