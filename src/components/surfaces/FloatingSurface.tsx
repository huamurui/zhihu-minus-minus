import { type BlurTint, BlurView } from 'expo-blur';
import {
  type GlassEffectStyleConfig,
  type GlassStyle,
  GlassView,
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
} from 'expo-glass-effect';
import { useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  Platform,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSettingsStore } from '@/store/useSettingsStore';

/**
 * 校验当前设备及系统是否支持 iOS 原生 Liquid Glass 特效。
 */
export function isLiquidGlassSupported(): boolean {
  if (Platform.OS !== 'ios') return false;
  try {
    return isGlassEffectAPIAvailable() && isLiquidGlassAvailable();
  } catch {
    return false;
  }
}

/**
 * Hook: 监听系统无障碍“减少透明度 (Reduce Transparency)”设置，
 * 并结合 iOS Liquid Glass 支持状态判断当前是否应启用原生液态玻璃。
 */
export function useIsLiquidGlassActive(preferred = true): boolean {
  const userSettingEnabled = useSettingsStore(
    (state) => state?.useIOSLiquidGlass ?? true,
  );
  const [reduceTransparency, setReduceTransparency] = useState(false);

  useEffect(() => {
    let isMounted = true;
    AccessibilityInfo.isReduceTransparencyEnabled?.()
      ?.then((enabled) => {
        if (isMounted) setReduceTransparency(enabled);
      })
      ?.catch(() => {});

    const subscription = AccessibilityInfo.addEventListener?.(
      'reduceTransparencyChanged',
      (enabled) => {
        setReduceTransparency(enabled);
      },
    );

    return () => {
      isMounted = false;
      subscription?.remove?.();
    };
  }, []);

  if (!preferred) return false;
  if (!userSettingEnabled) return false;
  if (reduceTransparency) return false;
  return isLiquidGlassSupported();
}

export interface FloatingSurfaceProps {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  glassStyle?: GlassStyle | GlassEffectStyleConfig;
  isInteractive?: boolean;
  colorScheme?: 'light' | 'dark' | 'auto';
  intensity?: number;
  tint?: BlurTint;
  forceBlur?: boolean;
  pointerEvents?: 'auto' | 'none' | 'box-none' | 'box-only';
  testID?: string;
}

/**
 * 通用悬浮表面组件：
 * - 当支持并启用 iOS 26+ 原生 Liquid Glass 时，渲染系统级 GlassView；
 * - 当不支持或系统开启“减少透明度”时，优雅降级为 BlurView；
 * - 确保自身传递给 GlassView 的 style 带有 borderRadius，保证原生 cornerConfiguration 正确生效。
 */
export function FloatingSurface({
  children,
  style,
  glassStyle = 'regular',
  isInteractive = false,
  colorScheme = 'auto',
  intensity = 130,
  tint,
  forceBlur = false,
  pointerEvents,
  testID,
}: FloatingSurfaceProps) {
  const isGlassActive = useIsLiquidGlassActive(!forceBlur);

  if (isGlassActive) {
    return (
      <GlassView
        testID={testID}
        pointerEvents={pointerEvents}
        glassEffectStyle={glassStyle}
        colorScheme={colorScheme}
        isInteractive={isInteractive}
        style={style}
      >
        {children}
      </GlassView>
    );
  }

  return (
    <BlurView
      testID={testID}
      pointerEvents={pointerEvents}
      intensity={intensity}
      tint={tint}
      style={style}
    >
      {children}
    </BlurView>
  );
}
