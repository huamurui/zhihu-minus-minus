import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  createAnswer,
  getAnswer,
  getQuestion,
  updateAnswer,
} from '@/api/zhihu';
import { BouncyButton } from '@/components/BouncyButton';
import { useIsLiquidGlassActive } from '@/components/surfaces/FloatingSurface';
import { Text, useThemeColor, View } from '@/components/Themed';
import {
  createPublishingDocument,
  emptyPublishingDraft,
  hasPublishingDocumentContent,
  PublishingDocumentEditor,
  PublishingDraftNotice,
  PublishingEditor,
  serializePublishingDocument,
  serializePublishingMarkdown,
  usePublishingDraft,
} from '@/features/publishing';
import type { PublishingMediaItem } from '@/features/publishing/types';
import { getAuthSessionVersion } from '@/store/useAuthStore';
import { getZhihuErrorMessage } from '@/utils/zhihuError';

export default function WriteAnswerScreen() {
  const primaryColor = useThemeColor({}, 'link');
  const useGlass = useIsLiquidGlassActive();
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const _insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [editorBusy, setEditorBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const { data: question, isLoading: qLoading } = useQuery({
    queryKey: ['question', id],
    queryFn: () => getQuestion(id as string),
  });

  const existingAnswerId = (() => {
    const myAnswer = question?.relationship?.my_answer;
    if (!myAnswer || myAnswer.is_deleted) return undefined;
    const answerId = myAnswer.id ?? myAnswer.answer_id;
    return answerId === undefined ? undefined : String(answerId);
  })();

  const { data: existingAnswer, isLoading: answerLoading } = useQuery({
    queryKey: ['answer-edit', existingAnswerId],
    queryFn: () => getAnswer(existingAnswerId as string),
    enabled: !!existingAnswerId,
    // Keep the base revision stable during editing and fetch a fresh revision
    // when the editor is opened again.
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const initialDraft = useMemo(
    () => ({
      ...emptyPublishingDraft(),
      document: existingAnswer
        ? createPublishingDocument(
            existingAnswer.editable_content || existingAnswer.content || '',
          )
        : null,
    }),
    [existingAnswer],
  );
  const draft = usePublishingDraft(
    'answer',
    `${id}:${existingAnswerId ?? 'new'}`,
    initialDraft,
    !qLoading &&
      !answerLoading &&
      (!existingAnswerId || Boolean(existingAnswer)),
    editorBusy,
    submitting,
  );
  const { update } = draft;
  const { content, images: uploadedImages, document } = draft.value;
  const setContent = useCallback(
    (value: string) => update({ content: value }),
    [update],
  );
  const setUploadedImages = useCallback(
    (value: typeof uploadedImages) => update({ images: value }),
    [update],
  );
  const setMedia = useCallback(
    (value: PublishingMediaItem[]) => update({ media: value }),
    [update],
  );
  const hasContent = Boolean(
    content.trim() || (document && hasPublishingDocumentContent(document)),
  );

  const submissionSessionRef = useRef<number | null>(null);
  const mutation = useMutation({
    mutationFn: () => {
      if (submissionSessionRef.current !== getAuthSessionVersion())
        throw new Error('登录会话已变化，请重新进入编辑');
      const html =
        (document
          ? serializePublishingDocument(document, uploadedImages)
          : '') + serializePublishingMarkdown(content, uploadedImages);
      return existingAnswerId
        ? updateAnswer(id as string, existingAnswerId, html)
        : createAnswer(id as string, html);
    },
    onMutate: () => ({ sessionVersion: submissionSessionRef.current }),
    onSuccess: async (_result, _variables, context) => {
      if (context?.sessionVersion !== getAuthSessionVersion()) return;
      await draft.completePublished();
      if (context?.sessionVersion !== getAuthSessionVersion()) return;
      Alert.alert(
        existingAnswerId ? '保存成功' : '发布成功',
        existingAnswerId ? '你的回答修改已保存喵！' : '你的回答已发布喵！',
      );
      queryClient.invalidateQueries({ queryKey: ['question-answers', id] });
      if (existingAnswerId) {
        queryClient.invalidateQueries({
          queryKey: ['answer-detail', existingAnswerId],
        });
      }
      router.back();
    },
    onSettled: () => {
      submissionSessionRef.current = null;
      setSubmitting(false);
    },
    onError: (error: unknown, _variables, context) => {
      if (context?.sessionVersion === getAuthSessionVersion())
        Alert.alert(
          existingAnswerId ? '保存失败' : '发布失败',
          getZhihuErrorMessage(error),
        );
    },
  });

  const handlePublish = () => {
    if (submissionSessionRef.current !== null) return;
    if (!hasContent) {
      Alert.alert('提示', '请输入回答内容');
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

  if (qLoading || answerLoading) {
    return (
      <View className="flex-1 justify-center items-center">
        <ActivityIndicator size="large" color={primaryColor} />
      </View>
    );
  }

  return (
    <View className="flex-1">
      <Stack.Screen
        options={{
          headerTitle: existingAnswerId ? '编辑回答' : '写回答',
          headerRight: () => (
            <BouncyButton
              className="px-3 py-2 rounded-full"
              onPress={handlePublish}
              disabled={
                !draft.ready ||
                draft.hasConflict ||
                mutation.isPending ||
                editorBusy ||
                !hasContent
              }
              style={{ opacity: !hasContent ? 0.5 : 1 }}
            >
              {mutation.isPending ? (
                <ActivityIndicator size="small" color={primaryColor} />
              ) : (
                <Text
                  className="text-base font-bold"
                  style={{
                    color: primaryColor,
                    marginRight: useGlass ? 0 : 15,
                  }}
                >
                  {existingAnswerId ? '保存' : '发布'}
                </Text>
              )}
            </BouncyButton>
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
          <PublishingDraftNotice draft={draft} />
          {draft.ready && document && (
            <PublishingDocumentEditor
              document={document}
              disabled={mutation.isPending || draft.hasConflict}
              onChange={(value) => update({ document: value })}
            />
          )}
          {draft.ready && (
            <PublishingEditor
              key={draft.scopeKey}
              draftScope={draft.scope}
              initialMedia={draft.value.media}
              initialImages={draft.value.images}
              onMediaChange={setMedia}
              autoFocus
              contentType="answer"
              disabled={mutation.isPending || draft.hasConflict}
              minHeight={300}
              onBusyChange={setEditorBusy}
              onChangeText={setContent}
              onImagesChange={setUploadedImages}
              placeholder="知乎致力于建设友善的讨论氛围，建议在此写下你的真知灼见..."
              value={content}
            />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
