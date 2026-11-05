import Ionicons from '@expo/vector-icons/Ionicons';
import { FlashList } from '@shopify/flash-list';
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import {
  type Href,
  useFocusEffect,
  useNavigation,
  useRouter,
} from 'expo-router';
import type { ComponentProps } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet } from 'react-native';
import { getNotifications, markAllNotificationsRead } from '@/api/zhihu';
import { BouncyButton } from '@/components/BouncyButton';
import { QueryErrorView } from '@/components/QueryErrorView';
import { StableAvatar } from '@/components/StableAvatar';
import { Text, useThemeColor, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { useRefreshAction } from '@/hooks/useRefreshAction';
import type {
  ZhihuNotificationContent,
  ZhihuNotificationItem,
} from '@/types/zhihu';
import { formatCompactTime } from '@/utils/date';
import { getNotificationBody, getNotificationPath } from '@/utils/notification';
import { refreshInfiniteQuery } from '@/utils/query';

type NotificationIconName = ComponentProps<typeof Ionicons>['name'];

function getNotificationContent(
  content: ZhihuNotificationItem['content'],
): ZhihuNotificationContent | undefined {
  return content && typeof content === 'object' ? content : undefined;
}

const NOTIFICATION_TYPES = [
  { label: '全部', value: 'all' },
  { label: '赞同', value: 'like' },
  { label: '评论', value: 'comment' },
  { label: '关注', value: 'follow' },
  { label: '邀请', value: 'invite' },
];

export default function NotificationScreen() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const primaryColor = useThemeColor({}, 'primary');
  const isDark = colorScheme === 'dark';
  const borderColor = Colors[colorScheme].border;
  const [selectedType, setSelectedType] = useState('all');

  useEffect(() => {
    navigation.setOptions({ title: '消息通知' });
  }, [navigation]);

  const markReadMutation = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['me'] });
    },
  });

  useFocusEffect(
    useCallback(() => {
      markReadMutation.mutate();
    }, [markReadMutation.mutate]),
  );

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetching,
    isFetchNextPageError,
    refetch,
    isError,
  } = useInfiniteQuery({
    queryKey: ['notifications', selectedType],
    queryFn: ({ pageParam = '', signal }) =>
      getNotifications(pageParam as string, selectedType, { signal }),
    initialPageParam: '',
    getNextPageParam: (lastPage) => {
      if (!lastPage || lastPage.paging?.is_end) return undefined;
      return lastPage.paging?.next;
    },
  });

  const { refresh: handleRefresh, refreshing } = useRefreshAction(() => {
    return refreshInfiniteQuery(
      queryClient,
      ['notifications', selectedType],
      refetch,
    );
  });

  const notifications = data?.pages.flatMap((page) => page.data) || [];

  const getIconConfig = (item: ZhihuNotificationItem) => {
    const type = item.type;
    const verb = getNotificationContent(item.content)?.verb || '';
    if (
      verb.includes('赞同') ||
      verb.includes('喜欢') ||
      type === 'MOMENT_VOTE_UP_ANSWER' ||
      type === 'VOTE_UP_ANSWER'
    ) {
      const dangerColor = Colors[colorScheme].danger;
      return {
        name: 'heart' as NotificationIconName,
        color: dangerColor,
        bg: isDark ? 'rgba(255, 77, 79, 0.15)' : 'rgba(255, 77, 79, 0.1)',
      };
    }
    if (
      verb.includes('评论') ||
      verb.includes('回复') ||
      type.includes('COMMENT')
    ) {
      return {
        name: 'chatbubble-ellipses' as NotificationIconName,
        color: primaryColor,
        bg: `${primaryColor}1a`,
      };
    }
    if (verb.includes('关注') || type === 'FOLLOW_USER') {
      const successColor = Colors[colorScheme].success;
      return {
        name: 'person-add' as NotificationIconName,
        color: successColor,
        bg: isDark ? 'rgba(46, 204, 113, 0.15)' : 'rgba(46, 204, 113, 0.1)',
      };
    }
    if (verb.includes('邀请') || type.includes('INVITE')) {
      const warningColor = Colors[colorScheme].warning;
      return {
        name: 'mail-open' as NotificationIconName,
        color: warningColor,
        bg: isDark ? 'rgba(255, 152, 0, 0.15)' : 'rgba(255, 152, 0, 0.1)',
      };
    }
    return {
      name: 'notifications' as NotificationIconName,
      color: Colors[colorScheme].textSecondary,
      bg: Colors[colorScheme].backgroundTertiary,
    };
  };

  const renderItem = ({ item }: { item: ZhihuNotificationItem }) => {
    const content = getNotificationContent(item.content);
    const actor = content?.actors?.[0] || item.actors?.[0] || {};
    const time = formatCompactTime(item.create_time);
    const body = getNotificationBody(item);
    // The body falls back to the target text; don't quote it twice.
    const quote =
      content?.target?.text && content.target.text !== body
        ? content.target.text
        : null;
    const iconConfig = getIconConfig(item);

    return (
      <BouncyButton
        className="flex-row p-[15px]"
        style={{
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: borderColor,
        }}
        onPress={() => {
          const path = getNotificationPath(item);
          if (path) router.push(path as Href);
        }}
      >
        <View
          className="w-[52px] h-[52px] rounded-full justify-center items-center"
          style={{ backgroundColor: iconConfig.bg }}
        >
          <Ionicons name={iconConfig.name} size={28} color={iconConfig.color} />
        </View>

        <View className="ml-[15px] flex-1 bg-transparent">
          <View className="flex-row items-center justify-between mb-1.5 bg-transparent">
            <View className="flex-row items-center bg-transparent flex-1 mr-2">
              {actor.avatar_url && (
                <StableAvatar
                  uri={actor.avatar_url}
                  className="w-5 h-5 rounded-full mr-1.5"
                />
              )}
              <Text className="font-bold text-sm flex-1" numberOfLines={1}>
                {actor.name || '系统通知'}
              </Text>
            </View>
            <Text type="secondary" className="text-[11px]">
              {time}
            </Text>
          </View>
          <Text className="text-sm leading-5" numberOfLines={3}>
            {content?.verb ? (
              <Text style={{ color: iconConfig.color, fontWeight: 'bold' }}>
                {content.verb}{' '}
              </Text>
            ) : null}
            {body}
          </Text>
          {quote && (
            <View
              className="mt-2 p-2 rounded"
              style={{ backgroundColor: `${borderColor}20` }}
            >
              <Text numberOfLines={1} type="secondary" className="text-xs">
                {quote}
              </Text>
            </View>
          )}
        </View>
      </BouncyButton>
    );
  };

  return (
    <View className="flex-1">
      <View
        className="h-[50px]"
        style={{
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: borderColor,
        }}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: 10,
            alignItems: 'center',
          }}
        >
          {NOTIFICATION_TYPES.map((type) => (
            <BouncyButton
              key={type.value}
              onPress={() => setSelectedType(type.value)}
              className="px-4 py-1.5 mx-1 rounded-full"
              style={
                selectedType === type.value
                  ? { backgroundColor: `${primaryColor}15` }
                  : undefined
              }
            >
              <Text
                className="text-sm"
                style={
                  selectedType === type.value
                    ? { color: primaryColor, fontWeight: 'bold' }
                    : undefined
                }
              >
                {type.label}
              </Text>
            </BouncyButton>
          ))}
        </ScrollView>
      </View>

      <FlashList
        data={notifications}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        onEndReached={() => {
          if (
            hasNextPage &&
            !isFetching &&
            !refreshing &&
            !isFetchNextPageError
          )
            void fetchNextPage();
        }}
        onRefresh={handleRefresh}
        refreshing={refreshing}
        contentContainerStyle={{ paddingBottom: 20 }}
        ListEmptyComponent={() => (
          <View className="flex-1 px-6 py-20 items-center">
            {isLoading ? (
              <ActivityIndicator color={primaryColor} />
            ) : isError ? (
              <QueryErrorView
                compact
                message="通知加载失败"
                onRetry={() => void refetch()}
              />
            ) : (
              <Text type="secondary">暂无通知喵</Text>
            )}
          </View>
        )}
        ListFooterComponent={() =>
          isFetchingNextPage ? (
            <ActivityIndicator style={{ margin: 20 }} color={primaryColor} />
          ) : isFetchNextPageError ? (
            <QueryErrorView
              compact
              message="更多通知加载失败"
              onRetry={() => void fetchNextPage()}
            />
          ) : null
        }
      />
    </View>
  );
}
