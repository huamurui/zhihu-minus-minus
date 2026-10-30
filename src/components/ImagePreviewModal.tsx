import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useRef, useState } from 'react';
import {
  Image,
  type ImageProps,
  SafeAreaView,
  StyleSheet,
  View,
} from 'react-native';
import ImageViewer from 'react-native-image-zoom-viewer';
import { BouncyButton } from '@/components/BouncyButton';
import { ImageActionBottomSheet } from '@/components/ImageActionBottomSheet';
import { Text } from '@/components/Themed';
import Colors from '@/constants/Colors';
import { PaneModal } from '@/features/adaptive-layout/PaneModal';
import { getCachedImageSource } from '@/utils/imageSource';
import {
  addNativeImageViewerListener,
  isNativeImageViewerAvailable,
  openNativeImageViewer,
} from '@/utils/nativeImageViewer';
import { saveImageToGallery } from '@/utils/saveImage';

const MAX_CACHED_IMAGE_DIMENSIONS = 256;
const imageDimensions = new Map<string, { width: number; height: number }>();

function renderCachedImage(props: ImageProps) {
  const { source, onLoad, ...rest } = props;
  const uriSource =
    typeof source === 'object' && source !== null && 'uri' in source
      ? source
      : undefined;
  const uri = uriSource?.uri;
  let cachedSource = getCachedImageSource(uri);
  if (
    cachedSource &&
    uriSource &&
    Object.keys(uriSource).some((key) => key !== 'uri' && key !== 'cache')
  ) {
    cachedSource = { ...uriSource, ...cachedSource };
  }

  return (
    <Image
      {...rest}
      fadeDuration={0}
      source={cachedSource ?? source}
      onLoad={(event) => {
        const { width, height } = event.nativeEvent.source;
        if (
          uri &&
          Number.isFinite(width) &&
          Number.isFinite(height) &&
          width > 0 &&
          height > 0
        ) {
          imageDimensions.delete(uri);
          imageDimensions.set(uri, { width, height });
          if (imageDimensions.size > MAX_CACHED_IMAGE_DIMENSIONS) {
            const oldestUri = imageDimensions.keys().next().value;
            if (oldestUri) imageDimensions.delete(oldestUri);
          }
        }
        onLoad?.(event);
      }}
    />
  );
}

export interface ImagePreviewModalProps {
  visible: boolean;
  /** The URLs the page displays; the native viewer starts from these cached copies. */
  imageUrls: string[];
  /** Full-size originals for `imageUrls`, by index; the native viewer loads these. */
  originalUrls?: readonly (string | undefined)[];
  initialIndex?: number;
  onClose: () => void;
}

export const ImagePreviewModal: React.FC<ImagePreviewModalProps> = (props) =>
  isNativeImageViewerAvailable() ? (
    <NativeImagePreview {...props} />
  ) : (
    <JsImagePreview {...props} />
  );

/**
 * Android: the native viewer decodes long images in tiles, so they stay sharp
 * when zoomed. It draws its own page count and save button; a long press
 * closes it and shows the same action sheet as the JavaScript viewer.
 */
