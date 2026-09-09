import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';
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
import { createPin } from '@/api/zhihu';
import type { UploadedImage } from '@/api/zhihu/image';
import { BouncyButton } from '@/components/BouncyButton';
import { Text, useThemeColor, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { PublishingMediaPicker, serializePinText } from '@/features/publishing';
import { getZhihuErrorMessage } from '@/utils/zhihuError';

export default function PublishPinScreen() {
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
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [mediaBusy, setMediaBusy] = useState(false);

  const mutation = useMutation({
    mutationFn: () =>
      createPin(serializePinText(content), {
        title,
        images,
      }),
    onSuccess: () => {
      Alert.alert('发布成功', '您的想法已发布！');
      queryClient.invalidateQueries({ queryKey: ['feeds'] });
      router.back();
    },
    onError: (error: unknown) =>
      Alert.alert('发布失败', getZhihuErrorMessage(error)),
  });

  const handlePublish = () => {
    if (!content.trim() && images.length === 0) {
      Alert.alert('提示', '请输入想法内容或添加图片');
      return;
    }
    if (mediaBusy) {
      Alert.alert('图片尚未准备好', '请等待上传完成，或重试、移除失败的图片。');
      return;
    }
    mutation.mutate();
  };

  const isPublishEnabled =
    (content.trim().length > 0 || images.length > 0) &&
    !mediaBusy &&
    !mutation.isPending;

  return (
    <View className="flex-1">
      <Stack.Screen options={{ headerShown: false, title: '发想法' }} />
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
        <Text className="text-lg font-bold">发想法</Text>
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
        <ScrollView
          className="flex-1 px-5 pt-4"
          keyboardShouldPersistTaps="handled"
        >
          <TextInput
            value={title}
            onChangeText={setTitle}
            editable={!mutation.isPending}
            placeholder="标题（可选）"
            placeholderTextColor={secondaryColor}
            maxLength={100}
            style={{
              color: textColor,
              borderBottomColor: borderCol,
              borderBottomWidth: 1,
              fontSize: 19,
              fontWeight: '600',
              paddingBottom: 12,
              paddingHorizontal: 0,
            }}
          />
          <TextInput
            autoFocus
            value={content}
            onChangeText={setContent}
            editable={!mutation.isPending}
            multiline
            placeholder="这一刻的想法..."
            placeholderTextColor={secondaryColor}
            textAlignVertical="top"
            style={{
              color: textColor,
              fontSize: 17,
              lineHeight: 27,
              minHeight: 230,
              paddingHorizontal: 0,
              paddingTop: 16,
            }}
          />
          <PublishingMediaPicker
            disabled={mutation.isPending}
            onBusyChange={setMediaBusy}
            onImagesChange={setImages}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
