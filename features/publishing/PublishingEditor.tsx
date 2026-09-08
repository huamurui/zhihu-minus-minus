import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  type NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  TextInput,
  type TextInputSelectionChangeEventData,
} from 'react-native';
import { type UploadedImage, uploadImage } from '@/api/zhihu/image';
import { BouncyButton } from '@/components/BouncyButton';
import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { ZhihuContent } from '@/features/rich-content';
import { getZhihuErrorMessage } from '@/utils/zhihuError';
import { serializePublishingMarkdown } from './serializer';

type PublishingContentType = 'answer' | 'article' | 'question';

interface TextSelection {
  start: number;
  end: number;
}

interface PublishingEditorProps {
  autoFocus?: boolean;
  contentType: PublishingContentType;
  disabled?: boolean;
  minHeight?: number;
  onBusyChange?: (busy: boolean) => void;
  onChangeText: (value: string) => void;
  onImagesChange?: (images: UploadedImage[]) => void;
  placeholder: string;
  value: string;
}

interface ToolbarAction {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  key: string;
  label: string;
  onPress: () => void;
}

export function PublishingEditor({
  autoFocus = false,
  contentType,
  disabled = false,
  minHeight = 280,
  onBusyChange,
  onChangeText,
  onImagesChange,
  placeholder,
  value,
}: PublishingEditorProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme];
  const inputRef = useRef<TextInput>(null);
  const valueRef = useRef(value);
  const uploadedImagesRef = useRef<UploadedImage[]>([]);
  const [selection, setSelection] = useState<TextSelection>({
    start: 0,
    end: 0,
  });
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isPicking, setIsPicking] = useState(false);
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const [uploadingCount, setUploadingCount] = useState(0);

  valueRef.current = value;

  const isBusy = isPicking || uploadingCount > 0;
  useEffect(() => {
    onBusyChange?.(isBusy);
  }, [isBusy, onBusyChange]);

  const focusAt = (nextSelection: TextSelection) => {
    setSelection(nextSelection);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setNativeProps({ selection: nextSelection });
    });
  };

  const replaceSelection = (
    prefix: string,
    suffix: string,
    placeholderText: string,
  ) => {
    const selectedText = value.slice(selection.start, selection.end);
    const innerText = selectedText || placeholderText;
    const replacement = `${prefix}${innerText}${suffix}`;
    onChangeText(
      `${value.slice(0, selection.start)}${replacement}${value.slice(selection.end)}`,
    );
    const innerStart = selection.start + prefix.length;
    focusAt({
      start: innerStart,
      end: innerStart + innerText.length,
    });
  };

  const prefixSelectedLines = (prefix: string) => {
    const lineStart =
      value.lastIndexOf('\n', Math.max(0, selection.start - 1)) + 1;
    const nextLineBreak = value.indexOf('\n', selection.end);
    const lineEnd = nextLineBreak === -1 ? value.length : nextLineBreak;
    const selectedLines = value.slice(lineStart, lineEnd);
    const replacement = selectedLines
      .split('\n')
      .map((line) => `${prefix}${line}`)
      .join('\n');
    onChangeText(
      `${value.slice(0, lineStart)}${replacement}${value.slice(lineEnd)}`,
    );
    focusAt({ start: lineStart, end: lineStart + replacement.length });
  };

  const insertUploadedImages = (imageMarkdown: string[]) => {
    if (imageMarkdown.length === 0) return;
    const currentValue = valueRef.current;
    const separator = currentValue.trimEnd() ? '\n\n' : '';
    const nextValue = `${currentValue.trimEnd()}${separator}${imageMarkdown.join('\n\n')}`;
    onChangeText(nextValue);
    focusAt({ start: nextValue.length, end: nextValue.length });
  };

  const chooseImages = async () => {
    if (disabled || isBusy) return;

    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('需要相册权限', '请允许访问照片，才能把图片插入正文。');
        return;
      }

      setIsPicking(true);
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        allowsMultipleSelection: true,
        selectionLimit: 9,
        quality: 1,
      });
      setIsPicking(false);

      if (result.canceled || result.assets.length === 0) return;
      setUploadingCount(result.assets.length);
      const uploaded = await Promise.all(
        result.assets.map(async (asset) => {
          try {
            const image = await uploadImage(
              {
                uri: asset.uri,
                width: asset.width,
                height: asset.height,
                mimeType: asset.mimeType,
                fileName: asset.fileName,
              },
              'article',
            );
            return image;
          } finally {
            setUploadingCount((count) => Math.max(0, count - 1));
          }
        }),
      );
      const nextImages = [...uploadedImagesRef.current, ...uploaded];
      uploadedImagesRef.current = nextImages;
      setUploadedImages(nextImages);
      onImagesChange?.(nextImages);
      insertUploadedImages(
        uploaded.map(
          (image) => `![图片](${image.src} "${image.width}x${image.height}")`,
        ),
      );
    } catch (error: unknown) {
      setIsPicking(false);
      setUploadingCount(0);
      Alert.alert('图片上传失败', getZhihuErrorMessage(error));
    }
  };

  const toolbarActions: ToolbarAction[] = [
    {
      key: 'heading',
      icon: 'text-outline',
      label: '标题',
      onPress: () => prefixSelectedLines('# '),
    },
    {
      key: 'bold',
      icon: 'logo-buffer',
      label: '粗体',
      onPress: () => replaceSelection('**', '**', '粗体文字'),
    },
    {
      key: 'quote',
      icon: 'chatbox-ellipses-outline',
      label: '引用',
      onPress: () => prefixSelectedLines('> '),
    },
    {
      key: 'list',
      icon: 'list-outline',
      label: '列表',
      onPress: () => prefixSelectedLines('- '),
    },
    {
      key: 'link',
      icon: 'link-outline',
      label: '链接',
      onPress: () => replaceSelection('[', '](https://)', '链接文字'),
    },
    {
      key: 'code',
      icon: 'code-slash-outline',
      label: '代码',
      onPress: () => replaceSelection('```\n', '\n```', '代码'),
    },
    {
      key: 'image',
      icon: 'image-outline',
      label: '图片',
      onPress: () => void chooseImages(),
    },
  ];

  const previewHtml = useMemo(
    () => serializePublishingMarkdown(value, uploadedImages),
    [uploadedImages, value],
  );

  const handleSelectionChange = (
    event: NativeSyntheticEvent<TextInputSelectionChangeEventData>,
  ) => setSelection(event.nativeEvent.selection);

  return (
    <View className="bg-transparent">
      <View
        className="flex-row items-center justify-between border-b bg-transparent"
        style={{ borderBottomColor: colors.border }}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="always"
          className="flex-1"
          contentContainerStyle={{ paddingVertical: 8, paddingRight: 8 }}
        >
          {toolbarActions.map((action) => (
            <BouncyButton
              key={action.key}
              disabled={disabled || isBusy || isPreviewing}
              onPress={action.onPress}
              className="items-center justify-center mr-1 px-2.5 py-1.5 rounded-lg"
              style={{ opacity: disabled || isBusy || isPreviewing ? 0.4 : 1 }}
            >
              {action.key === 'image' && isBusy ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Ionicons name={action.icon} size={20} color={colors.primary} />
              )}
              <Text type="secondary" className="mt-0.5 text-[10px]">
                {action.label}
              </Text>
            </BouncyButton>
          ))}
        </ScrollView>
        <BouncyButton
          disabled={disabled || !value.trim()}
          onPress={() => setIsPreviewing((current) => !current)}
          className="px-3 py-2 rounded-lg"
          style={{ opacity: disabled || !value.trim() ? 0.4 : 1 }}
        >
          <Text type="primary" className="text-xs font-semibold">
            {isPreviewing ? '继续编辑' : '预览'}
          </Text>
        </BouncyButton>
      </View>

      {uploadingCount > 0 && (
        <View className="flex-row items-center py-2 bg-transparent">
          <ActivityIndicator size="small" color={colors.primary} />
          <Text type="secondary" className="ml-2 text-xs">
            正在上传 {uploadingCount} 张图片，上传完成后会插入正文
          </Text>
        </View>
      )}

      {isPreviewing ? (
        <View style={{ minHeight }} className="pt-4 bg-transparent">
          <ZhihuContent
            content={previewHtml}
            objectId="publishing-preview"
            type={contentType}
            useNative
          />
        </View>
      ) : (
        <TextInput
          ref={inputRef}
          autoFocus={autoFocus}
          editable={!disabled}
          multiline
          onChangeText={onChangeText}
          onSelectionChange={handleSelectionChange}
          placeholder={placeholder}
          placeholderTextColor={colors.textTertiary}
          scrollEnabled={false}
          style={{
            minHeight,
            color: colors.text,
            fontSize: 17,
            lineHeight: 27,
            paddingHorizontal: 0,
            paddingVertical: 16,
            textAlignVertical: 'top',
          }}
          value={value}
        />
      )}

      <Text
        type="tertiary"
        className="pb-2 text-[11px]"
        style={{
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
        }}
      >
        支持标题、粗体、引用、列表、链接、代码和图片；发布前可预览
      </Text>
    </View>
  );
}
