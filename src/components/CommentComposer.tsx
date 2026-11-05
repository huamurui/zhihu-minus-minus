import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  PlatformColor,
  StyleSheet,
  TextInput,
  type TextInputInstance,
} from 'react-native';
import {
  type LocalImageAsset,
  type UploadedImage,
  uploadImage,
} from '@/api/zhihu/image';
import { BouncyButton } from '@/components/BouncyButton';
import { glassActionColor } from '@/components/ContentActionBarColor';
import { Text, View } from '@/components/Themed';
import Colors from '@/constants/Colors';
import { getZhihuErrorMessage } from '@/utils/zhihuError';

export interface CommentDraft {
  text: string;
  images: UploadedImage[];
}

interface SelectedImage {
  id: number;
  asset: LocalImageAsset;
  status: 'uploading' | 'uploaded' | 'failed';
  uploaded?: UploadedImage;
}

interface CommentComposerProps {
  useGlass?: boolean;
  colorScheme: 'light' | 'dark';
  borderColor: string;
  inputRef: React.RefObject<TextInputInstance | null>;
  inputText: string;
  isSubmitting: boolean;
  onChangeText: (text: string) => void;
  onSubmit: (draft: CommentDraft) => Promise<void>;
  onCancelReply: () => void;
  placeholder: string;
  replyToName?: string;
  textColor: string;
  tintColor: string;
}

