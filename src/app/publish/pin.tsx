import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BouncyButton } from '@/components/BouncyButton';
import { GlassNavigationButton } from '@/components/navigation/GlassNavigationButton';
import { QueryErrorView } from '@/components/QueryErrorView';
import { Text, useRuntimeThemeColors, View } from '@/components/Themed';
import {
  PublishingDocumentEditor,
  PublishingDraftNotice,
  PublishingMediaPicker,
} from '@/features/publishing';
import { usePinEditor } from '@/features/publishing/usePinEditor';
import { getAuthSessionVersion, useAuthStore } from '@/store/useAuthStore';

export default function PublishPinScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const session = useAuthStore(() => getAuthSessionVersion());
  return <PinEditorScreen key={`${id ?? 'new'}:${session}`} pinId={id} />;
}

function PinEditorScreen({ pinId }: { pinId?: string }) {
  const colors = useRuntimeThemeColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const editor = usePinEditor(pinId);
  const { draft, remoteImages, pending } = editor;
  const disabled = !draft.ready || draft.hasConflict || pending !== null;
  const publishEnabled = editor.enabled && editor.hasContent;
  return (
    <View className="flex-1">
      <Stack.Screen
        options={{ headerShown: false, title: pinId ? '编辑想法' : '发想法' }}
      />
      <View
        className="flex-row items-center justify-between px-4 pb-3"
        style={{ paddingTop: insets.top + 10 }}
      >
        <GlassNavigationButton
          icon="close"
          accessibilityLabel="关闭编辑"
          onPress={() => router.back()}
          size={40}
          color={colors.text}
        />
        <Text className="text-lg font-bold">
          {pinId ? '编辑想法' : '发想法'}
        </Text>
        <BouncyButton
          disabled={!publishEnabled}
          onPress={() => void editor.publish()}
          className="px-5 py-2 rounded-full min-w-[80px] items-center justify-center"
          style={{
            backgroundColor: publishEnabled ? colors.primary : colors.border,
          }}
        >
          {pending === 'publish' ? (
            <ActivityIndicator size="small" color={colors.onPrimary} />
          ) : (
            <Text
              className="text-sm font-bold"
              style={{
                color: publishEnabled ? colors.onPrimary : colors.textSecondary,
              }}
            >
              {pinId ? '保存修改' : '发布'}
            </Text>
          )}
        </BouncyButton>
      </View>
      {pinId && !editor.existing.data ? (
        <View className="flex-1 items-center justify-center px-6">
          {editor.existing.isError ? (
            <QueryErrorView
              message="想法草稿加载失败，请重试；暂不支持的内容可在官方编辑器中修改。"
              onRetry={() => void editor.existing.refetch()}
            />
          ) : (
            <ActivityIndicator size="large" color={colors.primary} />
          )}
        </View>
      ) : (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <ScrollView
            className="flex-1 px-5 pt-4"
            keyboardShouldPersistTaps="handled"
          >
            <View className="flex-row flex-wrap items-center bg-transparent mb-4">
              <BouncyButton
                disabled={!editor.enabled}
                onPress={() => void editor.saveCloud()}
                className="mr-5 py-2"
              >
                <Text type="primary">
                  {pending === 'save' ? '保存中…' : '保存到云端草稿'}
                </Text>
              </BouncyButton>
              {(pinId || draft.value.pinDraftId) && (
                <BouncyButton
                  disabled={!editor.enabled}
                  onPress={editor.loadCloud}
                  className="py-2"
                >
                  <Text type="primary">
                    {pending === 'load' ? '读取中…' : '读取云端草稿'}
                  </Text>
                </BouncyButton>
              )}
            </View>
            <TextInput
              accessibilityLabel="想法标题"
              value={draft.value.title}
              onChangeText={(title) => draft.update({ title })}
              editable={!disabled}
              placeholder="标题（可选）"
              placeholderTextColor={colors.textSecondary}
              maxLength={100}
              style={{
                color: colors.text,
                borderBottomColor: colors.border,
                borderBottomWidth: 1,
                fontSize: 19,
                fontWeight: '600',
                paddingBottom: 12,
                paddingHorizontal: 0,
              }}
            />
            <PublishingDraftNotice draft={draft} />
            {draft.ready && draft.value.document && (
              <PublishingDocumentEditor
                contentType="pin"
                document={draft.value.document}
                disabled={disabled}
                onChange={(document) => draft.update({ document })}
              />
            )}
            <TextInput
              accessibilityLabel="想法内容"
              autoFocus={!pinId}
              value={draft.value.content}
              onChangeText={(content) => draft.update({ content })}
              editable={!disabled}
              multiline
              placeholder={
                draft.value.document ? '继续补充想法…' : '这一刻的想法...'
              }
              placeholderTextColor={colors.textSecondary}
              textAlignVertical="top"
              style={{
                color: colors.text,
                fontSize: 17,
                lineHeight: 27,
                minHeight: draft.value.document ? 120 : 230,
                paddingHorizontal: 0,
                paddingTop: 16,
              }}
            />
            <View className="flex-row flex-wrap bg-transparent">
              {remoteImages.map((image) => (
                <View key={image.imageId} className="mr-3 mb-3 bg-transparent">
                  <Image
                    source={{ uri: image.src }}
                    accessibilityLabel="想法已有图片"
                    style={{ width: 84, height: 84, borderRadius: 10 }}
                  />
                  <BouncyButton
                    accessibilityLabel="移除此图片"
                    disabled={disabled}
                    onPress={() =>
                      draft.update({
                        images: draft.value.images.filter(
                          (item) => item.imageId !== image.imageId,
                        ),
                      })
                    }
                    style={{ position: 'absolute', right: -7, top: -7 }}
                  >
                    <Ionicons
                      name="close-circle"
                      size={22}
                      color={colors.textSecondary}
                    />
                  </BouncyButton>
                </View>
              ))}
            </View>
            {draft.ready && (
              <PublishingMediaPicker
                key={`${draft.scopeKey}:${editor.mediaRevision}`}
                draftScope={draft.scope}
                initialMedia={editor.media}
                onMediaChange={editor.setMedia}
                disabled={disabled}
                maxImages={Math.max(0, 9 - remoteImages.length)}
                onBusyChange={editor.setMediaBusy}
                onImagesChange={editor.setImages}
              />
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}
