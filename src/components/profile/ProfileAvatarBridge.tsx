import { useLayoutEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { useAnimatedProps } from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';
import { create } from 'zustand';
import {
  getProfileAvatarBridge,
  type ProfileAvatarBridgeFrame,
} from './profileAvatarBridgeGeometry';

type Motion = {
  readonly value: {
    bridge: ProfileAvatarBridgeFrame | null;
    darkness: number;
  };
};

// Register only while the profile owns the full viewport. Scrolling updates
// the shared value on the UI thread without going through the store.
const useActiveInk = create<{ motion: Motion | null }>(() => ({
  motion: null,
}));

export function useProfileAvatarInk(motion: Motion | null) {
  useLayoutEffect(() => {
    if (!motion) return;
    useActiveInk.setState({ motion });
    return () => {
      if (useActiveInk.getState().motion === motion)
        useActiveInk.setState({ motion: null });
    };
  }, [motion]);
}

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

function AvatarInk({ motion }: { motion: Motion }) {
  const bridge = useAnimatedProps(() =>
    getProfileAvatarBridge(motion.value.bridge),
  );
  const tint = useAnimatedProps(() => {
    const { bridge: frame, darkness } = motion.value;
    return {
      cx: frame?.avatar.cx ?? 0,
      cy: frame?.avatar.cy ?? 0,
      r: frame?.avatar.r ?? 0,
      opacity: darkness,
    };
  });
  return (
    <Svg
      width="100%"
      height="100%"
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      accessible={false}
    >
      <AnimatedPath fill="black" animatedProps={bridge} />
      <AnimatedCircle fill="black" animatedProps={tint} />
    </Svg>
  );
}

/** Ink must sit above the status-bar blur to meet the black hardware edge. */
export function ProfileAvatarBridgeOverlay() {
  const motion = useActiveInk((s) => s.motion);
  return motion ? <AvatarInk motion={motion} /> : null;
}
