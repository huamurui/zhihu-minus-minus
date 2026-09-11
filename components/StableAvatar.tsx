import React, { useMemo } from 'react';
import { Image, type ImageProps } from 'react-native';

interface StableAvatarProps {
  uri?: string | null;
  className?: string;
  style?: ImageProps['style'];
}

/** Keep an unchanged native image source stable during content completion. */
export const StableAvatar = React.memo(
  ({ uri, className, style }: StableAvatarProps) => {
    const source = useMemo(() => (uri ? { uri } : undefined), [uri]);

    return <Image source={source} className={className} style={style} />;
  },
  (previous, next) =>
    previous.uri === next.uri &&
    previous.className === next.className &&
    previous.style === next.style,
);

StableAvatar.displayName = 'StableAvatar';
