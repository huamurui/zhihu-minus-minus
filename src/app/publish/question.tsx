import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
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
import { BouncyButton } from '@/components/BouncyButton';
import { GlassNavigationButton } from '@/components/navigation/GlassNavigationButton';
import {
  Text,
  useRuntimeThemeColors,
  useThemeColor,
  View,
} from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import {
  PublishingDraftNotice,
  PublishingEditor,
  serializePublishingMarkdown,
  usePublishingDraft,
} from '@/features/publishing';
import type { PublishingMediaItem } from '@/features/publishing/types';
import { getAuthSessionVersion } from '@/store/useAuthStore';
import { getZhihuErrorMessage } from '@/utils/zhihuError';

export default function PublishQuestionScreen() {
  const { onPrimary } = useRuntimeThemeColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const queryClient = useQueryClient();
  const tintColor = useThemeColor({}, 'primary');
  const textColor = Colors[colorScheme].text;
  const secondaryColor = Colors[colorScheme].textSecondary;
  const borderCol = Colors[colorScheme].border;

  const [editorBusy, setEditorBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const draft = usePublishingDraft(
    'question',
    'new',
    undefined,
    true,
    editorBusy,
    submitting,
  );
  const { update } = draft;
  const { title, content, images } = draft.value;
  const uploadedImages = images;
  const setTitle = useCallback(
    (value: string) => update({ title: value }),
    [update],
  );
  const setContent = useCallback(
    (value: string) => update({ content: value }),
    [update],
  );
  const setUploadedImages = useCallback(
    (value: typeof images) => update({ images: value }),
    [update],
  );
  const setMedia = useCallback(
    (value: PublishingMediaItem[]) => update({ media: value }),
    [update],
  );

  const submissionSessionRef = useRef<number | null>(null);
  const mutation = useMutation({
    mutationFn: () => {
      if (submissionSessionRef.current !== getAuthSessionVersion())
        throw new Error('登录会话已变化，请重新进入编辑');
      return createQuestion(
        title.trim(),
        serializePublishingMarkdown(content, uploadedImages),
      );
    },
    onMutate: () => ({ sessionVersion: submissionSessionRef.current }),
    onSuccess: async (_result, _variables, context) => {
      if (context?.sessionVersion !== getAuthSessionVersion()) return;
      await draft.completePublished();
      if (context?.sessionVersion !== getAuthSessionVersion()) return;
      Alert.alert('发布成功', '您的问题已发布！');
      queryClient.invalidateQueries({ queryKey: ['feeds'] });
      router.back();
    },
    onSettled: () => {
      submissionSessionRef.current = null;
      setSubmitting(false);
    },
    onError: (error: unknown, _variables, context) => {
      if (context?.sessionVersion === getAuthSessionVersion())
        Alert.alert('发布失败', getZhihuErrorMessage(error));
    },
  });

  const handlePublish = () => {
    if (submissionSessionRef.current !== null) return;
    if (!title.trim()) {
      Alert.alert('提示', '请输入问题标题');
      return;
    }
    if (editorBusy) {
      Alert.alert(
        '图片尚未就绪',
        '请等待上传完成，或重试、移除失败的图片后再发布。',
      );
      return;
    }
    if (!draft.ready || draft.hasConflict || mutation.isPending) return;
    submissionSessionRef.current = getAuthSessionVersion();
    setSubmitting(true);
    mutation.mutate();
  };

  const isPublishEnabled =
    draft.ready &&
    title.trim().length > 5 &&
    !editorBusy &&
    !mutation.isPending;

  return (
    <View className="flex-1">
      <Stack.Screen options={{ headerShown: false, title: '提问题' }} />
      <View
        className="flex-row items-center justify-between px-4 pb-3"
        style={{ paddingTop: insets.top + 10 }}
      >
        <GlassNavigationButton
          icon="close"
          accessibilityLabel="关闭"
          onPress={() => router.back()}
          size={40}
          color={textColor}
        />
        <Text className="text-lg font-bold">提问题</Text>
        <BouncyButton
          disabled={!isPublishEnabled}
          onPress={handlePublish}
          className="px-5 py-2 rounded-full min-w-[80px] items-center justify-center"
          style={{ backgroundColor: isPublishEnabled ? tintColor : borderCol }}
        >
          {mutation.isPending ? (
            <ActivityIndicator size="small" color={onPrimary} />
          ) : (
            <Text
              className="text-sm font-bold"
              style={{ color: isPublishEnabled ? onPrimary : secondaryColor }}
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
            editable={draft.ready && !mutation.isPending}
            onChangeText={setTitle}
            autoFocus
          />
          <PublishingDraftNotice draft={draft} />
          {draft.ready && (
            <PublishingEditor
              key={draft.scopeKey}
              draftScope={draft.scope}
              initialMedia={draft.value.media}
              initialImages={draft.value.images}
              onMediaChange={setMedia}
              contentType="question"
              disabled={mutation.isPending || draft.hasConflict}
              minHeight={300}
              onBusyChange={setEditorBusy}
              onChangeText={setContent}
              onImagesChange={setUploadedImages}
              placeholder="补充问题背景和细节（可选）"
              value={content}
            />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
