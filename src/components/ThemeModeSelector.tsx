import Ionicons from '@expo/vector-icons/Ionicons';
import { type ComponentProps, useEffect } from 'react';
import { View as RNView, StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { BouncyButton } from '@/components/BouncyButton';
import { Text, useThemeColor } from '@/components/Themed';
import { type ThemeMode, useThemeStore } from '@/store/useThemeStore';
import { selectionAsync } from '@/utils/haptics';

const THEME_MODE_OPTIONS: ReadonlyArray<{
  mode: ThemeMode;
  label: string;
  icon: ComponentProps<typeof Ionicons>['name'];
}> = [
  { mode: 'system', label: '系统', icon: 'phone-portrait-outline' },
  { mode: 'light', label: '浅色', icon: 'sunny-outline' },
  { mode: 'dark', label: '深色', icon: 'moon-outline' },
];

export function ThemeModeSelector() {
  const themeMode = useThemeStore((state) => state.themeMode);
  const setThemeMode = useThemeStore((state) => state.setThemeMode);
  const primaryColor = useThemeColor({}, 'primary');
  const controlBackground = useThemeColor({}, 'controlBackground');
  const mutedTextColor = useThemeColor({}, 'textSecondary');
  const indicatorBackground = useThemeColor({}, 'primary_26');
  const controlBorder = useThemeColor({}, 'controlBorder');
  const selectedIndex = THEME_MODE_OPTIONS.findIndex(
    ({ mode }) => mode === themeMode,
  );
  const position = useSharedValue(selectedIndex);
  const controlWidth = useSharedValue(0);

  useEffect(() => {
    position.value = withTiming(selectedIndex, { duration: 200 });
  }, [position, selectedIndex]);

  const indicatorStyle = useAnimatedStyle(() => {
    // The track's 3px padding on each side is outside the options.
    const optionWidth =
      Math.max(0, controlWidth.value - 6) / THEME_MODE_OPTIONS.length;
    return {
      width: Math.max(0, optionWidth),
      opacity: controlWidth.value > 0 ? 1 : 0,
      transform: [{ translateX: position.value * optionWidth }],
    };
  });

  const handleSelect = (mode: ThemeMode) => {
    if (mode === themeMode) return;
    void selectionAsync();
    setThemeMode(mode);
  };

  return (
    <RNView style={styles.container} testID="theme-mode-selector">
      <RNView style={styles.headingCopy}>
        <RNView
          style={[styles.iconWrapper, { backgroundColor: controlBackground }]}
        >
          <Ionicons name="contrast-outline" size={18} color={primaryColor} />
        </RNView>
        <Text numberOfLines={1} style={styles.title}>
          主题模式
        </Text>
      </RNView>

      <RNView
        style={[
          styles.segmentedControl,
          { backgroundColor: controlBackground, borderColor: controlBorder },
        ]}
        accessibilityRole="radiogroup"
        accessibilityLabel="主题模式"
        onLayout={({ nativeEvent }) => {
          controlWidth.value = nativeEvent.layout.width;
        }}
      >
        <Animated.View
          pointerEvents="none"
          style={[
            styles.indicator,
            { backgroundColor: indicatorBackground },
            indicatorStyle,
          ]}
        />
        {THEME_MODE_OPTIONS.map(({ mode, label, icon }) => {
          const isSelected = mode === themeMode;
          const optionColor = isSelected ? primaryColor : mutedTextColor;
          return (
            <BouncyButton
              key={mode}
              testID={`theme-mode-${mode}`}
              accessibilityRole="radio"
              accessibilityLabel={mode === 'system' ? '跟随系统' : label}
              accessibilityState={{ checked: isSelected }}
              onPress={() => handleSelect(mode)}
              style={styles.option}
            >
              <Ionicons
                name={icon}
                size={14}
                color={optionColor}
                accessible={false}
                importantForAccessibility="no"
              />
              <Text
                numberOfLines={1}
                style={[
                  styles.optionLabel,
                  { color: optionColor },
                  isSelected && styles.selectedOptionLabel,
                ]}
              >
                {label}
              </Text>
            </BouncyButton>
          );
        })}
      </RNView>
    </RNView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headingCopy: {
    flexShrink: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconWrapper: {
    flexShrink: 0,
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flexShrink: 1,
    fontSize: 16,
    fontWeight: '500',
  },
  segmentedControl: {
    flex: 1,
    minWidth: 180,
    maxWidth: 228,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 40,
    padding: 3,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  indicator: {
    position: 'absolute',
    left: 3,
    top: 3,
    bottom: 3,
    borderRadius: 999,
  },
  option: {
    flex: 1,
    flexDirection: 'row',
    gap: 4,
    minHeight: 34,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
  optionLabel: {
    flexShrink: 1,
    fontSize: 13,
  },
  selectedOptionLabel: {
    fontWeight: '700',
  },
});
