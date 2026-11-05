import { GlassContainer } from 'expo-glass-effect';
import type { ComponentProps, ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import {
  ContentActionBarColorContext,
  glassActionColor,
} from '@/components/ContentActionBarColor';
import {
  FloatingSurface,
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

  if (variant === 'islands') {
    const IslandsContainer = useGlass ? GlassContainer : View;

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
                  styles.islandShadow,
                  shrinkLeading && styles.shrinkableLeading,
                  !useGlass && {
                    backgroundColor: colors.contentOverlayStrong,
                    ...(colorScheme === 'light'
                      ? { shadowColor: colors.shadow, ...styles.shadow }
                      : {}),
                  },
                ]}
              >
                <FloatingSurface
                  glassStyle="regular"
                  isInteractive={interactiveGlass && visible}
                  colorScheme={useGlass ? 'auto' : colorScheme}
                  intensity={130}
                  tint={colorScheme}
                  style={[
                    // Let native interactive glass deform beyond its static bounds.
                    (!useGlass || !interactiveGlass) && styles.surface,
                    styles.islandLeading,
                    {
                      height: CONTENT_ACTION_BAR_HEIGHT,
                      borderRadius: CONTENT_ACTION_BAR_HEIGHT / 2,
                      borderWidth: useGlass ? 0 : StyleSheet.hairlineWidth,
                      borderColor: useGlass ? undefined : colors.contentBorder,
                      backgroundColor: useGlass
                        ? undefined
                        : colors.contentOverlayStrong,
                    },
                  ]}
                >
                  {leading}
                </FloatingSurface>
              </View>
            ) : null}

            <View style={styles.islandRightGroup}>
              {trailing ? (
                <View
                  style={[
                    styles.islandShadow,
                    !useGlass && {
                      backgroundColor: colors.contentOverlayStrong,
                      ...(colorScheme === 'light'
                        ? { shadowColor: colors.shadow, ...styles.shadow }
                        : {}),
                    },
                  ]}
                >
                  <FloatingSurface
                    glassStyle="regular"
                    isInteractive={interactiveGlass && visible}
                    colorScheme={useGlass ? 'auto' : colorScheme}
                    intensity={130}
                    tint={colorScheme}
                    style={[
                      (!useGlass || !interactiveGlass) && styles.surface,
                      styles.islandTrailing,
                      {
                        height: CONTENT_ACTION_BAR_HEIGHT,
                        borderRadius: CONTENT_ACTION_BAR_HEIGHT / 2,
                        borderWidth: useGlass ? 0 : StyleSheet.hairlineWidth,
                        borderColor: useGlass
                          ? undefined
                          : colors.contentBorder,
                        backgroundColor: useGlass
                          ? undefined
                          : colors.contentOverlayStrong,
                      },
                    ]}
                  >
                    {trailing}
                  </FloatingSurface>
                </View>
              ) : null}

              {accessory ? (
                <View
                  style={[
                    styles.islandShadow,
                    styles.islandAccessoryContainer,
                    !useGlass && {
                      backgroundColor: colors.contentOverlayStrong,
                      ...(colorScheme === 'light'
                        ? { shadowColor: colors.shadow, ...styles.shadow }
                        : {}),
                    },
                  ]}
                >
                  <FloatingSurface
                    glassStyle="regular"
                    isInteractive={interactiveGlass && visible}
                    colorScheme={useGlass ? 'auto' : colorScheme}
                    intensity={130}
                    tint={colorScheme}
                    style={[
                      (!useGlass || !interactiveGlass) && styles.surface,
                      styles.islandAccessory,
                      {
                        width: CONTENT_ACTION_BAR_HEIGHT,
                        height: CONTENT_ACTION_BAR_HEIGHT,
                        borderRadius: CONTENT_ACTION_BAR_HEIGHT / 2,
                        borderWidth: useGlass ? 0 : StyleSheet.hairlineWidth,
                        borderColor: useGlass
                          ? undefined
                          : colors.contentBorder,
                        backgroundColor: useGlass
                          ? undefined
                          : colors.contentOverlayStrong,
                      },
                    ]}
                  >
                    {accessory}
                  </FloatingSurface>
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
        !useGlass &&
          colorScheme === 'light' && {
            shadowColor: colors.shadow,
            ...styles.shadow,
          },
        style,
      ]}
    >
      <ContentActionBarColorContext.Provider
        value={useGlass ? glassActionColor : null}
      >
        <FloatingSurface
          glassStyle="regular"
          colorScheme={useGlass ? 'auto' : colorScheme}
          intensity={130}
          tint={colorScheme}
          style={[
            styles.surface,
            {
              height: CONTENT_ACTION_BAR_HEIGHT,
              borderRadius: CONTENT_ACTION_BAR_HEIGHT / 2,
              borderWidth: useGlass ? 0 : StyleSheet.hairlineWidth,
              backgroundColor: useGlass
                ? undefined
                : colors.contentOverlayStrong,
              borderColor: useGlass ? undefined : colors.contentBorder,
            },
          ]}
        >
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
        </FloatingSurface>
      </ContentActionBarColorContext.Provider>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { position: 'absolute', left: 16, right: 16, zIndex: 1000 },
  surface: { overflow: 'hidden' },
  shadow: {
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 4,
  },
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
  islandShadow: {
    height: CONTENT_ACTION_BAR_HEIGHT,
    borderRadius: CONTENT_ACTION_BAR_HEIGHT / 2,
  },
  islandLeading: {
    paddingHorizontal: 6,
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
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  islandAccessory: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  islandAccessoryContainer: {
    width: CONTENT_ACTION_BAR_HEIGHT,
    marginLeft: 8,
  },
});
