import { useCallback, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedProps,
  useAnimatedStyle,
  useEvent,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import {
  type PullRefreshNativeEvent,
  PullRefreshNativeView,
} from '@/modules/zhihu-pull-refresh';
import { useSettingsStore } from '@/store/useSettingsStore';
import type { PullToRefreshProps } from './PullToRefresh.types';

const INDICATOR_SIZE = 38;
const INDICATOR_STROKE_WIDTH = 3;
const INDICATOR_RADIUS = (INDICATOR_SIZE - INDICATOR_STROKE_WIDTH) / 2;
const INDICATOR_CIRCUMFERENCE = 2 * Math.PI * INDICATOR_RADIUS;

const PULL_THRESHOLD = 76;
const MAX_PULL_DISTANCE = 128;
const REFRESH_HOLD_DISTANCE = 68;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPullRefreshNativeView = Animated.createAnimatedComponent(
  PullRefreshNativeView,
);

function clamp(value: number, min: number, max: number) {
  'worklet';
  return Math.min(max, Math.max(min, value));
}

export function PullToRefresh({
  children,
  enabled = true,
  indicatorTop,
  onRefresh,
  refreshing,
  backgroundColor,
  indicatorColor,
  indicatorTrackColor,
}: PullToRefreshProps) {
  const hapticsEnabled = useSettingsStore(
    (state) => state.enableHapticFeedback,
  );
  const pullDistance = useSharedValue(0);
  const refreshingValue = useSharedValue(refreshing);
  const refreshRotation = useSharedValue(0);

  useEffect(() => {
    refreshingValue.value = refreshing;
    if (refreshing) {
      refreshRotation.value = 0;
      refreshRotation.value = withRepeat(
        withTiming(360, {
          duration: 850,
          easing: Easing.linear,
        }),
        -1,
        false,
      );
      return;
    }

    cancelAnimation(refreshRotation);
    refreshRotation.value = 0;
  }, [refreshRotation, refreshing, refreshingValue]);

  const pullHandler = useEvent<PullRefreshNativeEvent>(
    (event) => {
      'worklet';
      if (!event.eventName.endsWith('onPull')) return;
      pullDistance.value = event.offset;
    },
    ['onPull'],
  );

  const handleRefreshTriggered = useCallback(() => {
    void onRefresh();
  }, [onRefresh]);

  const indicatorStyle = useAnimatedStyle(() => {
    const progress = clamp(pullDistance.value / PULL_THRESHOLD, 0, 1);
    return {
      opacity: refreshingValue.value
        ? 1
        : interpolate(progress, [0, 0.12, 1], [0, 0.55, 1]),
      transform: [
        { scale: refreshingValue.value ? 1 : 0.8 + progress * 0.2 },
        { rotate: `${refreshingValue.value ? refreshRotation.value : -90}deg` },
      ],
    };
  });

  const progressCircleProps = useAnimatedProps(() => {
    const progress = clamp(pullDistance.value / PULL_THRESHOLD, 0, 1);
    return {
      opacity: refreshingValue.value ? 0 : 1,
      strokeDashoffset: INDICATOR_CIRCUMFERENCE * (1 - progress),
    };
  });

  const trackCircleProps = useAnimatedProps(() => ({
    opacity: refreshingValue.value ? 0 : 1,
  }));

  const refreshingCircleProps = useAnimatedProps(() => ({
    opacity: refreshingValue.value ? 1 : 0,
    strokeDashoffset: INDICATOR_CIRCUMFERENCE * 0.24,
  }));

  return (
    <View style={[styles.root, { backgroundColor }]}>
      <Animated.View
        pointerEvents="none"
        style={[styles.indicator, { top: indicatorTop }, indicatorStyle]}
      >
        <Svg width={INDICATOR_SIZE} height={INDICATOR_SIZE}>
          <AnimatedCircle
            animatedProps={trackCircleProps}
            cx={INDICATOR_SIZE / 2}
            cy={INDICATOR_SIZE / 2}
            r={INDICATOR_RADIUS}
            fill="none"
            stroke={indicatorTrackColor}
            strokeWidth={INDICATOR_STROKE_WIDTH}
          />
          <AnimatedCircle
            animatedProps={progressCircleProps}
            cx={INDICATOR_SIZE / 2}
            cy={INDICATOR_SIZE / 2}
            r={INDICATOR_RADIUS}
            fill="none"
            stroke={indicatorColor}
            strokeDasharray={[INDICATOR_CIRCUMFERENCE, INDICATOR_CIRCUMFERENCE]}
            strokeLinecap="round"
            strokeWidth={INDICATOR_STROKE_WIDTH}
          />
          <AnimatedCircle
            animatedProps={refreshingCircleProps}
            cx={INDICATOR_SIZE / 2}
            cy={INDICATOR_SIZE / 2}
            r={INDICATOR_RADIUS}
            fill="none"
            stroke={indicatorColor}
            strokeDasharray={[INDICATOR_CIRCUMFERENCE, INDICATOR_CIRCUMFERENCE]}
            strokeLinecap="round"
            strokeWidth={INDICATOR_STROKE_WIDTH}
          />
        </Svg>
      </Animated.View>

      <AnimatedPullRefreshNativeView
        enabled={enabled}
        hapticsEnabled={hapticsEnabled}
        holdDistance={REFRESH_HOLD_DISTANCE}
        maxPullDistance={MAX_PULL_DISTANCE}
        onPull={pullHandler}
        onRefreshTriggered={handleRefreshTriggered}
        refreshing={refreshing}
        style={[styles.content, { backgroundColor }]}
        threshold={PULL_THRESHOLD}
      >
        <View collapsable={false} style={styles.content}>
          {children}
        </View>
      </AnimatedPullRefreshNativeView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    overflow: 'hidden',
  },
  content: {
    flex: 1,
  },
  indicator: {
    position: 'absolute',
    alignSelf: 'center',
    width: INDICATOR_SIZE,
    height: INDICATOR_SIZE,
    zIndex: 2,
  },
});
