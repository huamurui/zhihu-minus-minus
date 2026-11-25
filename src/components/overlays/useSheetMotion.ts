import {
  useCallback,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  type LayoutChangeEvent,
  Platform,
  useWindowDimensions,
} from 'react-native';
import {
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

// Reanimated's spring and timing animations follow the system reduce-motion setting.
const settle = { damping: 26, stiffness: 360, mass: 0.8 };

export function useSheetMotion({
  visible,
  dismissible,
  onClose,
}: {
  visible: boolean;
  dismissible: boolean;
  onClose: () => void;
}) {
  const { height: windowHeight } = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  const presentation = useRef({
    id: 0,
    mounted: visible,
    closing: false,
    notifyOnDismiss: false,
  });
  const callbacks = useRef({ dismissible, onClose });
  useLayoutEffect(() => {
    callbacks.current = { dismissible, onClose };
  }, [dismissible, onClose]);

  // 0 is fully open, 1 puts the entire measured sheet below the viewport.
  const position = useSharedValue(1);
  const measuredHeight = useSharedValue(0);
  const dragOrigin = useSharedValue(-1);
  const exiting = useSharedValue(false);
  const presentationId = useSharedValue(0);

  const finishClose = useCallback((id: number, notify: boolean) => {
    const current = presentation.current;
    if (current.id !== id || !current.mounted || !current.closing) return;
    current.mounted = false;
    current.notifyOnDismiss = notify && Platform.OS === 'ios';
    setMounted(false);
    if (notify && Platform.OS !== 'ios') callbacks.current.onClose();
  }, []);

  const close = useCallback(
    (notify: boolean, gestureId?: number) => {
      const current = presentation.current;
      if (
        !current.mounted ||
        current.closing ||
        (gestureId !== undefined && gestureId !== current.id)
      )
        return;
      if (notify && !callbacks.current.dismissible) {
        if (gestureId !== undefined) {
          exiting.value = false;
          position.value = withSpring(0, settle);
        }
        return;
      }
      current.closing = true;
      const id = current.id;
      exiting.value = true;
      dragOrigin.value = -1;
      position.value = withTiming(1, { duration: 180 }, (finished) => {
        if (finished) runOnJS(finishClose)(id, notify);
      });
    },
    [dragOrigin, exiting, finishClose, position],
  );
  const requestClose = useCallback(() => close(true), [close]);
  const onDismiss = useCallback(() => {
    const current = presentation.current;
    if (!current.notifyOnDismiss) return;
    current.notifyOnDismiss = false;
    callbacks.current.onClose();
  }, []);

  const changeVisibility = useEffectEvent((show: boolean) => {
    if (!show) {
      close(false);
      return;
    }
    const current = presentation.current;
    current.id += 1;
    current.closing = false;
    current.notifyOnDismiss = false;
    current.mounted = true;
    presentationId.value = current.id;
    exiting.value = false;
    dragOrigin.value = -1;
    setMounted(true);
    position.value = withSpring(0, settle);
  });
  useLayoutEffect(() => {
    changeVisibility(visible);
  }, [visible]);
  useLayoutEffect(
    () => () => {
      presentation.current.id += 1;
      presentation.current.mounted = false;
      presentation.current.notifyOnDismiss = false;
    },
    [],
  );

  const onLayout = useCallback(
    ({ nativeEvent }: LayoutChangeEvent) => {
      const { height } = nativeEvent.layout;
      if (height > 0 && Number.isFinite(height)) measuredHeight.value = height;
    },
    [measuredHeight],
  );

  const beginDrag = useCallback(() => {
    'worklet';
    if (exiting.value) return;
    cancelAnimation(position);
    dragOrigin.value = Math.max(0, position.value);
  }, [dragOrigin, exiting, position]);

  const updateDrag = useCallback(
    (distance: number) => {
      'worklet';
      if (dragOrigin.value < 0 || exiting.value) return;
      const height = measuredHeight.value || Math.max(1, windowHeight);
      position.value = Math.max(
        0,
        Math.min(1, dragOrigin.value + distance / height),
      );
    },
    [dragOrigin, exiting, measuredHeight, position, windowHeight],
  );

  const cancelDrag = useCallback(() => {
    'worklet';
    if (dragOrigin.value < 0 || exiting.value) return;
    dragOrigin.value = -1;
    position.value = withSpring(0, settle);
  }, [dragOrigin, exiting, position]);

  const endDrag = useCallback(
    (distance: number, velocity: number) => {
      'worklet';
      if (dragOrigin.value < 0 || exiting.value) return;
      updateDrag(distance);
      const height = measuredHeight.value || Math.max(1, windowHeight);
      const threshold = Math.min(112, Math.max(40, height * 0.25));
      if (distance >= threshold || (distance > 8 && velocity > 850)) {
        dragOrigin.value = -1;
        exiting.value = true;
        runOnJS(close)(true, presentationId.value);
      } else {
        cancelDrag();
      }
    },
    [
      cancelDrag,
      close,
      dragOrigin,
      exiting,
      measuredHeight,
      presentationId,
      updateDrag,
      windowHeight,
    ],
  );

  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    // Anchor the small spring overshoot to the bottom edge, including the safe area.
    transformOrigin: '50% 100%',
    transform: [
      {
        translateY:
          Math.max(0, position.value) * (measuredHeight.value || windowHeight),
      },
      { scaleY: 1 - Math.min(0, Math.max(-0.025, position.value)) },
    ],
  }));
  const backdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: Math.max(0, Math.min(1, 1 - position.value)),
  }));

  return {
    mounted,
    requestClose,
    onDismiss,
    onLayout,
    sheetAnimatedStyle,
    backdropAnimatedStyle,
    beginDrag,
    updateDrag,
    endDrag,
    cancelDrag,
  };
}
