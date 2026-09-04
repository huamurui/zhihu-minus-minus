import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
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
import { createArticle } from '@/api/zhihu';
import { BouncyButton } from '@/components/BouncyButton';
import { Text, useThemeColor, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';

export default function PublishArticleScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const queryClient = useQueryClient();
  const tintColor = useThemeColor({}, 'primary');
  const textColor = Colors[colorScheme].text;
  const secondaryColor = Colors[colorScheme].textSecondary;
  const borderCol = Colors[colorScheme].border;

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  const mutation = useMutation({
    mutationFn: () => createArticle(title.trim(), content.trim()),
    onSuccess: () => {
      Alert.alert('发布成功', '您的文章已发布！');
      queryClient.invalidateQueries({ queryKey: ['feeds'] });
      router.back();
    },
    onError: (err: any) => {
      console.error(err);
      Alert.alert('发布失败', err.response?.data?.error?.message || '未知错误');
    },
  });

  const handlePublish = () => {
    if (!title.trim()) {
      Alert.alert('提示', '请输入文章标题');
      return;
    }
    if (!content.trim()) {
      Alert.alert('提示', '请输入文章内容');
      return;
    }
    mutation.mutate();
  };

  const isPublishEnabled =
    title.trim().length > 0 && content.trim().length > 0 && !mutation.isPending;

  return (
    <View className="flex-1">
      <View
        className="flex-row items-center justify-between px-4 pb-3"
        style={{ paddingTop: insets.top + 10 }}
      >
        <Pressable onPress={() => router.back()} className="p-1">
          <Ionicons name="close" size={28} color={textColor} />
        </Pressable>
        <Text className="text-lg font-bold">写文章(WIP)</Text>
        <BouncyButton
          disabled={!isPublishEnabled}
          onPress={handlePublish}
          className="px-5 py-2 rounded-full min-w-[80px] items-center justify-center"
          style={{ backgroundColor: isPublishEnabled ? tintColor : borderCol }}
        >
          {mutation.isPending ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <Text
              className="text-sm font-bold"
              style={{ color: isPublishEnabled ? 'white' : secondaryColor }}
            >
              发布
            </Text>
          )}
        </BouncyButton>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView className="flex-1 px-5" keyboardShouldPersistTaps="handled">
          <TextInput
            className="text-2xl font-bold py-6 border-b"
            style={{ color: textColor, borderBottomColor: borderCol }}
            placeholder="请输入标题"
            placeholderTextColor={secondaryColor}
            multiline
            value={title}
            onChangeText={setTitle}
            autoFocus
          />
          <TextInput
            className="text-lg py-4 min-h-[400px]"
            style={{ color: textColor, textAlignVertical: 'top' }}
            placeholder="正文内容"
            placeholderTextColor={secondaryColor}
            multiline
            value={content}
            onChangeText={setContent}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
