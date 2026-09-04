import { type QueryKey, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image } from 'react-native';
import {
  followMember,
  unfollowMember,
  type ZhihuMember,
  type ZhihuMemberListItem,
} from '@/api/zhihu';
import { BouncyButton } from '@/components/BouncyButton';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { useAuthStore } from '@/store/useAuthStore';
import type { ZhihuBadge } from '@/types/zhihu';
import { showToast } from '@/utils/toast';
import { Text, useThemeColor, View } from './Themed';

interface UserCardProps {
  user: ZhihuMemberListItem;
  invalidateQueryKeys?: readonly QueryKey[];
}

export const UserCard = ({ user, invalidateQueryKeys = [] }: UserCardProps) => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const cookies = useAuthStore((state) => state.cookies);
  const [isFollowing, setIsFollowing] = useState(Boolean(user.is_following));
  const [followerCount, setFollowerCount] = useState(user.follower_count || 0);
  const [loading, setLoading] = useState(false);
  const colorScheme = useColorScheme();

  const borderColor = Colors[colorScheme].border;
  const bgSecondary = Colors[colorScheme].backgroundSecondary;
  const tint = useThemeColor({}, 'primary');
  const textSecondaryColor = Colors[colorScheme].textSecondary;
  const bgColor = Colors[colorScheme].background;

  // biome-ignore lint/correctness/useExhaustiveDependencies: FlashList recycles the component; identity changes must reset derived state even when the visible counts happen to match.
  useEffect(() => {
    setIsFollowing(Boolean(user.is_following));
    setFollowerCount(user.follower_count || 0);
  }, [user.follower_count, user.id, user.is_following, user.url_token]);

  const handleFollow = async () => {
    if (loading) return;
    if (!cookies) {
      router.push('/login');
      return;
    }
    const targetId = user.url_token || user.id;
    setLoading(true);
    try {
      const nextIsFollowing = !isFollowing;
      let nextFollowerCount = followerCount;
      if (isFollowing) {
        const data = await unfollowMember(targetId);
        nextFollowerCount =
          data.follower_count ?? Math.max(0, followerCount - 1);
      } else {
        const data = await followMember(targetId);
        nextFollowerCount = data.follower_count ?? followerCount + 1;
      }
      setFollowerCount(nextFollowerCount);
      setIsFollowing(nextIsFollowing);

      const memberIdentifiers = Array.from(
        new Set([String(user.id), user.url_token].filter(Boolean)),
      );
      for (const identifier of memberIdentifiers) {
        queryClient.setQueryData<ZhihuMember>(
          ['user-detail', identifier],
          (currentMember) =>
            currentMember
              ? {
                  ...currentMember,
                  is_following: nextIsFollowing,
                  follower_count: nextFollowerCount,
                }
              : currentMember,
        );
      }
      await Promise.all(
        invalidateQueryKeys.map((queryKey) =>
          queryClient.invalidateQueries({ queryKey, exact: true }),
        ),
      );
    } catch {
      console.error('关注操作失败');
      showToast('操作失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <BouncyButton
      className="flex-row items-center p-4"
      style={{ borderBottomWidth: 0.5, borderBottomColor: borderColor }}
      onPress={() => router.push(`/user/${user.url_token || user.id}`)}
    >
      <Image
        source={{ uri: user.avatar_url }}
        className="w-12 h-11 rounded-full"
      />
      <View className="flex-1 ml-3 bg-transparent">
        <View className="flex-row items-center bg-transparent">
          <Text className="text-base font-semibold" numberOfLines={1}>
            {user.name}
          </Text>
          {user.badge?.find((b: ZhihuBadge) => b.type === 'best_answerer') && (
            <View
              className="ml-1.5 px-1 py-px rounded border-[0.5px]"
              style={{
                backgroundColor: Colors[colorScheme].badgeBackground,
                borderColor: Colors[colorScheme].badgeBorder,
              }}
            >
              <Text
                className="text-[10px] font-bold"
                style={{ color: Colors[colorScheme].badgeText }}
              >
                优秀回答者
              </Text>
            </View>
          )}
        </View>
        <Text type="secondary" className="text-[13px] mt-0.5" numberOfLines={1}>
          {user.headline || '这个用户很神秘喵'}
        </Text>
        <View className="flex-row mt-1 bg-transparent">
          <Text type="secondary" className="text-xs">
            {followerCount} 关注者
          </Text>
          <Text type="secondary" className="text-xs ml-3">
            {user.answer_count || 0} 回答
          </Text>
        </View>
      </View>
      <BouncyButton
        accessibilityRole="button"
        accessibilityState={{ busy: loading, selected: isFollowing }}
        disabled={loading}
        onPress={(event) => {
          event.stopPropagation();
          void handleFollow();
        }}
        className="px-4 py-1.5 rounded-2xl justify-center items-center"
        style={
          isFollowing
            ? { backgroundColor: bgSecondary, borderColor, borderWidth: 1 }
            : { backgroundColor: tint }
        }
      >
        {loading ? (
          <ActivityIndicator
            size="small"
            color={isFollowing ? textSecondaryColor : bgColor}
          />
        ) : (
          <Text
            className="text-[13px] font-bold"
            style={{
              color: isFollowing
                ? textSecondaryColor
                : Colors[colorScheme].textInverse,
            }}
          >
            {isFollowing ? '已关注' : '关注'}
          </Text>
        )}
      </BouncyButton>
    </BouncyButton>
  );
};
