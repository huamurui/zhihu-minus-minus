import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { type ComponentRef, type RefObject, useState } from 'react';
import { Image, Platform, StyleSheet, View } from 'react-native';
import { useColorScheme } from '@/components/useColorScheme';
import { withAlpha } from '@/utils/colorContrast';
import { getCachedImageSource } from '@/utils/imageSource';

interface MyProfileBackdropProps {
  coverUrl?: string;
  blurTarget: RefObject<ComponentRef<typeof View> | null>;
  backgroundColor: string;
}

function BlurredCover({ uri }: { uri: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;

  return (
    <Image
      source={getCachedImageSource(uri)}
      blurRadius={24}
      resizeMode="cover"
      fadeDuration={0}
      style={styles.cover}
      onError={() => setFailed(true)}
    />
  );
}

export function MyProfileBackdrop({
  coverUrl,
  blurTarget,
  backgroundColor,
}: MyProfileBackdropProps) {
  const scheme = useColorScheme();
  const uri = typeof coverUrl === 'string' ? coverUrl.trim() : undefined;
  const fadeColors = [
    withAlpha(backgroundColor, 0),
    withAlpha(backgroundColor, 0.16),
    withAlpha(backgroundColor, 0.5),
    withAlpha(backgroundColor, 0.84),
    backgroundColor,
  ] as const;
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={StyleSheet.absoluteFill}
    >
      <View style={styles.blurRegion}>
        {(Platform.OS !== 'android' || blurTarget.current !== null) && (
          <BlurView
            blurMethod="dimezisBlurView"
            blurTarget={blurTarget}
            intensity={48}
            tint={scheme}
            style={StyleSheet.absoluteFill}
          />
        )}
        {uri ? <BlurredCover key={uri} uri={uri} /> : null}
        <View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: withAlpha(backgroundColor, 0.55) },
          ]}
        />
        {/* UIKit backdrop blur needs an unmasked ancestor. Blend to the same
            theme color on both sides of its edge, then feather into the list. */}
        <LinearGradient colors={fadeColors} style={styles.blend} />
      </View>
      <LinearGradient
        colors={fadeColors}
        start={{ x: 0, y: 1 }}
        end={{ x: 0, y: 0 }}
        style={styles.tail}
      />
    </View>
  );
}

const TAIL_HEIGHT = 44;
const styles = StyleSheet.create({
  blurRegion: { ...StyleSheet.absoluteFill, bottom: TAIL_HEIGHT },
  cover: { ...StyleSheet.absoluteFill, opacity: 0.8 },
  blend: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 96 },
  tail: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: TAIL_HEIGHT,
  },
});