function NativeImagePreview({
  visible,
  imageUrls,
  originalUrls,
  initialIndex = 0,
  onClose,
}: ImagePreviewModalProps) {
  const [sheetUrl, setSheetUrl] = useState<string | null>(null);
  const session = useRef(0);
  const latest = useRef({ imageUrls, originalUrls, initialIndex, onClose });
  latest.current = { imageUrls, originalUrls, initialIndex, onClose };

  useEffect(() => {
    const subscriptions = [
      addNativeImageViewerListener('onViewerSave', (event) => {
        if (event.session === session.current && event.url)
          void saveImageToGallery(event.url);
      }),
      addNativeImageViewerListener('onViewerLongPress', (event) => {
        if (event.session === session.current && event.url)
          setSheetUrl(event.url);
      }),
      addNativeImageViewerListener('onViewerDismiss', (event) => {
        if (event.session !== session.current) return;
        latest.current.onClose();
      }),
    ];
    return () => {
      for (const subscription of subscriptions) subscription.remove();
    };
  }, []);

  // Opens once per showing; the props may be rebuilt while the viewer is up.
  useEffect(() => {
    if (!visible) return;
    const { imageUrls: urls, originalUrls: originals } = latest.current;
    if (urls.length === 0) return;
    let current = true;
    void openNativeImageViewer({
      urls: urls.map((url, index) => originals?.[index] ?? url),
      index: Math.min(
        Math.max(latest.current.initialIndex, 0),
        urls.length - 1,
      ),
      placeholders: urls,
      saveLabel: '保存图片',
    }).then(
      (id) => {
        if (!current) return;
        if (id) session.current = id;
        else latest.current.onClose();
      },
      () => current && latest.current.onClose(),
    );
    return () => {
      current = false;
    };
  }, [visible]);

  return (
    <ImageActionBottomSheet
      visible={Boolean(sheetUrl)}
      imageUrl={sheetUrl}
      onClose={() => setSheetUrl(null)}
    />
  );
}

function JsImagePreview({
  visible,
  imageUrls,
  initialIndex = 0,
  onClose,
}: ImagePreviewModalProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [sheetUrl, setSheetUrl] = useState<string | null>(null);

  React.useEffect(() => {
    if (visible) {
      setCurrentIndex(initialIndex);
    }
  }, [visible, initialIndex]);

  const formattedUrls = React.useMemo(() => {
    // ImageViewer calls getSize on each mount unless the original size is known.
    // Reopening the modal must read sizes learned by the previous Image onLoad.
    return visible
      ? imageUrls.map((url) => ({ url, ...imageDimensions.get(url) }))
      : [];
  }, [imageUrls, visible]);

  const viewerKey = JSON.stringify(imageUrls);
  const displayedIndex = Math.min(
    Math.max(currentIndex, 0),
    Math.max(imageUrls.length - 1, 0),
  );
  const currentUrl = imageUrls[displayedIndex];

  if (!visible || imageUrls.length === 0) {
    return null;
  }

  return (
    <PaneModal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <ImageViewer
          key={viewerKey}
          imageUrls={formattedUrls}
          renderImage={renderCachedImage}
          enablePreload={false}
          index={displayedIndex}
          onChange={(index) => index != null && setCurrentIndex(index)}
          onCancel={onClose}
          onClick={onClose}
          enableSwipeDown={true}
          onSwipeDown={onClose}
          onLongPress={(image) => setSheetUrl(image?.url || currentUrl)}
          saveToLocalByLongPress={false}
          renderIndicator={() => <></>}
        />

        {/* 顶栏控制条 */}
        <SafeAreaView style={styles.headerSafeArea} pointerEvents="box-none">
          <View style={styles.headerBar}>
            <BouncyButton onPress={onClose} style={styles.iconBtn} hitSlop={12}>
              <Ionicons name="close" size={24} color="#FFFFFF" />
            </BouncyButton>

            {imageUrls.length > 1 && (
              <Text style={styles.pageIndicator}>
                {displayedIndex + 1} / {imageUrls.length}
              </Text>
            )}

            <View style={styles.rightActions}>
              <BouncyButton
                onPress={() => saveImageToGallery(currentUrl)}
                style={styles.iconBtn}
                hitSlop={12}
              >
                <Ionicons name="download-outline" size={22} color="#FFFFFF" />
              </BouncyButton>
            </View>
          </View>
        </SafeAreaView>

        {/* 长按底部 Action Sheet 盘 */}
        <ImageActionBottomSheet
          visible={Boolean(sheetUrl)}
          imageUrl={sheetUrl}
          onClose={() => setSheetUrl(null)}
        />
      </View>
    </PaneModal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.shadow,
  },
  headerSafeArea: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  rightActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pageIndicator: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
});
