import Ionicons from '@expo/vector-icons/Ionicons';
import { type Href, Stack, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  LayoutAnimation,
  Platform,
  View as RNView,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  UIManager,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BouncyButton } from '@/components/BouncyButton';
import { Section, SettingItem } from '@/components/SettingItem';
import { NavigationInteractionSettings } from '@/components/settings/NavigationInteractionSettings';
import { Text, useThemeColor, View } from '@/components/Themed';
import { ThemeModeSelector } from '@/components/ThemeModeSelector';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { colors as baseColors, designTokens } from '@/constants/designTokens';
import {
  READING_BACKGROUND_OPTIONS,
  resolveThemeColors,
  SURFACE_STYLE_OPTIONS,
  TEXT_CONTRAST_OPTIONS,
} from '@/constants/theme';
import type { RichContentRenderer } from '@/features/rich-content';
import { useSettingsStore } from '@/store/useSettingsStore';
import { contrastingText } from '@/utils/colorContrast';

// 开启 Android 下的 LayoutAnimation
if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export interface ColorPreset {
  name: string;
  value: string;
}

const PRESET_COLORS: ColorPreset[] = designTokens.primaryPresets;

const CONTENT_RENDERER_OPTIONS: readonly {
  value: RichContentRenderer;
  label: string;
  description: string;
}[] = [
  {
    value: 'native-v2',
    label: '原生渲染（默认）',
    description: 'tiqian super mini 版；更好的公式、图片、划线...的中文排版。',
  },
  {
    value: 'webview',
    label: 'WebView（不再推荐）',
    description: '使用网页布局显示正文。',
  },
];

