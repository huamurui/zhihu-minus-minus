import { createAnswer, getQuestion } from '@/api/zhihu';
import { Text, View } from '@/components/Themed';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';

export default function WriteAnswerScreen() {
  const colorScheme = useColorScheme();
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [content, setContent] = useState('');

  const textColor = Colors[colorScheme].text;

  const { data: question, isLoading: qLoading } = useQuery({
    queryKey: ['question', id],
    queryFn: () => getQuestion(id as string),
  });

  const mutation = useMutation({
    mutationFn: (text: string) => createAnswer(id as string, text),
    onSuccess: () => {
      Alert.alert('发布成功', '你的回答已发布喵！');
      queryClient.invalidateQueries({ queryKey: ['question-answers', id] });
      router.back();
    },
    onError: (err: any) => {
      console.error(err.response?.data);
      Alert.alert('发布失败', err.response?.data?.error?.message || '未知错误');
    },
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
      <View className="flex-1 justify-center items-center">
        <ActivityIndicator size="large" color="#0084ff" />
      </View>
    );
  }

  return (
    <View className="flex-1">
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
                <Text className="text-[#0084ff] text-base font-bold mr-[15px]">
                  发布
                </Text>
              )}
            </Pressable>
          ),
        }}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
      >
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          <Text className="text-lg font-bold mb-5 leading-[26px]">
            {question?.title}
          </Text>
          <TextInput
            className="text-base leading-6 min-h-[300px]"
            style={{ color: textColor }}
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
