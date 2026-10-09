import React, { useMemo } from 'react';
import { Image, type ImageProps } from 'react-native';
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

    return <Image source={source} className={className} style={style} />;
  },
  (previous, next) =>
    previous.uri === next.uri &&
    previous.className === next.className &&
    previous.style === next.style,
);

StableAvatar.displayName = 'StableAvatar';
