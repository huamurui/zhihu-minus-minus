import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Image, Pressable, ScrollView } from 'react-native';
import {
  fetchRecentMoments,
  markRecentMomentsRead,
  type RecentMomentItem,
  type RecentMomentsResponse,
} from '@/api/zhihu';
import { Text, useThemeColor, View } from './Themed';
import { useColorScheme } from './useColorScheme';

/**
 * 最近更新的用户头像栏 (朋友圈/动态更新提示)
 */
export function RecentMoments() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const _colorScheme = useColorScheme();
  const primaryColor = useThemeColor({}, 'primary');
  const dangerColor = useThemeColor({}, 'danger');

  const { data } = useQuery({
    queryKey: ['recent-moments'],
    queryFn: fetchRecentMoments,
    // 每 5 分钟自动刷新一次
    refetchInterval: 1000 * 60 * 5,
    // 页面聚焦时刷新
    refetchOnWindowFocus: true,
  });

  // 如果没有数据或数据为空，则不渲染
  if (!data?.data || data.data.length === 0) {
    return null;
  }

  const markReadOnPress = (item: RecentMomentItem) => {
    const readToken = item.brief || item.id;
    if (item.unread_count <= 0 || !readToken) return;

    queryClient.setQueryData<RecentMomentsResponse>(
      ['recent-moments'],
      (current) =>
        current
          ? {
              ...current,
              data: current.data.map((currentItem) =>
                currentItem.actor.id === item.actor.id
                  ? { ...currentItem, unread_count: 0 }
                  : currentItem,
              ),
            }
          : current,
    );

    const restoreUnreadCount = () => {
      queryClient.setQueryData<RecentMomentsResponse>(
        ['recent-moments'],
        (current) =>
          current
            ? {
                ...current,
                data: current.data.map((currentItem) =>
                  currentItem.actor.id === item.actor.id
                    ? { ...currentItem, unread_count: item.unread_count }
                    : currentItem,
                ),
              }
            : current,
      );
    };

    void markRecentMomentsRead(readToken)
      .then((result) => {
        if (!result.success) restoreUnreadCount();
      })
      .catch(() => {
        restoreUnreadCount();
        console.warn('标记最近动态已读失败');
      });
  };

  return (
    <View className="bg-transparent border-b-[0.5px] border-black/5 dark:border-white/5">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="px-4 py-4"
      >
        {data.data.map((item) => (
          <Pressable
            key={item.actor.id}
            onPress={() => {
              markReadOnPress(item);
              router.push({
                pathname: '/user/[id]/stream',
                params: {
                  id: item.actor.url_token || item.actor.id,
                  unreadCount: String(item.unread_count),
                },
              });
            }}
            className="items-center mr-4 w-[64px]"
          >
            <View className="relative mb-1.5 bg-transparent">
              {/* 头像外圈，增加一点仪式感 */}
              <View
                className="p-[2px] rounded-full border-[1.5px]"
                style={{
                  borderColor:
                    item.unread_count > 0 ? primaryColor : 'transparent',
                }}
              >
                <Image
                  source={{ uri: item.actor.avatar_url }}
                  className="w-[52px] h-[52px] rounded-full bg-black/5 dark:bg-white/5"
                />
              </View>

              {/* 未读数字角标 */}
              {item.unread_count > 0 && (
                <View
                  className="absolute -right-1 -top-1 bg-danger rounded-full min-w-[20px] h-[20px] justify-center items-center px-1 border-2 border-white dark:border-[#1a1a1a]"
                  style={{ backgroundColor: dangerColor }}
                >
                  <Text
                    className="text-white font-bold text-center"
                    style={{
                      fontSize: 10,
                      lineHeight: 12,
                    }}
                  >
                    {item.unread_count > 99 ? '99+' : item.unread_count}
                  </Text>
                </View>
              )}
            </View>

            <Text
              numberOfLines={1}
              className="text-[10px] text-center w-full"
              type={item.unread_count > 0 ? 'default' : 'secondary'}
            >
              {item.actor.name}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
