import { Ionicons } from '@expo/vector-icons';
import type React from 'react';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  type StyleProp,
  StyleSheet,
  useWindowDimensions,
  type ViewStyle,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BouncyButton } from '@/components/BouncyButton';
import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';

export interface BottomSheetHandle {
  close: () => void;
}

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  headerLeft?: React.ReactNode;
  headerRight?: React.ReactNode;
  height?: ViewStyle['height'];
  maxHeight?: ViewStyle['maxHeight'];
  contentStyle?: StyleProp<ViewStyle>;
  dismissible?: boolean;
  keyboardAvoiding?: boolean;
  showHandle?: boolean;
}

const ENTER_DURATION = 220;
const EXIT_DURATION = 180;

export const BottomSheet = forwardRef<BottomSheetHandle, BottomSheetProps>(
  function BottomSheet(
    {
      visible,
      onClose,
      children,
      title,
      subtitle,
      headerLeft,
      headerRight,
      height,
      maxHeight = '85%',
      contentStyle,
      dismissible = true,
      keyboardAvoiding = false,
      showHandle = true,
    },
    ref,
  ) {
    const colorScheme = useColorScheme();
    const insets = useSafeAreaInsets();
    const { height: windowHeight } = useWindowDimensions();
    const [mounted, setMounted] = useState(visible);
    const mountedRef = useRef(visible);
    const onCloseRef = useRef(onClose);
    const translateY = useSharedValue(windowHeight);
    const backdropOpacity = useSharedValue(0);
    const closing = useRef(false);

    useEffect(() => {
      onCloseRef.current = onClose;
    }, [onClose]);

    const animateClosed = useCallback(
      (notify: boolean) => {
        if (closing.current) return;
        closing.current = true;
        const finishClose = (finished: boolean) => {
          closing.current = false;
          if (!finished) return;
          mountedRef.current = false;
          setMounted(false);
          if (notify) onCloseRef.current();
        };

        backdropOpacity.value = withTiming(0, { duration: EXIT_DURATION });
        translateY.value = withTiming(
          windowHeight,
          { duration: EXIT_DURATION },
          (finished) => {
            runOnJS(finishClose)(Boolean(finished));
          },
        );
      },
      [backdropOpacity, translateY, windowHeight],
    );

    const requestClose = useCallback(() => {
      if (dismissible) animateClosed(true);
    }, [animateClosed, dismissible]);

    useImperativeHandle(ref, () => ({ close: requestClose }), [requestClose]);

    useEffect(() => {
      if (visible) {
        closing.current = false;
        mountedRef.current = true;
        setMounted(true);
        translateY.value = windowHeight;
        backdropOpacity.value = 0;
        translateY.value = withSpring(0, {
          damping: 26,
          stiffness: 260,
          mass: 0.8,
        });
        backdropOpacity.value = withTiming(1, { duration: ENTER_DURATION });
      } else if (mountedRef.current) {
        animateClosed(false);
      }
    }, [animateClosed, backdropOpacity, translateY, visible, windowHeight]);

    const panGesture = useMemo(
      () =>
        Gesture.Pan()
          .enabled(dismissible)
          .activeOffsetY(5)
          .failOffsetX([-12, 12])
          .onUpdate((event) => {
            const distance = Math.max(0, event.translationY);
            translateY.value = distance;
            backdropOpacity.value = Math.max(
              0.25,
              1 - distance / Math.max(windowHeight * 0.55, 1),
            );
          })
          .onEnd((event) => {
            if (event.translationY > 84 || event.velocityY > 900) {
              runOnJS(requestClose)();
              return;
            }
            translateY.value = withSpring(0, {
              damping: 24,
              stiffness: 300,
            });
            backdropOpacity.value = withTiming(1, { duration: 140 });
          })
          .onFinalize((_event, success) => {
            if (!success) {
              translateY.value = withSpring(0, {
                damping: 24,
                stiffness: 300,
              });
              backdropOpacity.value = withTiming(1, { duration: 140 });
            }
          }),
      [backdropOpacity, dismissible, requestClose, translateY, windowHeight],
    );

    const backdropAnimatedStyle = useAnimatedStyle(() => ({
      opacity: backdropOpacity.value,
    }));
    const sheetAnimatedStyle = useAnimatedStyle(() => ({
      transform: [{ translateY: translateY.value }],
    }));

    if (!mounted) return null;

    const surfaceColor = Colors[colorScheme].backgroundSecondary;
    const handleColor =
      colorScheme === 'dark' ? Colors.dark.border : Colors.light.controlBorder;
    const hasHeader = title || subtitle || headerLeft || headerRight;

    return (
      <Modal
        visible={mounted}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={requestClose}
      >
        <KeyboardAvoidingView
          enabled={keyboardAvoiding}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.overlay}
        >
          <Reanimated.View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFillObject,
              {
                backgroundColor: Colors[colorScheme].blackTransparent,
              },
              backdropAnimatedStyle,
            ]}
          />
          {dismissible && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="关闭弹窗"
              style={StyleSheet.absoluteFill}
              onPress={requestClose}
            />
          )}
          <Reanimated.View
            accessibilityViewIsModal
            style={[
              styles.sheet,
              {
                backgroundColor: surfaceColor,
                height,
                maxHeight,
                paddingBottom: Math.max(insets.bottom, 12) + 8,
              },
              sheetAnimatedStyle,
              contentStyle,
            ]}
          >
            {showHandle && (
              <GestureDetector gesture={panGesture}>
                <View style={styles.handleHitArea}>
                  <View
                    style={[styles.handle, { backgroundColor: handleColor }]}
                  />
                </View>
              </GestureDetector>
            )}

            {hasHeader && (
              <View style={styles.header}>
                {headerLeft ? (
                  <View style={styles.headerSide}>{headerLeft}</View>
                ) : (
                  <View style={styles.headerSide} />
                )}
                <View style={styles.headerCopy}>
                  {title ? <Text style={styles.title}>{title}</Text> : null}
                  {subtitle ? (
                    <Text
                      type="secondary"
                      style={styles.subtitle}
                      numberOfLines={2}
                    >
                      {subtitle}
                    </Text>
                  ) : null}
                </View>
                {headerRight ? (
                  <View style={[styles.headerSide, styles.headerRight]}>
                    {headerRight}
                  </View>
                ) : dismissible ? (
                  <View style={[styles.headerSide, styles.headerRight]}>
                    <BouncyButton
                      accessibilityRole="button"
                      accessibilityLabel="关闭"
                      hitSlop={8}
                      onPress={requestClose}
                      style={[
                        styles.closeButton,
                        {
                          backgroundColor:
                            Colors[colorScheme].backgroundTertiary,
                        },
                      ]}
                    >
                      <Ionicons
                        name="close"
                        size={18}
                        color={Colors[colorScheme].textSecondary}
                      />
                    </BouncyButton>
                  </View>
                ) : (
                  <View style={styles.headerSide} />
                )}
              </View>
            )}

            {children}
          </Reanimated.View>
        </KeyboardAvoidingView>
      </Modal>
    );
  },
);

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  sheet: {
    width: '100%',
    maxWidth: 640,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    shadowColor: Colors.light.shadow,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 16,
  },
  handleHitArea: {
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  header: {
    minHeight: 56,
    paddingHorizontal: 20,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerSide: {
    minWidth: 36,
    alignItems: 'flex-start',
  },
  headerRight: {
    alignItems: 'flex-end',
  },
  headerCopy: {
    flex: 1,
    paddingHorizontal: 8,
  },
  title: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