export function CommentComposer({
  useGlass = false,
  colorScheme,
  borderColor,
  inputRef,
  inputText,
  isSubmitting,
  onChangeText,
  onSubmit,
  onCancelReply,
  placeholder,
  replyToName,
  textColor,
  tintColor,
}: CommentComposerProps) {
  const [selectedImages, setSelectedImages] = useState<SelectedImage[]>([]);
  const [isPicking, setIsPicking] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const pickingRef = useRef(false);
  const sendingRef = useRef(false);
  const mountedRef = useRef(true);
  const nextImageId = useRef(0);
  const uploadsRef = useRef(new Map<number, AbortController>());
  const busy = isSubmitting || isSending;
  const foreground = useGlass ? (glassActionColor ?? textColor) : textColor;
  const secondary = useGlass
    ? (glassActionColor ?? Colors[colorScheme].textSecondary)
    : Colors[colorScheme].textSecondary;
  const actionColor = useGlass ? (glassActionColor ?? tintColor) : tintColor;
  const placeholderColor =
    useGlass && Platform.OS === 'ios'
      ? PlatformColor('secondaryLabelColor')
      : Colors[colorScheme].textTertiary;

  useEffect(() => {
    mountedRef.current = true;
    const uploads = uploadsRef.current;
    return () => {
      mountedRef.current = false;
      for (const controller of uploads.values()) controller.abort();
      uploads.clear();
    };
  }, []);

  const uploadSelectedImage = (image: SelectedImage) => {
    const controller = new AbortController();
    uploadsRef.current.set(image.id, controller);
    void uploadImage(image.asset, undefined, { signal: controller.signal })
      .then((uploaded) => {
        if (!mountedRef.current || controller.signal.aborted) return;
        setSelectedImages((currentImages) =>
          currentImages.map((currentImage) =>
            currentImage.id === image.id
              ? { ...currentImage, status: 'uploaded', uploaded }
              : currentImage,
          ),
        );
      })
      .catch((error: unknown) => {
        if (!mountedRef.current || controller.signal.aborted) return;
        setSelectedImages((currentImages) =>
          currentImages.map((currentImage) =>
            currentImage.id === image.id
              ? { ...currentImage, status: 'failed', uploaded: undefined }
              : currentImage,
          ),
        );
        Alert.alert('图片上传失败', getZhihuErrorMessage(error));
      })
      .finally(() => uploadsRef.current.delete(image.id));
  };

  const chooseImage = async () => {
    if (busy || sendingRef.current || pickingRef.current) return;
    pickingRef.current = true;
    setIsPicking(true);

    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!mountedRef.current) return;
      if (!permission.granted) {
        Alert.alert('需要相册权限', '请允许访问照片，才能在评论中上传图片。');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        allowsMultipleSelection: true,
        selectionLimit: 0,
        quality: 1,
      });

      if (!mountedRef.current) return;
      if (!result.canceled && result.assets.length > 0) {
        const newImages = result.assets.map((asset) => ({
          uri: asset.uri,
          width: asset.width,
          height: asset.height,
          mimeType: asset.mimeType,
          fileName: asset.fileName,
        }));
        const existingUris = new Set(
          selectedImages.map((image) => image.asset.uri),
        );
        const uniqueImages: SelectedImage[] = newImages
          .filter((image) => {
            if (existingUris.has(image.uri)) return false;
            existingUris.add(image.uri);
            return true;
          })
          .map((asset) => ({
            id: nextImageId.current++,
            asset,
            status: 'uploading',
          }));
        if (uniqueImages.length > 0) {
          setSelectedImages((currentImages) => [
            ...currentImages,
            ...uniqueImages,
          ]);
          uniqueImages.forEach(uploadSelectedImage);
        }
      }
    } catch {
      if (mountedRef.current)
        Alert.alert('选择图片失败', '暂时无法读取相册，请稍后重试。');
    } finally {
      pickingRef.current = false;
      if (mountedRef.current) setIsPicking(false);
    }
  };

  const uploadingCount = selectedImages.filter(
    (image) => image.status === 'uploading',
  ).length;
  const failedCount = selectedImages.filter(
    (image) => image.status === 'failed',
  ).length;
  const uploadedImages = selectedImages.flatMap((image) =>
    image.uploaded ? [image.uploaded] : [],
  );

  const submit = async () => {
    const text = inputText.trim();
    if (
      (!text && selectedImages.length === 0) ||
      busy ||
      sendingRef.current ||
      pickingRef.current
    )
      return;
    if (uploadingCount > 0) {
      Alert.alert('图片上传中', '请等待图片上传完成后再发布。');
      return;
    }
    if (failedCount > 0 || uploadedImages.length !== selectedImages.length) {
      Alert.alert('图片尚未准备好', '请移除上传失败的图片后重试。');
      return;
    }

    sendingRef.current = true;
    setIsSending(true);
    try {
      await onSubmit({ text, images: uploadedImages });
      if (!mountedRef.current) return;
      onChangeText('');
      setSelectedImages([]);
    } catch {
      // The mutation owns the error toast/alert. Keep the draft for retry.
    } finally {
      sendingRef.current = false;
      if (mountedRef.current) setIsSending(false);
    }
  };

  return (
    <View
      className="rounded-[30px]"
      style={{
        overflow: useGlass ? 'visible' : 'hidden',
        borderWidth: useGlass ? 0 : StyleSheet.hairlineWidth,
        borderColor,
        backgroundColor: useGlass
          ? 'transparent'
          : colorScheme === 'dark'
            ? 'rgba(26,26,26,0.85)'
            : 'rgba(255,255,255,0.9)',
      }}
    >
      {replyToName && (
        <View className="flex-row justify-between items-center px-[15px] pt-2.5 pb-0.5 bg-transparent">
          <Text
            type="secondary"
            className="text-xs"
            style={{ color: secondary }}
          >
            正在回复 {replyToName}
          </Text>
          <BouncyButton
            disabled={busy || isPicking}
            onPress={onCancelReply}
            style={{ borderRadius: 8 }}
          >
            <Ionicons name="close-circle" size={16} color={secondary} />
          </BouncyButton>
        </View>
      )}

      {selectedImages.length > 0 && (
        <View className="px-[15px] pt-2.5 bg-transparent">
          <View className="flex-row flex-wrap bg-transparent">
            {selectedImages.map((image) => (
              <View key={image.id} className="mr-2 mb-2 bg-transparent">
                <Image
                  source={{ uri: image.asset.uri }}
                  style={{ width: 48, height: 48, borderRadius: 6 }}
                />
                {image.status !== 'uploaded' && (
                  <View
                    style={{
                      ...StyleSheet.absoluteFill,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: 6,
                      backgroundColor: 'rgba(0,0,0,0.45)',
                    }}
                  >
                    {image.status === 'uploading' ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Ionicons
                        name="alert-circle"
                        size={20}
                        color={Colors[colorScheme].danger}
                      />
                    )}
                  </View>
                )}
                <BouncyButton
                  disabled={busy || isPicking}
                  accessibilityLabel="移除图片"
                  onPress={() => {
                    uploadsRef.current.get(image.id)?.abort();
                    setSelectedImages((currentImages) =>
                      currentImages.filter(
                        (currentImage) => currentImage.id !== image.id,
                      ),
                    );
                  }}
                  style={{
                    position: 'absolute',
                    top: -6,
                    right: -6,
                    borderRadius: 8,
                  }}
                >
                  <Ionicons name="close-circle" size={18} color={secondary} />
                </BouncyButton>
              </View>
            ))}
          </View>
          <Text
            type="secondary"
            className="mb-1 text-xs"
            style={{ color: secondary }}
          >
            {uploadingCount > 0
              ? `正在上传 ${uploadingCount} 张图片...`
              : failedCount > 0
                ? '有图片上传失败，请移除后重新选择'
                : `已上传 ${uploadedImages.length} 张图片`}
          </Text>
        </View>
      )}

      <View className="flex-row items-end px-1 py-1 bg-transparent">
        <BouncyButton
          disabled={busy || isPicking}
          accessibilityLabel="添加图片"
          onPress={chooseImage}
          style={{
            width: 40,
            height: 40,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 20,
          }}
        >
          {isPicking ? (
            <ActivityIndicator size="small" color={actionColor} />
          ) : (
            <Ionicons name="image-outline" size={22} color={actionColor} />
          )}
        </BouncyButton>
        <TextInput
          ref={inputRef}
          className="flex-1 min-h-[40px] max-h-[100px] px-2 py-2.5"
          style={{
            color: foreground,
            fontSize: 15,
            lineHeight: 20,
            includeFontPadding: false,
            textAlignVertical: 'center',
          }}
          placeholder={placeholder}
          placeholderTextColor={placeholderColor}
          editable={!busy}
          value={inputText}
          onChangeText={onChangeText}
          multiline
          maxLength={1000}
        />
        <BouncyButton
          accessibilityRole="button"
          accessibilityLabel="发布评论"
          disabled={
            (!inputText.trim() && selectedImages.length === 0) ||
            busy ||
            isPicking ||
            uploadingCount > 0 ||
            failedCount > 0
          }
          onPress={submit}
          style={{
            height: 40,
            justifyContent: 'center',
            paddingHorizontal: 15,
            borderRadius: 20,
          }}
        >
          {busy ? (
            <ActivityIndicator size="small" color={actionColor} />
          ) : (
            <Text
              className="font-semibold text-base"
              style={{
                color: actionColor,
                opacity:
                  inputText.trim() || selectedImages.length > 0 ? 1 : 0.5,
              }}
            >
              发布
            </Text>
          )}
        </BouncyButton>
      </View>
    </View>
  );
}
