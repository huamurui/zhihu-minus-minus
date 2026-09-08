import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createQuestion } from '@/api/zhihu';
import type { UploadedImage } from '@/api/zhihu/image';
import { BouncyButton } from '@/components/BouncyButton';
import { Text, useThemeColor, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import {
  PublishingEditor,
  serializePublishingMarkdown,
} from '@/features/publishing';
import { getZhihuErrorMessage } from '@/utils/zhihuError';

export default function PublishQuestionScreen() {
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
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const [editorBusy, setEditorBusy] = useState(false);

  const mutation = useMutation({
    mutationFn: () =>
      createQuestion(
        title.trim(),
        serializePublishingMarkdown(content, uploadedImages),
      ),
    onSuccess: () => {
      Alert.alert('发布成功', '您的问题已发布！');
      queryClient.invalidateQueries({ queryKey: ['feeds'] });
      router.back();
    },
    onError: (error: unknown) =>
      Alert.alert('发布失败', getZhihuErrorMessage(error)),
  });

  const handlePublish = () => {
    if (!title.trim()) {
      Alert.alert('提示', '请输入问题标题');
      return;
    }
    if (editorBusy) {
      Alert.alert('图片上传中', '请等待图片上传完成后再发布。');
      return;
    }
    mutation.mutate();
  };

  const isPublishEnabled =
    title.trim().length > 5 && !editorBusy && !mutation.isPending;

  return (
    <View className="flex-1">
      <View
        className="flex-row items-center justify-between px-4 pb-3"
        style={{ paddingTop: insets.top + 10 }}
      >
        <BouncyButton
          onPress={() => router.back()}
          className="p-2 rounded-full"
        >
          <Ionicons name="close" size={28} color={textColor} />
        </BouncyButton>
        <Text className="text-lg font-bold">提问题</Text>
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
            className="text-xl font-bold py-4 border-b"
            style={{ color: textColor, borderBottomColor: borderCol }}
            placeholder="输入问题并以问号结尾"
            placeholderTextColor={secondaryColor}
            multiline
            value={title}
            onChangeText={setTitle}
            autoFocus
          />
          <PublishingEditor
            contentType="question"
            disabled={mutation.isPending}
            minHeight={300}
            onBusyChange={setEditorBusy}
            onChangeText={setContent}
            onImagesChange={setUploadedImages}
            placeholder="补充问题背景和细节（可选）"
            value={content}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
