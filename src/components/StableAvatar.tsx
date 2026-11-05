import React, { useEffect, useMemo, useState } from 'react';
import { Image, type ImageProps, StyleSheet, View } from 'react-native';
import { getCachedImageSource } from '@/utils/imageSource';

interface StableAvatarProps {
  uri?: string | null;
  className?: string;
  style?: ImageProps['style'];
}

/** Keep avatars stable during updates and reuse cached bytes after remounting. */
export const StableAvatar = React.memo(
  ({ uri, className, style }: StableAvatarProps) => {
    const source = useMemo(() => getCachedImageSource(uri), [uri]);

    return (
      <Image
        source={source}
        className={className}
        style={style}
        fadeDuration={0}
      />
    );
  },
  (previous, next) =>
    previous.uri === next.uri &&
    previous.className === next.className &&
    previous.style === next.style,
);

StableAvatar.displayName = 'StableAvatar';

/** Keep the displayed image underneath a replacement until it has loaded. */
export function RetainedAvatar({
  uri,
  ownerId,
  className,
  style,
}: StableAvatarProps & { ownerId?: string | null }) {
  const [images, setImages] = useState<{
    current: string | null;
    pending: string | null;
    ownerId: string | null;
  }>(() => ({ current: uri || null, pending: null, ownerId: ownerId || null }));

  const ownerChanged = Boolean(
    images.ownerId && ownerId && images.ownerId !== ownerId,
  );
  const visibleImages = ownerChanged
    ? [uri || null, null]
    : [images.current, images.pending];

  useEffect(() => {
    setImages((previous) => {
      const next = uri || null;
      const owner = ownerId || previous.ownerId;
      if (previous.ownerId && ownerId && previous.ownerId !== ownerId) {
        return { current: next, pending: null, ownerId };
      }
      if (!next || next === previous.current) {
        return previous.pending || owner !== previous.ownerId
          ? { ...previous, pending: null, ownerId: owner }
          : previous;
      }
      if (!previous.current)
        return { current: next, pending: null, ownerId: owner };
      return previous.pending === next && owner === previous.ownerId
        ? previous
        : { ...previous, pending: next, ownerId: owner };
    });
  }, [uri, ownerId]);

  return (
    <View className={className} style={[style, styles.clip]}>
      {visibleImages.map((imageUri) =>
        imageUri ? (
          <Image
            key={imageUri}
            source={getCachedImageSource(imageUri)}
            style={StyleSheet.absoluteFill}
            fadeDuration={0}
            onLoad={() =>
              setImages((previous) =>
                previous.pending === imageUri
                  ? { ...previous, current: imageUri, pending: null }
                  : previous,
              )
            }
            onError={() =>
              setImages((previous) =>
                previous.pending === imageUri
                  ? { ...previous, pending: null }
                  : previous,
              )
            }
          />
        ) : null,
      )}
    </View>
  );
}

const styles = StyleSheet.create({ clip: { overflow: 'hidden' } });
