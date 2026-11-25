import { GlassContainer } from 'expo-glass-effect';
import type { ComponentProps, ReactNode } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import {
  ContentActionBarColorContext,
  glassActionColor,
} from '@/components/ContentActionBarColor';
import {
  FloatingSurface,
  type FloatingSurfaceProps,
  useIsLiquidGlassActive,
} from '@/components/surfaces/FloatingSurface';
import { useRuntimeThemeColors } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';

export const CONTENT_ACTION_BAR_HEIGHT = 52;

export interface ContentActionBarProps {
  bottomInset: number;
  bottomOffset?: number;
  variant?: 'bar' | 'islands';
  leading?: ReactNode;
  trailing?: ReactNode;
  accessory?: ReactNode;
  children?: ReactNode;
  style?: ComponentProps<typeof Animated.View>['style'];
  visible?: boolean;
  shrinkLeading?: boolean;
  interactiveGlass?: boolean;
}

/** Preserve safe-area clearance, then raise the floating bar by 20. */
export function getContentActionBarBottom(
  bottomInset: number,
  bottomOffset = 0,
): number {
  return Math.max(bottomInset + bottomOffset, 12) + 12;
}

/** Common floating surface; supports unified bar (Variant A) or floating islands (Variant B). */
export function ContentActionBar({
  bottomInset,
  bottomOffset = 0,
  variant = 'bar',
  leading,
  trailing,
  accessory,
  children,
  style,
  visible = true,
  shrinkLeading = false,
  interactiveGlass = false,
}: ContentActionBarProps) {
  const colors = useRuntimeThemeColors();
  const colorScheme = useColorScheme();
  const useGlass = useIsLiquidGlassActive();
  const bottom = getContentActionBarBottom(bottomInset, bottomOffset);
  // Android's default BlurView only adds a tint.
  const useOpaqueSurface = Platform.OS !== 'ios' && Platform.OS !== 'web';
  const Surface = useOpaqueSurface ? View : FloatingSurface;
  const effectProps: FloatingSurfaceProps | undefined = useOpaqueSurface
    ? undefined
    : {
        glassStyle: 'regular',
        colorScheme: useGlass ? 'auto' : colorScheme,
        intensity: 130,
        tint: colorScheme,
      };
  const surfaceStyle = {
    height: CONTENT_ACTION_BAR_HEIGHT,
    borderRadius: CONTENT_ACTION_BAR_HEIGHT / 2,
    borderWidth: useGlass ? 0 : StyleSheet.hairlineWidth,
    borderColor: useGlass ? undefined : colors.contentBorder,
    backgroundColor: useGlass
      ? undefined
      : useOpaqueSurface
        ? colors.surface
        : colors.contentOverlayStrong,
  };

  if (variant === 'islands') {
    const IslandsContainer = useGlass ? GlassContainer : View;
    const islandEffectProps = effectProps && {
      ...effectProps,
      isInteractive: interactiveGlass && visible,
    };
    const islandBackdrop = !useGlass &&
      !useOpaqueSurface && { backgroundColor: colors.contentOverlayStrong };

    return (
      <Animated.View
        pointerEvents={visible ? 'auto' : 'none'}
        accessibilityElementsHidden={!visible}
        importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
        style={[
          styles.container,
          styles.islandsContainer,
          {
            bottom,
            height: CONTENT_ACTION_BAR_HEIGHT,
            opacity: useGlass ? 1 : visible ? 1 : 0,
            transform:
              useGlass && !visible
                ? [{ translateY: bottom + CONTENT_ACTION_BAR_HEIGHT + 30 }]
                : undefined,
          },
          style,
        ]}
      >
        <ContentActionBarColorContext.Provider
          value={useGlass ? glassActionColor : null}
        >
          <IslandsContainer
            {...(useGlass ? { spacing: 8 } : {})}
            style={styles.islandsInnerRow}
          >
            {leading ? (
              <View
                style={[
                  styles.islandContainer,
                  shrinkLeading && styles.shrinkableLeading,
                  islandBackdrop,
                ]}
              >
                <Surface
                  {...islandEffectProps}
                  style={[
                    // Let native interactive glass deform beyond its static bounds.
                    (!useGlass || !interactiveGlass) && styles.surface,
                    styles.islandLeading,
                    surfaceStyle,
                  ]}
                >
                  {leading}
                </Surface>
              </View>
            ) : null}

            <View style={styles.islandRightGroup}>
              {trailing ? (
                <View style={[styles.islandContainer, islandBackdrop]}>
                  <Surface
                    {...islandEffectProps}
                    style={[
                      (!useGlass || !interactiveGlass) && styles.surface,
                      styles.islandTrailing,
                      surfaceStyle,
                    ]}
                  >
                    {trailing}
                  </Surface>
                </View>
              ) : null}

              {accessory ? (
                <View
                  style={[
                    styles.islandContainer,
                    styles.islandAccessoryContainer,
                    islandBackdrop,
                  ]}
                >
                  <Surface
                    {...islandEffectProps}
                    style={[
                      (!useGlass || !interactiveGlass) && styles.surface,
                      styles.islandAccessory,
                      surfaceStyle,
                    ]}
                  >
                    {accessory}
                  </Surface>
                </View>
              ) : null}
            </View>
          </IslandsContainer>
        </ContentActionBarColorContext.Provider>
      </Animated.View>
    );
  }

  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
      style={[
        styles.container,
        {
          bottom,
          height: CONTENT_ACTION_BAR_HEIGHT,
          borderRadius: CONTENT_ACTION_BAR_HEIGHT / 2,
          opacity: useGlass ? 1 : visible ? 1 : 0,
          transform:
            useGlass && !visible
              ? [{ translateY: bottom + CONTENT_ACTION_BAR_HEIGHT + 30 }]
              : undefined,
        },
        style,
      ]}
    >
      <ContentActionBarColorContext.Provider
        value={useGlass ? glassActionColor : null}
      >
        <Surface {...effectProps} style={[styles.surface, surfaceStyle]}>
          {leading || trailing || accessory ? (
            <View style={styles.barRow}>
              {leading ? (
                <View
                  style={[
                    styles.leadingSlot,
                    shrinkLeading && styles.shrinkableLeading,
                  ]}
                >
                  {leading}
                </View>
              ) : null}
              <View style={styles.trailingSlot}>
                {trailing}
                {accessory ? (
                  <View style={styles.accessorySlot}>{accessory}</View>
                ) : null}
              </View>
            </View>
          ) : (
            children
          )}
        </Surface>
      </ContentActionBarColorContext.Provider>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { position: 'absolute', left: 16, right: 16, zIndex: 1000 },
  surface: { overflow: 'hidden' },
  barRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    backgroundColor: 'transparent',
  },
  leadingSlot: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  trailingSlot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    backgroundColor: 'transparent',
  },
  accessorySlot: {
    marginLeft: 8,
    backgroundColor: 'transparent',
  },
  islandsContainer: {
    backgroundColor: 'transparent',
  },
  islandsInnerRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'transparent',
  },
  islandContainer: {
    height: CONTENT_ACTION_BAR_HEIGHT,
    borderRadius: CONTENT_ACTION_BAR_HEIGHT / 2,
  },
  islandLeading: {
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shrinkableLeading: {
    flexShrink: 1,
    minWidth: 0,
  },
  islandRightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  islandTrailing: {
    paddingHorizontal: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  islandAccessory: {
    width: CONTENT_ACTION_BAR_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  islandAccessoryContainer: {
    width: CONTENT_ACTION_BAR_HEIGHT,
    marginLeft: 8,
  },
});