export default function AppearanceSettings() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme() ?? 'light';
  const {
    fontSizeScale,
    lineHeightScale,
    primaryColor,
    readingBackground,
    textContrast,
    surfaceStyle,
    richContentRenderer,
    removeImageWatermark,
    answerReadingMode,
    updateSettings,
  } = useSettingsStore();

  const [showAdvancedColor, setShowAdvancedColor] = useState(false);

  const tintColor = useThemeColor({}, 'primary');
  const canvasColor = useThemeColor({}, 'background');
  const readingPreviews = useMemo(
    () =>
      READING_BACKGROUND_OPTIONS.map((option) => ({
        ...option,
        palette: resolveThemeColors(colorScheme, {
          primaryColor,
          readingBackground: option.value,
          textContrast,
          surfaceStyle,
        }),
      })),
    [colorScheme, primaryColor, textContrast, surfaceStyle],
  );

  const toggleAdvancedColor = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setShowAdvancedColor(!showAdvancedColor);
  };

  return (
    <RNView
      style={[
        styles.container,
        {
          backgroundColor: canvasColor,
        },
      ]}
    >
      <Stack.Screen
        options={{ title: '外观与阅读', headerShadowVisible: false }}
      />

      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 40,
        }}
      >
        <Section title="个性化" colorScheme={colorScheme}>
          <BouncyButton
            onPress={() => router.push('/settings/app-icon' as Href)}
            style={styles.routeRow}
          >
            <RNView
              style={[
                styles.appIconPreview,
                { backgroundColor: Colors.light.primary },
              ]}
            >
              <RNView
                style={[
                  styles.appIconMinus,
                  { backgroundColor: Colors.light.onPrimary },
                ]}
              />
              <RNView
                style={[
                  styles.appIconMinus,
                  { backgroundColor: Colors.light.onPrimary },
                ]}
              />
            </RNView>
            <RNView style={styles.routeCopy}>
              <Text style={styles.routeLabel}>App 图标</Text>
              <Text type="secondary" style={styles.routeDescription}>
                更换主屏幕图标的配色
              </Text>
            </RNView>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={Colors[colorScheme].textSecondary}
            />
          </BouncyButton>
        </Section>

        <Section title="显示模式" colorScheme={colorScheme}>
          <ThemeModeSelector />
        </Section>

        <Section title="正文排版" colorScheme={colorScheme}>
          {CONTENT_RENDERER_OPTIONS.map((option) => {
            const isSelected = richContentRenderer === option.value;
            return (
              <BouncyButton
                key={option.value}
                onPress={() =>
                  updateSettings({ richContentRenderer: option.value })
                }
                accessibilityRole="radio"
                accessibilityState={{ checked: isSelected }}
                style={styles.rendererOptionRow}
              >
                <Ionicons
                  name={isSelected ? 'radio-button-on' : 'radio-button-off'}
                  size={22}
                  color={
                    isSelected ? tintColor : Colors[colorScheme].textSecondary
                  }
                />
                <RNView style={styles.rendererOptionCopy}>
                  <Text style={styles.rendererOptionLabel}>{option.label}</Text>
                  <Text type="secondary" style={styles.routeDescription}>
                    {option.description}
                  </Text>
                </RNView>
              </BouncyButton>
            );
          })}
          <SettingItem
            label="去除图片水印"
            icon="image-outline"
            colorScheme={colorScheme}
          >
            <Switch
              accessibilityLabel="去除图片水印"
              accessibilityHint="正文图片加载作者上传的原文件，不带知乎水印"
              value={removeImageWatermark}
              onValueChange={(value) =>
                updateSettings({ removeImageWatermark: value })
              }
              trackColor={{ true: tintColor }}
            />
          </SettingItem>
        </Section>

        <Section title="回答阅读方式" colorScheme={colorScheme}>
          {(
            [
              {
                value: 'detail',
                label: '回答详情',
                description: '点击卡片后进入回答详情，左右滑动切换回答。',
              },
              {
                value: 'preview-list',
                label: '预览卡片列表',
                description: '点击卡片后进入回答预览列表，长正文可展开或收起。',
              },
            ] as const
          ).map((option) => (
            <BouncyButton
              key={option.value}
              onPress={() =>
                updateSettings({ answerReadingMode: option.value })
              }
              accessibilityRole="radio"
              accessibilityState={{
                checked: answerReadingMode === option.value,
              }}
              style={styles.rendererOptionRow}
            >
              <Ionicons
                name={
                  answerReadingMode === option.value
                    ? 'radio-button-on'
                    : 'radio-button-off'
                }
                size={22}
                color={
                  answerReadingMode === option.value
                    ? tintColor
                    : Colors[colorScheme].textSecondary
                }
              />
              <RNView style={styles.rendererOptionCopy}>
                <Text style={styles.rendererOptionLabel}>{option.label}</Text>
                <Text type="secondary" style={styles.routeDescription}>
                  {option.description}
                </Text>
              </RNView>
            </BouncyButton>
          ))}
        </Section>

        {/* 1. 字体风格 */}
        <Section title="字体与排版" colorScheme={colorScheme}>
          <SettingItem
            label="字体大小"
            icon="text-outline"
            colorScheme={colorScheme}
          >
            <View style={styles.row}>
              <BouncyButton
                onPress={() =>
                  updateSettings({
                    fontSizeScale: Math.max(0.8, fontSizeScale - 0.1),
                  })
                }
                style={[
                  styles.smallBtn,
                  { backgroundColor: Colors[colorScheme].backgroundTertiary },
                ]}
              >
                <Ionicons
                  name="remove"
                  size={18}
                  color={Colors[colorScheme].text}
                />
              </BouncyButton>
              <Text style={styles.valueText}>{fontSizeScale.toFixed(1)}x</Text>
              <BouncyButton
                onPress={() =>
                  updateSettings({
                    fontSizeScale: Math.min(1.5, fontSizeScale + 0.1),
                  })
                }
                style={[
                  styles.smallBtn,
                  { backgroundColor: Colors[colorScheme].backgroundTertiary },
                ]}
              >
                <Ionicons
                  name="add"
                  size={18}
                  color={Colors[colorScheme].text}
                />
              </BouncyButton>
            </View>
          </SettingItem>

          <SettingItem
            label="行高比例"
            icon="reorder-two-outline"
            colorScheme={colorScheme}
          >
            <View style={styles.row}>
              <BouncyButton
                onPress={() =>
                  updateSettings({
                    lineHeightScale: Math.max(1.0, lineHeightScale - 0.1),
                  })
                }
                style={[
                  styles.smallBtn,
                  { backgroundColor: Colors[colorScheme].backgroundTertiary },
                ]}
              >
                <Ionicons
                  name="remove"
                  size={18}
                  color={Colors[colorScheme].text}
                />
              </BouncyButton>
              <Text style={styles.valueText}>
                {lineHeightScale.toFixed(1)}x
              </Text>
              <BouncyButton
                onPress={() =>
                  updateSettings({
                    lineHeightScale: Math.min(2.5, lineHeightScale + 0.1),
                  })
                }
                style={[
                  styles.smallBtn,
                  { backgroundColor: Colors[colorScheme].backgroundTertiary },
                ]}
              >
                <Ionicons
                  name="add"
                  size={18}
                  color={Colors[colorScheme].text}
                />
              </BouncyButton>
            </View>
          </SettingItem>
        </Section>

        {/* 2. 主题颜色 */}
        <Section title="主题颜色" colorScheme={colorScheme}>
          <RNView style={styles.colorGrid}>
            {PRESET_COLORS.map(({ name, value: presetColor }) => {
              const isSelected =
                (primaryColor ?? baseColors.light.primary).toLowerCase() ===
                presetColor.toLowerCase();
              return (
                <BouncyButton
                  key={presetColor}
                  accessibilityRole="radio"
                  accessibilityLabel={name}
                  accessibilityState={{ checked: isSelected }}
                  onPress={() => updateSettings({ primaryColor: presetColor })}
                  style={[
                    styles.colorChip,
                    {
                      backgroundColor: Colors[colorScheme].backgroundTertiary,
                      borderColor: isSelected ? presetColor : 'transparent',
                    },
                    isSelected && { borderWidth: 1.5 },
                  ]}
                >
                  <RNView
                    style={[styles.colorDot, { backgroundColor: presetColor }]}
                  />
                  {isSelected && (
                    <Ionicons
                      name="checkmark"
                      size={14}
                      color={presetColor}
                      style={{ marginLeft: 2 }}
                    />
                  )}
                </BouncyButton>
              );
            })}
            <BouncyButton
              accessibilityRole="button"
              accessibilityLabel="恢复默认主题色"
              onPress={() =>
                updateSettings({ primaryColor: baseColors.light.primary })
              }
              style={[
                styles.colorChip,
                {
                  backgroundColor: Colors[colorScheme].backgroundTertiary,
                  borderColor:
                    primaryColor === baseColors.light.primary || !primaryColor
                      ? baseColors.light.primary
                      : 'transparent',
                },
              ]}
            >
              <Ionicons
                name="refresh-outline"
                size={12}
                color={Colors[colorScheme].textSecondary}
              />
              <Text
                style={[
                  styles.colorChipText,
                  { color: Colors[colorScheme].textSecondary },
                ]}
              >
                重置
              </Text>
            </BouncyButton>
          </RNView>

          <SettingItem
            label="自定义颜色"
            icon="color-palette-outline"
            colorScheme={colorScheme}
          >
            <Switch
              accessibilityLabel="显示自定义颜色"
              value={showAdvancedColor}
              onValueChange={toggleAdvancedColor}
              trackColor={{ true: tintColor }}
            />
          </SettingItem>

          {showAdvancedColor && (
            <ColorPickerSection
              primaryColor={primaryColor}
              onColorChange={(color: string) =>
                updateSettings({ primaryColor: color })
              }
            />
          )}
        </Section>

        {/* 3. 阅读体验 */}
        <Section title="阅读体验" colorScheme={colorScheme}>
          <RNView>
            <SettingItem
              label="阅读背景"
              icon="color-fill-outline"
              colorScheme={colorScheme}
            >
              <Text type="secondary" style={styles.readingScope}>
                同步应用页面与正文
              </Text>
            </SettingItem>
            <RNView
              style={styles.readingGrid}
              accessibilityRole="radiogroup"
              accessibilityLabel="阅读背景"
            >
              {readingPreviews.map((option) => {
                const isSelected = readingBackground === option.value;
                return (
                  <BouncyButton
                    key={option.value}
                    accessibilityRole="radio"
                    accessibilityLabel={option.label}
                    accessibilityHint={option.description}
                    accessibilityState={{ checked: isSelected }}
                    onPress={() =>
                      updateSettings({ readingBackground: option.value })
                    }
                    style={[
                      styles.readingPreview,
                      {
                        backgroundColor: option.palette.backgroundSecondary,
                        borderColor: isSelected
                          ? option.palette.primary
                          : option.palette.border,
                      },
                    ]}
                  >
                    <RNView style={styles.readingPreviewHeading}>
                      <Text
                        style={[
                          styles.readingPreviewLabel,
                          { color: option.palette.text },
                        ]}
                      >
                        {option.label}
                      </Text>
                      {isSelected && (
                        <Ionicons
                          name="checkmark-circle"
                          size={18}
                          color={option.palette.primary}
                        />
                      )}
                    </RNView>
                    <Text
                      style={[
                        styles.readingPreviewDescription,
                        { color: option.palette.textSecondary },
                      ]}
                    >
                      {option.description}
                    </Text>
                  </BouncyButton>
                );
              })}
            </RNView>
          </RNView>
          <SettingItem
            label="文字对比度"
            icon="contrast-outline"
            colorScheme={colorScheme}
          >
            <RNView style={styles.optionRow}>
              {TEXT_CONTRAST_OPTIONS.map((option) => {
                const isSelected = textContrast === option.value;
                return (
                  <BouncyButton
                    key={option.value}
                    onPress={() =>
                      updateSettings({ textContrast: option.value })
                    }
                    style={[
                      styles.optionChip,
                      {
                        backgroundColor: Colors[colorScheme].backgroundTertiary,
                      },
                      isSelected && { backgroundColor: tintColor },
                    ]}
                  >
                    <Text
                      style={[
                        styles.optionChipText,
                        isSelected && {
                          color: Colors[colorScheme].onPrimary,
                          fontWeight: 'bold',
                        },
                      ]}
                    >
                      {option.label}
                    </Text>
                  </BouncyButton>
                );
              })}
            </RNView>
          </SettingItem>
          <SettingItem
            label="表面层次"
            icon="layers-outline"
            colorScheme={colorScheme}
          >
            <RNView style={styles.optionRow}>
              {SURFACE_STYLE_OPTIONS.map((option) => {
                const isSelected = surfaceStyle === option.value;
                return (
                  <BouncyButton
                    key={option.value}
                    onPress={() =>
                      updateSettings({ surfaceStyle: option.value })
                    }
                    style={[
                      styles.optionChip,
                      {
                        backgroundColor: Colors[colorScheme].backgroundTertiary,
                      },
                      isSelected && { backgroundColor: tintColor },
                    ]}
                  >
                    <Text
                      style={[
                        styles.optionChipText,
                        isSelected && {
                          color: Colors[colorScheme].onPrimary,
                          fontWeight: 'bold',
                        },
                      ]}
                    >
                      {option.label}
                    </Text>
                  </BouncyButton>
                );
              })}
            </RNView>
          </SettingItem>
        </Section>

        <NavigationInteractionSettings />
      </ScrollView>
    </RNView>
  );
}

