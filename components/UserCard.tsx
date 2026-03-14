import { followMember, unfollowMember } from '@/api/zhihu';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Image, Pressable } from 'react-native';
import { Text, View } from './Themed';
import { useColorScheme } from '@/components/useColorScheme';

import Colors from '@/constants/Colors';
export const UserCard = ({ user }: { user: any }) => {
    const router = useRouter();
    const [isFollowing, setIsFollowing] = useState(user.is_following);
    const [followerCount, setFollowerCount] = useState(user.follower_count || 0);
    const [loading, setLoading] = useState(false);
    const colorScheme = useColorScheme();

    const borderColor = Colors[colorScheme].border;
    const bgSecondary = Colors[colorScheme].backgroundSecondary;
    const tint = Colors[colorScheme].tint;
    const textSecondaryColor = Colors[colorScheme].textSecondary;
    const bgColor = Colors[colorScheme].background;

    const handleFollow = async () => {
        if (loading) return;
        const targetId = user.url_token || user.id;
        setLoading(true);
        try {
            if (isFollowing) {
                const data = await unfollowMember(targetId);
                setIsFollowing(false);
                if (data.follower_count !== undefined) setFollowerCount(data.follower_count);
            } else {
                const data = await followMember(targetId);
                setIsFollowing(true);
                if (data.follower_count !== undefined) setFollowerCount(data.follower_count);
            }
        } catch (err) {
            console.error('关注操作失败:', err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Pressable
            className="flex-row items-center p-4"
            style={{ borderBottomWidth: 0.5, borderBottomColor: borderColor }}
            onPress={() => router.push(`/user/${user.url_token || user.id}`)}
        >
            <Image source={{ uri: user.avatar_url }} className="w-12 h-11 rounded-full" />
            <View className="flex-1 ml-3 bg-transparent">
                <View className="flex-row items-center bg-transparent">
                    <Text className="text-base font-semibold" numberOfLines={1}>{user.name}</Text>
                    {user.badge?.find((b: any) => b.type === 'best_answerer') && (
                        <View className="ml-1.5 px-1 py-px rounded bg-[#fffbe6] border-[0.5px] border-[#ffe58f]">
                            <Text className="text-[10px] font-bold text-[#d48806]">优秀回答者</Text>
                        </View>
                    )}
                </View>
                <Text type="secondary" className="text-[13px] mt-0.5" numberOfLines={1}>
                    {user.headline || '这个用户很神秘喵'}
                </Text>
                <View className="flex-row mt-1 bg-transparent">
                    <Text type="secondary" className="text-xs">{followerCount} 关注者</Text>
                    <Text type="secondary" className="text-xs ml-3">{user.answer_count || 0} 回答</Text>
                </View>
            </View>
            <Pressable
                onPress={handleFollow}
                className="px-4 py-1.5 rounded-2xl justify-center items-center"
                style={
                    isFollowing
                        ? { backgroundColor: bgSecondary, borderColor, borderWidth: 1 }
                        : { backgroundColor: tint }
                }
            >
                {loading ? (
                    <ActivityIndicator size="small" color={isFollowing ? textSecondaryColor : bgColor} />
                ) : (
                    <Text
                        className="text-[13px] font-bold"
                        style={{ color: isFollowing ? textSecondaryColor : '#ffffff' }}
                    >
                        {isFollowing ? '已关注' : '关注'}
                    </Text>
                )}
            </Pressable>
        </Pressable>
    );
};
