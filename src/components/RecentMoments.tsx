import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView } from 'react-native';
import { type Gesture, GestureDetector } from 'react-native-gesture-handler';
import { fetchRecentMoments } from '@/api/zhihu';
import { useNestedHorizontalGesture } from '@/hooks/useNestedHorizontalGesture';
import { normalizeRecentMoments } from '@/utils/recentMoments';
import { DiagnosticScope } from './DiagnosticScope';
import { StableAvatar } from './StableAvatar';
import { Text, useThemeColor, View } from './Themed';
import { UnreadBadge } from './UnreadBadge';

/**
 * 最近更新的用户头像栏 (朋友圈/动态更新提示)
 */
function RecentMomentsComponent({
  isActive = true,
  onInteractionChange,
  parentGesture,
}: {
  isActive?: boolean;
  onInteractionChange?: (interacting: boolean) => void;
  parentGesture?: ReturnType<typeof Gesture.Native>;
}) {
  const router = useRouter();
  const primaryColor = useThemeColor({}, 'primary');
  const surfaceColor = useThemeColor({}, 'backgroundSecondary');

  const { data } = useQuery({
    queryKey: ['recent-moments'],
    queryFn: fetchRecentMoments,
    // 每 5 分钟自动刷新一次
    refetchInterval: 1000 * 60 * 5,
    // 页面聚焦时刷新
    refetchOnWindowFocus: true,
  });

  // Validate each entry before configuring gestures or rendering native views.
  const items = normalizeRecentMoments(data?.data);
  const scrollGesture = useNestedHorizontalGesture(
    onInteractionChange,
    isActive && items.length > 0,
    parentGesture,
  );

  // 如果没有数据或数据为空，则不渲染
  if (items.length === 0) {
    return null;
  }

  return (
    <View className="bg-transparent">
      <GestureDetector gesture={scrollGesture}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="px-4 py-4 pt-2"
        >
          {items.map((item) => (
            <Pressable
              key={item.actor.id}
              onPress={() => {
                router.push({
                  pathname: '/user/[id]/stream',
                  params: {
                    id: item.actor.url_token || item.actor.id,
                    unreadCount: String(item.unread_count),
                    source: 'recent-moments',
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
                  <StableAvatar
                    uri={item.actor.avatar_url}
                    className="w-[52px] h-[52px] rounded-full bg-black/5 dark:bg-white/5"
                  />
                </View>

                <UnreadBadge
                  count={item.unread_count}
                  placement="corner"
                  borderColor={surfaceColor}
                  className="absolute -right-1 -top-1"
                />
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
      </GestureDetector>
    </View>
  );
}

function RecentMomentsWithDiagnostics(
  props: React.ComponentProps<typeof RecentMomentsComponent>,
) {
  return (
    <DiagnosticScope
      context={{ area: 'following.recent-moments', operation: 'render' }}
    >
      <RecentMomentsComponent {...props} />
    </DiagnosticScope>
  );
}

export const RecentMoments = React.memo(RecentMomentsWithDiagnostics);
RecentMoments.displayName = 'RecentMoments';
