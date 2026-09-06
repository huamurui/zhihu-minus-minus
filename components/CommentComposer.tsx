import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import type React from 'react';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  StyleSheet,
  TextInput,
} from 'react-native';
import {
  type LocalImageAsset,
  type UploadedImage,
  uploadImage,
} from '@/api/zhihu/image';
import { BouncyButton } from '@/components/BouncyButton';
import { Text, View } from '@/components/Themed';
import Colors from '@/constants/Colors';
import { getZhihuErrorMessage } from '@/utils/zhihuError';

export interface CommentDraft {
  text: string;
  images: UploadedImage[];
}

interface SelectedImage {
  asset: LocalImageAsset;
  status: 'uploading' | 'uploaded' | 'failed';
  uploaded?: UploadedImage;
}

interface CommentComposerProps {
  colorScheme: 'light' | 'dark';
  borderColor: string;
  inputRef: React.RefObject<TextInput | null>;
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

  const uploadSelectedImage = (asset: LocalImageAsset) => {
    void uploadImage(asset)
      .then((uploaded) => {
        setSelectedImages((currentImages) =>
          currentImages.map((image) =>
            image.asset.uri === asset.uri
              ? { ...image, status: 'uploaded', uploaded }
              : image,
          ),
        );
      })
      .catch((error: unknown) => {
        setSelectedImages((currentImages) =>
          currentImages.map((image) =>
            image.asset.uri === asset.uri
              ? { ...image, status: 'failed', uploaded: undefined }
              : image,
          ),
        );
        Alert.alert('图片上传失败', getZhihuErrorMessage(error));
      });
  };

  const chooseImage = async () => {
    if (isSubmitting || isPicking) return;

    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('需要相册权限', '请允许访问照片，才能在评论中上传图片。');
        return;
      }

      setIsPicking(true);
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        allowsMultipleSelection: true,
        selectionLimit: 0,
        quality: 1,
      });

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
        const uniqueImages = newImages.filter(
          (image) => !existingUris.has(image.uri),
        );
        if (uniqueImages.length > 0) {
          setSelectedImages((currentImages) => [
            ...currentImages,
            ...uniqueImages.map((asset) => ({
              asset,
              status: 'uploading' as const,
            })),
          ]);
          uniqueImages.forEach(uploadSelectedImage);
        }
      }
    } catch {
      Alert.alert('选择图片失败', '暂时无法读取相册，请稍后重试。');
    } finally {
      setIsPicking(false);
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
    if ((!text && selectedImages.length === 0) || isSubmitting) return;
    if (uploadingCount > 0) {
      Alert.alert('图片上传中', '请等待图片上传完成后再发布。');
      return;
    }
    if (failedCount > 0 || uploadedImages.length !== selectedImages.length) {
      Alert.alert('图片尚未准备好', '请移除上传失败的图片后重试。');
      return;
    }

    try {
      await onSubmit({ text, images: uploadedImages });
      onChangeText('');
      setSelectedImages([]);
    } catch {
      // The mutation owns the error toast/alert. Keep the draft for retry.
    }
  };

  return (
    <View
      className="rounded-[30px] overflow-hidden"
      style={{
        borderWidth: StyleSheet.hairlineWidth,
        borderColor,
        backgroundColor:
          colorScheme === 'dark'
            ? 'rgba(26,26,26,0.85)'
            : 'rgba(255,255,255,0.9)',
      }}
    >
      {replyToName && (
        <View className="flex-row justify-between items-center px-[15px] pt-2.5 pb-0.5 bg-transparent">
          <Text type="secondary" className="text-xs">
            正在回复 {replyToName}
          </Text>
          <BouncyButton
            disabled={isSubmitting}
            onPress={onCancelReply}
            style={{ borderRadius: 8 }}
          >
            <Ionicons
              name="close-circle"
              size={16}
              color={Colors[colorScheme].textSecondary}
            />
          </BouncyButton>
        </View>
      )}

      {selectedImages.length > 0 && (
        <View className="px-[15px] pt-2.5 bg-transparent">
          <View className="flex-row flex-wrap bg-transparent">
            {selectedImages.map((image) => (
              <View key={image.asset.uri} className="mr-2 mb-2 bg-transparent">
                <Image
                  source={{ uri: image.asset.uri }}
                  style={{ width: 48, height: 48, borderRadius: 6 }}
                />
                {image.status !== 'uploaded' && (
                  <View
                    style={{
                      ...StyleSheet.absoluteFillObject,
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
                  disabled={isSubmitting}
                  onPress={() =>
                    setSelectedImages((currentImages) =>
                      currentImages.filter(
                        (currentImage) =>
                          currentImage.asset.uri !== image.asset.uri,
                      ),
                    )
                  }
                  style={{
                    position: 'absolute',
                    top: -6,
                    right: -6,
                    borderRadius: 8,
                  }}
                >
                  <Ionicons
                    name="close-circle"
                    size={18}
                    color={Colors[colorScheme].textSecondary}
                  />
                </BouncyButton>
              </View>
            ))}
          </View>
          <Text type="secondary" className="mb-1 text-xs">
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
          disabled={isSubmitting || isPicking}
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
            <ActivityIndicator size="small" color={tintColor} />
          ) : (
            <Ionicons name="image-outline" size={22} color={tintColor} />
          )}
        </BouncyButton>
        <TextInput
          ref={inputRef}
          className="flex-1 min-h-[35px] max-h-[100px] px-2 pt-2.5 pb-2.5"
          style={{ color: textColor, fontSize: 15 }}
          placeholder={placeholder}
          placeholderTextColor="#999"
          value={inputText}
          onChangeText={onChangeText}
          multiline
          maxLength={1000}
        />
        <BouncyButton
          disabled={
            (!inputText.trim() && selectedImages.length === 0) ||
            isSubmitting ||
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
          {isSubmitting ? (
            <ActivityIndicator size="small" color={tintColor} />
          ) : (
            <Text
              className="font-semibold text-base"
              style={{
                color: tintColor,
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
