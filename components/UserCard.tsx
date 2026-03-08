import { followMember, unfollowMember } from '@/api/zhihu';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet } from 'react-native';
import { Text, View } from './Themed';

export const UserCard = ({ user }: { user: any }) => {
    const router = useRouter();
    const [isFollowing, setIsFollowing] = useState(user.is_following);
    const [followerCount, setFollowerCount] = useState(user.follower_count || 0);
    const [loading, setLoading] = useState(false);

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
            style={styles.container}
            onPress={() => router.push(`/user/${user.url_token || user.id}`)}
        >
            <Image source={{ uri: user.avatar_url }} style={styles.avatar} />
            <View style={styles.content}>
                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'transparent' }}>
                    <Text style={styles.name} numberOfLines={1}>{user.name}</Text>
                    {user.badge?.find((b: any) => b.type === 'best_answerer') && (
                        <View style={styles.badge}>
                            <Text style={styles.badgeText}>优秀回答者</Text>
                        </View>
                    )}
                </View>
                <Text type="secondary" style={styles.headline} numberOfLines={1}>
                    {user.headline || '这个用户很神秘喵'}
                </Text>
                <View style={{ flexDirection: 'row', marginTop: 4, backgroundColor: 'transparent' }}>
                    <Text type="secondary" style={styles.stats}>{followerCount} 关注者</Text>
                    <Text type="secondary" style={[styles.stats, { marginLeft: 12 }]}>{user.answer_count || 0} 回答</Text>
                </View>
            </View>
            <Pressable
                onPress={handleFollow}
                style={[
                    styles.followBtn,
                    isFollowing ? styles.followedBtn : styles.unfollowedBtn
                ]}
            >
                {loading ? (
                    <ActivityIndicator size="small" color={isFollowing ? "#888" : "#fff"} />
                ) : (
                    <Text style={[styles.followText, isFollowing && { color: '#888' }]}>
                        {isFollowing ? '已关注' : '+ 关注'}
                    </Text>
                )}
            </Pressable>
        </Pressable>
    );
};

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 15,
        borderBottomWidth: 0.5,
        borderBottomColor: 'rgba(0,0,0,0.05)',
    },
    avatar: {
        width: 44,
        height: 44,
        borderRadius: 22,
    },
    content: {
        flex: 1,
        marginLeft: 12,
        backgroundColor: 'transparent',
    },
    name: {
        fontSize: 16,
        fontWeight: '600',
    },
    headline: {
        fontSize: 13,
        marginTop: 2,
    },
    followBtn: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 15,
        minWidth: 70,
        alignItems: 'center',
    },
    unfollowedBtn: {
        backgroundColor: '#0084ff',
    },
    followedBtn: {
        backgroundColor: '#f6f6f6',
    },
    stats: {
        fontSize: 12,
    },
    badge: {
        backgroundColor: '#fffbe6',
        borderColor: '#ffe58f',
        borderWidth: 0.5,
        borderRadius: 4,
        paddingHorizontal: 4,
        paddingVertical: 1,
        marginLeft: 6,
    },
    badgeText: {
        fontSize: 10,
        color: '#d48806',
        fontWeight: 'bold',
    },
    followText: {
        fontSize: 13,
        fontWeight: 'bold',
        color: '#fff',
    }
});
