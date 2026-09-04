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
  Animated,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  type StyleProp,
  StyleSheet,
  useWindowDimensions,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
    const translateY = useRef(new Animated.Value(windowHeight)).current;
    const backdropOpacity = useRef(new Animated.Value(0)).current;
    const closing = useRef(false);

    useEffect(() => {
      onCloseRef.current = onClose;
    }, [onClose]);

    const animateClosed = useCallback(
      (notify: boolean) => {
        if (closing.current) return;
        closing.current = true;
        Animated.parallel([
          Animated.timing(backdropOpacity, {
            toValue: 0,
            duration: EXIT_DURATION,
            useNativeDriver: true,
          }),
          Animated.timing(translateY, {
            toValue: windowHeight,
            duration: EXIT_DURATION,
            useNativeDriver: true,
          }),
        ]).start(({ finished }) => {
          closing.current = false;
          if (!finished) return;
          mountedRef.current = false;
          setMounted(false);
          if (notify) onCloseRef.current();
        });
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
        translateY.stopAnimation();
        backdropOpacity.stopAnimation();
        translateY.setValue(windowHeight);
        backdropOpacity.setValue(0);
        Animated.parallel([
          Animated.spring(translateY, {
            toValue: 0,
            damping: 26,
            stiffness: 260,
            mass: 0.8,
            useNativeDriver: true,
          }),
          Animated.timing(backdropOpacity, {
            toValue: 1,
            duration: ENTER_DURATION,
            useNativeDriver: true,
          }),
        ]).start();
      } else if (mountedRef.current) {
        animateClosed(false);
      }
    }, [animateClosed, backdropOpacity, translateY, visible, windowHeight]);

    const panResponder = useMemo(
      () =>
        PanResponder.create({
          onMoveShouldSetPanResponder: (_, gesture) =>
            dismissible &&
            gesture.dy > 5 &&
            Math.abs(gesture.dy) > Math.abs(gesture.dx),
          onPanResponderMove: (_, gesture) => {
            const distance = Math.max(0, gesture.dy);
            translateY.setValue(distance);
            backdropOpacity.setValue(
              Math.max(0.25, 1 - distance / Math.max(windowHeight * 0.55, 1)),
            );
          },
          onPanResponderRelease: (_, gesture) => {
            if (gesture.dy > 84 || gesture.vy > 0.9) {
              requestClose();
              return;
            }
            Animated.parallel([
              Animated.spring(translateY, {
                toValue: 0,
                damping: 24,
                stiffness: 300,
                useNativeDriver: true,
              }),
              Animated.timing(backdropOpacity, {
                toValue: 1,
                duration: 140,
                useNativeDriver: true,
              }),
            ]).start();
          },
          onPanResponderTerminate: () => {
            Animated.spring(translateY, {
              toValue: 0,
              damping: 24,
              stiffness: 300,
              useNativeDriver: true,
            }).start();
            Animated.timing(backdropOpacity, {
              toValue: 1,
              duration: 140,
              useNativeDriver: true,
            }).start();
          },
        }),
      [backdropOpacity, dismissible, requestClose, translateY, windowHeight],
    );

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
          <Animated.View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFillObject,
              {
                backgroundColor: Colors[colorScheme].blackTransparent,
                opacity: backdropOpacity,
              },
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
          <Animated.View
            accessibilityViewIsModal
            style={[
              styles.sheet,
              {
                backgroundColor: surfaceColor,
                height,
                maxHeight,
                paddingBottom: Math.max(insets.bottom, 12) + 8,
                transform: [{ translateY }],
              },
              contentStyle,
            ]}
          >
            {showHandle && (
              <View style={styles.handleHitArea} {...panResponder.panHandlers}>
                <View
                  style={[styles.handle, { backgroundColor: handleColor }]}
                />
              </View>
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
                    <Pressable
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
                    </Pressable>
                  </View>
                ) : (
                  <View style={styles.headerSide} />
                )}
              </View>
            )}

            {children}
          </Animated.View>
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
