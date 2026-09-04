const tokens = require('./constants/designTokens.json');
const { colors, typography, radii, opacity } = tokens;

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
    './features/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Brand & Status
        primary: colors.light.primary,
        danger: colors.light.danger,
        success: colors.light.success,
        warning: { DEFAULT: colors.light.warning, dark: colors.dark.warning },

        // Text
        foreground: { DEFAULT: colors.light.text, dark: colors.dark.text },
        secondary: {
          DEFAULT: colors.light.textSecondary,
          dark: colors.dark.textSecondary,
        },
        tertiary: {
          DEFAULT: colors.light.textTertiary,
          dark: colors.dark.textTertiary,
        },
        inverse: {
          DEFAULT: colors.light.textInverse,
          dark: colors.dark.textInverse,
        },
        muted: { DEFAULT: colors.light.iconMuted, dark: colors.dark.iconMuted },

        // Backgrounds & Surface
        base: {
          DEFAULT: colors.light.background,
          dark: colors.dark.background,
        },
        surface: {
          DEFAULT: colors.light.backgroundSecondary,
          dark: colors.dark.backgroundSecondary,
        },
        'surface-tertiary': {
          DEFAULT: colors.light.backgroundTertiary,
          dark: colors.dark.backgroundTertiary,
        },

        // Borders & Dividers
        border: { DEFAULT: colors.light.border, dark: colors.dark.border },
        divider: { DEFAULT: colors.light.divider, dark: colors.dark.divider },
        highlight: {
          DEFAULT: colors.light.highlight,
          dark: colors.dark.highlight,
        },

        // Legacy tints
        'tab-icon': {
          DEFAULT: colors.light.tabIconDefault,
          dark: colors.dark.tabIconDefault,
        },
        'tab-icon-active': {
          DEFAULT: colors.light.tabIconSelected,
          dark: colors.dark.tabIconSelected,
        },
      },
      fontFamily: {
        sans: [typography.fontFamily.sans],
        mono: [typography.fontFamily.mono],
      },
      fontSize: Object.fromEntries(
        Object.entries(typography.fontSize).map(([name, size]) => [
          name,
          `${size}px`,
        ]),
      ),
      lineHeight: Object.fromEntries(
        Object.entries(typography.lineHeight).map(([name, scale]) => [
          name,
          scale,
        ]),
      ),
      borderRadius: {
        sm: `${radii.sm}px`,
        md: `${radii.md}px`,
        lg: `${radii.lg}px`,
        pill: `${radii.pill}px`,
      },
      opacity: {
        disabled: opacity.disabled,
        pressed: opacity.pressed,
        subtle: opacity.subtle,
      },
    },
  },
  plugins: [],
};
