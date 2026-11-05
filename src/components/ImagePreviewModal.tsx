import type React from 'react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import PagerView from 'react-native-pager-view';
import { ImageActionBottomSheet } from '@/components/ImageActionBottomSheet';
import { GlassNavigationButton } from '@/components/navigation/GlassNavigationButton';
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
  ) : props.visible && props.imageUrls.length > 0 ? (
    <JsImagePreview {...props} />
  ) : null;

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

  useLayoutEffect(() => {
    latest.current = { imageUrls, originalUrls, initialIndex, onClose };
  }, [imageUrls, originalUrls, initialIndex, onClose]);

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
  imageUrls,
  originalUrls,
  initialIndex = 0,
  onClose,
}: ImagePreviewModalProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [sheetUrl, setSheetUrl] = useState<string | null>(null);
  const [zoomed, setZoomed] = useState(false);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const displayedIndex = Math.min(
    Math.max(currentIndex, 0),
    Math.max(imageUrls.length - 1, 0),
  );
  const currentUrl =
    originalUrls?.[displayedIndex] ?? imageUrls[displayedIndex];
  return (
    <PaneModal
      visible
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View
        style={styles.container}
        onLayout={(event) => setSize(event.nativeEvent.layout)}
      >
        {size.width > 0 && size.height > 0 && (
          <PagerView
            key={JSON.stringify(imageUrls)}
            style={styles.container}
            initialPage={displayedIndex}
            scrollEnabled={!zoomed}
            onPageSelected={(event) => {
              setCurrentIndex(event.nativeEvent.position);
              setZoomed(false);
            }}
          >
            {imageUrls.map((url, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: a gallery may contain the same URL more than once.
              <View key={`${url}:${index}`} collapsable={false}>
                <PreviewPage
                  url={originalUrls?.[index] ?? url}
                  width={size.width}
                  height={size.height}
                  onClose={onClose}
                  onLongPress={setSheetUrl}
                  onZoomChange={setZoomed}
                />
              </View>
            ))}
          </PagerView>
        )}
        <SafeAreaView style={styles.headerSafeArea} pointerEvents="box-none">
          <View style={styles.headerBar}>
            <GlassNavigationButton
              icon="close"
              accessibilityLabel="关闭"
              onPress={onClose}
              size={36}
              color="#FFFFFF"
              colorScheme="dark"
              glassStyle="regular"
              backgroundColor="rgba(0, 0, 0, 0.4)"
              hitSlop={12}
            />
            {imageUrls.length > 1 && (
              <Text style={styles.pageIndicator}>
                {displayedIndex + 1} / {imageUrls.length}
              </Text>
            )}
            <GlassNavigationButton
              icon="download"
              accessibilityLabel="保存图片"
              onPress={() => void saveImageToGallery(currentUrl)}
              size={36}
              color="#FFFFFF"
              colorScheme="dark"
              glassStyle="regular"
              backgroundColor="rgba(0, 0, 0, 0.4)"
              hitSlop={12}
            />
          </View>
        </SafeAreaView>
        <ImageActionBottomSheet
          visible={Boolean(sheetUrl)}
          imageUrl={sheetUrl}
          onClose={() => setSheetUrl(null)}
        />
      </View>
    </PaneModal>
  );
}

function PreviewPage({
  url,
  width,
  height,
  onClose,
  onLongPress,
  onZoomChange,
}: {
  url: string;
  width: number;
  height: number;
  onClose: () => void;
  onLongPress: (url: string) => void;
  onZoomChange: (zoomed: boolean) => void;
}) {
  const [aspect, setAspect] = useState(0);
  const imageHeight = aspect > 3 ? width * aspect : height;
  return (
    <ScrollView
      style={styles.container}
      maximumZoomScale={5}
      minimumZoomScale={1}
      bouncesZoom
      centerContent
      onScroll={(event) =>
        onZoomChange((event.nativeEvent.zoomScale ?? 1) > 1.01)
      }
      scrollEventThrottle={32}
    >
      <Pressable
        onPress={onClose}
        onLongPress={() => onLongPress(url)}
        style={{ width, height: imageHeight }}
      >
        <Image
          source={getCachedImageSource(url)}
          style={styles.image}
          resizeMode="contain"
          fadeDuration={0}
          onLoad={(event) => {
            const { width: imageWidth, height: imageHeight } =
              event.nativeEvent.source;
            if (imageWidth > 0 && imageHeight > 0)
              setAspect(imageHeight / imageWidth);
          }}
        />
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.shadow },
  image: { width: '100%', height: '100%' },
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
  pageIndicator: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
});