// ================= Color Utilities =================

function hexToHsl(hex: string) {
  let cleanHex = hex.replace('#', '');
  if (cleanHex.length === 3)
    cleanHex = cleanHex
      .split('')
      .map((x) => x + x)
      .join('');
  if (cleanHex.length !== 6) return { h: 211, s: 100, l: 50 };
  const r = parseInt(cleanHex.substring(0, 2), 16) / 255;
  const g = parseInt(cleanHex.substring(2, 4), 16) / 255;
  const b = parseInt(cleanHex.substring(4, 6), 16) / 255;

  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  let h = 0,
    s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

function hslToHex(h: number, s: number, l: number) {
  const sFrac = s / 100,
    lFrac = l / 100;
  const c = (1 - Math.abs(2 * lFrac - 1)) * sFrac;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lFrac - c / 2;
  let r = 0,
    g = 0,
    b = 0;
  if (0 <= h && h < 60) {
    r = c;
    g = x;
  } else if (60 <= h && h < 120) {
    r = x;
    g = c;
  } else if (120 <= h && h < 180) {
    g = c;
    b = x;
  } else if (180 <= h && h < 240) {
    g = x;
    b = c;
  } else if (240 <= h && h < 300) {
    r = x;
    b = c;
  } else if (300 <= h && h < 360) {
    r = c;
    b = x;
  }

  const toHex = (val: number) => {
    const s = Math.round((val + m) * 255).toString(16);
    return s.length === 1 ? `0${s}` : s;
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// ================= Custom Sliders =================

interface HslColor {
  h: number;
  s: number;
  l: number;
}

interface HslSliderProps {
  accessibilityLabel: string;
  value: number;
  min: number;
  max: number;
  thumbColor: string;
  gradientColors: string[];
  onChange: (value: number) => void;
  onComplete: (value: number) => void;
}

function HslSlider({
  accessibilityLabel,
  value,
  min,
  max,
  thumbColor,
  gradientColors,
  onChange,
  onComplete,
}: HslSliderProps) {
  const [trackWidth, setTrackWidth] = useState(0);
  const onChangeRef = useRef(onChange);
  const onCompleteRef = useRef(onComplete);
  const trackWidthValue = useSharedValue(0);
  const sliderRatio = useSharedValue(0);
  const isDragging = useSharedValue(false);
  const startValue = useSharedValue(value);

  onChangeRef.current = onChange;
  onCompleteRef.current = onComplete;

  const ratio =
    trackWidth > 0 ? Math.max(0, Math.min(1, (value - min) / (max - min))) : 0;

  useEffect(() => {
    // JS preview renders can trail the finger; keep the UI-thread position
    // authoritative until the drag ends.
    if (isDragging.value) return;
    startValue.value = value;
    sliderRatio.value = ratio;
  }, [isDragging, ratio, sliderRatio, startValue, value]);

  const notifyChange = useCallback((nextValue: number) => {
    onChangeRef.current(nextValue);
  }, []);
  const notifyComplete = useCallback((nextValue: number) => {
    onCompleteRef.current(nextValue);
  }, []);
  const sliderGesture = useMemo(() => {
    const updateFromPosition = (x: number, complete: boolean) => {
      'worklet';
      if (trackWidthValue.value <= 0) return;
      const nextRatio = Math.max(0, Math.min(1, x / trackWidthValue.value));
      sliderRatio.value = nextRatio;
      const nextValue = Math.round(min + nextRatio * (max - min));
      if (complete) {
        // The final value may equal the last preview, so no prop effect is
        // guaranteed to run before the next drag.
        startValue.value = nextValue;
        runOnJS(notifyComplete)(nextValue);
      } else {
        runOnJS(notifyChange)(nextValue);
      }
    };
    const pan = Gesture.Pan()
      .activeOffsetX([-8, 8])
      .failOffsetY([-12, 12])
      // BEGAN also fires when the user intends to scroll the page. Wait
      // for horizontal activation before changing the color preview.
      .onStart((event) => {
        isDragging.value = true;
        updateFromPosition(event.x, false);
      })
      .onUpdate((event) => {
        updateFromPosition(event.x, false);
      })
      .onEnd((event, success) => {
        if (success) updateFromPosition(event.x, true);
      })
      .onFinalize((_event, success) => {
        if (!success && isDragging.value) {
          sliderRatio.value = Math.max(
            0,
            Math.min(1, (startValue.value - min) / (max - min)),
          );
          runOnJS(notifyChange)(startValue.value);
        }
        isDragging.value = false;
      });
    // A tap (including movement below the pan threshold) never reaches
    // Pan.onEnd. Handle it explicitly so its selected color is committed.
    const tap = Gesture.Tap()
      .maxDistance(12)
      .onEnd((event, success) => {
        if (success) updateFromPosition(event.x, true);
      });
    return Gesture.Race(pan, tap);
  }, [
    isDragging,
    max,
    min,
    notifyChange,
    notifyComplete,
    sliderRatio,
    startValue,
    trackWidthValue,
  ]);
  const thumbAnimatedStyle = useAnimatedStyle(() => ({
    left: sliderRatio.value * trackWidthValue.value - 10,
  }));

  return (
    <GestureDetector gesture={sliderGesture}>
      <RNView
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={accessibilityLabel}
        accessibilityValue={{ min, max, now: value }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={({ nativeEvent }) => {
          const delta = nativeEvent.actionName === 'increment' ? 1 : -1;
          if (
            nativeEvent.actionName === 'increment' ||
            nativeEvent.actionName === 'decrement'
          ) {
            notifyComplete(Math.max(min, Math.min(max, value + delta)));
          }
        }}
        style={{ height: 32, justifyContent: 'center' }}
        onLayout={(event) => {
          const width = event.nativeEvent.layout.width;
          setTrackWidth(width);
          trackWidthValue.value = width;
        }}
      >
        <RNView
          style={{
            height: 8,
            borderRadius: 4,
            overflow: 'hidden',
            flexDirection: 'row',
          }}
        >
          {gradientColors.map((color: string, i: number) => (
            <RNView
              // biome-ignore lint/suspicious/noArrayIndexKey: gradientColors 是固定长度的预设色序,渲染的是无状态色块;色值本身会重复,不能当 key。
              key={i}
              style={{ flex: 1, backgroundColor: color }}
            />
          ))}
        </RNView>
        {trackWidth > 0 && (
          <Reanimated.View
            pointerEvents="none"
            style={[
              {
                position: 'absolute',
                width: 20,
                height: 20,
                borderRadius: 10,
                backgroundColor: thumbColor,
                borderWidth: 2,
                borderColor: contrastingText(thumbColor),
              },
              thumbAnimatedStyle,
            ]}
          />
        )}
      </RNView>
    </GestureDetector>
  );
}

function ColorPickerSection({
  primaryColor,
  onColorChange,
}: {
  primaryColor: string | null;
  onColorChange: (color: string) => void;
}) {
  const colorScheme = useColorScheme() ?? 'light';
  const textColor = Colors[colorScheme].text;
  const borderColor = Colors[colorScheme].border;

  const [hsl, setHsl] = useState(() =>
    hexToHsl(primaryColor || baseColors.light.primary),
  );
  const [hexText, setHexText] = useState(
    primaryColor || baseColors.light.primary,
  );

  useEffect(() => {
    const target = primaryColor || baseColors.light.primary;
    setHexText(target);
    const newHsl = hexToHsl(target);
    setHsl((currentHsl) => {
      const currentHex = hslToHex(currentHsl.h, currentHsl.s, currentHsl.l);
      return currentHex.toLowerCase() === target.toLowerCase()
        ? currentHsl
        : newHsl;
    });
  }, [primaryColor]);

  const applyHslLocal = (newHsl: HslColor) => {
    setHsl(newHsl);
    setHexText(hslToHex(newHsl.h, newHsl.s, newHsl.l));
  };

  const applyHslComplete = (newHsl: HslColor) => {
    setHsl(newHsl);
    const hex = hslToHex(newHsl.h, newHsl.s, newHsl.l);
    setHexText(hex);
    onColorChange(hex);
  };

  const previewColor = hslToHex(hsl.h, hsl.s, hsl.l);
  const hueGradient = Array.from(
    { length: 36 },
    (_, i) => `hsl(${i * 10}, 100%, 50%)`,
  );
  const satGradient = Array.from(
    { length: 10 },
    (_, i) => `hsl(${hsl.h}, ${i * 11}%, ${hsl.l}%)`,
  );
  const litGradient = Array.from(
    { length: 10 },
    (_, i) => `hsl(${hsl.h}, ${hsl.s}%, ${i * 11}%)`,
  );

  return (
    <RNView
      style={{
        padding: 16,
        paddingTop: 8,
        gap: 16,
        backgroundColor: Colors[colorScheme].backgroundTertiary,
      }}
    >
      <RNView style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <RNView
          testID="primary-color-preview"
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: previewColor,
            borderWidth: 1,
            borderColor: borderColor,
          }}
        />
        <TextInput
          style={[
            styles.hexInput,
            {
              color: textColor,
              borderColor: borderColor,
              backgroundColor: Colors[colorScheme].backgroundTertiary,
            },
          ]}
          accessibilityLabel="自定义主题色"
          placeholder={baseColors.light.primary}
          placeholderTextColor={Colors[colorScheme].textTertiary}
          value={hexText}
          onChangeText={(val) => {
            const v = val.startsWith('#') ? val : val ? `#${val}` : '#';
            setHexText(v);
            if (/^#[0-9a-fA-F]{6}$/.test(v)) {
              onColorChange(v);
              setHsl(hexToHsl(v));
            }
          }}
          onBlur={() => {
            if (!/^#[0-9a-fA-F]{6}$/.test(hexText))
              setHexText(primaryColor || baseColors.light.primary);
          }}
          maxLength={7}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </RNView>

      <RNView style={{ gap: 2 }}>
        <Text style={{ fontSize: 13, fontWeight: '500' }}>
          色相 (Hue) {hsl.h}°
        </Text>
        <HslSlider
          accessibilityLabel="色相"
          value={hsl.h}
          min={0}
          max={359}
          thumbColor={previewColor}
          gradientColors={hueGradient}
          onChange={(v: number) => applyHslLocal({ ...hsl, h: v })}
          onComplete={(v: number) => applyHslComplete({ ...hsl, h: v })}
        />
      </RNView>
      <RNView style={{ gap: 2 }}>
        <Text style={{ fontSize: 13, fontWeight: '500' }}>
          饱和度 (Saturation) {hsl.s}%
        </Text>
        <HslSlider
          accessibilityLabel="饱和度"
          value={hsl.s}
          min={10}
          max={100}
          thumbColor={previewColor}
          gradientColors={satGradient}
          onChange={(v: number) => applyHslLocal({ ...hsl, s: v })}
          onComplete={(v: number) => applyHslComplete({ ...hsl, s: v })}
        />
      </RNView>
      <RNView style={{ gap: 2 }}>
        <Text style={{ fontSize: 13, fontWeight: '500' }}>
          亮度 (Lightness) {hsl.l}%
        </Text>
        <HslSlider
          accessibilityLabel="亮度"
          value={hsl.l}
          min={10}
          max={90}
          thumbColor={previewColor}
          gradientColors={litGradient}
          onChange={(v: number) => applyHslLocal({ ...hsl, l: v })}
          onComplete={(v: number) => applyHslComplete({ ...hsl, l: v })}
        />
      </RNView>
    </RNView>
  );
}

// ================= Styles =================

const styles = StyleSheet.create({
  container: { flex: 1 },
  routeRow: {
    minHeight: 70,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  appIconPreview: {
    width: 38,
    height: 38,
    borderRadius: 9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  appIconMinus: {
    width: 8,
    height: 3,
    borderRadius: 2,
  },
  routeCopy: { flex: 1, marginHorizontal: 12 },
  routeLabel: { fontSize: 16, fontWeight: '600' },
  routeDescription: { fontSize: 12, lineHeight: 18, marginTop: 2 },
  rendererOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 66,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  rendererOptionCopy: { flex: 1 },
  rendererOptionLabel: { fontSize: 15, fontWeight: '600' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  smallBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  valueText: {
    width: 48,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: 'bold',
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    padding: 16,
  },
  colorChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    gap: 6,
  },
  colorDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  colorChipText: {
    fontSize: 10,
  },
  readingScope: { flexShrink: 1, fontSize: 12, marginLeft: 12 },
  readingGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  readingPreview: {
    flexBasis: '46%',
    flexGrow: 1,
    minHeight: 86,
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 12,
    gap: 6,
  },
  readingPreviewHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  readingPreviewLabel: { flexShrink: 1, fontSize: 15, fontWeight: '600' },
  readingPreviewDescription: { fontSize: 12 },
  optionRow: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 6,
    marginLeft: 12,
  },
  optionChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
  },
  optionChipText: {
    fontSize: 13,
  },
  hexInput: {
    width: 100,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
  },
});
