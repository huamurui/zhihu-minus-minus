import Ionicons from '@expo/vector-icons/Ionicons';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Image,
  Platform,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { BouncyButton } from '@/components/BouncyButton';
import { ImageActionBottomSheet } from '@/components/ImageActionBottomSheet';
import { Text } from '@/components/Themed';
import { PaneModal } from '@/features/adaptive-layout/PaneModal';
import { getCachedImageSource } from '@/utils/imageSource';
import { saveImageToGallery } from '@/utils/saveImage';

export interface ImagePreviewItem {
  url: string;
  originalUrl?: string;
  width?: number;
  height?: number;
}

export interface ImagePreviewModalProps {
  visible: boolean;
  imageUrls: string[];
  originalUrls?: readonly (string | undefined)[];
  imageItems?: readonly ImagePreviewItem[];
  initialIndex?: number;
  onClose: () => void;
}

interface ZoomableImageItemProps {
  url: string;
  originalUrl?: string;
  width: number;
  height: number;
  initialWidth?: number;
  initialHeight?: number;
  isSingle: boolean;
  onSingleTap: () => void;
  onLongPress: (url: string) => void;
  onDismiss: () => void;
}

/** Resolves Zhihu _720w thumbnails to raw full-resolution _r originals when available. */
function getOriginalImageUrl(url: string, original?: string): string {
  if (original) return original;
  return url.replace(/_(?:720w|b|hd)\.([a-z0-9]+)(?:[?#]|$)/i, '_r.$1');
}

/**
 * High-performance long-image viewer powered by WebView texture tiling.
 * Mobile GPUs cap single hardware textures at 2048/4096px, which crushes long screenshots (e.g. 200x8000)
 * into blurry 50px strips when drawn on a single native canvas.
 * Chromium & WebKit's tile compositor automatically divides giant bitmaps into 512x512 GPU quads,
 * rendering long images with 100% native pixel clarity.
 */
const LongImageWebView: React.FC<{
  url: string;
  originalUrl?: string;
  width: number;
  height: number;
  onSingleTap: () => void;
  onLongPress: (url: string) => void;
}> = ({ url, originalUrl, width, height, onSingleTap, onLongPress }) => {
  const primaryUrl = getOriginalImageUrl(url, originalUrl);
  const fallbackUrl = url;

  const html = `
    <!DOCTYPE html>
    <html style="background-color: #000000;">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=5.0, user-scalable=yes">
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        html, body {
          width: 100%;
          min-height: 100%;
          background-color: #000000;
          overflow-x: hidden;
          touch-action: pan-y pinch-zoom;
          -webkit-user-select: none;
          user-select: none;
        }
        .container {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: flex-start;
          width: 100%;
          min-height: 100vh;
          background-color: #000000;
        }
        img {
          width: 100%;
          height: auto;
          display: block;
          margin: 0 auto;
          image-rendering: -webkit-optimize-contrast;
        }
        #loader {
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          color: rgba(255, 255, 255, 0.5);
          font-family: system-ui, -apple-system, sans-serif;
          font-size: 14px;
          pointer-events: none;
        }
      </style>
    </head>
    <body style="background-color: #000000;">
      <div class="container">
        <div id="loader">加载中...</div>
        <img id="img" src="${primaryUrl}" onerror="onImgErr(this)" onload="onImgOk()" />
      </div>
      <script>
        var fallback = ${JSON.stringify(fallbackUrl)};
        var tried = false;
        function onImgErr(el) {
          if (!tried && fallback && el.src !== fallback) {
            tried = true;
            el.src = fallback;
          } else {
            var loader = document.getElementById('loader');
            if (loader) loader.innerText = '图片加载失败';
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error' }));
            }
          }
        }
        function onImgOk() {
          var loader = document.getElementById('loader');
          if (loader) loader.style.display = 'none';
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'load' }));
          }
        }

        var timer = null;
        var startX = 0, startY = 0;
        var moved = false;

        document.addEventListener('touchstart', function(e) {
          if (e.touches.length === 1) {
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            moved = false;
            timer = setTimeout(function() {
              if (!moved && window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'longPress' }));
              }
            }, 500);
          } else {
            if (timer) {
              clearTimeout(timer);
              timer = null;
            }
          }
        }, { passive: true });

        document.addEventListener('touchmove', function(e) {
          if (timer && e.touches.length === 1) {
            var dx = Math.abs(e.touches[0].clientX - startX);
            var dy = Math.abs(e.touches[0].clientY - startY);
            if (dx > 10 || dy > 10) {
              moved = true;
              clearTimeout(timer);
              timer = null;
            }
          }
        }, { passive: true });

        document.addEventListener('touchend', function(e) {
          if (timer) {
            clearTimeout(timer);
            timer = null;
          }
          if (!moved && e.changedTouches && e.changedTouches.length === 1) {
            var dx = Math.abs(e.changedTouches[0].clientX - startX);
            var dy = Math.abs(e.changedTouches[0].clientY - startY);
            if (dx < 10 && dy < 10) {
              if (window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'tap' }));
              }
            }
          }
        }, { passive: true });
      </script>
    </body>
    </html>
  `;

  return (
    <View
      style={{ width, height, backgroundColor: '#000000' }}
      testID="long-image-container"
    >
      <WebView
        source={{
          html,
          baseUrl: 'https://www.zhihu.com',
        }}
        originWhitelist={['*']}
        style={{ width, height, backgroundColor: '#000000' }}
        containerStyle={{ width, height, backgroundColor: '#000000' }}
        scrollEnabled={true}
        showsVerticalScrollIndicator={true}
        showsHorizontalScrollIndicator={false}
        overScrollMode="always"
        nestedScrollEnabled={true}
        setBuiltInZoomControls={true}
        setDisplayZoomControls={false}
        scalesPageToFit={false}
        mixedContentMode="always"
        domStorageEnabled={true}
        javaScriptEnabled={true}
        androidLayerType="hardware"
        allowFileAccess={true}
        allowFileAccessFromFileURLs={true}
        allowUniversalAccessFromFileURLs={true}
        testID="long-image-webview"
        onMessage={(event) => {
          try {
            const data = JSON.parse(event.nativeEvent.data);
            if (data.type === 'longPress') {
              onLongPress(primaryUrl || fallbackUrl);
            } else if (data.type === 'tap') {
              onSingleTap();
            }
          } catch {}
        }}
      />
    </View>
  );
};

const ZoomableImageItem: React.FC<ZoomableImageItemProps> = ({
  url,
  originalUrl,
  width,
  height,
  initialWidth,
  initialHeight,
  isSingle,
  onSingleTap,
  onLongPress,
  onDismiss,
}) => {
  const [aspectRatio, setAspectRatio] = useState<number | null>(() => {
    if (
      initialWidth &&
      initialHeight &&
      initialWidth > 0 &&
      initialHeight > 0
    ) {
      return initialHeight / initialWidth;
    }
    return null;
  });

  useEffect(() => {
    if (aspectRatio === null) {
      try {
        const maybePromise: unknown = Image.getSize(
          url,
          (w, h) => {
            if (w > 0 && h > 0) {
              setAspectRatio(h / w);
            }
          },
          () => {},
        );
        if (
          maybePromise &&
          typeof (maybePromise as { then?: unknown }).then === 'function'
        ) {
          (maybePromise as Promise<{ width: number; height: number }>)
            .then((size) => {
              if (size?.width > 0 && size?.height > 0) {
                setAspectRatio(size.height / size.width);
              }
            })
            .catch(() => {});
        }
      } catch {}
    }
  }, [url, aspectRatio]);

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translationX = useSharedValue(0);
  const translationY = useSharedValue(0);
  const savedTranslationX = useSharedValue(0);
  const savedTranslationY = useSharedValue(0);

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(300)
    .onEnd(() => {
      'worklet';
      if (scale.value > 1.2) {
        scale.value = withTiming(1);
        savedScale.value = 1;
        translationX.value = withTiming(0);
        translationY.value = withTiming(0);
        savedTranslationX.value = 0;
        savedTranslationY.value = 0;
      } else {
        scale.value = withTiming(2.5);
        savedScale.value = 2.5;
      }
    });

  const singleTapGesture = Gesture.Tap()
    .numberOfTaps(1)
    .onEnd(() => {
      'worklet';
      runOnJS(onSingleTap)();
    });

  const longPressGesture = Gesture.LongPress()
    .minDuration(400)
    .onStart(() => {
      'worklet';
      runOnJS(onLongPress)(url);
    });

  const pinchGesture = Gesture.Pinch()
    .onUpdate((event) => {
      'worklet';
      scale.value = Math.max(0.8, Math.min(savedScale.value * event.scale, 5));
    })
    .onEnd(() => {
      'worklet';
      if (scale.value < 1.05) {
        scale.value = withTiming(1);
        savedScale.value = 1;
        translationX.value = withTiming(0);
        translationY.value = withTiming(0);
        savedTranslationX.value = 0;
        savedTranslationY.value = 0;
      } else {
        savedScale.value = scale.value;
      }
    });

  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      'worklet';
      if (scale.value > 1.05) {
        translationX.value = savedTranslationX.value + event.translationX;
        translationY.value = savedTranslationY.value + event.translationY;
      } else if (
        isSingle ||
        Math.abs(event.translationY) > Math.abs(event.translationX) * 1.5
      ) {
        translationY.value = event.translationY;
      }
    })
    .onEnd((event) => {
      'worklet';
      if (scale.value > 1.05) {
        savedTranslationX.value = translationX.value;
        savedTranslationY.value = translationY.value;
      } else {
        if (
          Math.abs(event.translationY) > 120 ||
          Math.abs(event.velocityY) > 800
        ) {
          runOnJS(onDismiss)();
        } else {
          translationY.value = withSpring(0);
        }
      }
    });

  const composedGesture = Gesture.Simultaneous(
    longPressGesture,
    pinchGesture,
    panGesture,
    Gesture.Exclusive(doubleTapGesture, singleTapGesture),
  );

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateX: translationX.value },
        { translateY: translationY.value },
        { scale: scale.value },
      ],
    };
  });

  const targetUrl = getOriginalImageUrl(url, originalUrl);
  const imageSource = getCachedImageSource(targetUrl) ?? { uri: targetUrl };

  // Long image detection: when height/width > 2.0 or > screen aspect ratio, use texture-tiled viewer!
  const isLongImage = Boolean(
    aspectRatio && (aspectRatio > 2.0 || aspectRatio > height / width),
  );

  if (isLongImage) {
    return (
      <LongImageWebView
        url={url}
        originalUrl={originalUrl}
        width={width}
        height={height}
        onSingleTap={onSingleTap}
        onLongPress={onLongPress}
      />
    );
  }

  return (
    <GestureDetector gesture={composedGesture}>
      <Animated.View
        style={[styles.imageWrapper, { width, height }, animatedStyle]}
      >
        <Image
          source={imageSource}
          resizeMode="contain"
          resizeMethod="scale"
          style={{ width, height }}
          accessibilityLabel="预览图片"
          testID="preview-image"
          onLoad={(event) => {
            const { width: w, height: h } = event.nativeEvent.source;
            if (w > 0 && h > 0 && aspectRatio === null) {
              setAspectRatio(h / w);
            }
          }}
        />
      </Animated.View>
    </GestureDetector>
  );
};

