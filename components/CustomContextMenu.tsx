import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import React, { useEffect, useState } from 'react';
import {
  type LayoutRectangle,
  Modal,
  Pressable,
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
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
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
  icon: string;
  isDestructive?: boolean;
  onPress: () => void;
}

interface CustomContextMenuProps {
  visible: boolean;
  onClose: () => void;
  previewContent: React.ReactNode;
  options: MenuOption[];
  originLayout?: { x: number; y: number; width: number; height: number } | null;
}

export function CustomContextMenu({
  visible,
  onClose,
  previewContent,
  options,
  originLayout,
}: CustomContextMenuProps) {
  const colorScheme = useColorScheme();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [previewFrame, setPreviewFrame] = useState<LayoutRectangle | null>(
    null,
  );
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
      if (originLayout) {
        if (!previewFrame) {
          opacity.value = 0;
          return;
        }
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
        translateX.value = 0;
        translateY.value = 0;
        scale.value = withSpring(1, ANIMATION_CONFIG.cardSpring);
        opacity.value = withTiming(1, {
          duration: ANIMATION_CONFIG.fadeDuration,
        });
      }
    } else {
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

  const handleClose = () => {
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
            runOnJS(onClose)();
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
          if (finished) runOnJS(onClose)();
        },
      );
    }
  };

  if (!visible) return null;

  return (
    <Modal
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
          onLayout={({ nativeEvent }) => setPreviewFrame(nativeEvent.layout)}
          style={[animatedPreviewStyle, styles.previewContainer]}
        >
          {previewContent}
        </Animated.View>

        {/* Menu Below Preview */}
        <Animated.View
          style={[
            animatedMenuStyle,
            styles.menuContainer,
            { backgroundColor: Colors[colorScheme].backgroundSecondary },
          ]}
        >
          <Pressable onPress={(e) => e.stopPropagation()}>
            {options.map((option, index) => (
              <React.Fragment key={option.key}>
                <Pressable
                  onPress={() => {
                    void impactAsync(ImpactFeedbackStyle.Light);
                    option.onPress();
                    handleClose();
                  }}
                  className="flex-row items-center py-3.5 px-4 active:bg-black/5 dark:active:bg-white/5"
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
                  <Ionicons
                    name={option.icon as any}
                    size={20}
                    color={
                      option.isDestructive
                        ? '#ef4444'
                        : Colors[colorScheme].textSecondary
                    }
                  />
                </Pressable>
                {index < options.length - 1 && (
                  <View className="h-[0.5px] bg-[#e0e0e0] dark:bg-[#333] ml-4" />
                )}
              </React.Fragment>
            ))}
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
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
    shadowColor: Colors.light.shadow,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
  },
  menuContainer: {
    width: 250,
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: Colors.light.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 6,
  },
});
