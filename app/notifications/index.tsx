import { getNotifications, markAllNotificationsRead } from '@/api/zhihu';
import { Text, View } from '@/components/Themed';
import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { useFocusEffect, useNavigation, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';

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
  const primaryColor = '#0084ff';
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
    }, []),
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
      return { name: 'heart', color: '#f44336', bg: '#fef2f2' };
    }
    if (
      verb.includes('评论') ||
      verb.includes('回复') ||
      type.includes('COMMENT')
    ) {
      return { name: 'chatbubble-ellipses', color: '#0084ff', bg: '#eff6ff' };
    }
    if (verb.includes('关注') || type === 'FOLLOW_USER') {
      return { name: 'person-add', color: '#4caf50', bg: '#f0fdf4' };
    }
    if (verb.includes('邀请') || type.includes('INVITE')) {
      return { name: 'mail-open', color: '#ff9800', bg: '#fffbeb' };
    }
    return { name: 'notifications', color: '#888', bg: '#f9fafb' };
  };

  const renderItem = ({ item }: { item: any }) => {
    const actor = item.content?.actors?.[0] || item.actors?.[0] || {};
    const target = item.content?.target || item.target || {};
    const time = new Date(item.create_time * 1000).toLocaleString();
    const iconConfig = getIconConfig(item);

    return (
      <Pressable
        className="flex-row p-[15px]"
        style={({ pressed }) => [
          {
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: borderColor,
          },
          pressed && { opacity: 0.7 },
        ]}
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
              style={{ backgroundColor: borderColor + '20' }}
            >
              <Text numberOfLines={1} type="secondary" className="text-xs">
                {item.content.target.text}
              </Text>
            </View>
          )}
        </View>
      </Pressable>
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
            <Pressable
              key={type.value}
              onPress={() => setSelectedType(type.value)}
              className="px-4 py-1.5 mx-1 rounded-full"
              style={
                selectedType === type.value
                  ? { backgroundColor: primaryColor + '15' }
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
            </Pressable>
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
        onRefresh={refetch}
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