export const ImagePreviewModal: React.FC<ImagePreviewModalProps> = ({
  visible,
  imageUrls,
  originalUrls,
  imageItems,
  initialIndex = 0,
  onClose,
}) => {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const clampedInitial = Math.max(
    0,
    Math.min(initialIndex, imageUrls.length - 1),
  );
  const [currentIndex, setCurrentIndex] = useState(clampedInitial);
  const [sheetUrl, setSheetUrl] = useState<string | null>(null);
  const [headerVisible, setHeaderVisible] = useState(true);
  const flatListRef = useRef<FlatList<string>>(null);

  useEffect(() => {
    if (visible) {
      const target = Math.max(0, Math.min(initialIndex, imageUrls.length - 1));
      setCurrentIndex(target);
      setHeaderVisible(true);
      setSheetUrl(null);
    }
  }, [visible, initialIndex, imageUrls.length]);

  const handleSingleTap = useCallback(() => {
    setHeaderVisible((prev) => !prev);
  }, []);

  const handleLongPress = useCallback((url: string) => {
    setSheetUrl(url);
  }, []);

  if (!visible || imageUrls.length === 0) {
    return null;
  }

  const getItemMeta = (url: string, index: number) => {
    const matched =
      imageItems?.find((it) => it.url === url || it.originalUrl === url) ??
      imageItems?.[index];
    return {
      initialWidth: matched?.width,
      initialHeight: matched?.height,
      originalUrl: matched?.originalUrl ?? originalUrls?.[index],
    };
  };

  const displayedIndex = Math.max(
    0,
    Math.min(currentIndex, imageUrls.length - 1),
  );
  const currentUrl = imageUrls[displayedIndex];
  const currentMeta = getItemMeta(currentUrl, displayedIndex);
  const currentOriginal = getOriginalImageUrl(
    currentUrl,
    currentMeta.originalUrl,
  );
  const isSingle = imageUrls.length <= 1;

  return (
    <PaneModal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent={true}
    >
      <GestureHandlerRootView
        style={styles.container}
        testID="image-preview-modal"
      >
        {/* 背景遮罩 */}
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <View style={[StyleSheet.absoluteFill, styles.backdrop]} />
        </View>

        {/* 图片内容区域 */}
        {isSingle ? (
          <ZoomableImageItem
            url={currentUrl}
            originalUrl={currentMeta.originalUrl}
            initialWidth={currentMeta.initialWidth}
            initialHeight={currentMeta.initialHeight}
            width={width}
            height={height}
            isSingle={true}
            onSingleTap={handleSingleTap}
            onLongPress={handleLongPress}
            onDismiss={onClose}
          />
        ) : (
          <FlatList
            ref={flatListRef}
            data={imageUrls}
            keyExtractor={(item, index) => `${item}:${index}`}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={clampedInitial}
            getItemLayout={(_, index) => ({
              length: width,
              offset: width * index,
              index,
            })}
            onMomentumScrollEnd={(event) => {
              const offsetX = event.nativeEvent.contentOffset.x;
              const nextIndex = Math.round(offsetX / width);
              if (nextIndex >= 0 && nextIndex < imageUrls.length) {
                setCurrentIndex(nextIndex);
              }
            }}
            renderItem={({ item, index }) => {
              const meta = getItemMeta(item, index);
              return (
                <ZoomableImageItem
                  url={item}
                  originalUrl={meta.originalUrl}
                  initialWidth={meta.initialWidth}
                  initialHeight={meta.initialHeight}
                  width={width}
                  height={height}
                  isSingle={false}
                  onSingleTap={handleSingleTap}
                  onLongPress={handleLongPress}
                  onDismiss={onClose}
                />
              );
            }}
          />
        )}

        {/* 顶栏控制条 */}
        {headerVisible && (
          <View
            style={[
              styles.headerBar,
              {
                top: Math.max(insets.top, Platform.OS === 'android' ? 24 : 10),
              },
            ]}
            pointerEvents="box-none"
          >
            <BouncyButton
              onPress={onClose}
              style={styles.iconBtn}
              hitSlop={12}
              testID="preview-close-button"
            >
              <Ionicons name="close" size={24} color="#FFFFFF" />
            </BouncyButton>

            {!isSingle && (
              <Text
                style={styles.pageIndicator}
                testID="preview-page-indicator"
              >
                {displayedIndex + 1} / {imageUrls.length}
              </Text>
            )}

            <View style={styles.rightActions}>
              <BouncyButton
                onPress={() => saveImageToGallery(currentOriginal)}
                style={styles.iconBtn}
                hitSlop={12}
                testID="preview-download-button"
              >
                <Ionicons name="download-outline" size={22} color="#FFFFFF" />
              </BouncyButton>
            </View>
          </View>
        )}

        {/* 长按底部 Action Sheet 弹窗：在 modal 内部呈现，关闭时不影响底部的预览 */}
        <ImageActionBottomSheet
          visible={Boolean(sheetUrl)}
          imageUrl={sheetUrl}
          onClose={() => setSheetUrl(null)}
        />
      </GestureHandlerRootView>
    </PaneModal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  backdrop: {
    backgroundColor: '#000000',
  },
  imageWrapper: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 20,
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
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rightActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pageIndicator: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    overflow: 'hidden',
  },
});
