import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
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
import type { UploadedImage } from '@/api/zhihu/image';
import { BouncyButton } from '@/components/BouncyButton';
import { Text, useThemeColor, View } from '@/components/Themed';
import {
  deserializePublishingHtml,
  PublishingEditor,
  serializePublishingMarkdown,
} from '@/features/publishing';
import { getZhihuErrorMessage } from '@/utils/zhihuError';

export default function WriteAnswerScreen() {
  const primaryColor = useThemeColor({}, 'primary');
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const _insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [content, setContent] = useState('');
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const [editorBusy, setEditorBusy] = useState(false);
  const initializedAnswerId = useRef<string | null>(null);

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
  });

  useEffect(() => {
    if (!existingAnswerId) {
      initializedAnswerId.current = null;
      return;
    }
    if (!existingAnswer || initializedAnswerId.current === existingAnswerId) {
      return;
    }
    const editableContent =
      existingAnswer.editable_content || existingAnswer.content || '';
    setContent(deserializePublishingHtml(editableContent));
    initializedAnswerId.current = existingAnswerId;
  }, [existingAnswer, existingAnswerId]);

  const mutation = useMutation({
    mutationFn: () => {
      const html = serializePublishingMarkdown(content, uploadedImages);
      return existingAnswerId
        ? updateAnswer(id as string, existingAnswerId, html)
        : createAnswer(id as string, html);
    },
    onSuccess: () => {
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
    onError: (error: unknown) =>
      Alert.alert(
        existingAnswerId ? '保存失败' : '发布失败',
        getZhihuErrorMessage(error),
      ),
  });

  const handlePublish = () => {
    if (!content.trim()) {
      Alert.alert('提示', '请输入回答内容');
      return;
    }
    if (editorBusy) {
      Alert.alert('图片上传中', '请等待图片上传完成后再发布。');
      return;
    }
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
              disabled={mutation.isPending || editorBusy || !content.trim()}
              style={{ opacity: !content.trim() ? 0.5 : 1 }}
            >
              {mutation.isPending ? (
                <ActivityIndicator size="small" color={primaryColor} />
              ) : (
                <Text
                  className="text-base font-bold mr-[15px]"
                  style={{ color: primaryColor }}
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
          <PublishingEditor
            autoFocus
            contentType="answer"
            disabled={mutation.isPending}
            minHeight={300}
            onBusyChange={setEditorBusy}
            onChangeText={setContent}
            onImagesChange={setUploadedImages}
            placeholder="知乎致力于建设友善的讨论氛围，建议在此写下你的真知灼见..."
            value={content}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
