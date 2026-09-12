import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, StyleSheet } from 'react-native';
import {
  type LocalImageAsset,
  type UploadedImage,
  uploadImage,
} from '@/api/zhihu/image';
import { BouncyButton } from '@/components/BouncyButton';
import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { getZhihuErrorMessage } from '@/utils/zhihuError';

interface SelectedMedia {
  asset: LocalImageAsset;
  id: string;
  status: 'failed' | 'uploaded' | 'uploading';
  uploaded?: UploadedImage;
}

interface PublishingMediaPickerProps {
  disabled?: boolean;
  maxImages?: number;
  onBusyChange?: (busy: boolean) => void;
  onImagesChange: (images: UploadedImage[]) => void;
  uploadSource?: string;
}

export function PublishingMediaPicker({
  disabled = false,
  maxImages = 9,
  onBusyChange,
  onImagesChange,
  uploadSource = 'article',
}: PublishingMediaPickerProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme];
  const [items, setItems] = useState<SelectedMedia[]>([]);
  const [isPicking, setIsPicking] = useState(false);
  const uploadingCount = items.filter(
    (item) => item.status === 'uploading',
  ).length;
  const failedCount = items.filter((item) => item.status === 'failed').length;
  const isBusy = isPicking || uploadingCount > 0 || failedCount > 0;

  useEffect(() => {
    onBusyChange?.(isBusy);
  }, [isBusy, onBusyChange]);

  useEffect(() => {
    onImagesChange(
      items.flatMap((item) => (item.uploaded ? [item.uploaded] : [])),
    );
  }, [items, onImagesChange]);

  const uploadSelectedMedia = (item: SelectedMedia) => {
    setItems((current) =>
      current.map((candidate) =>
        candidate.id === item.id
          ? { ...candidate, status: 'uploading', uploaded: undefined }
          : candidate,
      ),
    );
    void uploadImage(item.asset, uploadSource)
      .then((uploaded) => {
        setItems((current) =>
          current.map((candidate) =>
            candidate.id === item.id
              ? { ...candidate, status: 'uploaded', uploaded }
              : candidate,
          ),
        );
      })
      .catch((error: unknown) => {
        setItems((current) =>
          current.map((candidate) =>
            candidate.id === item.id
              ? { ...candidate, status: 'failed', uploaded: undefined }
              : candidate,
          ),
        );
        Alert.alert('图片上传失败', getZhihuErrorMessage(error));
      });
  };

  const chooseImages = async () => {
    if (disabled || isBusy || items.length >= maxImages) return;

    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('需要相册权限', '请允许访问照片，才能给想法添加图片。');
        return;
      }

      setIsPicking(true);
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        allowsMultipleSelection: true,
        selectionLimit: maxImages - items.length,
        quality: 1,
      });
      if (result.canceled || result.assets.length === 0) return;

      const existingUris = new Set(items.map((item) => item.asset.uri));
      const selectedAt = Date.now();
      const newItems = result.assets
        .filter((asset) => !existingUris.has(asset.uri))
        .map<SelectedMedia>((asset, index) => ({
          id: `${selectedAt}-${index}-${asset.uri}`,
          status: 'uploading',
          asset: {
            uri: asset.uri,
            width: asset.width,
            height: asset.height,
            mimeType: asset.mimeType,
            fileName: asset.fileName,
          },
        }));
      setItems((current) => [...current, ...newItems]);
      newItems.forEach(uploadSelectedMedia);
    } catch {
      Alert.alert('选择图片失败', '暂时无法读取相册，请稍后重试。');
    } finally {
      setIsPicking(false);
    }
  };

  const removeItem = (id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
  };

  return (
    <View className="py-3 bg-transparent">
      {items.length > 0 && (
        <View className="flex-row flex-wrap bg-transparent">
          {items.map((item) => (
            <View key={item.id} className="mr-3 mb-3 bg-transparent">
              <Image
                source={{ uri: item.asset.uri }}
                style={{ width: 84, height: 84, borderRadius: 10 }}
              />
              {item.status !== 'uploaded' && (
                <View
                  style={{
                    ...StyleSheet.absoluteFillObject,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 10,
                    backgroundColor: 'rgba(0,0,0,0.48)',
                  }}
                >
                  {item.status === 'uploading' ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <BouncyButton
                      onPress={() => uploadSelectedMedia(item)}
                      className="items-center p-2"
                    >
                      <Ionicons name="refresh" color="#fff" size={22} />
                      <Text style={{ color: '#fff', fontSize: 10 }}>重试</Text>
                    </BouncyButton>
                  )}
                </View>
              )}
              <BouncyButton
                disabled={disabled}
                onPress={() => removeItem(item.id)}
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
      )}

      <BouncyButton
        disabled={disabled || isBusy || items.length >= maxImages}
        onPress={() => void chooseImages()}
        className="self-start flex-row items-center rounded-xl border px-4 py-2.5"
        style={{
          borderColor: colors.border,
          opacity: disabled || isBusy || items.length >= maxImages ? 0.45 : 1,
        }}
      >
        {isPicking ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <Ionicons name="images-outline" size={20} color={colors.primary} />
        )}
        <Text type="primary" className="ml-2 text-sm font-semibold">
          {uploadingCount > 0
            ? `正在上传 ${uploadingCount} 张`
            : failedCount > 0
              ? `${failedCount} 张上传失败，请重试`
              : `添加图片（${items.length}/${maxImages}）`}
        </Text>
      </BouncyButton>
    </View>
  );
}
