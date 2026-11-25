import Ionicons from '@expo/vector-icons/Ionicons';
import type React from 'react';
import {
  Fragment,
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
} from 'react';
import {
  KeyboardAvoidingView,
  type ModalProps,
  Platform,
  Pressable,
  type StyleProp,
  StyleSheet,
  type ViewInstance,
  type ViewStyle,
} from 'react-native';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import Reanimated, { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BouncyButton } from '@/components/BouncyButton';
import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { PaneModal } from '@/features/adaptive-layout/PaneModal';

import { SheetScrollContext, SheetScrollView } from './SheetScrollView';
import { attachSheetWebTouch } from './sheetWebTouch';
import { useSheetMotion } from './useSheetMotion';

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
  /** Scroll the header and body together when the keyboard leaves little room. */
  scrollable?: boolean;
  showHandle?: boolean;
}

const DRAG_SLOP = 8;
// An iPhone native modal would otherwise rotate a landscape window to portrait.
const sheetOrientations: ModalProps['supportedOrientations'] = [
  'portrait',
  'portrait-upside-down',
  'landscape',
];

function ScrollableContent({ children }: React.PropsWithChildren) {
  return (
    <SheetScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
      {children}
    </SheetScrollView>
  );
}

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
      scrollable = false,
      showHandle = true,
    },
    ref,
  ) {
    const colorScheme = useColorScheme();
    const insets = useSafeAreaInsets();
    const {
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
    } = useSheetMotion({ visible, dismissible, onClose });
    useImperativeHandle(ref, () => ({ close: requestClose }), [requestClose]);

    const scrollOwnsTouch = useSharedValue(false);
    const webPanelRef = useCallback(
      (node: ViewInstance | null) => {
        if (node instanceof HTMLElement)
          return attachSheetWebTouch(node, () => scrollOwnsTouch.value);
      },
      [scrollOwnsTouch],
    );
    const touchOrigin = useSharedValue<{ x: number; y: number } | null>(null);
    const pan = useMemo(
      () =>
        Gesture.Pan()
          .enabled(dismissible)
          .manualActivation(true)
          .onTouchesDown((event, manager) => {
            const touch = event.allTouches[0];
            if (event.numberOfTouches !== 1 || !touch) {
              touchOrigin.value = null;
              manager.fail();
              return;
            }
            touchOrigin.value = { x: touch.absoluteX, y: touch.absoluteY };
          })
          .onTouchesMove((event, manager) => {
            const origin = touchOrigin.value;
            const touch = event.allTouches[0];
            if (!origin || !touch) return;
            const dx = Math.abs(touch.absoluteX - origin.x);
            const dy = touch.absoluteY - origin.y;
            if (Math.max(dx, Math.abs(dy)) < DRAG_SLOP) return;
            touchOrigin.value = null;
            if (!scrollOwnsTouch.value && dy > dx) manager.activate();
            else manager.fail();
          })
          .onStart(() => beginDrag())
          .onUpdate((event) => updateDrag(event.translationY))
          .onEnd((event, success) => {
            if (success) endDrag(event.translationY, event.velocityY);
            else cancelDrag();
          }),
      [
        dismissible,
        touchOrigin,
        scrollOwnsTouch,
        beginDrag,
        updateDrag,
        endDrag,
        cancelDrag,
      ],
    );
    const scrollContext = useMemo(
      () => ({ pan, scrollOwnsTouch }),
      [pan, scrollOwnsTouch],
    );

    // Keep the iOS Modal mounted until native dismissal delivers onDismiss.
    // Presenting another native sheet from the animation callback is too early.
    if (!mounted && Platform.OS !== 'ios') return null;

    const surfaceColor = Colors[colorScheme].backgroundSecondary;
    const handleColor =
      colorScheme === 'dark' ? Colors.dark.border : Colors.light.controlBorder;
    const hasHeader = title || subtitle || headerLeft || headerRight;
    const Content = scrollable ? ScrollableContent : Fragment;

    return (
      <PaneModal
        windowOverlayInTwoPanes
        supportedOrientations={sheetOrientations}
        visible={mounted}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={requestClose}
        onDismiss={onDismiss}
      >
        <GestureHandlerRootView>
          <KeyboardAvoidingView
            onAccessibilityEscape={requestClose}
            enabled={keyboardAvoiding}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.overlay}
          >
            <Reanimated.View
              pointerEvents="none"
              style={[
                StyleSheet.absoluteFill,
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
            <GestureDetector gesture={pan} touchAction="pan-y">
              <Reanimated.View
                ref={
                  Platform.OS === 'web' && dismissible ? webPanelRef : undefined
                }
                collapsable={false}
                onLayout={onLayout}
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
                  <View style={styles.handleHitArea}>
                    <View
                      style={[styles.handle, { backgroundColor: handleColor }]}
                    />
                  </View>
                )}

                <SheetScrollContext.Provider value={scrollContext}>
                  <Content>
                    {hasHeader && (
                      <View style={styles.header}>
                        {headerLeft ? (
                          <View style={styles.headerSide}>{headerLeft}</View>
                        ) : (
                          <View style={styles.headerSide} />
                        )}
                        <View style={styles.headerCopy}>
                          {title ? (
                            <Text style={styles.title}>{title}</Text>
                          ) : null}
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
                  </Content>
                </SheetScrollContext.Provider>
              </Reanimated.View>
            </GestureDetector>
          </KeyboardAvoidingView>
        </GestureHandlerRootView>
      </PaneModal>
    );
  },
);

const styles = StyleSheet.create({
  scroll: { flexGrow: 0, flexShrink: 1 },
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
