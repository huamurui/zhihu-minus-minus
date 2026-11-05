import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Image,
  type ImageProps,
  Platform,
  StyleSheet,
  View,
} from 'react-native';
import { getCachedImageSource } from '@/utils/imageSource';

type ProfileImageProps = {
  uri: string;
  style: ImageProps['style'];
  resizeMode?: ImageProps['resizeMode'];
  onError?: (
    event: Parameters<NonNullable<ImageProps['onError']>>[0],
    hasPrevious: boolean,
  ) => void;
};

/** Keep the old profile image visible until its replacement is ready. */
export function ProfileImage({
  uri,
  style,
  resizeMode,
  onError,
}: ProfileImageProps) {
  const source = useMemo(() => getCachedImageSource(uri), [uri]);
  if (Platform.OS !== 'android') {
    return (
      <Image
        style={style}
        resizeMode={resizeMode}
        onError={(event) => onError?.(event, false)}
        source={source}
        fadeDuration={0}
      />
    );
  }
  return (
    <AndroidProfileImage
      uri={uri}
      style={style}
      resizeMode={resizeMode}
      onError={onError}
    />
  );
}

function AndroidProfileImage({
  uri,
  style,
  resizeMode,
  onError,
}: ProfileImageProps) {
  const [displayedUri, setDisplayedUri] = useState<string | null>(null);
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const fade = useRef(new Animated.Value(0)).current;
  const latestUri = useRef(uri);
  latestUri.current = uri;
  const startedUri = useRef<string | null>(null);
  // Avoid an animation before the system accessibility preference is known.
  const reduceMotion = useRef(true);

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) reduceMotion.current = enabled;
    });
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      (enabled) => {
        reduceMotion.current = enabled;
        if (enabled && startedUri.current === latestUri.current) {
          fade.stopAnimation();
          fade.setValue(1);
          setDisplayedUri(latestUri.current);
        }
      },
    );
    return () => {
      mounted = false;
      subscription.remove();
      fade.stopAnimation();
    };
  }, [fade]);

  useLayoutEffect(() => {
    latestUri.current = uri;
    setFailedUri(null);
    fade.stopAnimation();
    fade.setValue(0);
    startedUri.current = null;
  }, [fade, uri]);

  const pendingUri = uri !== displayedUri && uri !== failedUri ? uri : null;
  const images = [displayedUri, pendingUri].filter(
    (item): item is string => item !== null,
  );
  return (
    <View style={style} pointerEvents="none">
      {images.map((imageUri) => {
        const pending = imageUri === pendingUri;
        return (
          <Animated.Image
            key={imageUri}
            source={getCachedImageSource(imageUri)}
            resizeMode={resizeMode}
            fadeDuration={0}
            style={[
              StyleSheet.absoluteFill,
              pending ? { opacity: fade } : null,
            ]}
            onLoad={() => {
              if (
                !pending ||
                latestUri.current !== imageUri ||
                startedUri.current === imageUri
              )
                return;
              startedUri.current = imageUri;
              if (reduceMotion.current) {
                fade.setValue(1);
                setDisplayedUri(imageUri);
                return;
              }
              Animated.timing(fade, {
                toValue: 1,
                duration: 160,
                useNativeDriver: true,
              }).start(({ finished }) => {
                if (finished && latestUri.current === imageUri)
                  setDisplayedUri(imageUri);
              });
            }}
            onError={(event) => {
              if (pending && latestUri.current === imageUri) {
                setFailedUri(imageUri);
                onError?.(event, displayedUri !== null);
              }
            }}
          />
        );
      })}
    </View>
  );
}
