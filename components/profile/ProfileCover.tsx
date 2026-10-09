import { LinearGradient } from 'expo-linear-gradient';
import { useMemo, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Reanimated, {
  type SharedValue,
  useAnimatedStyle,
  useDerivedValue,
} from 'react-native-reanimated';
import { useRuntimeThemeColors } from '@/components/Themed';
import { getCachedImageSource } from '@/utils/imageSource';
import {
  getProfileCoverState,
  PROFILE_COVER_SCROLL_DISTANCE,
} from '@/utils/profileScroll';

interface ProfileCoverProps {
  coverUrl?: string;
  height: number;
  blurOpacity?: SharedValue<number>;
}

/** Both copies retain the full image dimensions so their crops stay aligned. */
export function ProfileCover({
  coverUrl,
  height,
  blurOpacity,
}: ProfileCoverProps) {
  const colors = useRuntimeThemeColors();
  const url = coverUrl?.trim();
  const [failedCover, setFailedCover] = useState<string | null>(null);
  const [failedBlur, setFailedBlur] = useState<string | null>(null);
  const source = useMemo(() => getCachedImageSource(url), [url]);
  const showCover = !!url && failedCover !== url;
  const blurredStyle = useAnimatedStyle(() => ({
    opacity: blurOpacity?.value ?? 0,
  }));

  return (
    <View
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.cover,
        { height, backgroundColor: colors.backgroundTertiary },
      ]}
    >
      <LinearGradient
        colors={[
          `${colors.primary}78`,
          `${colors.primary}24`,
          colors.backgroundSecondary,
        ]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.ring, { borderColor: `${colors.primary}30` }]} />
      <View style={[styles.disc, { backgroundColor: `${colors.primary}18` }]} />
      <View style={[styles.line, { backgroundColor: `${colors.primary}20` }]} />
      {showCover && (
        <Image
          source={source}
          resizeMode="cover"
          style={StyleSheet.absoluteFill}
          onError={() => setFailedCover(url)}
        />
      )}
      {showCover && blurOpacity && failedBlur !== url && (
        <Reanimated.View style={[StyleSheet.absoluteFill, blurredStyle]}>
          {/* Keep the blur radius fixed; scrolling only animates opacity. */}
          <Image
            source={source}
            resizeMode="cover"
            blurRadius={20}
            style={StyleSheet.absoluteFill}
            onError={() => setFailedBlur(url)}
          />
        </Reanimated.View>
      )}
    </View>
  );
}

interface ProfileToolbarBackgroundProps {
  coverUrl?: string;
  navigationHeight: number;
  headerOffset: SharedValue<number>;
}

export function ProfileToolbarBackground({
  coverUrl,
  navigationHeight,
  headerOffset,
}: ProfileToolbarBackgroundProps) {
  const colors = useRuntimeThemeColors();
  const coverState = useDerivedValue(() =>
    getProfileCoverState(headerOffset.value),
  );
  const blurOpacity = useDerivedValue(() => coverState.value.blurOpacity);
  const imageStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: coverState.value.translateY }],
  }));
  const scrimStyle = useAnimatedStyle(() => ({
    opacity: coverState.value.blurOpacity,
  }));

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[StyleSheet.absoluteFill, styles.cover]}
    >
      <Reanimated.View style={imageStyle}>
        <ProfileCover
          coverUrl={coverUrl}
          height={navigationHeight + PROFILE_COVER_SCROLL_DISTANCE}
          blurOpacity={blurOpacity}
        />
      </Reanimated.View>
      <Reanimated.View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: `${colors.background}CC`,
            borderBottomColor: colors.border,
            borderBottomWidth: StyleSheet.hairlineWidth,
          },
          scrimStyle,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  cover: { overflow: 'hidden' },
  ring: {
    position: 'absolute',
    width: 250,
    height: 250,
    borderRadius: 125,
    borderWidth: 36,
    right: -60,
    top: -58,
  },
  disc: {
    position: 'absolute',
    width: 150,
    height: 150,
    borderRadius: 75,
    left: -28,
    bottom: -110,
  },
  line: {
    position: 'absolute',
    height: 1,
    width: '120%',
    left: -30,
    bottom: 50,
    transform: [{ rotate: '-14deg' }],
  },
});
