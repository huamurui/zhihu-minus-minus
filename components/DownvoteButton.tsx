import { voteContent } from '@/api/zhihu/voters';
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { useThemeColor } from './Themed';

export const DownvoteButton = ({
    id,
    voted: initialVoted = 0,
    type = 'answers',
    variant = 'default'
}: {
    id: string | number;
    voted?: number;
    type?: 'answers' | 'articles' | 'questions' | 'pins' | 'comments';
    variant?: 'default' | 'minimal';
}) => {
    const [voted, setVoted] = useState(initialVoted);
    const [loading, setLoading] = useState(false);
    const scale = useSharedValue(1);

    // 同步外部传入的初始值
    React.useEffect(() => {
        setVoted(initialVoted);
    }, [initialVoted]);

    const tintColor = useThemeColor({}, 'tint');

    const isDownvoted = voted === -1;

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }]
    }));

    const handlePress = async () => {
        if (loading) return;

        // 动画效果
        scale.value = withSequence(
            withTiming(0.8, { duration: 100 }),
            withSpring(1)
        );

        const nextVoted = isDownvoted ? 0 : -1;

        setLoading(true);
        try {
            const voteType = nextVoted === -1 ? 'down' : 'neutral';
            await voteContent(id, type, voteType);
            setVoted(nextVoted);
        } catch (err) {
            console.error('投票失败:', err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Pressable
            onPress={handlePress}
            disabled={loading}
            style={[
                variant === 'default' ? styles.btn : styles.minimalBtn,
                variant === 'default' && { backgroundColor: isDownvoted ? tintColor : '#0084ff10' },
                loading && { opacity: 0.7 }
            ]}
        >
            {loading ? (
                <ActivityIndicator size="small" color={isDownvoted || variant === 'minimal' ? tintColor : (variant === 'default' ? "#fff" : tintColor)} />
            ) : (
                <Animated.View style={animatedStyle}>
                    <Ionicons
                        name={isDownvoted ? "caret-down" : "caret-down-outline"}
                        size={variant === 'minimal' ? 28 : 20}
                        color={variant === 'minimal' ? (isDownvoted ? tintColor : '#888') : (isDownvoted ? "#fff" : tintColor)}
                    />
                </Animated.View>
            )}
        </Pressable>
    );
};

const styles = StyleSheet.create({
    btn: {
        width: 36,
        height: 36,
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: 6
    },
    minimalBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'transparent',
        paddingHorizontal: 4
    }
});
