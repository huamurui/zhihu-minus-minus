import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { useFocusEffect, useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet } from 'react-native';
import { getNotifications, markAllNotificationsRead } from '@/api/zhihu';
import { BouncyButton } from '@/components/BouncyButton';
import { Text, useThemeColor, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { formatDateTime } from '@/utils/date';
import { refreshInfiniteQuery } from '@/utils/query';

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
    refetch,
    isRefetching,
  } = useInfiniteQuery({
    queryKey: ['notifications', selectedType],
    queryFn: ({ pageParam = '' }) =>
      getNotifications(pageParam as string, selectedType),
    initialPageParam: '',
    getNextPageParam: (lastPage) => {
      if (!lastPage || lastPage.paging?.is_end) return undefined;
      return lastPage.paging?.next;
    },
  });

  const handleRefresh = useCallback(() => {
    return refreshInfiniteQuery(
      queryClient,
      ['notifications', selectedType],
      refetch,
    );
  }, [queryClient, selectedType, refetch]);

  const notifications = data?.pages.flatMap((page) => page.data) || [];

  const getIconConfig = (item: any) => {
    const type = item.type;
    const verb = item.content?.verb || '';
    if (
      verb.includes('赞同') ||
      verb.includes('喜欢') ||
      type === 'MOMENT_VOTE_UP_ANSWER' ||
      type === 'VOTE_UP_ANSWER'
    ) {
      const dangerColor = Colors[colorScheme].danger;
      return {
        name: 'heart',
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
        name: 'chatbubble-ellipses',
        color: primaryColor,
        bg: `${primaryColor}1a`,
      };
    }
    if (verb.includes('关注') || type === 'FOLLOW_USER') {
      const successColor = Colors[colorScheme].success;
      return {
        name: 'person-add',
        color: successColor,
        bg: isDark ? 'rgba(46, 204, 113, 0.15)' : 'rgba(46, 204, 113, 0.1)',
      };
    }
    if (verb.includes('邀请') || type.includes('INVITE')) {
      const warningColor = Colors[colorScheme].warning;
      return {
        name: 'mail-open',
        color: warningColor,
        bg: isDark ? 'rgba(255, 152, 0, 0.15)' : 'rgba(255, 152, 0, 0.1)',
      };
    }
    return {
      name: 'notifications',
      color: Colors[colorScheme].textSecondary,
      bg: Colors[colorScheme].backgroundTertiary,
    };
  };

  const renderItem = ({ item }: { item: any }) => {
    const actor = item.content?.actors?.[0] || item.actors?.[0] || {};
    const target = item.content?.target || item.target || {};
    const time = formatDateTime(item.create_time);
    const iconConfig = getIconConfig(item);

    return (
      <BouncyButton
        className="flex-row p-[15px]"
        style={{
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: borderColor,
        }}
        onPress={() => {
          const link = item.content?.target?.link;
          if (link) {
            if (link.includes('/answer/')) {
              const id = link.split('/answer/')[1];
              router.push(`/answer/${id}`);
              return;
            }
            if (link.includes('/question/')) {
              const id = link.split('/question/')[1];
              router.push(`/question/${id}`);
              return;
            }
          }
          if (target.type === 'answer' || item.type === 'answer') {
            router.push(`/answer/${target.id || item.id}`);
          } else if (target.type === 'article') {
            router.push(`/article/${target.id}`);
          } else if (target.type === 'member') {
            router.push(`/user/${target.id}`);
          }
        }}
      >
        <View
          className="w-[52px] h-[52px] rounded-full justify-center items-center"
          style={{ backgroundColor: iconConfig.bg }}
        >
          <Ionicons
            name={iconConfig.name as any}
            size={28}
            color={iconConfig.color}
          />
        </View>

        <View className="ml-[15px] flex-1 bg-transparent">
          <View className="flex-row items-center justify-between mb-1.5 bg-transparent">
            <View className="flex-row items-center bg-transparent">
              {actor.avatar_url && (
                <Image
                  source={{ uri: actor.avatar_url }}
                  className="w-5 h-5 rounded-full mr-1.5"
                />
              )}
              <Text className="font-bold text-sm">
                {actor.name || '系统通知'}
              </Text>
            </View>
            <Text type="secondary" className="text-[11px]">
              {time}
            </Text>
          </View>
          <Text className="text-sm leading-5" numberOfLines={3}>
            {item.content?.verb ? (
              <Text style={{ color: iconConfig.color, fontWeight: 'bold' }}>
                {item.content.verb}{' '}
              </Text>
            ) : null}
            {item.content?.text ||
              item.content?.title ||
              item.content?.sub_text ||
              (typeof item.content === 'string' ? item.content : '新的动态')}
          </Text>
          {item.content?.target?.text && (
            <View
              className="mt-2 p-2 rounded"
              style={{ backgroundColor: `${borderColor}20` }}
            >
              <Text numberOfLines={1} type="secondary" className="text-xs">
                {item.content.target.text}
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
        renderItem={renderItem}
        {...({ estimatedItemSize: 120 } as any)}
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) fetchNextPage();
        }}
        onRefresh={handleRefresh}
        refreshing={isRefetching}
        contentContainerStyle={{ paddingBottom: 20 }}
        ListEmptyComponent={() => (
          <View className="flex-1 p-[100px] items-center">
            {isLoading ? (
              <ActivityIndicator color={primaryColor} />
            ) : (
              <Text type="secondary">暂无通知喵</Text>
            )}
          </View>
        )}
        ListFooterComponent={() =>
          isFetchingNextPage ? (
            <ActivityIndicator style={{ margin: 20 }} color={primaryColor} />
          ) : null
        }
      />
    </View>
  );
}
