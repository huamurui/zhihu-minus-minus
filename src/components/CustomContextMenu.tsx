import { BlurView } from 'expo-blur';
import React, { useEffect, useRef, useState } from 'react';
import {
  type LayoutRectangle,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { ActionIcon, type ActionIconName } from '@/components/ActionIcon';
import { BouncyButton } from '@/components/BouncyButton';
import { CollectionStarIcon } from '@/components/CollectionStarIcon';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { PaneModal } from '@/features/adaptive-layout/PaneModal';
import { ImpactFeedbackStyle, impactAsync } from '@/utils/haptics';
import { Text, View } from './Themed';

// Global configuration to tweak all preview & menu transition parameters in one place
export const ANIMATION_CONFIG = {
  // Config for the preview card fly-in / fly-back transitions
  cardSpring: {
    damping: 28,
    stiffness: 550,
    mass: 0.5, // Make the element lighter to speed up the transition duration
  },
  // Config for the action menu list slide-up transition below the card
  menuSpring: {
    damping: 26,
    stiffness: 450,
    mass: 0.5,
  },
  // Duration in milliseconds for opacity fade timing
  fadeDuration: 100,
};

export interface MenuOption {
  key: string;
  title: string;
  icon: ActionIconName;
  iconFamily?: 'ionicons' | 'collection-star';
  iconSolid?: boolean;
  isDestructive?: boolean;
  disabled?: boolean;
  onPress: () => unknown;
}

interface CustomContextMenuProps {
  visible: boolean;
  onClose: () => void;
  previewContent: React.ReactNode;
  options: MenuOption[];
  originLayout?: { x: number; y: number; width: number; height: number } | null;
  contentIdentity?: string;
}

export function CustomContextMenu({
  visible,
  onClose,
  previewContent,
  options,
  originLayout,
  contentIdentity,
}: CustomContextMenuProps) {
  const colorScheme = useColorScheme();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [previewFrame, setPreviewFrame] = useState<LayoutRectangle | null>(
    null,
  );
  const openingStarted = useRef(false);
  const pendingAction = useRef<MenuOption['onPress'] | null>(null);
  const closing = useRef(false);
  const scrollOffset = useRef({ x: 0, y: 0 });
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      pendingAction.current = null;
    };
  }, []);
  const session = useRef({ visible, contentIdentity, version: 0 });
  if (
    session.current.visible !== visible ||
    session.current.contentIdentity !== contentIdentity
  ) {
    session.current = {
      visible,
      contentIdentity,
      version: session.current.version + 1,
    };
    pendingAction.current = null;
    closing.current = false;
    scrollOffset.current = { x: 0, y: 0 };
  }
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const scale = useSharedValue(0.9);
  const opacity = useSharedValue(0);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  const previewWidth = previewFrame?.width || Math.min(screenWidth - 32, 320);
  const finalCenterX = previewFrame
    ? previewFrame.x + previewFrame.width / 2
    : screenWidth / 2;
  const finalCenterY = previewFrame
    ? previewFrame.y + previewFrame.height / 2
    : screenHeight / 2;

  useEffect(() => {
    if (visible) {
      // Content measurement can change the frame during this session. Keep the
      // latest frame for closing without restarting the opening fade/fly-in.
      if (openingStarted.current) return;
      if (originLayout) {
        if (!previewFrame) {
          opacity.value = 0;
          return;
        }
        openingStarted.current = true;
        const itemCenterX = originLayout.x + originLayout.width / 2;
        const itemCenterY = originLayout.y + originLayout.height / 2;

        translateX.value = itemCenterX - finalCenterX;
        translateY.value = itemCenterY - finalCenterY;
        scale.value = originLayout.width / previewWidth;
        opacity.value = 0;

        translateX.value = withSpring(0, ANIMATION_CONFIG.cardSpring);
        translateY.value = withSpring(0, ANIMATION_CONFIG.cardSpring);
        scale.value = withSpring(1, ANIMATION_CONFIG.cardSpring);
        opacity.value = withTiming(1, {
          duration: ANIMATION_CONFIG.fadeDuration,
        });
      } else {
        openingStarted.current = true;
        translateX.value = 0;
        translateY.value = 0;
        scale.value = withSpring(1, ANIMATION_CONFIG.cardSpring);
        opacity.value = withTiming(1, {
          duration: ANIMATION_CONFIG.fadeDuration,
        });
      }
    } else {
      openingStarted.current = false;
      setPreviewFrame(null);
      translateX.value = 0;
      translateY.value = 0;
      scale.value = 0.9;
      opacity.value = 0;
    }
  }, [
    visible,
    originLayout,
    previewFrame,
    previewWidth,
    finalCenterX,
    finalCenterY,
    scale,
    opacity,
    translateX,
    translateY,
  ]);

  const animatedPreviewStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
    opacity: opacity.value,
  }));

  const animatedMenuStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      {
        translateY: withSpring(
          opacity.value ? 0 : 12,
          ANIMATION_CONFIG.menuSpring,
        ),
      },
    ],
  }));

  const finishClose = (version: number) => {
    if (
      session.current.version !== version ||
      !session.current.visible ||
      !mounted.current ||
      !closing.current
    )
      return;
    const action = pendingAction.current;
    pendingAction.current = null;
    closing.current = false;
    onCloseRef.current();
    if (action) void action();
  };

  const handleClose = () => {
    if (closing.current) return;
    closing.current = true;
    const version = session.current.version;
    if (originLayout) {
      const itemCenterX = originLayout.x + originLayout.width / 2;
      const itemCenterY = originLayout.y + originLayout.height / 2;

      translateX.value = withSpring(
        itemCenterX - finalCenterX,
        ANIMATION_CONFIG.cardSpring,
      );
      translateY.value = withSpring(
        itemCenterY - finalCenterY,
        ANIMATION_CONFIG.cardSpring,
      );
      scale.value = withSpring(
        originLayout.width / previewWidth,
        ANIMATION_CONFIG.cardSpring,
      );
      opacity.value = withTiming(
        0,
        { duration: ANIMATION_CONFIG.fadeDuration },
        (finished) => {
          if (finished) {
            runOnJS(finishClose)(version);
          }
        },
      );
    } else {
      scale.value = withTiming(0.96, {
        duration: ANIMATION_CONFIG.fadeDuration,
      });
      opacity.value = withTiming(
        0,
        { duration: ANIMATION_CONFIG.fadeDuration },
        (finished) => {
          if (finished) runOnJS(finishClose)(version);
        },
      );
    }
  };

  if (!visible) return null;

  return (
    <PaneModal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={handleClose}
    >
      {/* Absolute Backdrop Pressable */}
      <Pressable
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor:
              colorScheme === 'dark'
                ? 'rgba(0, 0, 0, 0.45)'
                : 'rgba(255, 255, 255, 0.35)',
          },
        ]}
        onPress={handleClose}
      >
        <BlurView
          intensity={85}
          tint={colorScheme === 'dark' ? 'dark' : 'light'}
          style={StyleSheet.absoluteFill}
        />
      </Pressable>

      {/* Foreground Container (allows gesture events to pass to subviews) */}
      <View style={styles.overlayContainer} pointerEvents="box-none">
        {/* Scaled Preview Area */}
        <Animated.View
          onLayout={({ nativeEvent }) => {
            const next = nativeEvent.layout;
            setPreviewFrame((previous) =>
              previous?.x === next.x &&
              previous.y === next.y &&
              previous.width === next.width &&
              previous.height === next.height
                ? previous
                : next,
            );
          }}
          style={[animatedPreviewStyle, styles.previewContainer]}
        >
          {previewContent}
        </Animated.View>

        {/* Menu Below Preview */}
        <Animated.View
          style={[
            animatedMenuStyle,
            styles.menuContainer,
            { maxHeight: screenHeight * 0.4 },
            { backgroundColor: Colors[colorScheme].backgroundSecondary },
          ]}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentOffset={scrollOffset.current}
            onScroll={({ nativeEvent }) => {
              scrollOffset.current = nativeEvent.contentOffset;
            }}
            scrollEventThrottle={16}
          >
            {options.map((option, index) => (
              <React.Fragment key={option.key}>
                <BouncyButton
                  accessibilityRole="button"
                  accessibilityLabel={option.title}
                  accessibilityState={{ disabled: option.disabled }}
                  disabled={option.disabled}
                  onPress={() => {
                    if (option.disabled || closing.current) return;
                    void impactAsync(ImpactFeedbackStyle.Light);
                    pendingAction.current = option.onPress;
                    handleClose();
                  }}
                  style={{ opacity: option.disabled ? 0.45 : 1 }}
                  className="flex-row items-center py-3.5 px-4 rounded-xl"
                >
                  <Text
                    className={`flex-1 text-[16px] ${
                      option.isDestructive
                        ? 'text-red-500 font-semibold'
                        : 'text-foreground dark:text-foreground-dark'
                    }`}
                  >
                    {option.title}
                  </Text>
                  {option.iconFamily === 'collection-star' ? (
                    <CollectionStarIcon
                      size={18}
                      color={Colors[colorScheme].textSecondary}
                      filled={option.iconSolid === true}
                    />
                  ) : (
                    <ActionIcon
                      name={option.icon}
                      size={20}
                      color={
                        option.isDestructive
                          ? '#ef4444'
                          : Colors[colorScheme].textSecondary
                      }
                    />
                  )}
                </BouncyButton>
                {index < options.length - 1 && (
                  <View className="h-[0.5px] bg-[#e0e0e0] dark:bg-[#333] ml-4" />
                )}
              </React.Fragment>
            ))}
          </ScrollView>
        </Animated.View>
      </View>
    </PaneModal>
  );
}

const styles = StyleSheet.create({
  overlayContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  previewContainer: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
  },
  menuContainer: {
    width: 250,
    borderRadius: 14,
    overflow: 'hidden',
  },
});
