import { createAnswer, getQuestion } from '@/api/zhihu';
import { Text, View, useThemeColor } from '@/components/Themed';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function WriteAnswerScreen() {
    const { id } = useLocalSearchParams();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const queryClient = useQueryClient();
    const [content, setContent] = useState('');

    const textColor = useThemeColor({}, 'text');
    const borderColor = useThemeColor({}, 'border');
    const surfaceColor = useThemeColor({}, 'surface');

    // 1. 获取问题详情以显示标题
    const { data: question, isLoading: qLoading } = useQuery({
        queryKey: ['question', id],
        queryFn: () => getQuestion(id as string),
    });

    // 2. 提交回答的 Mutation
    const mutation = useMutation({
        mutationFn: (text: string) => createAnswer(id as string, text),
        onSuccess: () => {
            Alert.alert('发布成功', '你的回答已发布喵！');
            // 刷新详情页数据
            queryClient.invalidateQueries({ queryKey: ['question-answers', id] });
            router.back();
        },
        onError: (err: any) => {
            console.error(err.response?.data);
            Alert.alert('发布失败', err.response?.data?.error?.message || '未知错误');
        }
    });

    const handlePublish = () => {
        if (!content.trim()) {
            Alert.alert('提示', '请输入回答内容');
            return;
        }
        mutation.mutate(content.trim());
    };

    if (qLoading) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color="#0084ff" />
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <Stack.Screen
                options={{
                    headerTitle: '写回答',
                    headerRight: () => (
                        <Pressable
                            onPress={handlePublish}
                            disabled={mutation.isPending || !content.trim()}
                            style={{ opacity: !content.trim() ? 0.5 : 1 }}
                        >
                            {mutation.isPending ? (
                                <ActivityIndicator size="small" color="#0084ff" />
                            ) : (
                                <Text style={styles.publishText}>发布</Text>
                            )}
                        </Pressable>
                    )
                }}
            />

            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={{ flex: 1 }}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
            >
                <ScrollView contentContainerStyle={styles.scrollContent}>
                    <Text style={styles.qTitle}>{question?.title}</Text>

                    <TextInput
                        style={[styles.input, { color: textColor }]}
                        placeholder="知乎致力于建设友善的讨论氛围，建议在此写下你的真知灼见..."
                        placeholderTextColor="#999"
                        multiline
                        textAlignVertical="top"
                        value={content}
                        onChangeText={setContent}
                        autoFocus
                    />
                </ScrollView>
            </KeyboardAvoidingView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    publishText: { color: '#0084ff', fontSize: 16, fontWeight: 'bold', marginRight: 15 },
    scrollContent: { padding: 20 },
    qTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 20, lineHeight: 26 },
    input: {
        fontSize: 16,
        lineHeight: 24,
        minHeight: 300,
    }
});
